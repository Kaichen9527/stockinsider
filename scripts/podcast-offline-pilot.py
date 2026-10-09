#!/usr/bin/env python3
"""Private offline pilot components. Default is network-free preflight.

Executor-focused increment: real acquisition/installation/ASR is NOT implemented.
--run-isolated refuses before creating a root; no partial unmonitored execution.
Linux supervision is exposed to the separate explicit synthetic acceptance mode.
"""
import argparse
import ctypes
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import re
import signal
import stat
import subprocess
import sys
import time
from urllib.parse import urlsplit

WORK_SECONDS = 1800
BYTE_LIMIT = 4_000_000_000
FREE_RESERVE = RSS_LIMIT = 8_589_934_592
INTERVAL = 0.25
SOURCE_HOST = 'filesb.soundon.fm'
SOURCE_PATH = '/file/filesb/6f14051a-1c2e-4782-a78d-9633d918c2bd.mp3'
AUDIO_LIMIT = 85_000_000
MODEL_REVISION = '536b0662742c02347bc0e980a01041f333bce120'
WHEEL_HASH = '79a66ad50688c0b794dd501dc340a736992a6342f7f95e5811be60b5224a26a7'
MODEL_FILES = {
 'config.json': (2370, 'e5047537059bd8f182d9ca64c470201585015187', 'git-blob-sha1'),
 'tokenizer.json': (2203239, '7818adb6de9fa3064d3ff81226fdd675be1f6344', 'git-blob-sha1'),
 'vocabulary.txt': (459861, 'c9074644d9d1205686f16d411564729461324b75', 'git-blob-sha1'),
 'model.bin': (483546902, '3e305921506d8872816023e4c273e75d2419fb89b24da97b4fe7bce14170d671', 'sha256'),
}
PROXY_CA_NAMES = ('HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY',
                  'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy',
                  'SSL_CERT_FILE', 'SSL_CERT_DIR', 'REQUESTS_CA_BUNDLE', 'CURL_CA_BUNDLE')

class Refusal(RuntimeError):
    """Only fixed non-secret reason codes should leave the process."""


def require(condition, code):
    if not condition:
        raise Refusal(code)


def closed_json(data):
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, 'duplicate_json_key')
            result[key] = value
        return result
    return json.loads(data.decode('utf-8', errors='strict'), object_pairs_hook=pairs,
                      parse_constant=lambda _: (_ for _ in ()).throw(Refusal('nonfinite_json')))


def child_environment(root, inherited, python_directory='/usr/bin'):
    """Values never go into receipts. No ambient HOME/PATH/token/config inheritance."""
    require(Path(root).is_absolute() and Path(python_directory).is_absolute(), 'absolute_child_paths')
    root = str(root)
    env = {name: inherited[name] for name in PROXY_CA_NAMES if name in inherited}
    env.update({
        'PATH': f'{root}/venv/bin:{python_directory}:/usr/bin:/bin',
        'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8', 'TZ': 'UTC',
        'HOME': root + '/home', 'HF_HOME': root + '/home/hf',
        'HUGGINGFACE_HUB_CACHE': root + '/home/hf/hub',
        'XDG_CONFIG_HOME': root + '/home/config', 'XDG_CACHE_HOME': root + '/home/cache',
        'XDG_DATA_HOME': root + '/home/data', 'TMPDIR': root + '/tmp',
        'PIP_CONFIG_FILE': '/dev/null', 'PIP_CACHE_DIR': root + '/home/pip',
        'PIP_DISABLE_PIP_VERSION_CHECK': '1', 'PIP_NO_INPUT': '1',
        'PIP_KEYRING_PROVIDER': 'disabled', 'PYTHONNOUSERSITE': '1',
        'HF_HUB_DISABLE_IMPLICIT_TOKEN': '1', 'HF_HUB_DISABLE_TELEMETRY': '1',
        'DO_NOT_TRACK': '1', 'TOKENIZERS_PARALLELISM': 'false',
        'OMP_NUM_THREADS': '4', 'OPENBLAS_NUM_THREADS': '4',
    })
    return env


