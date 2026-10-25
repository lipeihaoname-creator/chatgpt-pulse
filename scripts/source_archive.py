"""Shared, explicit source selection for local Mac/Windows handoffs."""
from pathlib import Path, PurePosixPath
import hashlib
import json
import re
import zipfile

ROOT_FILES = [
    'README.md', 'README.en.md', 'LICENSE', 'CHANGELOG.md', 'CONTRIBUTING.md',
    'THIRD_PARTY_NOTICES.txt', 'package.json', 'pnpm-lock.yaml',
    'pnpm-workspace.yaml', 'vite.config.js', 'index.html', '.gitignore',
    'CHARACTER_EMOTIONS.md', 'DIALOGUE_SOURCES.md', 'ROXY_SOURCES.md', 'IDLE_COMPANION.md',
]
PUBLIC_DOCS = [
    'ASSETS.md', 'AVATAR_RENDERING.md', 'CHANGELOG_ARCHIVE.md', 'DATA.md',
    'DEPENDENCIES.md', 'LICENSING.md', 'RELEASE.md', 'WINDOWS_DEPENDENCIES.md',
    'WINDOWS_INSTALL.md', 'WINDOWS_BUILD.md', 'WINDOWS_ACCEPTANCE.md',
    'RELEASE_READINESS.md', 'MAC_INSTALL.md', 'MAC_ACCEPTANCE.md',
    'RELEASE_0.16.6.zh-CN.md', 'DEMOS.md',
]
BLOCKED = {'.tools', 'node_modules', 'target', 'dist', 'release', 'test-results',
           '.git', '.codex', '.agents', '.aws', '__pycache__', '.venv', 'design'}
SECRETS = [
    re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
    re.compile(rb'\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{30,}'),
    re.compile(rb'\bgh[pousr]_[A-Za-z0-9]{30,}'),
]

def selected_sources(root):
    root = Path(root)
    files = [root / name for name in ROOT_FILES]
    files += [root / 'docs' / name for name in PUBLIC_DOCS]
    for folder in ['src', 'licenses', 'tests', '.github', 'docs/media']:
        files += [p for p in (root / folder).rglob('*') if p.is_file()]
    files += [p for p in (root / 'scripts').iterdir() if p.is_file() and p.name not in {
        'windows-cloud-source-probe.mjs', 'package-windows-test-kit.py',
    }]
    for name in ['Cargo.toml', 'Cargo.lock', 'build.rs', 'tauri.conf.json',
                 'tauri.macos.conf.json', 'tauri.windows.conf.json', 'tauri.windows-offline.conf.json']:
        files.append(root / 'src-tauri' / name)
    for folder in ['src', 'icons', 'capabilities']:
        files += [p for p in (root / 'src-tauri' / folder).rglob('*') if p.is_file()]
    selected = []
    for p in sorted(set(files)):
        rel = p.relative_to(root)
        if BLOCKED.intersection(rel.parts) or p.is_symlink():
            continue
        if p.name.startswith('.env') or p.suffix in {'.sqlite', '.log', '.jsonl', '.pyc', '.exe', '.dll'} or '.sqlite-' in p.name:
            continue
        if not p.is_file():
            raise RuntimeError('Required source missing: ' + rel.as_posix())
        data = p.read_bytes()
        if any(pattern.search(data) for pattern in SECRETS):
            raise RuntimeError('Possible credential marker in ' + rel.as_posix())
        selected.append((p, rel, data))
    return selected

def create_source_archive(root, archive):
    root, archive = Path(root), Path(archive)
    files = selected_sources(root)
    archive.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for p, rel, data in files:
            info = zipfile.ZipInfo.from_file(p, 'chatgpt-pulse/' + rel.as_posix())
            info.create_system = 3
            info.external_attr = (0o100755 if p.suffix == '.sh' else 0o100644) << 16
            z.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=6)
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None
        assert len(z.namelist()) == len(files) == len(set(z.namelist()))
        for p, rel, data in files:
            name = 'chatgpt-pulse/' + rel.as_posix()
            pure = PurePosixPath(name)
            assert not pure.is_absolute() and '..' not in pure.parts
            assert not BLOCKED.intersection(pure.parts)
            assert z.read(name) == data
    return dict(version=json.loads((root / 'package.json').read_text())['version'],
                archive=archive.name, bytes=archive.stat().st_size,
                sha256=hashlib.sha256(archive.read_bytes()).hexdigest(), entries=len(files),
                all_entries_match=True, private_data_excluded=True,
                credential_marker_scan_passed=True, published=False,
                public_distribution_ready=False)
