"""Read-only DMG install/copy acceptance with isolated numeric fixtures."""
from pathlib import Path
import hashlib
import json
import os
import plistlib
import shutil
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parent.parent
version = json.loads((root / 'package.json').read_text())['version']
assert sys.platform == 'darwin', 'Run on a Mac'
image = Path(os.environ.get('PULSE_DMG', str(root / f'src-tauri/target/universal-apple-darwin/release/bundle/dmg/ChatGPT Pulse_{version}_universal.dmg'))).resolve()
folder = Path(tempfile.mkdtemp(prefix='dmg-install-', dir=root / 'test-results')).resolve()
mount = folder / 'mount'
mount.mkdir()
report = {'version': version, 'passed': False, 'real_logs_accessed': False, 'notarized': False}
attached = False
copied = None
try:
    subprocess.run(['hdiutil', 'verify', str(image)], check=True, stdout=subprocess.DEVNULL)
    subprocess.run(['hdiutil', 'attach', '-readonly', '-nobrowse', '-mountpoint', str(mount), str(image)], check=True, stdout=subprocess.DEVNULL)
    attached = True
    assert (mount / 'Applications').is_symlink()
    assert os.readlink(mount / 'Applications') == '/Applications'
    source = mount / 'ChatGPT Pulse.app'
    applications = folder / 'Applications'
    applications.mkdir()
    copied = applications / source.name
    subprocess.run(['ditto', str(source), str(copied)], check=True)
    subprocess.run(['codesign', '--verify', '--deep', '--strict', str(copied)], check=True)
    info = plistlib.loads((copied / 'Contents/Info.plist').read_bytes())
    assert info['CFBundleShortVersionString'] == version
    assert info['LSMinimumSystemVersion'] == '13.3'
    binary = copied / 'Contents/MacOS' / info['CFBundleExecutable']
    arches = set(subprocess.check_output(['lipo', '-archs', str(binary)], text=True).split())
    assert arches == {'arm64', 'x86_64'}
    for p in (source / 'Contents').rglob('*'):
        if p.is_file():
            assert p.read_bytes() == (copied / p.relative_to(source)).read_bytes(), p.name
    dependencies = subprocess.check_output(['otool', '-L', str(binary)], text=True)
    # Universal binaries have one path heading per architecture. Only indented
    # dependency rows are library references; headings name the test binary.
    library_rows = [line for line in dependencies.splitlines() if line.startswith('\t')]
    assert library_rows and all('/Users/' not in line and '/.tools/' not in line for line in library_rows)
    env = dict(os.environ, PULSE_APP=str(binary), PATH='/usr/bin:/bin:/usr/sbin:/sbin')
    node = Path(os.environ.get('PULSE_NODE', str(root / '.tools/bin/node'))).resolve()
    run = subprocess.run([str(node), 'scripts/test-windows-first-usage.mjs'], cwd=root, env=env, capture_output=True, text=True)
    assert run.returncode == 0, run.stderr[-3000:]
    native = json.loads(run.stdout)
    assert native['passed'] and native['native_executed'] and native['synthetic']
    report.update(passed=True, dmg_verified=True, applications_link=True,
                  copy_preserves_all_files=True, ad_hoc_signature_verified=True,
                  architectures=sorted(arches), min_macos=info['LSMinimumSystemVersion'],
                  binary_sha256=hashlib.sha256(binary.read_bytes()).hexdigest(),
                  system_path_only=True, copied_app_native_fixture=native,
                  intel_hardware_tested=False, other_mac_tested=False)
finally:
    # The copied test app must not linger as another Spotlight application.
    if copied is not None and copied.exists():
        lsregister = Path('/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister')
        if lsregister.exists():
            subprocess.run([str(lsregister), '-u', str(copied)], check=False, capture_output=True)
        shutil.rmtree(copied)
    if attached:
        subprocess.run(['hdiutil', 'detach', str(mount)], check=True, stdout=subprocess.DEVNULL)
    (root / 'test-results/mac-dmg-acceptance.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report))
