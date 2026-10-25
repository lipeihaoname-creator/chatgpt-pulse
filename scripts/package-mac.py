#!/usr/bin/env python3
"""Package a verified local candidate and a source archive, never publish it."""
from pathlib import Path
import argparse,datetime,hashlib,json,plistlib,shutil,subprocess
from source_archive import create_source_archive

root=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser()
parser.add_argument('--app',type=Path,default=root/'src-tauri/target/universal-apple-darwin/release/bundle/macos/ChatGPT Pulse.app')
parser.add_argument('--dmg',type=Path,help='Verified Tauri DMG; defaults to the universal build output')
args=parser.parse_args()
version=json.loads((root/'package.json').read_text())['version']
info=plistlib.loads((args.app/'Contents/Info.plist').read_bytes())
assert info['CFBundleShortVersionString']==version
resources=args.app/'Contents/Resources'
for local,bundled in [('LICENSE','LICENSE.txt'),('THIRD_PARTY_NOTICES.txt','THIRD_PARTY_NOTICES.txt'),('docs/LICENSING.md','LICENSING.md'),('docs/DEPENDENCIES.md','DEPENDENCIES.md')]:
    assert (resources/bundled).read_bytes()==(root/local).read_bytes(), 'Stale or missing license resource: '+bundled
for p in (root/'licenses').rglob('*'):
    if p.is_file():assert (resources/'licenses'/p.relative_to(root/'licenses')).read_bytes()==p.read_bytes(),p.name
binary=args.app/'Contents/MacOS'/info['CFBundleExecutable']
arches=set(subprocess.check_output(['lipo','-archs',str(binary)],text=True).split())
assert arches=={'arm64','x86_64'},arches
subprocess.run(['codesign','--verify','--deep','--strict',str(args.app)],check=True)
release=root/'release';release.mkdir(exist_ok=True)
app=release/'.artifacts.noindex/ChatGPT Pulse.app'
app.parent.mkdir(parents=True,exist_ok=True)
if args.app.resolve()!=app.resolve():
    if app.exists():
        old=plistlib.loads((app/'Contents/Info.plist').read_bytes())['CFBundleShortVersionString']
        archive=release/'archive'/(old+'-'+datetime.datetime.now().strftime('%Y%m%d-%H%M%S'));archive.mkdir(parents=True)
        # Compressed backups do not appear as extra launchable applications.
        subprocess.run(['ditto','-c','-k','--keepParent',str(app),str(archive/'mac-app.zip')],check=True)
        shutil.rmtree(app)
    subprocess.run(['ditto',str(args.app),str(app)],check=True)
mac=release/f'ChatGPT-Pulse-{version}-mac-universal.zip'
subprocess.run(['ditto','-c','-k','--sequesterRsrc','--keepParent',str(app),str(mac)],check=True)
dmg_input=args.dmg or root/f'src-tauri/target/universal-apple-darwin/release/bundle/dmg/ChatGPT Pulse_{version}_universal.dmg'
assert dmg_input.is_file(), 'Build the Mac DMG first'
subprocess.run(['hdiutil','verify',str(dmg_input)],check=True,stdout=subprocess.DEVNULL)
dmg=release/f'ChatGPT-Pulse-{version}-mac-universal.dmg'
shutil.copy2(dmg_input,dmg)
source=release/f'ChatGPT-Pulse-{version}-source.zip'
report=create_source_archive(root,source)
h=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
artifacts=[dmg,mac,source]
for suffix in ['windows-x64-setup.exe','windows-x64-online-setup.exe']:
    candidate=release/f'ChatGPT-Pulse-{version}-{suffix}'
    if candidate.is_file():artifacts.append(candidate)
(release/'SHA256SUMS').write_text(''.join(h(p)+'  '+p.name+'\n' for p in artifacts))
(root/'test-results').mkdir(exist_ok=True)
(root/'test-results/source-archive-verification.json').write_text(json.dumps(report,indent=2)+'\n')
# The verified packaged copy is retained under .noindex. Do not leave a second
# launchable build app behind after producing its DMG and ZIP.
build_app=root/'src-tauri/target/universal-apple-darwin/release/bundle/macos/ChatGPT Pulse.app'
if args.app.resolve()==build_app.resolve() and build_app.exists():
    assert h(build_app/'Contents/MacOS'/info['CFBundleExecutable'])==h(app/'Contents/MacOS'/info['CFBundleExecutable'])
    subprocess.run(['/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister','-u',str(build_app)],check=False,capture_output=True)
    shutil.rmtree(build_app)
print(json.dumps(dict(version=version,architectures=sorted(arches),signature_verified=True,source_entries=report['entries'],source_matches=True,private_data_excluded=True,dmg=dmg.name,published=False)))
