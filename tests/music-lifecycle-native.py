"""Mac integration: actual capture, settings-off, hide/minimize, normal Quit.
Only isolated numeric fixtures and explicitly enabled test controls are used.
"""
from pathlib import Path
import argparse,json,math,os,sqlite3,struct,subprocess,time,wave
from native_app import app_binary
parser=argparse.ArgumentParser();parser.add_argument('--system-audio-confirmed',action='store_true');args=parser.parse_args()
if not args.system_audio_confirmed:parser.error('System playback capture consent required')
root=Path(__file__).resolve().parent.parent;folder=root/'test-results'/('music-lifecycle-'+str(time.time_ns()));(folder/'logs').mkdir(parents=True)
with sqlite3.connect(folder/'pulse.sqlite') as c:
 c.execute('create table settings(id integer primary key,value text not null)');c.execute('insert into settings values(1,?)',(json.dumps(dict(auto_monitor=True,follow_latest=True,overlay_enabled=True,overlay_layout='avatar',character='roxy',music_enabled=True,music_spectrum=True,music_style='arc',idle_chat=False,idle_motions=False,completion_scene=False,hover_hide=False,keep_history=False,overlay_position=dict(x=80,y=200))),))
tone=folder/'generated-input.wav';rate=48000
with wave.open(str(tone),'wb') as w:
 w.setnchannels(2);w.setsampwidth(2);w.setframerate(rate)
 block=b''.join(struct.pack('<hh',*([int(32767*(.03+.07*math.exp(-((i/rate)%.5)/.08))*math.sin(2*math.pi*120*i/rate))]*2)) for i in range(rate*2))
 for _ in range(60):w.writeframes(block)
binary=app_binary(root);app=subprocess.Popen([str(binary),'--background'],env=dict(os.environ,PULSE_OFFLINE_TEST='1',PULSE_RENDER_PROBE='1',PULSE_TEST_UI_CONTROL='1',PULSE_DATA_DIR=str(folder)),stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);play=None;checks=[];nonce=0

def probe(name):
 try:return json.loads((folder/('probe-'+name+'.json')).read_text())
 except (OSError,ValueError):return {}
def until(test,label,timeout=20):
 end=time.monotonic()+timeout
 while time.monotonic()<end:
  assert app.poll() is None,'Fixture exited before '+label
  if test():checks.append(label);print('PASS '+label,flush=True);return
  time.sleep(.15)
 raise AssertionError(dict(check=label,audio=probe('audio'),overlay=probe('overlay'),control=probe('control')))
def command(action):
 global nonce
 nonce+=1;p=folder/'fixture-ui-command.json';tmp=p.with_suffix('.pending');tmp.write_text(json.dumps(dict(nonce=nonce,action=action)));tmp.replace(p)
 until(lambda:probe('control').get('nonce')==nonce,'Control '+action)
 assert not probe('control').get('error'),probe('control')
try:
 until(lambda:probe('audio').get('status') in ['silent','active'],'Capture opens using saved opt-in')
 play=subprocess.Popen(['/usr/bin/afplay','-v','.12',str(tone)])
 until(lambda:probe('overlay').get('rendered_music_moving') is True,'Actual playback drives portrait')
 size=probe('overlay')['size'];assert abs(size[0]/size[2]-280)<.1 and abs(size[1]/size[2]-144)<.1
 command('audio-off');until(lambda:probe('audio').get('status')=='off','Settings-off publishes off status');time.sleep(1)
 sequence=probe('audio')['sequence'];time.sleep(.5);assert probe('audio')['sequence']==sequence,'Old capture keeps publishing'
 with sqlite3.connect(folder/'pulse.sqlite') as c:assert json.loads(c.execute('select value from settings').fetchone()[0])['music_enabled'] is False
 command('audio-on');until(lambda:probe('audio').get('active') and probe('overlay').get('rendered_music_moving') is True,'Capture reopens after previous worker joins and releases its stream')
 command('hide');until(lambda:probe('audio').get('view_visible') is False,'Hidden native overlay reports not visible')
 command('show');until(lambda:probe('audio').get('view_visible') is True and probe('overlay').get('rendered_music_moving') is True,'Showing overlay restores actual music motion')
 command('minimize');until(lambda:probe('audio').get('view_visible') is False,'Minimized native overlay suppresses visible audio frames');time.sleep(2);command('inspect');assert probe('control')['minimized'] is True,'Sampler unexpectedly restored the minimized overlay'
 command('restore');until(lambda:probe('audio').get('view_visible') is True and probe('overlay').get('rendered_music_moving') is True,'Unminimizing restores actual music motion')
 helper=folder/'own-app-quit';subprocess.run(['xcrun','clang','tests/graceful-quit.m','-framework','AppKit','-framework','Foundation','-o',str(helper)],cwd=root,check=True,capture_output=True);subprocess.run([str(helper),str(app.pid)],check=True);app.wait(timeout=10);assert app.returncode==0
 checks.append('Normal AppKit Quit exits with active audio, without forcing a signal')
 result=dict(passed=True,version=json.loads((root/'package.json').read_text())['version'],system_audio_real=True,work_logs_synthetic=True,user_settings_accessed=False,window_logical_size=[280,144],checks=checks);(folder/'result.json').write_text(json.dumps(result,indent=2));(root/'test-results/music-lifecycle-native.json').write_text(json.dumps(result,indent=2));print(json.dumps(result),flush=True)
finally:
 if play and play.poll() is None:play.terminate();play.wait(timeout=5)
 if app.poll() is None:app.terminate();app.wait(timeout=10)
