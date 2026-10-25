//! Windows launch coordination uses a session-local kernel object, not a file lock.
#[cfg(target_os = "windows")]
mod native {
    use std::{ffi::c_void, ptr};
    #[link(name = "kernel32")]
    extern "system" {
        fn CreateMutexW(attributes: *const c_void, owner: i32, name: *const u16) -> *mut c_void;
        fn GetLastError() -> u32;
        fn CloseHandle(handle: *mut c_void) -> i32;
        fn CreateEventW(attributes: *const c_void, manual: i32, initial: i32, name: *const u16) -> *mut c_void;
        fn OpenEventW(access: u32, inherit: i32, name: *const u16) -> *mut c_void;
        fn SetEvent(handle: *mut c_void) -> i32;
        fn WaitForSingleObject(handle: *mut c_void, milliseconds: u32) -> u32;
    }
    #[link(name = "user32")]
    extern "system" {
        fn MessageBoxW(window: *mut c_void, text: *const u16, title: *const u16, flags: u32) -> i32;
    }
    fn wide(s: &str) -> Vec<u16> { s.encode_utf16().chain(Some(0)).collect() }
    pub struct Guard(*mut c_void, *mut c_void);
    impl Drop for Guard { fn drop(&mut self) { unsafe { CloseHandle(self.0); if !self.1.is_null() { CloseHandle(self.1); } } } }
    pub fn acquire_named(name: &str) -> Result<Option<Guard>, String> {
        let event_name = wide(&format!("{name}.reopen"));
        let mutex_name = wide(name);
        let handle = unsafe { CreateMutexW(ptr::null(), 0, mutex_name.as_ptr()) };
        let error = unsafe { GetLastError() };
        if handle.is_null() { return Err(format!("无法建立启动保护：{}", std::io::Error::from_raw_os_error(error as i32))); }
        let mut guard = Guard(handle, ptr::null_mut());
        if error == 183 { drop(guard); return Ok(None); }
        guard.1 = unsafe { CreateEventW(ptr::null(), 0, 0, event_name.as_ptr()) };
        if guard.1.is_null() { return Err(format!("无法建立窗口恢复通知：{}",std::io::Error::last_os_error())); }
        Ok(Some(guard))
    }
    pub fn signal_named(name: &str) {
        let name = wide(&format!("{name}.reopen"));
        for _ in 0..10 {
            let event = unsafe { OpenEventW(2, 0, name.as_ptr()) };
            if !event.is_null() { unsafe { SetEvent(event); CloseHandle(event); } return; }
            std::thread::sleep(std::time::Duration::from_millis(5));
        }
    }
    pub fn take_named(name: &str) -> bool {
        let name = wide(&format!("{name}.reopen"));
        let event = unsafe { OpenEventW(0x100000, 0, name.as_ptr()) };
        if event.is_null() { return false; }
        let requested = unsafe { WaitForSingleObject(event, 0) == 0 };
        unsafe { CloseHandle(event); }
        requested
    }
    pub fn error(message: &str) {
        let title = wide("ChatGPT Pulse 无法启动");
        let text = wide(&format!("无法启动 ChatGPT Pulse。\n\n请确认当前用户的应用数据目录可以写入，以及 Microsoft Edge WebView2 已安装。\n请保留设置文件，不要直接删除用户数据。\n\n错误详情：{message}"));
        unsafe { MessageBoxW(ptr::null_mut(), text.as_ptr(), title.as_ptr(), 0x10); }
    }
    #[cfg(test)]
    mod tests {
        use super::*;
        #[test]
        fn duplicate_is_rejected_and_process_handle_release_allows_restart() {
            let name = format!("Local\\Pulse-instance-test-{}-{}",std::process::id(),crate::data::now());
            let first = acquire_named(&name).unwrap().unwrap();
            assert!(acquire_named(&name).unwrap().is_none());
            assert!(!take_named(&name));
            signal_named(&name);
            assert!(take_named(&name));
            assert!(!take_named(&name));
            drop(first);
            assert!(acquire_named(&name).unwrap().is_some());
        }
    }
}
#[cfg(target_os = "windows")]
pub use native::Guard;
#[cfg(not(target_os = "windows"))]
pub struct Guard;
pub fn acquire() -> Result<Option<Guard>, String> {
    #[cfg(target_os = "windows")]
    { native::acquire_named("Local\\ChatGPTPulseDesktop-instance-v1") }
    #[cfg(not(target_os = "windows"))]
    { Ok(Some(Guard)) }
}
pub fn reveal() { #[cfg(target_os = "windows")] native::signal_named("Local\\ChatGPTPulseDesktop-instance-v1"); }
pub fn take_reopen() -> bool {
    #[cfg(target_os = "windows")]
    { native::take_named("Local\\ChatGPTPulseDesktop-instance-v1") }
    #[cfg(not(target_os = "windows"))]
    { false }
}
pub fn error(message: &str) {
    #[cfg(target_os = "windows")]
    native::error(message);
    #[cfg(not(target_os = "windows"))]
    eprintln!("Unable to launch ChatGPT Pulse: {message}");
}
