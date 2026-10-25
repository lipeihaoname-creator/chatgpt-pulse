//! Read-only, bounded JSONL tailing. Only usage/timing fields cross this module.
use crate::data::Sample;
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File},
    io::{Read, Seek, SeekFrom},
    path::{Component, Path, PathBuf},
};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};

const MAX_LINE: usize = 128 * 1024;
const POLL_BYTES: u64 = 256 * 1024;
// Recent vs. held interval is explicit; idle expiry uses meaningful activity, not poll ticks.
const RATE_FRESH_MS: i64 = 5_000;

// Probe only the envelope before allocating/deserializing usage fields. Early
// termination also identifies huge message/tool records without retaining them.
#[derive(Default)]
struct Header {
    kind: Option<String>,
    subtype: Option<String>,
    timestamp: Option<String>,
    call_id: Option<String>,
    turn_id: Option<String>,
    role: Option<String>,
    invalid_metadata: bool,
    item_kind: Option<String>,
    item_id: Option<String>,
    internal_review: bool,
}
fn legacy_progress(kind: &str) -> bool {
    matches!(
        kind,
        "agent_reasoning"
            | "agent_message"
            | "exec_command_begin"
            | "exec_command_end"
            | "mcp_tool_call_begin"
            | "mcp_tool_call_end"
            | "web_search_begin"
            | "web_search_end"
            | "exec_approval_request"
            | "apply_patch_approval_request"
            | "request_user_input"
            | "stream_error"
    )
}
impl Header {
    fn safe_to_skip_body(&self) -> bool {
        self.kind.as_deref() == Some("response_item")
            || !self.invalid_metadata
                && self.kind.as_deref() == Some("event_msg")
                && self.subtype.as_deref().is_some_and(|kind| {
                    kind == "item_completed" || legacy_progress(kind)
                })
    }
}
struct Probe<'a> {
    header: &'a mut Header,
    nested: bool,
    item: bool,
}
impl<'de> serde::de::DeserializeSeed<'de> for Probe<'_> {
    type Value = ();
    fn deserialize<D: serde::Deserializer<'de>>(self, d: D) -> Result<(), D::Error> {
        d.deserialize_map(self)
    }
}
impl<'de> serde::de::Visitor<'de> for Probe<'_> {
    type Value = ();
    fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        f.write_str("event envelope")
    }
    fn visit_map<M: serde::de::MapAccess<'de>>(self, mut map: M) -> Result<(), M::Error> {
        while let Some(key) = map.next_key::<String>()? {
            if key == "type" {
                let kind = map.next_value::<String>()?;
                if self.item {
                    self.header.item_kind = Some(kind);
                } else if self.nested {
                    self.header.subtype = Some(kind);
                } else {
                    let unrelated = kind != "event_msg" && kind != "response_item" && kind != "session_meta";
                    self.header.kind = Some(kind);
                    if unrelated {
                        return Err(serde::de::Error::custom("envelope inspected"));
                    }
                }
            } else if key == "timestamp" && !self.nested {
                self.header.timestamp = map
                    .next_value::<Option<String>>()?
                    .filter(|s| s.len() <= 64);
            } else if self.nested && !self.item && key == "thread_source" {
                self.header.internal_review = map.next_value::<Option<String>>()?.as_deref() == Some("guardian_review");
            } else if self.item && key == "id" {
                let value = map.next_value::<Option<String>>()?;
                if value.as_ref().is_some_and(|s| s.len() > 160) {
                    self.header.invalid_metadata = true;
                    return Err(serde::de::Error::custom("metadata too long"));
                }
                self.header.item_id = value;
            } else if self.nested && !self.item && key == "item" {
                map.next_value_seed(Probe {
                    header: self.header,
                    nested: true,
                    item: true,
                })?;
            } else if self.nested && !self.item && matches!(key.as_str(), "call_id" | "turn_id" | "role") {
                let value = map.next_value::<Option<String>>()?;
                if value.as_ref().is_some_and(|s| s.len() > 160) {
                    self.header.invalid_metadata = true;
                    return Err(serde::de::Error::custom("metadata too long"));
                }
                match key.as_str() {
                    "call_id" => self.header.call_id = value,
                    "turn_id" => self.header.turn_id = value,
                    _ => self.header.role = value,
                }
            } else if key == "payload" && !self.nested {
                map.next_value_seed(Probe {
                    header: self.header,
                    nested: true,
                    item: false,
                })?;
            } else {
                map.next_value::<serde::de::IgnoredAny>()?;
            }
        }
        Ok(())
    }
}
fn relevant(prefix: &[u8]) -> Option<bool> {
    use serde::de::DeserializeSeed;
    let mut h = Header::default();
    let _ = Probe {
        header: &mut h,
        nested: false,
        item: false,
    }
    .deserialize(&mut serde_json::Deserializer::from_slice(
        &prefix[..prefix.len().min(4096)],
    ));
    if h.kind
        .as_deref()
        .is_some_and(|k| k != "event_msg" && k != "response_item")
    {
        return Some(false);
    }
    if h.kind.as_deref() == Some("response_item") {
        return h.subtype.map(|k| {
            matches!(
                k.as_str(),
                "reasoning"
                    | "message"
                    | "function_call"
                    | "function_call_output"
                    | "custom_tool_call"
                    | "custom_tool_call_output"
            )
        });
    }
    if h.kind.as_deref() != Some("event_msg") {
        return None;
    }
    h.subtype.map(|k| {
        matches!(
            k.as_str(),
            "token_count"
                | "item_completed"
                | "task_started"
                | "turn_started"
                | "task_complete"
                | "turn_complete"
                | "turn_aborted"
                | "agent_reasoning"
                | "agent_message"
                | "exec_command_begin"
                | "exec_command_end"
                | "mcp_tool_call_begin"
                | "mcp_tool_call_end"
                | "web_search_begin"
                | "web_search_end"
                | "exec_approval_request"
                | "apply_patch_approval_request"
                | "request_user_input"
                | "stream_error"
        )
    })
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct LogFile {
    pub id: String,
    pub label: String,
    pub modified: i64,
}

// Session filenames are generated identifiers, never titles. Reject other names.
fn safe_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() < 240
        && id.ends_with(".jsonl")
        && id.bytes().all(|b| {
            b.is_ascii_digit() || (b'a'..=b'f').contains(&b) || b"rollout-TZ_-/.:json".contains(&b)
        })
        && Path::new(id)
            .components()
            .all(|c| matches!(c, Component::Normal(_)))
}
pub fn resolve(root: &Path, id: &str) -> Result<PathBuf, String> {
    if !safe_id(id) {
        return Err("日志标识无效".into());
    }
    let base = root
        .canonicalize()
        .map_err(|_| "未发现兼容的本地会话日志")?;
    let mut path = base.clone();
    for component in Path::new(id).components() {
        path.push(component);
        if fs::symlink_metadata(&path)
            .map_err(|_| "日志已移走或不可读取")?
            .file_type()
            .is_symlink()
        {
            return Err("不读取符号链接日志".into());
        }
    }
    if !path.is_file()
        || !path
            .canonicalize()
            .map_err(|_| "日志不可读取")?
            .starts_with(base)
    {
        return Err("日志不在允许的会话目录中".into());
    }
    Ok(path)
}
fn describe_id(id: &str, modified: i64) -> LogFile {
    let label = Path::new(id)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .chars()
        .rev()
        .take(12)
        .collect::<String>()
        .chars()
        .rev()
        .collect();
    LogFile {
        id: id.into(),
        label,
        modified,
    }
}
pub fn describe(root: &Path, id: &str) -> Result<LogFile, String> {
    let path = resolve(root, id)?;
    let modified = fs::metadata(path)
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|t| t.as_millis() as i64)
        .unwrap_or(0);
    Ok(describe_id(id, modified))
}
// A guardian review is an internal approval task, not a user's Work task.
// Inspect a bounded envelope prefix; never retain instructions or message text.
fn internal_review(path: &Path) -> bool {
    use serde::de::DeserializeSeed;
    let Ok(file) = File::open(path) else { return false; };
    let mut prefix = Vec::new();
    if file.take(4096).read_to_end(&mut prefix).is_err() { return false; }
    let mut header = Header::default();
    let _ = Probe { header: &mut header, nested: false, item: false }
        .deserialize(&mut serde_json::Deserializer::from_slice(&prefix));
    header.kind.as_deref() == Some("session_meta") && header.internal_review
}
pub fn list(root: &Path) -> Result<Vec<LogFile>, String> {
    if !root.exists() {
        return Ok(vec![]);
    }
    let mut stack = vec![(root.to_path_buf(), 0)];
    let mut out = vec![];
    let mut visited = 0;
    while let Some((dir, depth)) = stack.pop() {
        for item in fs::read_dir(dir).map_err(|_| "无法列出本地会话日志")? {
            visited += 1;
            if visited > 50_000 {
                return Err("日志目录条目过多，请缩减后重试".into());
            }
            let item = item.map_err(|_| "无法读取日志目录")?;
            let kind = item.file_type().map_err(|_| "无法读取日志元数据")?;
            if kind.is_symlink() {
                continue;
            }
            if kind.is_dir() && depth < 5 {
                stack.push((item.path(), depth + 1));
            }
            if !kind.is_file() {
                continue;
            }
            let path = item.path();
            let Some(relative) = path.strip_prefix(root).ok().and_then(Path::to_str) else {
                continue;
            };
            // Stable relative IDs use '/' on every platform. Windows directory
            // enumeration yields '\\', which safe_id deliberately does not accept.
            let id = relative.replace(std::path::MAIN_SEPARATOR, "/");
            if !safe_id(&id) || internal_review(&path) {
                continue;
            }
            let modified = item
                .metadata()
                .ok()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|t| t.as_millis() as i64)
                .unwrap_or(0);
            // Only a fixed, filename-derived suffix is shown; no conversation titles.
            out.push(describe_id(&id, modified));
        }
    }
    out.sort_by(|a, b| b.modified.cmp(&a.modified).then(a.id.cmp(&b.id)));
    out.truncate(200);
    Ok(out)
}

