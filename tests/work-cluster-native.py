"""Four concurrent native bubbles, isolated numeric fixtures; no real logs/UI."""
import datetime, json, os, sqlite3, subprocess, time, sys
from pathlib import Path
from native_app import app_binary

root = Path(__file__).resolve().parent.parent
folder = root / 'test-results' / ('work-cluster-' + str(time.time_ns()))
(folder / 'logs').mkdir(parents=True)
with sqlite3.connect(folder / 'pulse.sqlite') as c:
    c.execute('CREATE TABLE settings(id INTEGER PRIMARY KEY,value TEXT NOT NULL)')
    c.execute('INSERT INTO settings VALUES(1,?)', (json.dumps(dict(
        auto_monitor=True, follow_latest=False, pinned_log='a.jsonl',
        overlay_enabled=True, overlay_layout='avatar', character='roxy',
        theme='spellbook', hover_hide=False, keep_history=False,
        task_display="combined" if "--combined" in sys.argv else "separate",
        overlay_position=dict(x=80, y=200))),))

def event(name, payload, at=None):
    record = dict(type='event_msg', timestamp=datetime.datetime.fromtimestamp(
        at if at is not None else time.time(), datetime.timezone.utc).isoformat(), payload=payload)
    with (folder / 'logs' / name).open('a') as f:
        f.write(json.dumps(record) + '\n')

def count(n):
    return dict(type='token_count', info=dict(total_token_usage=dict(output_tokens=n, reasoning_output_tokens=0)))

names = ['a.jsonl', 'b.jsonl', 'c.jsonl', 'd.jsonl']
expected = {name: (i+1)*20 for i, name in enumerate(names)}
for name in names:
    event(name, count(100), time.time()-120)
env = dict(os.environ, PULSE_OFFLINE_TEST='1', PULSE_DATA_DIR=str(folder), PULSE_RENDER_PROBE='1')
if '--push-only' in sys.argv: env['PULSE_TEST_STALE_PULL']='1'
binary = app_binary(root)
p = subprocess.Popen([str(binary), '--background'], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

def probe(name):
    try:
        return json.loads((folder / ('probe-' + name + '.json')).read_text())
    except (OSError, ValueError):
        return {}

def until(check, timeout=20):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if p.poll() is not None:
            raise AssertionError('Test app exited')
        if check():
            return
        time.sleep(.2)
    raise AssertionError(dict(windows=probe('windows'), sampler=probe('sampler')))

def rendered():
    return dict(probe('overlay').get('rendered_tasks', []))

try:
    until(lambda: len(probe('sampler').get('sessions', [])) == 4)
    for name in names:
        event(name, dict(type='task_started', turn_id=name[0]+'_turn'), time.time()-1)
        event(name, count(100 + expected[name]))
    until(lambda: probe('windows').get('primary') == 'a.jsonl' and len(probe('windows').get('group', [])) == 4)
    until(lambda: rendered() == expected and probe('overlay').get('view_visible'))
    row = probe('overlay')
    assert row.get('rendered_avatar_count') == 1
    assert row.get('received_session_count') == 3, 'Root receives only the visible secondary task metadata'
    assert probe('windows').get('tasks') == {}, 'No independent windows can drift away from the character'
    scale = row['size'][2]
    expected_height = 318 if '--combined' in sys.argv else 362
    assert abs(row['size'][0]/scale - 280) < 1 and abs(row['size'][1]/scale - expected_height) < 1
    initial = dict(position=row['position'],outputs=rendered(),size=row['size'])
    for name in names[:2]:
        event(name, dict(type='task_complete', turn_id=name[0]+'_turn', duration_ms=1000))
    until(lambda: len(probe('windows').get('group', [])) == 2 and probe('windows').get('primary') in names[2:])
    until(lambda: set(rendered()) == set(names[2:]))
    assert probe('overlay').get('rendered_avatar_count') == 1
    assert probe('overlay')['position'] == initial['position']
    result = dict(passed=True, real_client_accessed=False, push_only='--push-only' in sys.argv, display='combined' if '--combined' in sys.argv else 'separate', initial=initial, remaining=list(rendered()), checks=[
        'Four simultaneous tasks keep separate counts in one native surface',
        'Exactly one avatar and no detached task windows',
        'Only currently visible metadata delivered, with the exact group window height',
        'Two completions expire independently and promote a remaining task without moving or duplicating the avatar'])
    (folder / 'result.json').write_text(json.dumps(result, indent=2))
    (root / ('test-results/work-cluster-' + result['display'] + '-native.json')).write_text(json.dumps(result, indent=2))
    print(json.dumps(result), flush=True)
finally:
    p.terminate()
    try:
        p.wait(timeout=5)
    except subprocess.TimeoutExpired:
        p.kill(); p.wait(timeout=5)
