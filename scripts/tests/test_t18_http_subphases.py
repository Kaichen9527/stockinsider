"""Closed failure routing: public mechanics + real owned PG, no native admission."""
import ast
from contextlib import contextmanager,nullcontext
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import types
import unittest
from unittest.mock import Mock, patch
import test_t18_candidate_detail_observation as fixture
from test_t18_same_clone_mechanics import PublicFixtureBroker,EXPECTED
from test_t18_fixed_read_proxy import TOKEN
from deployment.staging.vnext.t17_keyfd import t18_same_clone as m,t18_readpoint_diagnostics as d,fixed_read_proxy as proxy
from deployment.staging.vnext.t17_keyfd import t18_detail_read_adapter as adapter,t18_detail_http as detail
from deployment.staging.vnext.t17_keyfd.stage_credentials import create_stage_jwt,StageCredentialRejected
from deployment.staging.vnext.t17_keyfd.t18_release_assets import LAUNCH_RELEASE_PINS, RELEASE_PINS

CANARY='PUBLIC_SQL_URL_STRING_ID_FILE_SECRET_MUST_NOT_ESCAPE'
STATIC=b'PUBLIC_STATIC_FIXTURE'
DAILY=json.dumps({'asOf':EXPECTED['payloadAsOf'],'snapshotPublishedAt':EXPECTED['publishedAt'],'snapshotStale':True,'stages':{'actionable':[]},'projectionHealth':{'status':'stale_readonly','freshnessStatus':'stale_readonly','actionAuthority':'disabled','acquisitionAuthority':'disabled','actionsEnabled':False,'contentAsOf':EXPECTED['payloadAsOf']}}).encode()
HEADERS={'x-stockinsider-snapshot-stale':'true','cache-control':'no-store','x-stockinsider-snapshot-published-at':EXPECTED['publishedAt']}
RELEASES=[{'sourceCommit':commit,'manifestSha256':pin,'buildId':'PUBLIC_A' if index==0 else 'PUBLIC_B'}
          for index,(commit,pin) in enumerate(RELEASE_PINS)]


