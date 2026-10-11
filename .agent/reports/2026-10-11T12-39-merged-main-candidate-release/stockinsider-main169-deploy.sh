#!/usr/bin/env bash
set -euo pipefail
umask 077
new=169aad1b6cfa747f78ae3464b614f43c0749d806
old=9fd86fe620ccc63c89c4acd208327bf2c4e15332
root=/opt/stockinsider-standalone/releases
expected_archive=7abffc2bcf78adb1291caac4bcad4cf6bea81f62c6d5cb0abe900bf2cc3b8e01
exec 8>/run/lock/vps-heavy-operation.lock
exec 9>/run/lock/stockinsider-production-write.lock
exec 7>/run/lock/stockinsider-production-health.lock
flock -n 8 || exit 75
flock -n 9 || exit 75
flock -n 7 || exit 75
test "$(readlink -f /opt/stockinsider/current)" = "$root/$old"
test ! -e "$root/$new"
/usr/bin/node "$root/$old/scripts/contabo-host-resource-check.mjs" /proc/self/fd/3 3<<'DEPLOYMENT_BUDGET'
{
  "schema": "stockinsider-capacity-budget-v2",
  "measurementBasis": "One exact prebuilt main169 Linux deployment: manifest 79,290,260 content bytes/2,584 files; 128 MiB disk allocation budget includes per-file block/metadata margin. 27,563,099-byte archive remains in /run RAM and is accounted within unchanged 1 GiB peakMemory. No VPS build, DB restore, new documents or backup staging. Keep unchanged 1 GiB WAL, 0.5 GiB temporary, 2 GiB growth and 15 GiB hard floor.",
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
DEPLOYMENT_BUDGET
/usr/bin/node "$root/$old/scripts/verify-standalone-release.mjs" "$root/$old"
work=$(mktemp -d /run/stockinsider-main169-deploy.XXXXXX)
chmod 0711 "$work"
changed=false
assert_writer() {
  local expected=$1
  [[ "$expected" =~ ^[0-9a-f]{40}$ ]] || return 1
  runuser -u postgres -- env -i PATH=/usr/bin:/bin PGCONNECT_TIMEOUT=5 PGOPTIONS="-c lock_timeout=5000 -c statement_timeout=60000" /usr/bin/psql -h /var/run/postgresql -p 5432 -U postgres -d stockinsider -X -w -A -t -v ON_ERROR_STOP=1 <<SQL
DO \$\$ BEGIN
 IF (SELECT count(*) FROM public.production_writer_releases WHERE active) <> 1
 OR EXISTS (SELECT 1 FROM public.production_writer_releases WHERE active AND (release_id IS DISTINCT FROM '$expected' OR writer_kind IS DISTINCT FROM 'vps')) THEN RAISE EXCEPTION 'active_writer_identity_mismatch'; END IF;
END \$\$;
SELECT json_build_object('releaseId',release_id,'writerKind',writer_kind,'active',active) FROM public.production_writer_releases WHERE active;
SQL
}
finish() {
  rc=$?
  trap - EXIT
  set +e
  if [[ $rc -ne 0 && "$changed" == true ]]; then
    echo 'cutover_failed_attempting_previous_writer_restore' >&2
    rollback_ok=true
    restore_dir=$(mktemp -d /opt/stockinsider/.restore-main169.XXXXXX)
    if [[ -n "$restore_dir" && -d "$restore_dir" ]]; then
      if ln -s "$root/$old" "$restore_dir/current" && mv -Tf "$restore_dir/current" /opt/stockinsider/current; then
        if ! bash "$root/$old/deployment/vps/activate-writer-release.sh" "$old"; then rollback_ok=false; fi
        if ! test "$(readlink -f /opt/stockinsider/current)" = "$root/$old"; then rollback_ok=false; fi
        if ! assert_writer "$old"; then rollback_ok=false; fi
        if ! systemctl is-active --quiet stockinsider-web-standalone stockinsider-internal-worker; then rollback_ok=false; fi
      else rollback_ok=false; fi
      rm -f "$restore_dir/current"
      rmdir "$restore_dir" || rollback_ok=false
    else rollback_ok=false; fi
    if [[ "$rollback_ok" == true ]]; then echo 'previous_writer_restored_and_verified'; else echo 'recovery_required:previous_writer_restore_failed' >&2; fi
  fi
  rm -f "$work/artifact.tar.gz" "$work/migration.sql"
  if ! rmdir "$work"; then echo 'owned_ram_cleanup_failed' >&2; fi
  exit "$rc"
}
trap finish EXIT
/usr/bin/python3 -c 'import os,select,sys,time
expected=27563099
end=time.monotonic()+120
fd=os.open(sys.argv[1],os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
total=0
try:
 while True:
  remaining=end-time.monotonic()
  if remaining<=0 or not select.select([0],[],[],remaining)[0]: raise SystemExit("artifact_stream_deadline")
  b=os.read(0,min(65536,expected-total+1))
  if not b: break
  total+=len(b)
  if total>expected: raise SystemExit("artifact_stream_oversize")
  with memoryview(b) as v:
   while v:
    n=os.write(fd,v);v=v[n:]
 if total!=expected: raise SystemExit("artifact_stream_truncated")
 os.fsync(fd)
finally: os.close(fd)
print("artifact_stream_exact_bytes="+str(total))
' "$work/artifact.tar.gz"
echo "$expected_archive  $work/artifact.tar.gz" | sha256sum -c -
tar --no-same-owner -xzf "$work/artifact.tar.gz" -C "$root"
/usr/bin/node "$root/$new/scripts/verify-standalone-release.mjs" "$root/$new"
test "$(/usr/bin/node -e 'const r=require(process.argv[1]);process.stdout.write(r.manifest.entrypoint)' "$root/$new/release-manifest.json")" = app/server.js
cat > "$work/migration.sql" <<'MIGRATION'
-- The exchange corporate-action feed includes ordinary shares, ETFs and
-- other listed instruments.  Preserve every source row and its v3.1 hash;
-- four-digit ordinary-stock filtering belongs to candidate selection only.
ALTER TABLE public.opportunity_corporate_action_events_v3
  DROP CONSTRAINT IF EXISTS opportunity_corporate_action_events_v3_symbol_check;
ALTER TABLE public.opportunity_corporate_action_events_v3
  ADD CONSTRAINT opportunity_corporate_action_events_v3_symbol_check
  CHECK (symbol ~ '^[0-9A-Za-z]{2,12}$');

-- A frozen roster and calendar make official authority catch-up resumable
-- without presenting a later acquisition as if it were known at the cutoff.
CREATE TABLE IF NOT EXISTS public.entry_plan_authority_runs_v1 (
  run_id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  source_cutoff timestamptz NOT NULL,
  latest_session date NOT NULL,
  roster jsonb NOT NULL CHECK (jsonb_typeof(roster) = 'array'),
  roster_hash text NOT NULL CHECK (roster_hash ~ '^[0-9a-f]{64}$'),
  excluded_symbols jsonb NOT NULL CHECK (jsonb_typeof(excluded_symbols) = 'array'),
  calendar jsonb NOT NULL CHECK (jsonb_typeof(calendar) = 'object'),
  calendar_hash text NOT NULL CHECK (calendar_hash ~ '^[0-9a-f]{64}$'),
  authority_cutoff timestamptz,
  status text NOT NULL DEFAULT 'initializing'
    CHECK (status IN ('initializing','running','complete','failed')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS entry_plan_authority_runs_v1_created
  ON public.entry_plan_authority_runs_v1 (created_at DESC);

CREATE TABLE IF NOT EXISTS public.entry_plan_authority_jobs_v1 (
  run_id uuid NOT NULL REFERENCES public.entry_plan_authority_runs_v1(run_id) ON DELETE RESTRICT,
  job_key text NOT NULL CHECK (char_length(job_key) BETWEEN 5 AND 80),
  kind text NOT NULL CHECK (kind IN ('price_month','action_range')),
  exchange text NOT NULL CHECK (exchange IN ('TWSE','TPEX')),
  symbol text CHECK (symbol IS NULL OR symbol ~ '^[0-9]{4}$'),
  month text CHECK (month IS NULL OR month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  sessions jsonb NOT NULL CHECK (jsonb_typeof(sessions) = 'array'),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','retry','complete','failed')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 5),
  claimed_at timestamptz,
  collected_at timestamptz,
  evidence_hash text CHECK (evidence_hash IS NULL OR evidence_hash ~ '^[0-9a-f]{64}$'),
  source_url text,
  source_urls jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(source_urls) = 'array'),
  accepted_rows integer NOT NULL DEFAULT 0 CHECK (accepted_rows >= 0),
  missing_rows integer NOT NULL DEFAULT 0 CHECK (missing_rows >= 0),
  last_error text,
  completed_at timestamptz,
  PRIMARY KEY (run_id, job_key),
  CHECK ((kind = 'price_month' AND symbol IS NOT NULL AND month IS NOT NULL)
    OR (kind = 'action_range' AND symbol IS NULL AND month IS NULL))
);
CREATE INDEX IF NOT EXISTS entry_plan_authority_jobs_v1_pending
  ON public.entry_plan_authority_jobs_v1 (run_id, status, job_key);
CREATE UNIQUE INDEX IF NOT EXISTS entry_plan_authority_jobs_v1_single_running
  ON public.entry_plan_authority_jobs_v1 ((true)) WHERE status = 'running';

ALTER TABLE public.entry_plan_authority_runs_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entry_plan_authority_jobs_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.entry_plan_authority_runs_v1, public.entry_plan_authority_jobs_v1 FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.entry_plan_authority_runs_v1, public.entry_plan_authority_jobs_v1 TO service_role;
MIGRATION
chmod 0644 "$work/migration.sql"
echo "cc82ac701bb1ac4db4e2fa8880ac77fa9d90e71ca5925e02ca088dd3d3070968  $work/migration.sql" | sha256sum -c -
runuser -u postgres -- env -i PATH=/usr/bin:/bin PGCONNECT_TIMEOUT=5 PGOPTIONS="-c lock_timeout=5000 -c statement_timeout=60000" /usr/bin/psql -h /var/run/postgresql -p 5432 -U postgres -d stockinsider -X -w -A -t -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
 IF current_database()<>'stockinsider' OR current_user<>'postgres' OR current_setting('data_directory')<>'/var/lib/postgresql/17/stockinsider' THEN RAISE EXCEPTION 'database_identity_mismatch'; END IF;
 IF to_regclass('public.entry_plan_authority_runs_v1') IS NOT NULL OR to_regclass('public.entry_plan_authority_jobs_v1') IS NOT NULL THEN RAISE EXCEPTION 'new_schema_already_exists_requires_reconciliation'; END IF;
 IF (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')) <> 3 THEN RAISE EXCEPTION 'required_roles_missing'; END IF;
 IF to_regprocedure('extensions.gen_random_uuid()') IS NULL THEN RAISE EXCEPTION 'uuid_function_missing'; END IF;
END $$;
SQL
runuser -u postgres -- env -i PATH=/usr/bin:/bin PGCONNECT_TIMEOUT=5 PGOPTIONS="-c lock_timeout=5000 -c statement_timeout=60000" /usr/bin/psql -h /var/run/postgresql -p 5432 -U postgres -d stockinsider -X -w -v ON_ERROR_STOP=1 --single-transaction -f "$work/migration.sql"
runuser -u postgres -- env -i PATH=/usr/bin:/bin PGCONNECT_TIMEOUT=5 PGOPTIONS="-c lock_timeout=5000 -c statement_timeout=60000" /usr/bin/psql -h /var/run/postgresql -p 5432 -U postgres -d stockinsider -X -w -A -t -v ON_ERROR_STOP=1 <<'SQL'
DO $$ DECLARE t text; privilege text; BEGIN
 FOREACH t IN ARRAY ARRAY['entry_plan_authority_runs_v1','entry_plan_authority_jobs_v1'] LOOP
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid=('public.'||t)::regclass) THEN RAISE EXCEPTION 'rls_not_enabled'; END IF;
  IF has_table_privilege('anon','public.'||t,'SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege('authenticated','public.'||t,'SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'public_roles_have_access'; END IF;
  FOREACH privilege IN ARRAY ARRAY['SELECT','INSERT','UPDATE'] LOOP
   IF NOT has_table_privilege('service_role','public.'||t,privilege) THEN RAISE EXCEPTION 'service_role_missing_access:%',privilege; END IF;
  END LOOP;
 END LOOP;
END $$;
NOTIFY pgrst, 'reload schema';
SQL
/usr/bin/node "$root/$old/scripts/contabo-host-resource-check.mjs" /proc/self/fd/3 3<<'DEPLOYMENT_BUDGET'
{
  "schema": "stockinsider-capacity-budget-v2",
  "measurementBasis": "One exact prebuilt main169 Linux deployment: manifest 79,290,260 content bytes/2,584 files; 128 MiB disk allocation budget includes per-file block/metadata margin. 27,563,099-byte archive remains in /run RAM and is accounted within unchanged 1 GiB peakMemory. No VPS build, DB restore, new documents or backup staging. Keep unchanged 1 GiB WAL, 0.5 GiB temporary, 2 GiB growth and 15 GiB hard floor.",
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
DEPLOYMENT_BUDGET
cutover_dir=$(mktemp -d /opt/stockinsider/.cutover-main169.XXXXXX)
ln -s "$root/$new" "$cutover_dir/current"
changed=true
mv -Tf "$cutover_dir/current" /opt/stockinsider/current
rmdir "$cutover_dir"
bash "$root/$new/deployment/vps/activate-writer-release.sh" "$new"
systemctl is-active stockinsider-web-standalone stockinsider-internal-worker stockinsider-postgrest postgresql@17-stockinsider stockinsider-financial-parser.socket
curl --fail --silent --show-error --max-time 20 http://127.0.0.1:3100/ > /dev/null
curl --fail --silent --show-error --max-time 20 http://127.0.0.1:3101/api/radar/daily > /dev/null
assert_writer "$new"
readlink -f /opt/stockinsider/current
df -B1 /
changed=false
