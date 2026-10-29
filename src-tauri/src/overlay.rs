//! Pointer policy for our own overlay. Coordinates are physical pixels.
use serde::Serialize;
#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize)]
pub struct Interaction {
    pub faded: bool,
    pub dragging: bool,
    pub grip_active: bool,
    pub ignore_cursor: bool,
    pub native_drag: bool,
    pub dock_side: i8,
    pub avatar_right: bool,
}
#[derive(Clone, Copy, PartialEq)]
pub struct PointerFrame {
    pub point: (f64, f64),
    pub down: bool,
    pub locked: bool,
    pub settings_revision: u64,
    pub geometry_revision: u64,
}
/// Poll the pointer quickly, but don't repeatedly ask AppKit for identical
/// geometry while it is stationary. A periodic refresh catches OS-side moves.
#[derive(Default)]
pub struct GeometryRefresh(Option<(u64, PointerFrame)>);
impl GeometryRefresh {
    pub fn due(&self, now: u64, frame: PointerFrame) -> bool {
        self.0.is_none_or(|(at, old)| {
            frame.down || old.down || !frame.locked || frame != old || now < at || now - at >= 200
        })
    }
    pub fn record(&mut self, now: u64, frame: PointerFrame) {
        self.0 = Some((now, frame));
    }
    pub fn clear(&mut self) {
        self.0 = None;
    }
}
// Windows WebView2 dragging follows physical cursor deltas after the DOM
// gesture threshold; it does not depend on the OS non-client modal drag loop.
#[cfg(any(target_os = "windows", test))]
#[derive(Default)]
pub struct PointerDrag {
    anchor: Option<((f64, f64), (i32, i32))>,
}
#[cfg(any(target_os = "windows", test))]
impl PointerDrag {
    pub fn begin(&mut self, pointer: (f64, f64), origin: (i32, i32)) {
        self.anchor = Some((pointer, origin));
    }
    pub fn cancel(&mut self) { self.anchor = None; }
    pub fn update(&mut self, pointer: (f64, f64), down: bool) -> Option<(i32, i32)> {
        if !down { self.cancel(); return None; }
        let (start, origin) = self.anchor?;
        Some((
            (f64::from(origin.0) + pointer.0 - start.0).round() as i32,
            (f64::from(origin.1) + pointer.1 - start.1).round() as i32,
        ))
    }
}
pub struct Bounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub scale: f64,
}
fn inside(x: f64, y: f64, left: f64, top: f64, right: f64, bottom: f64) -> bool {
    x >= left && x <= right && y >= top && y <= bottom
}
#[cfg(test)]
pub fn interaction(
    b: &Bounds,
    p: (f64, f64),
    locked: bool,
    hover_hide: bool,
    dragging: bool,
    was_faded: bool,
) -> Interaction {
    interaction_for_layout(b, p, locked, hover_hide, dragging, was_faded, "bar")
}
pub fn dimensions(layout: &str, locked: bool) -> (f64, f64) {
    if layout == "bubble" {
        (192., if locked { 116. } else { 156. })
    } else if layout == "bubble-bar" {
        (232., if locked { 64. } else { 104. })
    } else if layout == "avatar" {
        (280., if locked { 128. } else { 168. })
    } else {
        (272., if locked { 64. } else { 104. })
    }
}
pub fn group_dimensions(layout: &str, locked: bool, count: usize, display: &str) -> (f64, f64) {
    let (width, base) = dimensions(layout, locked);
    if count <= 1 {
        return (width, base);
    }
    let content = if layout == "avatar" {
        if display == "combined" {
            count as f64 * 70. + 20.
        } else {
            count as f64 * 84. + 8.
        }
    } else {
        if display == "combined" {
            count as f64 * 62. + 20.
        } else {
            count as f64 * 62. + 16.
        }
    };
    (
        width,
        content.max(if layout == "avatar" { 128. } else { 64. }) + if locked { 0. } else { 40. },
    )
}
pub fn clamp_position(p: (i32, i32), size: (u32, u32), screen: (i32, i32, u32, u32)) -> (i32, i32) {
    let right = i64::from(screen.0) + (i64::from(screen.2) - i64::from(size.0)).max(0);
    let bottom = i64::from(screen.1) + (i64::from(screen.3) - i64::from(size.1)).max(0);
    (
        i64::from(p.0).clamp(i64::from(screen.0), right) as i32,
        i64::from(p.1).clamp(i64::from(screen.1), bottom) as i32,
    )
}
pub struct Screen {
    pub origin: (i32, i32),
    pub size: (u32, u32),
    pub scale: f64,
}
/// Startup resize events may not have reached the OS yet. Use the requested
/// layout at each monitor's scale, never the old configured window dimensions.
/// A disconnected display should move the overlay to the nearest visible spot.
pub fn restored_position(p: (i32, i32), layout: &str, screens: &[Screen]) -> (i32, i32) {
    restored_position_sized(p, dimensions(layout, true), screens)
}
pub fn restored_position_sized(p: (i32, i32), size: (f64, f64), screens: &[Screen]) -> (i32, i32) {
    let (width, height) = size;
    screens
        .iter()
        .map(|m| {
            let scale = m.scale.max(0.1);
            let q = clamp_position(
                p,
                (
                    (width * scale).round() as u32,
                    (height * scale).round() as u32,
                ),
                (m.origin.0, m.origin.1, m.size.0, m.size.1),
            );
            let dx = i128::from(p.0) - i128::from(q.0);
            let dy = i128::from(p.1) - i128::from(q.1);
            (dx * dx + dy * dy, q)
        })
        .min_by_key(|(distance, _)| *distance)
        .map(|(_, q)| q)
        .unwrap_or(p)
}
#[cfg(test)]
mod restore_tests {
    use super::*;
    #[test]
    fn right_edge_uses_avatar_size_even_before_os_resize_arrives() {
        let screen = Screen {
            origin: (0, 0),
            size: (2940, 1912),
            scale: 2.,
        };
        // The configured 390px bar is too wide here, but a 280px avatar fits.
        assert_eq!(
            restored_position((2380, 108), "avatar", &[screen]),
            (2380, 108)
        );
    }
    #[test]
    fn changed_display_clamps_nearby_instead_of_resetting_to_top_left() {
        let screens = [Screen {
            origin: (0, 0),
            size: (1920, 1080),
            scale: 1.,
        }];
        assert_eq!(
            restored_position((2380, 108), "avatar", &screens),
            (1640, 108)
        );
        assert_eq!(
            restored_position((100, 1050), "avatar", &screens),
            (100, 952)
        );
    }
    #[test]
    fn negative_origin_and_different_scale_preserve_valid_positions() {
        let screens = [
            Screen {
                origin: (0, 0),
                size: (2940, 1912),
                scale: 2.,
            },
            Screen {
                origin: (-1920, 0),
                size: (1920, 1080),
                scale: 1.,
            },
        ];
        assert_eq!(
            restored_position((-280, 100), "avatar", &screens),
            (-280, 100)
        );
        assert_eq!(
            restored_position((-3000, 100), "bar", &screens),
            (-1920, 100)
        );
        assert_eq!(restored_position((5, 10), "avatar", &[]), (5, 10));
    }
}
#[cfg(test)]
pub fn interaction_for_layout(
    b: &Bounds,
    p: (f64, f64),
    locked: bool,
    hover_hide: bool,
    dragging: bool,
    was_faded: bool,
    layout: &str,
) -> Interaction {
    interaction_for_dock(b, p, locked, hover_hide, dragging, was_faded, layout, 0)
}
#[cfg(test)]
pub fn snap_edges(p: (i32, i32), width: u32, screen: (i32, u32), scale: f64) -> (i32, i32) {
    let left = i64::from(screen.0);
    let right = left + (i64::from(screen.1) - i64::from(width)).max(0);
    let x = i64::from(p.0);
    let margin = (24. * scale.max(0.1)) as i64;
    let snapped = if (x - left).abs() <= margin {
        left
    } else if (x - right).abs() <= margin {
        right
    } else {
        x
    };
    (snapped as i32, p.1)
}
// Match the visible 112px avatar, not the transparent 280px window. Preserve
// orientation while dragging, and compensate for the 156px layout shift on snap.
pub fn snap_avatar(
    p: (i32, i32),
    width: u32,
    screen: (i32, u32),
    scale: f64,
    right: bool,
    down: bool,
) -> ((i32, i32), bool) {
    if down {
        return (p, right);
    }
    let scale = scale.max(0.1);
    let inset = (124. * scale).round() as i64;
    let left = i64::from(screen.0);
    let end = left + i64::from(screen.1);
    let x = i64::from(p.0);
    let width = i64::from(width);
    let left_gap = x + if right { width - inset } else { 0 } - left;
    let right_gap = end - (x + if right { width } else { inset });
    let margin = (24. * scale).round() as i64;
    if left_gap.abs() <= margin && left_gap.abs() <= right_gap.abs() {
        ((left as i32, p.1), false)
    } else if right_gap.abs() <= margin {
        (((end - width) as i32, p.1), true)
    } else {
        (p, right)
    }
}
pub fn dock_side(x: i32, width: u32, screen: (i32, u32)) -> i8 {
    let left = i64::from(screen.0);
    let right = left + (i64::from(screen.1) - i64::from(width)).max(0);
    if (i64::from(x) - left).abs() <= 2 {
        -1
    } else if (i64::from(x) - right).abs() <= 2 {
        1
    } else {
        0
    }
}
#[allow(clippy::too_many_arguments)]
pub fn interaction_for_dock(
    b: &Bounds,
    p: (f64, f64),
    locked: bool,
    hover_hide: bool,
    dragging: bool,
    was_faded: bool,
    layout: &str,
    dock_side: i8,
) -> Interaction {
    if layout == "bubble" || layout == "bubble-bar" {
        let scale = b.scale.max(0.1);
        let x = (p.0 - b.x) / scale;
        let y = (p.1 - b.y) / scale;
        let body = if layout == "bubble" { 116. } else { 64. };
        let grip = inside(x, y, 0., 8., 16., body - 8.);
        let near = inside(x, y, 16., -12., b.width / scale + 12., body + 8.);
        return Interaction {
            faded: locked && hover_hide && !dragging && near,
            dragging,
            grip_active: grip,
            ignore_cursor: locked && !dragging && !grip,
            native_drag: dragging
                || grip
                || (!locked && inside(x, y, 0., 0., b.width / scale, body)),
            dock_side: 0,
            avatar_right: false,
        };
    }
    if layout == "avatar" {
        let scale = b.scale.max(0.1);
        let mut x = (p.0 - b.x) / scale;
        if dock_side == 1 {
            x = b.width / scale - x;
        }
        let y = (p.1 - b.y) / scale;
        // 112px circle starts at (6,8); transparent corners are pass-through.
        let distance = ((x - 62.).powi(2) + (y - 64.).powi(2)).sqrt();
        let grip = distance <= 56.;
        let near = inside(
            x,
            y,
            118.,
            0.,
            280. + if was_faded { 28. } else { 12. },
            b.height / scale,
        );
        return Interaction {
            faded: locked && hover_hide && !dragging && near && distance > 68.,
            dragging,
            grip_active: grip,
            ignore_cursor: locked && !dragging && !grip,
            native_drag: dragging
                || grip
                || (!locked && inside(x, y, 0., 0., 280., (b.height / scale - 40.).max(128.))),
            dock_side,
            avatar_right: dock_side == 1,
        };
    }
    let (x, y) = (p.0 - b.x, p.1 - b.y);
    let scale = b.scale.max(0.1);
    let grip = inside(x, y, 0., 0., 44. * scale, 64. * scale);
    // Keep the approach to the handle visible, even after the body has faded.
    let handle_approach = inside(
        x,
        y,
        -12. * scale,
        -12. * scale,
        44. * scale,
        64. * scale + 12. * scale,
    );
    let margin = if was_faded { 28. } else { 12. } * scale;
    let near = inside(x, y, -margin, -margin, b.width + margin, b.height + margin);
    Interaction {
        faded: locked && hover_hide && !dragging && near && !handle_approach,
        dragging,
        grip_active: grip,
        ignore_cursor: locked && !dragging && !grip,
        native_drag: dragging
            || grip
            || (!locked
                && inside(
                    x,
                    y,
                    0.,
                    0.,
                    b.width,
                    (b.height - 40. * scale).max(64. * scale),
                )),
        dock_side: 0,
        avatar_right: false,
    }
}
#[derive(Default)]
pub struct TapGesture {
    start: Option<((f64, f64), (f64, f64), u64, f64)>,
    moved: bool,
}
impl TapGesture {
    pub fn begin(
        &mut self,
        eligible: bool,
        p: (f64, f64),
        origin: (f64, f64),
        at: u64,
        scale: f64,
    ) {
        self.start = eligible.then_some((p, origin, at, scale.max(0.1)));
        self.moved = false;
    }
    pub fn observe(&mut self, p: (f64, f64), origin: (f64, f64)) {
        if let Some((a, b, _, scale)) = self.start {
            self.moved |= (p.0 - a.0).hypot(p.1 - a.1) > 4. * scale
                || (origin.0 - b.0).hypot(origin.1 - b.1) > 4. * scale;
        }
    }
    pub fn release(&mut self, eligible: bool, p: (f64, f64), origin: (f64, f64), at: u64) -> bool {
        self.observe(p, origin);
        self.start.take().is_some_and(|(_, _, start, _)| {
            eligible && !self.moved && at.saturating_sub(start) <= 700
        })
    }
    pub fn reset(&mut self) {
        self.start = None;
        self.moved = false;
    }
}
// An event serial is shared by the local mouse hook and polling recovery.
// Both may observe the same release; only one can consume the gesture.
#[derive(Default)]
pub struct TapTracker {
    gesture: TapGesture,
    serial: u64,
}
impl TapTracker {
    pub fn begin(
        &mut self,
        eligible: bool,
        p: (f64, f64),
        origin: (f64, f64),
        at: u64,
        scale: f64,
    ) {
        self.serial = self.serial.saturating_add(1);
        self.gesture.begin(eligible, p, origin, at, scale);
    }
    pub fn observe(&mut self, p: (f64, f64), origin: (f64, f64)) {
        self.gesture.observe(p, origin);
    }
    pub fn release(
        &mut self,
        eligible: bool,
        p: (f64, f64),
        origin: (f64, f64),
        at: u64,
    ) -> Option<u64> {
        self.gesture
            .release(eligible, p, origin, at)
            .then_some(self.serial)
    }
    pub fn reset(&mut self) {
        self.gesture.reset();
    }
}
#[cfg(target_os = "macos")]
#[derive(Clone, Copy)]
pub enum MousePhase {
    Down,
    Move,
    Up,
}
#[cfg(target_os = "macos")]
thread_local! { static TAP_MONITORS:std::cell::RefCell<std::collections::HashMap<String,objc2::rc::Retained<objc2::runtime::AnyObject>>>=std::cell::RefCell::new(std::collections::HashMap::new()); }
pub fn remove_tap_monitor(label: &str) {
    #[cfg(target_os = "macos")]
    TAP_MONITORS.with(|slot| {
        if let Some(token) = slot.borrow_mut().remove(label) {
            unsafe {
                objc2_app_kit::NSEvent::removeMonitor(&token);
            }
        }
    });
}
#[cfg(target_os = "macos")]
pub fn install_tap_monitor(
    window: &tauri::WebviewWindow,
    on_event: impl Fn(MousePhase, (f64, f64), (f64, f64), f64) + 'static,
) -> Result<(), String> {
    use objc2::{rc::Retained, MainThreadMarker};
    use objc2_app_kit::{NSEvent, NSEventMask, NSEventType};
    use std::ptr::NonNull;
    remove_tap_monitor(window.label());
    let raw = window.ns_window().map_err(|e| e.to_string())? as usize;
    let w = window.clone();
    let block = block2::RcBlock::new(move |pointer: NonNull<NSEvent>| -> *mut NSEvent {
        // AppKit invokes a local event monitor on the main thread; we neither
        // consume nor alter the event, and only inspect our own overlay window.
        let event = unsafe { pointer.as_ref() };
        let Some(mtm) = MainThreadMarker::new() else {
            return pointer.as_ptr();
        };
        let Some(ns) = event.window(mtm) else {
            return pointer.as_ptr();
        };
        if Retained::as_ptr(&ns) as usize != raw {
            return pointer.as_ptr();
        }
        let phase = match event.r#type() {
            NSEventType::LeftMouseDown => MousePhase::Down,
            NSEventType::LeftMouseDragged => MousePhase::Move,
            NSEventType::LeftMouseUp => MousePhase::Up,
            _ => return pointer.as_ptr(),
        };
        if let (Ok(origin), Ok(scale)) = (w.outer_position(), w.scale_factor()) {
            let local = event.locationInWindow();
            let height = ns.frame().size.height;
            let origin = (f64::from(origin.x), f64::from(origin.y));
            let point = (
                origin.0 + local.x * scale,
                origin.1 + (height - local.y) * scale,
            );
            on_event(phase, point, origin, scale);
        }
        pointer.as_ptr()
    });
    let token = unsafe {
        NSEvent::addLocalMonitorForEventsMatchingMask_handler(
            NSEventMask::LeftMouseDown | NSEventMask::LeftMouseUp | NSEventMask::LeftMouseDragged,
            &block,
        )
    }
    .ok_or("无法注册头像本地点击监听")?;
    TAP_MONITORS.with(|slot| slot.borrow_mut().insert(window.label().into(), token));
    Ok(())
}
// Tao's macOS NSWindow subclass performs native dragging on the original
// mouse-down when this flag is set, before WKWebView consumes that event.
#[cfg(target_os = "macos")]
pub fn native_drag_region(window: &tauri::WebviewWindow, enabled: bool) {
    let w = window.clone();
    let _ = window.run_on_main_thread(move || {
        if let Ok(raw) = w.ns_window() {
            // The closure runs on AppKit's main thread and keeps the window alive.
            if let Some(ns) = unsafe { (raw as *const objc2_app_kit::NSWindow).as_ref() } {
                ns.setMovableByWindowBackground(enabled);
            }
        }
    });
}
#[cfg(not(target_os = "macos"))]
pub fn native_drag_region(_window: &tauri::WebviewWindow, _enabled: bool) {}
#[cfg(target_os = "macos")]
pub fn primary_button_down() -> bool {
    objc2_app_kit::NSEvent::pressedMouseButtons() & 1 != 0
}
#[cfg(target_os = "windows")]
pub fn primary_button_down() -> bool {
    // GetAsyncKeyState reports physical buttons. Resolve the logical primary
    // button on every poll so left-handed mapping changes also take effect.
    // The low "pressed since last call" bit is unreliable; only high means held.
    #[link(name = "user32")]
    extern "system" {
        fn GetAsyncKeyState(key: i32) -> i16;
        fn GetSystemMetrics(index: i32) -> i32;
    }
    unsafe {
        let key = if GetSystemMetrics(23) != 0 { 0x02 } else { 0x01 }; // SM_SWAPBUTTON
        GetAsyncKeyState(key) < 0
    }
}
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn primary_button_down() -> bool {
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn group_grows_without_enlarging_avatar_hit_area_and_keeps_body_pass_through() {
        let (width, height) = group_dimensions("avatar", true, 4, "separate");
        assert_eq!((width, height), (280., 344.));
        assert_eq!(
            group_dimensions("avatar", true, 1, "combined"),
            (280., 128.)
        );
        let b = Bounds {
            x: 0.,
            y: 0.,
            width,
            height,
            scale: 1.,
        };
        let below = interaction_for_dock(&b, (62., 220.), true, true, false, false, "avatar", 0);
        assert!(!below.grip_active && below.ignore_cursor);
        let body = interaction_for_dock(&b, (200., 220.), true, true, false, false, "avatar", 0);
        assert!(body.faded && body.ignore_cursor);
        let edit = interaction_for_dock(&b, (200., 220.), false, true, false, false, "avatar", 0);
        assert!(edit.native_drag && !edit.ignore_cursor);
    }
    #[test]
    fn stationary_geometry_is_coalesced_without_delaying_input_or_settings() {
        let frame = PointerFrame {
            point: (100., 200.),
            down: false,
            locked: true,
            settings_revision: 1,
            geometry_revision: 2,
        };
        let mut refresh = GeometryRefresh::default();
        assert!(refresh.due(1000, frame));
        refresh.record(1000, frame);
        assert!(!refresh.due(1199, frame));
        assert!(refresh.due(1200, frame)); // OS-side relocation still gets checked.
        for changed in [
            PointerFrame {
                point: (101., 200.),
                ..frame
            },
            PointerFrame {
                down: true,
                ..frame
            },
            PointerFrame {
                locked: false,
                ..frame
            },
            PointerFrame {
                settings_revision: 2,
                ..frame
            },
            PointerFrame {
                geometry_revision: 3,
                ..frame
            },
        ] {
            assert!(refresh.due(1001, changed));
        }
        refresh.record(
            1002,
            PointerFrame {
                down: true,
                ..frame
            },
        );
        assert!(refresh.due(1003, frame)); // Release is never swallowed.
        refresh.record(
            1004,
            PointerFrame {
                locked: false,
                ..frame
            },
        );
        assert!(refresh.due(
            1005,
            PointerFrame {
                locked: false,
                ..frame
            }
        ));
        refresh.clear();
        assert!(refresh.due(1006, frame));
    }
    #[test]
    fn companions_have_a_drag_handle_and_edit_footer_but_no_avatar_hit_target() {
        let b = Bounds {
            x: 0.,
            y: 0.,
            width: 192.,
            height: 156.,
            scale: 1.,
        };
        let hit = |point, locked| {
            interaction_for_dock(&b, point, locked, true, false, false, "bubble", 0)
        };
        assert!(hit((8., 40.), true).grip_active);
        assert!(hit((80., 40.), true).ignore_cursor);
        assert!(!hit((80., 140.), false).native_drag);
        assert!(hit((80., 40.), false).native_drag);
        assert_eq!(dimensions("bubble", false), (192., 156.));
    }
    #[test]
    fn avatar_docking_preserves_drag_anchor_and_ignores_transparent_body() {
        for scale in [1., 2.] {
            let width = (280. * scale) as u32;
            let screen = (-1000, (1920. * scale) as u32);
            let end = screen.0 + screen.1 as i32;
            let at = |x: f64| screen.0 + (x * scale).round() as i32;
            // The transparent window reaches the right edge while the avatar
            // is still 156 logical pixels away: do not snap or flip early.
            assert_eq!(
                snap_avatar(
                    (end - width as i32, 200),
                    width,
                    screen,
                    scale,
                    false,
                    false
                ),
                ((end - width as i32, 200), false)
            );
            // Left-aligned avatar arrives at the right edge. Layout and window
            // origin change together, leaving the avatar center under the cursor.
            let p = (at(1920. - 124.), 200);
            let (target, right) = snap_avatar(p, width, screen, scale, false, false);
            assert!(right);
            assert_eq!(target.0, end - width as i32);
            assert_eq!(
                f64::from(p.0) + 62. * scale,
                f64::from(target.0) + 218. * scale
            );
            // Drag away from the right; neither position nor orientation changes.
            let p = (at(700.), 200);
            assert_eq!(snap_avatar(p, width, screen, scale, true, true), (p, true));
            assert_eq!(snap_avatar(p, width, screen, scale, true, false), (p, true));
            // Arrive at the opposite edge with a right-aligned avatar. Switching
            // to left layout must preserve the avatar center in both scales.
            let p = (at(-156.), 200);
            assert_eq!(snap_avatar(p, width, screen, scale, true, true), (p, true));
            let (target, right) = snap_avatar(p, width, screen, scale, true, false);
            assert!(!right);
            assert_eq!(target.0, screen.0);
            assert_eq!(
                f64::from(p.0) + 218. * scale,
                f64::from(target.0) + 62. * scale
            );
            assert_eq!(
                snap_avatar(target, width, screen, scale, false, false),
                (target, false)
            );
            // Threshold is measured from the avatar, independent of the body.
            let p = (at(1920. - 124. - 25.), 200);
            assert_eq!(
                snap_avatar(p, width, screen, scale, false, false),
                (p, false)
            );
            assert!(
                snap_avatar(
                    (p.0 + 2 * (scale as i32), p.1),
                    width,
                    screen,
                    scale,
                    false,
                    false
                )
                .1
            );
        }
    }
    #[test]
    fn docking_snaps_only_close_edges_and_mirrors_the_avatar_hit_target() {
        for scale in [1., 2.] {
            let width = (280. * scale) as u32;
            let screen = (-1440, (1440. * scale) as u32);
            assert_eq!(snap_edges((-1430, 150), width, screen, scale), (-1440, 150));
            let right = screen.0 + screen.1 as i32 - width as i32;
            assert_eq!(
                snap_edges((right - 10, 150), width, screen, scale),
                (right, 150)
            );
            assert_eq!(dock_side(right, width, screen), 1);
            assert_eq!(dock_side(-1440, width, screen), -1);
            assert_eq!(snap_edges((-1000, 150), width, screen, scale), (-1000, 150));
            let b = Bounds {
                x: 100.,
                y: 200.,
                width: 280. * scale,
                height: 128. * scale,
                scale,
            };
            let face = interaction_for_dock(
                &b,
                (100. + 218. * scale, 200. + 64. * scale),
                true,
                true,
                false,
                false,
                "avatar",
                1,
            );
            assert!(face.grip_active && !face.ignore_cursor && !face.faded);
            let bubble = interaction_for_dock(
                &b,
                (100. + 60. * scale, 200. + 64. * scale),
                true,
                true,
                false,
                false,
                "avatar",
                1,
            );
            assert!(!bubble.grip_active && bubble.ignore_cursor && bubble.faded);
            let footer = interaction_for_dock(
                &b,
                (100. + 60. * scale, 200. + 145. * scale),
                false,
                true,
                false,
                false,
                "avatar",
                1,
            );
            assert!(!footer.native_drag && !footer.ignore_cursor);
        }
    }
    fn b(scale: f64) -> Bounds {
        Bounds {
            x: 100.,
            y: 200.,
            width: 272. * scale,
            height: 64. * scale,
            scale,
        }
    }
    #[test]
    fn fast_event_pairs_are_not_lost_or_double_consumed_by_polling() {
        let mut t = TapTracker::default();
        t.begin(true, (10., 10.), (100., 100.), 0, 1.);
        assert_eq!(t.release(true, (10., 10.), (100., 100.), 5), Some(1));
        assert_eq!(t.release(true, (10., 10.), (100., 100.), 24), None);
        t.begin(true, (10., 10.), (100., 100.), 30, 1.);
        assert_eq!(t.release(true, (10., 10.), (100., 100.), 35), Some(2));
        t.begin(true, (10., 10.), (100., 100.), 40, 1.);
        t.observe((20., 10.), (110., 100.));
        assert_eq!(t.release(true, (10., 10.), (100., 100.), 45), None);
        t.reset();
        assert_eq!(t.release(true, (10., 10.), (100., 100.), 48), None);
    }
    #[test]
    fn tap_is_not_drag_long_press_outside_or_return_trip() {
        let mut t = TapGesture::default();
        t.begin(true, (10., 10.), (100., 100.), 0, 2.);
        assert!(t.release(true, (12., 11.), (100., 100.), 100));
        t.begin(true, (10., 10.), (100., 100.), 0, 2.);
        t.observe((30., 10.), (120., 100.));
        assert!(!t.release(true, (10., 10.), (100., 100.), 200));
        t.begin(true, (10., 10.), (100., 100.), 0, 1.);
        assert!(!t.release(true, (10., 10.), (100., 100.), 701));
        t.begin(false, (10., 10.), (100., 100.), 0, 1.);
        assert!(!t.release(true, (10., 10.), (100., 100.), 100));
        t.begin(true, (10., 10.), (100., 100.), 0, 1.);
        assert!(!t.release(false, (10., 10.), (100., 100.), 100));
        t.begin(true, (10., 10.), (100., 100.), 0, 1.);
        assert!(!t.release(true, (10., 10.), (120., 100.), 100));
        t.begin(true, (10., 10.), (100., 100.), 0, 1.);
        t.reset();
        assert!(!t.release(true, (10., 10.), (100., 100.), 100));
    }
    #[test]
    fn avatar_hidpi_circle_and_footer_respect_pointer_policy() {
        for scale in [1., 2.] {
            let b = Bounds {
                x: 100.,
                y: 200.,
                width: 280. * scale,
                height: 168. * scale,
                scale,
            };
            let check = |x: f64, y: f64, locked: bool| {
                interaction_for_layout(
                    &b,
                    (100. + x * scale, 200. + y * scale),
                    locked,
                    true,
                    false,
                    false,
                    "avatar",
                )
            };
            let face = check(62., 64., true);
            assert!(face.grip_active && face.native_drag && !face.ignore_cursor && !face.faded);
            let bubble = check(200., 64., true);
            assert!(!bubble.grip_active && bubble.ignore_cursor && bubble.faded);
            let corner = check(7., 9., true);
            assert!(corner.ignore_cursor && !corner.grip_active);
            let footer = check(250., 145., false);
            assert!(!footer.native_drag && !footer.ignore_cursor && !footer.faded);
        }
        assert_eq!(dimensions("avatar", false), (280., 168.));
        assert_eq!(dimensions("avatar", true), (280., 128.));
        assert_eq!(dimensions("bar", false), (272., 104.));
        assert_eq!(dimensions("bar", true), (272., 64.));
    }
    #[test]
    fn resizing_clamps_to_screens_including_negative_coordinates() {
        assert_eq!(
            clamp_position((1800, 1000), (700, 256), (0, 0, 2000, 1200)),
            (1300, 944)
        );
        assert_eq!(
            clamp_position((-20, 0), (350, 168), (-1440, -300, 1440, 900)),
            (-350, 0)
        );
        assert_eq!(
            clamp_position((50, 50), (3000, 2000), (0, 0, 1440, 900)),
            (0, 0)
        );
    }
    #[test]
    fn locked_handle_is_interactive_while_body_is_pass_through() {
        let grip = interaction(&b(1.), (120., 220.), true, true, false, false);
        assert!(grip.grip_active && !grip.ignore_cursor && !grip.faded);
        let body = interaction(&b(1.), (230., 220.), true, true, false, false);
        assert!(body.ignore_cursor && body.faded);
    }
    #[test]
    fn editing_and_dragging_never_disappear() {
        for (locked, dragging) in [(false, false), (true, true)] {
            let i = interaction(&b(1.), (230., 220.), locked, true, dragging, true);
            assert!(!i.faded && !i.ignore_cursor);
        }
    }
    #[test]
    fn edit_lock_button_is_not_a_native_drag_region() {
        assert!(!interaction(&b(1.), (300., 280.), false, true, false, false).native_drag);
        assert!(interaction(&b(1.), (250., 230.), false, true, false, false).native_drag);
    }
    #[test]
    fn hidpi_handle_and_fade_use_one_coordinate_space() {
        let i = interaction(&b(2.), (180., 250.), true, true, false, false);
        assert!(i.grip_active && !i.faded);
        let i = interaction(&b(2.), (220., 250.), true, true, false, false);
        assert!(i.faded && i.ignore_cursor);
    }
    #[test]
    fn fade_has_hysteresis_and_handle_can_recover_it() {
        assert!(!interaction(&b(1.), (386., 220.), true, true, false, false).faded);
        assert!(interaction(&b(1.), (386., 220.), true, true, false, true).faded);
        assert!(!interaction(&b(1.), (410., 220.), true, true, false, true).faded);
        assert!(!interaction(&b(1.), (120., 220.), true, true, false, true).faded);
        assert!(!interaction(&b(1.), (250., 220.), true, false, false, true).faded);
    }
}

#[cfg(test)]
mod pointer_drag_tests {
    use super::PointerDrag;
    #[test]
    fn physical_coordinates_do_not_accumulate_scale_or_window_motion() {
        let mut drag = PointerDrag::default();
        drag.begin((1050., 900.), (-1200, 250));
        assert_eq!(drag.update((1080., 945.), true), Some((-1170, 295)));
        assert_eq!(drag.update((1110., 960.), true), Some((-1140, 310)));
        assert_eq!(drag.update((1050., 900.), true), Some((-1200, 250)));
    }
    #[test]
    fn release_and_cancel_prevent_stale_motion_and_allow_a_new_drag() {
        let mut drag = PointerDrag::default();
        drag.begin((50., 60.), (100, 200));
        assert_eq!(drag.update((80., 90.), false), None);
        assert_eq!(drag.update((90., 100.), true), None);
        drag.begin((90., 100.), (400, 300));
        assert_eq!(drag.update((100., 120.), true), Some((410, 320)));
        drag.cancel();
        assert_eq!(drag.update((110., 140.), true), None);
    }
}
