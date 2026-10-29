use serde::{Deserialize,Serialize};
pub const STYLES:[&str;6]=["bars","arc","dots","curve","mirror","led"];
#[derive(Clone,Debug,Serialize,Deserialize)]
#[serde(default)]
pub struct MusicVisual {
    pub color_mode:String,pub color:String,pub color2:String,pub density:u32,
    pub width:f64,pub height:f64,pub gain:f64,pub contrast:f64,pub response:f64,pub opacity:f64,
    pub peaks:bool,pub rounded:bool,pub mirror:bool,pub fill:f64,
}
impl Default for MusicVisual {
    fn default()->Self {Self {color_mode:"theme".into(),color:"#a6baff".into(),color2:"#67e8d0".into(),density:24,width:2.6,height:1.,gain:1.,contrast:2.,response:1.,opacity:1.,peaks:true,rounded:true,mirror:false,fill:0.18}}
}
impl MusicVisual {
    pub fn validated(mut self)->Self {
        if !["theme","solid","gradient","rainbow"].contains(&self.color_mode.as_str()){self.color_mode="theme".into();}
        for (color,default) in [(&mut self.color,"#a6baff"),(&mut self.color2,"#67e8d0")] {
            if color.len()!=7||!color.starts_with('#')||!color.as_bytes()[1..].iter().all(u8::is_ascii_hexdigit){*color=default.into();}else{*color=color.to_ascii_lowercase();}
        }
        if ![12,18,24].contains(&self.density){self.density=24;}
        for (v,lo,hi,default) in [(&mut self.width,1.,4.,2.6),(&mut self.height,0.6,1.4,1.),(&mut self.gain,0.5,1.8,1.),(&mut self.contrast,1.,3.,2.),(&mut self.response,0.5,2.,1.),(&mut self.opacity,0.3,1.,1.),(&mut self.fill,0.,0.4,0.18)]{*v=if v.is_finite(){v.clamp(lo,hi)}else{default};}
        self
    }
}
#[derive(Clone,Debug,Serialize,Deserialize)]
pub struct MusicDesign {pub style:String,#[serde(default)] pub visual:MusicVisual}
#[derive(Clone,Debug,Serialize,Deserialize)]
pub struct MusicPreset {pub name:String,pub style:String,#[serde(default)] pub visual:MusicVisual}
pub fn clean_presets(presets:Vec<MusicPreset>)->Vec<MusicPreset>{
    let mut names=std::collections::BTreeSet::new();
    presets.into_iter().filter_map(|mut p|{
        p.name=p.name.chars().filter(|c|!c.is_control()).collect::<String>().trim().chars().take(24).collect();
        if p.name.is_empty()||!names.insert(p.name.clone()){return None;}
        if !STYLES.contains(&p.style.as_str()){p.style="bars".into();}p.visual=p.visual.validated();Some(p)
    }).take(12).collect()
}
#[cfg(test)]mod tests{
 use super::*;use crate::data::Settings;
 #[test]fn old_preferences_keep_the_same_default_design(){let s:Settings=serde_json::from_str(r#"{"music_style":"arc","music_enabled":true}"#).unwrap();assert_eq!(s.music_style,"arc");assert!(s.music_enabled);assert_eq!(s.music_visual.width,2.6);assert_eq!(s.music_visual.density,24);assert_eq!(s.music_visual.contrast,2.);assert!(s.music_presets.is_empty());}
 #[test]fn custom_design_is_atomic_bounded_and_does_not_change_capture_or_position(){
  let s=Settings {music_enabled:false,overlay_position:Some(crate::data::OverlayPosition{x:22,y:88}),..Settings::default()};
  let changed=s.patch("music_design",serde_json::json!({"style":"led","visual":{"color":"url(secret)","color2":"#FF11EE","width":999,"gain":-2,"contrast":99,"density":900,"height":99}}),None).unwrap();
  assert_eq!(changed.music_style,"led");assert_eq!(changed.music_visual.color,"#a6baff");assert_eq!(changed.music_visual.color2,"#ff11ee");assert_eq!(changed.music_visual.width,4.);assert_eq!(changed.music_visual.gain,0.5);assert_eq!(changed.music_visual.contrast,3.);assert_eq!(changed.music_visual.density,24);assert_eq!(changed.music_visual.height,1.4);assert!(!changed.music_enabled);assert_eq!(changed.overlay_position,s.overlay_position);assert_eq!(changed.revision,s.revision+1);
  for style in STYLES{assert_eq!(s.patch("music_style",serde_json::json!(style),None).unwrap().music_style,style);}
 }
 #[test]fn saved_designs_roundtrip_without_duplicate_or_unbounded_names(){
  let raw=(0..20).map(|i|MusicPreset{name:format!("方案 {i}"),style:"curve".into(),visual:MusicVisual::default()}).collect();let cleaned=clean_presets(raw);assert_eq!(cleaned.len(),12);
  let s=Settings::default().patch("music_presets",serde_json::to_value(&cleaned).unwrap(),None).unwrap();let restored:Settings=serde_json::from_str(&serde_json::to_string(&s).unwrap()).unwrap();assert_eq!(restored.music_presets.len(),12);assert_eq!(restored.music_presets[0].style,"curve");
  assert_eq!(clean_presets(vec![cleaned[0].clone(),cleaned[0].clone()]).len(),1);
 }
}
