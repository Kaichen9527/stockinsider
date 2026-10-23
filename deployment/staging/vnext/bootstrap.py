#!/usr/bin/env python3
"""Account-owner console bootstrap. Default dry-run; no production services/DB.
Creates only a restricted staging management identity and empty isolated paths.
Application/DB setup stays refused until separately verified artifact/config exists.
"""
import argparse
import datetime
import grp
import json
import os
from pathlib import Path
import pwd
import re
import secrets
import subprocess

NAMESPACE = 'stockinsider-vnext-oct22-staging'
USER = 'si-vnext-oct22'
ROOT = Path('/srv') / NAMESPACE
GATEWAY = Path('/usr/local/libexec') / (NAMESPACE + '-gateway')
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
    fs = os.statvfs('/srv')
    available = fs.f_bavail * fs.f_frsize
    mem = {k:int(v.strip().split()[0])*1024 for k,v in (x.split(':',1) for x in Path('/proc/meminfo').read_text().splitlines()) if k=='MemAvailable'}['MemAvailable']
    projected_disk = available - 1073741824 - 536870912 - 134217728 - 2147483648
    projected_memory = mem - 1073741824
    report = dict(mode='DRY_RUN', namespace=NAMESPACE, user=USER, storage=str(ROOT), gateway=str(GATEWAY),
                  projectedDisk=projected_disk, projectedMemory=projected_memory,
                  capacityReady=projected_disk>=16106127360 and projected_memory>=1610612736,
                  productionActions=0, application='NOT_PROVISIONED', database='NOT_PROVISIONED',
                  access='forced read-only preflight command; no sudo/docker/group privileges')
    if not args.apply:
        print(json.dumps(report, indent=2)); return
    if os.geteuid()!=0 or not report['capacityReady']:
        raise SystemExit('root console and full unchanged capacity required')
    if not args.public_key_file or not args.expires_utc:
        raise SystemExit('explicit public key and UTC expiry required')
    key_path=Path(args.public_key_file)
    if key_path.is_symlink() or not key_path.is_file() or key_path.stat().st_size>4096:
        raise SystemExit('regular bounded public-key file required')
    key=key_path.read_text().strip()
    if not re.fullmatch(r'ssh-ed25519 [A-Za-z0-9+/]+={0,2}(?: [A-Za-z0-9_.-]+)?',key):
        raise SystemExit('single ed25519 public key required')
    expires=datetime.datetime.fromisoformat(args.expires_utc.replace('Z','+00:00'))
    now=datetime.datetime.now(datetime.timezone.utc)
    if expires.tzinfo is None or not 0<(expires-now).total_seconds()<=3600:
        raise SystemExit('expiry must be future <=1hour, no permanent key')
    if ROOT.exists() or GATEWAY.exists():
        raise SystemExit('namespace already exists; no overwrite/cleanup')
    try: pwd.getpwnam(USER)
    except KeyError: pass
    else: raise SystemExit('user already exists; no reuse')
    try: grp.getgrnam(USER)
    except KeyError: pass
    else: raise SystemExit('group already exists; no reuse')
    for executable in ['/usr/sbin/useradd','/usr/sbin/chpasswd','/usr/bin/openssl','/usr/bin/python3']:
        if not Path(executable).is_file() or not os.access(executable,os.X_OK):
            raise SystemExit('required system executable unavailable before mutation')
    # No distributed password, sudoers, Docker group, production service or existing DB changes.
    subprocess.run(['/usr/sbin/useradd','--user-group','--no-create-home','--home-dir',str(ROOT),'--shell','/bin/sh',USER],check=True)
    # useradd starts locked on common distributions: unlock with an unretained,
    # cryptographically random password hash via stdin (never argv/log).
    # Only the root-owned expiring forced-command public key is distributed.
    random_password=secrets.token_urlsafe(64)
    hashed=subprocess.run(['/usr/bin/openssl','passwd','-6','-stdin'],input=random_password+'\n',text=True,capture_output=True,check=True).stdout.strip()
    del random_password
    subprocess.run(['/usr/sbin/chpasswd','--encrypted'],input=USER+':'+hashed+'\n',text=True,capture_output=True,check=True)
    del hashed
    user=pwd.getpwnam(USER)
    ROOT.mkdir(mode=0o750); os.chown(ROOT,0,user.pw_gid)
    sshdir=ROOT/'.ssh'; sshdir.mkdir(mode=0o750); os.chown(sshdir,0,user.pw_gid)
    expiry=expires.astimezone(datetime.timezone.utc).strftime('%Y%m%d%H%M%SZ')
    authorized=sshdir/'authorized_keys'
    with authorized.open('x') as f:
        f.write(f'restrict,expiry-time="{expiry}",command="{GATEWAY}" {key}\n')
    authorized.chmod(0o640); os.chown(authorized,0,user.pw_gid)
    GATEWAY.parent.mkdir(mode=0o755,exist_ok=True)
    with GATEWAY.open('xb') as f: f.write(GATEWAY_BYTES)
    GATEWAY.chmod(0o755)
    for leaf in ['database','queue','storage']:
        p=ROOT/leaf; p.mkdir(mode=0o700); os.chown(p,user.pw_uid,user.pw_gid)
    report.update(mode='IDENTITY_AND_EMPTY_NAMESPACE_CREATED',uid=user.pw_uid,expiresUtc=expires.isoformat())
    print(json.dumps(report,indent=2))

if __name__=='__main__': main()
