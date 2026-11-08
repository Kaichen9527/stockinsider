#!/usr/bin/env python3
"""Capacity dry-run and retained gateway source; host apply is not admitted.
The isolated SSH daemon's absolute authorized-file binding is unobserved.
No account, authorization file, daemon configuration or service is changed.
"""
import argparse
import json
import os
from pathlib import Path

NAMESPACE = 'stockinsider-vnext-oct22-staging'
USER = 'si-vnext-oct22'
ROOT = Path('/srv') / NAMESPACE
GATEWAY = Path('/usr/local/libexec') / (NAMESPACE + '-gateway')
# Keep this stdlib-only CLI compatible with Python's isolated (-I) mode.
# Source parity with authorized_key_path.py is checked offline.
HOST_AUTHORIZED_KEYS_FILE = '/run/stockinsider-vnext-staging-auth/authorized_keys'
GATEWAY_BYTES = b'''#!/bin/sh
set -eu
case "${SSH_ORIGINAL_COMMAND:-}" in
vnext-preflight-v1)
exec /usr/bin/python3 -I - <<'EOF'
import os,json
from pathlib import Path
s=os.statvfs('/srv/stockinsider-vnext-oct22-staging')
m={k:int(v.strip().split()[0])*1024 for k,v in (x.split(':',1) for x in Path('/proc/meminfo').read_text().splitlines()) if k=='MemAvailable'}
p=Path('/srv/stockinsider-vnext-oct22-staging')
print(json.dumps({'namespace':'stockinsider-vnext-oct22-staging','uid':os.getuid(),'diskAvailable':s.f_bavail*s.f_frsize,'memoryAvailable':m['MemAvailable'],'storageOwner':p.stat().st_uid,'scope':'read-only staging preflight only','stdinIsTty':os.isatty(0),'applicationIsolation':'NOT_PROVISIONED','databaseIsolation':'NOT_PROVISIONED'}))
EOF
;;
*) echo 'staging_scope_rejected' >&2; exit 126;;
esac
'''

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--apply', action='store_true')
    ap.add_argument('--public-key-file')
    ap.add_argument('--expires-utc')
    args = ap.parse_args()
    # Unconditional source barrier BEFORE capacity, public-file access, account
    # lookup or key processing. Caller metadata/paths cannot establish the
    # separately configured isolated daemon binding. No old apply fallback.
    if args.apply:
        raise SystemExit('isolated_sshd_host_apply_not_admitted')
    fs = os.statvfs('/srv')
    available = fs.f_bavail * fs.f_frsize
    mem = {k:int(v.strip().split()[0])*1024 for k,v in (x.split(':',1) for x in Path('/proc/meminfo').read_text().splitlines()) if k=='MemAvailable'}['MemAvailable']
    projected_disk = available - 1073741824 - 536870912 - 134217728 - 2147483648
    projected_memory = mem - 1073741824
    report = dict(mode='DRY_RUN', namespace=NAMESPACE, user=USER, storage=str(ROOT), gateway=str(GATEWAY),
                  projectedDisk=projected_disk, projectedMemory=projected_memory,
                  capacityReady=projected_disk>=16106127360 and projected_memory>=1610612736,
                  productionActions=0, application='NOT_PROVISIONED', database='NOT_PROVISIONED',
                  authorizedKeysPathIntent=HOST_AUTHORIZED_KEYS_FILE,
                  authorizedKeysPathState='INTENT_ONLY', isolatedSshdBinding='NOT_OBSERVED',
                  hostApplyAdmitted=False,
                  access='forced read-only preflight command; no sudo/docker/group privileges')
    print(json.dumps(report, indent=2))

if __name__=='__main__': main()