def pip_plan(root):
    p = str(Path(root) / 'venv/bin/python')
    base = [p, '-I', '-m', 'pip', '--isolated', '--disable-pip-version-check', '--no-input']
    public = ['--index-url', 'https://pypi.org/simple', '--keyring-provider', 'disabled']
    return {
      'resolve': base + ['install', '--dry-run', '--ignore-installed', '--only-binary=:all:',
                        '--report', str(Path(root)/'resolution.json'), *public, 'faster-whisper==1.2.1'],
      'download': base + ['download', '--only-binary=:all:', '--require-hashes', '--no-deps',
                         '--dest', str(Path(root)/'wheels'), '-r', str(Path(root)/'requirements.lock'), *public],
      'install': base + ['install', '--no-index', '--no-deps', '--only-binary=:all:', '--require-hashes',
                        '--find-links', str(Path(root)/'wheels'), '-r', str(Path(root)/'requirements.lock')],
    }


def wheel_lock(report):
    """Report bytes must be separately bounded. Reject unpinned or non-wheel input."""
    require(isinstance(report, dict) and isinstance(report.get('install'), list), 'wheel_report_shape')
    rows = report['install']
    require(1 <= len(rows) <= 64, 'wheel_closure_count')
    seen, output, artifacts = set(), [], []
    for row in rows:
        metadata = row.get('metadata', {})
        name = re.sub(r'[-_.]+', '-', metadata.get('name', '')).lower()
        version = metadata.get('version', '')
        require(re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', name) and
                re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9.!+_-]{0,99}', version), 'wheel_identity')
        require(name not in seen and name not in {'torch', 'tensorflow', 'triton'}, 'wheel_duplicate_or_extra')
        seen.add(name)
        info = row.get('download_info', {})
        url = urlsplit(info.get('url', ''))
        require(url.scheme == 'https' and url.hostname == 'files.pythonhosted.org'
                and url.port in (None, 443) and not url.username and not url.password
                and not url.query and not url.fragment and re.fullmatch(r'/packages/[A-Za-z0-9/_.+-]+\.whl', url.path),
                'wheel_public_binary_url')
        digest = info.get('archive_info', {}).get('hashes', {}).get('sha256', '')
        require(re.fullmatch(r'[a-f0-9]{64}', digest), 'wheel_sha256_required')
        if name == 'faster-whisper':
            require(version == '1.2.1' and digest == WHEEL_HASH, 'root_wheel_pin')
        output.append(f'{name}=={version} --hash=sha256:{digest}')
        artifacts.append({'name': name, 'version': version, 'url': info['url'], 'sha256': digest})
    require('faster-whisper' in seen, 'root_wheel_missing')
    return '\n'.join(sorted(output)) + '\n', sorted(artifacts, key=lambda x: x['name'])


def source_policy(url, addresses, content_type, declared_bytes):
    """Pure policy; resolver/connection pinning and streaming acquisition are pending."""
    parsed = urlsplit(url)
    require(parsed.scheme == 'https' and parsed.hostname == SOURCE_HOST and parsed.path == SOURCE_PATH
            and parsed.port in (None, 443) and not parsed.username and not parsed.password
            and not parsed.query and not parsed.fragment, 'source_url_not_exact')
    require(bool(addresses) and all(ipaddress.ip_address(address).is_global for address in addresses), 'nonpublic_source_address')
    require(content_type.split(';', 1)[0].strip().lower() in ('audio/mpeg', 'audio/mp3'), 'source_not_audio')
    require(type(declared_bytes) is int and 0 < declared_bytes <= AUDIO_LIMIT, 'source_declared_size')


def verify_model_bytes(name, data):
    require(name in MODEL_FILES, 'model_file_not_allowed')
    size, expected, algorithm = MODEL_FILES[name]
    require(len(data) == size, 'model_file_size')
    actual = hashlib.sha256(data).hexdigest() if algorithm == 'sha256' else hashlib.sha1(
        f'blob {size}\0'.encode() + data).hexdigest()
    require(actual == expected, 'model_file_hash')
    return {'name': name, 'bytes': size, 'sha256': hashlib.sha256(data).hexdigest(), 'revision': MODEL_REVISION}


