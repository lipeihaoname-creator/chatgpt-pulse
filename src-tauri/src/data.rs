use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

pub fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct OverlayPosition {
    pub x: i32,
    pub y: i32,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct AvatarCrop {
    pub x: f64,
    pub y: f64,
    pub zoom: f64,
}
impl Default for AvatarCrop {
    fn default() -> Self {
        Self {
            x: 50.,
            y: 50.,
            zoom: 1.,
        }
    }
}
impl AvatarCrop {
    fn validated(mut self) -> Self {
        self.x = if self.x.is_finite() {
            self.x.clamp(0., 100.)
        } else {
            50.
        };
        self.y = if self.y.is_finite() {
            self.y.clamp(0., 100.)
        } else {
            50.
        };
        self.zoom = if self.zoom.is_finite() {
            self.zoom.clamp(1., 3.)
        } else {
            1.
        };
        self
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    pub revision: u64,
    pub overlay_position: Option<OverlayPosition>,
    pub task_positions: std::collections::BTreeMap<String, OverlayPosition>,
    pub auto_monitor: bool,
    pub follow_latest: bool,
    pub pinned_log: Option<String>,
    pub tray_enabled: bool,
    pub overlay_enabled: bool,
    pub locked: bool,
    pub hover_hide: bool,
    pub keep_history: bool,
    pub retention_days: u32,
    pub interval_ms: u64,
    pub rate_idle_seconds: u32,
    pub adaptive_retention: bool,
    pub completion_card: bool,
    pub overlay_layout: String,
    pub theme: String,
    pub character: String,
    pub motion: String,
    pub animations: bool,
    pub dialogue_enabled: bool,
    pub show_total: bool,
    pub bubble_mode: String,
    pub task_display: String,
    pub task_names: std::collections::BTreeMap<String, String>,
    pub status_accessories: bool,
    pub avatar_revision: u64,
    pub state_avatar_revision: u64,
    pub avatar_crop: AvatarCrop,
    pub state_avatar_crops: std::collections::BTreeMap<String, AvatarCrop>,
    pub state_avatars_enabled: bool,
    pub edge_snap: bool,
    pub idle_collapse: bool,
    pub completion_scene: bool,
    pub do_not_disturb: bool,
    pub idle_chat: bool,
    pub idle_motions: bool,
    pub idle_frequency: String,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            revision: 0,
            overlay_position: None,
            task_positions: Default::default(),
            auto_monitor: true,
            follow_latest: true,
            pinned_log: None,
            tray_enabled: true,
            overlay_enabled: false,
            locked: true,
            hover_hide: true,
            keep_history: false,
            retention_days: 7,
            interval_ms: 1000,
            rate_idle_seconds: 30,
            adaptive_retention: true,
            completion_card: true,
            overlay_layout: "bar".into(),
            theme: "mint".into(),
            character: "mai".into(),
            motion: "spark".into(),
            animations: true,
            dialogue_enabled: true,
            show_total: false,
            bubble_mode: "always".into(),
            task_display: "separate".into(),
            task_names: Default::default(),
            status_accessories: true,
            avatar_revision: 0,
            state_avatar_revision: 0,
            avatar_crop: AvatarCrop::default(),
            state_avatar_crops: Default::default(),
            state_avatars_enabled: true,
            edge_snap: true,
            idle_collapse: true,
            completion_scene: true,
            do_not_disturb: false,
            idle_chat: true,
            idle_motions: true,
            idle_frequency: "balanced".into(),
        }
    }
}
impl Settings {
    // A preference update cannot write stale position or transient editing state.
    pub fn patch(
        &self,
        key: &str,
        value: serde_json::Value,
        pin: Option<String>,
    ) -> Result<Self, String> {
        if !matches!(
            key,
            "auto_monitor"
                | "follow_latest"
                | "tray_enabled"
                | "overlay_enabled"
                | "hover_hide"
                | "keep_history"
                | "retention_days"
                | "interval_ms"
                | "rate_idle_seconds"
                | "adaptive_retention"
                | "completion_card"
                | "overlay_layout"
                | "theme"
                | "character"
                | "motion"
                | "dialogue_enabled"
                | "animations"
                | "show_total"
                | "bubble_mode"
                | "task_display"
                | "task_names"
                | "status_accessories"
                | "avatar_crop"
                | "state_avatar_crops"
                | "state_avatars_enabled"
                | "edge_snap"
                | "idle_collapse"
                | "completion_scene"
                | "do_not_disturb"
                | "idle_chat"
                | "idle_motions"
                | "idle_frequency"
        ) {
            return Err("无法修改此设置".into());
        }
        let mut object = serde_json::to_value(self).map_err(|_| "设置无法编码")?;
        object[key] = value;
        let mut next: Self = serde_json::from_value(object).map_err(|_| "设置值类型无效")?;
        if key == "follow_latest" && !next.follow_latest {
            next.pinned_log = pin.filter(|id| !id.is_empty());
        }
        next.revision = self.revision.saturating_add(1);
        Ok(next.validated())
    }

