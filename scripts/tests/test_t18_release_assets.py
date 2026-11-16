"""Content fixtures are synthetic; no actual package/RO-mount positive claimed."""
import hashlib
import json
import os
import stat
import subprocess
import sys
from types import SimpleNamespace
from unittest.mock import patch
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

    def test_compiled_profile_requires_one_unmixed_pair(self):
        original=m.RELEASE_PINS
        launch=m.LAUNCH_RELEASE_PINS
        cases=((original,original),(launch,launch),((original[0],launch[0]),None),
               ((launch[1],),None),(original+launch,None))
        for planted,expected in cases:
            with self.subTest(planted=planted), tempfile.TemporaryDirectory() as directory:
                root=Path(directory)
                for commit,_ in planted:(root/commit).mkdir()
                fd=os.open(root,os.O_RDONLY|os.O_DIRECTORY)
                try:
                    if expected is None:
                        with self.assertRaises(m.ReleaseAssetsRejected):m._fixed_release_pins_at_root(fd)
                    else:
                        self.assertEqual(m._fixed_release_pins_at_root(fd),expected)
                finally:os.close(fd)
        exact=[{'sourceCommit':commit,'manifestSha256':pin} for commit,pin in launch]
        self.assertTrue(m.is_launch_release_pair(exact))
        tampered=[{**exact[0],'manifestSha256':'0'*64},exact[1]]
        self.assertFalse(m.is_launch_release_pair(tampered))
        self.assertFalse(m.is_launch_release_pair(list(reversed(exact))))

    def test_captured_packaging_histograms_only_allow_original_0664_pairs(self):
        # Real onsite histogram, structural policy only; no manifest is forged
        # and no observed-root/runtime lease is issued by these metadata tests.
        for pair,histogram in zip(m.RELEASE_PINS,({0o644:1246,0o664:1328,0o755:10},
                                                  {0o644:1246,0o664:1330,0o755:10})):
            self.assertTrue(all(m._manifest_mode_allowed(mode,*pair)
                                for mode,total in histogram.items() for _ in range(total)))
            self.assertFalse(m._manifest_mode_allowed(0o664,'a'*40,'b'*64))
            for mode in (0o666,0o674,0o764,0o774,0o775,0o776):
                self.assertFalse(m._manifest_mode_allowed(mode,*pair))

    def test_0664_requires_root_uid_root_gid_regular_single_link(self):
        good=dict(st_mode=stat.S_IFREG|0o664,st_uid=0,st_gid=0,st_nlink=1)
        # Pure metadata policy is necessary, never sufficient for admission.
        self.assertTrue(m._root_0664_metadata(SimpleNamespace(**good)))
        for changed in ({'st_uid':1001},{'st_gid':1001},{'st_nlink':2},
                        {'st_mode':stat.S_IFDIR|0o664},{'st_mode':stat.S_IFLNK|0o664},
                        {'st_mode':stat.S_IFREG|0o666},{'st_mode':stat.S_IFREG|0o2664}):
            self.assertFalse(m._root_0664_metadata(SimpleNamespace(**{**good,**changed})))

    def test_real_0664_file_never_passes_without_fixed_ro_lease(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);commit,pin,receipt=self.fixture(root)
            (root/'app/server.js').chmod(0o664)
            for item in receipt['manifest']['files']:
                if item['path']=='app/server.js':item['mode']=0o664
            pin=hashlib.sha256(json.dumps(receipt['manifest'],separators=(',',':')).encode()).hexdigest()
            receipt['manifestSha256']=pin
            (root/'release-manifest.json').write_text(json.dumps(receipt))
            fd=os.open(root,os.O_RDONLY|os.O_DIRECTORY)
            try:
                with self.assertRaises(m.ReleaseAssetsRejected):m._validate_manifest(receipt,commit,pin)
                with self.assertRaises(m.ReleaseAssetsRejected):m._verify_release_contents(fd,commit,pin)
                with self.assertRaises(m.ReleaseAssetsRejected):m._inspect_file(fd,'app/server.js',4096)
                with self.assertRaises(m.ReleaseAssetsRejected):m._tree(fd)
                # Even compiled pins cannot manufacture fixed-root admission.
                with self.assertRaises((m.ReleaseAssetsRejected,OSError)):
                    m._verify_release_contents(fd,*m.RELEASE_PINS[0])
            finally:os.close(fd)

    def test_rw_held_directory_rejects_even_with_root_metadata(self):
        with tempfile.TemporaryDirectory() as directory,tempfile.TemporaryDirectory() as other:
            fd=os.open(directory,os.O_RDONLY|os.O_DIRECTORY)
            otherfd=os.open(other,os.O_RDONLY|os.O_DIRECTORY)
            held=os.dup(fd);info=os.fstat(fd)
            lease=m._PinnedReadonlyRelease(held,(info.st_dev,info.st_ino),*m.RELEASE_PINS[0])
            real_fstat=os.fstat
            def root_metadata(number):
                actual=real_fstat(number)
                return SimpleNamespace(st_dev=actual.st_dev,st_ino=actual.st_ino,
                    st_mode=stat.S_IFDIR|0o755,st_uid=0,st_gid=0)
            try:
                self.assertFalse(os.fstatvfs(fd).f_flag&os.ST_RDONLY)
                # Instrument root ownership only; actual RW kernel flag stays
                # real and must reject. This is never a runtime-positive test.
                with patch.object(m.os,'fstat',side_effect=root_metadata):
                    with self.assertRaises(m.ReleaseAssetsRejected):lease.require_root(fd)
                    with self.assertRaises(m.ReleaseAssetsRejected):lease.require_root(otherfd)
                lease.close()
                with self.assertRaises(m.ReleaseAssetsRejected):lease.require_root(fd)
            finally:
                lease.close();os.close(fd);os.close(otherfd)

    def test_no_key_asset_entry_refuses_cloud_and_all_arguments(self):
        script=Path(__file__).resolve().parents[2]/'scripts/staging_t18_assets_preflight.py'
        for args in ([],['--ready=true']):
            result=subprocess.run([sys.executable,'-I','-B',str(script),*args],
                env={'PATH':'/usr/bin:/bin','LC_ALL':'C'},capture_output=True,timeout=10)
            self.assertEqual(result.returncode,2);self.assertEqual(result.stderr,b'')
            output=json.loads(result.stdout)
            self.assertEqual(output['status'],'REJECTED')
            if not args:
                for field in ('keyRead','databaseStarted','applicationStarted','runtimeRestoreAdmission'):
                    self.assertIs(output[field],False)

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