def inventory(root, limit=BYTE_LIMIT):
    """Never follows symlinks; changing files fail closed. Allocated blocks dedup dev/ino."""
    logical = allocated = entries = 0
    seen = set()
    observed = []
    stack = [Path(root)]
    while stack:
        filename = stack.pop()
        before = filename.lstat()
        observed.append((filename, before))
        entries += 1
        require(entries <= 100000, 'inventory_entry_bound')
        require(before.st_uid == os.getuid(), 'inventory_owner')
        key = (before.st_dev, before.st_ino)
        if key not in seen:
            seen.add(key)
            allocated += before.st_blocks * 512
        if stat.S_ISREG(before.st_mode):
            # Count every directory entry conservatively, even a hard-linked file.
            logical += before.st_size
        elif stat.S_ISDIR(before.st_mode):
            with os.scandir(filename) as scan:
                for child in scan:
                    require(len(stack) + entries < 100000, 'inventory_entry_bound')
                    stack.append(Path(child.path))
        elif stat.S_ISLNK(before.st_mode):
            require(filename.resolve().is_relative_to(Path(root)), 'inventory_external_symlink')
        else:
            raise Refusal('inventory_nonregular')
        after = filename.lstat()
        require((before.st_dev, before.st_ino, before.st_size, before.st_blocks, before.st_mtime_ns, before.st_ctime_ns)
                == (after.st_dev, after.st_ino, after.st_size, after.st_blocks, after.st_mtime_ns, after.st_ctime_ns),
                'inventory_changed')
        require(logical <= limit and allocated <= limit, 'task_storage_limit')
    for filename, before in observed:
        after = filename.lstat()
        require((before.st_dev, before.st_ino, before.st_mode, before.st_nlink, before.st_size,
                 before.st_blocks, before.st_mtime_ns, before.st_ctime_ns) ==
                (after.st_dev, after.st_ino, after.st_mode, after.st_nlink, after.st_size,
                 after.st_blocks, after.st_mtime_ns, after.st_ctime_ns), 'inventory_changed')
    return {'logicalBytes': logical, 'allocatedBytes': allocated, 'entries': entries}


def parse_proc_stat(pid, data):
    tail = data.rsplit(')', 1)[1].split()
    require(len(tail) >= 22, 'proc_stat_shape')
    return {'pid': pid, 'state': tail[0], 'ppid': int(tail[1]), 'pgid': int(tail[2]),
            'start': int(tail[19]), 'rss': max(0, int(tail[21])) * os.sysconf('SC_PAGE_SIZE')}


class LinuxTree:
    """Single-job subreaper; pidfds signal exact identities, never reused PID/PGID."""
    def __init__(self):
        require(sys.platform == 'linux' and hasattr(os, 'pidfd_open') and hasattr(signal, 'pidfd_send_signal'),
                'linux_pidfd_supervision_unavailable')
        self.pid = os.getpid()
        self.owned = {}
        self.libc = ctypes.CDLL(None, use_errno=True)
        require(self.libc.prctl(36, 1, 0, 0, 0) == 0, 'subreaper_unavailable')  # PR_SET_CHILD_SUBREAPER
        require(not any(row['ppid'] == self.pid for row in self.snapshot().values()), 'preexisting_child_refused')

    @staticmethod
    def snapshot():
        result = {}
        for entry in Path('/proc').iterdir():
            if not entry.name.isdigit():
                continue
            try:
                with (entry/'stat').open('r') as stream:
                    data = stream.read(65537)
                require(len(data) <= 65536, 'proc_stat_bound')
                result[int(entry.name)] = parse_proc_stat(int(entry.name), data)
            except FileNotFoundError:
                continue
            except ProcessLookupError:
                continue
        return result

    def scan(self, leader, *, _rows=None, _round=0):
        require(_round < 8, 'process_tree_unstable')
        rows = self.snapshot() if _rows is None else _rows
        descendants = {self.pid}
        changed = True
        while changed:
            changed = False
            for pid, row in rows.items():
                if row['ppid'] in descendants and pid not in descendants:
                    descendants.add(pid)
                    changed = True
        descendants.remove(self.pid)
        for pid in descendants:
            row = rows[pid]
            previous = self.owned.get(pid)
            if previous:
                require(previous['start'] == row['start'], 'owned_pid_identity_changed')
                continue
            try:
                fd = os.pidfd_open(pid, 0)
                current = self.snapshot().get(pid)
                if current is None:
                    os.close(fd)
                    continue
                if current['start'] != row['start']:
                    os.close(fd)
                    raise Refusal('pidfd_identity_race')
            except ProcessLookupError:
                continue
            self.owned[pid] = {**row, 'fd': fd}
        leader.poll()  # Only Popen reaps its own leader.
        for pid, row in list(self.owned.items()):
            now = rows.get(pid)
            if now and now['start'] != row['start']:
                raise Refusal('owned_pid_identity_changed')
            if now and now['state'] == 'Z' and pid != leader.pid:
                try:
                    os.waitpid(pid, os.WNOHANG)
                except ChildProcessError:
                    pass
            try:
                signal.pidfd_send_signal(row['fd'], 0)
                row['rss'] = now['rss'] if now else row['rss']
            except ProcessLookupError:
                os.close(row['fd'])
                del self.owned[pid]
        # pidfd acquisition and Popen.poll may span reparenting. Reconcile the
        # ENTIRE post-acquisition/post-reap snapshot, not only each leader row.
        # A bounded unstable tree is uncertainty, never proof of no descendants.
        final_rows = self.snapshot()
        final_descendants = {self.pid} | set(self.owned)
        changed = True
        while changed:
            changed = False
            for pid, row in final_rows.items():
                if row['ppid'] in final_descendants and pid not in final_descendants:
                    final_descendants.add(pid)
                    changed = True
        for pid, identity in self.owned.items():
            if pid in final_rows:
                require(final_rows[pid]['start'] == identity['start'], 'owned_pid_identity_changed')
                identity['rss'] = final_rows[pid]['rss']
        untracked = (final_descendants - {self.pid}) - set(self.owned)
        if untracked:
            return self.scan(leader, _rows=final_rows, _round=_round+1)
        return list(self.owned.values())

    def signal_all(self, kind):
        for row in list(self.owned.values()):
            try:
                signal.pidfd_send_signal(row['fd'], kind)
            except ProcessLookupError:
                pass

    def close(self):
        require(not self.owned, 'owned_processes_unresolved')


