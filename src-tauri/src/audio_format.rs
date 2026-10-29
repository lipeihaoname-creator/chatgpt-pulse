//! Validated interleaved mix-format conversion. Never stores or emits audio.
#[derive(Clone, Copy, Debug)]
pub struct MixFormat {pub channels:usize,pub rate:u32,pub align:usize,bits:u16,valid:u16,float:bool}
impl MixFormat {
    pub fn parse(bytes:&[u8])->Result<Self,String> {
        if bytes.len()<18 {return Err("音频格式头不完整".into());}
        let word=|i|u16::from_le_bytes([bytes[i],bytes[i+1]]);
        let tag=word(0);let channels=word(2) as usize;
        let rate=u32::from_le_bytes(bytes[4..8].try_into().unwrap());
        let align=word(12) as usize;let bits=word(14);let mut valid=bits;
        let kind=if tag==0xfffe {
            if word(16)<22||bytes.len()<40 {return Err("扩展音频格式头不完整".into());}
            valid=word(18);
            // KSDATAFORMAT_SUBTYPE_{PCM,IEEE_FLOAT}; reject unrelated GUIDs.
            const TAIL:[u8;12]=[0,0,0x10,0,0x80,0,0,0xaa,0,0x38,0x9b,0x71];
            if bytes[28..40]!=TAIL {return Err("音频子格式暂不支持".into());}
            u32::from_le_bytes(bytes[24..28].try_into().unwrap())
        } else {tag as u32};
        let float=kind==3;
        if ![1,3].contains(&kind)||channels==0||channels>32||!(8000..=384000).contains(&rate)||
            valid==0||valid>bits||align<channels*(bits as usize/8)||align>4096||
            (float&&(![32,64].contains(&bits)||valid!=bits))||(!float&&![8,16,24,32].contains(&bits)) {
            return Err("系统输出的音频格式暂不支持".into());
        }
        Ok(Self{channels,rate,align,bits,valid,float})
    }
    pub fn mono(&self,frame:&[u8])->f32 {
        let width=self.bits as usize/8;let mut sum=0f64;
        for channel in 0..self.channels {
            let x=&frame[channel*width..(channel+1)*width];
            let value=if self.float {
                if self.bits==32 {f32::from_le_bytes(x.try_into().unwrap()) as f64}
                else {f64::from_le_bytes(x.try_into().unwrap())}
            } else {
                let shift=self.bits-self.valid;
                let n=match self.bits {
                    8 => ((x[0]>>shift) as i64)-(1i64<<(self.valid-1)),
                    16 => (i16::from_le_bytes(x.try_into().unwrap()) as i64)>>shift,
                    24 => (i32::from_le_bytes([x[0],x[1],x[2],if x[2]&128!=0{255}else{0}]) as i64)>>shift,
                    32 => (i32::from_le_bytes(x.try_into().unwrap()) as i64)>>shift,
                    _=>unreachable!(),
                };
                n as f64/(1u64<<(self.valid-1)) as f64
            };
            sum+=if value.is_finite(){value.clamp(-1.,1.)}else{0.};
        }
        (sum/self.channels as f64).clamp(-1.,1.) as f32
    }
}
#[cfg(test)]mod tests {
 use super::*;
 fn header(tag:u16,bits:u16,channels:u16)->Vec<u8>{let mut b=vec![0;18];b[..2].copy_from_slice(&tag.to_le_bytes());b[2..4].copy_from_slice(&channels.to_le_bytes());b[4..8].copy_from_slice(&48000u32.to_le_bytes());b[12..14].copy_from_slice(&(channels*(bits/8)).to_le_bytes());b[14..16].copy_from_slice(&bits.to_le_bytes());b}
 #[test]fn pcm_precision_and_left_aligned_valid_bits(){
  for (bits,raw) in [(8,vec![192]),(16,16384i16.to_le_bytes().to_vec()),(24,vec![0,0,64]),(32,1073741824i32.to_le_bytes().to_vec())]{let f=MixFormat::parse(&header(1,bits,1)).unwrap();assert!((f.mono(&raw)-0.5).abs()<0.000001);}
  let mut h=header(0xfffe,32,1);h.resize(40,0);h[16..18].copy_from_slice(&22u16.to_le_bytes());h[18..20].copy_from_slice(&24u16.to_le_bytes());h[24..40].copy_from_slice(&[1,0,0,0,0,0,0x10,0,0x80,0,0,0xaa,0,0x38,0x9b,0x71]);
  let f=MixFormat::parse(&h).unwrap();assert_eq!(f.mono(&(-1073741824i32).to_le_bytes()),-0.5);
 }
 #[test]fn float_multichannel_nonfinite_and_block_padding(){
  let mut h=header(3,32,3);h[12..14].copy_from_slice(&16u16.to_le_bytes());let f=MixFormat::parse(&h).unwrap();
  let bytes=[0.75f32.to_le_bytes(),0.75f32.to_le_bytes(),f32::NAN.to_le_bytes(),[255;4]].concat();assert_eq!(f.mono(&bytes),0.5);
  assert_eq!(MixFormat::parse(&header(3,64,1)).unwrap().mono(&f64::INFINITY.to_le_bytes()),0.);
 }
 #[test]fn reject_corrupt_or_unknown_formats(){
  assert!(MixFormat::parse(&[0;16]).is_err());
  for h in [header(7,16,2),header(1,20,2),header(3,16,1),header(1,16,0),header(0xfffe,32,2)]{assert!(MixFormat::parse(&h).is_err());}
 }
}
