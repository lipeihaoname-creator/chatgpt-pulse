//! Keep user-requested monitoring responsive without preventing system/display sleep.
#[cfg(target_os = "macos")]
#[derive(Default)]
pub struct MonitoringActivity {
    token: Option<
        objc2::rc::Retained<objc2::runtime::ProtocolObject<dyn objc2_foundation::NSObjectProtocol>>,
    >,
}
#[cfg(target_os = "macos")]
impl MonitoringActivity {
    pub fn sync(&mut self, enabled: bool) {
        use objc2_foundation::{NSActivityOptions, NSProcessInfo, NSString};
        if enabled && self.token.is_none() {
            self.token = Some(
                NSProcessInfo::processInfo().beginActivityWithOptions_reason(
                    NSActivityOptions::UserInitiatedAllowingIdleSystemSleep,
                    &NSString::from_str("ChatGPT Pulse local monitoring"),
                ),
            );
        } else if !enabled {
            if let Some(token) = self.token.take() {
                unsafe {
                    NSProcessInfo::processInfo().endActivity(&token);
                }
            }
        }
    }
}
#[cfg(target_os = "macos")]
impl Drop for MonitoringActivity {
    fn drop(&mut self) {
        self.sync(false);
    }
}
#[cfg(not(target_os = "macos"))]
#[derive(Default)]
pub struct MonitoringActivity;
#[cfg(not(target_os = "macos"))]
impl MonitoringActivity {
    pub fn sync(&mut self, _enabled: bool) {}
}
