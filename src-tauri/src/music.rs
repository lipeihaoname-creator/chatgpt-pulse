use crate::audio_analysis::{Analyzer, Features};
use serde::Serialize;
use std::sync::{Arc, Mutex, atomic::{AtomicBool, AtomicU64, Ordering}};
use std::time::{Duration, Instant};
use tauri::{Emitter, Manager};

pub struct ReadResult {pub count:usize,pub rate:f64,pub callbacks:u32,pub discontinuity:bool}
pub struct CaptureError {pub status:&'static str,pub detail:String,pub retry:bool}
impl CaptureError {
    pub fn terminal(status:&'static str,detail:&str)->Self {Self{status,detail:detail.into(),retry:false}}
}

#[derive(Clone, Serialize)]
pub struct AudioFrame {
    pub status: String, pub detail: String, pub supported: bool,
    pub epoch: u64, pub sequence: u64, pub at: i64, pub view_visible: bool,
    #[serde(flatten)] pub features: Features,
}
impl AudioFrame {
    fn status(status: &str, detail: &str, supported: bool, epoch: u64) -> Self {
        Self {status: status.into(),detail:detail.into(),supported,epoch,sequence:0,at:crate::data::now(),view_visible:false,features:Features::default()}
    }
}
pub struct Music(Arc<Inner>);
struct Inner {
    wanted: AtomicBool, epoch: AtomicU64, frame: Mutex<AudioFrame>,
    worker: Mutex<Option<std::thread::JoinHandle<()>>>,
}
impl Default for Music {
    fn default() -> Self {
        let supported=native::supported();
        Self(Arc::new(Inner {wanted:AtomicBool::new(false),epoch:AtomicU64::new(0),worker:Mutex::new(None),
            frame:Mutex::new(AudioFrame::status(if supported {"off"} else {"unsupported"},if supported {"未启用系统音频"} else {if cfg!(target_os="windows"){"音乐律动需要 Windows 10 1703 或更新系统；其他功能不受影响"}else{"音乐律动需要 macOS 14.2 或更新版本；其他功能不受影响"}},supported,0))}))
    }
}
impl Music {
    pub fn snapshot(&self)->AudioFrame { self.0.frame.lock().unwrap().clone() }
    pub fn request(&self, app:tauri::AppHandle, enabled:bool) {
        let inner=self.0.clone();let epoch=inner.epoch.fetch_add(1,Ordering::SeqCst)+1;
        inner.wanted.store(enabled,Ordering::SeqCst);
        let state=AudioFrame::status(if enabled {"starting"} else {"off"},if enabled {if cfg!(target_os="macos"){"正在启动系统音频；请查看 macOS 授权提示"}else{"正在连接默认系统播放设备"}} else {"已关闭系统音频"},native::supported(),epoch);
        publish(&app,&inner,state,true);
        // Stop/join and Core Audio creation never block the UI thread. Serialized
        // reconciliation prevents rapid toggles from creating duplicate taps.
        std::thread::spawn(move||{
            let mut worker=inner.worker.lock().unwrap();
            if let Some(old)=worker.take(){let _=old.join();}
            if inner.epoch.load(Ordering::SeqCst)!=epoch || !inner.wanted.load(Ordering::SeqCst){return;}
            let capture_inner=inner.clone();
            *worker=Some(std::thread::spawn(move||capture(app,capture_inner,epoch)));
        });
    }
    pub fn shutdown(&self) {
        self.0.wanted.store(false,Ordering::SeqCst);self.0.epoch.fetch_add(1,Ordering::SeqCst);
        // Mac ExitRequested runs on the event thread. Capture can still be
        // dispatching a window visibility query there; never join it on that
        // same thread. Settings-off still joins asynchronously in request().
        #[cfg(not(target_os="macos"))]
        if let Some(worker)=self.0.worker.lock().unwrap().take(){let _=worker.join();}
    }
}
fn publish(app:&tauri::AppHandle,inner:&Inner,mut frame:AudioFrame,status:bool) {
    frame.view_visible=app.get_webview_window("overlay").is_some_and(|w|w.is_visible().unwrap_or(false)&&!w.is_minimized().unwrap_or(false));
    {
        let mut latest=inner.frame.lock().unwrap();
        if !order_frame(&latest,&mut frame,inner.epoch.load(Ordering::SeqCst)){return;}
        *latest=frame.clone();
    }
    if let Some(w)=app.get_webview_window("overlay") { if status || frame.view_visible { let _=w.emit("pulse:audio",&frame); } }
    if status {if let Some(w)=app.get_webview_window("main"){let _=w.emit("pulse:audio-status",&frame);}}
    // Explicit isolated-test telemetry only. Never enabled for real user sessions.
    crate::write_test_probe(app,"audio",serde_json::json!({"epoch":frame.epoch,"sequence":frame.sequence,"at":frame.at,"status":frame.status,"supported":frame.supported,"view_visible":frame.view_visible,"active":frame.features.active,"rms":frame.features.rms,"stable_seconds":frame.features.stable_seconds,"max_band":frame.features.bars.iter().copied().fold(0f32,f32::max)}));
}
fn order_frame(latest:&AudioFrame,next:&mut AudioFrame,epoch:u64)->bool {
    if next.epoch!=epoch {return false;}
    // Recovery, failure and visibility updates share the same monotonic stream
    // as feature packets. A status constructed with sequence zero is still new.
    next.sequence=if latest.epoch==epoch {latest.sequence.saturating_add(1)} else {1};
    true
}
pub fn notify_visibility(app:&tauri::AppHandle) {
    let music=app.state::<Music>();let frame=music.snapshot();publish(app,&music.0,frame,true);
}

// A new tap can deliver healthy callbacks containing only zero PCM. We cannot
// infer audible playback or permission from that; try only two full warm-up
// reconnects, then accept real silence. Once any real PCM arrives, never reset a
// healthy tap for silence. Re-enabling starts a new bounded warm-up lifecycle.
#[derive(Default)]
struct StartupWarmup { signal_seen:bool, reconnects:u8 }
impl StartupWarmup {
    fn reconnect(&mut self,nonzero:bool,age:Duration)->bool {
        self.signal_seen |= nonzero;
        if self.signal_seen || self.reconnects>=2 || age<Duration::from_secs(2) {return false;}
        self.reconnects+=1;true
    }
}
fn capture(app:tauri::AppHandle,inner:Arc<Inner>,epoch:u64) {
    let mut stream:Option<native::Stream>=None;
    let mut analyzer=Analyzer::default();let mut pcm=[0f32;8192];
    let mut last=Instant::now();let mut health=last;let mut last_data=last;
    let mut connected=last;let mut sequence=0;let mut failures=0;
    let mut previous=String::new();let mut callbacks=0;let mut warmup=StartupWarmup::default();
    while inner.wanted.load(Ordering::SeqCst)&&inner.epoch.load(Ordering::SeqCst)==epoch {
        if stream.is_none() {
            match native::Stream::open() {
                Ok(opened)=>{stream=Some(opened);analyzer=Analyzer::default();last=Instant::now();health=last;last_data=last;connected=last;callbacks=0;previous.clear();}
                Err(error)=>{if !capture_failure(&app,&inner,epoch,error,&mut failures){return;}continue;}
            }
        }
        // Windows drains every signalled engine packet inside a 40 ms analysis
        // window. Sleeping here would overrun short shared-mode device buffers.
        if !cfg!(target_os="windows") {std::thread::sleep(Duration::from_millis(40));}
        let now=Instant::now();let dt=(now-last).as_secs_f32();last=now;
        if dt>2. || health.elapsed()>Duration::from_secs(1) {
            health=now;
            if dt>2. || !stream.as_ref().unwrap().healthy() {
                stream.take();pcm.fill(0.);analyzer=Analyzer::default();
                publish(&app,&inner,AudioFrame::status("recovering","音频设备变化或系统唤醒，正在重新连接",true,epoch),true);
                if cfg!(target_os="windows") {
                    failures=failures.saturating_add(1);
                    if !retry_wait(&inner,epoch,retry_delay(failures)){return;}
                }
                continue;
            }
        }
        let ReadResult{count,rate,callbacks:new_callbacks,discontinuity}=match stream.as_mut().unwrap().read(&mut pcm) {
            Ok(reading)=>reading,
            Err(error)=>{stream.take();pcm.fill(0.);analyzer=Analyzer::default();if !capture_failure(&app,&inner,epoch,error,&mut failures){return;}continue;}
        };
        if discontinuity {analyzer=Analyzer::default();}
        if connected.elapsed()>Duration::from_secs(5){failures=0;}
        if count>0 {analyzer.push(&pcm[..count]);last_data=Instant::now();}
        let nonzero=pcm[..count].iter().any(|v|v.is_finite()&&*v!=0.);
        pcm.fill(0.);
        if cfg!(target_os="macos") && warmup.reconnect(nonzero,connected.elapsed()) {
            // Drop both native objects on their owner worker, not the UI thread.
            stream.take();analyzer=Analyzer::default();
            publish(&app,&inner,AudioFrame::status("recovering","正在确认系统音频连接",true,epoch),true);
            if !retry_wait(&inner,epoch,Duration::from_millis(150)){return;}
            continue;
        }
        sequence+=1;
        let features=analyzer.analyze(rate as f32,dt,count>0);
        // A Windows loopback stream can remain healthy without packets for any
        // length of silence. Only Mac's callback contract uses this watchdog.
        if callback_timeout(cfg!(target_os="macos"),new_callbacks==callbacks,last_data.elapsed()) {
            publish(&app,&inner,AudioFrame::status("unavailable","没有收到音频缓冲；请检查系统音频录制权限，然后重试",true,epoch),true);return;
        }
        callbacks=new_callbacks;
        let status=if features.active {"active"} else {"silent"};
        let changed=previous!=status;previous=status.into();
        let detail=if features.active {"正在响应系统播放音频"} else if cfg!(target_os="windows") {"已连接默认播放设备，当前没有明显声音"} else {"采集已启动，未检测到明显声音；若播放时仍无响应，请检查权限"};
        publish(&app,&inner,AudioFrame {status:status.into(),detail:detail.into(),supported:true,epoch,sequence,at:crate::data::now(),view_visible:false,features},changed||sequence%25==0);
    }
    pcm.fill(0.);
    // Stream drops on its owning worker: stop client, release COM, uninitialize.
}
fn callback_timeout(requires_buffers:bool,unchanged:bool,elapsed:Duration)->bool {requires_buffers&&unchanged&&elapsed>Duration::from_secs(8)}
fn retry_delay(failures:u32)->Duration {Duration::from_millis(250u64.saturating_mul(1u64<<failures.min(5)))}
fn retry_wait(inner:&Inner,epoch:u64,delay:Duration)->bool {
    let until=Instant::now()+delay;
    while Instant::now()<until {
        if !inner.wanted.load(Ordering::SeqCst)||inner.epoch.load(Ordering::SeqCst)!=epoch{return false;}
        std::thread::sleep(Duration::from_millis(40).min(until.saturating_duration_since(Instant::now())));
    }true
}
fn capture_failure(app:&tauri::AppHandle,inner:&Inner,epoch:u64,error:CaptureError,failures:&mut u32)->bool {
    publish(app,inner,AudioFrame::status(error.status,&error.detail,native::supported(),epoch),true);
    if !error.retry || cfg!(target_os="macos")&&*failures>=2{return false;}
    *failures=failures.saturating_add(1);retry_wait(inner,epoch,retry_delay(*failures))
}

#[cfg(target_os="macos")]
mod native {
    use super::{CaptureError,ReadResult};
    use std::ffi::c_void;
    unsafe extern "C" {
        fn pulse_audio_supported()->i32;
        fn pulse_audio_open(error:*mut i32)->*mut c_void;
        fn pulse_audio_close(stream:*mut c_void);
        fn pulse_audio_read(stream:*mut c_void,output:*mut f32,capacity:u32,rate:*mut f64,callbacks:*mut u32)->u32;
        fn pulse_audio_healthy(stream:*mut c_void)->i32;
    }
    pub fn supported()->bool {unsafe {pulse_audio_supported()!=0}}
    pub struct Stream(*mut c_void,bool);
    impl Stream {
        pub fn open()->Result<Self,CaptureError> {
            let mut error=0;let stream=unsafe {pulse_audio_open(&mut error)};
            if !stream.is_null(){
                // Numeric-only fault injection for an explicitly isolated native
                // regression. Normal user sessions can never enable this path.
                static OPENS:std::sync::atomic::AtomicUsize=std::sync::atomic::AtomicUsize::new(0);
                let first=OPENS.fetch_add(1,std::sync::atomic::Ordering::SeqCst)==0;
                let injected=first&&["PULSE_OFFLINE_TEST","PULSE_RENDER_PROBE","PULSE_TEST_FIRST_AUDIO_ZERO"].iter().all(|k|std::env::var_os(k).is_some());
                return Ok(Self(stream,injected));
            }
            let (status,detail)=match error {
                -1=>("unsupported","音乐律动需要 macOS 14.2 或更新版本"),
                -2=>("unavailable","请使用带音频权限说明的 Mac 应用包启动，不能直接运行开发二进制"),
                1885696621=>("permission_denied","系统音频录制未获允许；请在系统设置中检查 Pulse 的音频录制权限后重试"),
                -5=>("unavailable","当前音频设备的数据格式暂不支持"),
                -6=>("recovering","系统音频设备尚未就绪，正在重试"),
                _=>("unavailable","系统音频启动失败；请检查录制权限和音频输出设备后重试"),
            };
            Err(CaptureError {status,detail:format!("{detail}（{error}）"),retry:error==-6})
        }
        pub fn read(&mut self,pcm:&mut[f32])->Result<ReadResult,CaptureError> {let mut rate=0.;let mut calls=0;let count=unsafe {pulse_audio_read(self.0,pcm.as_mut_ptr(),pcm.len() as u32,&mut rate,&mut calls)};if self.1 {pcm[..count as usize].fill(0.);}
            Ok(ReadResult {count:count as usize,rate,callbacks:calls,discontinuity:false})}
        pub fn healthy(&self)->bool {unsafe {pulse_audio_healthy(self.0)!=0}}
    }
    impl Drop for Stream {fn drop(&mut self){unsafe {pulse_audio_close(self.0)}}}
}
#[cfg(target_os="windows")]
use crate::wasapi as native;
#[cfg(not(any(target_os="macos",target_os="windows")))]
mod native {
    use super::{CaptureError,ReadResult};
    pub fn supported()->bool {false}
    pub struct Stream;
    impl Stream {
        pub fn open()->Result<Self,CaptureError>{Err(CaptureError::terminal("unsupported","此平台尚不支持系统音频"))}
        pub fn read(&mut self,_:&mut[f32])->Result<ReadResult,CaptureError>{Ok(ReadResult{count:0,rate:0.,callbacks:0,discontinuity:false})}
        pub fn healthy(&self)->bool {false}
    }
}

#[tauri::command]
pub fn music_status(state:tauri::State<Music>)->AudioFrame {state.snapshot()}
#[tauri::command]
pub fn music_start(app:tauri::AppHandle,window:tauri::WebviewWindow)->Result<AudioFrame,String> {
    if window.label()!="main" {return Err("请在偏好设置中启动系统音频".into());}
    if !app.state::<crate::Pulse>().settings.lock().unwrap().music_enabled {return Err("请先开启音乐律动".into());}
    let music=app.state::<Music>();music.request(app.clone(),true);Ok(music.snapshot())
}

pub fn spectrum_padding(settings:&crate::data::Settings)->f64 {
    if native::supported() && settings.music_enabled && settings.music_spectrum && settings.character!="none" { 16. } else { 0. }
}

// A successful live reader pass can permit decorative music without requiring
// a task to finish first. This does not change or claim the GPT work state.
// Read errors, incomplete replay and unfinished tasks always block movement.
pub fn confirmed_idle(sample:&crate::data::Sample,now:i64,since:i64)->bool {
    if !sample.music_scan_complete || now.saturating_sub(since)<2000 || sample.source!="logs" ||
        sample.task_unfinished || sample.pending_tools>0 || sample.monitored_sessions>0 ||
        !matches!(sample.state.as_str(),"waiting"|"completed"|"aborted") ||
        !sample.checked_at.is_some_and(|at|(-1000..5000).contains(&now.saturating_sub(at))) {return false;}
    sample.sessions.iter().all(|s|!s.task_unfinished&&s.pending_tools==0&&matches!(s.state.as_str(),"waiting"|"completed"|"aborted"))
}

#[cfg(test)]
mod tests {
    use super::*;use crate::data::Sample;
    fn ended()->Sample {Sample {music_scan_complete:true,state:"completed".into(),source:"logs".into(),log_id:Some("a.jsonl".into()),checked_at:Some(4000),activity_at:Some(1000),..Sample::default()}}
    #[test] fn cold_zero_pcm_retries_are_bounded_and_stop_after_real_data() {
        let mut warmup=StartupWarmup::default();
        assert!(!warmup.reconnect(false,Duration::from_millis(1999)));
        assert!(warmup.reconnect(false,Duration::from_secs(2)));
        assert!(!warmup.reconnect(false,Duration::from_millis(10)));
        assert!(warmup.reconnect(false,Duration::from_secs(3)));
        assert!(!warmup.reconnect(false,Duration::from_secs(90)),"Real silence does not loop");
        let mut warmup=StartupWarmup::default();
        assert!(!warmup.reconnect(true,Duration::from_millis(20)));
        assert!(!warmup.reconnect(false,Duration::from_secs(90)),"Silence after playback never restarts a healthy tap");
    }
    #[test] fn windows_no_packet_silence_is_not_a_callback_failure(){
        assert!(!callback_timeout(false,true,Duration::from_secs(90)));
        assert!(callback_timeout(true,true,Duration::from_secs(9)));
        assert!(!callback_timeout(true,false,Duration::from_secs(90)));
        assert_eq!(retry_delay(99),Duration::from_secs(8));
    }
    #[test] fn audio_status_updates_are_newer_than_feature_packets_in_the_same_capture(){
        let mut previous=AudioFrame::status("active","",true,2);previous.sequence=120;
        for status in ["recovering","active","unavailable"] {
            let mut next=AudioFrame::status(status,"",true,2);
            assert!(order_frame(&previous,&mut next,2));assert_eq!(next.sequence,previous.sequence+1);previous=next;
        }
        let mut stale=AudioFrame::status("active","",true,1);assert!(!order_frame(&previous,&mut stale,2));
        let mut restarted=AudioFrame::status("starting","",true,3);assert!(order_frame(&previous,&mut restarted,3));assert_eq!(restarted.sequence,1);
    }
    #[test] fn no_scan_or_unfinished_task_cannot_enable_music_idle(){
        assert!(!confirmed_idle(&Sample {state:"waiting".into(),checked_at:Some(4000),..Sample::default()},4000,0));
        let mut s=ended();assert!(confirmed_idle(&s,4000,0));s.task_unfinished=true;assert!(!confirmed_idle(&s,4000,0));
        s.task_unfinished=false;s.sessions=vec![ended(),Sample {state:"running".into(),..ended()}];assert!(!confirmed_idle(&s,4000,0));
        for state in ["unavailable","incomplete","loading","paused"] {s.sessions[1].state=state.into();assert!(!confirmed_idle(&s,4000,0));}
    }
    #[test] fn fresh_empty_scan_or_historical_completion_can_enable_decorative_music(){
        let mut root=Sample {music_scan_complete:true,state:"waiting".into(),checked_at:Some(4000),..Sample::default()};
        assert!(confirmed_idle(&root,4000,0),"No need to finish a task just to listen to music");
        assert!(!confirmed_idle(&root,4000,3500),"Wait for startup reader settling");
        root.sessions=vec![ended()];assert!(confirmed_idle(&root,4000,0),"Historical completion is safe after a new successful scan");
        root.sessions[0].state="waiting".into();assert!(confirmed_idle(&root,4000,0));
        root.sessions[0].pending_tools=1;assert!(!confirmed_idle(&root,4000,0));
        root.sessions.clear();root.monitored_sessions=1;assert!(!confirmed_idle(&root,4000,0));
        root.monitored_sessions=0;root.state="paused".into();assert!(!confirmed_idle(&root,4000,0));
        root.state="unavailable".into();assert!(!confirmed_idle(&root,4000,0));
        root.state="waiting".into();assert!(!confirmed_idle(&root,10000,0));
    }
    #[test] fn scan_proof_is_internal_not_a_frontend_claim(){
        let serialized=serde_json::to_value(ended()).unwrap();
        assert!(serialized.get("music_scan_complete").is_none());
        assert_eq!(serialized["music_idle_confirmed"],false);
    }
    #[test] fn music_lane_restores_inside_the_physical_screen_at_high_dpi(){
        let screens=[crate::overlay::Screen {origin:(0,0),size:(2940,1912),scale:2.}];
        assert_eq!(crate::overlay::restored_position_sized((100,1850),(280.,144.),&screens),(100,1624));
        for scale in [1.,1.25,1.5,2.] {
            let screens=[crate::overlay::Screen {origin:(0,0),size:(1920,1080),scale}];
            let (x,y)=crate::overlay::restored_position_sized((1900,1070),(280.,144.),&screens);
            assert!(x>=0&&y>=0&&(x as f64+280.*scale)<=1920.&&(y as f64+144.*scale)<=1080.);
        }
    }
    #[test] fn old_settings_migrate_without_enabling_audio_and_new_preferences_roundtrip(){
        let old:crate::data::Settings=serde_json::from_str(r#"{"theme":"moon","overlay_position":{"x":80,"y":120}}"#).unwrap();
        assert!(!old.music_enabled);assert_eq!(old.theme,"moon");
        let next=old.patch("music_enabled",serde_json::json!(true),None).unwrap().patch("music_strength",serde_json::json!(8),None).unwrap();
        let restored:crate::data::Settings=serde_json::from_str(&serde_json::to_string(&next).unwrap()).unwrap();
        assert!(restored.music_enabled);assert_eq!(restored.music_strength,1.);assert_eq!(restored.overlay_position.unwrap().x,80);
    }
}
