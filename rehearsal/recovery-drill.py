#!/usr/bin/env python3
"""Offline fixture rehearsal. No SSH, systemd, application APIs or production SQL.
Only freshly created private PGDATA and explicit Unix socket connections.
Release/health logic is a fixture mechanism, NOT an application deployment.
"""
import argparse, datetime, hashlib, http.server, json, os, pathlib, resource
import shutil, signal, socket, subprocess, tempfile, threading, time, urllib.request

PIN = '6428918f540d5d088814be324ab8578c0cb41e4e'
MiB = 1024**2
ap = argparse.ArgumentParser()
ap.add_argument('--pg-bin', required=True)
ap.add_argument('--output', required=True)
ap.add_argument('--temp-parent', default='/tmp')
ap.add_argument('--require-hard-sandbox', action='store_true')
args = ap.parse_args()
assert os.getuid() != 0, 'nonroot_required'
strict_evidence = None
if args.require_hard_sandbox:
 assert args.temp_parent == '/tmp', 'private_tmp_required'
 fs=os.statvfs('/tmp');capacity=fs.f_blocks*fs.f_frsize
 assert capacity <= 256*MiB, '256MiB_private_filesystem_required'
 assert [name for _,name in socket.if_nameindex()] == ['lo'], 'private_loopback_network_required'
 cg=next(x.split('::',1)[1].strip() for x in pathlib.Path('/proc/self/cgroup').read_text().splitlines() if x.startswith('0::'))
 cgdir=pathlib.Path('/sys/fs/cgroup')/cg.lstrip('/')
 memory=(cgdir/'memory.max').read_text().strip();tasks=(cgdir/'pids.max').read_text().strip()
 assert memory!='max' and int(memory)<=768*MiB, 'memory_cgroup_required'
 assert tasks!='max' and int(tasks)<=32, 'tasks_cgroup_required'
 strict_evidence={'tmpCapacityBytes':capacity,'memoryMax':int(memory),'tasksMax':int(tasks),'interfaces':['lo']}
bins = pathlib.Path(args.pg_bin).resolve(strict=True)
out = pathlib.Path(args.output).resolve()
out.mkdir(mode=0o700, parents=True, exist_ok=False)
os.umask(0o077)
root = pathlib.Path(tempfile.mkdtemp(prefix='si-fixture-', dir=args.temp_parent))
assert root.stat().st_uid == os.getuid() and root.stat().st_mode & 0o777 == 0o700
sock = root/'socket'; sock.mkdir(mode=0o700)
data = root/'data'
env = {'PATH': str(bins)+':/usr/bin:/bin', 'HOME':str(root), 'LANG':'C', 'LC_ALL':'C',
       'PGHOST':str(sock), 'PGPORT':'6547', 'PGUSER':'fixture_owner', 'PGDATABASE':'postgres',
       'PGCONNECT_TIMEOUT':'3', 'PGPASSFILE':'/dev/null', 'PGSERVICEFILE':'/dev/null',
       'PGOPTIONS':'-c statement_timeout=5000 -c lock_timeout=2000'}
receipt = {'schema':'stockinsider-offline-fixture-drill-v1', 'sourceCommit':PIN,
 'startedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(), 'uid':os.getuid(),
 'mechanism':'fixture atomic release pointer plus fixture HTTP health; not actual app deployment',
 'limits':{'wallSeconds':180,'commandSeconds':25,'addressSpaceBytesPerProcess':512*MiB,
 'cpuSecondsPerProcess':45,'fileBytesHard':64*MiB,'openFilesPerProcess':64,
 'treeBytesWatchdog':512*MiB,'treeSamplingSeconds':0.2,
 'aggregateDiskHardQuota':bool(strict_evidence),'aggregateMemoryCgroup':bool(strict_evidence)},'tests':{},'releases':[]}
receipt['hardSandboxEvidence']=strict_evidence
started=False; server=None; thread=None; port=None; stop=threading.Event(); peak=[0]
pgprocess=None;pglog=None
def digest(p): return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def limits():
 resource.setrlimit(resource.RLIMIT_AS,(512*MiB,512*MiB))
 resource.setrlimit(resource.RLIMIT_CPU,(45,45))
 resource.setrlimit(resource.RLIMIT_FSIZE,(64*MiB,64*MiB))
 resource.setrlimit(resource.RLIMIT_NOFILE,(64,64))
 resource.setrlimit(resource.RLIMIT_CORE,(0,0))
