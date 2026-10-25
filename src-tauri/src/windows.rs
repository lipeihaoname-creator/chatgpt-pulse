//! Attached Work bubbles. Selection never controls which tasks are visible.
use crate::{
    data::{Sample, Settings},
    Pulse,
};
use tauri::Manager;

pub fn visible(sample: &Sample, now: i64) -> Vec<String> {
    if sample.state == "paused" || sample.source == "demo" {
        return vec![];
    }
    sample
        .sessions
        .iter()
        .filter(|s| {
            s.unfinished()
                || s.completion
                    .as_ref()
                    .is_some_and(|c| (0..12_000).contains(&now.saturating_sub(c.ended_at)))
        })
        .filter_map(|s| s.log_id.clone())
        .collect()
}
pub fn choose_primary(
    sample: &Sample,
    current: Option<&str>,
    now: i64,
    editing: bool,
) -> Option<String> {
    // Keep the edited window attached to its task until Save/Cancel, even when
    // the 12-second completion card expires in the middle of a drag.
    if editing && sample.state != "paused" && sample.source != "demo" {
        if let Some(id) = current.filter(|id| {
            sample
                .sessions
                .iter()
                .any(|s| s.log_id.as_deref() == Some(*id))
        }) {
            return Some(id.to_owned());
        }
    }
    let ids = visible(sample, now);
    current
        .filter(|id| ids.iter().any(|a| a == id))
        .map(str::to_owned)
        .or_else(|| {
            sample
                .log_id
                .as_ref()
                .filter(|id| ids.contains(id))
                .cloned()
        })
        .or_else(|| ids.into_iter().next())
}
pub fn project(root: &Sample, id: &str) -> Sample {
    let mut sample = root
        .sessions
        .iter()
        .find(|s| s.log_id.as_deref() == Some(id))
        .cloned()
        .or_else(|| (root.log_id.as_deref() == Some(id)).then(|| root.clone()))
        .unwrap_or_else(|| Sample {
            log_id: Some(id.into()),
            state: "unavailable".into(),
            message: "该工作会话当前没有可用数据".into(),
            ..Sample::default()
        });
    sample.overlay_log_id = root.overlay_log_id.clone();
    sample.sessions.clear();
    sample.monitored_sessions = 0;
    sample.checked_at = root.checked_at;
    sample.poll_sequence = root.poll_sequence;
    sample.stream_epoch = root.stream_epoch;
    sample.timestamp = root.timestamp;
    sample.session_label = None;
    sample
}
/// A single native surface keeps every bubble rigidly attached to its character.
/// Only currently visible task metadata is delivered to this surface.
pub fn group_frame(root: &Sample, now: i64) -> Sample {
    let mut frame = root
        .overlay_log_id
        .as_deref()
        .map(|id| project(root, id))
        .unwrap_or_else(|| {
            let mut frame = root.clone();
            frame.sessions.clear();
            frame.monitored_sessions = 0;
            frame
        });
    let mut ids = visible(root, now);
    ids.sort();
    frame.sessions = ids
        .iter()
        .filter(|id| Some(*id) != frame.log_id.as_ref())
        .map(|id| project(root, id))
        .collect();
    frame.monitored_sessions = frame.sessions.len() + usize::from(frame.log_id.is_some());
    frame
}

pub fn group_dimensions(sample: &Sample, settings: &Settings) -> (f64, f64) {
    let count = group_frame(sample, crate::data::now()).sessions.len() + 1;
    let (width, height) = crate::overlay::group_dimensions(
        &settings.overlay_layout,
        settings.locked,
        count,
        &settings.task_display,
    );
    let frame = group_frame(sample, crate::data::now());
    let named = std::iter::once(&frame)
        .chain(frame.sessions.iter())
        .filter(|s| {
            s.log_id
                .as_ref()
                .is_some_and(|id| settings.task_names.contains_key(id))
        })
        .count();
    (
        width,
        height + if count > 1 { named as f64 * 12. } else { 0. },
    )
}

