import base64,csv,datetime,hashlib,hmac,http.client,io,json,os,re,secrets,shutil,socket,subprocess,tempfile,time,urllib.parse,urllib.request,uuid
from pathlib import Path
bundle_path=Path(__file__).with_name('bundle.json')
bundle_bytes=bundle_path.read_bytes()
assert hashlib.sha256(bundle_bytes).hexdigest()=='7dd1a8941749cfc2cba29f4791c481e1d1d6a5fdc6e508b4d4904381ac087caf'
bundle=json.loads(bundle_bytes)
STATE=Path('/var/lib/stockinsider-stage-signed-turnover-20261118')
EXPECTED_DAY=datetime.date(2026,11,18)

PG=Path('/usr/lib/postgresql/17/bin')
POSTGREST='/usr/local/bin/postgrest'
URL='https://www.twse.com.tw/exchangeReport/STOCK_DAY_ALL?response=open_data'
RELEASE='11adb2d4056f7f8d3df9bd6258242ce714ae68c0'
TAIPEI=datetime.timezone(datetime.timedelta(hours=8))
UTC=datetime.timezone.utc
def now(): return datetime.datetime.now(UTC)
def stamp(): return now().isoformat()
def b64(data): return base64.urlsafe_b64encode(data).rstrip(b'=').decode('ascii')
def number(value): return json.loads(value)
def literal(value): return "'" + str(value).replace("'", "''") + "'"
def check_capacity():
 with open('/proc/meminfo',encoding='ascii') as handle:
  ram=int(next(line for line in handle if line.startswith('MemAvailable:')).split()[1])*1024
 disk=shutil.disk_usage('/tmp').free
 assert disk>=17*1024**3 and ram>=int(2.3*1024**3)
 return {'freeDiskBytes':disk,'availableMemoryBytes':ram}
class UnixHttp(http.client.HTTPConnection):
 def __init__(self,filename):
  super().__init__('localhost',timeout=8)
  self.filename=str(filename)
 def connect(self):
  self.sock=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM)
  self.sock.settimeout(self.timeout)
  self.sock.connect(self.filename)
class FixedSource(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs):
  return None
slot_now=now().astimezone(TAIPEI)
assert slot_now.date()==EXPECTED_DAY and datetime.time(21,20)<=slot_now.time()<datetime.time(21,23), 'outside exact staged live-start window'
assert STATE.is_dir() and STATE.stat().st_uid==os.getuid() and not STATE.stat().st_mode&0o077
assert not (STATE/'receipt.json').exists(), 'staging receipt already exists'
proof={'scope':'isolated signed writer at a real cutoff; real official payload; seeded staging calendar and operator','resourceStart':check_capacity(),
  'serviceStartedAt':stamp(),'sourceCommit':RELEASE,'targetSession':EXPECTED_DAY.isoformat(),'bundleSha256':'7dd1a8941749cfc2cba29f4791c481e1d1d6a5fdc6e508b4d4904381ac087caf'}
