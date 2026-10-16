#!/usr/bin/env bash
set -euo pipefail
umask 077
exec 8>/run/lock/vps-heavy-operation.lock
exec 9>/run/lock/stockinsider-production-write.lock
exec 7>/run/lock/stockinsider-production-health.lock
flock -n 8 || exit 75
flock -n 9 || exit 75
flock -n 7 || exit 75
test "$(readlink -f /opt/stockinsider/current)" = /opt/stockinsider-standalone/releases/dd59817f750684b093965f539dd4de466be13077
/usr/bin/python3 -I - <<'PY'
import datetime,hashlib,json,os,pathlib,stat,subprocess,urllib.request,urllib.error
root=pathlib.Path('/tmp/stockinsider-official-2327-oct16-5z7lycns');assert root.is_dir() and not root.is_symlink() and stat.S_IMODE(root.stat().st_mode)==0o700
release=pathlib.Path('/opt/stockinsider/current').resolve();assert str(release)=='/opt/stockinsider-standalone/releases/dd59817f750684b093965f539dd4de466be13077'
m=json.loads((release/'release-manifest.json').read_text())['manifest'];assert hashlib.sha256(json.dumps(m,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()=='344489589e929158a73d658c968128a563dd53ed9a5eac6b37ee89553b9a0a4a'
for name,h in [('scripts/contabo-host-resource-check.mjs','27f042bdbe34e3ca3dd8f4527c39d99746b60acedffd6f526e38a96120608fde'),('scripts/contabo-capacity-guard.mjs','8b33b9f19a4d72b7ce2fab173a97dc9e3172774af9ce5de154d01f239f1c741c')]:assert hashlib.sha256((release/name).read_bytes()).hexdigest()==h
budget={'databaseRestoreBytes':0,'documentBytes':1528880,'peakWalBytes':1073741824,'peakTemporaryBytes':536870912,'deploymentBytes':134217728,'localBackupStagingBytes':0,'growthReserveBytes':2147483648,'peakMemoryBytes':1073741824,'minimumAvailableMemoryBytes':1610612736}
budgetpath=root/'worker-oct17-1620-budget.json';assert not budgetpath.exists();budgetpath.write_text(json.dumps(budget)+'\n');os.chmod(budgetpath,0o600)
result={'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'receiptId':'c5b6ccf0-25d5-4fa3-b257-4f0b194c0090','workerAttempts':0,'uploadAttempts':0,'outcomeUncertain':False}
def cap(label):
 c=subprocess.run(['/usr/bin/node',str(release/'scripts/contabo-host-resource-check.mjs'),str(budgetpath)],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=15);(root/(label+'.stdout')).write_bytes(c.stdout);(root/(label+'.stderr')).write_bytes(c.stderr);a=json.loads(c.stdout);result[label]={'actualExit':c.returncode,'result':a}
 if c.returncode or a.get('allowed') is not True:raise RuntimeError('capacity_not_ready')
try:
 cap('worker-oct17-1620-preflight')
 sql="BEGIN READ ONLY;\nSET LOCAL statement_timeout='5s';\nSET LOCAL lock_timeout='2s';\nDO $$ BEGIN\n IF current_database()<>'stockinsider' OR current_user<>'postgres' OR current_setting('data_directory')<>'/var/lib/postgresql/17/stockinsider' THEN RAISE EXCEPTION 'database_identity_mismatch';END IF;\n IF (SELECT count(*) FROM public.production_writer_releases WHERE active)<>1 OR EXISTS(SELECT FROM public.production_writer_releases WHERE active AND (release_id IS DISTINCT FROM 'dd59817f750684b093965f539dd4de466be13077' OR writer_kind IS DISTINCT FROM 'vps')) THEN RAISE EXCEPTION 'writer_identity_mismatch';END IF;\n IF EXISTS(SELECT FROM public.production_write_leases WHERE lease_key='production-data-plane') THEN RAISE EXCEPTION 'data_plane_lease_not_empty';END IF;\n IF (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE oid='public.claim_candidate_financial_document_receipts_v6(integer,text,timestamptz,timestamptz)'::regprocedure) IS DISTINCT FROM '830fffbb0cacbebd329d79d0a48ff39c5bb8d8637c4f1b1e4848001c47bb55f5' THEN RAISE EXCEPTION 'claim_source_mismatch';END IF;\n IF (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE oid='public.reconcile_pending_financial_document_jobs_v9(uuid,integer,uuid)'::regprocedure) IS DISTINCT FROM '1eb9cfa2beb10de0b07ed0759c5d0b5f925b55dd715017f2551b406a1086f7cd' THEN RAISE EXCEPTION 'reconcile_source_mismatch';END IF;\nEND $$;\nSELECT json_build_object('observedAt',clock_timestamp(),\n 'receipt',(SELECT json_build_object('receiptId',receipt_id,'stockId',stock_id,'jobId',acquisition_job_id,'periodEnd',period_end,'sha256',document_sha256,'bytes',byte_length,'contentType',content_type,'receiptStatus',receipt_status,'parserStatus',parser_status,'publishedAt',published_at,'financialValidationStatus',financial_validation_status) FROM public.candidate_financial_document_receipts_v6 WHERE receipt_id='c5b6ccf0-25d5-4fa3-b257-4f0b194c0090'),\n 'parserEligibleCount',(SELECT count(*) FROM public.candidate_financial_document_receipts_v6 WHERE parser_status='queued' OR (parser_status='running' AND parser_lease_expires_at<clock_timestamp())),\n 'parserEligibleFirst',(SELECT receipt_id FROM public.candidate_financial_document_receipts_v6 WHERE parser_status='queued' OR (parser_status='running' AND parser_lease_expires_at<clock_timestamp()) ORDER BY accepted_at,receipt_id LIMIT 1),\n 'dueValidationCount',(SELECT count(*) FROM public.candidate_financial_document_receipts_v6 WHERE financial_validation_status='pending' AND (financial_validation_next_attempt_at IS NULL OR financial_validation_next_attempt_at<=clock_timestamp())),\n 'dueReconciliations',COALESCE((SELECT json_agg(row_to_json(x)) FROM (SELECT l.receipt_id,l.job_id FROM public.candidate_financial_document_job_links_v9 l JOIN public.candidate_financial_acquisition_jobs_v4 j ON j.job_id=l.job_id JOIN public.candidate_financial_document_receipts_v6 r ON r.receipt_id=l.receipt_id WHERE r.parser_status='complete' AND j.status IN ('queued','running') AND (j.next_attempt_at IS NULL OR j.next_attempt_at<=clock_timestamp()) ORDER BY j.updated_at,l.linked_at,l.receipt_id,l.job_id LIMIT 41) x),'[]'::json));\nROLLBACK;\n"
 c=subprocess.run(['runuser','-u','postgres','--','env','-i','PATH=/usr/bin:/bin','PGCONNECT_TIMEOUT=5','/usr/bin/psql','-h','/var/run/postgresql','-p','5432','-U','postgres','-d','stockinsider','-X','-w','-A','-t','-v','ON_ERROR_STOP=1'],input=sql.encode(),stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=20)
 (root/'worker-oct17-1620-db-preflight.stdout').write_bytes(c.stdout);(root/'worker-oct17-1620-db-preflight.stderr').write_bytes(c.stderr)
 if c.returncode:raise RuntimeError('readonly_db_preflight_failed')
 rows=[json.loads(s) for s in c.stdout.decode().splitlines() if s.startswith('{')];assert len(rows)==1
 a=rows[0];result['dbPreflight']=a;r=a['receipt']
 assert r['receiptId']==result['receiptId'] and r['stockId']=='e1474aa7-97d1-433e-9952-e3476657e0c2' and r['jobId']=='8ad5b86e-183e-4ebe-9103-b595cb03a378' and r['periodEnd']=='2026-06-30' and r['sha256']=='8900870e593b1342d0901d38c137cdbb62f48d662fb6ecedebe3431e28df9e9e' and r['bytes']==1528880 and r['contentType']=='application/xhtml+xml' and r['publishedAt'] is None
 if r['parserStatus']!='queued' or r['receiptStatus']!='accepted':raise RuntimeError('receipt_changed_READ_required_no_worker')
 if a['parserEligibleCount']!=1 or a['parserEligibleFirst']!=result['receiptId'] or a['dueValidationCount']!=0:raise RuntimeError('worker_queue_not_exclusive_to_new_receipt')
 allowed={'112d488f-9363-4bbe-824b-f1ddb5cad4c1','2ccb561e-7a1f-4c37-8850-58dbdd3d3b04','996035f8-fbcd-46a3-8a38-93dcc61146e2','8ad5b86e-183e-4ebe-9103-b595cb03a378','eaae1286-50cd-488e-af23-bf9d60ebc759'}
 if len(a['dueReconciliations'])>40 or any(x['job_id'] not in allowed for x in a['dueReconciliations']):raise RuntimeError('reconciliation_outside_original_five_scope')
 secret=None
 for line in pathlib.Path('/etc/stockinsider/stockinsider.env').read_text().splitlines():
  if '=' not in line or line.lstrip().startswith('#'):continue
  k,v=line.split('=',1)
  if k.strip().removeprefix('export ')=='INTERNAL_API_KEY':
   v=v.strip();secret=v[1:-1] if len(v)>1 and v[0]==v[-1] and v[0] in ('"',"'") else v
 if not secret:raise RuntimeError('internal_key_missing')
 cap('worker-oct17-1620-immediate-preflight')
 req=urllib.request.Request('http://127.0.0.1:3101/api/internal/candidate-financial-documents/worker',data=b'{"limit":1}',method='POST',headers={'Authorization':'Bearer '+secret,'Content-Type':'application/json'})
 result['workerAttempts']=1
 try:
  with urllib.request.urlopen(req,timeout=75) as response:status=response.status;body=response.read(1048577)
 except urllib.error.HTTPError as e:status=e.code;body=e.read(1048577)
 assert len(body)<=1048576;a=json.loads(body);(root/'worker-oct17-1620-response.json').write_bytes(body)
 result['response']={'httpStatus':status,'ok':a.get('ok'),'releaseId':a.get('releaseId'),'result':a.get('result'),'error':a.get('error')}
 result['status']='RESPONSE_RECEIVED_REQUIRES_READONLY_FACTS_TERMINAL_AUDIT'
except Exception as e:result.update(status='STOPPED_OR_UNCERTAIN',errorType=type(e).__name__,error=str(e)[:180],outcomeUncertain=result['workerAttempts']>0)
result['endedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();(root/'guarded-worker-oct17-1620.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result,ensure_ascii=False))
PY
