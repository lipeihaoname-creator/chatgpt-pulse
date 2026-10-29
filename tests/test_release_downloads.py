import contextlib
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('verify_downloads', Path(__file__).resolve().parents[1] / 'scripts/verify-downloads.py')
release_check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release_check)


class ReleaseDownloadsTests(unittest.TestCase):
    def setUp(self):
        self.base = f'https://github.com/{release_check.REPOSITORY}/releases/download/v0.16.6/'
        self.payloads = {
            'ChatGPT-Pulse-0.16.6-windows-x64-setup.exe': b'MZoffline-fixture',
            'ChatGPT-Pulse-0.16.6-windows-x64-online-setup.exe': b'MZonline-fixture',
        }
        self.payloads['SHA256SUMS'] = ''.join(
            hashlib.sha256(body).hexdigest() + '  ' + name + '\n'
            for name, body in self.payloads.items()
        ).encode()
        self.release = {'draft': False, 'tag_name': 'v0.16.6', 'assets': []}
        self.update_assets()

    def update_assets(self):
        self.release['assets'] = [
            {'name': name, 'size': len(body), 'state': 'uploaded',
             'digest': 'sha256:' + hashlib.sha256(body).hexdigest(),
             'browser_download_url': self.base + name}
            for name, body in self.payloads.items()
        ]

    def response(self, url, *, api=False):
        if api:
            self.assertEqual(url, f"https://api.github.com/repos/{release_check.REPOSITORY}/releases/tags/{self.release['tag_name']}")
        return io.BytesIO(json.dumps(self.release).encode() if api else self.payloads[url.removeprefix(self.base)])

    def verify(self):
        with patch.object(release_check, 'request', side_effect=self.response), contextlib.redirect_stdout(io.StringIO()):
            release_check.verify(self.release['tag_name'])

    def test_complete_downloads_match_metadata_manifest_and_document_links(self):
        self.verify()

    def test_missing_installer_is_rejected(self):
        self.release['assets'].pop(0)
        with self.assertRaisesRegex(ValueError, 'Missing or incomplete asset'):
            self.verify()

    def test_truncated_download_is_rejected(self):
        name = next(iter(self.payloads))
        self.payloads[name] = self.payloads[name][:-1]
        with self.assertRaisesRegex(ValueError, 'Incomplete download'):
            self.verify()

    def test_changed_installer_with_updated_api_digest_still_requires_manifest_match(self):
        name = next(iter(self.payloads))
        self.payloads[name] = b'MZtampered-content'
        self.update_assets()
        with self.assertRaisesRegex(ValueError, 'SHA256SUMS mismatch'):
            self.verify()

    def test_duplicate_checksum_entries_are_rejected(self):
        self.payloads['SHA256SUMS'] *= 2
        self.update_assets()
        with self.assertRaisesRegex(ValueError, 'Invalid or duplicate checksum'):
            self.verify()


class MusicReleaseDownloadsTests(ReleaseDownloadsTests):
    def setUp(self):
        super().setUp()
        self.base = f'https://github.com/{release_check.REPOSITORY}/releases/download/v0.18.2/'
        self.payloads = {
            'ChatGPT-Pulse-0.18.2-windows-x64-music-offline-setup.exe': b'MZoffline-fixture',
            'ChatGPT-Pulse-0.18.2-windows-x64-music-online-setup.exe': b'MZonline-fixture',
        }
        self.payloads['SHA256SUMS.txt'] = ''.join(hashlib.sha256(body).hexdigest()+'  '+name+'\n' for name,body in self.payloads.items()).encode()
        self.release['tag_name']='v0.18.2';self.update_assets()

    def test_duplicate_checksum_entries_are_rejected(self):
        self.payloads['SHA256SUMS.txt'] *= 2;self.update_assets()
        with self.assertRaisesRegex(ValueError,'Invalid or duplicate checksum'):self.verify()


if __name__ == '__main__':
    unittest.main()