    pub fn validated(mut self) -> Self {
        self.task_names = self
            .task_names
            .into_iter()
            .filter(|(id, _)| !id.is_empty() && id.len() < 240)
            .filter_map(|(id, name)| {
                let name: String = name
                    .chars()
                    .filter(|c| !c.is_control())
                    .take(24)
                    .collect::<String>()
                    .trim()
                    .into();
                (!name.is_empty()).then_some((id, name))
            })
            .take(512)
            .collect();
        self.avatar_crop = self.avatar_crop.validated();
        self.state_avatar_crops = self
            .state_avatar_crops
            .into_iter()
            .filter(|(key, _)| crate::avatar::valid_slot(key))
            .map(|(key, crop)| (key, crop.validated()))
            .collect();
        self.overlay_position = self
            .overlay_position
            .filter(|p| p.x.abs_diff(0) <= 100_000 && p.y.abs_diff(0) <= 100_000);
        self.task_positions = self
            .task_positions
            .into_iter()
            .filter(|(id, p)| {
                id.starts_with("task-")
                    && id.len() == 21
                    && p.x.abs_diff(0) <= 100_000
                    && p.y.abs_diff(0) <= 100_000
            })
            .take(128)
            .collect();
        self.pinned_log = self.pinned_log.filter(|s| s.len() < 240);
        self.retention_days = self.retention_days.clamp(1, 30);
        self.interval_ms = self.interval_ms.clamp(500, 3000);
        self.rate_idle_seconds = self.rate_idle_seconds.clamp(10, 120);
        for (value, allowed, default) in [
            (&mut self.overlay_layout, &["bar", "avatar"][..], "bar"),
            (
                &mut self.theme,
                &["mint", "sakura", "moon", "ice", "tea", "spellbook"][..],
                "mint",
            ),
            (
                &mut self.character,
                &["mai", "roxy", "custom", "none"][..],
                "mai",
            ),
            (&mut self.motion, &["spark", "orbit", "breath"][..], "spark"),
            (&mut self.bubble_mode, &["always", "working"][..], "always"),
            (
                &mut self.idle_frequency,
                &["quiet", "balanced", "lively"][..],
                "balanced",
            ),
            (
                &mut self.task_display,
                &["separate", "combined"][..],
                "separate",
            ),
        ] {
            if !allowed.contains(&value.as_str()) {
                *value = default.into();
            }
        }
        self
    }
}

