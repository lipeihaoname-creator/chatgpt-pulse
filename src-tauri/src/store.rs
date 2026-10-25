use crate::data::{now, History, Settings};
use rusqlite::{params, Connection};
use std::path::Path;

pub struct Store {
    db: Connection,
}
impl Store {
    pub fn open(path: &Path) -> Result<Self, String> {
        let db = Connection::open(path).map_err(|e| e.to_string())?;
        db.busy_timeout(std::time::Duration::from_secs(3)).map_err(|e| e.to_string())?;
        db.execute_batch("PRAGMA secure_delete=ON; PRAGMA journal_mode=DELETE; CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS observations(id INTEGER PRIMARY KEY,started_at INTEGER NOT NULL,duration REAL NOT NULL,average_rate REAL,reason TEXT NOT NULL);").map_err(|e|e.to_string())?;
        db.execute_batch("CREATE TABLE IF NOT EXISTS log_observations(id INTEGER PRIMARY KEY, event_key TEXT UNIQUE NOT NULL, started_at INTEGER NOT NULL, duration REAL, average_rate REAL, output_tokens INTEGER, reasoning_tokens INTEGER, reason TEXT NOT NULL);").map_err(|e|e.to_string())?;
        Ok(Self { db })
    }
    pub fn settings(&self) -> Settings {
        self.db
            .query_row("SELECT value FROM settings WHERE id=1", [], |r| {
                r.get::<_, String>(0)
            })
            .ok()
            .and_then(|s| serde_json::from_str::<Settings>(&s).ok())
            .unwrap_or_default()
            .validated()
    }
    pub fn save_settings(&self, s: &Settings) -> Result<(), String> {
        let mut s = s.clone();
        s.locked = true;
        self.db.execute("INSERT INTO settings VALUES(1,?1) ON CONFLICT(id) DO UPDATE SET value=excluded.value",[serde_json::to_string(&s).map_err(|e|e.to_string())?]).map_err(|e|e.to_string())?;
        self.prune(s.retention_days)?;
        Ok(())
    }
    pub fn prune(&self, days: u32) -> Result<(), String> {
        self.db
            .execute(
                "DELETE FROM observations WHERE started_at < ?1",
                [now() - i64::from(days) * 86_400_000],
            )
            .map_err(|e| e.to_string())?;
        self.db
            .execute(
                "DELETE FROM log_observations WHERE started_at < ?1",
                [now() - i64::from(days) * 86_400_000],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    pub fn insert_log(&self, session: &str, c: &crate::logs::Completed) -> Result<(), String> {
        if c.started_at <= 0 {
            return Ok(());
        }
        // This key is made only from a generated file identifier and turn identifier.
        self.db.execute("INSERT INTO log_observations(event_key,started_at,duration,average_rate,output_tokens,reasoning_tokens,reason) VALUES(?1,?2,?3,?4,?5,?6,?7) ON CONFLICT(event_key) DO NOTHING",params![format!("{}:{}",session,c.key),c.started_at,c.duration,c.rate,c.output,c.reasoning,c.reason]).map_err(|e|e.to_string())?;
        Ok(())
    }
    #[cfg(test)]
    pub fn insert(
        &self,
        started: i64,
        duration: f64,
        average: Option<f64>,
        reason: &str,
    ) -> Result<(), String> {
        self.db.execute("INSERT INTO observations(started_at,duration,average_rate,reason) VALUES(?1,?2,?3,?4)",params![started,duration,average,reason]).map_err(|e|e.to_string())?;
        Ok(())
    }
    pub fn history(&self) -> Result<Vec<History>, String> {
        let mut q=self.db.prepare("SELECT id,started_at,duration,average_rate,reason,'logs',output_tokens,reasoning_tokens FROM log_observations UNION ALL SELECT id,started_at,duration,average_rate,reason,'legacy_estimate',NULL,NULL FROM observations ORDER BY started_at DESC LIMIT 200").map_err(|e|e.to_string())?;
        let rows = q
            .query_map([], |r| {
                Ok(History {
                    source: r.get(5)?,
                    output_tokens: r.get(6)?,
                    reasoning_tokens: r.get(7)?,
                    id: r.get(0)?,
                    started_at: r.get(1)?,
                    duration: r.get(2)?,
                    average_rate: r.get(3)?,
                    reason: r.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<_, _>>().map_err(|e| e.to_string())
    }
    pub fn clear(&self) -> Result<(), String> {
        self.db
            .execute_batch("DELETE FROM observations; DELETE FROM log_observations; VACUUM;")
            .map_err(|e| e.to_string())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn editing_can_never_be_persisted_by_any_caller() {
        let db = Store::open(Path::new(":memory:")).unwrap();
        db.save_settings(&Settings {
            locked: false,
            revision: 9,
            ..Settings::default()
        })
        .unwrap();
        assert!(db.settings().locked);
        assert_eq!(db.settings().revision, 9);
    }
    #[test]
    fn only_metadata_and_settings() {
        let store = Store::open(Path::new(":memory:")).unwrap();
        assert!(!store.settings().keep_history);
        store.insert(now(), 12., Some(23.), "not_observed").unwrap();
        assert_eq!(store.history().unwrap().len(), 1);
        store.clear().unwrap();
        assert!(store.history().unwrap().is_empty());
    }
    #[test]
    fn settings_bounds() {
        let mut s = Settings::default();
        s.retention_days = 999;
        s.interval_ms = 0;
        let s = s.validated();
        assert_eq!(s.retention_days, 30);
        assert_eq!(s.interval_ms, 500);
    }
    #[test]
    fn old_settings_migrate_without_enabling_history_or_resetting_preferences() {
        let old = r#"{"tray_enabled":false,"overlay_enabled":true,"locked":true,"hover_hide":false,"keep_history":false,"retention_days":30,"interval_ms":2000}"#;
        let s: Settings = serde_json::from_str(old).unwrap();
        assert!(s.auto_monitor && s.follow_latest);
        assert!(!s.keep_history);
        assert!(s.overlay_enabled);
        assert!(!s.tray_enabled);
        assert_eq!(s.interval_ms, 2000);
        assert_eq!(s.rate_idle_seconds, 30);
    }
    #[test]
    fn log_records_are_deduplicated_and_old_estimates_keep_their_source() {
        let s = Store::open(Path::new(":memory:")).unwrap();
        s.insert(now() - 100, 1., Some(99.), "paused").unwrap();
        let c = crate::logs::Completed {
            key: "t1".into(),
            started_at: now(),
            duration: None,
            output: Some(20),
            reasoning: Some(5),
            rate: None,
            reason: "completed",
        };
        s.insert_log("a.jsonl", &c).unwrap();
        s.insert_log("a.jsonl", &c).unwrap();
        let h = s.history().unwrap();
        assert_eq!(h.len(), 2);
        assert_eq!(h[0].source, "logs");
        assert_eq!(h[0].output_tokens, Some(20));
        assert_eq!(h[0].duration, None);
        assert_eq!(h[1].source, "legacy_estimate");
        s.clear().unwrap();
        assert!(s.history().unwrap().is_empty());
    }
}
