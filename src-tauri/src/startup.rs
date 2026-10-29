//! Optional per-user launch agent. Observes app process presence only, no AX/UI.
use serde::Serialize;
use std::{path::PathBuf, process::Command, time::Duration};
const LABEL: &str = "io.github.chatgptpulse.client-watch";

#[derive(Serialize)]
pub struct Status {
    pub installed: bool,
    pub loaded: bool,
    pub supported: bool,
}
#[derive(Default)]
struct Gate {
    latched: bool,
}
impl Gate {
    fn should_launch(&mut self, client: bool, pulse: bool) -> bool {
        if !client {
            self.latched = false;
            return false;
        }
        if pulse {
            self.latched = true;
        }
        !self.latched
    }
    fn launched(&mut self) {
        self.latched = true;
    }
}
fn agent_path() -> Result<PathBuf, String> {
    Ok(
        PathBuf::from(std::env::var_os("HOME").ok_or("无法定位用户目录")?)
            .join("Library/LaunchAgents")
            .join(format!("{LABEL}.plist")),
    )
}
fn domain() -> Result<String, String> {
    let uid = Command::new("/usr/bin/id")
        .arg("-u")
        .output()
        .map_err(|_| "无法确定当前用户")?;
    let uid = String::from_utf8_lossy(&uid.stdout).trim().to_owned();
    if uid.is_empty() || !uid.bytes().all(|b| b.is_ascii_digit()) {
        return Err("用户标识无效".into());
    }
    Ok(format!("gui/{uid}"))
}
pub fn status() -> Status {
    if !cfg!(target_os = "macos") || std::env::var_os("PULSE_OFFLINE_TEST").is_some() {
        return Status {
            installed: false,
            loaded: false,
            supported: false,
        };
    }
    let installed = agent_path().is_ok_and(|p| p.exists());
    let loaded = installed
        && domain().is_ok_and(|d| {
            Command::new("/bin/launchctl")
                .args(["print", &format!("{d}/{LABEL}")])
                .output()
                .is_ok_and(|o| o.status.success())
        });
    Status {
        installed,
        loaded,
        supported: true,
    }
}
fn xml(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}
fn plist(exe: &str) -> String {
    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>{LABEL}</string>
<key>ProgramArguments</key><array><string>{}</string><string>--watch-client</string></array>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>10</integer>
<key>ProcessType</key><string>Background</string><key>LimitLoadToSessionType</key><string>Aqua</string>
<key>AssociatedBundleIdentifiers</key><array><string>io.github.chatgptpulse.desktop</string><string>io.github.chatgptpulse.musicpreview</string></array>
<key>StandardOutPath</key><string>/dev/null</string><key>StandardErrorPath</key><string>/dev/null</string>
</dict></plist>"#,
        xml(exe)
    )
}
fn bundle() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|_| "无法定位应用")?;
    let app = exe
        .parent()
        .and_then(|p| p.parent())
        .and_then(|p| p.parent())
        .ok_or("请从打包的 Mac 应用启用启动联动")?;
    if app.extension().is_none_or(|e| e != "app") {
        return Err("请从打包的 Mac 应用启用启动联动".into());
    }
    Ok(app.to_path_buf())
}
pub fn configure(enabled: bool) -> Result<Status, String> {
    if !cfg!(target_os = "macos") || std::env::var_os("PULSE_OFFLINE_TEST").is_some() {
        return Err("此运行不能修改系统启动项".into());
    }
    let path = agent_path()?;
    let d = domain()?;
    if enabled {
        bundle()?;
        let exe = std::env::current_exe().map_err(|_| "无法定位应用")?;
        std::fs::create_dir_all(path.parent().unwrap()).map_err(|_| "无法创建用户启动目录")?;
        let contents = plist(exe.to_str().ok_or("应用路径无法编码")?);
        std::fs::write(&path, contents).map_err(|_| "无法写入启动项")?;
    }
    let _ = Command::new("/bin/launchctl")
        .args(["bootout", &format!("{d}/{LABEL}")])
        .output();
    if enabled {
        let result = Command::new("/bin/launchctl")
            .arg("bootstrap")
            .arg(&d)
            .arg(&path)
            .output()
            .map_err(|_| "无法加载用户启动项")?;
        if !result.status.success() {
            return Err("启动项未成功加载，可在系统登录项中检查是否被禁用".into());
        }
    } else if path.exists() {
        std::fs::remove_file(path).map_err(|_| "无法移除本应用的启动项")?;
    }
    Ok(status())
}

