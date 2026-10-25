"""Concurrent synthetic log test. Does not access the real client or logs."""
import os,json,sqlite3,subprocess,time,datetime
from pathlib import Path
from native_app import app_binary
root=Path(__file__).resolve().parent.parent
folder=root/'test-results'/('work-windows-native-'+str(time.time_ns()));(folder/'logs').mkdir(parents=True)
c=sqlite3.connect(folder/'pulse.sqlite');c.execute('CREATE TABLE settings(id INTEGER PRIMARY KEY,value TEXT NOT NULL)');c.execute('INSERT INTO settings VALUES(1,?)',(json.dumps({'auto_monitor':True,'follow_latest':False,'pinned_log':'a.jsonl','keep_history':False,'overlay_enabled':True,'overlay_layout':'avatar','theme':'moon','hover_hide':False}),));c.commit();c.close()
def event(name,payload,at=None):
 with (folder/'logs'/name).open('a') as f:f.write(json.dumps({'type':'event_msg','timestamp':datetime.datetime.fromtimestamp(at or time.time(),datetime.timezone.utc).isoformat(),'payload':payload})+'\n')
def count(n):return {'type':'token_count','info':{'total_token_usage':{'output_tokens':n,'reasoning_output_tokens':0}}}
for name in ['a.jsonl','b.jsonl']:event(name,count(100),time.time()-120)
env=os.environ.copy();env.update(PULSE_OFFLINE_TEST='1',PULSE_DATA_DIR=str(folder),PULSE_RENDER_PROBE='1')
p=subprocess.Popen([str(app_binary(root)),'--background'],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
def until(check):
 end=time.monotonic()+15
 while time.monotonic()<end:
  try:s=json.loads((folder/'probe-sampler.json').read_text())
  except (OSError,ValueError):s={}
  if check(s):return s
  if p.poll() is not None:raise AssertionError('Application exited')
  time.sleep(.2)
 raise AssertionError(s)
try:
 until(lambda s:len(s.get('sessions',[]))==2)
 for name,n in [('a.jsonl',130),('b.jsonl',170)]:event(name,{'type':'task_started','turn_id':name[0]+'_turn'});event(name,count(n))
 s=until(lambda s: {r['id']:r['output'] for r in s.get('sessions',[])}=={'a.jsonl':30,'b.jsonl':70})
 assert s['log_id']=='a.jsonl'
 def windows_ready():
  try:
   w=json.loads((folder/'probe-windows.json').read_text())
   if len(w['tasks'])!=1 or not w['root_visible'] or w['primary']!='a.jsonl':return False
   first=json.loads((folder/'probe-overlay.json').read_text())
   if first.get('rendered_log_id')!='a.jsonl' or first.get('rendered_output_tokens')!=30 or first.get('rendered_avatar_count')!=1:return False
   frames={'a.jsonl':first}
   for label,id in w['tasks'].items():
    frame=json.loads((folder/('probe-'+label+'.json')).read_text())
    if frame.get('rendered_avatar_count')!=0 or frame.get('rendered_log_id')!=id or frame.get('rendered_output_tokens')!=({'a.jsonl':30,'b.jsonl':70}[id]) or not frame['view_visible']:return False
    frames[id]=frame
   assert frames['a.jsonl']['position']!=frames['b.jsonl']['position']
   return True
  except (OSError,ValueError,KeyError):return False
 until(lambda s:windows_ready())
 event('a.jsonl',{'type':'task_complete','turn_id':'a_turn','duration_ms':1000});event('b.jsonl',count(190))
 s=until(lambda s:any(r['id']=='a.jsonl' and r['state']=='completed' for r in s.get('sessions',[])) and any(r['id']=='b.jsonl' and r['state']=='running' and r['output']==90 for r in s.get('sessions',[])))
 # The completed bubble is retained for settlement, then only that window closes.
 before=json.loads((folder/'probe-windows.json').read_text())['tasks']
 assert len(before)==1
 until(lambda s:len(json.loads((folder/'probe-windows.json').read_text())['tasks'])==0 and json.loads((folder/'probe-windows.json').read_text())['primary']=='b.jsonl')
 remaining=json.loads((folder/'probe-windows.json').read_text())['tasks']
 assert not remaining
 until(lambda s:json.loads((folder/'probe-overlay.json').read_text()).get('rendered_log_id')=='b.jsonl')
 frame=json.loads((folder/'probe-overlay.json').read_text())
 assert frame['output_tokens']==90 and frame['rendered_log_id']=='b.jsonl' and frame['rendered_avatar_count']==1
 result={'passed':True,'real_client_accessed':False,'checks':['Pinned detail still monitors both logs','Concurrent counts remain 30 and 70, never summed','Two native bubbles render 30 and 70 with exactly one character','Completing a promotes b to the persistent character bubble without duplicating the avatar']}
 (folder/'result.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
finally:p.terminate();p.wait(timeout=5)
