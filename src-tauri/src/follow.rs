//! Log task selection is independent of foreground ChatGPT conversations.
use crate::data::Sample;
use crate::logs::LogFile;

/// Bound polling independently of the UI's recent-file index.
pub fn reader_ids(
    files: &[LogFile],
    tracked: &[String],
    current: Option<&str>,
    mut exists: impl FnMut(&str) -> bool,
) -> Vec<String> {
    let mut ids = Vec::new();
    // Existing tasks and the explicit detail take priority. The recent list
    // is discovery, not proof that older running tasks no longer exist.
    for id in current
        .into_iter()
        .chain(tracked.iter().map(String::as_str))
    {
        if ids.len() >= 64 {
            break;
        }
        if !ids.iter().any(|key| key == id) && (files.iter().any(|f| f.id == id) || exists(id)) {
            ids.push(id.to_owned());
        }
    }
    for file in files.iter().take(32) {
        if ids.len() >= 64 {
            break;
        }
        if !ids.contains(&file.id) {
            ids.push(file.id.clone());
        }
    }
    ids
}

pub fn choose_active<'a>(
    samples: &'a [(String, Sample)],
    current: Option<&str>,
    now: i64,
) -> Option<&'a str> {
    samples
        .iter()
        .filter_map(|(id, s)| {
            let recent = s
                .activity_at
                .is_some_and(|at| now >= at && now - at < 120_000);
            let priority = if s.state == "running" {
                if recent {
                    3
                } else {
                    1
                }
            } else if s
                .completion
                .as_ref()
                .is_some_and(|c| now >= c.ended_at && now - c.ended_at < 12_000)
            {
                2
            } else if s.unfinished() {
                0
            } else {
                return None;
            };
            Some((
                id,
                (
                    priority,
                    s.activity_at.unwrap_or(0),
                    Some(id.as_str()) == current,
                ),
            ))
        })
        .max_by(|a, b| a.1.cmp(&b.1).then_with(|| b.0.cmp(a.0)))
        .map(|(id, _)| id.as_str())
}

