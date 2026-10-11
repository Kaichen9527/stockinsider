#!/usr/bin/env python3
"""One user-approved allowlist; no glob, history pruning or shared-cache cleanup."""
import argparse
import datetime
import fcntl
import hashlib
import json
import os
import pathlib
import shutil
import stat
import subprocess

APPROVED = {
    '/var/tmp/stockinsider-30fe8d89b3dba7acb875edc89a87dd18a58d7741.clean.tar.gz':
        '85b015db8326ad090ea3799a80b233cc9894862a296c5bde360dcbc8e3a2897e',
    '/var/tmp/stockinsider-30fe8d89b3dba7acb875edc89a87dd18a58d7741.tar.gz':
        'd25b9c597c4c6c75cef6cb67667e38d5631f62d59300adc302024393e91fef97',
    '/tmp/stockinsider-research-capacity-20260930': None,
    '/tmp/stockinsider-worker-unit-check-20260914': None,
    '/tmp/stockinsider-parser-repair.VXQMr8': None,
}


def members(root):
    if root.is_symlink():
        raise ValueError('symlink_not_allowed')
    result = [root]
    if root.is_dir():
        result.extend(root.rglob('*'))
    for path in result:
        mode = path.lstat().st_mode
        if not (stat.S_ISREG(mode) or stat.S_ISDIR(mode)):
            raise ValueError('non_ordinary_member')
        if stat.S_ISREG(mode) and path != root:
            reviewed_parser_names = {'service.before', 'socket.before', 'arelle-config-root'}
            if path.suffix not in {'.mjs', '.js', '.json', '.sh', '.py', '.service', '.timer', '.socket'} and not (
                    str(root) == '/tmp/stockinsider-parser-repair.VXQMr8' and path.name in reviewed_parser_names):
                raise ValueError('unreviewed_member_type:' + path.name)
            if any(term in path.name.lower() for term in ('secret', 'credential', 'receipt', 'token', '.env')):
                raise ValueError('protected_member:' + path.name)
    return result


def fingerprint(root):
    rows = []
    for path in sorted(members(root)):
        info = path.lstat()
        digest = hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else None
        rows.append([str(path), info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, digest])
    return rows


def references(root):
    needle = str(root)
    hits = []
    for directory in ('/etc/systemd/system', '/etc/nginx', '/etc/cron.d'):
        for path in pathlib.Path(directory).rglob('*'):
            if path.is_file() and not path.is_symlink():
                if needle in path.read_text(errors='replace'):
                    hits.append(str(path))
    for directory in pathlib.Path('/proc').iterdir():
        if not directory.name.isdigit():
            continue
        links = [directory / 'cwd', directory / 'exe']
        try:
            links.extend((directory / 'fd').iterdir())
        except OSError:
            pass
        for path in links:
            try:
                target = os.readlink(path)
                if target == needle or target.startswith(needle + '/'):
                    hits.append(str(path))
            except OSError:
                pass
    if shutil.which('docker'):
        ids = subprocess.run(['docker', 'ps', '-aq'], check=True, capture_output=True, text=True).stdout.split()
        if ids:
            mounts = subprocess.run(['docker', 'inspect', '--format', '{{json .Mounts}}', *ids],
                                    check=True, capture_output=True, text=True).stdout
            for line in mounts.splitlines():
                for mount in json.loads(line):
                    source = mount.get('Source', '')
                    if source == needle or source.startswith(needle + '/') or needle.startswith(source.rstrip('/') + '/'):
                        hits.append('docker_mount:' + source)
    return sorted(set(hits))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    if os.geteuid() != 0:
        raise SystemExit('root_required')
    locks = []
    for name in ('vps-heavy-operation.lock', 'stockinsider-production-write.lock'):
        handle = open('/run/lock/' + name, 'a')
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        locks.append(handle)
    before = shutil.disk_usage('/')
    report = {'observedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'applied': args.apply, 'beforeFreeBytes': before.free, 'items': []}
    for name, expected_hash in APPROVED.items():
        root = pathlib.Path(name)
        row = {'path': name, 'status': 'skipped'}
        try:
            if not root.exists():
                row['reason'] = 'already_absent'
            else:
                identity = fingerprint(root)
                if expected_hash and identity[0][-1] != expected_hash:
                    raise ValueError('approved_hash_changed')
                hits = references(root)
                if hits:
                    raise ValueError('referenced:' + ','.join(hits))
                row['allocatedBytes'] = sum(path.lstat().st_blocks * 512 for path in members(root))
                row['identityHash'] = hashlib.sha256(json.dumps(identity).encode()).hexdigest()
                if args.apply:
                    if fingerprint(root) != identity or references(root):
                        raise ValueError('identity_or_reference_changed')
                    shutil.rmtree(root) if root.is_dir() else root.unlink()
                    row['status'] = 'removed'
                else:
                    row['status'] = 'eligible'
        except (OSError, ValueError, subprocess.SubprocessError) as error:
            row['reason'] = str(error)
        report['items'].append(row)
    report['afterFreeBytes'] = shutil.disk_usage('/').free
    report['removedAllocatedBytes'] = sum(row.get('allocatedBytes', 0) for row in report['items'] if row['status'] == 'removed')
    print(json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    main()
