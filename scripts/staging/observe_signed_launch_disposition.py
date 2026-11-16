import base64,csv,datetime,sys,hashlib,hmac,http.client,io,json,os,re,secrets,shutil,socket,subprocess,tempfile,time,urllib.parse,urllib.request,uuid
from pathlib import Path
bundle_path=Path('/var/lib/stockinsider-stage-tools/signed-turnover-20261117/bundle.json')
bundle_bytes=bundle_path.read_bytes()
assert hashlib.sha256(bundle_bytes).hexdigest()=='7dd1a8941749cfc2cba29f4791c481e1d1d6a5fdc6e508b4d4904381ac087caf'
bundle=json.loads(bundle_bytes)
MODE=sys.argv[1] if len(sys.argv)==2 else ''
assert MODE in ('live','fixture'), 'one staging mode is required'
LIVE=MODE=='live'
STATE=Path(os.environ['STATE_DIRECTORY'])
assert STATE.name==('stockinsider-stage-signed-disposition-20261117' if LIVE else 'stockinsider-stage-signed-disposition-test')
EXPECTED_DAY=datetime.date(2026,11,17)

PG=Path('/usr/lib/postgresql/17/bin')
POSTGREST='/usr/local/bin/postgrest'
RELEASE='c1b218568a079b23dc1af1d63d9d07cb464aba77'
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
 assert disk>=17*1024**3 and ram>=int(2.75*1024**3)
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
assert slot_now.date()==EXPECTED_DAY and (not LIVE or datetime.time(21,25)<=slot_now.time()<datetime.time(21,27)), 'outside the fixed staging start window'
assert STATE.is_dir() and STATE.stat().st_uid==os.getuid() and not STATE.stat().st_mode&0o077
assert not (STATE/'receipt.json').exists(), 'staging receipt already exists'
assert hashlib.sha256(Path(__file__).with_name('migration.sql').read_bytes()).hexdigest()=='91dfe4cfdaa85242b136af91b7b8d36fa45a6708120a6214347f2b6e00c37806'
assert hashlib.sha256(Path(__file__).with_name('signed-support.sql').read_bytes()).hexdigest()=='6a26f0c331d08f9589ff1fc6b05e5899f3373640813b4bcae9c387eaceb65d08'
proof={'scope':'isolated signed writer for exchange disposition reports; fixture calendar/operator',
  'mode':MODE,'resourceStart':check_capacity(),'sourceCommit':RELEASE,'targetSession':EXPECTED_DAY.isoformat(),
  'serviceStartedAt':stamp(),'bundleSha256':'7dd1a8941749cfc2cba29f4791c481e1d1d6a5fdc6e508b4d4904381ac087caf'}
