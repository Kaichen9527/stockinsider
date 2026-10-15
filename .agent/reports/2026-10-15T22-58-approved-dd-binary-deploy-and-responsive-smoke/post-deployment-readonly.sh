#!/usr/bin/env bash
set -euo pipefail
exec 8>/run/lock/vps-heavy-operation.lock
exec 9>/run/lock/stockinsider-production-write.lock
exec 7>/run/lock/stockinsider-production-health.lock
flock -n 8 || exit 75
flock -n 9 || exit 75
flock -n 7 || exit 75
test "$(readlink -f /opt/stockinsider/current)" = /opt/stockinsider-standalone/releases/dd59817f750684b093965f539dd4de466be13077
test "$(readlink -f /opt/stockinsider/previous)" = /opt/stockinsider-standalone/releases/169aad1b6cfa747f78ae3464b614f43c0749d806
date -u +%FT%TZ
runuser -u postgres -- env -i PATH=/usr/bin:/bin PGCONNECT_TIMEOUT=5 /usr/bin/psql -h /var/run/postgresql -p 5432 -U postgres -d stockinsider -X -w -A -t -v ON_ERROR_STOP=1 <<'SQL'
BEGIN READ ONLY;
SET LOCAL statement_timeout='5s';
SET LOCAL lock_timeout='2s';
DO $$ BEGIN
 IF current_database()<>'stockinsider' OR current_user<>'postgres' OR current_setting('data_directory')<>'/var/lib/postgresql/17/stockinsider' THEN RAISE EXCEPTION 'database_identity_mismatch'; END IF;
 IF (SELECT count(*) FROM public.production_writer_releases WHERE active)<>1 OR EXISTS(SELECT FROM public.production_writer_releases WHERE active AND (release_id IS DISTINCT FROM 'dd59817f750684b093965f539dd4de466be13077' OR writer_kind IS DISTINCT FROM 'vps')) THEN RAISE EXCEPTION 'writer_identity_mismatch'; END IF;
END $$;
SELECT json_build_object('observedAt',clock_timestamp(),'activeWriterCount',(SELECT count(*) FROM public.production_writer_releases WHERE active),'activeRelease',(SELECT release_id FROM public.production_writer_releases WHERE active),'leaseRows',(SELECT count(*) FROM public.production_write_leases WHERE lease_key='production-data-plane'),'unexpiredLeaseRows',(SELECT count(*) FROM public.production_write_leases WHERE lease_key='production-data-plane' AND expires_at>clock_timestamp()));
ROLLBACK;
SQL
/usr/bin/python3 -I /run/stockinsider-dd-reviewed-75ao9foq/operator-support.py profile dd59817f750684b093965f539dd4de466be13077
systemctl is-active stockinsider-web-standalone.service stockinsider-internal-worker.service stockinsider-postgrest.service postgresql@17-stockinsider.service stockinsider-financial-parser.socket
curl --fail --silent --show-error --max-time 20 --output /dev/null --write-out 'public_home_status=%{http_code}\n' http://127.0.0.1:3100/
curl --fail --silent --show-error --max-time 20 --output /dev/null --write-out 'worker_radar_status=%{http_code}\n' http://127.0.0.1:3101/api/radar/daily
/usr/bin/python3 -I - <<'PY'
import json,pathlib
assert not pathlib.Path('/run/stockinsider-dd-binary.IMKtOI').exists()
rows=[]
for pid in [2565922,2565923]:
 p=pathlib.Path('/proc')/str(pid)/'stat'
 rows.append({'pid':pid,'present':p.exists()})
assert all(not row['present'] for row in rows)
print(json.dumps({'ownedActivationProcesses':rows,'operatorWorkDirectoryAbsent':True}))
PY
