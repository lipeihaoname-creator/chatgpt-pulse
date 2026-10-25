#!/usr/bin/env python3
"""Own-app GUI fixture. Never reads real logs, preferences, or chat content."""
import os,json,sqlite3,subprocess,argparse
from pathlib import Path
from native_app import app_binary
parser=argparse.ArgumentParser();parser.add_argument('--folder',required=True);args=parser.parse_args()
root=Path(__file__).resolve().parent.parent
folder=Path(args.folder).resolve();assert folder.is_relative_to(root/'test-results')
(folder/'logs').mkdir(parents=True,exist_ok=True)
if not (folder/'pulse.sqlite').exists():
 c=sqlite3.connect(folder/'pulse.sqlite');c.execute('CREATE TABLE settings(id INTEGER PRIMARY KEY,value TEXT NOT NULL)');c.execute('INSERT INTO settings VALUES(1,?)',(json.dumps({'auto_monitor':False,'follow_latest':True,'keep_history':False,'overlay_enabled':True,'overlay_layout':'avatar','theme':'moon','locked':True,'hover_hide':False,'overlay_position':{'x':40,'y':100}}),));c.commit();c.close()
env=os.environ.copy();env.update(PULSE_OFFLINE_TEST='1',PULSE_DATA_DIR=str(folder),PULSE_RENDER_PROBE='1')
binary=app_binary(root)
with (folder/'native-stderr.log').open('a') as stderr:
 process=subprocess.Popen([str(binary)],env=env,stdout=subprocess.DEVNULL,stderr=stderr)
 print(json.dumps({'fixture':str(folder),'pid':process.pid}),flush=True)
 try:process.wait()
 finally:
  if process.poll() is None:process.terminate();process.wait(timeout=5)