scratch=None
rest=None
with tempfile.TemporaryDirectory(prefix='si-stg-disposition-signed-') as root:
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
  sql(Path(__file__).with_name('signed-support.sql').read_text(encoding='utf-8'))
  sql(Path(__file__).with_name('migration.sql').read_text(encoding='utf-8'))
  proof['reviewedGuardsInstalled']=True
  identity=str(uuid.uuid4())
  principal=str(uuid.uuid4())
  owner=str(uuid.uuid4())
  operator='staging-only-turnover'
  day=now().astimezone(TAIPEI).date()
  market_close=datetime.datetime.combine(day,datetime.time(13,30) if LIVE else datetime.time(0,0,1),TAIPEI)
  market_open=datetime.datetime.combine(day,datetime.time(9,0) if LIVE else datetime.time(0,0),TAIPEI)
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
 VALUES({literal(day)},'TWSE',{literal(market_open.isoformat())},{literal(market_close.isoformat())},'completed','twse',
  {literal(market_close.isoformat())},clock_timestamp(),'ephemeral-test-calendar-known-at-staging-setup'),
 ({literal(day)},'TPEX',{literal(market_open.isoformat())},{literal(market_close.isoformat())},'completed','tpex',
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
  query_day=day.strftime('%Y%m%d')
  endpoints={
   29082:'https://www.twse.com.tw/announcement/punish?response=open_data&startDate='+query_day+'&endDate='+query_day,
   11396:'https://www.tpex.org.tw/web/bulletin/disposal_information/disposal_information_result.php?l=zh-tw&o=data',
  }
  keys=[{'datasetId':dataset,'requestKey':str(day)} for dataset in endpoints]
  auth_wrong=hdr|{'Authorization':'Bearer '+token('service_role',b'different-test-signature')}
  denial=request('/rpc/vnext_launch_csv_command_v1',payload('enqueue',keys[0]),auth_wrong)[0]
  assert denial==401
  assert invoke('acquire_production_write_lease',{'p_lease_key':'production-data-plane','p_owner_id':owner,'p_ttl_seconds':300}) is True
  wrong_release=request('/rpc/vnext_launch_csv_command_v1',payload('enqueue',keys[0]),hdr|{'x-stockinsider-writer-release':'0'*40})[0]
  wrong_lease=request('/rpc/vnext_launch_csv_command_v1',payload('enqueue',keys[0],str(uuid.uuid4())))[0]
  assert wrong_release in (400,403) and wrong_lease in (400,403)
  assert sql('SELECT count(*) FROM public.vnext_launch_csv_bindings_v1;')=='0'
  queued={}
  for key in keys:
   receipt=csvrpc('enqueue',key)
   assert not receipt['replay'] and csvrpc('enqueue',key)['jobId']==receipt['jobId']
   queued[key['datasetId']]=receipt['jobId']
  jobs=csvrpc('claim',{'limit':2})['jobs']
  assert len(jobs)==2 and {j['datasetId']:j['jobId'] for j in jobs}==queued

  (scratch/'private-artifact-store.ts').write_text(bundle['privateStore'],encoding='utf-8')
  (scratch/'put.mjs').write_text("""import {privateArtifactStore} from './private-artifact-store.ts';
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
 """,encoding='utf-8')

  def capture(dataset,url):
   if not LIVE:
    roc=day.year-1911
    compact=f"{roc}{day.month:02d}{day.day:02d}"
    slashed=f"{roc}/{day.month:02d}/{day.day:02d}"
    sample=("編號,公布日期,證券代號,證券名稱,累計,處置條件,處置起迄時間,處置措施,處置內容,備註\n"
     +f"1,{compact},2330,測試,1,條件,{slashed}～{slashed},措施,內容,\n") if dataset==29082 else (
      "公布日期,證券代號,證券名稱,處置起訖時間,處置原因,處置內容\n"
      +f"{compact},6488,測試,{compact}~{compact},原因,內容\n")
    return 'text/csv;charset=utf-8',sample.encode()
   opener=urllib.request.build_opener(FixedSource(),urllib.request.ProxyHandler({}))
   query=urllib.request.Request(url,headers={'Accept':'text/csv, application/csv','User-Agent':'StockInsider/official-disposition-staging'})
   with opener.open(query,timeout=10) as response:
    assert response.status==200 and response.geturl()==url and response.headers.get_content_type() in ('text/csv','application/csv')
    return response.headers.get('content-type'),response.read(262145)

  def expected_symbols(dataset,content):
   rows=list(csv.reader(io.StringIO(content.decode('utf-8-sig')),strict=True))
   symbols=set()
   for row in rows[1:]:
    if not row:continue
    if dataset==29082:
     symbol=row[2]
     interval=row[6]
    else:
     symbol=row[1]
     interval=row[3]
    bounds=re.split('[～~]',interval)
    assert len(bounds)==2
    def date_value(value):
     digits=value.replace('/','')
     assert re.fullmatch('[0-9]{7}',digits)
     return datetime.date(int(digits[:3])+1911,int(digits[3:5]),int(digits[5:]))
    start,stop=map(date_value,bounds)
    if start<=day<=stop and re.fullmatch('[0-9]{4}',symbol):symbols.add(symbol)
   return len(rows)-1,symbols

  reports=[]
  for job in jobs:
   dataset=job['datasetId']
   url=endpoints[dataset]
   assert job['sourceUrl']==url
   report={'datasetId':dataset,'source':url,'requestedAt':stamp(),'stage':'transport'}
   reports.append(report)
   try:
    header,content=capture(dataset,url)
    observed=now()
    assert 2<=len(content)<=262144 and observed.astimezone(TAIPEI).date()==day and observed<ranking_cutoff
    digest=hashlib.sha256(content).hexdigest()
    row_count,symbols=expected_symbols(dataset,content)
    report.update(bytes=len(content),sha256=digest,observedAt=observed.isoformat(),reportedRows=row_count)
    report['stage']='artifact'
    write=subprocess.run(['node','--experimental-strip-types',str(scratch/'put.mjs'),str(artifacts),digest],
     input=content,capture_output=True,timeout=18,cwd=scratch)
    if write.returncode:raise RuntimeError('private artifact roundtrip failed')
    assert json.loads(write.stdout)=={'stored':True,'readback':True,'bytes':len(content)}
    register={'p_artifact_hash':digest,'p_byte_length':len(content),'p_media_type':'text/csv','p_purpose':'diagnostic_attachment',
     'p_metadata':{'storage':'private_hash_store_v1','profile':'licensed-launch-csv-v1'}}
    assert invoke('register_private_artifact_receipt_v1',register)==[{'artifact_hash':digest,'idempotent_replay':False}]
    report['stage']='complete'
    appended=csvrpc('complete',{'attemptId':job['attemptId'],'artifactHash':digest,'observedAt':observed.isoformat(),
     'httpStatus':200,'redirectCount':0,'contentType':header,'responseUrl':url},'\\x'+content.hex())
    assert appended['facts']==len(symbols) and appended['actionEligible'] is False
    capture_id=appended['captureId']
    assert sql('SELECT count(*) FROM public.vnext_launch_csv_ready_acks_v1 WHERE capture_id='+literal(capture_id))=='0'
    report['stage']='ready'
    ready=csvrpc('ready',{'attemptId':job['attemptId'],'captureId':capture_id})
    assert csvrpc('ready',{'attemptId':job['attemptId'],'captureId':capture_id})==ready
    ready_at=datetime.datetime.fromisoformat(ready['availableAt'])
    assert observed<=ready_at<ranking_cutoff
    report.update(stage='acknowledged',availableAt=ready['availableAt'],fourDigitFacts=len(symbols),
     captureId=capture_id,readyAckId=ready['readyAckId'],artifactReadbackVerified=True,
     duplicateReadySameId=True,completeAbsenceProved=False,confirmedSymbols=sorted(symbols))
   except (AssertionError,RuntimeError,ValueError,OSError,subprocess.SubprocessError):
    report['outcome']='deferred_or_uncertain'
  assert invoke('release_production_write_lease',{'p_lease_key':'production-data-plane','p_owner_id':owner}) is True
  lease_clear=sql('SELECT count(*) FROM public.production_write_leases;')=='0'
  assert lease_clear
  rest.terminate()
  rest.wait(8)
  rest=None
  del credential,jwt_secret,token
  env.pop('PGRST_JWT_SECRET',None)
  hdr.clear()

  if LIVE:
   expiry=time.monotonic()+360
   while now()<ranking_cutoff:
    assert time.monotonic()<expiry
    time.sleep(min(5,max(.03,(ranking_cutoff-now()).total_seconds())))
   assert 0<=(now()-ranking_cutoff).total_seconds()<30
  read_clock=ranking_cutoff.isoformat() if LIVE else stamp()
  for report in reports:
   if report['stage']!='acknowledged':continue
   dataset=report['datasetId']
   symbols=report.pop('confirmedSymbols')
   fn=f"public.vnext_launch_source_fact_v1({dataset},{literal(day)},symbol,repeat('1',64),{literal(read_clock)})"
   rows=(f"(SELECT unnest(ARRAY[{','.join(map(literal,symbols))}]::text[]) symbol)" if symbols else "(SELECT NULL::text symbol WHERE false)")
   assert sql("SELECT count(*) FROM "+rows+" r WHERE "+fn+"->>'captureId'="+literal(report['captureId']))==str(len(symbols))
   assert sql("SELECT "+fn.replace(',symbol,',",'0000',")+" IS NULL")=='t'
   report['readbackAtCutoff' if LIVE else 'fixtureReadbackPassed']=True
  assert sql('SELECT count(*) FROM public.taiwan_data_canonical_results_v5;')=='0'
  proof.update(verifiedAt=stamp(),originalCutoff=ranking_cutoff.isoformat(),readClock=read_clock,
   signedWriterChecks={'badSignatureHttp':denial,'wrongWriterReleaseHttp':wrong_release,'wrongLeaseHttp':wrong_lease,
    'writesAfterNegativeRequests':0,'ephemeralPostgrestUnixOnly':True,'leaseReleased':lease_clear},reports=reports)
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
if any(report['stage']!='acknowledged' for report in proof['reports']):sys.exit(2)
