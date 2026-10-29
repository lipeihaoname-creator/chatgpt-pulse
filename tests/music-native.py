"""Opt-in Mac system-audio integration. Synthetic playback, isolated Work logs.

Never grants system permissions, accesses real Work, records captured PCM, or
saves spectrum history. Run only after agreeing to system-audio capture:
PULSE_APP='/path/ChatGPT Pulse.app' python3 tests/music-native.py --system-audio-confirmed
"""
import argparse
import datetime
import json
import math
import os
from pathlib import Path
import sqlite3
import struct
import subprocess
import time
import wave
from native_app import app_binary

parser = argparse.ArgumentParser()
parser.add_argument('--system-audio-confirmed', action='store_true')
parser.add_argument('--idle-conversation', action='store_true')
parser.add_argument('--silence-seconds',type=int,default=0)
parser.add_argument('--graceful-quit',action='store_true')
args = parser.parse_args()
if not 0<=args.silence_seconds<=180:parser.error('Silence duration must be 0..180 seconds')
if not args.system_audio_confirmed:
    parser.error('Explicit consent required: --system-audio-confirmed. This test captures system playback in memory.')
root = Path(__file__).resolve().parent.parent
folder = root / 'test-results' / ('music-native-' + str(time.time_ns()))
(folder / 'logs').mkdir(parents=True)
with sqlite3.connect(folder / 'pulse.sqlite') as db:
    db.execute('CREATE TABLE settings(id INTEGER PRIMARY KEY,value TEXT NOT NULL)')
    db.execute('INSERT INTO settings VALUES(1,?)', (json.dumps(dict(
        auto_monitor=True, follow_latest=True, overlay_enabled=True,
        overlay_layout='avatar', character='roxy', theme='spellbook',
        hover_hide=False, keep_history=False, music_enabled=True,
        music_spectrum=True, idle_chat=args.idle_conversation, idle_frequency='lively', completion_scene=False)),))
# This is generated test input for playback, not a recording of system audio.
tone = folder / 'synthetic-playback.wav'
rate = 48000
with wave.open(str(tone), 'wb') as output:
    output.setnchannels(2)
    output.setsampwidth(2)
    output.setframerate(rate)
    def test_signal(i):
        t = i / rate
        envelope = .04 + .11 * math.exp(-(t % .5) / .08)
        return int(32767 * (envelope * math.sin(2 * math.pi * 120 * t) + .025 * math.sin(2 * math.pi * 480 * t)))
    block = b''.join(struct.pack('<hh', *([test_signal(i)] * 2)) for i in range(rate * 4))
    for _ in range(30):
        output.writeframes(block)
