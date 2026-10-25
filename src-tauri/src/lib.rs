mod activity;
mod avatar;
mod background;
mod cadence;
mod data;
mod follow;
mod instance;
mod logs;
mod overlay;
mod paths;
mod startup;
mod windows;
pub fn startup_cli() -> bool {
    startup::cli()
}
mod store;
use data::{History, Sample, Settings};
use serde::Serialize;
use std::{
    sync::{
        atomic::{AtomicBool, AtomicU64, AtomicU8, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager, State,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

struct Pulse {
    settings: Mutex<Settings>,
    sample: Mutex<Sample>,
    db: Mutex<store::Store>,
    mode: AtomicU8,
    epoch: AtomicU64,
    shortcut_error: Mutex<Option<String>>,
    log_root: std::path::PathBuf,
    avatar_path: std::path::PathBuf,
    selected_log: Mutex<Option<String>>,
    floating: Arc<Floating>,
    task_windows: Mutex<std::collections::BTreeMap<String, Arc<Floating>>>,
    task_ids: Mutex<std::collections::BTreeMap<String, String>>,
    primary_work: Mutex<Option<String>>,
    sync_scheduled: AtomicBool,
}
struct Floating {
    overlay_interaction: Mutex<overlay::Interaction>,
    overlay_dragging: AtomicBool,
    #[cfg(target_os = "windows")]
    pointer_drag: Mutex<overlay::PointerDrag>,
    overlay_revision: AtomicU64,
    tap: Mutex<overlay::TapTracker>,
    tap_clock: Instant,
    tap_monitor: AtomicBool,
    pending_position: Mutex<Option<(data::OverlayPosition, Instant)>>,
    edit_session: Mutex<Option<(Option<data::OverlayPosition>, Instant)>>,
    position_hint: Mutex<Option<data::OverlayPosition>>,
    edit_timeout_queued: AtomicBool,
}
impl Default for Floating {
    fn default() -> Self {
        Self {
            overlay_interaction: Mutex::new(overlay::Interaction::default()),
            overlay_dragging: AtomicBool::new(false),
            #[cfg(target_os = "windows")]
            pointer_drag: Mutex::new(overlay::PointerDrag::default()),
            overlay_revision: AtomicU64::new(0),
            tap: Mutex::new(overlay::TapTracker::default()),
            tap_clock: Instant::now(),
            tap_monitor: AtomicBool::new(false),
            pending_position: Mutex::new(None),
            edit_session: Mutex::new(None),
            position_hint: Mutex::new(None),
            edit_timeout_queued: AtomicBool::new(false),
        }
    }
}
fn floating_for(state: &Pulse, label: &str) -> Option<Arc<Floating>> {
    if label == "overlay" {
        Some(state.floating.clone())
    } else {
        state.task_windows.lock().unwrap().get(label).cloned()
    }
}
#[derive(Serialize)]
struct Bootstrap {
    offline_test: bool,
    settings: Settings,
    sample: Sample,
    history: Vec<History>,
    platform: &'static str,
    shortcut_error: Option<String>,
    logs: Vec<logs::LogFile>,
    selected_log: Option<String>,
    startup: startup::Status,
    overlay_interaction: overlay::Interaction,
}
fn publish(app: &tauri::AppHandle, mut sample: Sample) {
    let state = app.state::<Pulse>();
    let mut primary = state.primary_work.lock().unwrap();
    let editing = state.floating.edit_session.lock().unwrap().is_some();
    *primary = windows::choose_primary(&sample, primary.as_deref(), data::now(), editing);
    sample.overlay_log_id = primary.clone();
    drop(primary);
    *app.state::<Pulse>().sample.lock().unwrap() = sample.clone();
    let _ = apply_overlay(app);
    if !(std::env::var_os("PULSE_OFFLINE_TEST").is_some()
        && std::env::var_os("PULSE_TEST_DROP_PUSH").is_some())
    {
        let tasks = state.task_ids.lock().unwrap().clone();
        for (label, _) in app.webview_windows() {
            let target = tauri::EventTarget::webview_window(&label);
            if label == "main" {
                let _ = app.emit_to(target, "pulse:sample", &sample);
            } else if label == "overlay" {
                let frame = windows::group_frame(&sample, data::now());
                let _ = app.emit_to(target, "pulse:sample", &frame);
            } else {
                let id = if label == "overlay" {
                    sample.overlay_log_id.as_deref()
                } else {
                    tasks.get(&label).map(String::as_str)
                };
                if let Some(id) = id {
                    let frame = windows::project(&sample, id);
                    let _ = app.emit_to(target, "pulse:sample", &frame);
                } else if label == "overlay" {
                    let mut frame = sample.clone();
                    frame.sessions.clear();
                    frame.monitored_sessions = 0;
                    let _ = app.emit_to(target, "pulse:sample", &frame);
                }
            }
        }
    }
    write_test_probe(
        app,
        "sampler",
        serde_json::json!({"at":data::now(),"sequence":sample.poll_sequence,"state":sample.state,"activity":sample.activity_status,"output_tokens":sample.output_tokens,"log_id":sample.log_id,"completion":sample.completion.is_some(),"current_rate":sample.current_rate,"rate_status":sample.rate_status,"sessions":sample.sessions.iter().map(|s|serde_json::json!({"id":s.log_id,"state":s.state,"output":s.output_tokens,"rate":s.current_rate})).collect::<Vec<_>>(),"timeout":sample.rate_idle_seconds,"retention_mode":sample.retention_mode}),
    );
}
// Test-only, local numeric metadata. Production never writes runtime snapshots.
fn write_test_probe(app: &tauri::AppHandle, name: &str, value: serde_json::Value) {
    if std::env::var_os("PULSE_OFFLINE_TEST").is_none()
        || std::env::var_os("PULSE_RENDER_PROBE").is_none()
    {
        return;
    }
    let state = app.state::<Pulse>();
    if let Some(root) = state.log_root.parent() {
        let file = root.join(format!("probe-{name}.json"));
        let temp = file.with_extension("pending");
        if let Ok(bytes) = serde_json::to_vec(&value) {
            if std::fs::write(&temp, bytes).is_ok() {
                let _ = std::fs::rename(temp, file);
            }
        }
    }
}
fn emit_pet_tap(window: &tauri::WebviewWindow, id: u64, source: &str) {
    if window.label() != "overlay" {
        return;
    }
    let _ = window.emit_to(
        tauri::EventTarget::webview_window(window.label()),
        "pulse:pet-tap",
        serde_json::json!({"id":id}),
    );
    write_test_probe(
        window.app_handle(),
        "tap",
        serde_json::json!({"at":data::now(),"id":id,"source":source}),
    );
}
#[derive(Serialize)]
struct OverlayBootstrap {
    offline_test: bool,
    platform: &'static str,
    settings: Settings,
    sample: Sample,
    overlay_interaction: overlay::Interaction,
}
#[tauri::command]
fn bootstrap_overlay(window: tauri::WebviewWindow, state: State<Pulse>) -> OverlayBootstrap {
    OverlayBootstrap {
        offline_test: std::env::var_os("PULSE_OFFLINE_TEST").is_some(),
        platform: std::env::consts::OS,
        settings: state.settings.lock().unwrap().clone(),
        sample: window_sample(&state, window.label()),
        overlay_interaction: floating_for(&state, window.label())
            .map(|f| *f.overlay_interaction.lock().unwrap())
            .unwrap_or_default(),
    }
}
#[tauri::command]
fn get_custom_avatar(state: State<Pulse>) -> Result<Option<String>, String> {
    let _guard = state.settings.lock().unwrap();
    avatar::read(&state.avatar_path)
}
#[tauri::command]
fn set_custom_avatar(
    app: tauri::AppHandle,
    state: State<Pulse>,
    image: String,
) -> Result<Settings, String> {
    let bytes = avatar::decode(&image)?;
    let settings = {
        let mut live = state.settings.lock().unwrap();
        let previous = std::fs::read(&state.avatar_path).ok();
        avatar::write(&state.avatar_path, &bytes)?;
        let mut next = live.clone();
        next.character = "custom".into();
        next.avatar_crop = data::AvatarCrop::default();
        next.avatar_revision = next.avatar_revision.saturating_add(1);
        next.revision = next.revision.saturating_add(1);
        if let Err(e) = state.db.lock().unwrap().save_settings(&next) {
            if let Some(old) = previous {
                let _ = avatar::write(&state.avatar_path, &old);
            } else {
                let _ = std::fs::remove_file(&state.avatar_path);
            }
            return Err(e);
        }
        *live = next.clone();
        next
    };
    app.emit("pulse:settings", &settings)
        .map_err(|e| e.to_string())?;
    Ok(settings)
}
#[tauri::command]
fn settings_snapshot(state: State<Pulse>) -> Settings {
    state.settings.lock().unwrap().clone()
}
#[tauri::command]
fn get_state_avatars(
    state: State<Pulse>,
) -> Result<std::collections::BTreeMap<String, String>, String> {
    let _guard = state.settings.lock().unwrap();
    avatar::read_pack(&state.avatar_path)
}
#[tauri::command]
fn set_state_avatar(
    app: tauri::AppHandle,
    state: State<Pulse>,
    slot: String,
    image: Option<String>,
) -> Result<Settings, String> {
    let path = avatar::slot_path(&state.avatar_path, &slot)?;
    let bytes = image.as_deref().map(avatar::decode).transpose()?;
    let settings = {
        let mut live = state.settings.lock().unwrap();
        let previous = std::fs::read(&path).ok();
        if let Some(bytes) = &bytes {
            avatar::write(&path, bytes)?;
        } else if path.exists() {
            std::fs::remove_file(&path).map_err(|_| "无法删除状态图片")?;
        }
        let mut next = live.clone();
        next.state_avatar_revision = next.state_avatar_revision.saturating_add(1);
        next.revision = next.revision.saturating_add(1);
        next.state_avatar_crops.remove(&slot);
        if let Err(e) = state.db.lock().unwrap().save_settings(&next) {
            if let Some(old) = previous {
                let _ = avatar::write(&path, &old);
            } else {
                let _ = std::fs::remove_file(&path);
            }
            return Err(e);
        }
        *live = next.clone();
        next
    };
    app.emit("pulse:settings", &settings)
        .map_err(|e| e.to_string())?;
    Ok(settings)
}
fn window_sample(state: &Pulse, label: &str) -> Sample {
    let sample = state.sample.lock().unwrap().clone();
    if label == "overlay" {
        return windows::group_frame(&sample, data::now());
    }
    let id = state.task_ids.lock().unwrap().get(label).cloned();
    if let Some(id) = id {
        windows::project(&sample, &id)
    } else {
        let mut sample = sample;
        if label == "overlay" {
            sample.sessions.clear();
            sample.monitored_sessions = 0;
        }
        sample
    }
}
#[tauri::command]
fn sample_snapshot(
    window: tauri::WebviewWindow,
    state: State<Pulse>,
    rendered_sequence: Option<u64>,
    rendered_activity: Option<String>,
    rendered_completion: Option<bool>,
    rendered_log_id: Option<String>,
    rendered_output_tokens: Option<u64>,
    rendered_avatar_count: Option<u64>,
    rendered_idle_mood: Option<String>,
    rendered_companion: Option<bool>,
    rendered_tasks: Option<Vec<(String, Option<u64>)>>,
    received_log_id: Option<String>,
    received_session_count: Option<u64>,
) -> Sample {
    let sample = window_sample(&state, window.label());
    let label = window.label();
    if (matches!(label, "main" | "overlay") || label.starts_with("task-"))
        && std::env::var_os("PULSE_OFFLINE_TEST").is_some()
        && std::env::var_os("PULSE_RENDER_PROBE").is_some()
    {
        let main_visible = window
            .app_handle()
            .get_webview_window("main")
            .is_some_and(|w| w.is_visible().unwrap_or(false));
        write_test_probe(
            window.app_handle(),
            label,
            serde_json::json!({"at":data::now(),"log_id":sample.log_id,"output_tokens":sample.output_tokens,"rendered_log_id":rendered_log_id.filter(|id|Some(id)==sample.log_id.as_ref()),"rendered_output_tokens":rendered_output_tokens,"rendered_avatar_count":rendered_avatar_count,"rendered_idle_mood":rendered_idle_mood.filter(|m|matches!(m.as_str(),"smile"|"curious"|"nod"|"sway"|"stretch"|"glance-left"|"glance-right"|"shy"|"relax"|"bashful"|"pout"|"sleepy"|"proud")),"rendered_companion":rendered_companion,"rendered_tasks":rendered_tasks.unwrap_or_default().into_iter().filter(|(id,_)| sample.log_id.as_ref()==Some(id) || sample.sessions.iter().any(|s|s.log_id.as_ref()==Some(id))).take(512).collect::<Vec<_>>(),"received_log_id":received_log_id.filter(|id|Some(id)==sample.log_id.as_ref()),"received_session_count":received_session_count,"sequence":sample.poll_sequence,"rendered_sequence":rendered_sequence,"rendered_activity":rendered_activity.filter(|s|matches!(s.as_str(),"processing"|"reasoning"|"responding"|"tool"|"quiet"|"waiting_user"|"waiting_approval"|"completed"|"aborted"|"paused"|"unknown"|"waiting"|"loading"|"incomplete"|"unavailable"|"disconnected"|"retrying")),"rendered_completion":rendered_completion,"main_visible":main_visible,"native_tap_monitor":state.floating.tap_monitor.load(Ordering::SeqCst),"edit_locked":state.settings.lock().unwrap().locked,"position":window.outer_position().ok().map(|p|[p.x,p.y]),"size":window.outer_size().ok().map(|p|[f64::from(p.width),f64::from(p.height),window.scale_factor().unwrap_or(1.)]),"view_visible":window.is_visible().unwrap_or(false),"view_focused":window.is_focused().unwrap_or(false)}),
        );
    }
    if std::env::var_os("PULSE_OFFLINE_TEST").is_some()
        && std::env::var_os("PULSE_TEST_STALE_PULL").is_some()
    {
        Sample::default()
    } else {
        sample
    }
}
fn apply_overlay(app: &tauri::AppHandle) -> Result<(), String> {
    let state = app.state::<Pulse>();
    if state.sync_scheduled.swap(true, Ordering::SeqCst) {
        return Ok(());
    }
    let handle = app.clone();
    let result = app
        .run_on_main_thread(move || {
            let state = handle.state::<Pulse>();
            state.sync_scheduled.store(false, Ordering::SeqCst);
            let settings = state.settings.lock().unwrap().clone();
            let sample = state.sample.lock().unwrap().clone();
            windows::sync(&handle, &sample, &settings);
        })
        .map_err(|e| e.to_string());
    if result.is_err() {
        state.sync_scheduled.store(false, Ordering::SeqCst);
    }
    result
}
fn window_layout(label: &str, settings: &Settings) -> String {
    if label.starts_with("task-") {
        if settings.overlay_layout == "avatar" {
            "bubble"
        } else {
            "bubble-bar"
        }
        .into()
    } else {
        settings.overlay_layout.clone()
    }
}
#[tauri::command]
fn bootstrap(state: State<Pulse>) -> Result<Bootstrap, String> {
    let settings = state.settings.lock().unwrap().clone();
    let history = {
        let db = state.db.lock().unwrap();
        db.prune(settings.retention_days)?;
        db.history()?
    };
    Ok(Bootstrap {
        offline_test: std::env::var_os("PULSE_OFFLINE_TEST").is_some(),
        settings,
        sample: state.sample.lock().unwrap().clone(),
        history,
        platform: std::env::consts::OS,
        shortcut_error: state.shortcut_error.lock().unwrap().clone(),
        logs: logs::list(&state.log_root).unwrap_or_default(),
        selected_log: state.selected_log.lock().unwrap().clone(),
        startup: startup::status(),
        overlay_interaction: *state.floating.overlay_interaction.lock().unwrap(),
    })
}
#[tauri::command]
fn list_logs(state: State<Pulse>) -> Result<Vec<logs::LogFile>, String> {
    logs::list(&state.log_root)
}
#[tauri::command]
fn control(
    app: tauri::AppHandle,
    state: State<Pulse>,
    action: String,
    log_id: Option<String>,
) -> Result<Sample, String> {
    let mode = match action.as_str() {
        "live" => 1,
        "demo" => 2,
        "pause" => 0,
        _ => return Err("未知操作".into()),
    };
    let mut settings_guard = state.settings.lock().unwrap();
    if mode == 1 && !settings_guard.follow_latest {
        let id = log_id
            .or(settings_guard.pinned_log.clone())
            .ok_or("请先选择一个日志会话，或启用自动跟随")?;
        logs::resolve(&state.log_root, &id)?;
        let mut next = settings_guard.clone();
        next.pinned_log = Some(id.clone());
        next.revision = next.revision.saturating_add(1);
        state.db.lock().unwrap().save_settings(&next)?;
        *settings_guard = next;
        *state.selected_log.lock().unwrap() = Some(id);
        let _ = app.emit("pulse:settings", &*settings_guard);
    }
    // Epoch invalidates in-flight reads, so an old source cannot publish after switching.
    let continuing_live = mode == 1 && state.mode.load(Ordering::SeqCst) == 1;
    // A detail change must not briefly look like a pause to the sampler and
    // cause it to discard the other tasks' readers.
    if !continuing_live {
        state.mode.store(0, Ordering::SeqCst);
    }
    let epoch = state.epoch.fetch_add(1, Ordering::SeqCst) + 1;
    let mut sample = Sample::default();
    sample.stream_epoch = epoch;
    if mode == 2 {
        sample.source = "demo".into();
        sample.state = "waiting".into();
        sample.message = "合成演示正在启动".into();
    } else if mode == 1 {
        sample.log_id = state.selected_log.lock().unwrap().clone();
        sample.state = "loading".into();
        sample.message = "正在检查 Work 任务与用量元数据".into();
        if continuing_live {
            // Changing detail is not a pause. Keep the other windows attached
            // to their last real samples until the next reader pass arrives.
            let previous = state.sample.lock().unwrap();
            sample.sessions = previous.sessions.clone();
            sample.monitored_sessions = previous.monitored_sessions;
            sample.checked_at = previous.checked_at;
        }
    }
    drop(settings_guard);
    publish(&app, sample.clone());
    state.mode.store(mode, Ordering::SeqCst);
    Ok(sample)
}
#[tauri::command]
fn patch_settings(
    app: tauri::AppHandle,
    state: State<Pulse>,
    key: String,
    value: serde_json::Value,
    pinned_log: Option<String>,
) -> Result<Settings, String> {
    let position = app
        .get_webview_window("overlay")
        .and_then(|w| w.outer_position().ok())
        .map(|p| data::OverlayPosition { x: p.x, y: p.y });
    let settings = {
        let mut live = state.settings.lock().unwrap();
        let mut next = live.patch(&key, value, pinned_log)?;
        if key == "character"
            && next.character == "custom"
            && avatar::read(&state.avatar_path)?.is_none()
        {
            return Err("请先导入头像图片".into());
        }
        if key == "follow_latest" && !next.follow_latest {
            if let Some(id) = &next.pinned_log {
                logs::resolve(&state.log_root, id)?;
            }
        }
        // Hiding while editing must cancel the timeout and must stay hidden.
        if !next.overlay_enabled {
            next.locked = true;
            state.floating.edit_session.lock().unwrap().take();
            if position.is_some() {
                next.overlay_position = position;
            }
            state.floating.pending_position.lock().unwrap().take();
            for (label, floating) in state.task_windows.lock().unwrap().iter() {
                floating.edit_session.lock().unwrap().take();
                floating.pending_position.lock().unwrap().take();
                if let Some(p) = app
                    .get_webview_window(label)
                    .and_then(|w| w.outer_position().ok())
                {
                    next.task_positions
                        .insert(label.clone(), data::OverlayPosition { x: p.x, y: p.y });
                }
            }
        }
        state.db.lock().unwrap().save_settings(&next)?;
        if live.follow_latest != next.follow_latest || live.pinned_log != next.pinned_log {
            *state.selected_log.lock().unwrap() = if next.follow_latest {
                None
            } else {
                next.pinned_log.clone()
            };
            state.epoch.fetch_add(1, Ordering::SeqCst);
        }
        *live = next.clone();
        next
    };
    apply_overlay(&app)?;
    if let Some(tray) = app.tray_by_id("pulse") {
        tray.set_visible(settings.tray_enabled)
            .map_err(|e| e.to_string())?;
    }
    app.emit("pulse:settings", &settings)
        .map_err(|e| e.to_string())?;
    Ok(settings)
}
#[tauri::command]
fn set_client_watch(enabled: bool) -> Result<startup::Status, String> {
    startup::configure(enabled)
}
#[tauri::command]
fn history(state: State<Pulse>) -> Result<Vec<History>, String> {
    let days = state.settings.lock().unwrap().retention_days;
    let db = state.db.lock().unwrap();
    db.prune(days)?;
    db.history()
}
#[tauri::command]
fn clear_history(state: State<Pulse>) -> Result<(), String> {
    state.db.lock().unwrap().clear()
}
#[tauri::command]
fn show_main(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("main") {
        w.unminimize().map_err(|e| e.to_string())?;
        w.show().map_err(|e| e.to_string())?;
        w.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}
#[tauri::command]
fn overlay_edit(
    app: tauri::AppHandle,
    state: State<Pulse>,
    editing: bool,
    cancel: Option<bool>,
) -> Result<bool, String> {
    let w = app.get_webview_window("overlay").ok_or("悬浮条未创建")?;
    let position = w
        .outer_position()
        .ok()
        .map(|p| data::OverlayPosition { x: p.x, y: p.y });
    let mut restore = None;
    let mut task_restores = vec![];
    let settings = {
        let mut live = state.settings.lock().unwrap();
        let mut settings = live.clone();
        if editing {
            let mut session = state.floating.edit_session.lock().unwrap();
            if session.is_none() {
                *session = Some((position, Instant::now()));
            }
            settings.overlay_enabled = true;
        } else {
            let session = state.floating.edit_session.lock().unwrap().take();
            state.floating.pending_position.lock().unwrap().take();
            if cancel.unwrap_or(false) {
                if let Some((Some(original), _)) = session {
                    restore = Some(original.clone());
                    settings.overlay_position = Some(original);
                }
            } else if position.is_some() {
                settings.overlay_position = position;
            }
        }
        for (label, floating) in state.task_windows.lock().unwrap().iter() {
            let Some(task) = app.get_webview_window(label) else {
                continue;
            };
            let current = task
                .outer_position()
                .ok()
                .map(|p| data::OverlayPosition { x: p.x, y: p.y });
            if editing {
                let mut original = floating.edit_session.lock().unwrap();
                if original.is_none() {
                    *original = Some((current, Instant::now()));
                }
            } else {
                let original = floating.edit_session.lock().unwrap().take();
                floating.pending_position.lock().unwrap().take();
                let target = if cancel.unwrap_or(false) {
                    original.and_then(|(p, _)| p)
                } else {
                    current
                };
                if let Some(p) = target {
                    settings.task_positions.insert(label.clone(), p.clone());
                    task_restores.push((task, p));
                }
            }
        }
        settings.locked = !editing;
        settings.revision = live.revision.saturating_add(1);
        state.db.lock().unwrap().save_settings(&settings)?;
        *live = settings.clone();
        settings
    };
    if let Some(p) = restore {
        w.set_position(tauri::PhysicalPosition::new(p.x, p.y))
            .map_err(|e| e.to_string())?;
    }
    for (task, p) in task_restores {
        let _ = task.set_position(tauri::PhysicalPosition::new(p.x, p.y));
    }
    apply_overlay(&app)?;
    if editing && w.is_visible().unwrap_or(false) {
        let _ = w.set_focus();
    }
    let _ = app.emit("pulse:settings", &settings);
    Ok(settings.locked)
}

#[tauri::command]
fn overlay_menu(window: tauri::WebviewWindow, state: State<Pulse>) -> Result<(), String> {
    if window.label() != "overlay" {
        return Err("仅头像窗口可打开快捷菜单".into());
    }
    let settings = state.settings.lock().unwrap().clone();
    let paused = state.mode.load(Ordering::SeqCst) == 0;
    let entries = [
        ("quick-show", "打开主面板".to_owned()),
        (
            "quick-layout",
            if settings.task_display == "separate" {
                "改为一个气泡"
            } else {
                "改为多个气泡"
            }
            .into(),
        ),
        (
            "quick-edit",
            if settings.locked {
                "编辑位置"
            } else {
                "完成编辑"
            }
            .into(),
        ),
        ("quick-cancel", "取消编辑".into()),
        (
            "quick-dnd",
            if settings.do_not_disturb {
                "关闭勿扰"
            } else {
                "开启勿扰"
            }
            .into(),
        ),
        (
            "quick-pause",
            if paused {
                "继续监测"
            } else {
                "暂停监测"
            }
            .into(),
        ),
    ];
    let items = entries
        .iter()
        .map(|(id, text)| {
            MenuItem::with_id(
                window.app_handle(),
                *id,
                text,
                *id != "quick-cancel" || !settings.locked,
                None::<&str>,
            )
        })
        .collect::<tauri::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    let refs = items
        .iter()
        .map(|item| item as &dyn tauri::menu::IsMenuItem<tauri::Wry>)
        .collect::<Vec<_>>();
    let menu = Menu::with_items(window.app_handle(), &refs).map_err(|e| e.to_string())?;
    window.popup_menu(&menu).map_err(|e| e.to_string())
}
fn quick_action(app: &tauri::AppHandle, id: &str) -> Result<(), String> {
    let state = app.state::<Pulse>();
    let settings = state.settings.lock().unwrap().clone();
    match id {
        "quick-show" => show_main(app.clone()),
        "quick-layout" => patch_settings(
            app.clone(),
            state,
            "task_display".into(),
            serde_json::json!(if settings.task_display == "separate" {
                "combined"
            } else {
                "separate"
            }),
            None,
        )
        .map(|_| ()),
        "quick-dnd" => patch_settings(
            app.clone(),
            state,
            "do_not_disturb".into(),
            serde_json::json!(!settings.do_not_disturb),
            None,
        )
        .map(|_| ()),
        "quick-edit" => overlay_edit(app.clone(), state, settings.locked, None).map(|_| ()),
        "quick-cancel" => overlay_edit(app.clone(), state, false, Some(true)).map(|_| ()),
        "quick-pause" => {
            let paused = state.mode.load(Ordering::SeqCst) == 0;
            let selected = state.selected_log.lock().unwrap().clone();
            control(
                app.clone(),
                state,
                if paused { "live" } else { "pause" }.into(),
                selected,
            )
            .map(|_| ())
        }
        _ => Ok(()),
    }
}
#[tauri::command]
fn overlay_drag(window: tauri::WebviewWindow, state: State<Pulse>) -> Result<(), String> {
    if floating_for(&state, window.label()).is_none()
        || !state.settings.lock().unwrap().overlay_enabled
    {
        return Err("只能拖动已显示的悬浮条".into());
    }
    let floating = floating_for(&state, window.label()).ok_or("气泡已关闭")?;
    // Native background dragging can finish before WKWebView receives the
    // original mouse-down. Do not start a second drag after the button is up.
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    if !overlay::primary_button_down() {
        return Ok(());
    }
    #[cfg(target_os = "windows")]
    {
        let pointer = window.app_handle().cursor_position().map_err(|e| e.to_string())?;
        let origin = window.outer_position().map_err(|e| e.to_string())?;
        window.set_ignore_cursor_events(false).map_err(|e| e.to_string())?;
        floating.pointer_drag.lock().unwrap().begin((pointer.x, pointer.y), (origin.x, origin.y));
        floating.overlay_dragging.store(true, Ordering::SeqCst);
        write_test_probe(window.app_handle(), "drag", serde_json::json!({
            "at": data::now(), "phase": "started", "position": [origin.x, origin.y]
        }));
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        floating.overlay_dragging.store(true, Ordering::SeqCst);
        window.set_focusable(true).map_err(|e| e.to_string())?;
        window.set_ignore_cursor_events(false).map_err(|e| e.to_string())?;
        let result = window.start_dragging().map_err(|e| e.to_string());
        if result.is_err() { floating.overlay_dragging.store(false, Ordering::SeqCst); }
        result
    }
}
fn restore_overlay_position(app: &tauri::AppHandle, settings: &Settings) {
    if let (Some(w), Some(p)) = (
        app.get_webview_window("overlay"),
        &settings.overlay_position,
    ) {
        if let Ok(monitors) = w.available_monitors() {
            let screens = monitors
                .iter()
                .map(|m| overlay::Screen {
                    origin: (m.position().x, m.position().y),
                    size: (m.size().width, m.size().height),
                    scale: m.scale_factor(),
                })
                .collect::<Vec<_>>();
            let target = overlay::restored_position((p.x, p.y), &settings.overlay_layout, &screens);
            write_test_probe(
                app,
                "restore",
                serde_json::json!({
                    "requested":[p.x,p.y],"target":[target.0,target.1],
                    "reported_size":w.outer_size().ok().map(|s|[s.width,s.height]),
                    "screens":screens.iter().map(|m|serde_json::json!({"x":m.origin.0,"y":m.origin.1,"width":m.size.0,"height":m.size.1,"scale":m.scale})).collect::<Vec<_>>()
                }),
            );
            let _ = w.set_position(tauri::PhysicalPosition::new(target.0, target.1));
        }
    }
}
fn persist_overlay_position(app: &tauri::AppHandle, label: &str, floating: &Floating) {
    let state = app.state::<Pulse>();
    if floating.edit_session.lock().unwrap().is_some() {
        return;
    }
    let mut pending = floating.pending_position.lock().unwrap();
    if pending
        .as_ref()
        .is_none_or(|(_, t)| t.elapsed() < Duration::from_millis(350))
    {
        return;
    }
    let (position, _) = pending.take().unwrap();
    drop(pending);
    let mut s = state.settings.lock().unwrap();
    if label == "overlay" {
        if s.overlay_position.as_ref() == Some(&position) {
            return;
        }
        s.overlay_position = Some(position);
    } else {
        if s.task_positions.get(label) == Some(&position) {
            return;
        }
        s.task_positions.insert(label.into(), position);
        while s.task_positions.len() > 128 {
            if let Some(key) = s.task_positions.keys().next().cloned() {
                s.task_positions.remove(&key);
            }
        }
    }
    s.revision = s.revision.saturating_add(1);
    if state.db.lock().unwrap().save_settings(&s).is_err() {
        let _ = app.emit("pulse:error", "悬浮条位置保存失败");
    }
    let _ = app.emit("pulse:settings", &*s);
}
fn sampler(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        let mut readers: std::collections::HashMap<String, logs::Tail> =
            std::collections::HashMap::new();
        let mut last_files = vec![];
        let mut sequence = 0u64;
        let mut epoch = u64::MAX;
        let mut previous_mode = 255;
        let mut demo_start = Instant::now();
        let mut activity = background::MonitoringActivity::default();
        loop {
            // Restore through the owning Tauri event loop. The launcher may be
            // hidden/background, so direct cross-process ShowWindow is unreliable.
            if std::env::var_os("PULSE_OFFLINE_TEST").is_none() && instance::take_reopen() {
                let handle = app.clone();
                let _ = app.run_on_main_thread(move || { let _ = show_main(handle); });
            }
            let tick = Instant::now();
            let state = app.state::<Pulse>();
            let new_epoch = state.epoch.load(Ordering::SeqCst);
            let mode = state.mode.load(Ordering::SeqCst);
            let settings = state.settings.lock().unwrap().clone();
            if epoch != new_epoch {
                if mode != previous_mode {
                    readers.clear();
                }
                previous_mode = mode;
                demo_start = Instant::now();
                epoch = new_epoch;
            }
            activity.sync(mode != 0);
            if mode == 0 {
                std::thread::sleep(Duration::from_millis(200));
                continue;
            }
            let mut sample = Sample::default();
            let mut completed = vec![];
            if mode == 2 {
                let t = demo_start.elapsed().as_secs_f64();
                let n = (t / 4.).floor() as u64;
                sample.source = "demo".into();
                let phases = [
                    "processing",
                    "reasoning",
                    "tool",
                    "responding",
                    "waiting_user",
                    "completed",
                ];
                let phase = (n % 6) as usize;
                sample.state = if phase == 5 { "completed" } else { "running" }.into();
                sample.activity_status = phases[phase].into();
                sample.activity_at = Some(data::now());
                sample.activity_age_seconds = Some(0.);
                sample.pending_tools = if phase == 2 { 1 } else { 0 };
                sample.running_seconds = Some(t % 24.);
                let kinds = [
                    "started",
                    "reasoning",
                    "tool_started",
                    "message",
                    "waiting_user",
                    "completed",
                ];
                sample.activities = (0..=phase)
                    .map(|i| activity::ActivityEvent {
                        kind: kinds[i],
                        at: data::now() - ((phase - i) as i64) * 4000,
                    })
                    .collect();
                sample.pulses = sample
                    .activities
                    .iter()
                    .map(|e| activity::PulseBucket {
                        at: e.at.div_euclid(2000) * 2000,
                        last_at: e.at,
                        count: 1,
                        kind: e.kind,
                    })
                    .collect();
                sample.retention_mode = "adaptive".into();
                sample.cadence_samples = phase;
                if phase >= 3 {
                    sample.expected_report_seconds = Some(20.);
                    sample.rate_idle_seconds = 40;
                }
                sample.message = "合成任务记录；不是客户端数据".into();
                sample.rate = Some(32. + 12. * (n as f64 / 2.).sin());
                sample.output_tokens = Some((sample.rate.unwrap() * 10.) as u64);
                sample.reasoning_tokens = Some(80);
                sample.total_output_tokens = sample.output_tokens;
                sample.total_reasoning_tokens = sample.reasoning_tokens;
                sample.observed_seconds = Some(10.);
                sample.measurement_id = Some(format!("demo:{n}"));
                if phase == 5 {
                    sample.completion = Some(data::CompletionCard {
                        id: format!("demo:{n}"),
                        ended_at: data::now() - ((t % 4.) * 1000.) as i64,
                        output_tokens: sample.output_tokens,
                        duration: sample.observed_seconds,
                        average_rate: sample.rate,
                        reason: "completed",
                    });
                }
                sample.quality = "synthetic".into();
            } else {
                match logs::list(&state.log_root) {
                    Ok(mut files) => {
                        let current = state.selected_log.lock().unwrap().clone();
                        // Keep already tracked active sessions even when many newer
                        // files appear. Pinning selects the detail, not the reader set.
                        let mut tracked: Vec<String> = readers
                            .iter()
                            .filter(|(_, reader)| reader.known_open())
                            .map(|(id, _)| id.clone())
                            .collect();
                        tracked.sort();
                        let ids = follow::reader_ids(&files, &tracked, current.as_deref(), |id| {
                            readers.contains_key(id) || logs::resolve(&state.log_root, id).is_ok()
                        });
                        // Retained tasks stay selectable even outside the recent index.
                        for id in &ids {
                            if !files.iter().any(|f| &f.id == id) {
                                if let Ok(file) = logs::describe(&state.log_root, id) {
                                    files.push(file);
                                }
                            }
                        }
                        files.sort_by(|a, b| b.modified.cmp(&a.modified).then(a.id.cmp(&b.id)));
                        readers.retain(|id, _| ids.contains(id));
                        let mut samples = Vec::new();
                        let mut read_error = None;
                        for id in ids {
                            let r = readers.entry(id.clone()).or_insert_with(|| {
                                logs::Tail::new(state.log_root.clone(), id.clone())
                            });
                            let budget = Instant::now();
                            loop {
                                match r.poll_with_policy(
                                    settings.rate_idle_seconds,
                                    settings.adaptive_retention,
                                ) {
                                    Ok((mut s, rows)) => {
                                        // Each summary stays attached to its actual source.
                                        completed.extend(rows.into_iter().map(|c| (id.clone(), c)));
                                        if !r.is_loading()
                                            || budget.elapsed() >= Duration::from_millis(20)
                                        {
                                            s.checked_at = Some(data::now());
                                            samples.push((id.clone(), s));
                                            break;
                                        }
                                    }
                                    Err(e) => {
                                        samples.push((id.clone(), r.failure_sample(e.clone())));
                                        read_error = Some(e);
                                        break;
                                    }
                                }
                            }
                        }
                        let count = samples.iter().filter(|(_, s)| s.unfinished()).count();
                        sample = follow::detail(
                            &samples,
                            current.as_deref(),
                            settings.follow_latest,
                            read_error,
                        );
                        sample.monitored_sessions = count;
                        sample.sessions = samples.into_iter().map(|(_, s)| s).collect();
                        if files != last_files {
                            let _ = app.emit("pulse:logs", &files);
                            last_files = files;
                        }
                    }
                    Err(e) => {
                        let current = state.selected_log.lock().unwrap().clone();
                        let mut samples: Vec<_> = readers
                            .iter()
                            .filter_map(|(id, reader)| {
                                let sample = reader.failure_sample(e.clone());
                                sample.unfinished().then(|| (id.clone(), sample))
                            })
                            .collect();
                        samples.sort_by(|a, b| a.0.cmp(&b.0));
                        sample = follow::detail(
                            &samples,
                            current.as_deref(),
                            settings.follow_latest,
                            Some(e),
                        );
                        sample.monitored_sessions = samples.len();
                        sample.sessions = samples.into_iter().map(|(_, s)| s).collect();
                    }
                }
            }
            sequence += 1;
            sample.checked_at = Some(data::now());
            sample.timestamp = data::now();
            sample.poll_sequence = sequence;
            sample.stream_epoch = epoch;
            sample.follow_latest = settings.follow_latest;

            let current_settings = state.settings.lock().unwrap();
            if state.epoch.load(Ordering::SeqCst) == epoch
                && state.mode.load(Ordering::SeqCst) == mode
            {
                if mode == 1 {
                    *state.selected_log.lock().unwrap() = sample.log_id.clone();
                }
                if mode == 1 && current_settings.keep_history {
                    let db = state.db.lock().unwrap();
                    for (id, c) in &completed {
                        if db.insert_log(id, c).is_err() {
                            let _ = app.emit("pulse:error", "本地摘要保存失败");
                        }
                    }
                    let _ = db.prune(settings.retention_days);
                    if !completed.is_empty() {
                        let _ = app.emit("pulse:history", ());
                    }
                }
                publish(&app, sample);
            }
            drop(current_settings);
            std::thread::sleep(
                Duration::from_millis(settings.interval_ms).saturating_sub(tick.elapsed()),
            );
        }
    });
}
fn hover_worker(app: tauri::AppHandle, label: String, floating: Arc<Floating>) {
    std::thread::spawn(move || {
        let mut last = None;
        let mut was_down = false;
        let mut last_geometry: Option<((f64, f64), (f64, f64), f64)> = None;
        let mut geometry_refresh = overlay::GeometryRefresh::default();
        loop {
            std::thread::sleep(Duration::from_millis(24));
            let state = app.state::<Pulse>();
            if floating_for(&state, &label).is_none_or(|current| !Arc::ptr_eq(&current, &floating))
            {
                break;
            }
            let settings = state.settings.lock().unwrap().clone();
            let layout = window_layout(&label, &settings);
            let expired = state
                .floating
                .edit_session
                .lock()
                .unwrap()
                .as_ref()
                .is_some_and(|(_, at)| at.elapsed() >= Duration::from_secs(60));
            if label == "overlay" && expired && !overlay::primary_button_down() {
                if !floating.edit_timeout_queued.swap(true, Ordering::SeqCst) {
                    let handle = app.clone();
                    let runtime = floating.clone();
                    if app
                        .run_on_main_thread(move || {
                            // UI geometry and the settings transaction must share
                            // the main thread; a worker must not hold settings while
                            // waiting for AppKit. Recheck after any queued drag/edit.
                            let expired = runtime
                                .edit_session
                                .lock()
                                .unwrap()
                                .as_ref()
                                .is_some_and(|(_, at)| at.elapsed() >= Duration::from_secs(60));
                            if expired && !overlay::primary_button_down() {
                                let _ = overlay_edit(
                                    handle.clone(),
                                    handle.state::<Pulse>(),
                                    false,
                                    None,
                                );
                            }
                            runtime.edit_timeout_queued.store(false, Ordering::SeqCst);
                        })
                        .is_err()
                    {
                        floating.edit_timeout_queued.store(false, Ordering::SeqCst);
                    }
                }
                continue;
            }
            if !overlay::primary_button_down() {
                persist_overlay_position(&app, &label, &floating);
            }
            let Some(w) = app.get_webview_window(&label) else {
                break;
            };
            if !settings.overlay_enabled || !w.is_visible().unwrap_or(false) {
                #[cfg(target_os = "windows")]
                floating.pointer_drag.lock().unwrap().cancel();
                floating.overlay_dragging.store(false, Ordering::SeqCst);
                last = None;
                floating.tap.lock().unwrap().reset();
                was_down = false;
                last_geometry = None;
                geometry_refresh.clear();
                continue;
            }
            let previous = *floating.overlay_interaction.lock().unwrap();
            let button_down = overlay::primary_button_down();
            if button_down && !was_down && !floating.tap_monitor.load(Ordering::SeqCst) {
                if let Some((p, o, scale)) = last_geometry {
                    floating.tap.lock().unwrap().begin(
                        previous.grip_active,
                        p,
                        o,
                        floating.tap_clock.elapsed().as_millis() as u64,
                        scale,
                    );
                }
            }
            if cfg!(target_os = "macos") && button_down && previous.native_drag {
                floating.overlay_dragging.store(true, Ordering::SeqCst);
            }
            if !button_down {
                floating.overlay_dragging.store(false, Ordering::SeqCst);
            }
            let Ok(p) = app.cursor_position() else {
                continue;
            };
            #[cfg(target_os = "windows")]
            {
                let target = floating.pointer_drag.lock().unwrap().update((p.x, p.y), button_down);
                if let Some((x, y)) = target {
                    if let Err(error) = w.set_position(tauri::PhysicalPosition::new(x, y)) {
                        floating.pointer_drag.lock().unwrap().cancel();
                        floating.overlay_dragging.store(false, Ordering::SeqCst);
                        let _ = w.emit("pulse:error", format!("无法移动悬浮条：{error}"));
                    }
                }
            }
            let revision = floating.overlay_revision.load(Ordering::SeqCst);
            let refresh_at = floating.tap_clock.elapsed().as_millis() as u64;
            let frame = overlay::PointerFrame {
                point: (p.x, p.y),
                down: button_down,
                locked: settings.locked,
                settings_revision: settings.revision,
                geometry_revision: revision,
            };
            if !geometry_refresh.due(refresh_at, frame) {
                continue;
            }
            if let (Ok(mut o), Ok(size), Ok(scale)) =
                (w.outer_position(), w.outer_size(), w.scale_factor())
            {
                geometry_refresh.record(refresh_at, frame);
                let mut dock_side = 0;
                let mut avatar_right = previous.avatar_right && layout == "avatar";
                if settings.edge_snap && layout == "avatar" {
                    let anchor = (
                        f64::from(o.x)
                            + if avatar_right {
                                f64::from(size.width) - 62. * scale
                            } else {
                                62. * scale
                            },
                        f64::from(o.y) + 64. * scale,
                    );
                    let monitor = w
                        .available_monitors()
                        .ok()
                        .and_then(|ms| {
                            ms.into_iter().find(|m| {
                                let a = m.position();
                                let s = m.size();
                                anchor.0 >= f64::from(a.x)
                                    && anchor.0 < f64::from(a.x) + f64::from(s.width)
                                    && anchor.1 >= f64::from(a.y)
                                    && anchor.1 < f64::from(a.y) + f64::from(s.height)
                            })
                        })
                        .or_else(|| w.current_monitor().ok().flatten());
                    if let Some(m) = monitor {
                        let screen = (m.position().x, m.size().width);
                        if last_geometry.is_none() && !button_down {
                            avatar_right = overlay::dock_side(o.x, size.width, screen) == 1;
                        }
                        let (target, right) = overlay::snap_avatar(
                            (o.x, o.y),
                            size.width,
                            screen,
                            scale,
                            avatar_right,
                            button_down,
                        );
                        if target == (o.x, o.y)
                            || w.set_position(tauri::PhysicalPosition::new(target.0, target.1))
                                .is_ok()
                        {
                            o.x = target.0;
                            avatar_right = right;
                        }
                        let edge = overlay::dock_side(o.x, size.width, screen);
                        if (edge == 1 && avatar_right) || (edge == -1 && !avatar_right) {
                            dock_side = edge;
                        }
                    }
                }
                let previous = *floating.overlay_interaction.lock().unwrap();
                let mut next = overlay::interaction_for_dock(
                    &overlay::Bounds {
                        x: f64::from(o.x),
                        y: f64::from(o.y),
                        width: f64::from(size.width),
                        height: f64::from(size.height),
                        scale,
                    },
                    (p.x, p.y),
                    settings.locked,
                    settings.hover_hide,
                    floating.overlay_dragging.load(Ordering::SeqCst),
                    previous.faded,
                    &layout,
                    if avatar_right { 1 } else { 0 },
                );
                next.dock_side = dock_side;
                let point = (p.x, p.y);
                let origin = (f64::from(o.x), f64::from(o.y));
                let tap_id = {
                    let mut tap = floating.tap.lock().unwrap();
                    tap.observe(point, origin);
                    if !button_down {
                        tap.release(
                            next.grip_active,
                            point,
                            origin,
                            floating.tap_clock.elapsed().as_millis() as u64,
                        )
                    } else {
                        None
                    }
                };
                was_down = button_down;
                last_geometry = Some((point, origin, scale));
                if last != Some((next, settings.locked, revision)) {
                    overlay::native_drag_region(&w, next.native_drag);
                    // The locked drag handle accepts first mouse without taking keyboard focus.
                    let _ = w.set_focusable(!settings.locked);
                    let _ = w.set_ignore_cursor_events(next.ignore_cursor);
                    *floating.overlay_interaction.lock().unwrap() = next;
                    // Keep the native window present: CSS fades the entire surface,
                    // while pointer detection still works through the window.
                    let _ = w.emit_to(
                        tauri::EventTarget::webview_window(w.label()),
                        "pulse:overlay",
                        next,
                    );
                    last = Some((next, settings.locked, revision));
                }
                // Windows taps belong to the DOM; the native poll is only for
                // dragging/hit testing. Emitting both would speak twice.
                if cfg!(target_os = "macos") && settings.dialogue_enabled {
                    if let Some(id) = tap_id {
                        emit_pet_tap(&w, id, "poll-recovery");
                    }
                }
            }
        }
    });
}

fn install_pointer(app: tauri::AppHandle, label: String, floating: Arc<Floating>) {
    #[cfg(target_os = "macos")]
    if let Some(w) = app.get_webview_window(&label) {
        let handle = app.clone();
        let callback_label = label.clone();
        let callback_floating = floating.clone();
        let monitor = overlay::install_tap_monitor(&w, move |phase, point, origin, scale| {
            let state = handle.state::<Pulse>();
            let settings = state.settings.lock().unwrap().clone();
            if !settings.overlay_enabled
                || !handle
                    .get_webview_window(&callback_label)
                    .is_some_and(|w| w.is_visible().unwrap_or(false))
            {
                callback_floating.tap.lock().unwrap().reset();
                return;
            }
            let layout = window_layout(&callback_label, &settings);
            let (width, height) =
                windows::group_dimensions(&state.sample.lock().unwrap(), &settings);
            let dock_side = if callback_floating
                .overlay_interaction
                .lock()
                .unwrap()
                .avatar_right
            {
                1
            } else {
                0
            };
            let hit = overlay::interaction_for_dock(
                &overlay::Bounds {
                    x: origin.0,
                    y: origin.1,
                    width: width * scale,
                    height: height * scale,
                    scale,
                },
                point,
                settings.locked,
                false,
                false,
                false,
                &layout,
                dock_side,
            );
            let id = {
                let mut tap = callback_floating.tap.lock().unwrap();
                let at = callback_floating.tap_clock.elapsed().as_millis() as u64;
                match phase {
                    overlay::MousePhase::Down => {
                        tap.begin(hit.grip_active, point, origin, at, scale);
                        None
                    }
                    overlay::MousePhase::Move => {
                        tap.observe(point, origin);
                        None
                    }
                    overlay::MousePhase::Up => tap.release(hit.grip_active, point, origin, at),
                }
            };
            if settings.dialogue_enabled && !callback_label.starts_with("task-") {
                if let Some(id) = id {
                    if let Some(w) = handle.get_webview_window(&callback_label) {
                        emit_pet_tap(&w, id, "local-event");
                    }
                }
            }
        });
        floating
            .tap_monitor
            .store(monitor.is_ok(), Ordering::SeqCst);
    }
}

pub fn report_launch_error(message: &str) { instance::error(message); }

pub fn run() -> Result<(), String> {
    // Numeric fixtures remain independently isolated; normal launches share one instance.
    let _instance = if std::env::var_os("PULSE_OFFLINE_TEST").is_some() {
        None
    } else {
        match instance::acquire()? {
            Some(guard) => Some(guard),
            None => { instance::reveal(); return Ok(()); }
        }
    };
    let app = tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _, event| {
                    if event.state() == ShortcutState::Pressed {
                        let state = app.state::<Pulse>();
                        let editing = state.settings.lock().unwrap().locked;
                        let _ = overlay_edit(app.clone(), state, editing, None);
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            bootstrap,
            bootstrap_overlay,
            sample_snapshot,
            settings_snapshot,
            control,
            patch_settings,
            history,
            clear_history,
            list_logs,
            set_client_watch,
            show_main,
            overlay_edit,
            overlay_drag,
            overlay_menu,
            get_custom_avatar,
            set_custom_avatar,
            get_state_avatars,
            set_state_avatar
        ])
        .setup(|app| {
            let initialized = (|| -> Result<(), Box<dyn std::error::Error>> {
            let path = if std::env::var_os("PULSE_OFFLINE_TEST").is_some() {
                std::env::var_os("PULSE_DATA_DIR")
                    .map(std::path::PathBuf::from)
                    // A malformed test launch must never touch normal data.
                    .filter(|p| p.is_absolute())
                    .ok_or_else(|| std::io::Error::other("隔离测试需要绝对路径 PULSE_DATA_DIR"))?
            } else {
                app.path().app_data_dir()?
            };
            std::fs::create_dir_all(&path)?;
            let db =
                store::Store::open(&path.join("pulse.sqlite")).map_err(std::io::Error::other)?;
            let mut settings = db.settings();
            settings.locked = true;
            settings.revision = settings.revision.saturating_add(1);
            db.save_settings(&settings).map_err(std::io::Error::other)?;
            db.prune(settings.retention_days)
                .map_err(std::io::Error::other)?;
            app.manage(Pulse {
                settings: Mutex::new(settings.clone()),
                sample: Mutex::new(Sample::default()),
                db: Mutex::new(db),
                mode: AtomicU8::new(if settings.auto_monitor { 1 } else { 0 }),
                epoch: AtomicU64::new(0),
                shortcut_error: Mutex::new(None),
                log_root: if std::env::var_os("PULSE_OFFLINE_TEST").is_some() {
                    // Test mode is physically isolated from the user's logs and AX.
                    path.join("logs")
                } else {
                    paths::sessions_root(
                        &app.path().home_dir()?,
                        std::env::var_os("CODEX_HOME").as_deref(),
                    )
                },
                avatar_path: path.join("avatar.png"),
                selected_log: Mutex::new(settings.pinned_log.clone()),
                floating: Arc::new(Floating::default()),
                task_windows: Mutex::new(Default::default()),
                task_ids: Mutex::new(Default::default()),
                primary_work: Mutex::new(None),
                sync_scheduled: AtomicBool::new(false),
            });
            app.on_menu_event(|app, event| {
                if event.id.as_ref().starts_with("quick-") {
                    if let Err(error) = quick_action(app, event.id.as_ref()) {
                        let _ = app.emit("pulse:error", error);
                    }
                }
            });
            let show = MenuItem::with_id(app, "show", "打开 ChatGPT Pulse", true, None::<&str>)?;
            let edit = MenuItem::with_id(app, "edit", "编辑悬浮条", true, None::<&str>)?;
            let pause = MenuItem::with_id(app, "pause", "暂停监测", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &edit, &pause, &quit])?;
            let mut pixels = vec![0u8; 24 * 24 * 4];
            for y in 0..24usize {
                for x in 0..24usize {
                    let points = [
                        (1f64, 13f64),
                        (7., 13.),
                        (10., 4.),
                        (15., 21.),
                        (18., 13.),
                        (23., 13.),
                    ];
                    let visible = points.windows(2).any(|w| {
                        let (ax, ay) = w[0];
                        let (bx, by) = w[1];
                        let t = (((x as f64 - ax) * (bx - ax) + (y as f64 - ay) * (by - ay))
                            / ((bx - ax).powi(2) + (by - ay).powi(2)))
                        .clamp(0., 1.);
                        (x as f64 - ax - t * (bx - ax)).hypot(y as f64 - ay - t * (by - ay)) < 1.2
                    });
                    if visible {
                        let i = (y * 24 + x) * 4;
                        pixels[i..i + 4].copy_from_slice(&[170, 235, 193, 255]);
                    }
                }
            }
            let tray = TrayIconBuilder::with_id("pulse")
                .icon(tauri::image::Image::new_owned(pixels, 24, 24))
                .tooltip("ChatGPT Pulse")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        let _ = show_main(app.clone());
                    }
                    "edit" => {
                        let _ = overlay_edit(app.clone(), app.state::<Pulse>(), true, None);
                    }
                    "pause" => {
                        let _ = control(app.clone(), app.state::<Pulse>(), "pause".into(), None);
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;
            tray.set_visible(settings.tray_enabled)?;
            let shortcut = if cfg!(target_os = "macos") {
                "Command+Control+Alt+P"
            } else {
                "Control+Alt+Shift+P"
            };
            if let Err(e) = app.global_shortcut().register(shortcut) {
                *app.state::<Pulse>().shortcut_error.lock().unwrap() =
                    Some(format!("快捷键注册失败：{e}"));
            }
            if !std::env::args().any(|a| a == "--background") {
                show_main(app.handle().clone()).map_err(std::io::Error::other)?;
            }
            if let Some(w) = app.get_webview_window("overlay") {
                let (width, height) = overlay::dimensions(&settings.overlay_layout, true);
                w.set_size(tauri::LogicalSize::new(width, height))?;
            }
            restore_overlay_position(app.handle(), &settings);
            apply_overlay(app.handle()).map_err(std::io::Error::other)?;
            sampler(app.handle().clone());
            install_pointer(
                app.handle().clone(),
                "overlay".into(),
                app.state::<Pulse>().floating.clone(),
            );
            hover_worker(
                app.handle().clone(),
                "overlay".into(),
                app.state::<Pulse>().floating.clone(),
            );
            Ok(())
            })();
            if let Err(error) = initialized {
                // Tauri runs this hook inside the event loop; returning Err here
                // otherwise aborts release builds before main can report it.
                instance::error(&error.to_string());
                std::process::exit(1);
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "overlay" || window.label().starts_with("task-") {
                if let tauri::WindowEvent::Moved(p) = event {
                    if let Some(state) = window.try_state::<Pulse>() {
                        if let Some((_, at)) = state.floating.edit_session.lock().unwrap().as_mut()
                        {
                            *at = Instant::now();
                        }
                        if let Some(floating) = floating_for(&state, window.label()) {
                            *floating.position_hint.lock().unwrap() =
                                Some(data::OverlayPosition { x: p.x, y: p.y });
                            *floating.pending_position.lock().unwrap() =
                                Some((data::OverlayPosition { x: p.x, y: p.y }, Instant::now()));
                        }
                    }
                }
            }
            if window.label() == "main" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    // Closing the dashboard is a background action, including when
                    // the optional menu-bar icon is off. Explicit Quit still exits.
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .build(tauri::generate_context!())
        .map_err(|error| error.to_string())?;
    app.run(|app, event| {
            #[cfg(target_os = "macos")]
            if matches!(event, tauri::RunEvent::Reopen { .. }) {
                let _ = show_main(app.clone());
            }
            if matches!(event, tauri::RunEvent::ExitRequested { .. }) {
                let state = app.state::<Pulse>();
                state.mode.store(0, Ordering::SeqCst);
                state.epoch.fetch_add(1, Ordering::SeqCst);
            }
        });
    Ok(())
}
