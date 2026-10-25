//! Ephemeral lifecycle metadata only: never message, argument, or result bodies.
use serde::Serialize;
use std::collections::{HashSet, VecDeque};

#[derive(Clone, Debug, Serialize)]
pub struct ActivityEvent {
    pub kind: &'static str,
    pub at: i64,
}
#[derive(Clone, Debug, Serialize)]
pub struct PulseBucket {
    pub at: i64,
    pub count: u32,
    pub last_at: i64,
    pub kind: &'static str,
}
#[derive(Default)]
pub struct Activity {
    pulses: VecDeque<PulseBucket>,
    pub phase: &'static str,
    pub at: Option<i64>,
    events: VecDeque<ActivityEvent>,
    calls: HashSet<String>,
    overflow: bool,
    waiting: Option<&'static str>,
}
impl Activity {
    pub fn mark(&mut self, kind: &'static str, at: Option<i64>) {
        // A malformed/out-of-order clock cannot masquerade as fresh activity.
        if at.is_none() || at.zip(self.at).is_some_and(|(a, b)| a < b) {
            self.at = None;
            self.phase = "unknown";
            return;
        }
        if matches!(kind, "reasoning" | "message") {
            self.waiting = None;
        }
        self.phase = kind;
        self.at = at;
        let at = at.unwrap();
        if !self
            .events
            .back()
            .is_some_and(|e| e.kind == kind && e.at == at)
        {
            let bucket = at.div_euclid(2000) * 2000;
            if let Some(last) = self.pulses.back_mut().filter(|last| last.at == bucket) {
                last.count = last.count.saturating_add(1);
                last.kind = kind;
                last.last_at = at;
            } else {
                self.pulses.push_back(PulseBucket {
                    at: bucket,
                    count: 1,
                    last_at: at,
                    kind,
                });
                if self.pulses.len() > 24 {
                    self.pulses.pop_front();
                }
            }
            self.events.push_back(ActivityEvent { kind, at });
            if self.events.len() > 12 {
                self.events.pop_front();
            }
        }
    }
    pub fn start(&mut self, at: Option<i64>) {
        self.calls.clear();
        self.overflow = false;
        self.waiting = None;
        self.mark("started", at);
    }
    pub fn finish(&mut self, kind: &'static str, at: Option<i64>) {
        self.calls.clear();
        self.waiting = None;
        self.overflow = false;
        self.mark(kind, at);
    }
    pub fn wait(&mut self, kind: &'static str, at: Option<i64>) {
        self.waiting = Some(kind);
        self.mark(kind, at);
    }
    pub fn tool_start(&mut self, id: Option<String>, at: Option<i64>) {
        let Some(id) = id.filter(|s| {
            !s.is_empty()
                && s.len() <= 160
                && s.bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"_-".contains(&b))
        }) else {
            return;
        };
        if self.calls.contains(&id) {
            return;
        }
        if self.calls.len() >= 64 {
            self.overflow = true;
            return;
        }
        self.calls.insert(id);
        self.waiting = None;
        self.mark("tool_started", at);
    }
    pub fn tool_end(&mut self, id: Option<String>, at: Option<i64>) {
        if id.is_some_and(|id| self.calls.remove(&id)) {
            self.waiting = None;
            self.mark("tool_finished", at);
        }
    }
    pub fn pulses(&self) -> Vec<PulseBucket> {
        self.pulses.iter().cloned().collect()
    }
    pub fn snapshot(
        &self,
        active: bool,
        ended: bool,
        now: i64,
    ) -> (String, Option<f64>, usize, Vec<ActivityEvent>) {
        let age = self
            .at
            .filter(|at| now >= *at)
            .map(|at| (now - at) as f64 / 1000.);
        let status = if self.overflow || age.is_none() {
            "unknown"
        } else if ended {
            if self.phase == "aborted" {
                "aborted"
            } else {
                "completed"
            }
        } else if !active {
            "unknown"
        } else if let Some(waiting) = self.waiting {
            waiting
        } else if age.is_some_and(|age| age >= 30.) {
            "quiet"
        } else {
            // Later model progress takes precedence over an older unmatched tool
            // record: persisted logs can omit a result, and tools can run in parallel.
            match self.phase {
                "reasoning" => "reasoning",
                "message" => "responding",
                "retrying" => "retrying",
                "tool_started" | "tool_finished" if !self.calls.is_empty() => "tool",
                _ => "processing",
            }
        };
        (
            status.into(),
            age,
            self.calls.len(),
            self.events.iter().cloned().collect(),
        )
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn pulses_only_count_events_and_keep_empty_intervals_empty() {
        let mut a = Activity::default();
        a.start(Some(1000));
        a.mark("reasoning", Some(1500));
        a.mark("reasoning", Some(1500));
        a.mark("message", Some(7000));
        let p = a.pulses();
        assert_eq!(p.len(), 2);
        assert_eq!(p[0].count, 2);
        assert_eq!(p[1].at, 6000);
        a.snapshot(true, false, 50000);
        assert_eq!(a.pulses().len(), 2);
        for n in 0..100 {
            a.mark("reasoning", Some(10000 + n * 2000));
        }
        assert_eq!(a.pulses().len(), 24);
    }
    #[test]
    fn activity_is_independent_of_token_rate_and_silence_is_not_completion() {
        let mut a = Activity::default();
        a.start(Some(1000));
        assert_eq!(a.snapshot(true, false, 2000).0, "processing");
        a.mark("reasoning", Some(3000));
        assert_eq!(a.snapshot(true, false, 4000).0, "reasoning");
        assert_eq!(a.snapshot(true, false, 33000).0, "quiet");
        assert_ne!(a.snapshot(true, false, 50000).0, "completed");
    }
    #[test]
    fn parallel_tools_and_duplicates_are_matched_and_new_turn_clears_them() {
        let mut a = Activity::default();
        a.start(Some(1000));
        a.tool_start(Some("a".into()), Some(2000));
        a.tool_start(Some("a".into()), Some(2500));
        a.tool_start(Some("b".into()), Some(3000));
        a.tool_end(Some("other".into()), Some(3500));
        assert_eq!(a.snapshot(true, false, 4000).2, 2);
        a.tool_end(Some("a".into()), Some(4000));
        assert_eq!(a.snapshot(true, false, 5000).0, "tool");
        a.tool_end(Some("b".into()), Some(5000));
        assert_eq!(a.snapshot(true, false, 6000).0, "processing");
        a.wait("waiting_approval", Some(6000));
        assert_eq!(a.snapshot(true, false, 90000).0, "waiting_approval");
        a.start(Some(91000));
        assert_eq!(a.snapshot(true, false, 92000).0, "processing");
        a.finish("aborted", Some(93000));
        assert_eq!(a.snapshot(false, true, 94000).0, "aborted");
    }
    #[test]
    fn new_model_progress_is_not_hidden_by_an_older_unmatched_tool() {
        let mut a = Activity::default();
        a.start(Some(1000));
        a.tool_start(Some("call_old".into()), Some(2000));
        assert_eq!(a.snapshot(true, false, 3000).0, "tool");
        a.mark("reasoning", Some(4000));
        assert_eq!(a.snapshot(true, false, 5000).0, "reasoning");
        a.mark("message", Some(6000));
        assert_eq!(a.snapshot(true, false, 7000).0, "responding");
        assert_eq!(a.snapshot(true, false, 7000).2, 1); // still honestly records the unmatched result
    }
    #[test]
    fn missing_future_or_regressing_time_is_unknown_and_trail_is_bounded() {
        let mut a = Activity::default();
        a.start(None);
        assert_eq!(a.snapshot(true, false, 1000).0, "unknown");
        a.start(Some(2000));
        assert_eq!(a.snapshot(true, false, 1000).0, "unknown");
        a.mark("message", Some(1000));
        assert_eq!(a.snapshot(true, false, 3000).0, "unknown");
        for n in 0..50 {
            a.mark("reasoning", Some(5000 + n));
        }
        assert_eq!(a.snapshot(true, false, 6000).3.len(), 12);
    }
}