app = subprocess.Popen([str(app_binary(root)), '--background'],
    env=dict(os.environ, PULSE_OFFLINE_TEST='1', PULSE_DATA_DIR=str(folder), PULSE_RENDER_PROBE='1'),
    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
playback = None
checks = []
skipped = []
ambient_audio_detected = False
long_silence_verified=False
graceful_quit_verified=False

def event(name, payload):
    row = dict(type='event_msg', timestamp=datetime.datetime.now(datetime.timezone.utc).isoformat(), payload=payload)
    with (folder / 'logs' / name).open('a') as stream:
        stream.write(json.dumps(row) + '\n')

def until(test, label, timeout=40):
    deadline = time.monotonic() + timeout
    frame = {}
    while time.monotonic() < deadline:
        if app.poll() is not None:
            raise AssertionError('Candidate exited')
        try:
            frame = json.loads((folder / 'probe-overlay.json').read_text())
        except (OSError, ValueError):
            pass
        if frame.get('at', 0) > time.time() * 1000 - 3000 and test(frame):
            checks.append(label)
            print('PASS ' + label, flush=True)
            return
        time.sleep(.15)
    raise AssertionError(dict(check=label, frame=frame))

try:
    until(lambda f: f.get('rendered_music_moving') is False, 'Cold-start unknown stays still')
    until(lambda f: (f.get('rendered_music_debug') or {}).get('status') in ('active', 'silent'), 'Native capture reaches a ready audio state before playback')
    # Observe pre-existing system playback before our signal. We must not
    # mistake another app continuing to play for a failure to stop our signal.
    baseline_deadline = time.monotonic() + 2
    while time.monotonic() < baseline_deadline:
        try:
            debug = json.loads((folder / 'probe-overlay.json').read_text()).get('rendered_music_debug') or {}
            ambient_audio_detected |= debug.get('status') == 'active' and debug.get('stable', 0) > .5
        except (OSError, ValueError):
            pass
        time.sleep(.2)
    print('BASELINE system audio already active: ' + str(ambient_audio_detected), flush=True)
    playback = subprocess.Popen(['/usr/bin/afplay', '-v', '.12', str(tone)])
    until(lambda f: f.get('music_idle_confirmed') is True and f.get('rendered_music_moving') is True, 'Fresh empty scan allows music without first completing a task')
    poses = set()
    # The native render probe is sampled once per second. Observe enough
    # distinct snapshots to verify real pose changes without assuming 60Hz IPC.
    deadline = time.monotonic() + 4
    background_visible_verified = False
    while time.monotonic() < deadline:
        frame = json.loads((folder / 'probe-overlay.json').read_text())
        debug = frame.get('rendered_music_debug') or {}
        if frame.get('rendered_music_moving') and frame.get('view_visible'):
            poses.add(tuple(round(v, 4) for v in debug.get('pose', [])))
            background_visible_verified |= debug.get('visible') == 'hidden'
        time.sleep(.2)
    assert len(poses) >= 3, ('Visible native portrait did not actually change pose', poses)
    checks.append('Visible native portrait continuously changes pose under real system audio')
    print('PASS ' + checks[-1], flush=True)
    event('a.jsonl', dict(type='task_started', turn_id='music_test'))
    until(lambda f: f.get('rendered_activity') == 'processing' and f.get('rendered_music_moving') is False, 'Work blocks music motion')
    event('a.jsonl', dict(type='task_complete', turn_id='music_test', duration_ms=1000))
    until(lambda f: f.get('music_idle_confirmed') is True and f.get('rendered_music_moving') is True, 'Saved opt-in resumes real system capture and enables confirmed idle motion')
    event('b.jsonl', dict(type='task_started', turn_id='parallel'))
    until(lambda f: f.get('music_idle_confirmed') is False and f.get('rendered_music_moving') is False, 'Parallel work immediately cancels music motion')
    event('b.jsonl', dict(type='task_complete', turn_id='parallel', duration_ms=1000))
    until(lambda f: f.get('music_idle_confirmed') is True and f.get('rendered_music_moving') is True, 'All tasks finished restores music motion before stop test')
    playback.terminate()
    playback.wait(timeout=5)
    playback = None
    stopped = False
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        frame = json.loads((folder / 'probe-overlay.json').read_text())
        if frame.get('rendered_music_moving') is False:
            stopped = True
            break
        time.sleep(.2)
    if stopped:
        checks.append('Playback stop leaves no music motion')
        print('PASS ' + checks[-1], flush=True)
    elif ambient_audio_detected and (frame.get('rendered_music_debug') or {}).get('status') == 'active':
        skipped.append('Silence decay: other system audio was already active before synthetic playback and remains active; no silent system-output condition available')
        print('SKIP ' + skipped[-1], flush=True)
    else:
        raise AssertionError(('Music motion remained without pre-existing system playback', frame))
    if args.silence_seconds and stopped:
        audio_path=folder/'probe-audio.json';initial=json.loads(audio_path.read_text());epoch=initial['epoch'];deadline=time.monotonic()+args.silence_seconds
        while time.monotonic()<deadline:
            assert app.poll() is None
            audio=json.loads(audio_path.read_text());assert audio['epoch']==epoch and audio['status']=='silent' and audio['at']>time.time()*1000-2000,audio
            time.sleep(.4)
        long_silence_verified=True;checks.append(f'Same capture stays healthy for {args.silence_seconds} seconds of actual silence');print('PASS '+checks[-1],flush=True)
        playback=subprocess.Popen(['/usr/bin/afplay','-v','.12',str(tone)])
        until(lambda f:f.get('rendered_music_moving') is True,'Actual system playback resumes music after long silence')
    elif args.silence_seconds:
        skipped.append('Long silence not verified: other system output remained active')
    if args.idle_conversation:
        if playback is None:playback = subprocess.Popen(['/usr/bin/afplay', '-v', '.12', str(tone)])
        until(lambda f: f.get('rendered_companion') is True and f.get('rendered_music_conversation') is True, 'Visible native avatar spontaneously opens a music conversation', timeout=75)
        last_probe=json.loads((folder/'probe-overlay.json').read_text())
        background_visible_verified |= (last_probe.get('rendered_music_debug') or {}).get('visible') == 'hidden'
    if args.graceful_quit:
        helper=folder/'own-app-quit'
        subprocess.run(['xcrun','clang','tests/graceful-quit.m','-framework','AppKit','-framework','Foundation','-o',str(helper)],cwd=root,check=True,capture_output=True)
        subprocess.run([str(helper),str(app.pid)],check=True)
        app.wait(timeout=10);assert app.returncode==0,app.returncode;graceful_quit_verified=True
        checks.append('Active capture exits normally through AppKit Quit without a signal or UI-thread join');print('PASS '+checks[-1],flush=True)
    result = dict(passed=True, system_audio_real=True, work_logs_synthetic=True,long_silence_verified=long_silence_verified,graceful_quit_verified=graceful_quit_verified,
        restored_preference_starts_capture=True, manual_music_start_command_used=False, native_visible_pose_changes_verified=True, unfocused_hidden_branch_observed=background_visible_verified, ambient_audio_before_test=ambient_audio_detected, silence_decay_verified=stopped, skipped=skipped, checks=checks)
    (folder / 'result.json').write_text(json.dumps(result, indent=2))
    print(json.dumps(result), flush=True)
finally:
    if playback and playback.poll() is None:
        playback.terminate()
        playback.wait(timeout=5)
    if app.poll() is None:app.terminate();app.wait(timeout=10)