class Supervisor:
    def __init__(self, root, *, seconds=WORK_SECONDS, byte_limit=BYTE_LIMIT,
                 rss_limit=RSS_LIMIT, free_reserve=FREE_RESERVE, tree=None,
                 clock=time.monotonic, pause=time.sleep, resources=None):
        self.root = Path(root)
        self.clock, self.pause = clock, pause
        self.deadline = clock() + seconds
        self.byte_limit, self.rss_limit, self.free_reserve = byte_limit, rss_limit, free_reserve
        self.tree = tree if tree is not None else LinuxTree()
        self.resources = resources or self.sample_resources
        self.samples = []
        self.stages = []
        self.cleanup_confirmed = True
        self.failed = False

    def sample_resources(self):
        sample = inventory(self.root, self.byte_limit)
        disk = os.statvfs(self.root)
        sample['freeBytes'] = disk.f_bavail * disk.f_frsize
        sample['supervisorRssBytes'] = self.tree.snapshot()[os.getpid()]['rss']
        return sample

    def sample(self, process, prior):
        begin = self.clock()
        require(begin - prior <= 1, 'supervision_sample_interval_exceeded')
        identities = self.tree.scan(process)
        sample = self.resources()
        sample.update({'monotonic': self.clock(), 'sampleStartedAt': begin, 'ownedProcesses': len(identities),
                       'rssBytes': sum(row['rss'] for row in identities) + sample.get('supervisorRssBytes', 0)})
        # Bound receipt memory and detect scans that were themselves too slow.
        require(len(self.samples) < 10000, 'sample_count_bound')
        self.samples.append(sample)
        require(self.clock() - begin <= 1, 'supervision_sample_interval_exceeded')
        require(self.clock() < self.deadline, 'work_deadline')
        require(sample['logicalBytes'] <= self.byte_limit and sample['allocatedBytes'] <= self.byte_limit, 'task_storage_limit')
        require(sample['freeBytes'] >= self.free_reserve, 'host_free_reserve')
        require(sample['rssBytes'] <= self.rss_limit, 'rss_limit')
        return identities

    def stop(self, process):
        # Discover newly adopted descendants before every signal sweep. TERM and
        # KILL go to pidfd-identified members, never an old numeric process group.
        for kind in (signal.SIGTERM, signal.SIGKILL):
            deadline = self.clock() + 2
            while True:
                identities = self.tree.scan(process)
                if not identities:
                    self.tree.close()
                    return True
                self.tree.signal_all(kind)
                if self.clock() >= deadline:
                    break
                self.pause(min(INTERVAL, max(0, deadline-self.clock())))
        return not self.tree.scan(process)

    def run(self, name, command, env, *, launch=subprocess.Popen):
        require(re.fullmatch(r'[a-z][a-z0-9-]{0,60}', name), 'stage_name')
        require(not self.failed and self.cleanup_confirmed, 'previous_stage_unresolved')
        require(self.clock() < self.deadline, 'work_deadline')
        first = self.resources()
        require(first['logicalBytes'] <= self.byte_limit and first['allocatedBytes'] <= self.byte_limit, 'task_storage_limit')
        require(first['freeBytes'] >= self.free_reserve, 'host_free_reserve')
        require(first.get('supervisorRssBytes', 0) <= self.rss_limit, 'rss_limit')
        require(self.clock() < self.deadline, 'work_deadline')
        result = {'stage': name, 'success': False, 'cleanupConfirmed': False}
        self.stages.append(result)
        process = None
        launch_attempted = False
        self.cleanup_confirmed = False
        try:
            # Logs are private regular files and included in every storage sample.
            with os.fdopen(os.open(self.root/(name+'.stdout'), os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW, 0o600), 'wb') as out, os.fdopen(os.open(self.root/(name+'.stderr'), os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW, 0o600), 'wb') as err:
                require(self.clock() < self.deadline, 'work_deadline')
                launch_attempted = True
                process = launch(command, env=env, cwd=self.root, stdin=subprocess.DEVNULL,
                                 stdout=out, stderr=err, start_new_session=True, close_fds=True)
                prior = self.clock()
                while True:
                    identities = self.sample(process, prior)
                    prior = self.samples[-1]['sampleStartedAt']
                    code = process.poll()
                    if code is not None:
                        require(code == 0, 'stage_exit_nonzero')
                        require(not identities, 'leader_exited_with_descendants')
                        result['success'] = True
                        self.cleanup_confirmed = True
                        break
                    self.pause(INTERVAL)
        except BaseException as error:
            self.failed = True
            result['error'] = str(error) if isinstance(error, Refusal) else type(error).__name__
            try:
                self.cleanup_confirmed = (not launch_attempted) if process is None else self.stop(process)
            except BaseException:
                self.cleanup_confirmed = False
            raise
        finally:
            result['cleanupConfirmed'] = self.cleanup_confirmed

    def receipt(self):
        return {'schemaVersion': 'podcast-offline-supervisor-v1', 'stages': self.stages,
                'samples': self.samples, 'sampleMaximumOnly': True,
                'cleanupConfirmed': self.cleanup_confirmed,
                'contentCapabilitySuccess': False, 'audioAcquired': False,
                'packagesInstalled': False, 'asrExecuted': False,
                'deleteRootAuthorized': False}