class HttpSubphaseTests(unittest.TestCase):
 def assert_private(self,error):
  self.assertIsNotNone(d.project_readpoint_diagnostic(error.diagnostic))
  self.assertNotIn(CANARY,str(error)+json.dumps(error.diagnostic))
  self.assertEqual(d._HTTP_TRACE.get(),None);self.assertEqual(d._HTTP_SUBPHASE.get(),None)
 def test_every_closed_subphase_and_final_cleanup_snapshot_keep_first_error(self):
  for label in sorted(d.HTTP_SUBPHASES):
   with self.assertRaises(d.ReadpointRejected) as caught:
    with d.http_trace():
     try:
      with d.http_subphase(label):raise TimeoutError(CANARY)
     finally:d.http_completed('proxyStopped')
   e=caught.exception;self.assert_private(e)
   self.assertEqual(e.diagnostic['httpSubphase'],label);self.assertEqual(e.diagnostic['errorClass'],'timeout')
   self.assertEqual(e.diagnostic['phase'],'candidate_detail_http' if label.startswith('detail_') else 'fixed_http_exercise')
   self.assertEqual(set(e.diagnostic['completedStages']),set(d.HTTP_COMPLETED));self.assertTrue(e.diagnostic['completedStages']['proxyStopped'])
 def test_exact_bool_projection_legacy_and_lifetime_no_data_export(self):
  legacy={'phase':'fixed_http_exercise','errorClass':'timeout'}
  self.assertEqual(d.project_readpoint_diagnostic(legacy),legacy)
  flags=dict.fromkeys(d.HTTP_COMPLETED,False)
  good={**legacy,'httpSubphase':'proxy_start','completedStages':flags}
  self.assertEqual(d.project_readpoint_diagnostic(good),good)
  for bad in ({**good,'httpSubphase':CANARY},{**good,'phase':'candidate_detail_http'},{**good,'completedStages':{**flags,'raw':CANARY}},{**good,'completedStages':{**flags,'proxyStarted':1}},{**good,'extra':CANARY},{**good,'completedStages':{}},{'phase':'radar_readpoint','errorClass':'timeout','completedStages':flags}):self.assertIsNone(d.project_readpoint_diagnostic(bad))
  with self.assertRaises(ValueError) as e:d.ReadpointRejected(CANARY,'timeout')
  self.assertNotIn(CANARY,str(e.exception))
  with self.assertRaises(d.ReadpointRejected) as caught:
   with d.http_trace():
    with d.http_subphase('aba_first_a_start'):raise StageCredentialRejected('lifetime')
  self.assert_private(caught.exception);self.assertEqual(caught.exception.diagnostic['phase'],'stage_credential_lifetime')
 def test_sequence_failures_at_fixed_operations_health_and_cleanup(self):
  labels=[s+'_'+op for s in d.HTTP_STEPS for op in ('start','daily','home','static_select','static')]+['aba_first_a_stop','aba_b_stop','aba_return_a_stop','fault_inject','sequence_final_stop']
  for target in labels:
   ops=[]
   class Broker:
    def request(self,op):
     ops.append(op)
     if d._HTTP_SUBPHASE.get()==target:raise TimeoutError(CANARY)
     return {'sourceCommit':RELEASE_PINS[op=='START_B'][0]}
   def http(port,method,path):
    if d._HTTP_SUBPHASE.get()==target:raise TimeoutError(CANARY)
    if d._HTTP_SUBPHASE.get()=='fault_observe':return 503,{},b''
    if path=='/api/radar/daily':return 200,HEADERS,DAILY
    return 200,{},STATIC
   def asset(_):
    if d._HTTP_SUBPHASE.get()==target:raise TimeoutError(CANARY)
    return '/_next/static/PUBLIC.js',hashlib.sha256(STATIC).hexdigest()
   with patch.object(m,'_http',side_effect=http),patch.object(m,'_static_asset',side_effect=asset),patch.object(m.time,'sleep'):
    with self.assertRaises(d.ReadpointRejected) as caught:
     with d.http_trace():m._execute_fixed_sequence(Broker(),object(),RELEASES,{'daily':EXPECTED})
   self.assert_private(caught.exception);self.assertEqual(caught.exception.diagnostic['httpSubphase'],target)
   self.assertEqual(caught.exception.diagnostic['errorClass'],'timeout');self.assertEqual(ops[-1],'STOP_NEXT')
 def test_sequence_primary_timeout_survives_final_stop_failure(self):
  class Broker:
   def request(self,op):
    if op=='STOP_NEXT':raise OSError(CANARY)
    return {'sourceCommit':RELEASE_PINS[0][0]}
  with patch.object(m,'_http',side_effect=TimeoutError(CANARY)),patch.object(m,'_static_asset',return_value=('/_next/static/PUBLIC.js',hashlib.sha256(STATIC).hexdigest())),patch.object(m.time,'sleep'):
   with self.assertRaises(d.ReadpointRejected) as caught:
    with d.http_trace():m._execute_fixed_sequence(Broker(),object(),RELEASES,{'daily':EXPECTED})
  self.assert_private(caught.exception);self.assertEqual(caught.exception.diagnostic['httpSubphase'],'aba_first_a_daily');self.assertEqual(caught.exception.diagnostic['errorClass'],'timeout')
 def test_existing_negative_probes_distinguish_proxy_rest_ready_and_rest_denial(self):
  for target in ('proxy_denial_probes','rest_target_readiness','rest_denial_probes'):
   def http(*_):
    if d._HTTP_SUBPHASE.get()==target:raise TimeoutError(CANARY)
    return 403,{},b''
   with patch.object(m,'_http',side_effect=http):
    with self.assertRaises(d.ReadpointRejected) as caught:
     with d.http_trace():m._negative_http('PUBLIC_TOKEN')
   self.assert_private(caught.exception);self.assertEqual(caught.exception.diagnostic['httpSubphase'],target)
   flags=caught.exception.diagnostic['completedStages']
   self.assertEqual(flags['proxyDenialsPassed'],target!='proxy_denial_probes');self.assertEqual(flags['restTargetResponded'],target=='rest_denial_probes')
 def test_actual_proxy_start_failure_no_unstarted_thread_shutdown_hang(self):
  with patch.object(proxy.threading.Thread,'start',side_effect=OSError(CANARY)):
   with self.assertRaises(d.ReadpointRejected) as caught:
    with d.http_trace():
     with proxy.start_fixed_read_proxy(TOKEN):self.fail('must_not_enter')
  self.assert_private(caught.exception);self.assertEqual(caught.exception.diagnostic['httpSubphase'],'proxy_start')
  self.assertTrue(m._port_closed(3302));self.assertTrue(caught.exception.diagnostic['completedStages']['proxyStopped'])
 def test_actual_proxy_all_cleanup_attempts_preserve_body_or_cleanup_only_class(self):
  original=proxy.http.server.HTTPServer.__init__;instances=[]
  def init(server,*args,**kwargs):original(server,*args,**kwargs);instances.append(server)
  for body_fails in (True,False):
   attempted=[]
   with patch.object(proxy.http.server.HTTPServer,'__init__',init):
    with self.assertRaises(d.ReadpointRejected) as caught:
     with d.http_trace():
      with proxy.start_fixed_read_proxy(TOKEN) as handle:
       server=instances[-1]
       for name in ('shutdown_accepted','shutdown','server_close'):
        actual=getattr(server,name)
        def close(actual=actual,name=name):
         attempted.append(name);actual();raise TimeoutError(CANARY)
        setattr(server,name,close)
       if body_fails:
        with d.http_subphase('aba_b_home'):raise OSError(CANARY)
   self.assert_private(caught.exception);self.assertEqual(attempted,['shutdown_accepted','shutdown','server_close'])
   self.assertTrue(handle.closed);self.assertTrue(m._port_closed(3302))
   self.assertEqual(caught.exception.diagnostic['httpSubphase'],'aba_b_home' if body_fails else 'proxy_stop')
   self.assertEqual(caught.exception.diagnostic['errorClass'],'os_error' if body_fails else 'timeout')
 def test_projection_body_transport_is_closed_to_other_ports_methods_and_targets(self):
  route='/rest/v1/rpc/vnext_launch_reported_eps_v1'
  with patch.object(m.http.client,'HTTPConnection') as connect:
   for port,method,path,body in ((3000,'POST',route,b'{}'),(3302,'GET',route,b'{}'),
                                 (3302,'POST','/rest/v1/rpc/unknown',b'{}'),
                                 (3302,'POST',route,'{}'),(3302,'POST',route,b'*'*129)):
    with self.assertRaisesRegex(m.FixedRollbackRejected,'fixed_projection_request_rejected'):
     m._http(port,method,path,request_body=body)
   connect.assert_not_called()

 def test_low_level_http_cleanup_cannot_replace_primary_timeout(self):
  attempted=[]
  class Timer:
   def __init__(self,*_):pass
   def start(self):pass
   def cancel(self):attempted.append('cancel');raise OSError(CANARY)
   def join(self,**_):attempted.append('join')
  class Connection:
   sock=None
   def __init__(self,*_,**__):pass
   def request(self,*_,**__):raise TimeoutError(CANARY)
   def close(self):attempted.append('close');raise OSError(CANARY)
  with patch.object(m.threading,'Timer',Timer),patch.object(m.http.client,'HTTPConnection',Connection):
   with self.assertRaises(d.ReadpointRejected) as caught:
    with d.http_trace():
     with d.http_subphase('aba_first_a_daily'):m._http(3000,'GET','/api/radar/daily')
  self.assert_private(caught.exception);self.assertEqual(caught.exception.diagnostic['errorClass'],'timeout');self.assertEqual(attempted,['cancel','join','close'])
 def test_actual_python_mechanics_health_flags_not_native_next_admission(self):
  with tempfile.TemporaryDirectory(prefix='t18-public-subphase-') as root:
   broker=PublicFixtureBroker(root)
   try:
    with d.http_trace():
     result=m._execute_fixed_sequence(broker,object(),broker.releases,{'daily':EXPECTED})
     flags=dict(d._HTTP_TRACE.get()['completed'])
    self.assertEqual(result['sequence'],'A_B_A');self.assertTrue(all(flags[k] for k in ('firstAHealthPassed','bHealthPassed','returnAHealthPassed','faultBReady','faultObserved','rollbackAHealthPassed')))
    self.assertFalse(flags['detailHttpPassed']);self.assertTrue(m._port_closed(3000))
   finally:broker.close()
 def test_acceptance_constants_and_sensitive_validators_unchanged(self):
  blobs={proxy:'bafb3829de71c80ca658bcef6a083f940b39c580',m:'f355b632579b7c3058a90ba912739c3bc54496c8',detail:'af1bea3b7cdfea7a31accb65ab047a773bf91e60'}
  import inspect
  fixed_names={proxy:('_fixed_target',),m:('_validate_stale_daily','_fingerprint','_expected_dates','_static_asset'),detail:('_check_payload','project_detail_http')}
  for module,blob in blobs.items():
   source=subprocess.check_output(['git','cat-file','blob',blob]).decode();before=ast.parse(source);after=ast.parse(inspect.getsource(module))
   for name in fixed_names[module]:
    take=lambda tree:ast.dump(next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name==name),include_attributes=False)
    self.assertEqual(take(before),take(after))
   for old in before.body:
    if isinstance(old,ast.Assign) and all(isinstance(n,ast.Name) and n.id.isupper() for n in old.targets):
     new=next(n for n in after.body if isinstance(n,ast.Assign) and ast.dump(n.targets[0])==ast.dump(old.targets[0]))
     self.assertEqual(ast.dump(old,include_attributes=False),ast.dump(new,include_attributes=False))
 def test_each_release_uses_its_probe_and_only_b_is_used_to_observe_fault(self):
  app=Mock()
  app.request.side_effect=lambda op: {'sourceCommit':RELEASES[op=='START_B']['sourceCommit']}
  daily={'identity':'daily'}
  launch={'identity':'launch'}
  expected=[]
  def observe(contract):
   def health(release, facts, deadline, step):
    expected.append((release['sourceCommit'], facts, step))
    return contract
   return health
  with patch.object(m,'_health',side_effect=observe('daily')), \
       patch.object(m,'_launch_health',side_effect=observe('launch')), \
       patch.object(m,'_http',return_value=(503,{},b'')) as http:
   with d.http_trace():
    result=m._execute_fixed_sequence(app,object(),RELEASES,{'daily':daily,'launch':launch},
                                     probe_contracts=('daily','launch'))
  a,b=(release['sourceCommit'] for release in RELEASES)
  self.assertEqual(expected,[(a,daily,'aba_first_a'),(b,launch,'aba_b'),(a,daily,'aba_return_a'),
                             (b,launch,'fault_b'),(a,daily,'rollback_a')])
  http.assert_called_once_with(3000,'GET',m.LAUNCH_API)
  self.assertEqual(result['steps'],['daily','launch','daily'])
  self.assertEqual(result['recovered'],'daily')

 def test_fault_and_recovery_commit_mismatch_reject_before_http_read(self):
  for subphase in ('fault_b_start','rollback_a_start'):
   with self.subTest(subphase=subphase):
    app=Mock()
    def request(op):
     wrong=d._HTTP_SUBPHASE.get()==subphase
     return {'sourceCommit':RELEASES[(op=='START_B') != wrong]['sourceCommit']}
    app.request.side_effect=request
    with patch.object(m,'_health') as health, patch.object(m,'_http',return_value=(503,{},b'')) as http:
     with self.assertRaises(d.ReadpointRejected) as caught:
      with d.http_trace():
       m._execute_fixed_sequence(app,object(),RELEASES,{'daily':EXPECTED})
    self.assertEqual(caught.exception.diagnostic['httpSubphase'],subphase)
    self.assertEqual(health.call_count,3 if subphase=='fault_b_start' else 4)
    self.assertEqual(http.call_count,0 if subphase=='fault_b_start' else 1)
    self.assertEqual(app.request.call_args.args,('STOP_NEXT',))

 def test_unpinned_pair_rejects_before_readpoint_or_broker_access(self):
  launch_commit,launch_pin=LAUNCH_RELEASE_PINS[1]
  mixed=[RELEASES[0],{'sourceCommit':launch_commit,'manifestSha256':launch_pin}]
  tampered=[RELEASES[0],{**RELEASES[1],'manifestSha256':'0'*64}]
  for releases in (mixed,tampered,list(reversed(RELEASES)),[{}],[]):
   sql,activate,app,rest=(Mock() for _ in range(4))
   assets=type('AssetFixture',(),{'releases':releases})()
   with self.assertRaisesRegex(m.FixedRollbackRejected,'exact_pinned_release_pair_required'):
    m.run_fixed_same_clone(sql,activate,app,rest,assets)
   sql.assert_not_called()
   activate.assert_not_called()
   app.request.assert_not_called()
   rest.request.assert_not_called()

 def test_success_request_and_operation_sequence_matches_exact_baseline(self):
  baseline=types.ModuleType('deployment.staging.vnext.t17_keyfd._public_http_baseline');baseline.__package__='deployment.staging.vnext.t17_keyfd'
  source=subprocess.check_output(['git','cat-file','blob','f355b632579b7c3058a90ba912739c3bc54496c8']).decode();exec(compile(source,'PUBLIC_BASELINE','exec'),baseline.__dict__)
  outcomes=[]
  for implementation in (baseline,m):
   calls=[];ops=[];fault=[False]
   class Broker:
    def request(self,op):
     ops.append(op);fault[0]=op=='FAULT_NEXT'
     return {'sourceCommit':RELEASE_PINS[op=='START_B'][0]}
   def http(port,method,target,headers=None):
    calls.append((port,method,target,headers))
    if port in (3301,3302):return 403,{},b''
    if target=='/api/radar/daily':return (503,{},b'') if fault[0] else (200,HEADERS,DAILY)
    return 200,{},STATIC
   with patch.object(implementation,'_http',side_effect=http),patch.object(implementation,'_static_asset',return_value=('/_next/static/PUBLIC.js',hashlib.sha256(STATIC).hexdigest())):
    with d.http_trace():
     negatives=implementation._negative_http('PUBLIC_TOKEN')
     sequence=implementation._execute_fixed_sequence(Broker(),object(),RELEASES,{'daily':EXPECTED})
   outcomes.append((calls,ops,negatives,sequence))
  self.assertEqual(outcomes[0],outcomes[1]);self.assertEqual(len(outcomes[1][0]),24)