#[derive(Clone, Debug, Serialize)]
pub struct CompletionCard {
    pub id: String,
    pub ended_at: i64,
    pub output_tokens: Option<u64>,
    pub duration: Option<f64>,
    pub average_rate: Option<f64>,
    pub reason: &'static str,
}
#[derive(Clone, Debug, Serialize)]
pub struct Sample {
    pub task_unfinished: bool,
    pub overlay_log_id: Option<String>,
    pub session_label: Option<String>,
    pub sessions: Vec<Sample>,
    pub monitored_sessions: usize,
    pub stream_epoch: u64,
    pub retention_mode: String,
    pub cadence_samples: usize,
    pub expected_report_seconds: Option<f64>,
    pub pulses: Vec<crate::activity::PulseBucket>,
    pub completion: Option<CompletionCard>,
    pub activity_status: String,
    pub activity_at: Option<i64>,
    pub activity_age_seconds: Option<f64>,
    pub pending_tools: usize,
    pub activities: Vec<crate::activity::ActivityEvent>,
    pub checked_at: Option<i64>,
    pub poll_sequence: u64,
    pub usage_age_seconds: Option<f64>,
    pub usage_updated_at: Option<i64>,
    pub running_seconds: Option<f64>,
    pub current_rate: Option<f64>,
    pub rate_status: String,
    pub rate_interval_seconds: Option<f64>,
    pub rate_updated_at: Option<i64>,
    pub rate_idle_seconds: u32,
    pub follow_latest: bool,
    pub log_id: Option<String>,
    pub output_tokens: Option<u64>,
    pub reasoning_tokens: Option<u64>,
    pub total_output_tokens: Option<u64>,
    pub total_reasoning_tokens: Option<u64>,
    pub measurement_id: Option<String>,
    pub log_updated_at: Option<i64>,
    pub source: String,
    pub state: String,
    pub message: String,
    pub rate: Option<f64>,
    pub chars_per_second: Option<f64>,
    pub models: Vec<String>,
    pub observed_seconds: Option<f64>,
    pub scan_ms: Option<f64>,
    pub nodes: usize,
    pub network: String,
    pub timestamp: i64,
    pub quality: String,
}
impl Default for Sample {
    fn default() -> Self {
        Self {
            task_unfinished: false,
            overlay_log_id: None,
            session_label: None,
            sessions: vec![],
            monitored_sessions: 0,
            stream_epoch: 0,
            retention_mode: "fixed".into(),
            cadence_samples: 0,
            expected_report_seconds: None,
            pulses: vec![],
            completion: None,
            activity_status: "unknown".into(),
            activity_at: None,
            activity_age_seconds: None,
            pending_tools: 0,
            activities: vec![],
            checked_at: None,
            poll_sequence: 0,
            usage_age_seconds: None,
            usage_updated_at: None,
            running_seconds: None,
            current_rate: None,
            rate_status: "unavailable".into(),
            rate_interval_seconds: None,
            rate_updated_at: None,
            rate_idle_seconds: 30,
            follow_latest: false,
            log_id: None,
            output_tokens: None,
            reasoning_tokens: None,
            total_output_tokens: None,
            total_reasoning_tokens: None,
            measurement_id: None,
            log_updated_at: None,
            source: "logs".into(),
            state: "paused".into(),
            message: "选择日志会话后，读取实际用量".into(),
            rate: None,
            chars_per_second: None,
            models: vec![],
            observed_seconds: None,
            scan_ms: None,
            nodes: 0,
            network: "unknown".into(),
            timestamp: now(),
            quality: "unavailable".into(),
        }
    }
}

impl Sample {
    /// A source failure cannot prove that its last known task has finished.
    /// Loading replay is excluded until its history is caught up.
    pub fn unfinished(&self) -> bool {
        self.state == "running" || self.state == "unavailable" && self.task_unfinished
    }
}

#[derive(Clone, Debug, Serialize)]
pub struct History {
    pub source: String,
    pub output_tokens: Option<u64>,
    pub reasoning_tokens: Option<u64>,
    pub id: i64,
    pub started_at: i64,
    pub duration: Option<f64>,
    pub average_rate: Option<f64>,
    pub reason: String,
}