def run(name, a, input=None, ok=True):
 p=subprocess.run([str(bins/name),*a],input=input,text=True,capture_output=True,
                  env=env,timeout=25,preexec_fn=limits)
 if ok and p.returncode: raise RuntimeError(name+'_failed:'+p.stderr[-1000:])
 return p
def sql(db,q,ok=True): return run('psql',['-X','-A','-t','-v','ON_ERROR_STOP=1','-d',db,'-c',q],ok=ok)
def fingerprint(db):
 q="SELECT json_build_object('stocks',(SELECT json_agg(t ORDER BY id) FROM stocks t),'signals',(SELECT json_agg(t ORDER BY id) FROM stock_signals t))::text"
 return hashlib.sha256(sql(db,q).stdout.strip().encode()).hexdigest()
def fail_signal(signum,frame): raise RuntimeError('deadline_or_resource_limit')
signal.signal(signal.SIGTERM,fail_signal);signal.signal(signal.SIGALRM,fail_signal);signal.alarm(180)
def watchdog():
 while not stop.wait(.2):
  total=sum(p.stat().st_size for p in root.rglob('*') if p.is_file() and not p.is_symlink())
  peak[0]=max(peak[0],total)
  if total>512*MiB: os.kill(os.getpid(),signal.SIGTERM);return
watch=threading.Thread(target=watchdog,daemon=True);watch.start()
def activate(release,db):
 p=root/'next';p.write_text(json.dumps({'release':release,'db':db}))
 os.replace(p,root/'current.json')
def health():
 try:
  with urllib.request.build_opener(urllib.request.ProxyHandler({})).open('http://127.0.0.1:'+str(port)+'/health',timeout=3) as r:
   return r.status,json.load(r)
 except urllib.error.HTTPError as e: return e.code,json.load(e)
class Health(http.server.BaseHTTPRequestHandler):
 def do_GET(self):
  m=json.loads((root/'current.json').read_text()); cfg=json.loads((root/'releases'/m['release']/'release.json').read_text())
  b={'release':m['release'],'dataHash':fingerprint(m['db']),'fixture':True}
  self.send_response(200 if cfg['healthy'] else 503);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(json.dumps(b).encode())
 def log_message(self,*args): pass
