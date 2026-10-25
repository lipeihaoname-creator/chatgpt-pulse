#!/usr/bin/env python3
"""Check local release integrity; no uploads or access to conversation data."""
from pathlib import Path
import argparse,hashlib,json,plistlib,subprocess,zipfile
from source_archive import selected_sources
parser=argparse.ArgumentParser();parser.add_argument('--installed',type=Path);args=parser.parse_args()
root=Path(__file__).resolve().parent.parent
version=json.loads((root/'package.json').read_text())['version'];release=root/'release'
app=release/'.artifacts.noindex/ChatGPT Pulse.app'
if not app.exists():app=release/'ChatGPT Pulse.app'
info=plistlib.loads((app/'Contents/Info.plist').read_bytes());assert info['CFBundleShortVersionString']==version
assert info['LSMinimumSystemVersion']=='13.3'
for notice in ['ASSETS.md','LICENSE.txt','THIRD_PARTY_NOTICES.txt','LICENSING.md','DEPENDENCIES.md']:
    assert (app/'Contents/Resources'/notice).is_file(),notice
for local,bundled in [('LICENSE','LICENSE.txt'),('docs/ASSETS.md','ASSETS.md'),('THIRD_PARTY_NOTICES.txt','THIRD_PARTY_NOTICES.txt'),('docs/LICENSING.md','LICENSING.md'),('docs/DEPENDENCIES.md','DEPENDENCIES.md')]:
    assert (app/'Contents/Resources'/bundled).read_bytes()==(root/local).read_bytes(),bundled
for p in (root/'licenses').rglob('*'):
    if p.is_file():assert (app/'Contents/Resources/licenses'/p.relative_to(root/'licenses')).read_bytes()==p.read_bytes(),p.name
upstream=json.loads((root/'licenses/upstream.json').read_text())
assert hashlib.sha256((root/'licenses/PolyForm-Noncommercial-1.0.0.txt').read_bytes()).hexdigest()==upstream['sha256']
subprocess.run(['codesign','--verify','--deep','--strict',str(app)],check=True)
binary=app/'Contents/MacOS'/info['CFBundleExecutable'];h=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert set(subprocess.check_output(['lipo','-archs',str(binary)],text=True).split())=={'x86_64','arm64'}
dmg=release/f'ChatGPT-Pulse-{version}-mac-universal.dmg'
assert dmg.is_file()
subprocess.run(['hdiutil','verify',str(dmg)],check=True,stdout=subprocess.DEVNULL)
with zipfile.ZipFile(release/f'ChatGPT-Pulse-{version}-mac-universal.zip') as z:
    assert hashlib.sha256(z.read('ChatGPT Pulse.app/Contents/MacOS/'+info['CFBundleExecutable'])).hexdigest()==h(binary)
    for p in (app/'Contents/Resources').rglob('*'):
        if p.is_file():assert z.read('ChatGPT Pulse.app/'+p.relative_to(app).as_posix())==p.read_bytes(),p.name
with zipfile.ZipFile(release/f'ChatGPT-Pulse-{version}-source.zip') as z:
    names=z.namelist()
    assert set(names)=={'chatgpt-pulse/'+rel.as_posix() for _,rel,_ in selected_sources(root)}
    for name in names:
        p=Path(name);assert p.parts[0]=='chatgpt-pulse' and '..' not in p.parts
        assert not {'.tools','node_modules','test-results','target','release','.git','.env'}.intersection(p.parts)
        assert z.read(name)==(root/p.relative_to('chatgpt-pulse')).read_bytes(),name
    assert 'chatgpt-pulse/.github/workflows/check.yml' in names
    assert 'chatgpt-pulse/src-tauri/tauri.macos.conf.json' in names
    assert 'chatgpt-pulse/src-tauri/tauri.windows.conf.json' in names
for line in (release/'SHA256SUMS').read_text().splitlines():
    digest,name=line.split('  ',1);assert digest==h(release/name)
if args.installed:
    installed=plistlib.loads((args.installed/'Contents/Info.plist').read_bytes());assert installed['CFBundleShortVersionString']==version
    assert h(args.installed/'Contents/MacOS'/installed['CFBundleExecutable'])==h(binary)
    subprocess.run(['codesign','--verify','--deep','--strict',str(args.installed)],check=True)
print(json.dumps(dict(passed=True,version=version,architectures=['arm64','x86_64'],source_entries=len(names),source_matches=True,dmg_verified=True,checksums_verified=True,installed_matches=bool(args.installed),published=False)))
