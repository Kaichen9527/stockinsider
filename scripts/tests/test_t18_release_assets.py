"""Content fixtures are synthetic; no actual package/RO-mount positive claimed."""
import hashlib
import json
import os
from pathlib import Path
import tempfile
import unittest
from deployment.staging.vnext.t17_keyfd import t18_release_assets as m


class ReleaseAssetTests(unittest.TestCase):
    def fixture(self,root):
        files={'app/server.js':b'/* PUBLIC_SYNTHETIC_NOT_NEXT_RUNTIME */',
               'app/node_modules/next/package.json':b'{"version":"16.3.4"}',
               'app/.next/BUILD_ID':b'PUBLIC_FIXTURE_BUILD'}
        items=[]
        for path,data in files.items():
            target=root/path;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data);target.chmod(0o644)
            items.append({'path':path,'bytes':len(data),'mode':0o644,'sha256':hashlib.sha256(data).hexdigest()})
        commit='a'*40
        manifest={'schema':'stockinsider-standalone-release-v2','releaseId':commit,'sourceCommit':commit,
                  'packagerCommit':'b'*40,'createdAt':'PUBLIC_FIXTURE','entrypoint':'app/server.js',
                  'fileCount':len(items),'bytes':sum(i['bytes'] for i in items),'files':items}
        pin=hashlib.sha256(json.dumps(manifest,separators=(',',':')).encode()).hexdigest()
        receipt={'manifest':manifest,'manifestSha256':pin}
        (root/'release-manifest.json').write_text(json.dumps(receipt));(root/'release-manifest.json').chmod(0o644)
        return commit,pin,receipt

    def test_synthetic_content_verifier_no_runtime_grant(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);commit,pin,_=self.fixture(root);fd=os.open(root,os.O_RDONLY|os.O_DIRECTORY)
            try:
                evidence=m._verify_release_contents(fd,commit,pin)
                self.assertEqual(evidence['fileCount'],3)
                self.assertEqual(evidence['nextVersion'],'16.3.4')
            finally:os.close(fd)

    def test_actual_cloud_fixed_mount_is_not_silently_admitted(self):
        with self.assertRaises(m.ReleaseAssetsRejected):
            with m.observe_fixed_release_assets():self.fail('runtime_assets_not_available')
        with self.assertRaises(TypeError):m.observe_fixed_release_assets(ready=True)

    def test_tamper_set_symlink_and_key_file_reject(self):
        for mutation in ('tamper','extra','symlink','key'):
            with self.subTest(mutation=mutation),tempfile.TemporaryDirectory() as directory:
                root=Path(directory);commit,pin,_=self.fixture(root)
                if mutation=='tamper':(root/'app/server.js').write_bytes(b'CHANGED')
                if mutation=='extra':(root/'unexpected').write_bytes(b'X')
                if mutation=='symlink':(root/'link').symlink_to(root/'app/server.js')
                if mutation=='key':(root/'client.key').write_bytes(b'PUBLIC_NOT_A_KEY')
                fd=os.open(root,os.O_RDONLY|os.O_DIRECTORY)
                try:
                    with self.assertRaises(m.ReleaseAssetsRejected):m._verify_release_contents(fd,commit,pin)
                finally:os.close(fd)

    def test_paths_duplicate_json_and_forged_pin_reject(self):
        for path in ('../server.js','/server.js','app/../server.js','app\\server.js','app/.env.local','keys/data'):
            with self.assertRaises(m.ReleaseAssetsRejected):m._relative(path)
        with self.assertRaises(m.ReleaseAssetsRejected):m._json(b'{"a":1,"a":2}')
        with tempfile.TemporaryDirectory() as directory:
            _,_,receipt=self.fixture(Path(directory))
            with self.assertRaises(m.ReleaseAssetsRejected):m._validate_manifest(receipt,'a'*40,'0'*64)

    def test_hashing_uses_bounded_reads_and_rejects_size_limit(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);data=b'P'*m.CHUNK
            with (root/'public-large').open('wb') as f:
                for _ in range(3):f.write(data)
            fd=os.open(root,os.O_RDONLY|os.O_DIRECTORY)
            try:
                digest,contents=m._inspect_file(fd,'public-large',3*m.CHUNK)
                expected=hashlib.sha256()
                for _ in range(3):expected.update(data)
                self.assertEqual(digest,expected.hexdigest());self.assertIsNone(contents)
                with self.assertRaises(m.ReleaseAssetsRejected):m._inspect_file(fd,'public-large',m.CHUNK)
            finally:os.close(fd)

    def test_actual_cloud_fixed_node_is_not_substituted(self):
        # This Cloud image has no /usr/bin/node. No PATH fallback is allowed.
        with self.assertRaises((m.ReleaseAssetsRejected,OSError)):
            fd=m._observe_fixed_node()
            os.close(fd)
        self.assertEqual(m.NODE_PATH,'/usr/bin/node')
        self.assertEqual(m.NODE_VERSION,'v22.23.1')
        self.assertEqual(m.NODE_SHA256,'93956de2e59480474a7b46571da1651180b1a050cdf32641ebec4ce6e478e068')

    def test_held_binary_hash_is_bounded_content_only_not_runtime_grant(self):
        with tempfile.TemporaryDirectory() as directory:
            # A linked regular fixture matches the binary contract; anonymous
            # TemporaryFile has nlink0 and correctly fails metadata validation.
            with (Path(directory)/'public-binary').open('w+b') as f:
                digest=hashlib.sha256()
                for _ in range(3):
                    data=b'P'*m.CHUNK;f.write(data);digest.update(data)
                f.flush()
                m._verify_held_binary(f.fileno(),digest.hexdigest())
                with self.assertRaises(m.ReleaseAssetsRejected):m._verify_held_binary(f.fileno(),'0'*64)


if __name__=='__main__':unittest.main()
