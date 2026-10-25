"""Restart the own app at the exact display edge, using numeric-only fixtures."""
from pathlib import Path
from native_app import app_binary
import json,os,sqlite3,subprocess,time
root=Path(__file__).resolve().parent.parent
folder=root/'test-results'/('restore-native-'+str(time.time_ns()));(folder/'logs').mkdir(parents=True)
base=dict(auto_monitor=True,follow_latest=True,overlay_enabled=True,overlay_layout='avatar',character='roxy',edge_snap=True,hover_hide=False,keep_history=False,overlay_position=dict(x=100,y=108))
with sqlite3.connect(folder/'pulse.sqlite') as c:
 c.execute('create table settings(id integer primary key,value text)');c.execute('insert into settings values(1,?)',(json.dumps(base),))
env=dict(os.environ,PULSE_OFFLINE_TEST='1',PULSE_DATA_DIR=str(folder),PULSE_RENDER_PROBE='1')
def launch():return subprocess.Popen([str(app_binary(root)),'--background'],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
def probe(name):
 try:return json.loads((folder/('probe-'+name+'.json')).read_text())
 except (OSError,ValueError):return {}
def ready(process,expected=None):
 end=time.monotonic()+12
 while time.monotonic()<end:
  assert process.poll() is None
  row=probe('overlay')
  if row.get('rendered_sequence',0)>=3 and (expected is None or row.get('position')==expected):return row
  time.sleep(.2)
 raise AssertionError({'overlay':probe('overlay'),'restore':probe('restore'),'expected':expected})
def stop(p):
 p.terminate();p.wait(timeout=5)
p=launch()
try:
 ready(p);screen=next(s for s in probe('restore')['screens'] if s['x']<=0<s['x']+s['width'])
finally:stop(p)
expected=[round(screen['x']+screen['width']-280*screen['scale']),screen['y']+108]
base['overlay_position']=dict(zip(['x','y'],expected))
with sqlite3.connect(folder/'pulse.sqlite') as c:c.execute('update settings set value=? where id=1',(json.dumps(base),))
for _ in range(2):
 for f in folder.glob('probe-*.json'):f.unlink()
 p=launch()
 try:
  row=ready(p,expected);assert row['rendered_avatar_count']==1
  assert not row['main_visible']
  with sqlite3.connect(folder/'pulse.sqlite') as c:settings=json.loads(c.execute('select value from settings').fetchone()[0])
  assert settings['overlay_position']==base['overlay_position'],settings['overlay_position']
  assert probe('restore')['target']==expected
 finally:stop(p)
result=dict(passed=True,real_client_accessed=False,right_edge_preserved=True,restarts=2,one_avatar=True)
(root/'test-results/restore-native.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