def new_root(filename):
    target = Path(filename)
    require(target.is_absolute() and target.parent.resolve() == target.parent, 'private_root_path')
    os.umask(0o077)
    target.mkdir(mode=0o700, exist_ok=False)
    for name in ('home', 'tmp', 'wheels', 'model'):
        (target/name).mkdir(mode=0o700)
    return target


def preflight():
    # Pure constants and sanitized canary environment only: no network/child execution.
    canary = {name: 'SYNTHETIC_NOT_A_CREDENTIAL' for name in
              ('HF_TOKEN', 'OPENAI_API_KEY', 'PIP_INDEX_URL', 'PYTHONPATH', 'HOME', 'GIT_CONFIG_GLOBAL')}
    env = child_environment('/synthetic-pilot', canary)
    require(not any(key in env for key in canary if key != 'HOME'), 'environment_canary_failed')
    require(env['HOME'] == '/synthetic-pilot/home', 'environment_home_canary_failed')
    return {'schemaVersion': 'podcast-offline-pilot-preflight-v1', 'networkAttempted': False,
            'canaryIsolation': True, 'python312AvailableInCurrentProcess': sys.version_info[:2] == (3, 12),
            'linuxPidfdApisPresent': sys.platform == 'linux' and hasattr(os, 'pidfd_open') and hasattr(signal, 'pidfd_send_signal'),
            'supervisionActuallyValidated': False, 'contentCapabilitySuccess': False,
            'runIsolatedAvailable': False, 'modelRevision': MODEL_REVISION,
            'declaredModelBytes': sum(v[0] for v in MODEL_FILES.values()),
            'audioByteLimit': AUDIO_LIMIT, 'logicalAndAllocatedByteLimit': BYTE_LIMIT,
            'freeReserveBytes': FREE_RESERVE, 'rssLimitBytes': RSS_LIMIT,
            'maxWorkSeconds': WORK_SECONDS, 'maximumSampleIntervalSeconds': 1,
            'unimplemented': ['public DNS/connection-pinned acquisition and streaming transport',
                              'binary closure download/file verification and local installation orchestration',
                              'ffprobe/300-second decode and local-only CPU ASR execution',
                              'actual Linux process/resource acceptance'],
            'childEnvironmentNames': sorted(env)}


