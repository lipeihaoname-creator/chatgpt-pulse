"""Real Mac system-output cold starts; isolated settings and generated playback."""
from pathlib import Path
import argparse,json,os,sqlite3,subprocess,time,wave,math,struct
from native_app import app_binary
arg=argparse.ArgumentParser();arg.add_argument('--system-audio-confirmed',action='store_true');arg.add_argument('--first-open-zero',action='store_true');arg.add_argument('--rounds',type=int,default=3);args=arg.parse_args()
if not args.system_audio_confirmed:arg.error('Existing system-audio consent required')
if not 1<=args.rounds<=6:arg.error('rounds must be 1..6')
root=Path(__file__).resolve().parent.parent;work=root/'test-results'/('music-cold-'+str(time.time_ns()));work.mkdir(parents=True);tone=work/'generated-playback.wav';rate=48000
with wave.open(str(tone),'wb') as w:
 w.setnchannels(2);w.setsampwidth(2)
 w.setframerate(rate);block=b''.join(struct.pack('<hh',*([int(5000*(.3+.7*math.exp(-((i/rate)%.5)/.08))*math.sin(2*math.pi*120*i/rate))]*2)) for i in range(rate*2))
 for _ in range(30):w.writeframes(block)
helper=work/'normal-quit';subprocess.run(['xcrun','clang','tests/graceful-quit.m','-framework','AppKit','-framework','Foundation','-o',str(helper)],check=True,capture_output=True,cwd=root)
results=[]
for round in range(args.rounds):
 for mode in ['already-playing','play-after-quiet-start']:
  folder=work/f'{round}-{mode}';(folder/'logs').mkdir(parents=True)
  with sqlite3.connect(folder/'pulse.sqlite') as c:
   c.execute('create table settings(id integer primary key,value text not null)');c.execute('insert into settings values(1,?)',(json.dumps(dict(auto_monitor=True,follow_latest=True,overlay_enabled=True,overlay_layout='avatar',character='roxy',hover_hide=False,keep_history=False,music_enabled=True,music_spectrum=True,idle_chat=False,overlay_position=dict(x=80,y=200))),))
  app=None;play=None;started=time.monotonic()
  try:
   if mode=='already-playing':play=subprocess.Popen(['/usr/bin/afplay','-v','.15',str(tone)]);time.sleep(1)
   app=subprocess.Popen([str(app_binary(root)),'--background'],env=dict(os.environ,PULSE_OFFLINE_TEST='1',PULSE_RENDER_PROBE='1',PULSE_DATA_DIR=str(folder),**({'PULSE_TEST_FIRST_AUDIO_ZERO':'1'} if args.first_open_zero else {})),stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
   if mode!='already-playing':time.sleep(7);play=subprocess.Popen(['/usr/bin/afplay','-v','.15',str(tone)])
   deadline=time.monotonic()+18;row={};passed=False
   while time.monotonic()<deadline:
    assert app.poll() is None
    try:
     row=json.loads((folder/'probe-audio.json').read_text());view=json.loads((folder/'probe-overlay.json').read_text())
     if row.get('active') and view.get('rendered_music_moving'):
      passed=True;break
    except (OSError,ValueError):pass
    time.sleep(.15)
   results.append(dict(mode=mode,round=round,passed=passed))
   results[-1]['seconds']=float(f'{time.monotonic()-started:.2f}');results[-1]['last_audio']={k:row.get(k) for k in ['status','rms','max_band','sequence']}
   print(json.dumps(results[-1]),flush=True)
  finally:
   if play and play.poll() is None:play.terminate();play.wait(timeout=5)
   if app and app.poll() is None:
    subprocess.run([str(helper),str(app.pid)],check=False,capture_output=True)
    try:app.wait(timeout=8)
    except subprocess.TimeoutExpired:app.terminate();app.wait(timeout=5)
  (root/'test-results/music-cold-start-native.json').write_text(json.dumps(dict(passed=all(x['passed'] for x in results),system_audio_real=True,first_stream_zero_injected=args.first_open_zero,user_settings_accessed=False,results=results),indent=2))
print(json.dumps(dict(passed=all(x['passed'] for x in results),runs=len(results))),flush=True)
raise SystemExit(0 if all(x['passed'] for x in results) else 1)