#[derive(Clone, Debug, PartialEq, Deserialize)]
struct Usage {
    output_tokens: u64,
    reasoning_output_tokens: Option<u64>,
    input_tokens: Option<u64>,
    cached_input_tokens: Option<u64>,
}
impl Usage {
    fn valid(&self) -> bool {
        self.output_tokens <= 9_007_199_254_740_991
            && self
                .reasoning_output_tokens
                .is_none_or(|n| n <= self.output_tokens)
            && self
                .cached_input_tokens
                .zip(self.input_tokens)
                .is_none_or(|(c, i)| c <= i)
    }
    fn decreased(&self, old: &Self) -> bool {
        self.output_tokens < old.output_tokens
            || self
                .reasoning_output_tokens
                .zip(old.reasoning_output_tokens)
                .is_some_and(|(a, b)| a < b)
            || self
                .input_tokens
                .zip(old.input_tokens)
                .is_some_and(|(a, b)| a < b)
    }
    fn delta(&self, base: &Self) -> Option<(u64, Option<u64>)> {
        if self.decreased(base) {
            return None;
        }
        Some((
            self.output_tokens - base.output_tokens,
            self.reasoning_output_tokens
                .zip(base.reasoning_output_tokens)
                .map(|(a, b)| a - b),
        ))
    }
}
#[derive(Deserialize)]
struct Info {
    total_token_usage: Option<Usage>,
}
// Deserialize only lifecycle metadata; message/tool bodies are ignored.
#[derive(Deserialize)]
struct ItemMetadata {
    #[serde(rename = "type", default)]
    kind: String,
    id: Option<String>,
}
#[derive(Deserialize)]
struct Payload {
    #[serde(rename = "type", default)]
    kind: String,
    info: Option<Info>,
    turn_id: Option<String>,
    duration_ms: Option<u64>,
    call_id: Option<String>,
    role: Option<String>,
    item: Option<ItemMetadata>,
}
#[derive(Deserialize)]
struct Event {
    #[serde(rename = "type")]
    kind: String,
    timestamp: Option<String>,
    payload: Option<Payload>,
}
fn timestamp(s: Option<&str>) -> Option<i64> {
    let t = OffsetDateTime::parse(s?, &Rfc3339)
        .ok()?
        .unix_timestamp_nanos()
        / 1_000_000;
    i64::try_from(t).ok()
}
fn turn_id(id: Option<String>) -> Option<String> {
    id.filter(|s| {
        !s.is_empty()
            && s.len() <= 80
            && s.bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"-_".contains(&b))
    })
}
#[derive(Default)]
struct Task {
    id: Option<String>,
    started: Option<i64>,
    baseline: Option<Usage>,
    invalid: bool,
    usage_seen: bool,
    rate_anchor: Option<i64>,
    interval_rate: Option<f64>,
    rate_at: Option<i64>,
    interval_seconds: Option<f64>,
    cadence: crate::cadence::Cadence,
}
#[derive(Clone, Debug)]
pub struct Completed {
    pub key: String,
    pub started_at: i64,
    pub duration: Option<f64>,
    pub output: Option<u64>,
    pub reasoning: Option<u64>,
    pub rate: Option<f64>,
    pub reason: &'static str,
}
#[derive(Default)]
pub struct Parser {
    activity: crate::activity::Activity,
    total: Option<Usage>,
    task: Option<Task>,
    completed: Option<Completed>,
    completed_at: Option<i64>,
    updated: Option<i64>,
    usage_updated: Option<i64>,
    invalid: bool,
    revision: u64,
}
impl Parser {
    fn completed_item(&mut self, p: Payload, at: Option<i64>) {
        // A paginated completion must belong to the tracked turn. User items
        // and settings updates never imply model progress.
        if !self.task.as_ref().is_some_and(|task| {
            p.turn_id.is_some() && p.turn_id.as_ref() == task.id.as_ref()
        }) { return; }
        let Some(item) = p.item else { return; };
        match item.kind.as_str() {
            "reasoning" => self.activity.mark("reasoning", at),
            "agentMessage" | "agent_message" => self.activity.mark("message", at),
            "commandExecution" | "command_execution" | "mcpToolCall" | "mcp_tool_call"
            | "dynamicToolCall" | "dynamic_tool_call" | "webSearch" | "web_search"
            | "fileChange" | "file_change" => {
                self.activity.tool_end(item.id, at);
                self.activity.mark("tool_finished", at);
            }
            _ => {}
        }
    }
    fn legacy_progress_item(&mut self, p: Payload, at: Option<i64>) {
        if !self.task.as_ref().is_some_and(|t| {
            p.turn_id
                .as_ref()
                .is_none_or(|id| Some(id) == t.id.as_ref())
        }) {
            return;
        }
        match p.kind.as_str() {
            "agent_reasoning" => self.activity.mark("reasoning", at),
            "agent_message" => self.activity.mark("message", at),
            "exec_command_begin" | "mcp_tool_call_begin" | "web_search_begin" => {
                self.activity.tool_start(p.call_id, at)
            }
            "exec_command_end" | "mcp_tool_call_end" | "web_search_end" => {
                self.activity.tool_end(p.call_id, at)
            }
            "exec_approval_request" | "apply_patch_approval_request" => {
                self.activity.wait("waiting_approval", at)
            }
            "request_user_input" => self.activity.wait("waiting_user", at),
            "stream_error" => self.activity.mark("retrying", at),
            _ => {}
        }
    }
    fn response_item(&mut self, p: Payload, at: Option<i64>) {
        if !self.task.as_ref().is_some_and(|t| {
            p.turn_id
                .as_ref()
                .is_none_or(|id| Some(id) == t.id.as_ref())
        }) {
            return;
        }
        match p.kind.as_str() {
            "reasoning" => self.activity.mark("reasoning", at),
            "message" if p.role.as_deref() == Some("assistant") => {
                self.activity.mark("message", at)
            }
            "function_call" | "custom_tool_call" => self.activity.tool_start(p.call_id, at),
            "function_call_output" | "custom_tool_call_output" => {
                self.activity.tool_end(p.call_id, at)
            }
            _ => {}
        }
    }
    fn oversized_event(&mut self, header: Header) {
        // Only fields found before the large body in the bounded prefix are
        // retained. Missing IDs never fabricate a matching result.
        if header.invalid_metadata || !header.safe_to_skip_body() {
            return;
        }
        let at = timestamp(header.timestamp.as_deref());
        let payload = Payload {
            kind: header.subtype.unwrap_or_default(),
            info: None,
            turn_id: header.turn_id,
            duration_ms: None,
            call_id: header.call_id,
            role: header.role,
            item: header.item_kind.map(|kind| ItemMetadata { kind, id: header.item_id }),
        };
        if header.kind.as_deref() == Some("response_item") {
            self.response_item(payload, at);
        } else if payload.kind == "item_completed" {
            self.completed_item(payload, at);
        } else {
            self.legacy_progress_item(payload, at);
        }
    }
    fn corrupt(&mut self) {
        self.invalid = true;
        if let Some(t) = self.task.as_mut() {
            t.invalid = true;
        }
    }
    pub fn line(&mut self, line: &[u8]) -> Option<Completed> {
        if relevant(line) == Some(false) {
            return None;
        }
        let event = match serde_json::from_slice::<Event>(line) {
            Ok(e) => e,
            Err(_) => {
                self.corrupt();
                return None;
            }
        };
        let Some(p) = event.payload else {
            return None;
        };
        let at = timestamp(event.timestamp.as_deref());
        let correlated = self.task.as_ref().is_some_and(|t| {
            p.turn_id
                .as_ref()
                .is_none_or(|id| Some(id) == t.id.as_ref())
        });
        if event.kind == "response_item" {
            // Only metadata fields are deserialized; all content/arguments/results are ignored.
            self.response_item(p, at);
            return None;
        }
        if event.kind != "event_msg" {
            return None;
        }
        match p.kind.as_str() {
            "item_completed" => self.completed_item(p, at),
            "task_started" | "turn_started" => {
                // A repeated start must not clear counters, tools, or the waiting state.
                if self
                    .task
                    .as_ref()
                    .is_some_and(|t| t.id.is_some() && t.id.as_ref() == p.turn_id.as_ref())
                {
                    return None;
                }
                self.activity.start(at);
                // A new start clears a previous task. IDs are required to match completion.
                self.task = Some(Task {
                    id: turn_id(p.turn_id),
                    started: at,
                    baseline: self.total.clone(),
                    invalid: false,
                    usage_seen: false,
                    rate_anchor: at,
                    ..Task::default()
                });
                self.invalid = false;
                self.updated = at;
                self.revision += 1;
            }
            "token_count" => {
                if self.task.is_some() && !correlated {
                    return None;
                }
                let Some(info) = p.info else {
                    return None;
                };
                let Some(total) = info.total_token_usage else {
                    return None;
                };
                if !total.valid() {
                    self.corrupt();
                    return None;
                }
                if self.total.as_ref().is_some_and(|old| total.decreased(old)) {
                    self.corrupt();
                }
                if let Some(t) = self.task.as_mut() {
                    // Use event timestamps, never the polling interval or current clock.
                    // Only a positive output increment advances the interval anchor;
                    // duplicate or input-only snapshots cannot refresh a stale rate.
                    if self.total.is_none() {
                        // This report is the first known cumulative snapshot, not
                        // the task's starting total. Only subsequent timed reports
                        // can define an interval; never span from the task start.
                        t.rate_anchor = at;
                    } else if let Some(delta) = self
                        .total
                        .as_ref()
                        .and_then(|old| total.output_tokens.checked_sub(old.output_tokens))
                        .filter(|delta| *delta > 0)
                    {
                        let seconds = at
                            .zip(t.rate_anchor)
                            .filter(|(end, start)| end > start)
                            .map(|(end, start)| (end - start) as f64 / 1000.);
                        if t.rate_at.is_some() {
                            if let Some(seconds) = seconds {
                                t.cadence.observe(seconds);
                            }
                        }
                        // Millisecond-quantized, nearly simultaneous records
                        // cannot support a meaningful interval rate. Keep the
                        // reported count, but don't turn a 1 ms batch into a
                        // deceptively precise tens-of-thousands Token/s spike.
                        t.interval_rate = seconds
                            .filter(|s| *s >= 0.1)
                            .map(|seconds| delta as f64 / seconds);
                        t.interval_seconds = seconds;
                        t.rate_at = at;
                        t.rate_anchor = at;
                    }
                    t.usage_seen = true;
                    // A missing task baseline keeps task totals unknown through
                    // baseline.zip(total), without discarding valid later intervals.
                }
                // last_usage is deliberately never summed or treated as a task total.
                if self.task.is_some()
                    && self
                        .total
                        .as_ref()
                        .is_some_and(|old| total.output_tokens > old.output_tokens)
                {
                    self.activity.mark("usage", at);
                }
                if self.total.as_ref() != Some(&total) {
                    self.total = Some(total);
                    self.updated = at;
                    self.usage_updated = at;
                    self.revision += 1;
                }
            }
            "task_complete" | "turn_complete" | "turn_aborted" => {
                let id = turn_id(p.turn_id);
                let Some(t) = self.task.as_ref() else {
                    return None;
                };
                if id.is_none() || id != t.id {
                    return None;
                }
                let t = self.task.take().unwrap();
                let counts = if t.invalid || !t.usage_seen {
                    None
                } else {
                    self.total
                        .as_ref()
                        .zip(t.baseline.as_ref())
                        .and_then(|(a, b)| a.delta(b))
                };
                // Only explicitly reported, matched task duration is used; no polling timestamps.
                let duration = p
                    .duration_ms
                    .filter(|n| *n > 0 && *n <= 31_536_000_000)
                    .map(|n| n as f64 / 1000.);
                let c = Completed {
                    key: format!("{}:{}", t.id.unwrap(), t.started.unwrap_or(0)),
                    started_at: t.started.or(at).unwrap_or(0),
                    duration,
                    output: counts.map(|c| c.0),
                    reasoning: counts.and_then(|c| c.1),
                    rate: counts.zip(duration).map(|(c, s)| c.0 as f64 / s),
                    reason: if p.kind != "turn_aborted" {
                        "completed"
                    } else {
                        "aborted"
                    },
                };
                self.completed_at = at;
                self.activity.finish(c.reason, at);
                self.completed = Some(c.clone());
                self.updated = at;
                self.revision += 1;
                return Some(c);
            }
            _ => self.legacy_progress_item(p, at),
        }
        None
    }
    #[cfg(test)]
    pub fn sample(&self, id: &str) -> Sample {
        self.sample_at(id, crate::data::now())
    }
    #[cfg(test)]
    fn sample_at(&self, id: &str, now: i64) -> Sample {
        self.sample_with_timeout(id, now, 30)
    }
    #[cfg(test)]
    fn sample_with_timeout(&self, id: &str, now: i64, idle_seconds: u32) -> Sample {
        self.sample_with_policy(id, now, idle_seconds, false)
    }
    fn sample_with_policy(&self, id: &str, now: i64, idle_seconds: u32, adaptive: bool) -> Sample {
        let mut s = Sample::default();
        let (timeout, typical, count) = self
            .task
            .as_ref()
            .map(|t| t.cadence.policy(idle_seconds, adaptive))
            .unwrap_or((idle_seconds.clamp(10, 120), None, 0));
        s.rate_idle_seconds = timeout;
        s.retention_mode = if adaptive { "adaptive" } else { "fixed" }.into();
        s.expected_report_seconds = typical;
        s.cadence_samples = count;
        s.log_id = Some(id.into());
        s.task_unfinished = self.task.is_some();
        s.log_updated_at = self.updated;
        s.usage_updated_at = self.usage_updated;
        s.measurement_id = Some(format!("{id}:{}", self.revision));
        if let Some(u) = &self.total {
            s.total_output_tokens = Some(u.output_tokens);
            s.total_reasoning_tokens = u.reasoning_output_tokens;
        }
        let counts = self
            .task
            .as_ref()
            .filter(|t| !t.invalid && t.usage_seen)
            .and_then(|t| self.total.as_ref().zip(t.baseline.as_ref()))
            .and_then(|(a, b)| a.delta(b));
        if self.task.is_some() {
            s.state = "running".into();
            let task = self.task.as_ref().unwrap();
            s.rate_updated_at = task.rate_at;
            let active = self
                .activity
                .at
                .is_some_and(|at| now >= at && now - at < i64::from(s.rate_idle_seconds) * 1000);
            let fresh = task
                .rate_at
                .is_some_and(|at| now >= at && now - at < RATE_FRESH_MS);
            if task.invalid {
                s.message = "任务用量记录不完整；区间速率暂不可用".into();
            } else if task.interval_seconds.is_some_and(|s| s > 0. && s < 0.1) {
                s.rate_interval_seconds = task.interval_seconds;
                s.rate_status = "insufficient_interval".into();
                s.message = "日志用量区间不足 100 毫秒；保留计数，暂不计算速率".into();
            } else if task.rate_at.is_some_and(|at| at > now)
                || (task.rate_at.is_some() && task.interval_rate.is_none())
                || (task.rate_anchor.is_none() && counts.is_some_and(|c| c.0 > 0))
            {
                s.message = "用量时间不完整；当前速率不可计算".into();
            } else if fresh {
                s.current_rate = task.interval_rate;
                s.rate_interval_seconds = task.interval_seconds;
                s.rate_status = "reported_interval".into();
                s.message = if s.current_rate.is_some() {
                    "最近日志区间均速；不是瞬时生成速度"
                } else {
                    "用量时间不完整；当前速率不可计算"
                }
                .into();
            } else if active && task.interval_rate.is_some() && task.rate_at.is_some() {
                s.current_rate = task.interval_rate;
                s.rate_interval_seconds = task.interval_seconds;
                s.rate_status = "held_interval".into();
                s.message = "保留上次报告速率；仍有活动记录，不代表当前生成速度".into();
            } else {
                s.current_rate = None;
                s.rate_status = "no_recent_usage".into();
                s.message = "等待有效输出报告；静默或批量上报期间速率未知，不表示零输出".into();
            }
            s.output_tokens = counts.map(|c| c.0);
            s.reasoning_tokens = counts.and_then(|c| c.1);
            s.running_seconds = self
                .task
                .as_ref()
                .and_then(|t| t.started)
                .filter(|start| now > *start)
                .map(|start| (now - start) as f64 / 1000.);
        } else if let Some(c) = &self.completed {
            s.state = c.reason.into();
            s.message = if c.reason == "completed" {
                "最近任务已完成"
            } else {
                "最近任务已中止"
            }
            .into();
            s.current_rate = Some(0.);
            s.rate_status = "idle".into();
            s.output_tokens = c.output;
            s.reasoning_tokens = c.reasoning;
            s.rate = c.rate;
            s.observed_seconds = c.duration;
            if let Some(ended_at) = self
                .completed_at
                .filter(|at| now >= *at && now - *at < 12000)
            {
                s.completion = Some(crate::data::CompletionCard {
                    id: format!("{id}:{}", c.key),
                    ended_at,
                    output_tokens: c.output,
                    duration: c.duration,
                    average_rate: c.rate,
                    reason: c.reason,
                });
            }
            s.measurement_id = Some(format!("{id}:{}", c.key));
        } else {
            s.state = "waiting".into();
            s.message = "等待兼容的用量事件；不补算字符 Token".into();
        }
        if self.invalid {
            s.state = "incomplete".into();
            s.message = "日志出现重置或不完整记录；任务计数和速率不作推断".into();
            s.output_tokens = None;
            s.reasoning_tokens = None;
            s.rate = None;
            s.current_rate = None;
            s.rate_updated_at = None;
            s.rate_status = "unavailable".into();
            s.rate_interval_seconds = None;
        }
        s.quality = if self.total.is_some() {
            "reported"
        } else {
            "unavailable"
        }
        .into();
        let (status, age, pending, events) = self.activity.snapshot(
            self.task.is_some(),
            self.task.is_none() && self.completed.is_some(),
            now,
        );
        s.activity_status = if self.invalid {
            "unknown".into()
        } else {
            status
        };
        s.activity_at = self.activity.at;
        s.activity_age_seconds = age;
        s.pending_tools = pending;
        s.activities = events;
        s.pulses = self.activity.pulses();
        s.usage_age_seconds = self
            .usage_updated
            .filter(|at| now >= *at)
            .map(|at| (now - at) as f64 / 1000.);
        s
    }
}

