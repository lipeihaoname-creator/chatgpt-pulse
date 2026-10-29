"""Opt-in real WASAPI test. Playback is generated; Work logs are isolated.
No microphone, real Work, captured PCM recording, volume change, or drivers.
"""
from pathlib import Path
import argparse,datetime,json,math,os,sqlite3,struct,subprocess,time,wave,winsound
parser=argparse.ArgumentParser()
parser.add_argument('--system-audio-confirmed',action='store_true')
parser.add_argument('--keep-open',action='store_true')
parser.add_argument('--silence-seconds',type=int,default=65)
args=parser.parse_args()
if not args.system_audio_confirmed:parser.error('Explicit system-output capture consent required')
root=Path(__file__).resolve().parent.parent
folder=root/'test-results'/('windows-music-'+str(time.time_ns()));(folder/'logs').mkdir(parents=True)
with sqlite3.connect(folder/'pulse.sqlite') as db:
 db.execute('CREATE TABLE settings(id INTEGER PRIMARY KEY,value TEXT NOT NULL)')
 db.execute('INSERT INTO settings VALUES(1,?)',(json.dumps(dict(auto_monitor=True,follow_latest=True,overlay_enabled=True,overlay_layout='avatar',character='roxy',theme='spellbook',hover_hide=False,keep_history=False,music_enabled=True,music_motion=True,music_spectrum=True,music_dialogue=True,idle_chat=True,idle_motions=False,idle_frequency='lively',completion_scene=False,show_total=True,overlay_position=dict(x=120,y=200))),))
tone=folder/'generated-playback.wav'
rate=48000
with wave.open(str(tone),'wb') as output:
 output.setnchannels(2);output.setsampwidth(2);output.setframerate(rate)
 block=bytearray()
 for i in range(rate*4):
  t=i/rate;envelope=.025+.075*math.exp(-(t%.5)/.08)
  v=int(32767*(envelope*math.sin(2*math.pi*120*t)+.018*math.sin(2*math.pi*480*t)))
  block.extend(struct.pack('<hh',v,v))
 output.writeframes(block)
del block
binary=Path(os.environ.get('PULSE_APP',root/'src-tauri/target/release/chatgpt-pulse.exe'))
startup=subprocess.STARTUPINFO();startup.dwFlags|=subprocess.STARTF_USESHOWWINDOW;startup.wShowWindow=0
app=subprocess.Popen([str(binary),'--background'],env=dict(os.environ,PULSE_OFFLINE_TEST='1',PULSE_DATA_DIR=str(folder),PULSE_RENDER_PROBE='1'),startupinfo=startup,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
checks=[];skipped=[];success=False
def probe(name):
 # Test probes are overwritten in place. Retry a bounded torn read rather than
 # treating an empty intermediate file as an audio-device failure.
 for _ in range(6):
  try:return json.loads((folder/('probe-'+name+'.json')).read_text(encoding='utf-8'))
  except (OSError,ValueError):time.sleep(.02)
 return {}
def until(test,label,timeout=25):
 deadline=time.monotonic()+timeout
 while time.monotonic()<deadline:
  if app.poll() is not None:raise AssertionError('Candidate exited: '+label)
  if test():checks.append(label);print('PASS '+label,flush=True);return
  time.sleep(.2)
 raise AssertionError(dict(check=label,audio=probe('audio'),overlay=probe('overlay')))
def event(name,payload):
 with (folder/'logs'/name).open('a',encoding='utf-8') as stream:stream.write(json.dumps(dict(type='event_msg',timestamp=datetime.datetime.now(datetime.timezone.utc).isoformat(),payload=payload))+'\n')
def play():winsound.PlaySound(str(tone),winsound.SND_FILENAME|winsound.SND_ASYNC|winsound.SND_LOOP|winsound.SND_NODEFAULT)
try:
 until(lambda:probe('audio').get('status') in ('silent','active'),'Saved opt-in opens actual WASAPI system-render loopback')
 until(lambda:probe('overlay').get('music_idle_confirmed') is True,'A successful empty Work scan permits decorative music')
 ambient=False;end=time.monotonic()+2
 while time.monotonic()<end:ambient|=probe('audio').get('active') is True;time.sleep(.2)
 play()
 until(lambda:probe('audio').get('active') is True and probe('audio').get('max_band',0)>.001,'Generated playback reaches real native FFT through the Windows output device')
 until(lambda:probe('overlay').get('rendered_music_moving') is True,'Real native audio moves the existing visible avatar')
 poses=set();end=time.monotonic()+5
 while time.monotonic()<end:
  p=probe('overlay');debug=p.get('rendered_music_debug') or {}
  if p.get('rendered_music_moving') and p.get('view_visible'):poses.add(tuple(debug.get('pose',[])))
  time.sleep(.2)
 assert len(poses)>=3,('Native pose did not change',poses)
 checks.append('Visible avatar has at least three distinct native pose snapshots')
 # Lively music chat waits randomly 22-55 s after >=3 s continuous sound.
 # A real desktop packet discontinuity legitimately restarts this wait; allow
 # a bounded second interval rather than assuming uninterrupted test playback.
 until(lambda:probe('overlay').get('rendered_music_conversation') is True,'Existing dialogue scheduler opens an original music topic',timeout=180)
 for n,out in [('1001',30),('1002',70)]:
  event(n+'.jsonl',dict(type='token_count',info=dict(total_token_usage=dict(output_tokens=100,reasoning_output_tokens=10))))
  event(n+'.jsonl',dict(type='task_started',turn_id=n))
  event(n+'.jsonl',dict(type='token_count',info=dict(total_token_usage=dict(output_tokens=100+out,reasoning_output_tokens=20))))
 until(lambda:probe('overlay').get('rendered_music_moving') is False and probe('overlay').get('music_idle_confirmed') is False,'Parallel Work immediately interrupts music motion')
 until(lambda:sorted(v for _,v in probe('overlay').get('rendered_tasks',[]) if isinstance(v,int))==[30,70] and probe('overlay').get('rendered_avatar_count')==1,'Two independent Token values render with exactly one avatar')
 for n in ['1001','1002']:event(n+'.jsonl',dict(type='task_complete',turn_id=n,duration_ms=2000))
 until(lambda:probe('overlay').get('rendered_music_moving') is True,'Finishing all isolated tasks restores music movement')
 winsound.PlaySound(None,0)
 if not ambient:
  until(lambda:probe('audio').get('status')=='silent' and probe('overlay').get('rendered_music_moving') is False,'Stopping playback decays to silence without residual motion')
  epoch=probe('audio')['epoch'];end=time.monotonic()+max(60,args.silence_seconds)
  while time.monotonic()<end:
   p=probe('audio');assert p.get('status')=='silent' and p.get('epoch')==epoch,p
   time.sleep(.5)
  checks.append('At least one minute of silence remains healthy in the same capture epoch')
 else:
  skipped.append('Long silence could not be asserted because other system audio was already active')
 play();until(lambda:probe('audio').get('active') is True and probe('overlay').get('rendered_music_moving') is True,'System sound resumes automatically after the silent interval')
 result=dict(version='0.18.2',passed=True,system_audio_real=True,playback_generated=True,work_logs_synthetic=True,real_user_data_accessed=False,ambient_before_playback=ambient,checks=checks,skipped=skipped,folder=str(folder),pid=app.pid,binary=str(binary))
 (folder/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
 (root/'test-results/evidence/music-native-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
 print(json.dumps(result),flush=True);success=True
finally:
 winsound.PlaySound(None,0)
 if not(success and args.keep_open):
  app.terminate();app.wait(timeout=10)
