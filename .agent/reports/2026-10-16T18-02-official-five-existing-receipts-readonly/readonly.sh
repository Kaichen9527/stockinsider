#!/usr/bin/env bash
set -euo pipefail
exec 8>/run/lock/vps-heavy-operation.lock
exec 9>/run/lock/stockinsider-production-write.lock
exec 7>/run/lock/stockinsider-production-health.lock
flock -n 8 || exit 75
flock -n 9 || exit 75
flock -n 7 || exit 75
test "$(readlink -f /opt/stockinsider/current)" = /opt/stockinsider-standalone/releases/dd59817f750684b093965f539dd4de466be13077
/usr/bin/python3 -I - <<'PY'
import json,os,datetime
s=os.statvfs('/opt/stockinsider/current');m={}
for line in open('/proc/meminfo'):
 if line.startswith('MemAvailable:'):m['memAvailableBytes']=int(line.split()[1])*1024
print(json.dumps({'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'currentRelease':'dd59817f750684b093965f539dd4de466be13077','filesystemAvailableBytes':s.f_bavail*s.f_frsize,**m,'scope':'readonly observation, not full heavy capacity admission'}))
PY
runuser -u postgres -- env -i PATH=/usr/bin:/bin PGCONNECT_TIMEOUT=5 /usr/bin/psql -h /var/run/postgresql -p 5432 -U postgres -d stockinsider -X -w -A -t -v ON_ERROR_STOP=1 <<'SQL'
BEGIN READ ONLY;
SET LOCAL statement_timeout='5s';
SET LOCAL lock_timeout='2s';
DO $$ BEGIN
 IF current_database()<>'stockinsider' OR current_user<>'postgres' OR current_setting('data_directory')<>'/var/lib/postgresql/17/stockinsider' THEN RAISE EXCEPTION 'database_identity_mismatch';END IF;
 IF (SELECT count(*) FROM public.production_writer_releases WHERE active)<>1 OR EXISTS(SELECT FROM public.production_writer_releases WHERE active AND (release_id IS DISTINCT FROM 'dd59817f750684b093965f539dd4de466be13077' OR writer_kind IS DISTINCT FROM 'vps')) THEN RAISE EXCEPTION 'writer_identity_mismatch';END IF;
 IF EXISTS(SELECT FROM public.production_write_leases WHERE lease_key='production-data-plane') THEN RAISE EXCEPTION 'data_plane_lease_not_empty';END IF;
 IF (SELECT count(*) FROM public.candidate_financial_acquisition_jobs_v4 j JOIN public.stocks s ON s.id=j.stock_id WHERE (s.symbol,j.job_id) IN (('1735','112d488f-9363-4bbe-824b-f1ddb5cad4c1'::uuid),('1786','2ccb561e-7a1f-4c37-8850-58dbdd3d3b04'::uuid),('2324','996035f8-fbcd-46a3-8a38-93dcc61146e2'::uuid),('2327','8ad5b86e-183e-4ebe-9103-b595cb03a378'::uuid),('2385','eaae1286-50cd-488e-af23-bf9d60ebc759'::uuid)) AND j.endpoint_key='issuer_ir_document' AND j.period_end='2026-06-30'::date AND j.source_url='https://mopsov.twse.com.tw/server-java/t164sb01?step=1&CO_ID='||s.symbol||'&REPORT_ID=C')<>5 THEN RAISE EXCEPTION 'original_five_identity_mismatch';END IF;
END $$;
SELECT json_build_object('databaseObservedAt',clock_timestamp(),'serverVersionNum',current_setting('server_version_num'),'activeWriterCount',(SELECT count(*) FROM public.production_writer_releases WHERE active),'activeRelease',(SELECT release_id FROM public.production_writer_releases WHERE active),'dataPlaneLeaseRows',(SELECT count(*) FROM public.production_write_leases WHERE lease_key='production-data-plane'));
WITH original(symbol,job_id) AS (VALUES ('1735','112d488f-9363-4bbe-824b-f1ddb5cad4c1'::uuid),('1786','2ccb561e-7a1f-4c37-8850-58dbdd3d3b04'::uuid),('2324','996035f8-fbcd-46a3-8a38-93dcc61146e2'::uuid),('2327','8ad5b86e-183e-4ebe-9103-b595cb03a378'::uuid),('2385','eaae1286-50cd-488e-af23-bf9d60ebc759'::uuid)), summary AS (
 SELECT o.symbol,j.job_id,j.period_end,j.status,j.source_url,
 (SELECT count(*) FROM public.candidate_financial_document_job_links_v9 l WHERE l.job_id=j.job_id) AS linked_receipt_count,
 COALESCE((SELECT json_agg(json_build_object('receiptId',r.receipt_id,'originalAcquisitionJobId',r.acquisition_job_id,'receiptStatus',r.receipt_status,'parserStatus',r.parser_status,'documentSha256',r.document_sha256,'byteLength',r.byte_length,'addedFactCounter',r.added_fact_count,'duplicateFactCounter',r.duplicate_fact_count,'acceptedAt',r.accepted_at,'completedAt',r.completed_at,'actualProvenanceFactCount',(SELECT count(DISTINCT p.fact_id) FROM public.candidate_financial_fact_provenance_v4 p JOIN public.opportunity_financial_facts_v3 f ON f.fact_id=p.fact_id WHERE p.issuer_document_id=r.issuer_document_id AND p.source_sha256=r.document_sha256),'actualValidationReceiptCount',(SELECT count(*) FROM public.official_financial_validation_receipts v WHERE v.source_sha256=r.document_sha256)) ORDER BY r.accepted_at,r.receipt_id) FROM public.candidate_financial_document_receipts_v6 r WHERE r.stock_id=j.stock_id AND r.period_end=j.period_end),'[]'::json) AS same_stock_period_receipts
 FROM original o JOIN public.candidate_financial_acquisition_jobs_v4 j ON j.job_id=o.job_id)
SELECT json_build_object('originalFive',json_agg(row_to_json(summary) ORDER BY symbol)) FROM summary;
ROLLBACK;
SQL
