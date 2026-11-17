#!/usr/bin/env python3
"""Root-only offline fixtures. Output only sanitized behavior booleans.

No account lookup/creation, host key, SSH daemon, network, /run write or bootstrap
apply is used. Privileges/umask change ONLY in dedicated child processes.
"""
import ast
import contextlib
import errno
import importlib.util
import json
import os
from pathlib import Path
import shutil
import stat
import struct
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

sys.dont_write_bytecode = True
REPOSITORY = Path(__file__).resolve().parents[1]
HELPER = REPOSITORY / 'deployment/staging/vnext/authorized_key_path.py'
spec = importlib.util.spec_from_file_location('fixture_keypath', HELPER)
contract = importlib.util.module_from_spec(spec)
spec.loader.exec_module(contract)
NOW = '2026-11-08T12:00:00Z'
EXPIRY = '2026-11-08T12:30:00Z'
# Synthetic process credentials only, with no account database lookup.
READER = 63021
GROUP = 63022
OTHER_GROUP = 63023
ACL_OBSERVATIONS = dict(kernelAccessAclRejectionVerified=False,
                        kernelDefaultAclRejectionVerified=False,
                        unavailableAclInspectionExplicitlyBlocked=False)


@contextlib.contextmanager
def anchor():
    directory = tempfile.mkdtemp(prefix='stockinsider-keypath-fixture-', dir='/tmp')
    os.chown(directory, 0, GROUP)
    os.chmod(directory, 0o710)
    try:
        yield Path(directory)
    finally:
        shutil.rmtree(directory)


def install(directory, expiry=EXPIRY, now=NOW):
    return contract.install_fixture_authorization(str(directory), GROUP, expiry, now)


def dropped_probe(path, group):
    code = '''import json,os,sys
try:
 os.setgroups([]);os.setgid(int(sys.argv[2]));os.setuid(int(sys.argv[3]))
 readable=False;writable=False;directoryWritable=False
 try:
  with open(sys.argv[1],'rb') as f: readable=b'NONKEY_SENTINEL' in f.read(4097)
 except OSError: pass
 try:
  fd=os.open(sys.argv[1],os.O_WRONLY|os.O_APPEND);os.close(fd);writable=True
 except OSError: pass
 try:
  os.mkdir(os.path.join(os.path.dirname(sys.argv[1]),'reader-must-not-create'));directoryWritable=True
 except OSError: pass
 print(json.dumps(dict(readable=readable,writable=writable,directoryWritable=directoryWritable,probeCompleted=True)))
except BaseException:
 print(json.dumps(dict(probeCompleted=False)))
 sys.exit(1)
'''
    result = subprocess.run([sys.executable, '-I', '-B', '-c', code, str(path), str(group), str(READER)], capture_output=True, text=True, timeout=5)
    if result.returncode != 0 or result.stderr:
        raise AssertionError('credential_fixture_probe_failed')
    value = json.loads(result.stdout)
    if not value.get('probeCompleted') or not all(type(item) is bool for item in value.values()):
        raise AssertionError('credential_fixture_probe_failed')
    return value


