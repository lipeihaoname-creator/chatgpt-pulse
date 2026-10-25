"""Resolve a test candidate without depending on a developer's home directory."""
from pathlib import Path
import os

def app_binary(root):
    explicit = os.environ.get('PULSE_APP')
    if explicit:
        path = Path(explicit)
        return path / 'Contents/MacOS/chatgpt-pulse' if path.suffix == '.app' else path
    for target in ['universal-apple-darwin/release', 'release']:
        path = root / 'src-tauri/target' / target / 'bundle/macos/ChatGPT Pulse.app/Contents/MacOS/chatgpt-pulse'
        if path.is_file():
            return path
    path = root / 'release/.artifacts.noindex/ChatGPT Pulse.app/Contents/MacOS/chatgpt-pulse'
    if path.is_file():
        return path
    raise RuntimeError('Build a Mac candidate first or set PULSE_APP')