def supervisor_fixtures(filename):
    """Explicit VM-only real process tests. No downloads, installs or inference."""
    require(sys.platform == 'linux' and sys.version_info[:2] == (3, 12), 'fixture_requires_linux_python312')
    require(filename is not None, 'new_artifact_root_required')
    # Capability check before root mutation. This creates no child or connection.
    initial_tree = LinuxTree()
    initial_tree.close()
    root = new_root(filename)
    env = child_environment(root, os.environ, str(Path(sys.executable).parent))
    report = {'schemaVersion':'podcast-supervisor-isolated-acceptance-v1',
              'contentCapabilitySuccess':False, 'audioAcquired':False,
              'packagesInstalled':False, 'asrExecuted':False,
              'checks':{}, 'cleanupConfirmed':True, 'deleteRootAuthorized':False}
    cases = [
        ('stalled-download', "import signal,time;signal.signal(signal.SIGTERM,signal.SIG_IGN);time.sleep(60)",
         .75, BYTE_LIMIT, ('work_deadline',)),
        ('over-writer', "import time;open('oversize','wb').write(b'x'*1048576);time.sleep(60)",
         3, 262144, ('task_storage_limit','inventory_changed')),
        ('leader-exit', "import os,time;pid=os.fork();time.sleep(60) if pid==0 else os._exit(0)",
         3, BYTE_LIMIT, ('leader_exited_with_descendants',)),
    ]
    try:
        for name, code, seconds, limit, expected in cases:
            directory = root/name
            directory.mkdir(mode=0o700)
            supervisor = Supervisor(directory, seconds=seconds, byte_limit=limit)
            try:
                supervisor.run(name, [sys.executable,'-I','-c',code], env)
            except Refusal as error:
                require(str(error) in expected, 'fixture_unexpected_stage_failure')
            else:
                raise Refusal('negative_fixture_unexpected_success')
            finally:
                report['checks'][name] = supervisor.receipt()
                report['cleanupConfirmed'] = report['cleanupConfirmed'] and supervisor.cleanup_confirmed
            require(supervisor.cleanup_confirmed, 'fixture_cleanup_unconfirmed')
        report['supervisorSubsetPassed'] = True
    except BaseException as error:
        report['supervisorSubsetPassed'] = False
        report['error'] = str(error) if isinstance(error,Refusal) else type(error).__name__
    finally:
        with (root/'supervisor-receipt.json').open('x') as output:
            json.dump(report, output, sort_keys=True)
            output.flush()
            os.fsync(output.fileno())
    require(report.get('supervisorSubsetPassed') and report['cleanupConfirmed'], 'supervisor_acceptance_failed')
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--preflight', action='store_true')
    parser.add_argument('--run-isolated', action='store_true')
    parser.add_argument('--supervisor-fixtures', action='store_true')
    parser.add_argument('--artifact-root')
    args = parser.parse_args()
    require(not(args.preflight and args.run_isolated), 'conflicting_modes')
    if args.supervisor_fixtures:
        require(args.run_isolated, 'explicit_isolated_mode_required')
        report = supervisor_fixtures(args.artifact_root)
        print(json.dumps({'supervisorSubsetPassed': report['supervisorSubsetPassed'],
                          'contentCapabilitySuccess': False, 'cleanupConfirmed': report['cleanupConfirmed']}))
        return
    if args.run_isolated:
        # Do not create an evidence root or touch the network for an incomplete executor.
        raise Refusal('pilot_execution_not_implemented_in_focused_increment')
    require(args.artifact_root is None, 'preflight_does_not_create_artifacts')
    print(json.dumps(preflight(), sort_keys=True))


if __name__ == '__main__':
    try:
        main()
    except BaseException as error:
        print(json.dumps({'ok': False, 'error': str(error) if isinstance(error, Refusal) else type(error).__name__,
                          'contentCapabilitySuccess': False}), file=sys.stderr)
        sys.exit(1)
