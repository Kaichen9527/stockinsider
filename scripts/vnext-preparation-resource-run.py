#!/usr/bin/env python3
"""Fixed preparation acceptance supervisor; no arbitrary command or cleanup API."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import sys
import time

FLOOR = 8589934592
RESERVE = {str(Path.cwd()): 268435456, '/tmp': 536870912}
OUTPUT = Path('/tmp/stockinsider-vnext-ci/preparation-resource')
CONTAINER = 'stockinsider-vnext-oct22-worker-08'
IMAGE = 'postgres:17.11-bookworm@sha256:858bb5e98eed02eb8cafbcdc007f9a65d1b613972028944a8ec2133ccaf80d27'
if len(sys.argv) != 1 or os.environ.get('VNEXT_TEST_CONTAINER') != CONTAINER:
    raise SystemExit('closed preparation resource supervisor required')
OUTPUT.mkdir(mode=0o700, exist_ok=False)
now = lambda: datetime.datetime.now(datetime.timezone.utc).isoformat()
free = lambda: {p: os.statvfs(p).f_bavail * os.statvfs(p).f_frsize for p in RESERVE}
initial = free()
if any(initial[p] < FLOOR + reserve for p, reserve in RESERVE.items()):
    (OUTPUT / 'hold.json').write_text(json.dumps({'at': now(), 'freeBytes': initial, 'floor': FLOOR, 'nextWorksetReference': RESERVE, 'notUpperBound': True}) + '\n')
    raise SystemExit('NOT_READY: original floor plus next preparation workset')
node = shutil.which('node')
if not node or subprocess.check_output([node, '--version'], text=True).strip() != 'v22.14.0':
    raise SystemExit('Node22.14 required')
identity = subprocess.check_output(['docker', '--host=unix:///var/run/docker.sock', 'inspect', '--format', '{{.Id}} {{.State.Pid}} {{.Config.Image}} {{index .Config.Labels "codex.task"}} {{.HostConfig.NetworkMode}} {{.HostConfig.Memory}}', CONTAINER], text=True).strip().split()
if len(identity) != 6 or not re.fullmatch('[a-f0-9]{64}', identity[0]) or identity[2:] != [IMAGE, 'stockinsider-vnext-oct22', 'none', '1073741824']:
    raise SystemExit('owned PG identity required')
pg_version = subprocess.check_output(['docker', '--host=unix:///var/run/docker.sock', 'exec', '--user=postgres', identity[0], '/usr/lib/postgresql/17/bin/postgres', '--version'], text=True).strip()
pg_binary = subprocess.check_output(['docker', '--host=unix:///var/run/docker.sock', 'exec', '--user=postgres', identity[0], 'sha256sum', '/usr/lib/postgresql/17/bin/postgres'], text=True).split()[0]
if not pg_version.startswith('postgres (PostgreSQL) 17.11 ') or pg_binary != 'f7d05a9a444dc63d93f6b6e329d31eaebae809e85c8479b5072d8aff595303ed':
    raise SystemExit('original pinned PostgreSQL17.11 binary required')
pg_pid = int(identity[1])
if pg_pid <= 1:
    raise SystemExit('owned PG running PID required')
page = os.sysconf('SC_PAGE_SIZE')

def process(pid):
    fields = Path(f'/proc/{pid}/stat').read_text().rsplit(')', 1)[1].split()
    return {'pid': pid, 'start': fields[19], 'state': fields[0], 'rssBytes': int(fields[21]) * page}

pg_start = process(pg_pid)['start']
seen = {}

def tree(roots):
    pending, result = list(roots), {}
    while pending:
        pid = pending.pop()
        if pid in result:
            continue
        if len(result) >= 4096:
            raise RuntimeError('owned process bound exceeded')
        try:
            info = process(pid)
            result[pid] = info
            seen[(pid, info['start'])] = info
            tasks = list(Path(f'/proc/{pid}/task').iterdir())
            if len(tasks) > 1024:
                raise RuntimeError('owned task bound exceeded')
            for task in tasks:
                try:
                    pending.extend(map(int, (task / 'children').read_text().split()))
                except FileNotFoundError:
                    pass
        except FileNotFoundError:
            pass
    return result

command = [node, '--experimental-strip-types', 'scripts/vnext-preparation-http.test.mjs']
started, samples, peak, violation = now(), [], 0, None
child = subprocess.Popen(command, start_new_session=True)
while child.poll() is None:
    try:
        capacity = free()
        owned = tree([os.getpid(), pg_pid])
        if pg_pid not in owned or owned[pg_pid]['start'] != pg_start:
            raise RuntimeError('owned PG identity changed')
        rss = sum(p['rssBytes'] for p in owned.values())
        peak = max(peak, rss)
        samples.append({'at': now(), 'freeBytes': capacity, 'sampledOwnedRssBytes': rss})
        if min(capacity.values()) < FLOOR or rss >= FLOOR:
            violation = {'kind': 'original_resource_limit', 'sample': samples[-1]}
        elif len(samples) > 1140:
            violation = {'kind': 'test_containment_deadline'}
    except (OSError, ValueError, RuntimeError) as error:
        violation = {'kind': 'resource_observation_unknown', 'errorType': type(error).__name__}
    if violation:
        # Only the fresh child session; PG is stopped by the owned CI trap.
        try:
            os.killpg(child.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        try:
            child.wait(timeout=5)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(child.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            child.wait(timeout=5)
        break
    time.sleep(0.5)
code = child.wait()
post = []
for (pid, start), before in seen.items():
    try:
        current = process(pid)
        post.append({'pid': pid, 'originalStart': start, 'sameProcess': current['start'] == start, 'state': current['state'], 'rssBytes': current['rssBytes'], 'scope': 'PG still owned/running until outer trap' if pid == pg_pid else 'supervisor still active' if pid == os.getpid() else 'observed; zombie is not absent'})
    except FileNotFoundError:
        post.append({'pid': pid, 'originalStart': start, 'absent': True})
result = {'command': command, 'start': started, 'end': now(), 'exit': code, 'initialFree': initial, 'finalFree': free(), 'floor': FLOOR, 'nextWorksetReference': RESERVE, 'referenceNotUpperBound': True, 'sampledNotInstantaneous': True, 'sampledNodeAndOwnedPgTreePeakRssBytes': peak, 'resourceViolation': violation, 'samples': samples, 'processPostObservation': post, 'ownedPg': {'containerId': identity[0], 'pid': pg_pid, 'start': pg_start, 'image': IMAGE, 'actualVersion': pg_version, 'actualBinarySha256': pg_binary}, 'nodeSha256': hashlib.file_digest(open(node, 'rb'), 'sha256').hexdigest(), 'cleanup': 'test finally plus outer exact-owned-container trap; no data removal'}
(OUTPUT / 'receipt.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({key: value for key, value in result.items() if key not in ('samples', 'processPostObservation')}))
raise SystemExit(3 if violation else code)
