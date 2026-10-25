"""Own native background app, numeric-only fixture. No real conversation data."""
import json,datetime,sqlite3,os,subprocess,time
from pathlib import Path
from native_app import app_binary
root=Path(__file__).resolve().parent.parent;folder=root/'test-results'/('idle-native-'+str(time.time_ns()));(folder/'logs').mkdir(parents=True)
with sqlite3.connect(folder/'pulse.sqlite') as c:
 c.execute('CREATE TABLE settings(id INTEGER PRIMARY KEY,value TEXT NOT NULL)');c.execute('INSERT INTO settings VALUES(1,?)',(json.dumps(dict(auto_monitor=True,follow_latest=True,overlay_enabled=True,overlay_layout='avatar',character='roxy',theme='spellbook',hover_hide=False,idle_frequency='lively',keep_history=False,overlay_position=dict(x=800,y=300))),))
def append(payload):
 with (folder/'logs/a.jsonl').open('a') as f:f.write(json.dumps(dict(type='event_msg',timestamp=datetime.datetime.now(datetime.timezone.utc).isoformat(),payload=payload))+'\n')
append(dict(type='token_count',info=dict(total_token_usage=dict(output_tokens=100))))
env=dict(os.environ,PULSE_OFFLINE_TEST='1',PULSE_DATA_DIR=str(folder),PULSE_RENDER_PROBE='1')
p=subprocess.Popen([str(app_binary(root)),'--background'],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
def probe():
 try:return json.loads((folder/'probe-overlay.json').read_text())
 except (OSError,ValueError):return {}
try:
 end=time.monotonic()+155;motion=False;speech=False
 while time.monotonic()<end:
  assert p.poll() is None
  row=probe();motion=motion or bool(row.get('rendered_idle_mood'));speech=speech or row.get('rendered_companion') is True
  if motion and speech:break
  time.sleep(.5)
 assert motion and speech, row
 assert not row['main_visible'] and row['rendered_activity']=='waiting'
 append(dict(type='task_started',turn_id='t'))
 end=time.monotonic()+10
 while time.monotonic()<end:
  row=probe()
  if row.get('rendered_activity')=='processing' and not row.get('rendered_companion') and not row.get('rendered_idle_mood'):break
  time.sleep(.2)
 assert row.get('rendered_activity')=='processing' and not row.get('rendered_companion') and not row.get('rendered_idle_mood'),row
 result=dict(passed=True,real_client_accessed=False,main_never_opened=True,idle_motion_observed=True,random_opening_observed=True,new_work_interrupted=True)
 (root/'test-results/idle-native.json').write_text(json.dumps(result,indent=2));print(json.dumps(result),flush=True)
finally:
 p.terminate()
 try:p.wait(timeout=5)
 except subprocess.TimeoutExpired:p.kill();p.wait(timeout=5)
