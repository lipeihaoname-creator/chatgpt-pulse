"""Collect local dependency license files. No network or application access."""
from pathlib import Path
import json
import tomllib
import os

root=Path(__file__).resolve().parent.parent
sections=['ChatGPT Pulse — third-party notices\nProject-owned code: PolyForm Noncommercial 1.0.0 + Internal Use Additional Permission 1.0 (see LICENSE).\nDependency licenses remain separate; no project noncommercial restriction is imposed on them.\nMPL source packages accompany the app in licenses/mpl-sources/. Dependency terms follow.\n']
lock=tomllib.loads((root/'src-tauri/Cargo.lock').read_text())
cargo_home=Path(os.environ.get('CARGO_HOME') or (root/'.tools/cargo' if (root/'.tools/cargo').exists() else Path.home()/'.cargo'))
registries=list((cargo_home/'registry/src').glob('*'))
for entry in lock['package']:
    folders=[r/f"{entry['name']}-{entry['version']}" for r in registries]
    folder=next((p for p in folders if p.is_dir()),None)
    if folder is None:
        continue  # Other target platforms were not downloaded or linked.
    meta=tomllib.loads((folder/'Cargo.toml').read_text()).get('package',{})
    sections.append(f"\n{'='*72}\n{entry['name']} {entry['version']}\nLicense: {meta.get('license','See upstream source')}\nSource: {meta.get('repository','https://crates.io/crates/'+entry['name'])}\n")
    for p in sorted(folder.iterdir()):
        if p.is_file() and (p.name.upper().startswith('LICENSE') or p.name.upper() in {'COPYING','COPYRIGHT'}):
            sections.append(f"\n--- {p.name} ---\n{p.read_text(errors='replace')}\n")
for name in ['svelte','@tauri-apps/api']:
    folder=root/'node_modules'/name
    meta=json.loads((folder/'package.json').read_text())
    sections.append(f"\n{'='*72}\n{name} {meta['version']}\nLicense: {meta.get('license','See upstream source')}\n")
    for p in folder.iterdir():
        if p.is_file() and p.name.upper().startswith('LICENSE'):
            sections.append(p.read_text(errors='replace'))
(root/'THIRD_PARTY_NOTICES.txt').write_text(''.join(sections))
print('Local dependency notices collected.')
