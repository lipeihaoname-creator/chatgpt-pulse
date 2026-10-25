"""Measure only Pulse's main process CPU/RSS against isolated Work fixtures.

WebKit helper processes are outside this measurement. These are observations,
not total app memory, portable benchmarks, or pass/fail performance thresholds.
"""
import argparse, datetime, json, os, sqlite3, subprocess, time
from pathlib import Path
from native_app import app_binary

parser = argparse.ArgumentParser()
parser.add_argument('--tasks', type=int, choices=[1, 4, 16], required=True)
parser.add_argument('--seconds', type=int, default=10)
args = parser.parse_args()
assert 5 <= args.seconds <= 60
root = Path(__file__).resolve().parent.parent
folder = root / 'test-results' / ('resource-' + str(time.time_ns()))
(folder / 'logs').mkdir(parents=True)
with sqlite3.connect(folder / 'pulse.sqlite') as c:
    c.execute('CREATE TABLE settings(id INTEGER PRIMARY KEY,value TEXT NOT NULL)')
    c.execute('INSERT INTO settings VALUES(1,?)', (json.dumps(dict(
        auto_monitor=True, follow_latest=True, overlay_enabled=True,
        overlay_layout='avatar', character='roxy', theme='spellbook',
        hover_hide=False, keep_history=False)),))

def event(name, payload):
    row = dict(type='event_msg', timestamp=datetime.datetime.now(
        datetime.timezone.utc).isoformat(), payload=payload)
    with (folder / 'logs' / name).open('a') as f:
        f.write(json.dumps(row) + '\n')

names = [f'{i:04x}.jsonl' for i in range(args.tasks)]
for name in names:
    event(name, dict(type='token_count', info=dict(total_token_usage=dict(output_tokens=100))))
env = dict(os.environ, PULSE_OFFLINE_TEST='1', PULSE_DATA_DIR=str(folder), PULSE_RENDER_PROBE='1')
binary = app_binary(root)
p = subprocess.Popen([str(binary), '--background'], env=env,
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

def probe():
    try:
        return json.loads((folder / 'probe-sampler.json').read_text())
    except (OSError, ValueError):
        return {}

def resources():
    # Exact child PID only; no inventory of other applications.
    value = subprocess.check_output(['ps', '-p', str(p.pid), '-o', 'time=', '-o', 'rss='], text=True).split()
    parts = [float(part) for part in value[0].split(':')]
    seconds = 0
    for part in parts:
        seconds = seconds * 60 + part
    return seconds, int(value[1])

try:
    deadline = time.monotonic() + 20
    while len(probe().get('sessions', [])) != args.tasks:
        assert p.poll() is None and time.monotonic() < deadline
        time.sleep(.2)
    for name in names:
        event(name, dict(type='task_started', turn_id='work'))
        event(name, dict(type='agent_reasoning'))
    # Exclude initial window creation from the steady observation.
    time.sleep(3)
    first_cpu, first_rss = resources()
    first_at = time.monotonic()
    first_sequence = probe()['sequence']
    time.sleep(args.seconds)
    last_cpu, last_rss = resources()
    elapsed = time.monotonic() - first_at
    assert p.poll() is None
    assert len([s for s in probe()['sessions'] if s['state'] == 'running']) == args.tasks
    result = dict(tasks=args.tasks, measured_seconds=round(elapsed, 2),
                  main_process_cpu_percent=round((last_cpu-first_cpu)/elapsed*100, 2),
                  main_process_rss_kib=[first_rss,last_rss],
                  sampler_checks=probe()['sequence']-first_sequence,
                  includes_webkit_helpers=False, real_logs_accessed=False,
                  folder=str(folder))
    (folder / 'result.json').write_text(json.dumps(result, indent=2))
    (root / 'test-results' / f'resource-{args.tasks}-native.json').write_text(json.dumps(result, indent=2))
    print(json.dumps(result), flush=True)
finally:
    p.terminate()
    try:
        p.wait(timeout=5)
    except subprocess.TimeoutExpired:
        p.kill()
        p.wait(timeout=5)
