#!/usr/bin/env python3
"""Owned systemd lifecycle regression; --run is restricted to hosted Ubuntu24/systemd255.
Internal fixture modes are harmless processes, never production service entrypoints.
"""
import argparse
import errno
import fcntl
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import signal
import socket
import stat
import subprocess
import sys
import threading
import time
import uuid

FLOOR = 8589934592
UNIT = Path(__file__).resolve().parents[1] / 'deployment/vps/systemd/stockinsider-web-standalone.service'
WORKFLOW = Path(__file__).resolve().parents[1] / '.github/workflows/parser-runtime-lifecycle-quality.yml'
FROZEN = '7a948b2732c02595fe5100bb10206e99c58401c4f8921a7230fa66da373397a5'
ORIGINAL = 'fa55cd9efbe061e500b405fb5bfc9ea0a89e0d1ad1a915e2b135d25a0d3380cb'
PROPS = 'Id,LoadState,ActiveState,SubState,MainPID,NRestarts,ControlGroup,FragmentPath,RuntimeDirectory,RuntimeDirectoryMode,RuntimeDirectoryPreserve,Restart,UMask'


def digest(b):
    return hashlib.sha256(b).hexdigest()


def write_json(p, value):
    p.write_text(json.dumps(value, sort_keys=True, indent=2) + '\n')


def identity(pid):
    try:
        data = Path(f'/proc/{pid}/stat').read_text().rsplit(')', 1)[1].split()
        return {'pid': pid, 'state': data[0], 'startTicks': int(data[19]),
                'rssBytes': int(data[21]) * os.sysconf('SC_PAGE_SIZE')}
    except FileNotFoundError:
        return None


def quoted(s):
    # Finite generated names and ordinary hosted workspace paths only.
    if not re.fullmatch(r'[-A-Za-z0-9_./]+', str(s)):
        raise ValueError('unsupported_fixture_argument')
    return str(s)


def semantics():
    raw = UNIT.read_bytes()
    if digest(raw) != FROZEN or len(raw) != 1341:
        raise ValueError('frozen_unit_mismatch')
    if digest(raw.replace(b'RuntimeDirectoryPreserve=yes\n', b'', 1)) != ORIGINAL:
        raise ValueError('original_unit_parity')
    keys = ['RuntimeDirectory', 'RuntimeDirectoryMode', 'RuntimeDirectoryPreserve', 'Restart', 'RestartSec', 'UMask']
    found = {}
    section = ''
    for line in raw.decode().splitlines():
        if line.startswith('['):
            section = line
        if section == '[Service]' and '=' in line:
            k, v = line.split('=', 1)
            if k in keys:
                if k in found:
                    raise ValueError('duplicate_semantic_directive')
                found[k] = v
    expected = dict(zip(keys, ['stockinsider', '0750', 'yes', 'on-failure', '5', '0077']))
    if found != expected:
        raise ValueError('unsupported_unit_semantics')
    return found


def fixture_leaf(path):
    leaf = Path(path)
    if leaf.parent != Path('/run') or not re.fullmatch(r'si-rt-[0-9a-f]{32}-(default|preserved)', leaf.name):
        raise ValueError('not_owned_fixture_leaf')
    st = leaf.lstat()
    if (not stat.S_ISDIR(st.st_mode) or st.st_uid != os.getuid() or st.st_gid != os.getgid()
            or stat.S_IMODE(st.st_mode) != 0o750 or leaf.resolve() != leaf):
        raise ValueError('fixture_leaf_identity')
    return leaf


def listener(path, ready):
    # Separate systemd service/PID/FD; no RuntimeDirectory ownership in this unit.
    leaf = fixture_leaf(Path(path).parent)
    ready_path = Path(ready)
    out = ready_path.parent.lstat()
    label = 'default' if leaf.name.endswith('-default') else 'preserved'
    if (Path(path).name != 'parser.sock' or ready_path.name != label + '-listener-ready.json'
            or ready_path.parent.name != 'parser-runtime-lifecycle-evidence'
            or not stat.S_ISDIR(out.st_mode) or out.st_uid != os.getuid()
            or stat.S_IMODE(out.st_mode) != 0o700 or os.path.lexists(ready_path)):
        raise ValueError('fixture_ready_path_identity')
    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    s.bind(path)
    s.listen(4)
    s.settimeout(0.5)
    pending = ready_path.with_suffix('.pending')
    with open(pending, 'x', encoding='utf-8') as f:
        json.dump({'pid': os.getpid(), 'fd': s.fileno(), 'socketFdInode': os.fstat(s.fileno()).st_ino}, f)
        f.flush()
        os.fsync(f.fileno())
    os.replace(pending, ready_path)
    while True:
        try:
            c, _ = s.accept()
        except socket.timeout:
            continue
        with c:
            c.settimeout(1)
            data = b''
            while len(data) < 64:
                part = c.recv(64 - len(data))
                if not part:
                    break
                data += part
            if re.fullmatch(b'[0-9a-f]{64}', data):
                c.sendall(b'ACK:' + data)


