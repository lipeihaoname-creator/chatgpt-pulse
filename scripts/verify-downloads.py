#!/usr/bin/env python3
"""Verify published Windows downloads against Release metadata and SHA256SUMS."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import urllib.request

REPOSITORY = 'voidlph-dev/chatgpt-pulse'


def request(url, *, api=False):
    headers = {'User-Agent': 'chatgpt-pulse-release-verification'}
    if api:
        headers['Accept'] = 'application/vnd.github+json'
        if os.environ.get('GITHUB_TOKEN'):
            headers['Authorization'] = 'Bearer ' + os.environ['GITHUB_TOKEN']
    return urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=30)


def download(asset, destination):
    expected_size = asset['size']
    if not isinstance(expected_size, int) or not 0 < expected_size <= 512 * 1024 * 1024:
        raise ValueError('Unexpected asset size: ' + asset['name'])
    digest, size = hashlib.sha256(), 0
    with request(asset['browser_download_url']) as response, destination.open('wb') as output:
        while chunk := response.read(1024 * 1024):
            size += len(chunk)
            if size > expected_size:
                raise ValueError('Download exceeds declared size: ' + asset['name'])
            output.write(chunk)
            digest.update(chunk)
    if size != expected_size:
        raise ValueError('Incomplete download: ' + asset['name'])
    actual = digest.hexdigest()
    if asset.get('digest') and asset['digest'] != 'sha256:' + actual:
        raise ValueError('GitHub digest mismatch: ' + asset['name'])
    return actual


def verify(tag):
    version = tag.removeprefix('v')
    if not re.fullmatch(r'v\d+\.\d+\.\d+', tag):
        raise ValueError('Use an explicit version tag, for example v0.16.6')
    base = f'https://github.com/{REPOSITORY}/releases/download/{tag}/'
    names = [f'ChatGPT-Pulse-{version}-windows-x64-setup.exe',
             f'ChatGPT-Pulse-{version}-windows-x64-online-setup.exe']
    with request(f'https://api.github.com/repos/{REPOSITORY}/releases/tags/{tag}', api=True) as response:
        release = json.loads(response.read(2 * 1024 * 1024))
    if release['draft'] or release['tag_name'] != tag:
        raise ValueError('Release must be public and match the requested tag')
    assets = {}
    for name in [*names, 'SHA256SUMS']:
        matches = [asset for asset in release['assets'] if asset['name'] == name]
        if len(matches) != 1 or matches[0]['state'] != 'uploaded':
            raise ValueError('Missing or incomplete asset: ' + name)
        asset = matches[0]
        if asset['browser_download_url'] != base + name:
            raise ValueError('Unexpected download path: ' + name)
        assets[name] = asset
    root = Path(__file__).resolve().parent.parent
    for document in ['README.md', 'README.en.md', 'docs/WINDOWS_INSTALL.md', f'docs/RELEASE_{version}.zh-CN.md']:
        text = (root / document).read_text(encoding='utf-8')
        for name in assets:
            if '](' + base + name + ')' not in text:
                raise ValueError(f'Missing direct link in {document}: {name}')
    with tempfile.TemporaryDirectory(prefix='pulse-release-') as directory:
        directory = Path(directory)
        manifest = directory / 'SHA256SUMS'
        if assets['SHA256SUMS']['size'] > 1024 * 1024:
            raise ValueError('Checksum manifest is too large')
        download(assets['SHA256SUMS'], manifest)
        checksums = {}
        for line in manifest.read_text(encoding='utf-8-sig').splitlines():
            match = re.fullmatch(r'([0-9a-fA-F]{64})\s+\*?(.+)', line)
            if not match or match[2] in checksums:
                raise ValueError('Invalid or duplicate checksum entry')
            checksums[match[2]] = match[1].lower()
        for name in names:
            if name not in checksums:
                raise ValueError('Checksum is missing: ' + name)
            destination = directory / name
            actual = download(assets[name], destination)
            if actual != checksums[name]:
                raise ValueError('SHA256SUMS mismatch: ' + name)
            with destination.open('rb') as installer:
                if installer.read(2) != b'MZ':
                    raise ValueError('Download is not a Windows executable: ' + name)
            print(f'PASS {name} ({assets[name]["size"]} bytes, sha256:{actual})')
    print('PASS documentation links, public assets, download sizes and SHA-256 checksums')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tag', default='v0.16.6')
    arguments = parser.parse_args()
    try:
        verify(arguments.tag)
    except Exception as error:
        # HTTP exceptions can contain temporary signed redirect URLs; omit them.
        detail = str(error) if isinstance(error, ValueError) else type(error).__name__
        print('FAIL release verification: ' + detail, file=sys.stderr)
        sys.exit(1)