/// Called only on the main thread, with no application locks held by caller.
pub fn sync(app: &tauri::AppHandle, sample: &Sample, settings: &Settings) {
    let state = app.state::<Pulse>();
    // Clean up any legacy per-task windows. Saved old positions remain harmless
    // for downgrade compatibility but never control the attached group.
    let old = state
        .task_windows
        .lock()
        .unwrap()
        .keys()
        .cloned()
        .collect::<Vec<_>>();
    for key in old {
        crate::overlay::remove_tap_monitor(&key);
        if let Some(w) = app.get_webview_window(&key) {
            let _ = w.destroy();
        }
    }
    state.task_windows.lock().unwrap().clear();
    state.task_ids.lock().unwrap().clear();
    let Some(w) = app.get_webview_window("overlay") else {
        return;
    };
    let (width, mut height) = group_dimensions(sample, settings);
    if let Ok(Some(m)) = w.current_monitor() {
        height = height.min(f64::from(m.size().height) / m.scale_factor());
    }
    if w.inner_size()
        .ok()
        .zip(w.scale_factor().ok())
        .is_some_and(|(size, scale)| {
            (f64::from(size.width) / scale - width).abs() > 0.5
                || (f64::from(size.height) / scale - height).abs() > 0.5
        })
    {
        let _ = w.set_size(tauri::LogicalSize::new(width, height));
        if let (Ok(p), Ok(scale), Ok(Some(m))) =
            (w.outer_position(), w.scale_factor(), w.current_monitor())
        {
            let a = m.position();
            let size = m.size();
            let (x, y) = crate::overlay::clamp_position(
                (p.x, p.y),
                ((width * scale) as u32, (height * scale) as u32),
                (a.x, a.y, size.width, size.height),
            );
            if (x, y) != (p.x, p.y) {
                let _ = w.set_position(tauri::PhysicalPosition::new(x, y));
            }
        }
    }
    let _ = w.set_focusable(!settings.locked);
    if settings.overlay_enabled {
        if !w.is_visible().unwrap_or(false) {
            let _ = w.set_ignore_cursor_events(settings.locked);
            let _ = w.show();
        }
    } else {
        let _ = w.hide();
    }
    state
        .floating
        .overlay_revision
        .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    crate::write_test_probe(
        app,
        "windows",
        serde_json::json!({"primary":sample.overlay_log_id,"tasks":{},"group":visible(sample, crate::data::now()),"display":settings.task_display,"root_visible":w.is_visible().unwrap_or(false)}),
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn group_contains_only_live_or_recent_tasks_with_primary_stable_and_no_display_ids() {
        let mut root = Sample {
            state: "running".into(),
            overlay_log_id: Some("b".into()),
            ..Sample::default()
        };
        for (id, state, count) in [
            ("b", "running", 20),
            ("old", "completed", 900),
            ("a", "running", 40),
            ("c", "running", 60),
        ] {
            root.sessions.push(Sample {
                log_id: Some(id.into()),
                state: state.into(),
                output_tokens: Some(count),
                ..Sample::default()
            });
        }
        let frame = group_frame(&root, 1000);
        assert_eq!(frame.log_id.as_deref(), Some("b"));
        assert_eq!(frame.output_tokens, Some(20));
        assert_eq!(
            frame
                .sessions
                .iter()
                .map(|s| s.log_id.as_deref().unwrap())
                .collect::<Vec<_>>(),
            vec!["a", "c"]
        );
        assert!(frame.session_label.is_none());
        assert!(frame
            .sessions
            .iter()
            .all(|s| s.session_label.is_none() && s.sessions.is_empty()));
        root.sessions.reverse();
        assert_eq!(
            group_frame(&root, 1000).sessions[0].log_id.as_deref(),
            Some("a")
        );
        root.state = "paused".into();
        root.overlay_log_id = None;
        assert!(group_frame(&root, 1000).sessions.is_empty());
    }
    #[test]
    fn unreadable_open_task_keeps_its_bubble_and_shared_character() {
        let interrupted = Sample {
            state: "unavailable".into(),
            task_unfinished: true,
            log_id: Some("a".into()),
            ..Sample::default()
        };
        let mut root = Sample {
            state: "running".into(),
            log_id: Some("b".into()),
            sessions: vec![
                interrupted,
                Sample {
                    state: "running".into(),
                    log_id: Some("b".into()),
                    ..Sample::default()
                },
            ],
            ..Sample::default()
        };
        assert_eq!(visible(&root, 1000), vec!["a", "b"]);
        assert_eq!(
            choose_primary(&root, Some("a"), 1000, false).as_deref(),
            Some("a")
        );
        assert!(project(&root, "a").current_rate.is_none());
        root.sessions[0].task_unfinished = false;
        assert_eq!(visible(&root, 1000), vec!["b"]);
        root.sessions[0].state = "loading".into();
        root.sessions[0].task_unfinished = true;
        assert_eq!(visible(&root, 1000), vec!["b"]);
    }
    #[test]
    fn shared_character_stays_with_its_work_until_that_bubble_expires() {
        let mut root = Sample {
            state: "running".into(),
            log_id: Some("b".into()),
            sessions: vec![
                Sample {
                    state: "running".into(),
                    log_id: Some("a".into()),
                    ..Sample::default()
                },
                Sample {
                    state: "running".into(),
                    log_id: Some("b".into()),
                    ..Sample::default()
                },
            ],
            ..Sample::default()
        };
        assert_eq!(
            choose_primary(&root, Some("a"), 1000, false).as_deref(),
            Some("a")
        );
        root.sessions.remove(0);
        assert_eq!(
            choose_primary(&root, Some("a"), 1000, false).as_deref(),
            Some("b")
        );
        root.state = "paused".into();
        assert_eq!(choose_primary(&root, Some("b"), 1000, false), None);
    }
    #[test]
    fn editing_does_not_promote_a_companion_over_the_window_being_edited() {
        let mut root = Sample {
            state: "running".into(),
            log_id: Some("b".into()),
            sessions: vec![
                Sample {
                    state: "completed".into(),
                    log_id: Some("a".into()),
                    ..Sample::default()
                },
                Sample {
                    state: "running".into(),
                    log_id: Some("b".into()),
                    ..Sample::default()
                },
            ],
            ..Sample::default()
        };
        assert_eq!(
            choose_primary(&root, Some("a"), 20000, true).as_deref(),
            Some("a")
        );
        assert_eq!(
            choose_primary(&root, Some("a"), 20000, false).as_deref(),
            Some("b")
        );
        root.state = "paused".into();
        assert_eq!(choose_primary(&root, Some("a"), 20000, true), None);
    }
    #[test]
    fn independent_projection_does_not_follow_the_selected_detail() {
        let a = Sample {
            log_id: Some("a.jsonl".into()),
            output_tokens: Some(30),
            state: "running".into(),
            ..Sample::default()
        };
        let b = Sample {
            log_id: Some("b.jsonl".into()),
            output_tokens: Some(70),
            state: "running".into(),
            ..Sample::default()
        };
        let root = Sample {
            sessions: vec![a, b.clone()],
            log_id: b.log_id.clone(),
            state: "running".into(),
            poll_sequence: 10,
            checked_at: Some(50),
            ..Sample::default()
        };
        assert_eq!(project(&root, "a.jsonl").output_tokens, Some(30));
        assert_eq!(project(&root, "b.jsonl").output_tokens, Some(70));
        assert!(project(&root, "missing").output_tokens.is_none());
        assert_eq!(project(&root, "a.jsonl").poll_sequence, 10);
        assert_eq!(visible(&root, 100).len(), 2);
    }
    #[test]
    fn recent_completion_and_running_have_bubbles_but_pause_does_not() {
        let mut s = Sample {
            state: "running".into(),
            ..Sample::default()
        };
        s.sessions.push(Sample {
            log_id: Some("a".into()),
            state: "completed".into(),
            completion: Some(crate::data::CompletionCard {
                id: "t".into(),
                ended_at: 1000,
                output_tokens: None,
                duration: None,
                average_rate: None,
                reason: "completed",
            }),
            ..Sample::default()
        });
        assert_eq!(visible(&s, 2000), vec!["a"]);
        assert!(visible(&s, 14000).is_empty());
        s.state = "paused".into();
        assert!(visible(&s, 2000).is_empty());
    }
}