pub struct Tail {
    root: PathBuf,
    id: String,
    offset: u64,
    identity: Option<(u64, u64)>,
    boundary: Option<u64>,
    pending: Vec<u8>,
    skipping: bool,
    skipped_header: Option<Header>,
    catching_up: bool,
    parser: Parser,
    initialized: bool,
    live_completion: Option<String>,
}
impl Tail {
    pub fn known_open(&self) -> bool {
        self.initialized && self.parser.task.is_some()
    }
    pub fn failure_sample(&self, message: String) -> Sample {
        Sample {
            log_id: Some(self.id.clone()),
            task_unfinished: self.known_open(),
            state: "unavailable".into(),
            message,
            checked_at: Some(crate::data::now()),
            ..Sample::default()
        }
    }
    // Fingerprints remain in memory only. Detect same-inode rewrites even when
    // the replacement is longer, without retaining or exposing source bytes.
    fn boundary_hash(f: &mut File, offset: u64) -> Result<u64, String> {
        use std::hash::{Hash, Hasher};
        let count = offset.min(4096) as usize;
        let mut bytes = [0u8; 4096];
        let mut hash = std::collections::hash_map::DefaultHasher::new();
        f.seek(SeekFrom::Start(0)).map_err(|_| "无法验证日志边界")?;
        f.read_exact(&mut bytes[..count])
            .map_err(|_| "无法验证日志边界")?;
        bytes[..count].hash(&mut hash);
        if offset > 4096 {
            f.seek(SeekFrom::Start(offset - count as u64))
                .map_err(|_| "无法验证日志边界")?;
            f.read_exact(&mut bytes[..count])
                .map_err(|_| "无法验证日志边界")?;
            bytes[..count].hash(&mut hash);
        }
        Ok(hash.finish())
    }

