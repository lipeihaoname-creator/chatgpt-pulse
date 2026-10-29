"""Read-only CPU/RSS/handle sample for the candidate and its process descendants."""
from pathlib import Path
from ctypes import wintypes as w
import argparse,ctypes as c,json,time,os,sqlite3,subprocess,winsound
arg=argparse.ArgumentParser();arg.add_argument('--seconds',type=int,default=60);arg.add_argument('--spawn-isolated',action='store_true');arg.add_argument('--system-audio-confirmed',action='store_true');args=arg.parse_args()
if args.spawn_isolated and not args.system_audio_confirmed:arg.error('Explicit system-output capture consent required: --system-audio-confirmed')
k=c.WinDLL('kernel32',use_last_error=True);ps=c.WinDLL('psapi',use_last_error=True)
class PE(c.Structure):_fields_=[('size',w.DWORD),('usage',w.DWORD),('pid',w.DWORD),('heap',c.c_size_t),('module',w.DWORD),('threads',w.DWORD),('parent',w.DWORD),('priority',w.LONG),('flags',w.DWORD),('exe',w.WCHAR*260)]
class Memory(c.Structure):_fields_=[('cb',w.DWORD),('faults',w.DWORD)]+[(name,c.c_size_t) for name in ['peak_working_set','working_set','peak_paged','paged','peak_nonpaged','nonpaged','pagefile','peak_pagefile']]
k.CreateToolhelp32Snapshot.argtypes=[w.DWORD,w.DWORD];k.CreateToolhelp32Snapshot.restype=w.HANDLE
k.Process32FirstW.argtypes=[w.HANDLE,c.POINTER(PE)];k.Process32NextW.argtypes=[w.HANDLE,c.POINTER(PE)]
k.OpenProcess.argtypes=[w.DWORD,w.BOOL,w.DWORD];k.OpenProcess.restype=w.HANDLE
k.CloseHandle.argtypes=[w.HANDLE];k.QueryFullProcessImageNameW.argtypes=[w.HANDLE,w.DWORD,w.LPWSTR,c.POINTER(w.DWORD)]
k.GetProcessTimes.argtypes=[w.HANDLE,c.POINTER(w.FILETIME),c.POINTER(w.FILETIME),c.POINTER(w.FILETIME),c.POINTER(w.FILETIME)]
k.GetProcessHandleCount.argtypes=[w.HANDLE,c.POINTER(w.DWORD)]
ps.GetProcessMemoryInfo.argtypes=[w.HANDLE,c.POINTER(Memory),w.DWORD]
root=Path(__file__).resolve().parent.parent
candidate=str((root/'src-tauri/target/release/chatgpt-pulse.exe').resolve()).lower()
app=None;test_folder=None;tone=None
if args.spawn_isolated:
 test_folder=root/'test-results'/('music-resources-'+str(time.time_ns()));(test_folder/'logs').mkdir(parents=True)
 with sqlite3.connect(test_folder/'pulse.sqlite') as db:
  db.execute('CREATE TABLE settings(id INTEGER PRIMARY KEY,value TEXT NOT NULL)')
  db.execute('INSERT INTO settings VALUES(1,?)',(json.dumps(dict(auto_monitor=True,follow_latest=True,overlay_enabled=True,overlay_layout='avatar',character='roxy',hover_hide=False,music_enabled=True,music_spectrum=True,idle_chat=False,idle_motions=False)),))
 tone=max((root/'test-results').glob('windows-music-*/generated-playback.wav'),key=lambda p:p.stat().st_mtime)
 app=subprocess.Popen([str(root/'src-tauri/target/release/chatgpt-pulse.exe'),'--background'],env=dict(os.environ,PULSE_OFFLINE_TEST='1',PULSE_DATA_DIR=str(test_folder),PULSE_RENDER_PROBE='1'),creationflags=subprocess.CREATE_NO_WINDOW,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 time.sleep(3)
def snapshot():
 handle=k.CreateToolhelp32Snapshot(2,0);entry=PE();entry.size=c.sizeof(entry);rows={}
 try:
  more=k.Process32FirstW(handle,c.byref(entry))
  while more:rows[entry.pid]=(entry.parent,entry.exe);more=k.Process32NextW(handle,c.byref(entry))
 finally:k.CloseHandle(handle)
 return rows
def image(pid):
 h=k.OpenProcess(0x1000,False,pid)
 if not h:return ''
 try:
  name=c.create_unicode_buffer(32768);n=w.DWORD(len(name))
  return name.value.lower() if k.QueryFullProcessImageNameW(h,0,name,c.byref(n)) else ''
 finally:k.CloseHandle(h)
rows=snapshot();pids=[app.pid] if app else [pid for pid,(_,exe) in rows.items() if exe.lower()=='chatgpt-pulse.exe' and image(pid)==candidate]
assert len(pids)==1,pids
pid=pids[0];folder=test_folder or max((root/'test-results').glob('windows-music-*'),key=lambda p:p.stat().st_mtime)
samples=[];previous={};previous_at=None
for index in range(max(2,args.seconds//2)):
 if app and index==5:winsound.PlaySound(str(tone),winsound.SND_FILENAME|winsound.SND_ASYNC|winsound.SND_LOOP|winsound.SND_NODEFAULT)
 if app and index==15:winsound.PlaySound(None,0)
 rows=snapshot();family={pid}
 while True:
  extended=family|{p for p,(parent,_) in rows.items() if parent in family}
  if extended==family:break
  family=extended
 cpu={};rss=handles=0;unavailable=0
 for p in family:
  h=k.OpenProcess(0x410,False,p)
  if not h:unavailable+=1;continue
  try:
   times=[w.FILETIME() for _ in range(4)];mem=Memory();mem.cb=c.sizeof(mem);count=w.DWORD()
   if k.GetProcessTimes(h,*[c.byref(t) for t in times]):cpu[p]=sum((t.dwHighDateTime<<32)+t.dwLowDateTime for t in times[2:])/10000000
   if ps.GetProcessMemoryInfo(h,c.byref(mem),c.sizeof(mem)):rss+=mem.working_set
   else:unavailable+=1
   if k.GetProcessHandleCount(h,c.byref(count)):handles+=count.value
  finally:k.CloseHandle(h)
 now=time.monotonic()
 try:audio=json.loads((folder/'probe-audio.json').read_text())
 except (OSError,ValueError):audio={}
 samples.append(dict(seconds=round(now-(samples[0]['monotonic'] if samples else now),2),monotonic=now,audio=audio.get('status'),processes=len(family),unavailable=unavailable,rss_sum_mib=round(rss/1048576,2),handles=handles,cpu_percent_one_core=round(sum(max(0,value-previous[p]) for p,value in cpu.items() if p in previous)/(now-previous_at)*100,2) if previous_at else None))
 previous=cpu;previous_at=now;time.sleep(2)
for row in samples:row.pop('monotonic',None)
report=dict(candidate_and_observed_descendants=True,rss_is_sum_not_unique_memory=True,cpu_percent_unit='one logical CPU core; not normalized by system cores',seconds=args.seconds,samples=samples)
(root/'test-results/evidence/music-resource-sample.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps({'seconds':args.seconds,'samples':len(samples),'statuses':sorted(set(s['audio'] for s in samples if s['audio'])),'max_processes':max(s['processes'] for s in samples),'unavailable_samples':sum(bool(s['unavailable']) for s in samples)}))
if app:
 winsound.PlaySound(None,0);app.terminate();app.wait(timeout=10)
