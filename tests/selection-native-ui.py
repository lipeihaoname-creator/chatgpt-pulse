"""Own-app GUI fixture for a source switch with active logs beyond the index."""
import datetime,json,os,sqlite3,subprocess,time,argparse
from pathlib import Path
from native_app import app_binary
p=argparse.ArgumentParser();p.add_argument('--folder',required=True);args=p.parse_args()
root=Path(__file__).resolve().parent.parent;folder=Path(args.folder).resolve()
assert folder.is_relative_to(root/'test-results') and not folder.exists()
(folder/'logs').mkdir(parents=True)
with sqlite3.connect(folder/'pulse.sqlite') as c:
 c.execute('CREATE TABLE settings(id INTEGER PRIMARY KEY,value TEXT NOT NULL)')
 c.execute('INSERT INTO settings VALUES(1,?)',(json.dumps(dict(auto_monitor=True,follow_latest=True,keep_history=False,overlay_enabled=True,overlay_layout='avatar',character='roxy',theme='spellbook',hover_hide=False,overlay_position=dict(x=40,y=100))),))
def event(name,payload,at=None):
 with (folder/'logs'/name).open('a') as f:
  f.write(json.dumps(dict(type='event_msg',timestamp=datetime.datetime.fromtimestamp(at if at is not None else time.time(),datetime.timezone.utc).isoformat(),payload=payload))+'\n')
def count(n):return dict(type='token_count',info=dict(total_token_usage=dict(output_tokens=n)))
def task(name,total):
 event(name,count(100),time.time()-3);event(name,dict(type='task_started',turn_id='work'),time.time()-2);event(name,count(total),time.time()-1)
def probe():
 try:return json.loads((folder/'probe-sampler.json').read_text())
 except (OSError,ValueError):return {}
task('aaaa.jsonl',120)
env=dict(os.environ,PULSE_OFFLINE_TEST='1',PULSE_DATA_DIR=str(folder),PULSE_RENDER_PROBE='1')
binary=app_binary(root)
with (folder/'stderr.log').open('w') as stderr:
 process=subprocess.Popen([str(binary)],env=env,stdout=subprocess.DEVNULL,stderr=stderr)
 try:
  deadline=time.monotonic()+20
  while probe().get('log_id')!='aaaa.jsonl':
   assert process.poll() is None and time.monotonic()<deadline
   time.sleep(.2)
  os.utime(folder/'logs/aaaa.jsonl',(time.time()-3600,)*2)
  task('bbbb.jsonl',150)
  deadline=time.monotonic()+20
  while not any(row['id']=='bbbb.jsonl' and row['state']=='running' for row in probe().get('sessions',[])):
   assert process.poll() is None and time.monotonic()<deadline
   time.sleep(.2)
  for i in range(205):event(f'{i:04x}.jsonl',count(1),time.time()-120)
  sequence=probe()['sequence']
  deadline=time.monotonic()+20
  while probe().get('sequence',0)<sequence+3:
   assert process.poll() is None and time.monotonic()<deadline
   time.sleep(.2)
  print(json.dumps({'ready':True,'fixture':str(folder),'pid':process.pid}),flush=True)
  process.wait()
 finally:
  if process.poll() is None:process.terminate();process.wait(timeout=5)