    pub fn new(root: PathBuf, id: String) -> Self {
        Self {
            root,
            id,
            offset: 0,
            identity: None,
            boundary: None,
            pending: vec![],
            skipping: false,
            skipped_header: None,
            catching_up: true,
            parser: Parser::default(),
            initialized: false,
            live_completion: None,
        }
    }
    #[cfg(test)]
    pub fn poll(&mut self) -> Result<(Sample, Vec<Completed>), String> {
        self.poll_with_timeout(30)
    }
    #[cfg(test)]
    pub fn poll_with_timeout(
        &mut self,
        idle_seconds: u32,
    ) -> Result<(Sample, Vec<Completed>), String> {
        self.poll_with_policy(idle_seconds, false)
    }
    pub fn poll_with_policy(
        &mut self,
        idle_seconds: u32,
        adaptive: bool,
    ) -> Result<(Sample, Vec<Completed>), String> {
        let path = resolve(&self.root, &self.id)?;
        let mut f = File::open(path).map_err(|_| "无法打开所选日志")?;
        let meta = f.metadata().map_err(|_| "无法读取日志元数据")?;
        #[cfg(unix)]
        let identity = {
            use std::os::unix::fs::MetadataExt;
            (meta.dev(), meta.ino())
        };
        #[cfg(not(unix))]
        let identity = (0, 0);
        let replaced = self.identity.is_some_and(|i| i != identity) || meta.len() < self.offset;
        let rewritten = if replaced {
            false
        } else if let Some(old) = self.boundary {
            old != Self::boundary_hash(&mut f, self.offset)?
        } else {
            false
        };
        if replaced || rewritten {
            self.offset = 0;
            self.pending.clear();
            self.skipping = false;
            self.skipped_header = None;
            self.catching_up = true;
            self.parser = Parser::default();
            self.initialized = false;
            self.live_completion = None;
        }
        self.identity = Some(identity);
        f.seek(SeekFrom::Start(self.offset))
            .map_err(|_| "无法定位日志增量")?;
        let mut bytes = vec![];
        Read::by_ref(&mut f)
            .take(POLL_BYTES)
            .read_to_end(&mut bytes)
            .map_err(|_| "无法读取日志增量")?;
        self.offset += bytes.len() as u64;
        self.boundary = Some(Self::boundary_hash(&mut f, self.offset)?);
        let mut completed = vec![];
        for byte in bytes {
            if byte == b'\n' {
                if let Some(header) = self.skipped_header.take() {
                    self.parser.oversized_event(header);
                }
                if !self.skipping && !self.pending.is_empty() {
                    if let Some(c) = self.parser.line(&self.pending) {
                        if self.initialized {
                            self.live_completion = Some(format!("{}:{}", self.id, c.key));
                            completed.push(c);
                        }
                    }
                }
                self.pending.clear();
                self.skipping = false;
            } else if !self.skipping {
                if self.pending.len() >= MAX_LINE {
                    // Large bodies are discarded; allowlisted progress metadata can
                    // survive. Usage/lifecycle records still require full parsing.
                    let mut header = Header::default();
                    use serde::de::DeserializeSeed;
                    let _ = Probe {
                        header: &mut header,
                        nested: false,
                        item: false,
                    }
                    .deserialize(&mut serde_json::Deserializer::from_slice(
                        &self.pending[..self.pending.len().min(4096)],
                    ));
                    if relevant(&self.pending) != Some(false) && !header.safe_to_skip_body() {
                        self.parser.corrupt();
                    }
                    if header.safe_to_skip_body() {
                        self.skipped_header = Some(header);
                    }
                    self.pending.clear();
                    self.skipping = true;
                } else {
                    self.pending.push(byte);
                }
            }
        }
        if !self.initialized {
            // Replaying an existing file establishes counters/anchors only. It must
            // never replay a historical burst as current output, even if recent.
            if let Some(task) = self.parser.task.as_mut() {
                task.interval_rate = None;
                task.rate_at = None;
                task.interval_seconds = None;
            }
        }
        let mut sample =
            self.parser
                .sample_with_policy(&self.id, crate::data::now(), idle_seconds, adaptive);
        if sample
            .completion
            .as_ref()
            .is_some_and(|c| Some(&c.id) != self.live_completion.as_ref())
        {
            sample.completion = None;
        }
        self.catching_up = self.offset < meta.len();
        if !self.catching_up {
            self.initialized = true;
        } else {
            sample.activity_status = "unknown".into();
            sample.activities.clear();
            sample.pulses.clear();
            sample.completion = None;
            sample.state = "loading".into();
            sample.message = "正在读取所选日志的用量元数据".into();
            sample.rate = None;
            sample.output_tokens = None;
            sample.reasoning_tokens = None;
            sample.observed_seconds = None;
            sample.running_seconds = None;
            sample.current_rate = None;
            sample.rate_updated_at = None;
            sample.rate_status = "unavailable".into();
            sample.rate_interval_seconds = None;
        }
        Ok((sample, completed))
    }
    pub fn is_loading(&self) -> bool {
        !self.initialized || self.catching_up
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn failed_source_keeps_only_a_confirmed_open_task_without_old_measurements() {
        let mut reader = Tail::new(PathBuf::new(), "aaaa.jsonl".into());
        count(&mut reader.parser, 100, 10);
        start(&mut reader.parser);
        count(&mut reader.parser, 120, 12);
        // An incomplete initial history replay cannot prove a live open task.
        assert!(!reader.failure_sample("unreadable".into()).unfinished());
        reader.initialized = true;
        let failed = reader.failure_sample("unreadable".into());
        assert!(failed.unfinished());
        assert_eq!(failed.state, "unavailable");
        assert_eq!(failed.log_id.as_deref(), Some("aaaa.jsonl"));
        assert!(failed.output_tokens.is_none() && failed.total_output_tokens.is_none());
        assert!(failed.current_rate.is_none() && failed.rate.is_none());
        assert!(failed.pulses.is_empty() && failed.activities.is_empty());
        assert!(failed.completion.is_none());
        end(&mut reader.parser, Some(1000));
        assert!(!reader.failure_sample("unreadable".into()).unfinished());
    }
    fn send(p: &mut Parser, payload: serde_json::Value) -> Option<Completed> {
        p.line(serde_json::json!({"type":"event_msg","timestamp":"2026-10-21T10:00:00Z","payload":payload}).to_string().as_bytes())
    }
    fn count(p: &mut Parser, n: u64, r: u64) {
        send(
            p,
            serde_json::json!({"type":"token_count","info":{"total_token_usage":{"output_tokens":n,"reasoning_output_tokens":r},"last_token_usage":{"output_tokens":99}}}),
        );
    }
    fn start(p: &mut Parser) {
        send(p, serde_json::json!({"type":"task_started","turn_id":"t1"}));
    }
    fn end(p: &mut Parser, d: Option<u64>) -> Completed {
        send(
            p,
            serde_json::json!({"type":"task_complete","turn_id":"t1","duration_ms":d}),
        )
        .unwrap()
    }
    #[test]
    fn discovery_excludes_internal_guardian_reviews_but_keeps_user_work() {
        let dir=std::env::temp_dir().join(format!("pulse-source-kinds-{}",crate::data::now()));
        fs::create_dir_all(&dir).unwrap();
        for (id,source) in [("1001.jsonl","guardian_review"),("1002.jsonl","user")] {
            let line=format!("{{\"type\":\"session_meta\",\"payload\":{{\"thread_source\":\"{source}\",\"base_instructions\":\"{}\"}}}}\n", "PRIVATE_INSTRUCTIONS".repeat(1000));
            fs::write(dir.join(id),line).unwrap();
        }
        let files=list(&dir).unwrap();
        assert_eq!(files.len(),1);
        assert_eq!(files[0].id,"1002.jsonl");
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn paginated_progress_requires_a_matching_turn_and_ignores_bodies() {
        let mut p = active_parser();
        at(&mut p, 5000, serde_json::json!({"type":"item_completed","turn_id":"t1","item":{"type":"reasoning","id":"r1","content":"PRIVATE_REASONING"}}));
        assert_eq!(p.activity.phase, "reasoning");
        for turn in [Some("other"),None] {
            at(&mut p, 6000, serde_json::json!({"type":"item_completed","turn_id":turn,"item":{"type":"agentMessage","id":"m1"}}));
            assert_eq!(p.activity.phase, "reasoning");
        }
        at(&mut p, 7000, serde_json::json!({"type":"item_completed","turn_id":"t1","item":{"type":"userMessage","id":"u1","text":"PRIVATE_USER"}}));
        assert_eq!(p.activity.phase, "reasoning");
        at(&mut p, 8000, serde_json::json!({"type":"item_completed","turn_id":"t1","item":{"type":"agentMessage","id":"m1","text":"PRIVATE_REPLY"}}));
        assert_eq!(p.activity.phase, "message");
        assert!(!serde_json::to_string(&p.sample("a.jsonl")).unwrap().contains("PRIVATE_"));
    }
    #[test]
    fn oversized_paginated_items_keep_only_correlated_metadata() {
        use serde::de::DeserializeSeed;
        let mut p = active_parser();
        let prefix=br#"{"timestamp":"1970-01-01T00:00:05Z","type":"event_msg","payload":{"type":"item_completed","turn_id":"t1","item":{"type":"agentMessage","id":"m1","text":"PRIVATE_SYNTHETIC_BODY"#;
        let mut header=Header::default();
        let _=Probe { header:&mut header,nested:false,item:false }
            .deserialize(&mut serde_json::Deserializer::from_slice(prefix));
        assert!(header.safe_to_skip_body());
        p.oversized_event(header);
        assert_eq!(p.activity.phase,"message");
        assert!(!p.invalid);
        assert!(!serde_json::to_string(&p.sample("a.jsonl")).unwrap().contains("PRIVATE_"));
    }
    #[test]
    fn paginated_tool_completion_clears_its_call_without_inventing_usage() {
        let mut p = Parser::default();
        start(&mut p);
        p.activity.tool_start(Some("call_1".into()), Some(1792576800000));
        send(&mut p, serde_json::json!({"type":"item_completed","turn_id":"t1","item":{"type":"mcpToolCall","id":"call_1","result":{"body":"PRIVATE_RESULT"}}}));
        assert_eq!(p.activity.phase,"tool_finished");
        assert_eq!(p.activity.snapshot(true,false,1792576800000).2,0);
        assert!(!p.task.as_ref().unwrap().usage_seen);
    }
    fn response(p: &mut Parser, millis: i64, payload: serde_json::Value) {
        let ts = OffsetDateTime::from_unix_timestamp_nanos(millis as i128 * 1_000_000)
            .unwrap()
            .format(&Rfc3339)
            .unwrap();
        p.line(
            serde_json::json!({"type":"response_item","timestamp":ts,"payload":payload})
                .to_string()
                .as_bytes(),
        );
    }
    #[test]
    fn lifecycle_progress_works_without_any_token_baseline() {
        let mut p = Parser::default();
        at(
            &mut p,
            1000,
            serde_json::json!({"type":"task_started","turn_id":"t1"}),
        );
        response(
            &mut p,
            2000,
            serde_json::json!({"type":"reasoning","summary":"PRIVATE_REASONING"}),
        );
        let s = p.sample_at("a.jsonl", 3000);
        assert_eq!(s.activity_status, "reasoning");
        assert_eq!(s.current_rate, None);
        assert_eq!(p.sample_at("a.jsonl", 32000).activity_status, "quiet");
        response(
            &mut p,
            33000,
            serde_json::json!({"type":"message","role":"assistant","content":"PRIVATE_REPLY"}),
        );
        assert_eq!(p.sample_at("a.jsonl", 34000).activity_status, "responding");
        let json = serde_json::to_string(&p.sample_at("a.jsonl", 34000)).unwrap();
        assert!(!json.contains("PRIVATE"));
        assert!(!json.contains("summary"));
        assert!(!json.contains("content"));
    }
    #[test]
    fn tool_metadata_pairs_calls_without_retaining_arguments_or_results() {
        let mut p = active_parser();
        response(
            &mut p,
            5000,
            serde_json::json!({"type":"function_call","call_id":"call_a","arguments":"PRIVATE_ARGS"}),
        );
        response(
            &mut p,
            6000,
            serde_json::json!({"type":"custom_tool_call","call_id":"call_b","input":"PRIVATE_INPUT"}),
        );
        response(
            &mut p,
            7000,
            serde_json::json!({"type":"function_call_output","call_id":"call_a","output":"PRIVATE_RESULT"}),
        );
        let s = p.sample_at("a.jsonl", 8000);
        assert_eq!(s.activity_status, "tool");
        assert_eq!(s.pending_tools, 1);
        response(
            &mut p,
            9000,
            serde_json::json!({"type":"custom_tool_call_output","call_id":"call_b"}),
        );
        let s = p.sample_at("a.jsonl", 10000);
        assert_eq!(s.activity_status, "processing");
        assert_eq!(s.pending_tools, 0);
        let json = serde_json::to_string(&s).unwrap();
        assert!(!json.contains("PRIVATE"));
        assert!(!json.contains("call_b"));
    }
    #[test]
    fn unrelated_user_and_tool_results_do_not_fabricate_progress() {
        let mut p = active_parser();
        let before = p.sample_at("a.jsonl", 5000).activity_at;
        response(
            &mut p,
            6000,
            serde_json::json!({"type":"message","role":"user","content":"PRIVATE_USER"}),
        );
        response(
            &mut p,
            7000,
            serde_json::json!({"type":"function_call_output","call_id":"unknown"}),
        );
        at(
            &mut p,
            8000,
            serde_json::json!({"type":"request_user_input","turn_id":"wrong"}),
        );
        assert_eq!(p.sample_at("a.jsonl", 9000).activity_at, before);
    }
    #[test]
    fn explicit_approval_and_question_waits_require_events_and_resume_on_progress() {
        for kind in [
            "exec_approval_request",
            "apply_patch_approval_request",
            "request_user_input",
        ] {
            let mut p = active_parser();
            at(
                &mut p,
                5000,
                serde_json::json!({"type":kind,"turn_id":"t1","questions":"PRIVATE_QUESTION","reason":"PRIVATE_REASON"}),
            );
            let status = if kind == "request_user_input" {
                "waiting_user"
            } else {
                "waiting_approval"
            };
            assert_eq!(p.sample_at("a.jsonl", 6000).activity_status, status);
            response(&mut p, 7000, serde_json::json!({"type":"reasoning"}));
            assert_eq!(p.sample_at("a.jsonl", 8000).activity_status, "reasoning");
        }
    }
    #[test]
    fn duplicate_start_does_not_reset_live_tools_or_usage() {
        let mut p = active_parser();
        response(
            &mut p,
            5000,
            serde_json::json!({"type":"function_call","call_id":"call_a"}),
        );
        at(
            &mut p,
            6000,
            serde_json::json!({"type":"task_started","turn_id":"t1"}),
        );
        let s = p.sample_at("a.jsonl", 7000);
        assert_eq!(s.output_tokens, Some(20));
        assert_eq!(s.pending_tools, 1);
        assert_eq!(s.activity_status, "tool");
    }
    #[test]
    fn completed_state_requires_matched_end_and_v2_aliases_are_accepted() {
        let mut p = Parser::default();
        at(
            &mut p,
            1000,
            serde_json::json!({"type":"turn_started","turn_id":"t1"}),
        );
        at(
            &mut p,
            2000,
            serde_json::json!({"type":"turn_complete","turn_id":"other"}),
        );
        assert_eq!(p.sample_at("a.jsonl", 3000).activity_status, "processing");
        at(
            &mut p,
            4000,
            serde_json::json!({"type":"turn_complete","turn_id":"t1"}),
        );
        assert_eq!(p.sample_at("a.jsonl", 5000).activity_status, "completed");
        response(&mut p, 6000, serde_json::json!({"type":"reasoning"}));
        assert_eq!(p.sample_at("a.jsonl", 7000).activity_status, "completed");
    }
    #[test]
    fn cumulative_updates_are_deduplicated_and_matched() {
        let mut p = Parser::default();
        count(&mut p, 100, 40);
        start(&mut p);
        count(&mut p, 120, 45);
        count(&mut p, 120, 45);
        count(&mut p, 140, 50);
        let c = end(&mut p, Some(2000));
        assert_eq!(c.output, Some(40));
        assert_eq!(c.reasoning, Some(10));
        assert_eq!(c.rate, Some(20.));
        assert!(send(
            &mut p,
            serde_json::json!({"type":"task_complete","turn_id":"t1","duration_ms":2000})
        )
        .is_none());
    }
    #[test]
    fn missing_time_preserves_count_without_rate() {
        let mut p = Parser::default();
        count(&mut p, 100, 10);
        start(&mut p);
        count(&mut p, 120, 13);
        let c = end(&mut p, None);
        assert_eq!(c.output, Some(20));
        assert_eq!(c.rate, None);
    }
    #[test]
    fn no_baseline_does_not_guess_from_last_request() {
        let mut p = Parser::default();
        start(&mut p);
        count(&mut p, 120, 13);
        let c = end(&mut p, Some(1000));
        assert_eq!(c.output, None);
        assert_eq!(p.sample("a.jsonl").total_output_tokens, Some(120));
        assert_eq!(c.rate, None);
    }
    #[test]
    fn first_turn_without_task_baseline_reports_real_intervals() {
        let mut p = Parser::default();
        at(&mut p, 1_000, serde_json::json!({"type":"task_started","turn_id":"first"}));
        usage_at(&mut p, 213_000, 1_000);
        let first = p.sample_at("a.jsonl", 213_000);
        assert_eq!(first.total_output_tokens, Some(1_000));
        assert_eq!(first.output_tokens, None);
        assert_eq!(first.current_rate, None);
        usage_at(&mut p, 223_000, 1_020);
        let next = p.sample_at("a.jsonl", 223_000);
        assert_eq!(next.output_tokens, None);
        assert_eq!(next.total_output_tokens, Some(1_020));
        assert_eq!(next.current_rate, Some(2.));
        assert_eq!(next.rate_interval_seconds, Some(10.));
        assert_eq!(next.rate_status, "reported_interval");
        // The valid interval cannot retroactively establish the task's starting total.
        let completed = at(&mut p, 230_000, serde_json::json!({"type":"task_complete","turn_id":"first","duration_ms":229_000})).unwrap();
        assert_eq!(completed.output, None);
        assert_eq!(completed.rate, None);
    }
    #[test]
    fn first_turn_interval_requires_two_timestamped_reports_and_rejects_resets() {
        let mut p = Parser::default();
        at(&mut p, 1_000, serde_json::json!({"type":"task_started","turn_id":"first"}));
        p.line(br#"{"type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"output_tokens":100}}}}"#);
        usage_at(&mut p, 10_000, 120);
        assert_eq!(p.sample_at("a.jsonl", 10_000).current_rate, None);
        usage_at(&mut p, 20_000, 140);
        assert_eq!(p.sample_at("a.jsonl", 20_000).current_rate, Some(2.));
        usage_at(&mut p, 30_000, 10);
        let reset = p.sample_at("a.jsonl", 30_000);
        assert_eq!(reset.current_rate, None);
        assert_eq!(reset.output_tokens, None);
        assert_eq!(reset.state, "incomplete");
    }
    #[test]
    fn reset_and_malformed_data_invalidate_task() {
        for corrupt in [false, true] {
            let mut p = Parser::default();
            count(&mut p, 100, 10);
            start(&mut p);
            if corrupt {
                p.line(b"{broken}");
            } else {
                count(&mut p, 20, 2);
            }
            count(&mut p, 110, 12);
            assert_eq!(end(&mut p, Some(1000)).rate, None);
        }
    }
    #[test]
    fn mismatched_completion_cannot_supply_time() {
        let mut p = Parser::default();
        count(&mut p, 100, 10);
        start(&mut p);
        count(&mut p, 120, 13);
        assert!(send(
            &mut p,
            serde_json::json!({"type":"task_complete","turn_id":"other","duration_ms":1})
        )
        .is_none());
        assert_eq!(p.sample("a.jsonl").rate, None);
    }
    #[test]
    fn invalid_usage_and_reasoning_missing_are_not_zero() {
        let mut p = Parser::default();
        count(&mut p, 100, 110);
        assert_eq!(p.sample("a.jsonl").total_output_tokens, None);
        send(
            &mut p,
            serde_json::json!({"type":"token_count","info":{"total_token_usage":{"output_tokens":50}}}),
        );
        assert_eq!(p.sample("a.jsonl").total_reasoning_tokens, None);
    }
    #[test]
    fn unknown_content_is_not_serialized() {
        let mut p = Parser::default();
        p.line(br#"{"type":"response_item","payload":{"content":"PRIVATE_SENTINEL"}}"#);
        count(&mut p, 10, 2);
        let s = serde_json::to_string(&p.sample("a.jsonl")).unwrap();
        assert!(!s.contains("PRIVATE_SENTINEL"));
        assert!(!s.contains("last_token_usage"));
    }
    #[test]
    fn traversal_is_rejected() {
        for id in [
            "../a.jsonl",
            "/a.jsonl",
            "a/../../b.jsonl",
            "a.txt",
            "secret title.jsonl",
        ] {
            assert!(!safe_id(id));
        }
    }
    #[test]
    fn no_usage_event_is_unknown_instead_of_zero() {
        let mut p = Parser::default();
        count(&mut p, 100, 10);
        start(&mut p);
        assert_eq!(end(&mut p, Some(1000)).output, None);
    }
    fn at(p: &mut Parser, millis: i64, payload: serde_json::Value) -> Option<Completed> {
        let ts = OffsetDateTime::from_unix_timestamp_nanos(millis as i128 * 1_000_000)
            .unwrap()
            .format(&Rfc3339)
            .unwrap();
        p.line(
            serde_json::json!({"type":"event_msg","timestamp":ts,"payload":payload})
                .to_string()
                .as_bytes(),
        )
    }
    fn usage_at(p: &mut Parser, millis: i64, output: u64) {
        at(
            p,
            millis,
            serde_json::json!({"type":"token_count","info":{"total_token_usage":{"output_tokens":output}}}),
        );
    }
    fn active_parser() -> Parser {
        let mut p = Parser::default();
        usage_at(&mut p, 1_000, 100);
        at(
            &mut p,
            2_000,
            serde_json::json!({"type":"task_started","turn_id":"t1"}),
        );
        usage_at(&mut p, 4_000, 120);
        p
    }
    #[test]
    fn interval_rate_holds_then_expires_without_polling_decay() {
        let mut p = active_parser();
        for now in [4_000, 5_000, 8_999] {
            let s = p.sample_at("a.jsonl", now);
            assert_eq!(s.current_rate, Some(10.));
            assert_eq!(s.output_tokens, Some(20));
            assert_eq!(s.rate_interval_seconds, Some(2.));
        }
        // A repeated snapshot is not new output and cannot refresh the idle expiry.
        usage_at(&mut p, 8_000, 120);
        let held = p.sample_at("a.jsonl", 9_000);
        assert_eq!(held.current_rate, Some(10.));
        assert_eq!(held.rate_status, "held_interval");
        let stale = p.sample_at("a.jsonl", 34_000);
        assert_eq!(stale.current_rate, None);
        assert_eq!(stale.rate_status, "no_recent_usage");
        assert_eq!(stale.output_tokens, Some(20));
        usage_at(&mut p, 14_000, 160);
        let fresh = p.sample_at("a.jsonl", 14_000);
        assert_eq!(fresh.current_rate, Some(4.)); // 40 / 10 event seconds, never / poll interval
        assert_eq!(fresh.rate_interval_seconds, Some(10.));
    }
    #[test]
    fn completion_and_abort_zero_current_rate_but_keep_final_average() {
        for kind in ["task_complete", "turn_aborted"] {
            let mut p = active_parser();
            at(
                &mut p,
                5_000,
                serde_json::json!({"type":kind,"turn_id":"t1","duration_ms":10_000}),
            );
            let s = p.sample_at("a.jsonl", 5_000);
            assert_eq!(s.current_rate, Some(0.));
            assert_eq!(s.rate_status, "idle");
            assert_eq!(s.rate, Some(2.));
            at(
                &mut p,
                6_000,
                serde_json::json!({"type":"task_started","turn_id":"t2"}),
            );
            let s = p.sample_at("a.jsonl", 6_000);
            assert_eq!(s.current_rate, None);
            assert_eq!(s.rate, None); // next task cannot inherit previous average
        }
    }
    #[test]
    fn unavailable_data_is_not_reported_as_idle_zero() {
        assert_eq!(
            Parser::default().sample_at("a.jsonl", 5_000).current_rate,
            None
        );
        let mut p = active_parser();
        p.corrupt();
        assert_eq!(p.sample_at("a.jsonl", 5_000).current_rate, None);
        let mut p = Parser::default();
        start(&mut p);
        count(&mut p, 120, 13);
        assert_eq!(p.sample("a.jsonl").current_rate, None);
    }
    #[test]
    fn duplicate_or_invalid_timestamps_cannot_create_infinite_rate() {
        let mut p = active_parser();
        usage_at(&mut p, 4_000, 140); // same timestamp, positive count
        assert_eq!(p.sample_at("a.jsonl", 4_000).current_rate, None);
        usage_at(&mut p, 3_000, 160); // regressing clock
        assert_eq!(p.sample_at("a.jsonl", 4_000).current_rate, None);
        assert_eq!(p.sample_at("a.jsonl", 20_000).current_rate, None);
    }
    #[test]
    fn near_simultaneous_usage_keeps_counts_without_millisecond_rate_spikes() {
        let mut p = active_parser();
        usage_at(&mut p, 4001, 140);
        let short = p.sample_at("a.jsonl", 4001);
        assert_eq!(short.output_tokens, Some(40));
        assert_eq!(short.current_rate, None);
        assert_eq!(short.rate_status, "insufficient_interval");
        assert_eq!(short.rate_interval_seconds, Some(0.001));
        usage_at(&mut p, 5001, 160);
        let recovered = p.sample_at("a.jsonl", 5001);
        assert_eq!(recovered.output_tokens, Some(60));
        assert_eq!(recovered.current_rate, Some(20.));
        at(
            &mut p,
            6000,
            serde_json::json!({"type":"task_complete","turn_id":"t1","duration_ms":4000}),
        );
        let ended = p.sample_at("a.jsonl", 6000);
        assert_eq!(ended.current_rate, Some(0.));
        assert_eq!(ended.rate, Some(15.));
    }
    #[test]
    fn missing_or_future_event_time_is_unavailable_not_zero() {
        let mut p = active_parser();
        let line = serde_json::json!({"type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"output_tokens":140}}}});
        p.line(line.to_string().as_bytes());
        assert_eq!(p.sample_at("a.jsonl", 5_000).current_rate, None);
        let p = active_parser();
        assert_eq!(p.sample_at("a.jsonl", 3_000).current_rate, None);
    }
    #[test]
    fn input_only_updates_do_not_extend_output_freshness() {
        let mut p = active_parser();
        at(
            &mut p,
            8_000,
            serde_json::json!({"type":"token_count","info":{"total_token_usage":{"output_tokens":120,"input_tokens":500}}}),
        );
        assert_eq!(p.sample_at("a.jsonl", 9_000).rate_status, "held_interval");
        assert_eq!(p.sample_at("a.jsonl", 34_000).current_rate, None);
        usage_at(&mut p, 14_000, 160);
        assert_eq!(p.sample_at("a.jsonl", 14_000).current_rate, Some(4.));
    }
    #[test]
    fn meaningful_activity_keeps_last_rate_with_original_timestamp_and_configurable_expiry() {
        let mut p = active_parser();
        response(&mut p, 29000, serde_json::json!({"type":"reasoning"}));
        let held = p.sample_at("a.jsonl", 58000);
        assert_eq!(held.current_rate, Some(10.));
        assert_eq!(held.rate_status, "held_interval");
        assert_eq!(held.rate_updated_at, Some(4000));
        assert_eq!(held.output_tokens, Some(20));
        assert_eq!(p.sample_at("a.jsonl", 59000).current_rate, None);
        assert_eq!(
            p.sample_with_timeout("a.jsonl", 58000, 60).current_rate,
            Some(10.)
        );
        assert_eq!(
            p.sample_with_timeout("a.jsonl", 58000, 15).current_rate,
            None
        );
        usage_at(&mut p, 60000, 160);
        assert_eq!(
            p.sample_at("a.jsonl", 61000).rate_status,
            "reported_interval"
        );
        at(
            &mut p,
            62000,
            serde_json::json!({"type":"task_complete","turn_id":"t1","duration_ms":60000}),
        );
        assert_eq!(
            p.sample_with_timeout("a.jsonl", 62000, 120).current_rate,
            Some(0.)
        );
    }
    #[test]
    fn adaptive_policy_learns_only_positive_reports_and_new_turn_resets_it() {
        let mut p = active_parser();
        for (at, n) in [(24000, 140), (49000, 160), (79000, 180)] {
            usage_at(&mut p, at, n);
        }
        let s = p.sample_with_policy("a.jsonl", 80000, 30, true);
        assert_eq!(s.rate_idle_seconds, 60);
        assert_eq!(s.cadence_samples, 3);
        assert_eq!(
            p.sample_with_policy("a.jsonl", 80000, 30, false)
                .rate_idle_seconds,
            30
        );
        at(
            &mut p,
            81000,
            serde_json::json!({"type":"task_started","turn_id":"new"}),
        );
        assert_eq!(
            p.sample_with_policy("a.jsonl", 82000, 30, true)
                .cadence_samples,
            0
        );
    }
    #[test]
    fn settlement_uses_event_time_and_cannot_survive_new_task_or_expiry() {
        let mut p = active_parser();
        at(
            &mut p,
            5000,
            serde_json::json!({"type":"task_complete","turn_id":"t1","duration_ms":10000}),
        );
        let s = p.sample_at("a.jsonl", 6000);
        assert_eq!(s.completion.unwrap().average_rate, Some(2.));
        assert_eq!(s.current_rate, Some(0.));
        assert!(p.sample_at("a.jsonl", 17000).completion.is_none());
        at(
            &mut p,
            7000,
            serde_json::json!({"type":"task_started","turn_id":"t2"}),
        );
        assert!(p.sample_at("a.jsonl", 8000).completion.is_none());
    }
    #[test]
    fn recent_history_does_not_replay_settlement_but_new_completion_does() {
        use std::io::Write;
        let dir = std::env::temp_dir().join(format!("pulse-settlement-{}", crate::data::now()));
        fs::create_dir_all(&dir).unwrap();
        let now = crate::data::now();
        let event = |at: i64, payload: serde_json::Value| {
            let ts = OffsetDateTime::from_unix_timestamp_nanos(at as i128 * 1_000_000)
                .unwrap()
                .format(&Rfc3339)
                .unwrap();
            serde_json::json!({"type":"event_msg","timestamp":ts,"payload":payload}).to_string()
                + "\n"
        };
        let usage = |n| serde_json::json!({"type":"token_count","info":{"total_token_usage":{"output_tokens":n}}});
        let initial = event(now - 5000, usage(100))
            + &event(
                now - 4000,
                serde_json::json!({"type":"task_started","turn_id":"old"}),
            )
            + &event(now - 3000, usage(120))
            + &event(
                now - 2000,
                serde_json::json!({"type":"task_complete","turn_id":"old","duration_ms":2000}),
            );
        let path = dir.join("a.jsonl");
        fs::write(&path, initial).unwrap();
        let mut tail = Tail::new(dir.clone(), "a.jsonl".into());
        assert!(tail.poll().unwrap().0.completion.is_none());
        let mut f = fs::OpenOptions::new().append(true).open(&path).unwrap();
        f.write_all(
            (event(
                now - 1500,
                serde_json::json!({"type":"task_started","turn_id":"new"}),
            ) + &event(now - 1000, usage(140))
                + &event(
                    now - 500,
                    serde_json::json!({"type":"task_complete","turn_id":"new","duration_ms":1000}),
                ))
                .as_bytes(),
        )
        .unwrap();
        assert_eq!(
            tail.poll().unwrap().0.completion.unwrap().average_rate,
            Some(20.)
        );
        assert!(Tail::new(dir.clone(), "a.jsonl".into())
            .poll()
            .unwrap()
            .0
            .completion
            .is_none());
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn foreign_turn_usage_cannot_poison_active_counts_or_rate() {
        let mut p = active_parser();
        at(
            &mut p,
            5000,
            serde_json::json!({"type":"token_count","turn_id":"other","info":{"total_token_usage":{"output_tokens":9000}}}),
        );
        let s = p.sample_at("a.jsonl", 5000);
        assert_eq!(s.output_tokens, Some(20));
        assert_eq!(s.total_output_tokens, Some(120));
        assert_eq!(s.current_rate, Some(10.));
        usage_at(&mut p, 6000, 140);
        assert_eq!(p.sample_at("a.jsonl", 6000).output_tokens, Some(40));
    }
    #[test]
    fn a_longer_same_inode_rewrite_discards_old_baseline() {
        use std::io::Write;
        let dir = std::env::temp_dir().join(format!("pulse-rewrite-{}", crate::data::now()));
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("a.jsonl");
        let event = |payload: serde_json::Value| {
            serde_json::json!({"type":"event_msg","timestamp":"2026-10-22T00:00:00Z","payload":payload}).to_string()+"\n"
        };
        let count = |n| serde_json::json!({"type":"token_count","info":{"total_token_usage":{"output_tokens":n}}});
        fs::write(
            &path,
            event(count(100))
                + &event(serde_json::json!({"type":"task_started","turn_id":"old"}))
                + &event(count(120)),
        )
        .unwrap();
        let mut tail = Tail::new(dir.clone(), "a.jsonl".into());
        assert_eq!(tail.poll().unwrap().0.output_tokens, Some(20));
        let old_len = fs::metadata(&path).unwrap().len();
        let new = event(count(200))
            + &event(serde_json::json!({"type":"task_started","turn_id":"new"}))
            + &event(count(205))
            + &("{\"type\":\"unrelated\"}\n".repeat(100));
        assert!(new.len() as u64 > old_len);
        fs::write(&path, new).unwrap();
        let (s, rows) = tail.poll().unwrap();
        assert_eq!(s.output_tokens, Some(5));
        assert_eq!(s.current_rate, None);
        assert!(rows.is_empty());
        let mut f = fs::OpenOptions::new().append(true).open(&path).unwrap();
        f.write_all(event(count(210)).as_bytes()).unwrap();
        assert_eq!(tail.poll().unwrap().0.output_tokens, Some(10));
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn historical_replay_never_becomes_current_output() {
        use std::io::Write;
        let dir = std::env::temp_dir().join(format!("pulse-replay-{}", crate::data::now()));
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("a.jsonl");
        let now = crate::data::now();
        let event = |at: i64, payload: serde_json::Value| {
            let ts = OffsetDateTime::from_unix_timestamp_nanos(at as i128 * 1_000_000)
                .unwrap()
                .format(&Rfc3339)
                .unwrap();
            serde_json::json!({"type":"event_msg","timestamp":ts,"payload":payload}).to_string()
                + "\n"
        };
        let count = |n| serde_json::json!({"type":"token_count","info":{"total_token_usage":{"output_tokens":n}}});
        fs::write(
            &path,
            event(now - 3000, count(100))
                + &event(
                    now - 2000,
                    serde_json::json!({"type":"task_started","turn_id":"t1"}),
                )
                + &event(now - 1000, count(120)),
        )
        .unwrap();
        let mut tail = Tail::new(dir.clone(), "a.jsonl".into());
        assert_eq!(tail.poll().unwrap().0.current_rate, None);
        let mut f = fs::OpenOptions::new().append(true).open(path).unwrap();
        f.write_all(event(now, count(140)).as_bytes()).unwrap();
        assert_eq!(tail.poll().unwrap().0.current_rate, Some(20.));
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn oversized_unrelated_records_do_not_break_usage_accounting() {
        let dir = std::env::temp_dir().join(format!("pulse-large-test-{}", crate::data::now()));
        fs::create_dir_all(&dir).unwrap();
        let event = |p: serde_json::Value| {
            serde_json::json!({"type":"event_msg","timestamp":"2026-10-21T10:00:00Z","payload":p})
                .to_string()
                + "\n"
        };
        let mut log = event(
            serde_json::json!({"type":"token_count","info":{"total_token_usage":{"output_tokens":100}}}),
        );
        log += &event(serde_json::json!({"type":"task_started","turn_id":"t1"}));
        // Generated test content, never copied from user conversations.
        log += &format!(
            "{{\"type\":\"response_item\",\"payload\":{{\"type\":\"message\",\"content\":{}}}}}\n",
            serde_json::to_string(&"x".repeat(MAX_LINE * 2)).unwrap()
        );
        log += &event(
            serde_json::json!({"type":"token_count","info":{"total_token_usage":{"output_tokens":120}}}),
        );
        log +=
            &event(serde_json::json!({"type":"task_complete","turn_id":"t1","duration_ms":2000}));
        fs::write(dir.join("a.jsonl"), log).unwrap();
        let mut t = Tail::new(dir.clone(), "a.jsonl".into());
        let (mut s, mut c) = t.poll().unwrap();
        while t.is_loading() {
            let (next, rows) = t.poll().unwrap();
            s = next;
            c.extend(rows);
        }
        assert_eq!(s.rate, Some(10.));
        assert_eq!(s.output_tokens, Some(20));
        assert!(c.is_empty());
        assert!(t.poll().unwrap().1.is_empty());
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn oversized_tool_results_close_the_matching_call_without_retaining_body() {
        use std::io::Write;
        let dir = std::env::temp_dir().join(format!("pulse-large-tool-{}", crate::data::now()));
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("a.jsonl");
        let stamp =
            OffsetDateTime::from_unix_timestamp_nanos(crate::data::now() as i128 * 1_000_000)
                .unwrap()
                .format(&Rfc3339)
                .unwrap();
        fs::write(&path,format!("{{\"timestamp\":\"{stamp}\",\"type\":\"event_msg\",\"payload\":{{\"type\":\"task_started\",\"turn_id\":\"t1\"}}}}\n{{\"timestamp\":\"{stamp}\",\"type\":\"response_item\",\"payload\":{{\"type\":\"function_call\",\"call_id\":\"large_call\",\"arguments\":\"ignored\"}}}}\n")).unwrap();
        let mut tail = Tail::new(dir.clone(), "a.jsonl".into());
        assert_eq!(tail.poll().unwrap().0.pending_tools, 1);
        let mut f = fs::OpenOptions::new().append(true).open(&path).unwrap();
        let prefix=format!("{{\"timestamp\":\"{stamp}\",\"type\":\"response_item\",\"payload\":{{\"type\":\"function_call_output\",\"call_id\":\"large_call\",\"output\":\"");
        f.write_all(prefix.as_bytes()).unwrap();
        f.write_all("PRIVATE_SYNTHETIC_SENTINEL".repeat(MAX_LINE / 8).as_bytes())
            .unwrap();
        loop {
            let s = tail.poll().unwrap().0;
            if !tail.is_loading() {
                assert_eq!(s.pending_tools, 1);
                break;
            }
        }
        f.write_all(b"\"}}\n").unwrap();
        let s = tail.poll().unwrap().0;
        assert_eq!(
            s.pending_tools, 0,
            "a large tool result must not leave its call permanently running"
        );
        assert!(!serde_json::to_string(&s)
            .unwrap()
            .contains("PRIVATE_SYNTHETIC_SENTINEL"));
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn oversized_prefixes_keep_only_allowlisted_ids_and_never_close_foreign_calls() {
        use serde::de::DeserializeSeed;
        let mut p = active_parser();
        for kind in ["function_call", "custom_tool_call"] {
            let input=format!("{{\"timestamp\":\"1970-01-01T00:00:05Z\",\"type\":\"response_item\",\"payload\":{{\"type\":\"{kind}\",\"call_id\":\"pending\",\"arguments\":\"{}", "PRIVATE_ARGUMENT".repeat(500));
            let mut header = Header::default();
            let _ = Probe {
                header: &mut header,
                nested: false,
                item: false,
            }
            .deserialize(&mut serde_json::Deserializer::from_slice(
                &input.as_bytes()[..4096],
            ));
            p.oversized_event(header);
            assert_eq!(p.sample_at("a.jsonl", 5000).pending_tools, 1);
            let foreign=br#"{"timestamp":"1970-01-01T00:00:06Z","type":"response_item","payload":{"type":"function_call_output","call_id":"pending","turn_id":"other","output":"#;
            let mut header = Header::default();
            let _ = Probe {
                header: &mut header,
                nested: false,
                item: false,
            }
            .deserialize(&mut serde_json::Deserializer::from_slice(foreign));
            p.oversized_event(header);
            assert_eq!(p.sample_at("a.jsonl", 6000).pending_tools, 1);
            let output=br#"{"timestamp":"1970-01-01T00:00:07Z","type":"response_item","payload":{"type":"custom_tool_call_output","call_id":"pending","output":"#;
            let mut header = Header::default();
            let _ = Probe {
                header: &mut header,
                nested: false,
                item: false,
            }
            .deserialize(&mut serde_json::Deserializer::from_slice(output));
            p.oversized_event(header);
            assert_eq!(p.sample_at("a.jsonl", 7000).pending_tools, 0);
        }
        assert!(!serde_json::to_string(&p.sample_at("a.jsonl", 7000))
            .unwrap()
            .contains("PRIVATE_ARGUMENT"));
    }
    #[test]
    fn appended_backlog_remains_loading_until_all_new_chunks_are_consumed() {
        use std::io::Write;
        let dir = std::env::temp_dir().join(format!("pulse-append-backlog-{}", crate::data::now()));
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("a.jsonl");
        fs::write(&path, b"{\"type\":\"unrelated\"}\n").unwrap();
        let mut tail = Tail::new(dir.clone(), "a.jsonl".into());
        tail.poll().unwrap();
        assert!(!tail.is_loading());
        let mut f = fs::OpenOptions::new().append(true).open(&path).unwrap();
        f.write_all(format!("{{\"type\":\"response_item\",\"payload\":{{\"type\":\"message\",\"content\":\"{}\"}}}}\n", "synthetic".repeat(POLL_BYTES as usize/4)).as_bytes()).unwrap();
        let s = tail.poll().unwrap().0;
        assert_eq!(s.state, "loading");
        assert!(
            tail.is_loading(),
            "sampler must continue its bounded catch-up loop for live appends too"
        );
        let mut polls = 1;
        while tail.is_loading() {
            tail.poll().unwrap();
            polls += 1;
            assert!(polls < 20);
        }
        assert!(polls > 1);
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn oversized_legacy_tool_results_keep_counts_and_close_the_call() {
        use std::io::Write;
        let dir = std::env::temp_dir().join(format!("pulse-large-legacy-{}", crate::data::now()));
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("a.jsonl");
        let ts = "2026-10-23T00:00:00Z";
        let event = |payload: serde_json::Value| {
            serde_json::json!({"timestamp":ts,"type":"event_msg","payload":payload}).to_string()
                + "\n"
        };
        fs::write(&path,event(serde_json::json!({"type":"token_count","info":{"total_token_usage":{"output_tokens":100}}}))+&event(serde_json::json!({"type":"task_started","turn_id":"t1"}))+&event(serde_json::json!({"type":"token_count","info":{"total_token_usage":{"output_tokens":120}}}))+&event(serde_json::json!({"type":"exec_command_begin","call_id":"big"}))).unwrap();
        let mut tail = Tail::new(dir.clone(), "a.jsonl".into());
        let first = tail.poll().unwrap().0;
        assert_eq!(first.output_tokens, Some(20));
        assert_eq!(first.pending_tools, 1);
        let mut f = fs::OpenOptions::new().append(true).open(&path).unwrap();
        f.write_all(format!("{{\"timestamp\":\"{ts}\",\"type\":\"event_msg\",\"payload\":{{\"type\":\"exec_command_end\",\"call_id\":\"big\",\"aggregated_output\":\"{}\"}}}}\n","synthetic".repeat(MAX_LINE)).as_bytes()).unwrap();
        let mut sample = tail.poll().unwrap().0;
        while tail.is_loading() {
            sample = tail.poll().unwrap().0;
        }
        assert_eq!(sample.output_tokens, Some(20));
        assert_eq!(sample.pending_tools, 0);
        assert_eq!(sample.state, "running");
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn aborted_task_uses_only_its_matched_duration() {
        let mut p = Parser::default();
        count(&mut p, 100, 10);
        start(&mut p);
        count(&mut p, 120, 13);
        let c = send(
            &mut p,
            serde_json::json!({"type":"turn_aborted","turn_id":"t1","duration_ms":4000}),
        )
        .unwrap();
        assert_eq!(c.reason, "aborted");
        assert_eq!(c.rate, Some(5.));
    }
    #[cfg(unix)]
    #[test]
    fn symlinks_cannot_escape_log_root() {
        let dir = std::env::temp_dir().join(format!("pulse-symlink-test-{}", crate::data::now()));
        fs::create_dir_all(&dir).unwrap();
        std::os::unix::fs::symlink("/etc/hosts", dir.join("a.jsonl")).unwrap();
        assert!(list(&dir).unwrap().is_empty());
        assert!(resolve(&dir, "a.jsonl").is_err());
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    #[ignore = "explicitly authorized, read-only local metadata check"]
    fn local_metadata_check() {
        let home = PathBuf::from(std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).unwrap());
        let root = crate::paths::sessions_root(&home, std::env::var_os("CODEX_HOME").as_deref());
        let files = list(&root).unwrap();
        assert!(!files.is_empty());
        let mut summaries = Vec::new();
        for file in files.iter().take(8) {
            let mut tail = Tail::new(root.clone(), file.id.clone());
            let mut completed = 0;
            let mut polls = 0;
            let sample = loop {
                let (s, old) = tail.poll().unwrap();
                completed += old.len();
                polls += 1;
                assert!(polls < 4096, "bounded real-log catch-up");
                if s.state != "loading" { break s; }
            };
            summaries.push(serde_json::json!({
                "source":sample.source,"task_state":sample.state,
                "activity":sample.activity_status,"completed_events":completed,
                "session_output":sample.total_output_tokens,
                "session_reasoning":sample.total_reasoning_tokens,
                "task_output":sample.output_tokens,
                "rate_available":sample.rate.is_some(),"body_persisted":false
            }));
        }
        assert!(summaries.iter().any(|s| s["session_output"].is_u64()));
        println!(
            "{}",
            serde_json::json!({"compatible_logs":files.len(),"real_local_metadata":true,"samples":summaries})
        );
    }
    #[test]
    #[ignore = "requires an explicitly provided body-free numeric metadata replay"]
    fn real_numeric_metadata_intervals() {
        let path = std::env::var_os("PULSE_METADATA_REPLAY").expect("numeric-only replay path");
        let records = fs::read_to_string(path).unwrap();
        let mut parser = Parser::default();
        let mut previous: Option<(u64, i64)> = None;
        let mut reports = 0;
        let mut intervals = 0;
        for line in records.lines() {
            let record: serde_json::Value = serde_json::from_str(line).unwrap();
            parser.line(line.as_bytes());
            if record["payload"]["type"] != "token_count" { continue; }
            let at = timestamp(record["timestamp"].as_str()).unwrap();
            let output = record["payload"]["info"]["total_token_usage"]["output_tokens"].as_u64().unwrap();
            let sample = parser.sample_at("numeric-review.jsonl", at);
            assert_eq!(sample.total_output_tokens, Some(output));
            assert_eq!(sample.output_tokens, None, "a later interval cannot invent the task baseline");
            match previous {
                Some((old, start)) if output > old && at - start >= 100 => {
                    let expected = (output - old) as f64 / ((at - start) as f64 / 1000.);
                    assert!((sample.current_rate.unwrap() - expected).abs() < 0.000001);
                    intervals += 1;
                }
                None => assert_eq!(sample.current_rate, None),
                _ => panic!("replay must contain increasing, timestamped numeric snapshots"),
            }
            previous = Some((output, at));
            reports += 1;
        }
        assert!(reports >= 3 && intervals == reports - 1);
        println!("{}", serde_json::json!({"existing_real_metadata":true,"body_or_session_id_included":false,"reports":reports,"valid_intervals":intervals,"task_total_still_unknown":true,"passed":true}));
    }
    #[test]
    fn tail_handles_partial_append_and_truncation() {
        use std::io::Write;
        let dir = std::env::temp_dir().join(format!("pulse-log-test-{}", crate::data::now()));
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("a.jsonl");
        fs::write(&path,b"{\"type\":\"event_msg\",\"payload\":{\"type\":\"token_count\",\"info\":{\"total_token_usage\":{\"output_tokens\":10}}}}\n").unwrap();
        let mut t = Tail::new(dir.clone(), "a.jsonl".into());
        assert_eq!(t.poll().unwrap().0.total_output_tokens, Some(10));
        let next=b"{\"type\":\"event_msg\",\"payload\":{\"type\":\"token_count\",\"info\":{\"total_token_usage\":{\"output_tokens\":20}}}}\n";
        File::options()
            .append(true)
            .open(&path)
            .unwrap()
            .write_all(&next[..20])
            .unwrap();
        assert_eq!(t.poll().unwrap().0.total_output_tokens, Some(10));
        File::options()
            .append(true)
            .open(&path)
            .unwrap()
            .write_all(&next[20..])
            .unwrap();
        assert_eq!(t.poll().unwrap().0.total_output_tokens, Some(20));
        fs::write(&path, b"").unwrap();
        assert_eq!(t.poll().unwrap().0.total_output_tokens, None);
        fs::remove_dir_all(dir).unwrap();
    }
}

#[cfg(test)]
mod nested_discovery_tests {
    use super::*;
    #[test]
    fn date_subdirectory_ids_are_portable_and_resolve_back_to_the_same_file() {
        let root = std::env::temp_dir().join(format!("pulse-nested-{}-{}", std::process::id(), crate::data::now()));
        let nested = root.join("2026").join("10").join("24");
        fs::create_dir_all(&nested).unwrap();
        let file = nested.join("1001.jsonl");
        fs::write(&file, b"{}\n").unwrap();
        let found = list(&root).unwrap();
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].id, "2026/10/24/1001.jsonl");
        assert_eq!(resolve(&root, &found[0].id).unwrap(), file.canonicalize().unwrap());
        assert!(resolve(&root, "../1001.jsonl").is_err());
        assert!(resolve(&root, "2026/../../1001.jsonl").is_err());
        fs::remove_dir_all(root).unwrap();
    }
}
