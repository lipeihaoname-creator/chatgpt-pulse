//! Explicit isolated demo only: capture our own rendered WebView, never desktop.
use tauri::Manager;
pub fn start(app:tauri::AppHandle) {
    if !["PULSE_OFFLINE_TEST","PULSE_RENDER_PROBE","PULSE_DEMO_FRAMES"].iter().all(|k|std::env::var_os(k).is_some()){return;}
    let root=app.state::<crate::Pulse>().log_root.parent().map(|p|p.join("frames"));
    let Some(root)=root else{return;};
    if std::fs::create_dir_all(&root).is_err(){return;}
    std::thread::spawn(move||{
        std::thread::sleep(std::time::Duration::from_secs(4));
        for frame in 0..100 {
            let path=root.join(format!("frame-{frame:03}.png"));
            if let Ok(path)=std::ffi::CString::new(path.to_string_lossy().as_bytes()) {
                if let Some(window)=app.get_webview_window("overlay") {
                    let _=window.with_webview(move|view|unsafe{pulse_demo_snapshot(view.inner(),path.as_ptr())});
                }else{break;}
            }
            std::thread::sleep(std::time::Duration::from_millis(100));
        }
    });
}
unsafe extern "C" {fn pulse_demo_snapshot(view:*mut std::ffi::c_void,path:*const std::ffi::c_char);}
