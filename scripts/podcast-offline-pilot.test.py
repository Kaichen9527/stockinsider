"""Offline stdlib tests. Fake process identities test control logic, not Linux capability."""
import importlib.util
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

SPEC = importlib.util.spec_from_file_location('pilot', Path(__file__).with_name('podcast-offline-pilot.py'))
pilot = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(pilot)

class Clock:
    def __init__(self): self.now = 0
    def __call__(self): return self.now
    def pause(self, seconds): self.now += seconds

class Process:
    pid = 123
    def __init__(self, code=None): self.code = code
    def poll(self): return self.code

class Tree:
    def __init__(self, *, alive=True, ignore_term=False, ignore_kill=False):
        self.alive, self.ignore_term, self.ignore_kill = alive, ignore_term, ignore_kill
        self.signals = []
    def scan(self, process): return [{'pid': 124, 'start': 777, 'rss': 2}] if self.alive else []
    def signal_all(self, kind):
        self.signals.append(kind)
        if kind == signal.SIGTERM and not self.ignore_term or kind == signal.SIGKILL and not self.ignore_kill: self.alive = False
    def close(self): assert not self.alive

class PilotTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name).resolve()
    def tearDown(self): self.tmp.cleanup()
    def resources(self): return {'logicalBytes': 1, 'allocatedBytes': 1, 'freeBytes': pilot.FREE_RESERVE}
    def supervisor(self, tree, clock=None, **kwargs):
        clock = clock or Clock()
        return pilot.Supervisor(self.root, tree=tree, clock=clock, pause=clock.pause,
                                resources=kwargs.pop('resources', self.resources), **kwargs), clock
    def report(self):
        return {'install': [{'metadata': {'name': 'faster-whisper', 'version': '1.2.1'},
         'download_info': {'url': 'https://files.pythonhosted.org/packages/a/faster_whisper.whl',
         'archive_info': {'hashes': {'sha256': pilot.WHEEL_HASH}}}}]}

    def test_synthetic_credentials_and_configs_never_enter_child(self):
        supplied = {key: 'INVALID_SYNTHETIC_CANARY' for key in ('HF_TOKEN','HUGGING_FACE_HUB_TOKEN','OPENAI_API_KEY',
                    'AWS_SECRET_ACCESS_KEY','PIP_INDEX_URL','PIP_EXTRA_INDEX_URL','PYTHONPATH','LD_PRELOAD','GIT_CONFIG_GLOBAL','NETRC','HOME','PATH')}
        supplied['HTTPS_PROXY'] = 'synthetic-proxy-not-used'
        env = pilot.child_environment(self.root, supplied)
        self.assertEqual(env['HTTPS_PROXY'], supplied['HTTPS_PROXY'])
        self.assertEqual(env['HOME'], str(self.root/'home'))
        for key in supplied.keys() - {'HOME','PATH','HTTPS_PROXY'}: self.assertNotIn(key, env)
        self.assertEqual(env['PIP_CONFIG_FILE'], '/dev/null')
        self.assertEqual(env['HF_HUB_DISABLE_IMPLICIT_TOKEN'], '1')

    def test_noindex_hashlocked_binary_only_arguments(self):
        plan = pilot.pip_plan(self.root)
        for name in ('resolve','download','install'): self.assertIn('--only-binary=:all:', plan[name])
        for name in ('download','install'): self.assertIn('--require-hashes', plan[name])
        self.assertIn('--no-index', plan['install'])
        self.assertNotIn('--index-url', plan['install'])
        self.assertIn('--no-deps', plan['install'])
        for command in plan.values(): self.assertNotIn('--extra-index-url', command)

    def test_hash_lock_rejects_root_mismatch_sdist_and_unhashed_transitive(self):
        lock, artifacts = pilot.wheel_lock(self.report())
        self.assertEqual(lock, f'faster-whisper==1.2.1 --hash=sha256:{pilot.WHEEL_HASH}\n')
        self.assertEqual(len(artifacts), 1)
        for mode in ('hash','sdist','duplicate','host','token','missing-root'):
            report = self.report(); row = report['install'][0]
            if mode == 'hash': row['download_info']['archive_info']['hashes']['sha256'] = '0'*64
            elif mode == 'sdist': row['download_info']['url'] = 'https://files.pythonhosted.org/packages/a/a.tar.gz'
            elif mode == 'host': row['download_info']['url'] = 'https://private.invalid/packages/a/a.whl'
            elif mode == 'token': row['download_info']['url'] += '?token=synthetic'
            elif mode == 'duplicate': report['install'].append(row)
            else: row['metadata']['name'] = 'other'
            with self.subTest(mode=mode), self.assertRaises(pilot.Refusal): pilot.wheel_lock(report)

    def test_closed_json_and_metadata_pins(self):
        with self.assertRaises(pilot.Refusal): pilot.closed_json(b'{"x":1,"x":2}')
        with self.assertRaises(pilot.Refusal): pilot.closed_json(b'{"x":NaN}')
        with self.assertRaises(UnicodeDecodeError): pilot.closed_json(b'"\xff"')
        path = Path(__file__).resolve().parents[1]/'docs/operations/2026-10-09/podcast-offline-pilot-metadata.json'
        metadata = json.loads(path.read_text())
        model = metadata['acquisitions'][1]
        self.assertEqual(model['revision'], pilot.MODEL_REVISION)
        for item in model['files']:
            if item['rfilename'] in pilot.MODEL_FILES:
                size, digest, algorithm = pilot.MODEL_FILES[item['rfilename']]
                self.assertEqual(size, item['size'])
                self.assertEqual(digest, item['lfs']['sha256'] if algorithm == 'sha256' else item['blobId'])

    def test_source_exact_public_only_policy(self):
        url = 'https://' + pilot.SOURCE_HOST + pilot.SOURCE_PATH
        pilot.source_policy(url, ['8.8.8.8'], 'audio/mpeg', 79341218)
        for candidate, addresses, mime, count in [(url,['127.0.0.1'],'audio/mpeg',1),
            (url,['169.254.169.254'],'audio/mpeg',1),(url,['8.8.8.8'],'text/html',1),
            (url+'?auth=x',['8.8.8.8'],'audio/mpeg',1),(url,['8.8.8.8'],'audio/mpeg',pilot.AUDIO_LIMIT+1)]:
            with self.assertRaises(pilot.Refusal): pilot.source_policy(candidate,addresses,mime,count)

    def test_git_blob_identity_is_not_plain_sha1(self):
        import hashlib
        content = b'synthetic model config'
        digest = hashlib.sha1(f'blob {len(content)}\0'.encode()+content).hexdigest()
        with mock.patch.dict(pilot.MODEL_FILES, {'config.json': (len(content), digest, 'git-blob-sha1')}):
            self.assertEqual(pilot.verify_model_bytes('config.json', content)['sha256'], hashlib.sha256(content).hexdigest())
            with self.assertRaises(pilot.Refusal): pilot.verify_model_bytes('config.json',content+b'x')
            with self.assertRaises(pilot.Refusal): pilot.verify_model_bytes('config.json',b'x'*len(content))
        with self.assertRaises(pilot.Refusal): pilot.verify_model_bytes('unlisted',b'')

    def test_stalled_download_stage_deadline_term_then_kill(self):
        tree = Tree(ignore_term=True); supervisor, clock = self.supervisor(tree, seconds=.5)
        with self.assertRaisesRegex(pilot.Refusal,'deadline'):
            supervisor.run('stalled-download', ['synthetic'], {}, launch=lambda *a,**k: Process())
        self.assertIn(signal.SIGTERM, tree.signals); self.assertIn(signal.SIGKILL, tree.signals)
        self.assertLessEqual(clock(), 4.5)
        self.assertTrue(supervisor.cleanup_confirmed)
        self.assertFalse(supervisor.receipt()['contentCapabilitySuccess'])

    def test_over_budget_writer_rejected_and_next_stage_prohibited(self):
        calls = 0
        def resources():
            nonlocal calls
            calls += 1
            return {'logicalBytes': 1 if calls == 1 else 101, 'allocatedBytes': 1, 'freeBytes': pilot.FREE_RESERVE}
        tree = Tree(); supervisor, _ = self.supervisor(tree, resources=resources, byte_limit=100)
        with self.assertRaisesRegex(pilot.Refusal, 'storage_limit'):
            supervisor.run('over-writer',['synthetic'],{},launch=lambda *a,**k: Process())
        with self.assertRaisesRegex(pilot.Refusal,'previous_stage'):
            supervisor.run('next',['synthetic'],{},launch=lambda *a,**k: Process())
        self.assertTrue(supervisor.cleanup_confirmed)

    def test_leader_exit_with_descendant_is_failure_not_success(self):
        tree = Tree(); supervisor, _ = self.supervisor(tree)
        with self.assertRaisesRegex(pilot.Refusal,'descendants'):
            supervisor.run('leader-exit',['synthetic'],{},launch=lambda *a,**k: Process(0))
        self.assertFalse(supervisor.stages[0]['success']); self.assertTrue(supervisor.cleanup_confirmed)
        self.assertIn(signal.SIGTERM, tree.signals)

    def test_unknown_cleanup_preserves_root_and_negative_verdict(self):
        tree = Tree(ignore_term=True,ignore_kill=True); supervisor, clock = self.supervisor(tree, seconds=.5)
        with self.assertRaises(pilot.Refusal): supervisor.run('unknown',['synthetic'],{},launch=lambda *a,**k: Process())
        self.assertFalse(supervisor.cleanup_confirmed)
        self.assertFalse(supervisor.receipt()['deleteRootAuthorized'])
        self.assertTrue(self.root.exists()); self.assertLessEqual(clock(),4.5)

    def test_actual_private_files_count_allocated_and_logical_not_hash_dedup(self):
        a = self.root/'a'; a.write_bytes(b'x'*8192); os.link(a,self.root/'b')
        result = pilot.inventory(self.root)
        self.assertEqual(result['logicalBytes'],16384)
        self.assertEqual(result['allocatedBytes'],a.stat().st_blocks*512+self.root.stat().st_blocks*512)
        with self.assertRaisesRegex(pilot.Refusal,'storage'): pilot.inventory(self.root,100)
        (self.root/'bad').symlink_to('/dev/null')
        with self.assertRaisesRegex(pilot.Refusal,'symlink'): pilot.inventory(self.root)

    def test_new_root_no_reuse_and_private_permissions(self):
        root = pilot.new_root(self.root/'private')
        self.assertEqual(root.stat().st_mode & 0o777,0o700)
        with self.assertRaises(FileExistsError): pilot.new_root(root)

    def test_preflight_is_network_free_and_run_refuses_before_root_creation(self):
        env = pilot.child_environment(self.root, {'OPENAI_API_KEY':'CANARY'})
        script = str(Path(__file__).with_name('podcast-offline-pilot.py'))
        completed = subprocess.run([sys.executable,'-I',script,'--preflight'],env=env,capture_output=True,timeout=3)
        self.assertEqual(completed.returncode,0)
        report = json.loads(completed.stdout)
        self.assertFalse(report['networkAttempted']); self.assertFalse(report['runIsolatedAvailable'])
        root = self.root/'never-created'
        completed = subprocess.run([sys.executable,'-I',script,'--run-isolated','--artifact-root',str(root)],env=env,capture_output=True,timeout=3)
        self.assertNotEqual(completed.returncode,0); self.assertFalse(root.exists())
        self.assertNotIn(b'CANARY',completed.stdout+completed.stderr)

    def test_sampling_includes_previous_scan_cost(self):
        clock = Clock()
        def resources():
            clock.pause(.8)
            return self.resources()
        tree = Tree(); supervisor, _ = self.supervisor(tree,clock=clock,resources=resources,seconds=5)
        with self.assertRaisesRegex(pilot.Refusal,'sample_interval'):
            supervisor.run('slow-scan',['synthetic'],{},launch=lambda *a,**k: Process())

    def test_pidfd_race_closes_unowned_descriptor_and_never_signals(self):
        tree = pilot.LinuxTree.__new__(pilot.LinuxTree)
        tree.pid = 10; tree.owned = {}
        old = {11: {'pid':11,'ppid':10,'pgid':11,'start':100,'rss':0,'state':'S'}}
        replaced = {11: {**old[11], 'start':200}}
        fd = os.open(self.root/'fd',os.O_WRONLY|os.O_CREAT,0o600)
        try:
            with mock.patch.object(tree,'snapshot',side_effect=[old,replaced]), mock.patch.object(os,'pidfd_open',return_value=fd,create=True):
                with self.assertRaisesRegex(pilot.Refusal,'identity_race'): tree.scan(Process())
            with self.assertRaises(OSError): os.fstat(fd)
            self.assertEqual(tree.owned,{})
        finally:
            try: os.close(fd)
            except OSError: pass

    def test_supervisor_own_rss_counts_toward_limit(self):
        def resources(): return {**self.resources(),'supervisorRssBytes':100}
        tree = Tree(); supervisor,_ = self.supervisor(tree,resources=resources,rss_limit=101)
        with self.assertRaisesRegex(pilot.Refusal,'rss_limit'):
            supervisor.run('rss',['synthetic'],{},launch=lambda *a,**k: Process())
        self.assertTrue(supervisor.cleanup_confirmed)

    def test_free_reserve_refuses_before_launch(self):
        supervisor,_ = self.supervisor(Tree(),resources=lambda:{**self.resources(),'freeBytes':1})
        launch = mock.Mock()
        with self.assertRaisesRegex(pilot.Refusal,'host_free_reserve'): supervisor.run('free',['synthetic'],{},launch=launch)
        launch.assert_not_called()

    def test_launch_exception_cannot_claim_confirmed_no_process(self):
        supervisor,_ = self.supervisor(Tree())
        with self.assertRaises(OSError):
            supervisor.run('launch',['synthetic'],{},launch=mock.Mock(side_effect=OSError('synthetic')))
        self.assertFalse(supervisor.cleanup_confirmed)

    def test_post_pidfd_snapshot_adopted_child_cannot_be_discarded(self):
        tree=pilot.LinuxTree.__new__(pilot.LinuxTree);tree.pid=10;tree.owned={}
        leader={'pid':11,'ppid':10,'pgid':11,'start':100,'rss':1,'state':'S'}
        child={'pid':12,'ppid':10,'pgid':11,'start':101,'rss':2,'state':'S'}
        calls=0
        def snapshot():
            nonlocal calls
            calls+=1
            if calls==1:return {11:leader}
            if calls==2:return {11:leader,12:child}
            return {12:child}
        def signal_fd(fd,kind):
            if fd==111:raise ProcessLookupError()
        process=Process(0);process.pid=11
        with mock.patch.object(tree,'snapshot',side_effect=snapshot), mock.patch.object(os,'pidfd_open',side_effect=lambda pid,flags:pid+100,create=True), mock.patch.object(signal,'pidfd_send_signal',side_effect=signal_fd,create=True), mock.patch.object(os,'close'):
            identities=tree.scan(process)
        self.assertEqual({row['pid'] for row in identities},{12})
        self.assertEqual(set(tree.owned),{12})

    def test_initial_resource_scan_crossing_deadline_never_launches(self):
        clock=Clock()
        def resources():clock.pause(2);return self.resources()
        supervisor,_=self.supervisor(Tree(),clock=clock,resources=resources,seconds=1)
        launch=mock.Mock(return_value=Process())
        with self.assertRaisesRegex(pilot.Refusal,'deadline'):supervisor.run('late-launch',['synthetic'],{},launch=launch)
        launch.assert_not_called()

    def test_continuously_growing_tree_refuses_bounded_reconciliation(self):
        tree=pilot.LinuxTree.__new__(pilot.LinuxTree);tree.pid=10;tree.owned={};calls=0
        def snapshot():
            nonlocal calls
            calls+=1
            return {pid:{'pid':pid,'ppid':10,'pgid':11,'start':pid,'rss':1,'state':'S'} for pid in range(11,11+calls)}
        with mock.patch.object(tree,'snapshot',side_effect=snapshot), mock.patch.object(os,'pidfd_open',side_effect=lambda pid,flags:pid+100,create=True), mock.patch.object(signal,'pidfd_send_signal',create=True), mock.patch.object(os,'close'):
            with self.assertRaisesRegex(pilot.Refusal,'process_tree_unstable'):tree.scan(Process())
        self.assertLess(calls,512)
        self.assertTrue(tree.owned)  # Known ownership is retained, never erased by uncertainty.

    def test_empty_proc_snapshot_with_kernel_live_child_is_never_empty_proof(self):
        tree=pilot.LinuxTree.__new__(pilot.LinuxTree);tree.pid=10;tree.owned={}
        with mock.patch.object(tree,'snapshot',return_value={}), mock.patch.object(os,'waitid',return_value=None,create=True), mock.patch.object(os,'P_ALL',0,create=True), mock.patch.object(os,'WEXITED',4,create=True), mock.patch.object(os,'WNOWAIT',0x1000000,create=True):
            with self.assertRaisesRegex(pilot.Refusal,'process_tree_unstable'):tree.scan(Process(0))
        self.assertEqual(tree.owned,{})

    def test_only_echild_allows_empty_tree_and_adopted_zombie_is_reaped(self):
        import types
        tree=pilot.LinuxTree.__new__(pilot.LinuxTree);tree.pid=10;tree.owned={}
        with mock.patch.object(tree,'snapshot',return_value={}), mock.patch.object(os,'waitid',side_effect=[types.SimpleNamespace(si_pid=12),ChildProcessError()],create=True), mock.patch.object(os,'waitpid',return_value=(12,0)) as reap, mock.patch.object(os,'P_ALL',0,create=True), mock.patch.object(os,'WEXITED',4,create=True), mock.patch.object(os,'WNOWAIT',0x1000000,create=True):
            self.assertEqual(tree.scan(Process(0)),[])
            reap.assert_called_once_with(12,os.WNOHANG)

    def test_kernel_child_probe_error_is_cleanup_uncertainty(self):
        tree=pilot.LinuxTree.__new__(pilot.LinuxTree);tree.pid=10;tree.owned={}
        with mock.patch.object(tree,'snapshot',return_value={}), mock.patch.object(os,'waitid',side_effect=PermissionError('synthetic kernel refusal'),create=True), mock.patch.object(os,'P_ALL',0,create=True), mock.patch.object(os,'WEXITED',4,create=True), mock.patch.object(os,'WNOWAIT',0x1000000,create=True):
            with self.assertRaises(PermissionError):tree.scan(Process(0))

if __name__ == '__main__': unittest.main(verbosity=2)