class HttpSubphasePgTests(unittest.TestCase):
 def setUp(self):
  self.fixture=fixture.CandidateDetailObservationTests(methodName='test_actual_genuine_shape_public_pin_optional_dossier_rows_and_no_mutation')
  self.addCleanup(self.fixture.doCleanups);self.fixture.setUp();self.sql=self.fixture.sql
  self.sql("UPDATE radar_public_snapshots SET payload_json=payload_json||'{\"asOf\":\"2026-09-12Z\"}' WHERE window_key IN ('home','daily');")
 def test_actual_pg_bound_gap_vs_prepared_timeout_no_leak_or_primary_mask(self):
  from deployment.staging.vnext.t17_keyfd import t18_reader_roles as roles,late_stage_credentials as late,t18_broker_transport as transport,t18_runtime_observation as budget
  for bound_gap in (True,False):
   self.sql('UPDATE candidate_detail_snapshots SET valuation='+fixture.quote(json.dumps({str(i):None for i in range(129)} if bound_gap else {}))+';')
   read,prepared=adapter.prepare_detail_read(self.sql)
   if bound_gap:self.assertEqual(prepared['profileDiagnostic']['boundSubtype'],'OBJECT_COUNT')
   else:self.assertIsNotNone(read)
   before=self.fixture.fingerprint();secret,token=create_stage_jwt();ops=[];ports=[]
   def port_probe(port):
    ports.append(port)
    if len(ports)==4:raise OSError(CANARY)
    return True
   class Broker:
    def request(self,op,**_):
     ops.append(op)
     if op=='SHUTDOWN' and len(ops)>1:raise OSError(CANARY)
     return {}
   broker=Broker()
   @contextmanager
   def connection():
    try:yield broker
    finally:raise OSError(CANARY)
   with patch.object(m,'install_fixed_reader_roles',return_value=roles.ROLE_COUNTS),patch.object(late,'request_fresh_stage',return_value=(secret,token)),patch.object(transport,'connect_fixed_app_broker',connection),patch.object(budget,'observe_three_uid_budget',return_value=None),patch.object(m,'_port_closed',side_effect=port_probe),patch.object(m,'_http',side_effect=TimeoutError(CANARY)),patch.object(detail,'exercise_detail_http',side_effect=AssertionError('detail_must_not_run')) as exercise:
    with self.assertRaises(d.ReadpointRejected) as caught:m.run_fixed_same_clone(self.sql,lambda:None,broker,broker,type('PublicAssets',(),{'releases':RELEASES})())
   diag=caught.exception.diagnostic;self.assertEqual(diag['httpSubphase'],'proxy_denial_probes');self.assertEqual(diag['errorClass'],'timeout')
   self.assertEqual(diag['completedStages']['detailPreparationGap'],bound_gap);self.assertEqual(diag['completedStages']['detailReadPrepared'],not bound_gap)
   self.assertEqual(diag['completedStages']['detailBoundsGap'],bound_gap)
   self.assertTrue(diag['completedStages']['proxyStopped']);self.assertFalse(diag['completedStages']['detailHttpPassed']);exercise.assert_not_called()
   self.assertEqual(ports,[3000,3301,3302,3000,3301,3302])
   self.assertEqual(before,self.fixture.fingerprint());self.assertEqual(secret,bytes(32));self.assertTrue(m._port_closed(3302));self.assertNotIn(CANARY,json.dumps(diag))
 def test_actual_pg_detail_page_decode_has_fixed_leaf_and_primary_survives_stop(self):
  read,_=adapter.prepare_detail_read(self.sql);row=read.rows;drow=row['detail'];fact=row['facts'][0]
  payload={'ok':True,'detail':{'revisionId':drow['id'],'symbol':row['stock']['symbol'],'chineseName':row['stock']['name'],'sessionDate':drow['session_date'],'lifecycleStage':drow['lifecycle_stage'],'detailKind':drow['detail_kind'],'title':drow['title'],'summary':drow['summary'],'valuation':drow['valuation'],'technical':drow['technical'],'narrativeKind':'deterministic_fact','scores':drow['provenance']['revision_context']['scores'],'asOf':drow['as_of'],'availableAt':drow['available_at'],'claims':[],'sections':drow['sections'],'facts':[{'factKey':fact['fact_key'],'periodEnd':fact['period_end'],'value':fact['value'],'unit':fact['unit'],'availableAt':fact['available_at']}]}}
  class Broker:
   def request(self,op):
    if op=='STOP_NEXT':raise OSError(CANARY)
    return {'sourceCommit':RELEASE_PINS[0][0]}
  with patch.object(m,'_http',side_effect=lambda port,method,target:(200,{},b'\xff') if target.startswith('/stock/') else (200,{},json.dumps(payload).encode())):
   with self.assertRaises(d.ReadpointRejected) as caught:
    with d.http_trace():detail.exercise_detail_http(Broker(),RELEASES,read)
  self.assertEqual(caught.exception.diagnostic['httpSubphase'],'detail_a_page');self.assertEqual(caught.exception.diagnostic['errorClass'],'parse_error');self.assertNotIn(CANARY,str(caught.exception)+json.dumps(caught.exception.diagnostic))


if __name__=='__main__':unittest.main()