#[cfg(target_os = "macos")]
fn running(id: &str) -> bool {
    use objc2_app_kit::NSRunningApplication;
    use objc2_foundation::NSString;
    objc2::rc::autoreleasepool(|_| {
        NSRunningApplication::runningApplicationsWithBundleIdentifier(&NSString::from_str(id))
            .iter()
            .any(|a| a.processIdentifier() as u32 != std::process::id())
    })
}
#[cfg(not(target_os = "macos"))]
fn running(_: &str) -> bool {
    false
}
fn pulse_running_with(mut query: impl FnMut(&str) -> bool) -> bool {
    ["io.github.chatgptpulse.desktop", "io.github.chatgptpulse.musicpreview"]
        .iter().any(|id| query(id))
}
fn pulse_running() -> bool { pulse_running_with(running) }

pub fn client_running() -> bool {
    ["com.openai.codex", "com.openai.chat", "com.openai.ChatGPT"]
        .iter()
        .any(|id| running(id))
}
pub fn watch() {
    if !cfg!(target_os = "macos") || std::env::var_os("PULSE_OFFLINE_TEST").is_some() {
        return;
    }
    let Ok(app) = bundle() else {
        return;
    };
    let mut gate = Gate::default();
    loop {
        if gate.should_launch(client_running(), pulse_running()) {
            // Launch only our own app; never launch, close or control the GPT client.
            if Command::new("/usr/bin/open")
                .args(["-g", "-a"])
                .arg(&app)
                .args(["--args", "--background"])
                .status()
                .is_ok_and(|s| s.success())
            {
                gate.launched();
            }
        }
        std::thread::sleep(Duration::from_millis(1900));
        #[cfg(target_os = "macos")]
        objc2::rc::autoreleasepool(|_| {
            // Deliver workspace/process notifications before the next snapshot.
            use objc2_foundation::{NSDate, NSRunLoop};
            NSRunLoop::currentRunLoop().runUntilDate(&NSDate::dateWithTimeIntervalSinceNow(0.1));
        });
    }
}
pub fn cli() -> bool {
    let args = std::env::args().collect::<Vec<_>>();
    if args.iter().any(|a| a == "--watch-client") {
        watch();
        return true;
    }
    if args
        .iter()
        .any(|a| a == "--enable-client-watch" || a == "--disable-client-watch")
    {
        match configure(args.iter().any(|a| a == "--enable-client-watch")) {
            Ok(s) => println!("{}", serde_json::to_string(&s).unwrap()),
            Err(e) => {
                eprintln!("{e}");
                std::process::exit(1);
            }
        }
        return true;
    }
    if args.iter().any(|a| a == "--watch-status") {
        println!(
            "{}",
            serde_json::json!({"client_running":client_running(),"pulse_running":pulse_running(),"startup":status()})
        );
        return true;
    }
    false
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn startup_fires_once_per_client_launch_and_respects_manual_quit() {
        let mut g = Gate::default();
        assert!(!g.should_launch(false, false));
        assert!(g.should_launch(true, false));
        g.launched();
        assert!(!g.should_launch(true, true));
        assert!(!g.should_launch(true, false));
        assert!(!g.should_launch(false, false));
        assert!(g.should_launch(true, false));
    }
    #[test]
    fn existing_pulse_and_failed_launch_do_not_loop_or_latch_incorrectly() {
        let mut g = Gate::default();
        assert!(g.should_launch(true, false));
        assert!(g.should_launch(true, false));
        assert!(!g.should_launch(true, true));
        assert!(!g.should_launch(true, false));
    }
    #[test]
    fn both_app_identities_prevent_duplicate_background_launches() {
        for existing in ["io.github.chatgptpulse.desktop", "io.github.chatgptpulse.musicpreview"] {
            assert!(pulse_running_with(|id| id == existing));
            let mut gate=Gate::default();
            assert!(!gate.should_launch(true,pulse_running_with(|id|id==existing)));
            assert!(!gate.should_launch(true,false),"Manual quit remains respected");
        }
        assert!(!pulse_running_with(|_|false));
    }
    #[test]
    fn startup_path_is_xml_escaped() {
        let p = plist("/test/A & B/\"pulse\"");
        assert!(p.contains("A &amp; B/&quot;pulse&quot;"));
        assert!(p.contains("--watch-client"));
        assert!(p.contains("io.github.chatgptpulse.musicpreview"));
        assert!(!p.contains("AXUIElement"));
    }
}