scratch=None
rest=None
with tempfile.TemporaryDirectory(prefix='si-stg-11549-signed-') as root:
 scratch=Path(root)
 pgdir=scratch/'pg'
 sock=scratch/'db'
 sock.mkdir(mode=0o700)
 rest_sock=scratch/'http.sock'
 artifacts=scratch/'private'
 artifacts.mkdir(mode=0o700)
 def native(bin,args,stmt=None):
  result=subprocess.run([str(PG/bin),*args],input=stmt,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,timeout=70,
    env={**os.environ,'LC_ALL':'C.UTF-8','TZ':'UTC'})
  if result.returncode:
   raise RuntimeError(bin+' exited '+str(result.returncode)+' '+result.stderr[-2200:])
  return result.stdout.strip()
 def sql(stmt):
  return native('psql',['-XqAt','-v','ON_ERROR_STOP=1','-h',str(sock),'-U','postgres','-d','postgres'],stmt)
 active=False
 try:
  native('initdb',['-D',str(pgdir),'-U','postgres','-A','trust','--no-locale','--encoding=UTF8'])
  native('pg_ctl',['-D',str(pgdir),'-w','-l',str(scratch/'postgres.log'),'-o','-c listen_addresses= -k '+str(sock)+' -c unix_socket_permissions=0700 -c log_min_messages=warning','start'])
  active=True
  sql(bundle['dependencies'])
  sql(bundle['source'])
  for patch in bundle['predecessorBodies']:
   statement="""DO $reviewed_fixture$
 DECLARE target oid:=to_regprocedure(%s); prior text; def text; before_meta jsonb;
 BEGIN
  SELECT p.prosrc,pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO prior,def,before_meta FROM pg_proc p WHERE p.oid=target;
  IF prior IS DISTINCT FROM $before$%s$before$ THEN RAISE EXCEPTION 'fixture_predecessor_mismatch';END IF;
  EXECUTE replace(def,prior,$after$%s$after$);
  IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE p.oid=target) IS DISTINCT FROM before_meta
    THEN RAISE EXCEPTION 'fixture_metadata_mismatch';END IF;
 END $reviewed_fixture$;""" % (literal(patch['routine']),patch['before'],patch['after'])
   sql(statement)
  sql(bundle['support'])
  sql(bundle['m29'])
  sql(bundle['m31'])
  proof['reviewedGuardsInstalled']=True
  identity=str(uuid.uuid4())
  principal=str(uuid.uuid4())
  owner=str(uuid.uuid4())
  operator='staging-only-turnover'
  day=now().astimezone(TAIPEI).date()
  market_close=datetime.datetime.combine(day,datetime.time(13,30),TAIPEI)
  ranking_cutoff=datetime.datetime.combine(day,datetime.time(21,30),TAIPEI)
  assert day==EXPECTED_DAY and market_close<now()<ranking_cutoff
  sql(f"""
INSERT INTO public.stockinsider_data_plane_settings_v1(singleton, identity_fence_enabled, activated_at, activated_by)
 VALUES(true,true,clock_timestamp(),'ephemeral-staging-admin');
INSERT INTO public.internal_principal_role_bindings_v3(principal_id,role,valid_from,valid_to,status,configuration_hash)
 VALUES({literal(principal)},'opportunity_runner',clock_timestamp()-interval '5 seconds',clock_timestamp()+interval '20 minutes','active',repeat('a',64));
INSERT INTO public.stockinsider_backend_identities_v1(backend_id,principal_id,release_id,status,valid_from,valid_to)
 VALUES({literal(identity)},{literal(principal)},{literal(RELEASE)},'active',clock_timestamp()-interval '5 seconds',clock_timestamp()+interval '20 minutes');
INSERT INTO public.vnext_principals_v1 VALUES({literal(operator)},'operator',true);
INSERT INTO public.vnext_sessions_v1 VALUES({literal(day)},{literal(market_close.isoformat())},true);
INSERT INTO public.tw_trading_sessions_v3(session_id,market,open_at,close_at,status,provider,source_timestamp,collected_at,source_ref)
 VALUES({literal(day)},'TWSE',({literal(day)}||'T09:00:00+08:00')::timestamptz,{literal(market_close.isoformat())},'completed','twse',
 {literal(market_close.isoformat())},clock_timestamp(),'ephemeral-test-calendar-known-at-staging-setup');
INSERT INTO public.vnext_members_v1(symbol,state,input_hash,evidence,admitted_session)
 VALUES('2330','waiting',repeat('1',64),'{{}}',{literal(day)});
INSERT INTO public.vnext_mode_v1 VALUES(true,true,true);
INSERT INTO public.vnext_source_policies_v1(source,scope,license_basis,rights_subject,valid_until,enabled)
 VALUES('official','official_original','Taiwan Open Government Data License 1.0','ephemeral 11549 staging',clock_timestamp()+interval '20 minutes',true);
UPDATE public.vnext_launch_csv_mode_v1 SET enabled=true,required_writer_release={literal(RELEASE)} WHERE singleton;
INSERT INTO public.production_writer_releases(release_id,writer_kind,active,activated_at)
 VALUES({literal(RELEASE)},'vps',true,clock_timestamp());""")
  jwt_secret=secrets.token_urlsafe(48).encode()
  def token(role,secret=jwt_secret):
   claims={'role':role,'exp':int(time.time())+480}
   signing=b64(b'{"alg":"HS256","typ":"JWT"}')+'.'+b64(json.dumps(claims,separators=(',',':')).encode())
   return signing+'.'+b64(hmac.digest(secret,signing.encode(),'sha256'))
  credential=token('service_role')
  hdr={'Authorization':'Bearer '+credential,'x-stockinsider-backend-id':identity,'x-stockinsider-runner-principal':principal,'x-stockinsider-writer-release':RELEASE}
  env={**os.environ,'PGRST_DB_URI':'postgresql://authenticator@/postgres?host='+urllib.parse.quote(str(sock),safe=''),
    'PGRST_DB_SCHEMAS':'public','PGRST_DB_ANON_ROLE':'anon','PGRST_JWT_SECRET':jwt_secret.decode(),
    'PGRST_SERVER_UNIX_SOCKET':str(rest_sock),'PGRST_SERVER_UNIX_SOCKET_MODE':'600','PGRST_DB_POOL':'3',
    'PGRST_LOG_LEVEL':'error'}
  with (scratch/'rest.log').open('w',encoding='utf-8') as rl:
   rest=subprocess.Popen([POSTGREST],env=env,stdout=rl,stderr=subprocess.STDOUT)
  def request(endpoint,payload=None,headers=None):
   with_client=UnixHttp(rest_sock)
   try:
    d=(hdr if headers is None else headers).copy()
    if payload is not None:d['Content-Type']='application/json'
    with_client.request('GET' if payload is None else 'POST',endpoint,
      body=None if payload is None else json.dumps(payload,separators=(',',':')).encode(),headers=d)
    response=with_client.getresponse()
    raw=response.read(512*1024+1)
    assert len(raw)<=512*1024
    if not raw:return response.status,None
    return response.status,json.loads(raw)
   finally:with_client.close()
  for _ in range(80):
   if rest.poll() is not None:raise RuntimeError('private PostgREST exited')
   if rest_sock.exists():
    try:
     result,_=request('/',headers=hdr)
     if result==200:break
    except (OSError,http.client.HTTPException):pass
   time.sleep(.1)
  else:raise RuntimeError('private PostgREST unready')
  def invoke(routine,payload,headers=None):
   status,body=request('/rpc/'+routine,payload,headers)
   if status not in (200,201,204):
    raise RuntimeError('private '+routine+' status='+str(status)+' code='+str(body.get('code',''))+' label='+str(body.get('message',''))[:160])
   return body
  def csvrpc(operation,body,content=None):
   return invoke('vnext_launch_csv_command_v1',{'p_principal':operator,'p_lease_owner':owner,
    'p_operation':operation,'p_request':body,'p_body':content})
  def payload(operation,body,lease_id=None):
   return {'p_principal':operator,'p_lease_owner':lease_id or owner,'p_operation':operation,'p_request':body,'p_body':None}
  key={'datasetId':11549,'requestKey':str(day)}
  auth_wrong=hdr|{'Authorization':'Bearer '+token('service_role',b'different-test-signature')}
  denial=request('/rpc/vnext_launch_csv_command_v1',payload('enqueue',key),auth_wrong)[0]
  assert denial==401,denial
  assert invoke('acquire_production_write_lease',{'p_lease_key':'production-data-plane','p_owner_id':owner,'p_ttl_seconds':300}) is True
  wrong_release=request('/rpc/vnext_launch_csv_command_v1',payload('enqueue',key),hdr|{'x-stockinsider-writer-release':'0'*40})[0]
  wrong_lease=request('/rpc/vnext_launch_csv_command_v1',payload('enqueue',key,str(uuid.uuid4())))[0]
  assert wrong_release in (400,403) and wrong_lease in (400,403),(wrong_release,wrong_lease)
  assert sql('SELECT count(*) FROM public.vnext_launch_csv_bindings_v1;')=='0'
  queued=csvrpc('enqueue',key)
  assert not queued['replay'] and csvrpc('enqueue',key)['jobId']==queued['jobId']
  jobs=csvrpc('claim',{'limit':1})['jobs']
  assert len(jobs)==1 and jobs[0]['jobId']==queued['jobId'] and jobs[0]['sourceUrl']==URL,jobs
  attempt=jobs[0]['attemptId']
  fetched_at=stamp()
  reader=urllib.request.build_opener(FixedSource(),urllib.request.ProxyHandler({}))
  req=urllib.request.Request(URL,headers={'Accept':'text/csv','User-Agent':'StockInsider/official-same-day-staging'})
  with reader.open(req,timeout=12) as response:
   assert response.status==200 and response.geturl()==URL and response.headers.get_content_type()=='text/csv'
   header=response.headers.get('content-type')
   content=response.read(500001)
  observed=stamp()
  assert 0<len(content)<=500000 and now().astimezone(TAIPEI).date()==day
  digest=hashlib.sha256(content).hexdigest()
  rows=list(csv.reader(io.StringIO(content.decode('utf-8-sig'))))
  expected_date=str(day.year-1911)+f'{day.month:02d}{day.day:02d}'
  assert len(rows)>1 and {r[0] for r in rows[1:] if r}=={expected_date}
  expected_rows=sum(1 for r in rows[1:] if r and re.fullmatch(r'[0-9]{4}',r[1]))
  mod=scratch/'private-artifact-store.ts'
  mod.write_text(bundle['privateStore'],encoding='utf-8')
  store_endpoint="""import {privateArtifactStore} from './private-artifact-store.ts';
 const [root,hash]=process.argv.slice(2);
 const parts=[];
 for await (const chunk of process.stdin) parts.push(chunk);
 const input=Buffer.concat(parts);
 const store=privateArtifactStore(root);
 const saved=await store.put(hash,input);
 const reread=await store.read(hash);
 if(!saved.created||!reread.equals(input))throw Error('private_artifact_roundtrip');
 input.fill(0);reread.fill(0);
 console.log(JSON.stringify({stored:true,readback:true,bytes:saved.bytes}));
 """
  (scratch/'put.mjs').write_text(store_endpoint,encoding='utf-8')
  write=subprocess.run(['node',str(scratch/'put.mjs'),str(artifacts),digest],input=content,capture_output=True,timeout=20,cwd=scratch)
  if write.returncode:raise RuntimeError('artifact store failed: '+write.stderr.decode(errors='replace')[-500:])
  stored=json.loads(write.stdout)
  assert stored=={'stored':True,'readback':True,'bytes':len(content)}
  register={'p_artifact_hash':digest,'p_byte_length':len(content),'p_media_type':'text/csv','p_purpose':'diagnostic_attachment',
    'p_metadata':{'storage':'private_hash_store_v1','profile':'licensed-launch-csv-v1'}}
  assert invoke('register_private_artifact_receipt_v1',register)==[{'artifact_hash':digest,'idempotent_replay':False}]
  assert invoke('register_private_artifact_receipt_v1',register)==[{'artifact_hash':digest,'idempotent_replay':True}]
  appended=csvrpc('complete',{'attemptId':attempt,'artifactHash':digest,'observedAt':observed,'httpStatus':200,
    'redirectCount':0,'contentType':header,'responseUrl':URL},'\\x'+content.hex())
  assert appended['facts']==expected_rows and appended['actionEligible'] is False
  b=appended['captureId']
  assert sql('SELECT count(*) FROM public.vnext_launch_csv_ready_acks_v1;')=='0'
  ready=csvrpc('ready',{'attemptId':attempt,'captureId':b})
  assert csvrpc('ready',{'attemptId':attempt,'captureId':b})==ready
  assert csvrpc('receipt',{'attemptId':attempt})['captureId']==b
  assert invoke('release_production_write_lease',{'p_lease_key':'production-data-plane','p_owner_id':owner}) is True
  lease_clear=sql('SELECT count(*) FROM public.production_write_leases;')=='0'
  available_at=datetime.datetime.fromisoformat(ready['availableAt'])
  assert datetime.datetime.fromisoformat(observed)<=available_at<ranking_cutoff, 'capture was not ready before the real cutoff'
  no_transport_later=False
  rest.terminate()
  rest.wait(8)
  rest=None
  no_transport_later=True
  del credential, jwt_secret, token
  env.pop('PGRST_JWT_SECRET',None)
  hdr.clear()
  remaining_deadline=time.monotonic()+660
  while now()<ranking_cutoff:
   remaining=(ranking_cutoff-now()).total_seconds()
   assert time.monotonic()<remaining_deadline
   time.sleep(max(0.02,min(20,remaining)))
  cutoff_query_at=stamp()
  assert 0<=(now()-ranking_cutoff).total_seconds()<=45
  statuses=number(sql("SELECT jsonb_build_object('captures',(SELECT count(*) FROM public.vnext_launch_csv_captures_v1),"+
    "'facts',(SELECT count(*) FROM public.vnext_launch_csv_facts_v1),'ready',(SELECT count(*) FROM public.vnext_launch_csv_ready_acks_v1),"+
    "'legacy',(SELECT count(*) FROM public.taiwan_data_canonical_results_v5),'symbols',(SELECT count(DISTINCT symbol) FROM public.vnext_launch_csv_facts_v1),"+
    "'sourceVisibleNow',public.vnext_launch_source_fact_v1(11549,"+literal(day)+",'2330',repeat('1',64),statement_timestamp()) IS NOT NULL,"+
    "'visibleAtOriginal2130',public.vnext_launch_source_fact_v1(11549,"+literal(day)+",'2330',repeat('1',64),"+literal(ranking_cutoff.isoformat())+") IS NOT NULL);"))
  assert statuses=={'captures':1,'facts':expected_rows,'ready':1,'legacy':0,'symbols':expected_rows,'sourceVisibleNow':True,'visibleAtOriginal2130':True},statuses
  assert lease_clear
  proof.update({'verifiedAt':cutoff_query_at,'httpClosedBeforeCutoff':no_transport_later,'auth':{'badSignatureHttp':denial,'wrongWriterReleaseHttp':wrong_release,'wrongLeaseHttp':wrong_lease,
      'writesAfterNegativeRequests':0,'ephemeralPostgrestUnixOnly':True,'leaseReleased':lease_clear},
    'data':{'source':URL,'session':str(day),'requestedAt':fetched_at,'observedAt':observed,'bytes':len(content),'sha256':digest,
      'rows':len(rows)-1,'facts':expected_rows,'availableAt':ready['availableAt'],'originalCutoff':ranking_cutoff.isoformat(),
      'lookup':statuses,'artifactReadbackVerified':True,'duplicateReadySameId':True}})
 finally:
  if rest:
   rest.terminate()
   try:rest.wait(8)
   except subprocess.TimeoutExpired:rest.kill();rest.wait()
  if active:native('pg_ctl',['-D',str(pgdir),'-w','-m','immediate','stop'])
proof['scratchRemoved']=not scratch.exists()
proof['formalServiceWrites']=False
proof['scopeLimitations']={'fullRankingSessionVerified':False,'productionFlagsChanged':False,'upstreamCalendarIngestionVerified':False}
record=json.dumps(proof,sort_keys=True,ensure_ascii=True)+'\n'
target=STATE/'receipt.json'
with target.open('x',encoding='ascii') as result:
 result.write(record)
 result.flush()
 os.fsync(result.fileno())
print(record.rstrip(),flush=True)
