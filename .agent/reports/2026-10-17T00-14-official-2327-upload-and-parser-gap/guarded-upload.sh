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
budgetpath=root/'upload-oct17-1605-budget.json';assert not budgetpath.exists();budgetpath.write_text(json.dumps(budget)+'\n');os.chmod(budgetpath,0o600)
result={'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'symbol':'2327','jobId':'8ad5b86e-183e-4ebe-9103-b595cb03a378','uploadAttempts':0,'workerAttempts':0,'publicationTimeKnown':False,'upstreamContentType':'; charset=iso-8859-1','uploadContentType':'application/xhtml+xml','mimeBasis':'Root exact-byte XML namespace XHTML/inlineXBRL and UTF-8 declaration; upload MIME is detected format, not upstream header','factsAddedClaimed':False}
def cap(label):
 c=subprocess.run(['/usr/bin/node',str(release/'scripts/contabo-host-resource-check.mjs'),str(budgetpath)],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=15);(root/(label+'.stdout')).write_bytes(c.stdout);(root/(label+'.stderr')).write_bytes(c.stderr);a=json.loads(c.stdout);result[label]={'actualExit':c.returncode,'result':a}
 if c.returncode or a.get('allowed') is not True:raise RuntimeError('capacity_not_ready')
try:
 cap('upload-oct17-1605-preflight')
 sql="""BEGIN READ ONLY;SET LOCAL statement_timeout='5s';SET LOCAL lock_timeout='2s';
DO $$ BEGIN
 IF current_database()<>'stockinsider' OR current_user<>'postgres' OR current_setting('data_directory')<>'/var/lib/postgresql/17/stockinsider' THEN RAISE EXCEPTION 'database_identity_mismatch';END IF;
 IF (SELECT count(*) FROM public.production_writer_releases WHERE active)<>1 OR EXISTS(SELECT FROM public.production_writer_releases WHERE active AND (release_id IS DISTINCT FROM 'dd59817f750684b093965f539dd4de466be13077' OR writer_kind IS DISTINCT FROM 'vps')) THEN RAISE EXCEPTION 'writer_identity_mismatch';END IF;
 IF EXISTS(SELECT FROM public.production_write_leases WHERE lease_key='production-data-plane') THEN RAISE EXCEPTION 'data_plane_lease_not_empty';END IF;
 IF (SELECT count(*) FROM public.candidate_financial_acquisition_jobs_v4 j JOIN public.stocks s ON s.id=j.stock_id WHERE j.job_id='8ad5b86e-183e-4ebe-9103-b595cb03a378' AND s.symbol='2327' AND s.id='e1474aa7-97d1-433e-9952-e3476657e0c2' AND j.period_end='2026-06-30' AND j.status='queued' AND j.endpoint_key='issuer_ir_document' AND j.source_url='https://mopsov.twse.com.tw/server-java/t164sb01?step=1&CO_ID=2327&REPORT_ID=C')<>1 THEN RAISE EXCEPTION 'job_identity_state_mismatch';END IF;
END $$;
SELECT json_build_object('observedAt',clock_timestamp(),'matchingReceipts',COALESCE((SELECT json_agg(json_build_object('receiptId',receipt_id,'receiptStatus',receipt_status,'parserStatus',parser_status)) FROM public.candidate_financial_document_receipts_v6 WHERE stock_id='e1474aa7-97d1-433e-9952-e3476657e0c2' AND period_end='2026-06-30' AND document_sha256='8900870e593b1342d0901d38c137cdbb62f48d662fb6ecedebe3431e28df9e9e'),'[]'::json));ROLLBACK;"""
 c=subprocess.run(['runuser','-u','postgres','--','env','-i','PATH=/usr/bin:/bin','PGCONNECT_TIMEOUT=5','/usr/bin/psql','-h','/var/run/postgresql','-p','5432','-U','postgres','-d','stockinsider','-X','-w','-A','-t','-v','ON_ERROR_STOP=1'],input=sql.encode(),stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=20);(root/'upload-oct17-1605-db-preflight.stdout').write_bytes(c.stdout);(root/'upload-oct17-1605-db-preflight.stderr').write_bytes(c.stderr)
 if c.returncode:raise RuntimeError('readonly_db_preflight_failed')
 rows=[json.loads(s) for s in c.stdout.decode().splitlines() if s.startswith('{')];assert len(rows)==1;result['dbPreflight']=rows[0]
 if rows[0]['matchingReceipts']:raise RuntimeError('existing_exact_hash_receipt_READ_required_no_resend')
 p=root/'2327.xhtml';before=p.lstat();assert stat.S_ISREG(before.st_mode) and before.st_uid==0 and before.st_nlink==1 and not p.is_symlink()
 fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW)
 try:
  with os.fdopen(fd,'rb',closefd=False) as f:b=f.read(1528881)
  key=lambda s:(s.st_dev,s.st_ino,s.st_size,s.st_mtime_ns,s.st_ctime_ns)
  assert key(before)==key(os.fstat(fd))==key(p.lstat()) and len(b)==1528880 and hashlib.sha256(b).hexdigest()=='8900870e593b1342d0901d38c137cdbb62f48d662fb6ecedebe3431e28df9e9e'
 finally:os.close(fd)
 meta={'stockId':'e1474aa7-97d1-433e-9952-e3476657e0c2','symbol':'2327','exchange':'TWSE','periodEnd':'2026-06-30','sourceUrl':'https://mopsov.twse.com.tw/server-java/FileDownLoad?functionName=t164sb01&step=9&co_id=2327&year=2026&season=2&report_id=C','publishedAt':None,'acquisitionJobId':'8ad5b86e-183e-4ebe-9103-b595cb03a378'}
 secret=None
 for line in pathlib.Path('/etc/stockinsider/stockinsider.env').read_text().splitlines():
  if '=' not in line or line.lstrip().startswith('#'):continue
  k,v=line.split('=',1)
  if k.strip().removeprefix('export ')=='INTERNAL_API_KEY':
   v=v.strip();secret=v[1:-1] if len(v)>1 and v[0]==v[-1] and v[0] in ('"',"'") else v
 if not secret:raise RuntimeError('internal_key_missing')
 cap('upload-oct17-1605-immediate-preflight')
 req=urllib.request.Request('http://127.0.0.1:3101/api/internal/candidate-financial-documents',data=b,method='POST',headers={'Authorization':'Bearer '+secret,'Content-Type':'application/xhtml+xml','X-Candidate-Financial-Document-Metadata':json.dumps(meta,separators=(',',':'))})
 result['uploadAttempts']=1
 try:
  with urllib.request.urlopen(req,timeout=60) as response:status=response.status;body=response.read(65537)
 except urllib.error.HTTPError as e:status=e.code;body=e.read(65537)
 assert len(body)<=65536;a=json.loads(body);(root/'upload-oct17-1605-response.json').write_bytes(body);result['upload']={'httpStatus':status,**{k:a.get(k) for k in ['ok','receiptId','status','idempotentReplay','error']}}
 result['status']='RECEIPT_CREATED_REQUIRES_WORKER_AND_FACTS' if status==202 and a.get('ok') is True else 'UPLOAD_REJECTED_NO_RETRY'
except Exception as e:result.update(status='STOPPED_OR_UNCERTAIN',errorType=type(e).__name__,error=str(e)[:180],outcomeUncertain=result['uploadAttempts']>0)
result['endedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();(root/'guarded-upload-oct17-1605.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result,ensure_ascii=False))
PY