/// An explicit selection survives a failed read. Missing data is unavailable,
/// never an idle task, and never a reason to silently choose another source.
pub fn detail(
    samples: &[(String, Sample)],
    current: Option<&str>,
    automatic: bool,
    read_error: Option<String>,
) -> Sample {
    let chosen = if automatic {
        choose_active(samples, current, crate::data::now())
    } else {
        current
    };
    if let Some(row) = chosen.and_then(|id| samples.iter().find(|(key, _)| key == id)) {
        return row.1.clone();
    }
    if !automatic {
        if let Some(id) = current {
            return Sample {
                log_id: Some(id.into()),
                state: "unavailable".into(),
                message: read_error
                    .unwrap_or_else(|| "固定的日志暂时不可读取；恢复可用后会继续检查".into()),
                ..Sample::default()
            };
        }
    }
    Sample {
        state: if read_error.is_some() && samples.iter().all(|(_, s)| s.state == "unavailable") {
            "unavailable"
        } else if samples.iter().any(|(_, s)| s.state == "loading") {
            "loading"
        } else {
            "waiting"
        }
        .into(),
        message: read_error.unwrap_or_else(|| "等待 Work 任务；兼容日志写入后自动接入".into()),
        ..Sample::default()
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn unreadable_candidates_without_a_known_open_task_are_not_reported_as_idle() {
        let rows = vec![s("aaaa.jsonl", "unavailable", 0)];
        let sample = detail(&rows, None, true, Some("source unreadable".into()));
        assert_eq!(sample.state, "unavailable");
        assert!(!sample.unfinished());
        assert!(sample.current_rate.is_none());
    }
    #[test]
    fn readable_work_takes_priority_over_interrupted_work_but_errors_are_not_idle() {
        let mut broken = s("aaaa.jsonl", "unavailable", 1000);
        broken.1.task_unfinished = true;
        assert_eq!(
            choose_active(&[broken.clone()], None, 2000),
            Some("aaaa.jsonl")
        );
        assert_eq!(
            choose_active(&[broken, s("bbbb.jsonl", "running", 0)], None, 200000),
            Some("bbbb.jsonl")
        );
    }
    #[test]
    fn temporarily_missing_fixed_source_stays_selected_and_recovers() {
        let other = vec![s("bbbb.jsonl", "running", crate::data::now())];
        let missing = detail(&other, Some("aaaa.jsonl"), false, None);
        assert_eq!(missing.log_id.as_deref(), Some("aaaa.jsonl"));
        assert_eq!(missing.state, "unavailable");
        assert!(missing.current_rate.is_none() && missing.output_tokens.is_none());
        assert!(missing.completion.is_none() && missing.pulses.is_empty());
        assert_eq!(
            detail(
                &[],
                Some("aaaa.jsonl"),
                false,
                Some("source unavailable".into())
            )
            .log_id
            .as_deref(),
            Some("aaaa.jsonl")
        );
        let mut recovered = other;
        recovered.push(s("aaaa.jsonl", "running", crate::data::now()));
        assert_eq!(
            detail(&recovered, Some("aaaa.jsonl"), false, None).state,
            "running"
        );
        assert_eq!(
            detail(&recovered[..1], Some("aaaa.jsonl"), true, None).log_id,
            Some("bbbb.jsonl".into())
        );
    }
    #[test]
    fn active_and_pinned_logs_survive_falling_out_of_the_recent_file_index() {
        let recent: Vec<LogFile> = (0..200)
            .map(|i| LogFile {
                id: format!("{i}.jsonl"),
                label: String::new(),
                modified: i,
            })
            .collect();
        let tracked = vec!["aaaa.jsonl".to_owned()];
        let ids = reader_ids(&recent, &tracked, Some("bbbb.jsonl"), |id| {
            ["aaaa.jsonl", "bbbb.jsonl"].contains(&id)
        });
        assert!(ids.iter().any(|id| id == "aaaa.jsonl"));
        assert!(ids.iter().any(|id| id == "bbbb.jsonl"));
    }
    #[test]
    fn new_candidates_cannot_evict_tracked_work_at_the_reader_limit() {
        let recent: Vec<LogFile> = (0..200)
            .map(|i| LogFile {
                id: format!("{i}.jsonl"),
                label: String::new(),
                modified: i,
            })
            .collect();
        let tracked: Vec<String> = (100..164).map(|i| format!("{i}.jsonl")).collect();
        let ids = reader_ids(&recent, &tracked, Some(&tracked[0]), |_| true);
        assert_eq!(ids.len(), 64);
        assert!(tracked.iter().all(|id| ids.contains(id)));
    }
    fn s(id: &str, state: &str, at: i64) -> (String, Sample) {
        (
            id.into(),
            Sample {
                log_id: Some(id.into()),
                state: state.into(),
                activity_at: Some(at),
                ..Sample::default()
            },
        )
    }
    #[test]
    fn a_finished_newer_file_cannot_hide_running_work() {
        let samples = vec![
            s("running", "running", 1000),
            s("finished", "completed", 2000),
        ];
        assert_eq!(
            choose_active(&samples, Some("finished"), 3000),
            Some("running")
        );
    }
    #[test]
    fn no_historical_completion_is_presented_as_current_work() {
        assert_eq!(
            choose_active(&[s("old", "completed", 1000)], None, 3000),
            None
        );
        assert_eq!(choose_active(&[], None, 3000), None);
    }
    #[test]
    fn activity_not_file_touch_selects_work_and_ties_are_sticky() {
        let mut samples = vec![s("a", "running", 1000), s("b", "running", 2000)];
        assert_eq!(choose_active(&samples, Some("a"), 3000), Some("b"));
        samples[0].1.activity_at = Some(2000);
        assert_eq!(choose_active(&samples, Some("a"), 3000), Some("a"));
        assert_eq!(choose_active(&samples, Some("b"), 3000), Some("b"));
    }
    #[test]
    fn a_new_live_summary_is_briefly_visible_before_old_quiet_work() {
        let mut done = s("done", "completed", 200000);
        done.1.completion = Some(crate::data::CompletionCard {
            id: "d".into(),
            ended_at: 200000,
            output_tokens: None,
            duration: None,
            average_rate: None,
            reason: "completed",
        });
        let samples = vec![s("old", "running", 1000), done];
        assert_eq!(choose_active(&samples, None, 201000), Some("done"));
        assert_eq!(choose_active(&samples, None, 213000), Some("old"));
    }
}
