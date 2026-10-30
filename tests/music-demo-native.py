"""Record only the own native WebView; real capture, generated playback, no chats."""
from pathlib import Path
import os,json,sqlite3,subprocess,time,math,struct,wave,argparse
from native_app import app_binary
arg=argparse.ArgumentParser();arg.add_argument('--system-audio-confirmed',action='store_true');arg.add_argument('--character',choices=['mai','roxy'],required=True);arg.add_argument('--style',choices=['bars','arc','dots','curve','mirror','led'],required=True);args=arg.parse_args()
if not args.system_audio_confirmed:arg.error('System playback capture consent required')
r=Path(__file__).resolve().parent.parent;folder=r/'test-results'/f'music-demo-{args.character}-{args.style}-{time.time_ns()}';(folder/'logs').mkdir(parents=True)
settings=dict(auto_monitor=True,follow_latest=True,overlay_enabled=True,overlay_layout='avatar',character=args.character,theme='moon' if args.character=='mai' else 'spellbook',hover_hide=False,keep_history=False,music_enabled=True,music_motion=True,music_strength=.85,music_spectrum=True,music_style=args.style,music_dialogue=False,idle_chat=False,idle_motions=False,completion_scene=False,overlay_position=dict(x=80,y=200),music_visual=dict(density=24,height=1.3,gain=1.3,contrast=2.2,color_mode='gradient',color='#c0b7ff',color2='#73e5d0'))
with sqlite3.connect(folder/'pulse.sqlite') as c:
 c.execute('create table settings(id integer primary key,value text not null)');c.execute('insert into settings values(1,?)',(json.dumps(settings),))
tone=folder/'generated-input.wav';rate=48000
with wave.open(str(tone),'wb') as w:
 w.setnchannels(2);w.setsampwidth(2);w.setframerate(rate)
 data=bytearray()
 for i in range(rate*4):
  t=i/rate;beat=(t%.5);pulse=math.exp(-beat/.09)
  value=.13*pulse*math.sin(2*math.pi*110*t)+.065*(.6+.4*math.sin(2*math.pi*t/.9))*math.sin(2*math.pi*440*t)+.035*(.5+.5*math.cos(2*math.pi*t/1.3))*math.sin(2*math.pi*1300*t)
  v=int(32767*value);data.extend(struct.pack('<hh',v,v))
 for _ in range(8):w.writeframes(data)
play=subprocess.Popen(['/usr/bin/afplay','-v','.12',str(tone)]);app=None
try:
 time.sleep(.5);app=subprocess.Popen([str(app_binary(r)),'--background'],env=dict(os.environ,PULSE_OFFLINE_TEST='1',PULSE_RENDER_PROBE='1',PULSE_DATA_DIR=str(folder),PULSE_DEMO_FRAMES='1'),stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 deadline=time.monotonic()+22;active=False;poses=set();samples=[]
 while time.monotonic()<deadline:
  assert app.poll() is None
  try:
   audio=json.loads((folder/'probe-audio.json').read_text());view=json.loads((folder/'probe-overlay.json').read_text());active |= bool(audio.get('active'));poses.add(tuple((view.get('rendered_music_debug') or {}).get('pose',[])))
   samples.append(dict(at=audio['at'],active=audio['active']))
  except (OSError,ValueError,KeyError):pass
  if len(list((folder/'frames').glob('*.png')))>=98:break
  time.sleep(.1)
 frames=sorted((folder/'frames').glob('*.png'));assert len(frames)>=60 and active and len(poses)>=3,(len(frames),active,len(poses))
 # Skip the opening frames, retaining a continuous 8-second native recording.
 selected=frames[15:95];report=dict(version=json.loads((r/'package.json').read_text())['version'],character=args.character,style=args.style,system_audio_real=True,playback='Generated test signal, not a captured audio recording',chat_content_used=False,recording='Own native WKWebView snapshot API; no desktop or browser mockup',screen_recording_permission_used=False,frames=[str(p.relative_to(r)) for p in selected],fps=10,pose_samples=len(poses),folder=str(folder))
 (folder/'demo.json').write_text(json.dumps(report,indent=2));(r/f'test-results/music-demo-{args.character}-{args.style}.json').write_text(json.dumps(report,indent=2));print(json.dumps(dict(passed=True,frames=len(selected),folder=str(folder))),flush=True)
finally:
 if play.poll() is None:play.terminate();play.wait(timeout=5)
 if app and app.poll() is None:
  helper=folder/'normal-quit';subprocess.run(['xcrun','clang','tests/graceful-quit.m','-framework','AppKit','-framework','Foundation','-o',str(helper)],cwd=r,check=True,capture_output=True);subprocess.run([str(helper),str(app.pid)],capture_output=True)
  try:app.wait(timeout=8)
  except subprocess.TimeoutExpired:app.terminate();app.wait(timeout=5)
