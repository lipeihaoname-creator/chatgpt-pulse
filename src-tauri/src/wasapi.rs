//! Shared-mode system-render loopback. All COM interfaces stay on this thread.
//! Microsoft API contracts: docs/WINDOWS_MUSIC_REPORT.md (development sources).
use crate::{audio_format::MixFormat,music::{CaptureError,ReadResult}};
use std::{marker::PhantomData,rc::Rc,time::{Duration,Instant}};
use windows::{core::{Error,PCWSTR},Win32::{
    Foundation::{CloseHandle,HANDLE,WAIT_FAILED},
    Media::Audio::*,
    System::{Com::*,Threading::{CreateEventW,WaitForSingleObject}},
}};

struct Apartment;
impl Drop for Apartment {fn drop(&mut self){unsafe{CoUninitialize()}}}
struct Event(HANDLE);
impl Drop for Event {fn drop(&mut self){unsafe{let _=CloseHandle(self.0);}}}
struct MixMemory(*mut WAVEFORMATEX);
impl Drop for MixMemory {fn drop(&mut self){unsafe{CoTaskMemFree(Some(self.0.cast()));}}}
pub struct Stream {
    capture:IAudioCaptureClient,client:IAudioClient,device:IMMDevice,enumerator:IMMDeviceEnumerator,
    event:Event,format:MixFormat,id:Vec<u16>,packets:u32,
    // Rust drops fields in declaration order: COM interfaces before the apartment.
    _apartment:Apartment,_thread_bound:PhantomData<Rc<()>>,
}
pub fn supported()->bool {let version=windows_version::OsVersion::current();version.major>10||(version.major==10&&version.build>=15063)}
fn failure(context:&str,error:Error)->CaptureError {
    let code=error.code();
    let retry=code.0!=0x80070005u32 as i32 && code!=AUDCLNT_E_UNSUPPORTED_FORMAT && code.0!=0x80004002u32 as i32;
    CaptureError{status:"unavailable",detail:format!("{context}（0x{:08X}）；请确认有可用的系统播放设备。受保护音频可能无法取得",code.0 as u32),retry}
}
fn endpoint_id(device:&IMMDevice)->windows::core::Result<Vec<u16>> {
    let id=unsafe{device.GetId()?};
    let result=unsafe{id.as_wide().to_vec()};
    unsafe{CoTaskMemFree(Some(id.0.cast()));}Ok(result)
}
impl Stream {
    pub fn open()->Result<Self,CaptureError> {
        if !supported(){return Err(CaptureError::terminal("unsupported","音乐律动需要 Windows 10 1703 或更新系统"));}
        unsafe{CoInitializeEx(None,COINIT_MULTITHREADED).ok()}.map_err(|e|failure("音频线程初始化失败",e))?;
        let apartment=Apartment;
        let enumerator:IMMDeviceEnumerator=unsafe{CoCreateInstance(&MMDeviceEnumerator,None,CLSCTX_ALL)}.map_err(|e|failure("无法连接音频设备",e))?;
        let device=unsafe{enumerator.GetDefaultAudioEndpoint(eRender,eMultimedia)}.map_err(|e|failure("没有可用的默认播放设备",e))?;
        let id=endpoint_id(&device).map_err(|e|failure("无法读取播放设备标识",e))?;
        let client:IAudioClient=unsafe{device.Activate(CLSCTX_ALL,None)}.map_err(|e|failure("无法打开系统播放音频",e))?;
        let memory=MixMemory(unsafe{client.GetMixFormat()}.map_err(|e|failure("无法读取系统混音格式",e))?);
        if memory.0.is_null(){return Err(CaptureError::terminal("unavailable","系统返回了空音频格式"));}
        let head=unsafe{memory.0.read_unaligned()};
        let extra=head.cbSize as usize;
        if extra>4096{return Err(CaptureError::terminal("unavailable","系统混音格式过大"));}
        let bytes=unsafe{std::slice::from_raw_parts(memory.0.cast::<u8>(),18+extra)};
        let format=MixFormat::parse(bytes).map_err(|e|CaptureError::terminal("unavailable",&e))?;
        unsafe{client.Initialize(AUDCLNT_SHAREMODE_SHARED,AUDCLNT_STREAMFLAGS_LOOPBACK|AUDCLNT_STREAMFLAGS_EVENTCALLBACK,0,0,memory.0,None)}.map_err(|e|failure("系统音频回环启动失败",e))?;
        let event=Event(unsafe{CreateEventW(None,false,false,PCWSTR::null())}.map_err(|e|failure("无法创建音频等待事件",e))?);
        unsafe{client.SetEventHandle(event.0)}.map_err(|e|failure("无法等待系统音频",e))?;
        let capture=unsafe{client.GetService::<IAudioCaptureClient>()}.map_err(|e|failure("无法取得系统回环数据",e))?;
        unsafe{client.Start()}.map_err(|e|failure("无法开始系统音频",e))?;
        Ok(Self{capture,client,device,enumerator,event,format,id,packets:0,_apartment:apartment,_thread_bound:PhantomData})
    }
    pub fn healthy(&self)->bool {
        // A one-second bounded default-endpoint check also works during no-packet
        // silence. No callbacks touch COM on another thread or retain endpoint IDs.
        unsafe{self.device.GetState()}.is_ok_and(|s|s==DEVICE_STATE_ACTIVE)&&
            unsafe{self.enumerator.GetDefaultAudioEndpoint(eRender,eMultimedia)}.and_then(|d|endpoint_id(&d)).is_ok_and(|id|id==self.id)
    }
    pub fn read(&mut self,pcm:&mut[f32])->Result<ReadResult,CaptureError> {
        let start=Instant::now();let mut written=0usize;let mut discontinuity=false;let mut drained=0;
        // Drain whole packets, but bound one pass during a driver backlog.
        'analysis: while drained<256&&start.elapsed()<Duration::from_millis(40) {
          let remaining=Duration::from_millis(40).saturating_sub(start.elapsed()).as_millis().max(1) as u32;
          if unsafe{WaitForSingleObject(self.event.0,remaining)}==WAIT_FAILED{return Err(failure("音频等待失败",Error::from_thread()));}
          loop {
            let next=unsafe{self.capture.GetNextPacketSize()}.map_err(|e|failure("系统音频设备已变化",e))?;
            if next==0{break;}
            let mut data=std::ptr::null_mut();let mut frames=0u32;let mut flags=0u32;
            unsafe{self.capture.GetBuffer(&mut data,&mut frames,&mut flags,None,None)}.map_err(|e|failure("系统音频读取失败",e))?;
            if frames==0{break;}
            self.packets=self.packets.wrapping_add(1);drained+=1;
            let silent=flags&AUDCLNT_BUFFERFLAGS_SILENT.0 as u32!=0;
            discontinuity|=flags&(AUDCLNT_BUFFERFLAGS_DATA_DISCONTINUITY.0|AUDCLNT_BUFFERFLAGS_TIMESTAMP_ERROR.0) as u32!=0;
            let malformed=(!silent&&data.is_null())||frames>self.format.rate.max(163840)/5||(frames as usize).checked_mul(self.format.align).is_none_or(|n|n>32*1024*1024);
            if !malformed&&!pcm.is_empty() {
                for index in 0..frames as usize {
                    let value=if silent{0.}else{
                        let bytes=unsafe{std::slice::from_raw_parts(data.add(index*self.format.align),self.format.align)};
                        self.format.mono(bytes)
                    };
                    pcm[written%pcm.len()]=value;written+=1;
                }
            }
            // Even a bad packet is returned in full before error/recovery.
            unsafe{self.capture.ReleaseBuffer(frames)}.map_err(|e|failure("系统音频数据包释放失败",e))?;
            if malformed{return Err(CaptureError{status:"unavailable",detail:"系统音频返回了无效数据包，正在重新连接".into(),retry:true});}
            if drained>=256||start.elapsed()>=Duration::from_millis(40){break 'analysis;}
          }
        }
        if written>pcm.len(){let rotate=written%pcm.len();pcm.rotate_left(rotate);}
        Ok(ReadResult{count:written.min(pcm.len()),rate:self.format.rate as f64,callbacks:self.packets,discontinuity})
    }
}
impl Drop for Stream {fn drop(&mut self){unsafe{let _=self.client.Stop();let _=self.client.Reset();}}}