def web(path):
    # Only this owned process exits itself. No signal is sent to any web/foreign PID.
    fail = fixture_leaf(path) / 'fail-once'
    while True:
        if fail.exists():
            fail.unlink()
            os._exit(23)
        time.sleep(0.05)


class Lab:
    def __init__(self, output):
        self.output = Path(output).resolve()
        runner_temp = os.environ.get('RUNNER_TEMP')
        if (not runner_temp or self.output.parent != Path(runner_temp).resolve()
                or self.output.name != 'parser-runtime-lifecycle-evidence'):
            raise ValueError('output_must_be_fixed_owned_runner_temp_leaf')
        if self.output.exists():
            raise ValueError('output_must_be_absent')
        quoted(self.output)
        self.output.mkdir(mode=0o700)
        self.events, self.units, self.leaves, self.pids, self.cases = [], {}, [], {}, []
        self.stop_monitor = threading.Event()
        self.violation = None
        self.minimum = {}
        self.peak = 0
        self.deadline = time.monotonic() + 180
        self.cleanup_mode = False
        self.cleanup_deadline = None
        self.command_sessions = {}
        self.lock_fd = None
        self.monitor = None
        self.script = Path(__file__).resolve()
        self.script_hash = digest(self.script.read_bytes())
        self.workflow_hash = digest(WORKFLOW.read_bytes())
        self.uid, self.gid = os.getuid(), os.getgid()
        self.token = 'si-rt-' + uuid.uuid4().hex

    def record(self, kind, **value):
        if len(self.events) >= 1000:
            raise RuntimeError('event_bound')
        self.events.append({'ordinal': len(self.events), 'monotonic': time.monotonic(), 'kind': kind, **value})

    def resources(self):
        for p in [str(self.script.parents[1]), '/tmp']:
            s = os.statvfs(p)
            n = s.f_bavail * s.f_frsize
            self.minimum[p] = min(self.minimum.get(p, n), n)
            if n < FLOOR:
                raise RuntimeError('disk_below_8GiB_floor')
        rss = 0
        owned = {os.getpid(), *self.pids.copy()}
        sessions = set(self.command_sessions.copy())
        process_count = 0
        unit_names = set(self.units.copy())
        for item in Path('/proc').iterdir():
            if not item.name.isdigit():
                continue
            process_count += 1
            if process_count > 4096:
                raise RuntimeError('process_metadata_bound')
            try:
                fields = (item / 'stat').read_text().rsplit(')', 1)[1].split()
                cgroups = (item / 'cgroup').read_text().splitlines()
                in_owned_unit = any(('/system.slice/' + name) == line.split(':', 2)[-1]
                                    or line.split(':', 2)[-1].startswith('/system.slice/' + name + '/')
                                    for line in cgroups for name in unit_names)
                if int(fields[3]) in sessions or in_owned_unit:
                    owned.add(int(item.name))
            except (FileNotFoundError, ProcessLookupError):
                continue
        for pid in owned:
            x = identity(pid)
            if x:
                rss += x['rssBytes']
        self.peak = max(self.peak, rss)
        if rss >= FLOOR:
            raise RuntimeError('owned_sampled_rss_bound')

    def check(self):
        if self.violation:
            raise RuntimeError(self.violation)
        if time.monotonic() >= self.deadline:
            raise TimeoutError('overall_deadline')
        self.resources()

    def monitor_resources(self):
        while not self.stop_monitor.wait(0.1):
            try:
                self.resources()
            except Exception as e:
                self.violation = str(e)
                return

    def run(self, args, allowed_codes=(0,)):
        if not self.cleanup_mode:
            self.check()
        remaining = (self.cleanup_deadline if self.cleanup_mode else self.deadline) - time.monotonic()
        if remaining <= 0:
            raise TimeoutError('command_deadline')
        p = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, start_new_session=True)
        self.pids[p.pid] = identity(p.pid)
        self.command_sessions[p.pid] = True
        end = time.monotonic() + min(12, remaining)
        failure = None
        try:
            while True:
                try:
                    out, err = p.communicate(timeout=0.1)
                    break
                except subprocess.TimeoutExpired:
                    if time.monotonic() >= end:
                        failure = 'owned_command_timeout'
                    elif not self.cleanup_mode and self.violation:
                        failure = self.violation
                    if failure:
                        try:
                            os.killpg(p.pid, signal.SIGTERM)  # Our direct child/session only.
                        except ProcessLookupError:
                            pass
                        try:
                            out, err = p.communicate(timeout=2)
                        except subprocess.TimeoutExpired:
                            try:
                                os.killpg(p.pid, signal.SIGKILL)
                            except ProcessLookupError:
                                pass
                            out, err = p.communicate(timeout=2)
                        break
        finally:
            self.command_sessions.pop(p.pid, None)
        if len(out.encode()) + len(err.encode()) > 32768:
            raise RuntimeError('command_output_bound')
        self.record('command', args=args, exit=p.returncode, stdout=out, stderr=err, interruption=failure)
        if failure:
            raise RuntimeError(failure)
        if p.returncode not in allowed_codes:
            raise RuntimeError('command_failed:' + args[0])
        if not self.cleanup_mode:
            self.check()
        return out

    def ctl(self, *args):
        return self.run(['sudo', '-n', 'systemctl', *args])

    def show(self, name, allow_not_found=False):
        text = self.run(['sudo', '-n', 'systemctl', 'show', name, '--property=' + PROPS],
                        allowed_codes=(0, 1) if allow_not_found else (0,))
        return dict(line.split('=', 1) for line in text.splitlines() if '=' in line)

    def await_state(self, fn, label, seconds=15):
        end = min(time.monotonic() + seconds, self.cleanup_deadline if self.cleanup_mode else self.deadline)
        while time.monotonic() < end:
            if not self.cleanup_mode:
                self.check()
            value = fn()
            if value:
                self.record('observed', label=label, value=value)
                return value
            time.sleep(0.1)  # Polling is not evidence; only fn's actual observation is.
        raise TimeoutError(label)

    def admission(self):
        if platform.system() != 'Linux' or Path('/proc/1/comm').read_text().strip() != 'systemd':
            raise RuntimeError('NOT_READY:Linux_PID1_systemd_required')
        if not ((3, 10) <= sys.version_info[:2] <= (3, 13)):
            raise RuntimeError('NOT_READY:unsupported_python')
        if os.environ.get('GITHUB_ACTIONS') != 'true' or os.environ.get('RUNNER_ENVIRONMENT') != 'github-hosted':
            raise RuntimeError('NOT_READY:hosted_runner_required')
        if Path(os.environ.get('GITHUB_WORKSPACE', '')).resolve() != self.script.parents[1]:
            raise RuntimeError('NOT_READY:workspace_identity')
        self.record('filesystems', paths=[{'path': p, 'realpath': os.path.realpath(p), 'device': os.stat(p).st_dev}
                                         for p in [str(self.script.parents[1]), '/tmp']])
        v = self.run(['systemd-analyze', '--version'])
        if not re.match(r'systemd 255(?:\s|\()', v):
            raise RuntimeError('NOT_READY:systemd255_required')
        self.run(['sudo', '-n', 'true'])
        manager = self.ctl('show', '--property=Version', '--value')
        if not re.match(r'^255(?:[. -]|$)', manager.strip()):
            raise RuntimeError('NOT_READY:system_bus_version')
        self.record('admission', python=sys.version, systemd=v, busVersion=manager, uid=self.uid, gid=self.gid)
        lock = self.output.parent / 'parser-runtime-lifecycle.lock'
        self.lock_fd = os.open(lock, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        if os.fstat(self.lock_fd).st_uid != self.uid:
            raise RuntimeError('NOT_READY:lock_owner')
        fcntl.flock(self.lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        self.monitor = threading.Thread(target=self.monitor_resources, daemon=True)
        self.monitor.start()

    def install_pair(self, label, preserve, fields):
        leaf = Path('/run') / (self.token + '-' + label)
        if os.path.lexists(leaf):
            raise RuntimeError('runtime_leaf_exists')
        self.leaves.append(leaf)
        pair = {}
        for role in ['web', 'listener']:
            name = self.token + '-' + label + '-' + role + '.service'
            dest = Path('/run/systemd/system') / name
            if os.path.lexists(dest):
                raise RuntimeError('fixture_unit_exists')
            ready = self.output / (label + '-listener-ready.json')
            args = [sys.executable, self.script, '--web', leaf] if role == 'web' else [sys.executable, self.script, '--listener', leaf / 'parser.sock', '--ready', ready]
            lines = ['[Unit]', 'Description=Owned parser runtime lifecycle fixture', '[Service]', 'Type=simple',
                     f'User={self.uid}', f'Group={self.gid}', 'UMask=' + fields['UMask'], 'TimeoutStopSec=5', 'KillMode=control-group',
                     'ExecStart=' + ' '.join(quoted(a) for a in args)]
            if role == 'web':
                lines += ['RuntimeDirectory=' + leaf.name, 'RuntimeDirectoryMode=' + fields['RuntimeDirectoryMode'],
                          'Restart=' + fields['Restart'], 'RestartSec=' + fields['RestartSec']]
                if preserve:  # Baseline omits directive, exercising actual default=no.
                    lines += ['RuntimeDirectoryPreserve=' + fields['RuntimeDirectoryPreserve']]
            else:
                lines += ['Restart=no']
            data = ('\n'.join(lines) + '\n').encode()
            src = self.output / name
            src.write_bytes(data)
            self.units[name] = {'dest': str(dest), 'sha256': digest(data), 'text': data.decode(), 'installed': False}
            self.run(['sudo', '-n', 'install', '-o', 'root', '-g', 'root', '-m', '0644', str(src), str(dest)])
            self.units[name]['installed'] = True
            self.verify_unit(name)
            pair[role] = name
        self.ctl('daemon-reload')
        self.ctl('start', pair['web'])
        self.ctl('start', pair['listener'])
        self.await_state(lambda: ready.exists(), 'listener_ready')
        ready_data = json.loads(ready.read_text())
        for name in pair.values():
            state = self.show(name)
            if state['ActiveState'] != 'active' or state['FragmentPath'] != self.units[name]['dest']:
                raise RuntimeError('fixture_identity')
            pid = int(state['MainPID'])
            self.pids[pid] = identity(pid)
        if int(self.show(pair['listener'])['MainPID']) != ready_data['pid']:
            raise RuntimeError('listener_pid_mismatch')
        state = self.show(pair['web'])
        if (state['RuntimeDirectoryPreserve'] != ('yes' if preserve else 'no')
                or state['RuntimeDirectory'] != leaf.name
                or int(state['RuntimeDirectoryMode'], 8) != 0o750
                or int(state['UMask'], 8) != 0o077
                or state['Restart'] != 'on-failure'):
            raise RuntimeError('actual_preserve_mismatch')
        return pair, leaf, ready_data

    def verify_unit(self, name):
        item = self.units[name]
        p = Path(item['dest'])
        s = p.lstat()
        if not stat.S_ISREG(s.st_mode) or s.st_uid != 0 or s.st_gid != 0 or stat.S_IMODE(s.st_mode) != 0o644 or digest(p.read_bytes()) != item['sha256']:
            raise RuntimeError('owned_unit_pin_or_owner')
        if digest(self.script.read_bytes()) != self.script_hash:
            raise RuntimeError('harness_source_changed')

    def socket_state(self, leaf, ready, connect=True):
        proc = identity(ready['pid'])
        if not proc or proc['state'] == 'Z':
            raise RuntimeError('listener_not_alive')
        fd_target = os.readlink(f"/proc/{ready['pid']}/fd/{ready['fd']}")
        if fd_target != f"socket:[{ready['socketFdInode']}]":
            raise RuntimeError('listener_fd_changed')
        out = {'listenerPid': ready['pid'], 'listenerStartTicks': proc['startTicks'], 'fdTarget': fd_target}
        if connect:
            s = (leaf / 'parser.sock').lstat()
            d = leaf.lstat()
            if not stat.S_ISSOCK(s.st_mode) or s.st_uid != self.uid or s.st_gid != self.gid or stat.S_IMODE(s.st_mode) != 0o700:
                raise RuntimeError('socket_metadata')
            if not stat.S_ISDIR(d.st_mode) or d.st_uid != self.uid or d.st_gid != self.gid or stat.S_IMODE(d.st_mode) != 0o750:
                raise RuntimeError('runtime_directory_metadata')
            nonce = uuid.uuid4().hex + uuid.uuid4().hex
            with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as c:
                c.settimeout(2)
                c.connect(str(leaf / 'parser.sock'))
                c.sendall(nonce.encode())
                reply = b''
                while len(reply) < 68:
                    part = c.recv(68 - len(reply))
                    if not part:
                        break
                    reply += part
                if reply != b'ACK:' + nonce.encode():
                    raise RuntimeError('nonce_roundtrip')
            after = (leaf / 'parser.sock').lstat()
            after_proc = identity(ready['pid'])
            if ((after.st_dev, after.st_ino, after.st_mode, after.st_uid, after.st_gid)
                    != (s.st_dev, s.st_ino, s.st_mode, s.st_uid, s.st_gid)
                    or not after_proc or after_proc['startTicks'] != proc['startTicks']
                    or os.readlink(f"/proc/{ready['pid']}/fd/{ready['fd']}") != fd_target):
                raise RuntimeError('roundtrip_identity_changed')
            self.record('nonce_roundtrip', listenerPid=ready['pid'], pathInode=s.st_ino,
                        requestNonce=nonce, requestBytes=64, responseBytes=len(reply),
                        responseSha256=digest(reply), fdTarget=fd_target)
            out.update(pathInode=s.st_ino, uid=s.st_uid, gid=s.st_gid, mode=stat.S_IMODE(s.st_mode), directoryInode=d.st_ino, roundtrip=True)
        return out

    def case(self, label, fn):
        self.check()
        result = fn()
        self.check()
        self.cases.append({'case': label, 'status': 'PASS', **result})
        self.record('case', **self.cases[-1])

    def baseline(self, fields):
        pair, leaf, ready = self.install_pair('default', False, fields)
        before = self.socket_state(leaf, ready)
        self.ctl('stop', pair['web'])
        state = self.show(pair['web'])
        if state['ActiveState'] != 'inactive' or os.path.lexists(leaf):
            raise RuntimeError('baseline_stop_did_not_remove_directory')
        alive = self.socket_state(leaf, ready, False)
        if any(alive[k] != before[k] for k in alive):
            raise RuntimeError('baseline_listener_changed')
        try:
            with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as c:
                c.settimeout(2)
                c.connect(str(leaf / 'parser.sock'))
        except OSError as e:
            if e.errno != errno.ENOENT:
                raise
            observed = {'errno': e.errno, 'error': str(e)}
        else:
            raise RuntimeError('baseline_unexpected_connect_success')
        return {'before': before, 'listenerAfter': alive, 'pathAbsent': True, 'expectedBaselineRed': observed}

    def candidate(self, fields):
        pair, leaf, ready = self.install_pair('preserved', True, fields)
        original = self.socket_state(leaf, ready)
        def preserved():
            value = self.socket_state(leaf, ready)
            if value != original:
                raise RuntimeError('preserved_listener_or_path_changed')
            return value
        def explicit():
            old = int(self.show(pair['web'])['MainPID'])
            self.ctl('stop', pair['web'])
            if self.show(pair['web'])['ActiveState'] != 'inactive':
                raise RuntimeError('web_not_stopped')
            stopped = preserved()
            self.ctl('start', pair['web'])
            new = int(self.show(pair['web'])['MainPID'])
            if not new or new == old:
                raise RuntimeError('web_start_pid')
            self.pids[new] = identity(new)
            return {'stopped': stopped, 'afterStart': preserved(), 'oldWebPid': old, 'newWebPid': new}
        self.case('yes-explicit-stop-start', explicit)
        def manual():
            old = int(self.show(pair['web'])['MainPID'])
            self.ctl('restart', pair['web'])
            new = int(self.show(pair['web'])['MainPID'])
            if not new or new == old:
                raise RuntimeError('manual_restart_pid')
            self.pids[new] = identity(new)
            return {'after': preserved(), 'oldWebPid': old, 'newWebPid': new}
        self.case('yes-manual-restart', manual)
        def automatic():
            prior = self.show(pair['web'])
            old, restarts = int(prior['MainPID']), int(prior['NRestarts'])
            actual_identity = identity(old)
            if not actual_identity or actual_identity['startTicks'] != self.pids[old]['startTicks']:
                raise RuntimeError('owned_web_identity')
            preserved()
            with open(leaf / 'fail-once', 'x', encoding='ascii') as f:
                f.write('owned self-exit once\n')
            def changed():
                state = self.show(pair['web'])
                pid = int(state['MainPID'])
                if state['ActiveState'] == 'active' and pid and pid != old and int(state['NRestarts']) > restarts:
                    self.pids[pid] = identity(pid)
                    return {'pid': pid, 'NRestarts': int(state['NRestarts']), 'ControlGroup': state['ControlGroup']}
                return None
            actual = self.await_state(changed, 'actual_automatic_restart', 20)
            return {'oldWebPid': old, 'restartObservation': actual, 'after': preserved()}
        self.case('yes-automatic-restart', automatic)

    def cleanup(self):
        self.cleanup_mode = True
        self.cleanup_deadline = time.monotonic() + 45
        errors, observations = [], []
        for name, item in reversed(list(self.units.items())):
            try:
                if not item['installed']:
                    if os.path.lexists(item['dest']):
                        raise RuntimeError('partial_install_unknown')
                    continue
                self.verify_unit(name)
                self.ctl('stop', name)
                state = self.show(name)
                if state['ActiveState'] not in ['inactive', 'failed'] or int(state['MainPID']) != 0:
                    raise RuntimeError('unit_not_settled')
                self.ctl('reset-failed', name)
                observations.append({'unit': name, 'state': state})
            except Exception as e:
                errors.append(str(e))
        for pid, original in list(self.pids.items()):
            if not original:
                continue
            try:
                def gone():
                    observed = identity(pid)
                    return observed is None or observed['startTicks'] != original['startTicks']
                self.await_state(gone, 'owned_pid_gone', 5)
                observations.append({'pid': pid, 'originalStartTicks': original['startTicks'], 'originalIdentityGone': True})
            except Exception as e:
                errors.append(str(e))
        if not errors:
            for leaf in self.leaves:
                try:
                    if not os.path.lexists(leaf):
                        continue
                    s = leaf.lstat()
                    if not stat.S_ISDIR(s.st_mode) or s.st_uid != self.uid or leaf.parent != Path('/run') or not leaf.name.startswith(self.token + '-'):
                        raise RuntimeError('runtime_cleanup_identity')
                    for child in leaf.iterdir():
                        cs = child.lstat()
                        if child.name not in ['parser.sock', 'fail-once'] or cs.st_uid != self.uid or not (stat.S_ISSOCK(cs.st_mode) or stat.S_ISREG(cs.st_mode)):
                            raise RuntimeError('unknown_runtime_child')
                        child.unlink()
                    self.run(['sudo', '-n', 'rmdir', '--', str(leaf)])
                except Exception as e:
                    errors.append(str(e))
            for name, item in self.units.items():
                if item['installed']:
                    try:
                        self.verify_unit(name)
                        self.run(['sudo', '-n', 'rm', '--', item['dest']])
                    except Exception as e:
                        errors.append(str(e))
            if self.units:
                try:
                    self.ctl('daemon-reload')
                    for name in self.units:
                        final = self.show(name, allow_not_found=True)
                        if (final.get('LoadState') != 'not-found' or final.get('ActiveState') != 'inactive'
                                or final.get('MainPID', '0') != '0'):
                            raise RuntimeError('unit_still_loaded')
                        observations.append({'unit': name, 'postRemovalState': final})
                except Exception as e:
                    errors.append(str(e))
        absent = all(not os.path.lexists(p) for p in self.leaves) and all(not os.path.lexists(x['dest']) for x in self.units.values())
        self.stop_monitor.set()
        if self.monitor:
            self.monitor.join(timeout=2)
            if self.monitor.is_alive():
                errors.append('monitor_not_settled')
        if self.lock_fd is not None:
            os.close(self.lock_fd)
        return {'confirmed': not errors and absent, 'errors': errors, 'observations': observations, 'runtimeAndUnitPathsAbsent': absent, 'retainedEvidenceDirectory': str(self.output),
                'retainedCoordinationLock': str(self.output.parent / 'parser-runtime-lifecycle.lock')}


    def postrun(self):
        # A second read-only observation, after cleanup, not reuse of cleanup booleans.
        self.cleanup_deadline = time.monotonic() + 15
        observations = []
        self.resources()
        for name, item in self.units.items():
            state = self.show(name, allow_not_found=True)
            if state.get('LoadState') != 'not-found' or state.get('ActiveState') != 'inactive':
                raise RuntimeError('postrun_unit_not_absent_inactive')
            if os.path.lexists(item['dest']):
                raise RuntimeError('postrun_unit_path_present')
            observations.append({'unit': name, 'state': state, 'unitPathAbsent': True})
        for leaf in self.leaves:
            if os.path.lexists(leaf):
                raise RuntimeError('postrun_runtime_path_present')
            observations.append({'runtimePath': str(leaf), 'absent': True})
        for pid, original in self.pids.copy().items():
            current = identity(pid)
            if original and current and current['startTicks'] == original['startTicks']:
                raise RuntimeError('postrun_owned_identity_still_present')
            observations.append({'pid': pid, 'current': current, 'originalIdentityGone': True})
        self.resources()
        return {'confirmed': True, 'observations': observations, 'mutations': 0}


def main(output):
    lab = Lab(output)
    result = {'scope': 'isolated shared runtime lifecycle only, not production unit execution/history causality', 'status': 'NOT_READY', 'cases': [], 'reboot': 'NOT_RUN'}
    try:
        fields = semantics()
        write_json(lab.output / 'source-pins.json', {'harnessSha256': lab.script_hash, 'workflowSha256': digest(WORKFLOW.read_bytes()), 'unitSha256': digest(UNIT.read_bytes()), 'unitBytes': len(UNIT.read_bytes()), 'originalUnitSha256': ORIGINAL, 'selectedSemantics': fields, 'adaptations': ['unique /run leaf and fixture unit names', 'harmless Python ExecStart', 'numeric current runner User/Group', 'listener independent unit without RuntimeDirectory', 'baseline omits Preserve directive', 'production dependencies/credentials/sandbox/paths not executed']})
        lab.admission()
        result['status'] = 'FAIL'
        lab.case('default-no-explicit-stop', lambda: lab.baseline(fields))
        lab.candidate(fields)
    except Exception as e:
        result['error'] = {'type': type(e).__name__, 'message': str(e)}
    finally:
        cleanup = lab.cleanup()
        try:
            postrun = lab.postrun()
        except Exception as e:
            postrun = {'confirmed': False, 'error': str(e)}
        try:
            if (digest(lab.script.read_bytes()) != lab.script_hash
                    or digest(WORKFLOW.read_bytes()) != lab.workflow_hash or digest(UNIT.read_bytes()) != FROZEN):
                raise RuntimeError('final source pins changed')
        except Exception as e:
            result['finalSourcePinError'] = str(e)
        result.update(cases=lab.cases, cleanup=cleanup, postrun=postrun, resourceViolation=lab.violation,
                      minimumFreeBytes=lab.minimum, sampledOwnedPeakRssBytes=lab.peak,
                      sampleIntervalSeconds=0.1, nativeAssertionsOnlyInRun=True)
        if (len(lab.cases) == 4 and 'error' not in result and 'finalSourcePinError' not in result
                and not lab.violation and cleanup['confirmed'] and postrun['confirmed']):
            result['status'] = 'PASS'
        write_json(lab.output / 'fixture-units.json', lab.units)
        write_json(lab.output / 'events.json', lab.events)
        write_json(lab.output / 'receipt.json', result)
    print(json.dumps({'status': result['status'], 'completedCases': len(lab.cases), 'cleanupConfirmed': cleanup['confirmed']}))
    return 0 if result['status'] == 'PASS' else 1


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--run', action='store_true')
    ap.add_argument('--output')
    ap.add_argument('--listener')
    ap.add_argument('--ready')
    ap.add_argument('--web')
    args = ap.parse_args()
    if args.listener and args.ready and not args.run and not args.web:
        listener(args.listener, args.ready)
    elif args.web and not args.run and not args.listener:
        web(args.web)
    elif args.run and args.output and not args.listener and not args.web:
        sys.exit(main(args.output))
    else:
        ap.error('choose exactly one explicit mode')
