"""Create a private Windows source handoff using the shared whitelist."""
from pathlib import Path
import json
from source_archive import create_source_archive

root = Path(__file__).resolve().parent.parent
version = json.loads((root / 'package.json').read_text(encoding='utf-8'))['version']
report = create_source_archive(root, root / 'release' / f'ChatGPT-Pulse-{version}-windows-private-source.zip')
folder = root / 'test-results/evidence'
folder.mkdir(parents=True, exist_ok=True)
(folder / 'delivery-source-verification.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(json.dumps(report))
