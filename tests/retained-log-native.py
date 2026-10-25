"""Active and pinned Work logs survive a full recent-file index; isolated data."""
import datetime,json,os,sqlite3,subprocess,time
from pathlib import Path
from native_app import app_binary
root=Path(__file__).resolve().parent.parent
folder=root/'test-results'/('retained-log-'+str(time.time_ns()));(folder/'logs').mkdir(parents=True)
settings=dict(auto_monitor=True,follow_latest=True,keep_history=False,overlay_enabled=True,overlay_layout='avatar',theme='moon',character='mai',hover_hide=False)
def save_settings():
 with sqlite3.connect(folder/'pulse.sqlite') as c:
  c.execute('CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY,value TEXT NOT NULL)');c.execute('INSERT OR REPLACE INTO settings VALUES(1,?)',(json.dumps(settings),))
def event(name,payload,at=None):
 with (folder/'logs'/name).open('a') as f:f.write(json.dumps(dict(type='event_msg',timestamp=datetime.datetime.fromtimestamp(at or time.time(),datetime.timezone.utc).isoformat(),payload=payload))+'\n')
def count(n):return dict(type='token_count',info=dict(total_token_usage=dict(output_tokens=n)))
event('aaaa.jsonl',count(100),time.time()-120);save_settings()
env=dict(os.environ,PULSE_OFFLINE_TEST='1',PULSE_DATA_DIR=str(folder),PULSE_RENDER_PROBE='1')
binary=app_binary(root)
p=None
def start():return subprocess.Popen([str(binary),'--background'],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
def probe(name='sampler'):
 try:return json.loads((folder/('probe-'+name+'.json')).read_text())
 except (OSError,ValueError):return {}
def until(check,timeout=15):
 end=time.monotonic()+timeout
 while time.monotonic()<end:
  if p.poll() is not None:raise AssertionError('Test app exited')
  if check(probe()):return
  time.sleep(.2)
 raise AssertionError(probe())
def stop():
 p.terminate();p.wait(timeout=5)
try:
 p=start();until(lambda s:len(s.get('sessions',[]))==1)
 event('aaaa.jsonl',dict(type='task_started',turn_id='active'),time.time()-1);event('aaaa.jsonl',count(120))
 until(lambda s:s.get('log_id')=='aaaa.jsonl' and s.get('output_tokens')==20)
 initial_sequence=probe()['sequence'];old=time.time()-3600;os.utime(folder/'logs/aaaa.jsonl',(old,old))
 for i in range(205):event(f'{i:04x}.jsonl',count(i+1),time.time()-300)
 until(lambda s:s.get('sequence',0)>=initial_sequence+4)
 assert any(r['id']=='aaaa.jsonl' and r['state']=='running' and r['output']==20 for r in probe()['sessions'])
 assert probe()['log_id']=='aaaa.jsonl';assert probe('windows').get('primary')=='aaaa.jsonl'
 event('bbbb.jsonl',count(10),time.time()-3)
 event('bbbb.jsonl',dict(type='task_started',turn_id='other'),time.time()-2)
 event('bbbb.jsonl',count(15),time.time()-1)
 until(lambda s:any(r['id']=='bbbb.jsonl' and r['state']=='running' for r in s.get('sessions',[])))
 # Automatic discovery must retain a known open task during source loss,
 # including when its old mtime puts it outside the recent-file index.
 original=folder/'logs/aaaa.jsonl';held=folder/'held-aaaa.jsonl';original.rename(held)
 initial_sequence=probe()['sequence'];until(lambda s:s.get('sequence',0)>=initial_sequence+3)
 missing=next((r for r in probe()['sessions'] if r['id']=='aaaa.jsonl'),None)
 assert missing is not None, 'Unreadable active task disappeared from monitoring'
 assert missing['state']=='unavailable' and missing['output'] is None and missing['rate'] is None
 assert probe('windows').get('primary')=='aaaa.jsonl', 'An error must not replace or move the shared character'
 assert 'bbbb.jsonl' in probe('windows').get('group',[])
 event('bbbb.jsonl',count(18))
 until(lambda s:any(r['id']=='bbbb.jsonl' and r['output']==8 for r in s.get('sessions',[])))
 held.rename(original)
 until(lambda s:any(r['id']=='aaaa.jsonl' and r['state']=='running' and r['output']==20 for r in s.get('sessions',[])))
 logs=folder/'logs';held_logs=folder/'held-logs';logs.rename(held_logs)
 initial_sequence=probe()['sequence'];until(lambda s:s.get('sequence',0)>=initial_sequence+3)
 interrupted={r['id']:r for r in probe()['sessions']}
 assert set(interrupted)=={'aaaa.jsonl','bbbb.jsonl'}
 assert all(r['state']=='unavailable' and r['rate'] is None and r['output'] is None for r in interrupted.values())
 assert probe('windows').get('primary')=='aaaa.jsonl'
 held_logs.rename(logs)
 until(lambda s:len([r for r in s.get('sessions',[]) if r['state']=='running'])==2)
 stop();settings.update(follow_latest=False,pinned_log='aaaa.jsonl');save_settings()
 # Remove stale test probes so a fresh run must independently prove recovery.
 for file in folder.glob('probe-*.json'):file.unlink()
 p=start();until(lambda s:s.get('log_id')=='aaaa.jsonl' and s.get('output_tokens')==20)
 assert probe()['state']=='running'
 until(lambda s:any(r['id']=='bbbb.jsonl' and r['state']=='running' for r in s.get('sessions',[])))
 # A missing fixed source must remain selected, with unavailable metrics,
 # and recover even when newer files keep it outside the discovery index.
 original=folder/'logs/aaaa.jsonl';held=folder/'held-aaaa.jsonl';original.rename(held)
 initial_sequence=probe()['sequence'];until(lambda s:s.get('sequence',0)>=initial_sequence+3)
 assert probe()['log_id']=='aaaa.jsonl', 'Temporary source loss erased the fixed selection'
 assert probe()['state']=='unavailable' and probe()['current_rate'] is None
 assert any(r['id']=='bbbb.jsonl' and r['state']=='running' for r in probe()['sessions'])
 held.rename(original);until(lambda s:s.get('log_id')=='aaaa.jsonl' and s.get('output_tokens')==20)
 event('aaaa.jsonl',count(150));until(lambda s:s.get('output_tokens')==50)
 logs=folder/'logs';held_logs=folder/'held-logs';logs.rename(held_logs)
 initial_sequence=probe()['sequence'];until(lambda s:s.get('sequence',0)>=initial_sequence+3)
 assert probe()['log_id']=='aaaa.jsonl' and probe()['state']=='unavailable'
 held_logs.rename(logs);until(lambda s:s.get('log_id')=='aaaa.jsonl' and s.get('output_tokens')==50)
 result=dict(passed=True,real_client_accessed=False,recent_files_created=205,checks=['An active task remains tracked outside the newest 200 log files','Its independent bubble and counts remain available','Automatic mode keeps an unreadable open task and its shared character, then recovers outside the recent index','Other tasks receive fresh counts while one source is unavailable','Automatic mode retains both interrupted tasks across a missing log directory and recovers them','Pinned old task recovers after restart despite being absent from the recent index','A temporarily missing pinned source stays selected and unavailable, then resumes without manual configuration','Other Work tasks keep updating during a pinned source failure','The fixed source also survives a temporarily unavailable log directory'])
 (folder/'result.json').write_text(json.dumps(result,indent=2));(root/'test-results/retained-log-native.json').write_text(json.dumps(result,indent=2));print(json.dumps(result),flush=True)
finally:
 if p is not None and p.poll() is None:stop()