class KeyPathFixtures(unittest.TestCase):
    def test_fixed_restrictions_and_bounded_canonical_expiry(self):
        options = contract.authorization_options(EXPIRY, NOW)
        self.assertTrue(options.startswith('restrict,expiry-time="20261108123000Z",command="'))
        self.assertTrue(options.endswith(contract.FORCED_GATEWAY + '"'))
        self.assertTrue(options.count(',') == 2)
        self.assertTrue('vnext-oct22-staging-gateway' in options)
        self.assertTrue(bool(contract.authorization_options('2026-11-08T13:00:00Z', NOW)))
        for expiry in [NOW, '2026-11-08T11:59:59Z', '2026-11-08T13:00:01Z', '2026-02-30T12:30:00Z', '2026-11-08T12:30:00+00:00', '2026-11-08T12:30:00Z"anything']:
            with self.assertRaises(contract.KeyPathContractError):
                contract.authorization_options(expiry, NOW)

    def test_host_facade_cannot_be_enabled_or_touch_paths(self):
        with mock.patch.object(contract.os, 'open', side_effect=AssertionError('unexpected_io')) as opened:
            self.assertTrue(all(type(value) is bool for value in contract.host_path_readiness().values()))
            self.assertTrue(contract.host_path_readiness()['disabled'])
            with self.assertRaises(contract.KeyPathContractError):
                contract.host_path_readiness(ready=True)
            with self.assertRaises(contract.KeyPathContractError):
                contract.apply_host_authorized_path(ready=True)
            for path in ['/run/stockinsider-vnext-staging-auth', '/tmp/../run', '/tmp', '/tmp/arbitrary-anchor', '/workspace/../tmp/stockinsider-keypath-fixture-anything']:
                with self.assertRaises(contract.KeyPathContractError):
                    contract.install_fixture_authorization(path, GROUP, EXPIRY, NOW)
            self.assertTrue(not opened.called)

    def test_bootstrap_early_apply_barrier_precedes_all_host_observation(self):
        source = (REPOSITORY / 'deployment/staging/vnext/bootstrap.py').read_text()
        tree = ast.parse(source)
        main = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'main')
        barrier = next(node for node in main.body if isinstance(node, ast.If) and ast.unparse(node.test) == 'args.apply')
        self.assertTrue(len(barrier.body) == 1 and isinstance(barrier.body[0], ast.Raise))
        self.assertTrue('isolated_sshd_host_apply_not_admitted' in ast.unparse(barrier))
        observation = next(node for node in main.body if isinstance(node, ast.Assign) and 'os.statvfs' in ast.unparse(node))
        self.assertTrue(barrier.lineno < observation.lineno)
        for forbidden in ['useradd', 'chpasswd', 'openssl', 'read_text().strip()', 'authorized.open', 'secrets.', 'subprocess.']:
            self.assertTrue(forbidden not in source)
        self.assertTrue('16106127360' in source and '1610612736' in source)
        self.assertTrue('1073741824 - 536870912 - 134217728 - 2147483648' in source)
        self.assertTrue('vnext-preflight-v1)' in source and 'staging_scope_rejected' in source)
        declared = next(node for node in tree.body if isinstance(node, ast.Assign) and any(isinstance(target, ast.Name) and target.id == 'HOST_AUTHORIZED_KEYS_FILE' for target in node.targets))
        self.assertTrue(ast.literal_eval(declared.value) == contract.HOST_AUTHORIZED_KEYS_FILE)

    def test_isolated_cli_help_and_early_apply_refusal_without_public_file(self):
        bootstrap = REPOSITORY / 'deployment/staging/vnext/bootstrap.py'
        helped = subprocess.run([sys.executable, '-I', '-B', str(bootstrap), '--help'], capture_output=True, text=True, timeout=5)
        self.assertTrue(helped.returncode == 0 and not helped.stderr)
        self.assertTrue('--public-key-file' in helped.stdout and '--expires-utc' in helped.stdout and '--apply' in helped.stdout)
        with anchor() as directory:
            missing = directory / 'nonexistent-public-fixture'
            refused = subprocess.run([sys.executable, '-I', '-B', str(bootstrap), '--apply', '--public-key-file', str(missing), '--expires-utc', EXPIRY], capture_output=True, text=True, timeout=5)
            self.assertTrue(refused.returncode != 0 and not refused.stdout)
            self.assertTrue(refused.stderr.strip() == 'isolated_sshd_host_apply_not_admitted')
            self.assertTrue(not missing.exists() and not (directory / 'auth').exists())

    def test_original_umask_failure_denies_nonroot_despite_file_mode(self):
        with anchor() as directory:
            code = '''import os,sys
from pathlib import Path
os.umask(0o077)
root=Path(sys.argv[1])/'old-private-root';root.mkdir(mode=0o750);os.chown(root,0,int(sys.argv[2]))
ssh=root/'.ssh';ssh.mkdir(mode=0o750);os.chown(ssh,0,int(sys.argv[2]))
f=ssh/'authorized_keys';f.write_bytes(b'NONKEY_SENTINEL_OLD_FAILURE\\n');os.chown(f,0,int(sys.argv[2]));os.chmod(f,0o640)
'''
            result = subprocess.run([sys.executable, '-I', '-B', '-c', code, str(directory), str(GROUP)], capture_output=True, timeout=5)
            self.assertTrue(result.returncode == 0 and not result.stdout and not result.stderr)
            old_root = directory / 'old-private-root'
            self.assertTrue(stat.S_IMODE(old_root.stat().st_mode) == 0o700)
            self.assertTrue(stat.S_IMODE((old_root / '.ssh').stat().st_mode) == 0o700)
            path = old_root / '.ssh/authorized_keys'
            self.assertTrue(stat.S_IMODE(path.stat().st_mode) == 0o640)
            probe = dropped_probe(path, GROUP)
            self.assertTrue(not probe['readable'] and not probe['writable'])

    def test_new_path_under_child_umask_permits_read_but_no_write_or_other_group(self):
        with anchor() as directory:
            code = '''import importlib.util,os,sys
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('fixture_contract',sys.argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
os.umask(0o077)
result=m.install_fixture_authorization(sys.argv[2],int(sys.argv[3]),sys.argv[4],sys.argv[5])
if not (result['fixtureOnly'] and result['created'] and not result['hostApplied']):sys.exit(1)
'''
            result = subprocess.run([sys.executable, '-I', '-B', '-c', code, str(HELPER), str(directory), str(GROUP), EXPIRY, NOW], capture_output=True, timeout=5)
            self.assertTrue(result.returncode == 0 and not result.stdout and not result.stderr)
            auth = directory / 'auth'
            path = auth / 'authorized_keys'
            self.assertTrue(auth.stat().st_uid == 0 and auth.stat().st_gid == GROUP and stat.S_IMODE(auth.stat().st_mode) == 0o710)
            self.assertTrue(path.stat().st_uid == 0 and path.stat().st_gid == GROUP and stat.S_IMODE(path.stat().st_mode) == 0o640 and path.stat().st_nlink == 1)
            good = dropped_probe(path, GROUP)
            denied = dropped_probe(path, OTHER_GROUP)
            self.assertTrue(good['readable'] and not good['writable'] and not good['directoryWritable'])
            self.assertTrue(not denied['readable'] and not denied['writable'] and not denied['directoryWritable'])

    def test_exact_idempotence_is_not_expiry_renewal_or_unsafe_path_repair(self):
        with anchor() as directory:
            first = install(directory)
            path = directory / 'auth/authorized_keys'
            before = path.stat()
            second = install(directory, now='2026-11-08T12:05:00Z')
            after = path.stat()
            self.assertTrue(first['created'] and second['idempotent'] and not second['created'])
            self.assertTrue((before.st_ino, before.st_mtime_ns) == (after.st_ino, after.st_mtime_ns))
            with self.assertRaises(contract.KeyPathContractError):
                install(directory, expiry='2026-11-08T12:35:00Z')
            self.assertTrue(path.read_bytes().endswith(b'NONKEY_SENTINEL_NOT_AN_SSH_IDENTITY\n'))
            with mock.patch.object(contract.os, 'open', side_effect=AssertionError('unexpected_io')) as opened:
                with self.assertRaises(contract.KeyPathContractError):
                    install(directory, now=EXPIRY)
                self.assertTrue(not opened.called)
            self.assertTrue(all(type(value) is bool for value in second.values()))

    def test_existing_directory_and_file_metadata_mismatch_is_not_healed(self):
        for component, change in [('anchor', 'mode'), ('directory', 'mode'), ('directory', 'owner'), ('directory', 'group'), ('file', 'mode'), ('file', 'owner'), ('file', 'group')]:
            with anchor() as directory:
                install(directory)
                path = directory if component == 'anchor' else directory / 'auth' if component == 'directory' else directory / 'auth/authorized_keys'
                if change == 'mode':
                    os.chmod(path, 0o750 if component != 'file' else 0o660)
                else:
                    os.chown(path, READER if change == 'owner' else 0, OTHER_GROUP if change == 'group' else GROUP)
                before = path.stat()
                with self.assertRaises(contract.KeyPathContractError):
                    install(directory)
                after = path.stat()
                self.assertTrue((before.st_uid, before.st_gid, before.st_mode, before.st_ino) == (after.st_uid, after.st_gid, after.st_mode, after.st_ino))

    def test_symlink_ancestor_directory_and_file_do_not_follow_or_touch_target(self):
        for component in ['anchor', 'directory', 'file']:
            with anchor() as directory, anchor() as untouched:
                guard = untouched / 'production-config-sentinel'
                guard.write_bytes(b'NONKEY_SENTINEL_PRODUCTION_UNCHANGED')
                if component == 'anchor':
                    substitute = str(directory) + '_link'
                    os.symlink(directory, substitute)
                    try:
                        with self.assertRaises(contract.KeyPathContractError):
                            install(Path(substitute))
                    finally:
                        os.unlink(substitute)
                else:
                    if component == 'directory':
                        os.symlink(untouched, directory / 'auth')
                    else:
                        install(directory)
                        (directory / 'auth/authorized_keys').unlink()
                        os.symlink(guard, directory / 'auth/authorized_keys')
                    with self.assertRaises(contract.KeyPathContractError):
                        install(directory)
                self.assertTrue(guard.read_bytes() == b'NONKEY_SENTINEL_PRODUCTION_UNCHANGED')

    def test_hardlinked_or_oversized_existing_file_rejects_before_read(self):
        for kind in ['hardlink', 'oversized', 'trailing_bytes']:
            with anchor() as directory:
                install(directory)
                path = directory / 'auth/authorized_keys'
                if kind == 'hardlink':
                    os.link(path, directory / 'second-link')
                elif kind == 'trailing_bytes':
                    path.write_bytes(path.read_bytes() + b'NONKEY_TRAILING_BYTES')
                else:
                    path.write_bytes(b'X' * 4097)
                with mock.patch.object(contract.os, 'read', side_effect=AssertionError('unsafe_read')) as reader:
                    with self.assertRaises(contract.KeyPathContractError):
                        install(directory)
                    self.assertTrue(not reader.called)

    def test_fifo_rejected_without_waiting_for_a_writer(self):
        with anchor() as directory:
            install(directory)
            path = directory / 'auth/authorized_keys'
            path.unlink()
            os.mkfifo(path, 0o640)
            os.chown(path, 0, GROUP)
            code = '''import importlib.util,sys
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('fixture_contract',sys.argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
try:m.install_fixture_authorization(sys.argv[2],int(sys.argv[3]),sys.argv[4],sys.argv[5])
except m.KeyPathContractError:sys.exit(0)
sys.exit(1)
'''
            result = subprocess.run([sys.executable, '-I', '-B', '-c', code, str(HELPER), str(directory), str(GROUP), EXPIRY, NOW], capture_output=True, timeout=3)
            self.assertTrue(result.returncode == 0 and not result.stdout and not result.stderr)

    def test_missing_acl_observation_and_reported_access_or_default_acl_block(self):
        with anchor() as directory:
            for replacement in [OSError('unavailable'), ['system.posix_acl_access'], ['system.posix_acl_default']]:
                patch = dict(side_effect=replacement) if isinstance(replacement, OSError) else dict(return_value=replacement)
                with mock.patch.object(contract.os, 'listxattr', **patch):
                    with self.assertRaises(contract.KeyPathContractError):
                        install(directory)
            self.assertTrue(not (directory / 'auth').exists())

    def test_kernel_posix_acl_rejected_or_inspection_explicitly_blocked(self):
        for default in [False, True]:
            with anchor() as directory:
                install(directory)
                # Linux ACL version2 with a named unrelated group. Access mask
                # preserves 0640; a default ACL leaves directory mode0710.
                owner, mask = (7, 1) if default else (6, 4)
                entries = [(1, owner, 0xffffffff), (4, mask, 0xffffffff), (8, mask, OTHER_GROUP), (16, mask, 0xffffffff), (32, 0, 0xffffffff)]
                encoded = struct.pack('<I', 2) + b''.join(struct.pack('<HHI', *entry) for entry in entries)
                path = directory / 'auth' if default else directory / 'auth/authorized_keys'
                fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
                try:
                    try:
                        os.setxattr(fd, 'system.posix_acl_default' if default else 'system.posix_acl_access', encoded)
                    except OSError as error:
                        if error.errno not in [errno.ENOTSUP, errno.EOPNOTSUPP, errno.ENOSYS]:
                            raise
                        with mock.patch.object(contract.os, 'listxattr', side_effect=OSError('unavailable')):
                            with self.assertRaises(contract.KeyPathContractError):
                                install(directory)
                        ACL_OBSERVATIONS['unavailableAclInspectionExplicitlyBlocked'] = True
                    else:
                        self.assertTrue(stat.S_IMODE(os.fstat(fd).st_mode) == (0o710 if default else 0o640))
                        with self.assertRaises(contract.KeyPathContractError):
                            install(directory)
                        ACL_OBSERVATIONS['kernelDefaultAclRejectionVerified' if default else 'kernelAccessAclRejectionVerified'] = True
                finally:
                    os.close(fd)

    def test_changed_ancestor_mode_after_open_refuses_publication_without_repair(self):
        with anchor() as directory:
            original = contract._publish_sentinel
            def changed(*args):
                os.chmod(directory, 0o770)
                return original(*args)
            with mock.patch.object(contract, '_publish_sentinel', side_effect=changed):
                with self.assertRaises(contract.KeyPathContractError):
                    install(directory)
            self.assertTrue(stat.S_IMODE(directory.stat().st_mode) == 0o770)
            self.assertTrue(not (directory / 'auth/authorized_keys').exists())
            self.assertTrue(not list((directory / 'auth').glob('.fixture-pending-*')))

    def test_named_directory_replacement_does_not_follow_production_fixture(self):
        with anchor() as directory, anchor() as untouched:
            guard = untouched / 'production-config-sentinel'
            guard.write_bytes(b'NONKEY_SENTINEL_PRODUCTION_UNCHANGED')
            original = contract.os.link
            def replaced(*args, **kwargs):
                (directory / 'auth').rename(directory / 'detached-auth')
                os.symlink(untouched, directory / 'auth')
                return original(*args, **kwargs)
            with mock.patch.object(contract.os, 'link', side_effect=replaced):
                with self.assertRaises(contract.KeyPathContractError):
                    install(directory)
            self.assertTrue(guard.read_bytes() == b'NONKEY_SENTINEL_PRODUCTION_UNCHANGED')
            self.assertTrue(not (untouched / 'authorized_keys').exists())

    def test_nonzero_group_and_nonkey_payload_cannot_be_replaced_by_caller_options(self):
        with anchor() as directory:
            for group in [0, -1, True, None]:
                with self.assertRaises(contract.KeyPathContractError):
                    contract.install_fixture_authorization(str(directory), group, EXPIRY, NOW)
            with self.assertRaises(TypeError):
                contract.install_fixture_authorization(str(directory), GROUP, EXPIRY, NOW, payload=b'anything')
            self.assertTrue(not (directory / 'auth').exists())


class SanitizedResult(unittest.TestResult):
    def __init__(self):
        super().__init__()
        self.behaviors = {}

    def addSuccess(self, test):
        super().addSuccess(test)
        self.behaviors[test._testMethodName] = True

    def addFailure(self, test, err):
        self.failures.append((test, 'fixture_behavior_failed'))
        self.behaviors[test._testMethodName] = False

    def addError(self, test, err):
        self.errors.append((test, 'fixture_behavior_failed'))
        self.behaviors[test._testMethodName] = False


if __name__ == '__main__':
    if os.geteuid() != 0:
        print(json.dumps(dict(fixtureOnly=True, rootFixturePrerequisiteMet=False, allCasesPassed=False)))
        sys.exit(2)
    result = SanitizedResult()
    unittest.defaultTestLoader.loadTestsFromTestCase(KeyPathFixtures).run(result)
    print(json.dumps(dict(fixtureOnly=True, rootFixturePrerequisiteMet=True,
                         allCasesPassed=result.wasSuccessful() and not result.skipped,
                         behaviors=result.behaviors, aclObservations=ACL_OBSERVATIONS), sort_keys=True))
    sys.exit(0 if result.wasSuccessful() and not result.skipped else 1)
