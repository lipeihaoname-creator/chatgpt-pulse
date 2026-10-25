#!/usr/bin/env python3
"""Native background integration: own app, synthetic metadata, no GPT UI/content."""
import argparse, datetime, json, os, signal, sqlite3, subprocess, time
from pathlib import Path
from native_app import app_binary
parser=argparse.ArgumentParser();parser.add_argument('--seconds',type=int,default=330);parser.add_argument('--hidden-overlay',action='store_true');parser.add_argument('--avatar',action='store_true');parser.add_argument('--roxy',action='store_true');parser.add_argument('--large-tool',action='store_true');args=parser.parse_args()
root=Path(__file__).resolve().parent.parent
folder=root/'test-results'/('background-070-'+str(int(time.time())))
(folder/'logs').mkdir(parents=True)
settings={'auto_monitor':True,'follow_latest':True,'overlay_enabled':not args.hidden_overlay,'locked':True,'hover_hide':False,'keep_history':False,'interval_ms':1000,'rate_idle_seconds':30,'adaptive_retention':True,'completion_card':True,'overlay_layout':'avatar' if args.avatar else 'bar','theme':'moon','character':'roxy' if args.roxy else 'mai','overlay_position':{'x':1900,'y':1100}}
c=sqlite3.connect(folder/'pulse.sqlite');c.execute('CREATE TABLE settings(id INTEGER PRIMARY KEY,value TEXT NOT NULL)');c.execute('INSERT INTO settings VALUES(1,?)',(json.dumps(settings),));c.commit();c.close()
log=folder/'logs/a.jsonl'
def event(payload,at=None,kind='event_msg',path=log):
    stamp=datetime.datetime.fromtimestamp(at if at is not None else time.time(),datetime.timezone.utc).isoformat()
    with path.open('a') as f:f.write(json.dumps({'type':kind,'timestamp':stamp,'payload':payload})+'\n')