try:
 for name in ('postgres','pg_dump','pg_restore','initdb','psql'):
  v=run(name,['--version']).stdout.strip();assert ' 17.' in v;receipt.setdefault('versions',{})[name]=v
 run('initdb',['-D',str(data),'-U','fixture_owner','--auth-local=trust','--auth-host=reject','--no-locale','--encoding=UTF8'])
 with (data/'postgresql.conf').open('a') as f:
  f.write("\nlisten_addresses=''\nport=6547\nunix_socket_directories='"+str(sock)+"'\nunix_socket_permissions=0700\nshared_buffers=16MB\nwork_mem=1MB\nmaintenance_work_mem=16MB\nmax_connections=4\nmax_worker_processes=0\nmax_parallel_workers=0\nautovacuum=off\njit=off\nmax_wal_size=64MB\nmin_wal_size=32MB\nwal_level=minimal\nmax_wal_senders=0\narchive_mode=off\ntemp_file_limit=16MB\n")
 # Keep postmaster as our direct child so we can wait/reap it on minimal VM PID1.
 pglog=(root/'postgres.log').open('w')
 pgprocess=subprocess.Popen([str(bins/'postgres'),'-D',str(data)],env=env,
   stdin=subprocess.DEVNULL,stdout=pglog,stderr=pglog,preexec_fn=limits)
 for attempt in range(50):
  if pgprocess.poll() is not None: raise RuntimeError('postmaster_start_failed')
  if run('pg_isready',[],ok=False).returncode==0: break
  time.sleep(.1)
 else: raise RuntimeError('postmaster_start_timeout')
 started=True
 conf=json.loads(sql('postgres',"SELECT json_build_object('version',version(),'version_num',current_setting('server_version_num'),'listen_addresses',current_setting('listen_addresses'),'data_directory',current_setting('data_directory'),'socket',current_setting('unix_socket_directories'))").stdout)
 assert conf['listen_addresses']=='' and conf['data_directory']==str(data) and conf['socket']==str(sock)
 receipt['server']=conf
 run('createdb',['fixture_a'])
 schema=pathlib.Path(__file__).with_name('fixture-schema.sql')
 run('psql',['-X','-v','ON_ERROR_STOP=1','-d','fixture_a','-f',str(schema)])
 fixture="""INSERT INTO stocks(id,symbol,name,market,created_at,updated_at) VALUES ('00000000-0000-4000-8000-000000000001','FIXTURE01','SYNTHETIC ONLY','TW','2026-01-01Z','2026-01-01Z'),('00000000-0000-4000-8000-000000000002','FIXTURE02','SYNTHETIC ONLY','US','2026-01-01Z','2026-01-01Z'); INSERT INTO stock_signals(id,stock_id,as_of,source,price,volume,freshness_status,source_timestamp,ingested_at) SELECT ('10000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'00000000-0000-4000-8000-000000000001','2026-01-01Z'::timestamptz+i*interval '1 day','fixture',100+i,1000+i,'fresh','2026-01-01Z','2026-01-01Z' FROM generate_series(1,12) i;"""
 sql('fixture_a',fixture);original=fingerprint('fixture_a')
 receipt['schemaSha256']=digest(schema);receipt['tests']['fixtureCounts']=json.loads(sql('fixture_a',"SELECT json_build_object('stocks',(SELECT count(*) FROM stocks),'stock_signals',(SELECT count(*) FROM stock_signals))").stdout)
 archive=out/'fixture.dump';run('pg_dump',['-Fc','--no-owner','--no-acl','-d','fixture_a','-f',str(archive)])
 sha=digest(archive);toc=run('pg_restore',['-l',str(archive)]).stdout;(out/'fixture.toc').write_text(toc)
 receipt['backup']={'sha256':sha,'bytes':archive.stat().st_size,'tocSha256':digest(out/'fixture.toc'),'tocEntries':sum(bool(x) and not x.startswith(';') for x in toc.splitlines())}
 def restore(db,artifact):
  assert digest(artifact)==sha,'archive_integrity_rejected_before_restore'
  run('pg_restore',['-l',str(artifact)])
  run('createdb',[db]);run('pg_restore',['--exit-on-error','--no-owner','--no-acl','-d',db,str(artifact)])
 restore('fixture_restore',archive);assert fingerprint('fixture_restore')==original
 receipt['tests']['restoreHashMatches']=True;receipt['dataSha256']=original
 receipt['tests']['restoredConstraintCount']=int(sql('fixture_restore',"SELECT count(*) FROM pg_constraint WHERE conrelid IN ('stocks'::regclass,'stock_signals'::regclass)").stdout)
 constraint_sql="SELECT conname||':'||contype::text||':'||convalidated::text||':'||COALESCE(conkey::text,'')||':'||CASE WHEN contype='c' THEN 'CHECK' ELSE pg_get_constraintdef(oid) END FROM pg_constraint WHERE conrelid IN ('stocks'::regclass,'stock_signals'::regclass) ORDER BY conname"
 constraint_source=sql('fixture_a',constraint_sql).stdout
 constraint_restored=sql('fixture_restore',constraint_sql).stdout
 if constraint_source!=constraint_restored: raise RuntimeError('constraint_diff:'+repr(constraint_source)+' vs '+repr(constraint_restored))
 receipt['tests']['constraintStructureMatches']=True
 receipt['limitations']=['PG17 dump/restore rewrites equivalent CHECK casts; structural constraint comparison plus executable rejection cases, not textual CHECK equality','fixture subset only; no full Supabase schema, extensions, roles or RLS rehearsal','release health fixture only; no real application build or deployment','VM aggregate disk watchdog is not a hard quota; aggregate memory cgroup not configured']
 receipt['constraintSha256']=hashlib.sha256(constraint_source.encode()).hexdigest()
 badsql=["INSERT INTO stocks(symbol,name,market) VALUES ('BAD','fixture','XX')", "INSERT INTO stocks(symbol,name,market) VALUES ('FIXTURE01','fixture','TW')", "INSERT INTO stock_signals(stock_id,as_of,source,price,freshness_status,source_timestamp) VALUES ('ffffffff-ffff-4fff-8fff-ffffffffffff',now(),'fixture',1,'fresh',now())"]
 badsql.extend(["UPDATE stock_signals SET freshness_status='INVALID'", "INSERT INTO stock_signals SELECT * FROM stock_signals LIMIT 1"])
 receipt['tests']['constraintRejections']=[sql('fixture_restore',q,ok=False).returncode!=0 for q in badsql];assert all(receipt['tests']['constraintRejections'])
 corrupt=root/'corrupt.dump';raw=bytearray(archive.read_bytes());raw[len(raw)//2]^=255;corrupt.write_bytes(raw)
 try: restore('must_not_exist',corrupt);raise RuntimeError('corruption_accepted')
 except AssertionError: pass
 assert sql('postgres',"SELECT count(*) FROM pg_database WHERE datname='must_not_exist'").stdout.strip()=='0'
 receipt['tests']['corruptionRejectedBeforeDatabaseCreation']=True
 (root/'releases').mkdir()
 hashes={}
 for release,healthy in [('A',True),('B',True),('B-fault',False)]:
  d=root/'releases'/release;d.mkdir();p=d/'release.json';p.write_text(json.dumps({'release':release,'healthy':healthy,'fixture':True}));hashes[release]=digest(p);p.chmod(0o400);d.chmod(0o500)
 activate('A','fixture_restore')
 server=http.server.HTTPServer(('127.0.0.1',0),Health);port=server.server_port;server.timeout=2
 thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
 def check(release,want=200):
  status,body=health();assert status==want and body['release']==release
  receipt['releases'].append({'release':release,'httpStatus':status,'dataHash':body['dataHash']});return body
 assert check('A')['dataHash']==original
 restore('fixture_b',archive);sql('fixture_b',"UPDATE stock_signals SET price=price+7")
 b_hash=fingerprint('fixture_b');assert b_hash!=original
 activate('B','fixture_b');assert check('B')['dataHash']==b_hash
 activate('A','fixture_restore');assert check('A')['dataHash']==original
 restore('fixture_fault',archive);sql('fixture_fault',"UPDATE stock_signals SET price=price+99")
 activate('B-fault','fixture_fault');check('B-fault',503)
 # Explicit rollback: discard failed candidate state; recover A into another NEW DB.
 restore('fixture_rollback',archive);activate('A','fixture_rollback');assert check('A')['dataHash']==original
 assert fingerprint('fixture_a')==original and fingerprint('fixture_restore')==original
 assert all(digest(root/'releases'/k/'release.json')==v for k,v in hashes.items())
 receipt['releaseHashes']=hashes
 receipt['tests'].update({'aToBToA':True,'failedHealthRollback':True,'dataRecoveredToOriginalHash':True,'previousReleaseUnmodified':True})
 receipt['databaseBytes']=int(sql('fixture_rollback',"SELECT pg_database_size(current_database())").stdout)
 receipt['passed']=True
except BaseException as e:
 receipt['passed']=False;receipt['error']=str(e)[:1500]
finally:
 signal.alarm(0);signal.signal(signal.SIGTERM,signal.SIG_IGN)
 if server: server.shutdown();server.server_close();thread.join(timeout=3)
 cleanup={}
 if data.exists():
  p=run('pg_ctl',['-D',str(data),'-m','immediate','-w','-t','10','stop'],ok=False)
  cleanup['pgStopExit']=p.returncode
  cleanup['postmasterPidRemoved']=not (data/'postmaster.pid').exists()
 if pgprocess:
  try: pgprocess.wait(timeout=5)
  except subprocess.TimeoutExpired: pgprocess.kill();pgprocess.wait(timeout=5)
  cleanup['postmasterChildReaped']=pgprocess.returncode is not None
 if pglog: pglog.close()
 stop.set();watch.join(timeout=2)
 cleanup['socketRemovedBeforeTreeCleanup']=not (sock/'.s.PGSQL.6547').exists()
 if port:
  with socket.socket() as s: s.settimeout(1);cleanup['webListenerClosed']=s.connect_ex(('127.0.0.1',port))!=0
 for p in (root/'releases').glob('*') if (root/'releases').exists() else []: p.chmod(0o700)
 shutil.rmtree(root);cleanup['privateTreeRemoved']=not root.exists()
 receipt['cleanup']=cleanup;receipt['peakTreeBytesSampled']=peak[0]
 receipt['finishedUtc']=datetime.datetime.now(datetime.timezone.utc).isoformat()
 receipt['durationSeconds']=(datetime.datetime.fromisoformat(receipt['finishedUtc'])-datetime.datetime.fromisoformat(receipt['startedUtc'])).total_seconds()
 receipt['scriptSha256']=digest(__file__)
 receipt['passed']=receipt.get('passed',False) and all(v for k,v in cleanup.items() if k!='pgStopExit') and cleanup.get('pgStopExit')==0
 (out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
 print(json.dumps(receipt,indent=2))
raise SystemExit(0 if receipt['passed'] else 1)
