#!/usr/bin/env bash
# UNEXECUTED CANDIDATE: fixed manual DD procedure. Requires independent review and fresh admission.
# No migration; SIGKILL/power loss require manual reconciliation.
set -euo pipefail
umask 077
[[ $EUID -eq 0 && $# -eq 0 ]] || exit 64
old=169aad1b6cfa747f78ae3464b614f43c0749d806
new=dd59817f750684b093965f539dd4de466be13077
root=/opt/stockinsider-standalone/releases
current=/opt/stockinsider/current
previous=/opt/stockinsider/previous
archive_sha=398e71768ea0e7a5935282432c0edfcb2f47c953712b715562def95c3745add4
manifest_sha=344489589e929158a73d658c968128a563dd53ed9a5eac6b37ee89553b9a0a4a
activation_sha=0719de5667f23f571357f2db7750297de7f7f405d2d8c06bc2d39105b237e243
candidate_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
support=$candidate_dir/operator-support.py
# These candidate bytes must be staged as root-owned, non-writable-by-others files.
/usr/bin/python3 -I - "$candidate_dir" <<'TRUST'
import os,pathlib,stat,sys
p=pathlib.Path(sys.argv[1])
for directory in [p,*p.parents]:
 s=os.lstat(directory);assert stat.S_ISDIR(s.st_mode) and s.st_uid==0 and not(s.st_mode&0o022)
for name in ['deploy.sh','operator-support.py','unit-profile.json']:
 s=os.lstat(p/name);assert stat.S_ISREG(s.st_mode) and s.st_nlink==1 and s.st_uid==0 and not(s.st_mode&0o022)
TRUST
echo 'f0fcfb7b6286bf01e0ce40d0a02d960e171c3459947b2d771d976685a6dee4af  '"$support" | sha256sum -c -
echo '4bcbf42abefa3cba29114d49c7601a0186ca0df25cf1c51ba72d87a2dfa12b72  '"$candidate_dir/unit-profile.json" | sha256sum -c -
exec 8>/run/lock/vps-heavy-operation.lock
exec 9>/run/lock/stockinsider-production-write.lock
exec 7>/run/lock/stockinsider-production-health.lock
flock -n 8 || exit 75
flock -n 9 || exit 75
flock -n 7 || exit 75
test "$(readlink -f "$current")" = "$root/$old"
test ! -e "$root/$new"
test ! -L "$root/$new"
previous_before=
if [[ -e "$previous" || -L "$previous" ]]; then
  test -L "$previous"
  previous_before=$(readlink -f "$previous")
  [[ "$previous_before" =~ ^/opt/stockinsider-standalone/releases/[a-f0-9]{40}$ ]]
  test -d "$previous_before"
fi
capacity() {
  /usr/bin/node "$root/$old/scripts/contabo-host-resource-check.mjs" /proc/self/fd/3 3<<'BUDGET'
{
  "schema": "stockinsider-capacity-budget-v2",
  "measurementBasis": "Exact approved prebuilt DD Linux package:79354761 content bytes/2586 plus600997-byte manifest;79955758 regular bytes/2587 files.27574426-byte archive stays in RAM. Unchanged128MiB deployment allocation,1GiB peak memory,1GiB WAL,0.5GiB temporary,2GiB growth,15GiB hardfloor. No VPS build, DB migration/restore, source ingestion or backup staging.",
  "databaseRestoreBytes": 0,
  "documentBytes": 0,
  "peakWalBytes": 1073741824,
  "peakTemporaryBytes": 536870912,
  "deploymentBytes": 134217728,
  "localBackupStagingBytes": 0,
  "growthReserveBytes": 2147483648,
  "peakMemoryBytes": 1073741824,
  "minimumAvailableMemoryBytes": 1610612736
}
BUDGET
}
writer() {
  local expected=$1 require_empty_lease=$2
  [[ "$expected" =~ ^[a-f0-9]{40}$ && "$require_empty_lease" =~ ^(true|false)$ ]]
  runuser -u postgres -- env -i PATH=/usr/bin:/bin PGCONNECT_TIMEOUT=5 \
    /usr/bin/psql -h /var/run/postgresql -p 5432 -U postgres -d stockinsider -X -w -A -t -v ON_ERROR_STOP=1 <<SQL
BEGIN READ ONLY;
SET LOCAL statement_timeout='5s';
SET LOCAL lock_timeout='2s';
DO \$\$ BEGIN
 IF current_database()<>'stockinsider' OR current_user<>'postgres'
 OR current_setting('data_directory')<>'/var/lib/postgresql/17/stockinsider' THEN RAISE EXCEPTION 'database_identity_mismatch'; END IF;
 IF (SELECT count(*) FROM public.production_writer_releases WHERE active)<>1
 OR EXISTS(SELECT FROM public.production_writer_releases WHERE active AND
 (release_id IS DISTINCT FROM '$expected' OR writer_kind IS DISTINCT FROM 'vps')) THEN RAISE EXCEPTION 'active_writer_identity_mismatch'; END IF;
 IF $require_empty_lease AND EXISTS(SELECT FROM public.production_write_leases WHERE lease_key='production-data-plane') THEN RAISE EXCEPTION 'deployment_requires_empty_data_plane_lease'; END IF;
END \$\$;
SELECT json_build_object('releaseId',release_id,'writerKind',writer_kind,'active',active)
FROM public.production_writer_releases WHERE active;
ROLLBACK;
SQL
}
set_pointer() {
  local name=$1 target=$2 stage
  [[ "$name" =~ ^(current|previous)$ && "$target" =~ ^/opt/stockinsider-standalone/releases/[a-f0-9]{40}$ ]]
  stage=$(mktemp -d /opt/stockinsider/.dd-pointer.XXXXXX)
  if ln -s "$target" "$stage/$name" && mv -Tf "$stage/$name" "/opt/stockinsider/$name"; then
    rmdir "$stage"
  else
    rm -f "$stage/$name"
    rmdir "$stage"
    return 1
  fi
}
capacity
writer "$old" true
/usr/bin/node "$root/$old/scripts/verify-standalone-release.mjs" "$root/$old"
systemctl is-active --quiet stockinsider-web-standalone stockinsider-internal-worker \
  stockinsider-postgrest postgresql@17-stockinsider stockinsider-financial-parser.socket
/usr/bin/python3 -I "$support" profile "$old"
work=$(mktemp -d /run/stockinsider-dd-binary.XXXXXX)
changed=false
previous_changed=false
activation_pid=
activation_receipt=
interrupted=0
finishing=false
activation_complete=false
activation_uncertain=false
starting_activation=false
on_signal() {
  interrupted=$1
  # Defer exit across background spawn -> PID registration; never lose child ownership.
  [[ "$starting_activation" == true ]] && return
  exit "$1"
}
settle_activation() {
  [[ -n "$activation_pid" ]] || return 0
  # wait may itself be interrupted. Never reverse while this owned supervisor is live.
  while :; do
    if wait "$activation_pid"; then :; else :; fi
    if ! kill -0 "$activation_pid" 2>/dev/null; then break; fi
  done
  if ! /usr/bin/python3 -I "$support" settled "$activation_receipt" "$activation_pid"; then
    activation_uncertain=true
    echo 'activation_settlement_uncertain:manual_reconciliation_required' >&2
    return 125
  fi
  activation_pid=
}
activate_owned() {
  local release=$1 direction=$2
  [[ "$release" == "$old" || "$release" == "$new" ]] || return 64
  [[ "$direction" == forward || "$direction" == reverse ]] || return 64
  [[ -z "$activation_pid" ]] || return 125
  activation_receipt=$work/$direction.json
  starting_activation=true
  /usr/bin/python3 -I "$support" activate "$release" "$activation_receipt" &
  activation_pid=$!
  starting_activation=false
  if [[ $interrupted -ne 0 && "$finishing" == false ]]; then return "$interrupted"; fi
  settle_activation
}
cleanup_work() {
  local ok=true name
  for name in artifact.tar.gz forward.json reverse.json; do
    rm -f -- "$work/$name" || ok=false
  done
  rmdir -- "$work" || ok=false
  [[ "$ok" == true ]]
}
finish() {
  local rc=$? recovery_ok=true cleanup_ok=true
  [[ "$finishing" == false ]] || return
  finishing=true
  trap - EXIT
  # Further catchable signals only record interruption; no reentrant recovery.
  trap 'interrupted=129' HUP
  trap 'interrupted=130' INT
  trap 'interrupted=143' TERM
  set +e
  if [[ $interrupted -ne 0 && $rc -eq 0 ]]; then rc=$interrupted; fi
  # Supervisor waits for natural child/group settlement. Forced/uncertain settlement
  # cannot authorize a reverse activation (including external systemd/API effects).
  settle_activation || recovery_ok=false
  if [[ "$activation_uncertain" == true ]]; then recovery_ok=false; fi
  if [[ $rc -ne 0 && "$changed" == true && "$recovery_ok" == true ]]; then
    if set_pointer current "$root/$old"; then
      activate_owned "$old" reverse || recovery_ok=false
      if [[ "$recovery_ok" == true ]]; then
        /usr/bin/python3 -I "$support" profile "$old" || recovery_ok=false
        test "$(readlink -f "$current")" = "$root/$old" || recovery_ok=false
        writer "$old" false || recovery_ok=false
        systemctl is-active --quiet stockinsider-web-standalone stockinsider-internal-worker || recovery_ok=false
        curl --fail --silent --show-error --max-time 20 http://127.0.0.1:3100/ >/dev/null || recovery_ok=false
        curl --fail --silent --show-error --max-time 20 http://127.0.0.1:3101/api/radar/daily >/dev/null || recovery_ok=false
      fi
    else recovery_ok=false; fi
    if [[ "$previous_changed" == true && "$recovery_ok" == true ]]; then
      if [[ -n "$previous_before" ]]; then
        set_pointer previous "$previous_before" || recovery_ok=false
        test "$(readlink -f "$previous")" = "$previous_before" || recovery_ok=false
      elif [[ -L "$previous" && "$(readlink -f "$previous")" == "$root/$old" ]]; then
        rm -f "$previous" || recovery_ok=false
        [[ ! -e "$previous" && ! -L "$previous" ]] || recovery_ok=false
      else recovery_ok=false; fi
    fi
    if [[ "$recovery_ok" == true ]]; then echo 'canonical_previous_current_writer_units_and_health_restored'; fi
  fi
  if [[ "$recovery_ok" == false ]]; then
    echo "recovery_required:uncertain_state; owned_receipts_retained=$work" >&2
    [[ $rc -ne 0 ]] || rc=125
  else
    cleanup_work || cleanup_ok=false
    if [[ "$cleanup_ok" == false ]]; then
      echo "activation_complete=$activation_complete; owned_cleanup_unconfirmed" >&2
      [[ $rc -ne 0 ]] || rc=74
    fi
  fi
  if [[ $interrupted -ne 0 && $rc -eq 0 ]]; then rc=$interrupted; fi
  if [[ $rc -eq 0 && "$activation_complete" == true && "$cleanup_ok" == true ]]; then
    echo 'approved_dd_binary_current_writer_core_health_and_cleanup_verified'
  fi
  exit "$rc"
}
trap 'on_signal 129' HUP
trap 'on_signal 130' INT
trap 'on_signal 143' TERM
trap finish EXIT
/usr/bin/python3 -c 'import os,select,sys,time
expected=27574426
end=time.monotonic()+120
fd=os.open(sys.argv[1],os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
total=0
try:
 while True:
  remaining=end-time.monotonic()
  if remaining<=0 or not select.select([0],[],[],remaining)[0]: raise SystemExit('"'"'artifact_stream_deadline'"'"')
  b=os.read(0,min(65536,expected-total+1))
  if not b: break
  total+=len(b)
  if total>expected: raise SystemExit('"'"'artifact_stream_oversize'"'"')
  with memoryview(b) as v:
   while v:
    n=os.write(fd,v);v=v[n:]
 if total!=expected: raise SystemExit('"'"'artifact_stream_truncated'"'"')
 os.fsync(fd)
finally: os.close(fd)
print('"'"'artifact_stream_exact_bytes='"'"'+str(total))' "$work/artifact.tar.gz"
echo "$archive_sha  $work/artifact.tar.gz" | sha256sum -c -
/usr/bin/python3 - "$work/artifact.tar.gz" "$new" <<'PY'
import sys,tarfile,pathlib
with tarfile.open(sys.argv[1],'r:gz') as tar:
 rows=tar.getmembers();assert len(rows)==3101
 names=set();regular=0;size=0
 for member in rows:
  p=pathlib.PurePosixPath(member.name)
  assert not p.is_absolute() and p.parts and p.parts[0]==sys.argv[2] and '..' not in p.parts
  assert member.name not in names;names.add(member.name)
  assert member.isdir() or member.isreg()
  if member.isreg():regular+=1;size+=member.size
 assert regular==2587 and size==79955758
print('approved_archive_structure_verified')
PY
tar --no-same-owner -xzf "$work/artifact.tar.gz" -C "$root"
/usr/bin/node "$root/$new/scripts/verify-standalone-release.mjs" "$root/$new"
/usr/bin/node - "$root/$new/release-manifest.json" "$new" "$manifest_sha" <<'JS'
const fs=require('node:fs'),assert=require('node:assert/strict');
const r=JSON.parse(fs.readFileSync(process.argv[2],'utf8')),m=r.manifest;
assert.equal(r.manifestSha256,process.argv[4]);
assert.equal(m.sourceCommit,process.argv[3]);assert.equal(m.packagerCommit,process.argv[3]);
assert.equal(m.releaseId,process.argv[3]);assert.equal(m.entrypoint,'app/server.js');
assert.equal(m.fileCount,2586);assert.equal(m.bytes,79354761);
JS
echo "$activation_sha  $root/$new/deployment/vps/activate-writer-release.sh" | sha256sum -c -
capacity
test "$(readlink -f "$current")" = "$root/$old"
writer "$old" true
/usr/bin/python3 -I "$support" profile "$old"
changed=true
set_pointer current "$root/$new"
activate_owned "$new" forward
/usr/bin/python3 -I "$support" profile "$new"
systemctl is-active --quiet stockinsider-web-standalone stockinsider-internal-worker \
  stockinsider-postgrest postgresql@17-stockinsider stockinsider-financial-parser.socket
curl --fail --silent --show-error --max-time 20 http://127.0.0.1:3100/ >/dev/null
curl --fail --silent --show-error --max-time 20 http://127.0.0.1:3101/api/radar/daily >/dev/null
writer "$new" false
test "$(readlink -f "$current")" = "$root/$new"
previous_changed=true
set_pointer previous "$root/$old"
test "$(readlink -f "$previous")" = "$root/$old"
df -B1 --output=size,avail /opt/stockinsider-standalone
activation_complete=true
changed=false