#[cfg(test)]
mod settings_tests {
    use super::*;
    #[test]
    fn task_names_are_bounded_plain_text_and_do_not_change_monitoring() {
        let old = Settings::default();
        let next = old
            .patch(
                "task_names",
                serde_json::json!({"a":"  数学\u{0000}作业  ", "b":"x".repeat(90), "empty":"  "}),
                None,
            )
            .unwrap();
        assert_eq!(next.task_names["a"], "数学作业");
        assert_eq!(next.task_names["b"].len(), 24);
        assert!(!next.task_names.contains_key("empty"));
        assert_eq!(next.keep_history, old.keep_history);
        assert_eq!(next.follow_latest, old.follow_latest);
    }
    #[test]
    fn crops_are_bounded_and_new_preferences_migrate_without_changing_history() {
        let s: Settings = serde_json::from_str("{}").unwrap();
        assert!(
            s.edge_snap
                && s.idle_collapse
                && s.completion_scene
                && !s.do_not_disturb
                && !s.keep_history
        );
        let next = s
            .patch(
                "avatar_crop",
                serde_json::json!({"x":-50,"y":150,"zoom":10}),
                None,
            )
            .unwrap();
        assert_eq!(
            (
                next.avatar_crop.x,
                next.avatar_crop.y,
                next.avatar_crop.zoom
            ),
            (0., 100., 3.)
        );
        let next = next
            .patch(
                "state_avatar_crops",
                serde_json::json!({"reasoning":{"zoom":2},"../../escape":{"zoom":2}}),
                None,
            )
            .unwrap();
        assert_eq!(next.state_avatar_crops.len(), 1);
        assert_eq!(next.state_avatar_crops["reasoning"].x, 50.);
        assert!(next
            .patch("state_avatar_revision", serde_json::json!(5), None)
            .is_err());
        assert!(!next.keep_history);
    }
    #[test]
    fn appearance_migration_and_validation_do_not_change_monitoring() {
        let old: Settings =
            serde_json::from_str(r#"{"keep_history":false,"follow_latest":true}"#).unwrap();
        assert_eq!(old.overlay_layout, "bar");
        assert_eq!(old.character, "mai");
        assert!(!old.keep_history);
        let next = old
            .patch("overlay_layout", serde_json::json!("avatar"), None)
            .unwrap()
            .patch("theme", serde_json::json!("sakura"), None)
            .unwrap();
        assert_eq!(next.overlay_layout, "avatar");
        assert_eq!(next.theme, "sakura");
        assert!(next.follow_latest);
        assert!(!next.keep_history);
        assert_eq!(
            next.patch("theme", serde_json::json!("bad"), None)
                .unwrap()
                .theme,
            "mint"
        );
        assert!(next
            .patch("avatar_revision", serde_json::json!(50), None)
            .is_err());
    }
    #[test]
    fn roxy_and_spellbook_persist_without_touching_monitoring_or_position() {
        let base = Settings {
            overlay_position: Some(OverlayPosition { x: 345, y: 678 }),
            ..Settings::default()
        };
        let next = base
            .patch("character", serde_json::json!("roxy"), None)
            .unwrap()
            .patch("theme", serde_json::json!("spellbook"), None)
            .unwrap();
        let restored: Settings =
            serde_json::from_str(&serde_json::to_string(&next).unwrap()).unwrap();
        let restored = restored.validated();
        assert_eq!(restored.character, "roxy");
        assert_eq!(restored.theme, "spellbook");
        assert_eq!(restored.overlay_position, base.overlay_position);
        assert_eq!(restored.follow_latest, base.follow_latest);
        assert_eq!(restored.keep_history, base.keep_history);
    }
    #[test]
    fn preference_changes_preserve_native_position_and_edit_state() {
        let original = Settings {
            revision: 10,
            locked: false,
            overlay_position: Some(OverlayPosition { x: 100, y: 200 }),
            ..Settings::default()
        };
        let a = original
            .patch("hover_hide", serde_json::json!(false), None)
            .unwrap();
        let b = a
            .patch("interval_ms", serde_json::json!(2000), None)
            .unwrap();
        assert!(!b.locked && !b.hover_hide);
        assert_eq!(b.overlay_position, original.overlay_position);
        assert_eq!(b.interval_ms, 2000);
        assert_eq!(b.revision, 12);
    }
    #[test]
    fn transient_fields_and_invalid_types_cannot_be_patched() {
        let s = Settings::default();
        for key in [
            "locked",
            "overlay_position",
            "revision",
            "pinned_log",
            "unknown",
        ] {
            assert!(s.patch(key, serde_json::json!(true), None).is_err());
        }
        assert!(s
            .patch("keep_history", serde_json::json!("false"), None)
            .is_err());
        assert!(s.patch("interval_ms", serde_json::json!(-1), None).is_err());
        assert_eq!(
            s.patch("rate_idle_seconds", serde_json::json!(1000), None)
                .unwrap()
                .rate_idle_seconds,
            120
        );
    }
    #[test]
    fn pin_is_changed_only_when_disabling_automatic_follow() {
        let s = Settings {
            pinned_log: Some("a.jsonl".into()),
            ..Settings::default()
        };
        let next = s
            .patch(
                "follow_latest",
                serde_json::json!(false),
                Some("b.jsonl".into()),
            )
            .unwrap();
        assert!(!next.follow_latest);
        assert_eq!(next.pinned_log.as_deref(), Some("b.jsonl"));
        let keep = next
            .patch(
                "hover_hide",
                serde_json::json!(false),
                Some("c.jsonl".into()),
            )
            .unwrap();
        assert_eq!(keep.pinned_log, next.pinned_log);
    }
}