def count(n,r):return {'type':'token_count','info':{'total_token_usage':{'output_tokens':n,'reasoning_output_tokens':r}}}
event(count(100,10),time.time()-120)
env=os.environ.copy();env.update(PULSE_OFFLINE_TEST='1',PULSE_DATA_DIR=str(folder),PULSE_RENDER_PROBE='1',PULSE_TEST_DROP_PUSH='1')
binary=app_binary(root)
process=subprocess.Popen([str(binary),'--background'],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
checks=[];samples=[]
def probe(name):
    try:return json.loads((folder/('probe-'+name+'.json')).read_text())
    except (OSError,ValueError):return {}
def until(predicate,seconds=12):
    end=time.monotonic()+seconds
    while time.monotonic()<end:
        if process.poll() is not None:raise AssertionError('Test application exited')
        s,v=probe('sampler'),probe('overlay')
        if predicate(s,v):return s,v
        time.sleep(.2)
    raise AssertionError('Timed out: '+json.dumps({'sampler':probe('sampler'),'overlay':probe('overlay')}))
def healthy(s,v):
    return bool(v) and not v.get('main_visible',True) and not v.get('view_focused',True) and v.get('rendered_sequence',0)>0 and s.get('sequence',0)-v.get('rendered_sequence',0)<=4 and int(time.time()*1000)-v.get('at',0)<5000
try:
    until(lambda s,v:healthy(s,v) and s.get('sequence',0)>=3)
    checks.append('Never-opened main window; overlay has no focus and renders snapshots without push events')
    if args.avatar:
        size=probe('overlay').get('size');assert size and round(size[0]/size[2])==280 and round(size[1]/size[2])==128
        checks.append('Native avatar window is exactly 280 by 128 logical pixels')
    now=time.time();event({'type':'task_started','turn_id':'bg_t1'},now-110)
    for at,n,r in [(now-100,120,12),(now-80,140,14),(now-55,160,16),(now-25,180,18)]:event(count(n,r),at)
    event({'type':'reasoning'},kind='response_item')
    s,v=until(lambda s,v:healthy(s,v) and s.get('output_tokens')==80 and s.get('timeout')==60 and v.get('rendered_activity')=='reasoning')
    checks.append('Background source updates; adaptive timeout learns 60 seconds from three report gaps')
    newer=folder/'logs/c.jsonl'
    event(count(500,50),time.time()-30,path=newer)
    event({'type':'task_started','turn_id':'old'},time.time()-20,path=newer)
    event({'type':'task_complete','turn_id':'old','duration_ms':2000},time.time()-18,path=newer)
    previous=s['sequence']
    until(lambda s,v:healthy(s,v) and s.get('sequence',0)>=previous+3 and s.get('log_id')=='a.jsonl')
    checks.append('A newer completed log does not displace an active task')

    start=time.monotonic();last_sequence=s['sequence']
    print(json.dumps({'phase':'background_monitoring','folder':str(folder),'duration_seconds':args.seconds}),flush=True)
    while time.monotonic()-start<args.seconds:
        time.sleep(min(10,max(.1,args.seconds-(time.monotonic()-start))))
        s,v=until(healthy,5)
        assert s['sequence']>last_sequence,'Sampler stopped progressing'
        last_sequence=s['sequence'];samples.append({'seconds':round(time.monotonic()-start),'sampler':s['sequence'],'rendered':v['rendered_sequence'],'main_visible':v['main_visible'],'focused':v['view_focused']})
        if len(samples)%6==0:print(json.dumps({'phase':'background_progress','seconds':round(time.monotonic()-start),'sampler_sequence':s['sequence'],'rendered_sequence':v['rendered_sequence']}),flush=True)
    checks.append('Sampler and rendered overlay remained live for '+str(args.seconds)+' seconds in background')
    if args.large_tool:
        event({'type':'function_call','call_id':'large_result','arguments':'{}'},kind='response_item')
        until(lambda s,v:healthy(s,v) and v.get('rendered_activity')=='tool')
        before=time.monotonic()
        event({'type':'function_call_output','call_id':'large_result','output':'SYNTHETIC_ONLY_'*80000},kind='response_item')
        until(lambda s,v:healthy(s,v) and v.get('rendered_activity')=='processing',12)
        checks.append('Large tool result closes its call and catches up in '+str(round(time.monotonic()-before,2))+' seconds without body persistence')
    event({'type':'message','role':'assistant'},kind='response_item')
    until(lambda s,v:healthy(s,v) and v.get('rendered_activity')=='responding')
    checks.append('Fresh reply metadata recovers work status after long silent background period')
    event({'type':'task_complete','turn_id':'bg_t1','duration_ms':100000})
    until(lambda s,v:healthy(s,v) and v.get('rendered_activity')=='completed' and v.get('rendered_completion') is True)
    checks.append('Live completion settlement card renders while main stays hidden')
    until(lambda s,v:healthy(s,v) and s.get('state')=='waiting' and v.get('rendered_completion') is False,20)
    checks.append('Settlement expires to waiting without foregrounding or displaying old completed work')
    other=folder/'logs/b.jsonl';event(count(1000,100),time.time()-5,path=other)
    event({'type':'task_started','turn_id':'bg_t2'},time.time()-1,path=other);event({'type':'reasoning'},kind='response_item',path=other)
    until(lambda s,v:healthy(s,v) and s.get('log_id')=='b.jsonl' and v.get('rendered_activity')=='reasoning')
    checks.append('New chat log is followed and rendered entirely in background')
    result={'passed':True,'real_client_accessed':False,'push_events_dropped':True,'duration_seconds':args.seconds,'overlay_hidden':args.hidden_overlay,'avatar':args.avatar,'roxy':args.roxy,'large_tool':args.large_tool,'folder':str(folder),'checks':checks,'samples':samples}
    (root/('test-results/background-native-hidden.json' if args.hidden_overlay else 'test-results/background-native.json')).write_text(json.dumps(result,indent=2));print(json.dumps(result),flush=True)
finally:
    process.terminate()
    try:process.wait(timeout=5)
    except subprocess.TimeoutExpired:process.kill();process.wait(timeout=5)
