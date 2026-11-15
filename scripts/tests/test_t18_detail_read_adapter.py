"""Actual PG17 + private HTTP + pinned source components, synthetic rows ONLY."""
import copy
import hashlib
import http.client
import json
import os
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch
from contextlib import nullcontext
from urllib.parse import urlencode
import test_t18_candidate_detail_observation as fixture
from deployment.staging.vnext.t17_keyfd import t18_detail_read_adapter as m
from deployment.staging.vnext.t17_keyfd.fixed_read_proxy import start_fixed_read_proxy
from deployment.staging.vnext.t17_keyfd.stage_credentials import create_stage_jwt
from deployment.staging.vnext.t17_keyfd.t18_detail_http import project_detail_http,_check_payload

ROOT=Path(__file__).resolve().parents[2]


class DetailReadAdapterTests(unittest.TestCase):
 def setUp(self):
  self.fixture=fixture.CandidateDetailObservationTests(methodName='test_actual_genuine_shape_public_pin_optional_dossier_rows_and_no_mutation')
  self.addCleanup(self.fixture.doCleanups);self.fixture.setUp();self.sql=self.fixture.sql
 def prepare(self):return m.prepare_detail_read(self.sql)
 def target(self,path,fields):return '/rest/v1/'+path+'?'+urlencode(fields)
 def request(self,method,target,token,body=None,headers=None):
  c=http.client.HTTPConnection('127.0.0.1',3302,timeout=3)
  try:
   c.request(method,target,body=body,headers={'Authorization':'Bearer '+token,**(headers or {})})
   r=c.getresponse();return r.status,r.read()
  finally:c.close()
 def test_actual_sql_single_public_scope_data_and_grants_unchanged(self):
  before=self.fixture.fingerprint();read,status=self.prepare()
  self.assertEqual(status,{'status':'PREPARED_PRIVATE_HISTORICAL_DETAIL'});self.assertIsNotNone(read)
  self.assertEqual(read.rows['detail']['summary'],fixture.MARKER)
  self.assertEqual(read.rows['detail']['sections'][0]['body'],fixture.MARKER)
  self.assertEqual((len(read.rows['facts']),read.rows['metadata']['publicationPhase']),(1,'final'))
  self.assertEqual(self.fixture.fingerprint(),before)
  self.assertEqual(self.sql("SELECT count(*) FROM pg_roles WHERE rolname LIKE 't18%'"),'2')
  self.assertEqual(self.sql("SELECT has_function_privilege('t18_reader','read_taiwan_data_publication_metadata_v5(date,text)','EXECUTE')"),'f')
  self.assertNotIn(fixture.MARKER,repr(read)+json.dumps(status))
 def test_actual_empty_dossiers_are_proven_and_nonempty_is_gap(self):
  read,_=self.prepare();d=read.rows['detail']
  query={'select':m.DOSSIER_SELECT,'detail_snapshot_id':'eq.'+d['id'],'narrative_kind':'eq.codex_enriched','validation_status':'eq.valid','order':'created_at.desc','limit':'1'}
  self.assertEqual(read.response('GET',self.target('candidate_research_dossiers',query)),[])
  self.sql(f"INSERT INTO candidate_research_dossiers(id,detail_snapshot_id,narrative_kind,validation_status) VALUES('00000000-0000-4000-8000-000000000901','{fixture.REV}','codex_enriched','valid');")
  self.assertEqual(self.prepare(),(None,{'status':'GAP_AUGMENTED_DETAIL'}))
 def test_actual_unknown_nested_private_fields_and_action_surface_never_serve(self):
  mutations=[("UPDATE candidate_detail_snapshots SET sections=sections||'[ {\"key\":\"private\",\"title\":\"Public\",\"body\":\"Public\",\"factIds\":[],\"privateToken\":\"PUBLIC_SECRET_MARKER\"} ]'",'GAP_DETAIL_PUBLIC_JSON'),
   ("UPDATE candidate_detail_snapshots SET valuation='{\"privateToken\":\"PUBLIC_SECRET_MARKER\"}'",'GAP_DETAIL_PUBLIC_JSON'),
   ("UPDATE candidate_detail_snapshots SET lifecycle_stage='actionable'",'GAP_DETAIL_ACTION_SURFACE'),
   ("UPDATE candidate_detail_snapshots SET provenance=provenance||'{\"trade_plan\":{\"schema\":\"PUBLIC\"}}'",'GAP_DETAIL_ACTION_SURFACE')]
  for index,(query,status) in enumerate(mutations):
   self.sql(query+';')
   read,result=self.prepare();self.assertIsNone(read)
   expected={'status':status}
   if status=='GAP_DETAIL_PUBLIC_JSON':expected['profileDiagnostic']={'category':('SECTION' if index==0 else 'VALUATION'),'reason':'UNSUPPORTED_FIELD'}
   if status=='GAP_DETAIL_PUBLIC_JSON':expected['rawFactUrlPolicy']='ACCEPTED_URL_POLICY'
   self.assertEqual(result,expected)
   self.sql("UPDATE candidate_detail_snapshots SET lifecycle_stage='found',valuation='{}',provenance=provenance-'trade_plan',sections="+fixture.quote(json.dumps([{'key':'fixture','title':'Public fixture','body':fixture.MARKER,'factIds':[fixture.FACT]}]))+';')
 def test_actual_http_exact_get_rpc_auth_and_cross_identity_rejections(self):
  read,_=self.prepare();secret,token=create_stage_jwt()
  try:
   with start_fixed_read_proxy(token,detail_read=read):
    q={'select':m.STOCK_SELECT,'symbol':'eq.1111','market':'eq.TW'};target=self.target('stocks',q)
    status,body=self.request('GET',target,token);self.assertEqual(status,200);self.assertEqual(json.loads(body)[0]['id'],fixture.STOCK)
    for changed in ({**q,'symbol':'eq.2222'},{**q,'select':'*'},{**q,'or':'(market.eq.US)'}):self.assertEqual(self.request('GET',self.target('stocks',changed),token)[0],403)
    for auth in ('PUBLIC_WRONG_IDENTITY',''):
     self.assertEqual(self.request('GET',target,auth)[0],403)
    self.assertEqual(self.request('GET',target+'&symbol=eq.1111',token)[0],403)
    for headers in ({'Accept-Profile':'private'},{'Prefer':'count=exact'},{'Range':'0-99'}):self.assertEqual(self.request('GET',target,token,headers=headers)[0],403)
    payload=json.dumps({'p_session_date':'2026-09-12','p_publication_phase':'final'})
    self.assertEqual(self.request('POST',m.RPC_PATH,token,payload,{'Content-Type':'application/json'})[0],200)
    for payload in ('{"p_session_date":"2026-09-13","p_publication_phase":"final"}','{"p_session_date":"2026-09-12","p_publication_phase":"final","p_session_date":"2026-09-12"}'):
     self.assertEqual(self.request('POST',m.RPC_PATH,token,payload,{'Content-Type':'application/json'})[0],403)
    self.assertEqual(self.request('POST','/rest/v1/rpc/publish_radar_public_snapshots',token,'{}',{'Content-Type':'application/json'})[0],403)
    for method in ('POST','PATCH','DELETE'):self.assertIn(self.request(method,target,token)[0],(403,405))
  finally:secret[:]=bytes(32)
 def test_actual_fact_subsets_cannot_read_unadopted_other_stock_or_private_columns(self):
  read,_=self.prepare();q={'select':m.FACT_SELECT,'fact_id':'in.('+fixture.FACT+')','order':'period_end.desc','limit':'1'}
  self.assertEqual(len(read.response('GET',self.target('candidate_official_facts',q))),1)
  for changed in ({**q,'fact_id':'in.(00000000-0000-4000-8000-000000000299)'},{**q,'select':'*'},{**q,'limit':'40'},{**q,'fact_id':'in.('+fixture.FACT+','+fixture.FACT+')'}):self.assertIsNone(read.response('GET',self.target('candidate_official_facts',changed)))
 def test_actual_nested_known_keys_reject_wrong_type_canaries(self):
  for index,value in enumerate(({'businessProfile':{'operatingSegments':[{'privateToken':'PUBLIC_CANARY'}]}},
   {'forwardBvps':{'bear':{'privateToken':'PUBLIC_CANARY'}}},
   {'historicalPrices':[{'date':'2026-09-12','close':{'privateToken':'PUBLIC_CANARY'}}]},
   {'unmetConditions':[{'privateToken':'PUBLIC_CANARY'}]},
   {'researchCoverage':{'missing':[{'factKey':{'privateToken':'PUBLIC_CANARY'},'periodEnd':'2026-09-12'}]}})):
   self.sql('UPDATE candidate_detail_snapshots SET valuation='+fixture.quote(json.dumps(value))+';')
   self.assertEqual(self.prepare(),(None,{'status':'GAP_DETAIL_PUBLIC_JSON','profileDiagnostic':{'category':('BUSINESS_PROFILE','FORWARD_BVPS','VALUATION_HISTORY','VALUATION','RESEARCH_COVERAGE')[index],'reason':'FIELD_TYPE'},'rawFactUrlPolicy':'ACCEPTED_URL_POLICY'}))
 def test_actual_source_supported_factor_and_metadata_profile(self):
  factor={'score':0,'status':'missing','evidenceCount':0,'asOf':None,'reasons':['PUBLIC_ONLY'],'coveredWeight':0,'evidenceGrade':0}
  valuation={'factorEvidence':{'official':factor,'broker':factor}}
  metadata={'daily_price:TWSE':{'terminal':'complete','actionEligible':True,'selectedProvider':'twse','selectedAuthorityTier':'official_primary','persistence':'persisted'},
   'monthly_revenue:TWSE:1111':{'terminal':'http_error','actionEligible':False,'selectedProvider':None,'selectedAuthorityTier':None,'persistence':'not_persisted'}}
  self.sql('UPDATE candidate_detail_snapshots SET valuation='+fixture.quote(json.dumps(valuation))+';')
  self.sql('UPDATE taiwan_data_publication_metadata_v5 SET dataset_completeness='+fixture.quote(json.dumps(metadata))+';')
  read,result=self.prepare();self.assertIsNotNone(read);self.assertEqual(read.rows['metadata']['datasetCompleteness'],{'daily_price':{'terminal':'complete'},'daily_valuation':{'terminal':'missing'}})
  metadata['daily_price:TWSE']['privateToken']='PUBLIC_CANARY'
  self.sql('UPDATE taiwan_data_publication_metadata_v5 SET dataset_completeness='+fixture.quote(json.dumps(metadata))+';')
  self.assertEqual(self.prepare(),(None,{'status':'GAP_DETAIL_PUBLIC_JSON','profileDiagnostic':{'category':'METADATA_DATASET','reason':'UNSUPPORTED_FIELD'},'rawFactUrlPolicy':'NOT_OBSERVED'}))
 def test_actual_pinned_api_loader_sdk_nextresponse_over_private_sql_http(self):
  read,_=self.prepare();secret,token=create_stage_jwt()
  modules=os.environ.get('T18_PUBLIC_TEST_NODE_MODULES',str(ROOT/'web/node_modules'))
  try:
   with start_fixed_read_proxy(token,detail_read=read):
    result=subprocess.run(['node',str(ROOT/'scripts/tests/t18_pinned_detail_source_harness.cjs'),str(ROOT),modules],
     input=json.dumps({'token':token,'symbol':'1111','revision':fixture.REV,'expectedSummary':fixture.MARKER}).encode(),
     capture_output=True,env={'PATH':os.environ['PATH'],'LC_ALL':'C'},timeout=15)
    self.assertEqual(result.returncode,0,'public_pinned_source_component_failed')
    value=json.loads(result.stdout);self.assertEqual(value['status'],'PINNED_SOURCE_COMPONENT_VERIFIED')
    self.assertEqual((value['sections'],value['facts'],value['nextVersion']),(1,1,'16.3.4'))
    self.assertNotIn(fixture.MARKER,result.stdout.decode())
  finally:secret[:]=bytes(32)
 def test_actual_proxy_detail_clock_starts_after_authenticated_accepted_request(self):
  from deployment.staging.vnext.t17_keyfd import fixed_read_proxy as proxy
  read,_=self.prepare();secret,token=create_stage_jwt()
  target=self.target('stocks',{'select':m.STOCK_SELECT,'symbol':'eq.1111','market':'eq.TW'})
  try:
   with start_fixed_read_proxy(token,detail_read=read):
    with patch.object(proxy.time,'monotonic',return_value=1000):
     self.assertEqual(self.request('GET','/rest/v1/rpc/publish_radar_public_snapshots','PUBLIC_WRONG')[0],403)
    with patch.object(proxy.time,'monotonic',return_value=2000):self.assertEqual(self.request('GET',target,token)[0],200)
    with patch.object(proxy.time,'monotonic',return_value=2061):self.assertEqual(self.request('GET',target,token)[0],429)
  finally:secret[:]=bytes(32)
 def test_actual_sql_controller_keeps_proxy_and_final_expiry_for_detail_and_gap(self):
  from deployment.staging.vnext.t17_keyfd import t18_same_clone as controller,t18_reader_roles as roles,stage_credentials as credentials
  from deployment.staging.vnext.t17_keyfd import t18_detail_http as detail_http
  from deployment.staging.vnext.t17_keyfd import t18_broker_transport as transport,t18_runtime_observation as budget,late_stage_credentials as late
  class Broker:
   def request(self,*args,**kwargs):return {}
  read,status=self.prepare()
  for projection in ((read,status),(None,{'status':'GAP_DETAIL_SCOPE'})):
   secret,token=create_stage_jwt();app=Broker();rest=Broker()
   def probe(*_):
    target=self.target('stocks',{'select':m.STOCK_SELECT,'symbol':'eq.1111','market':'eq.TW'})
    self.assertEqual(self.request('GET',target,token)[0],200)
    return {'status':'GAP_DETAIL_SCOPE'} # private flow mechanics, never native authority
   try:
    # Actual reader SQL/fingerprints/dates and actual proxy lifecycle. Private
    # child/control callbacks only are injected; public OS admission is untouched.
    self.sql("UPDATE radar_public_snapshots SET payload_json=payload_json||'{\"asOf\":\"2026-09-12Z\"}' WHERE window_key IN ('home','daily');")
    with patch.object(controller,'install_fixed_reader_roles',return_value=roles.ROLE_COUNTS), \
         patch.object(late,'request_fresh_stage',return_value=(secret,token)), \
         patch.object(transport,'connect_fixed_app_broker',return_value=nullcontext(app)), \
         patch.object(budget,'observe_three_uid_budget',return_value=None), \
         patch.object(m,'prepare_detail_read',return_value=projection), \
         patch.object(controller,'_negative_http',return_value={}), \
         patch.object(controller,'_execute_fixed_sequence',return_value={}), \
         patch.object(detail_http,'exercise_detail_http',side_effect=probe) as exercise, \
         patch.object(controller,'validate_stage_token',wraps=credentials.validate_stage_token) as expires:
     result=controller.run_fixed_same_clone(self.sql,lambda:None,app,rest,type('PublicAssets',(),{'releases':[]})())
     self.assertEqual(exercise.call_count,int(projection[0] is not None))
     expires.assert_called_once();self.assertIn('proxyMetrics',result)
    self.assertTrue(controller._port_closed(3302));self.assertEqual(secret,bytes(32))
   finally:secret[:]=bytes(32)
 def test_detail_http_verifier_values_visible_dates_and_primary_refusal(self):
  from deployment.staging.vnext.t17_keyfd import t18_detail_http as checks,t18_same_clone as controller,t18_release_assets as assets,t18_readpoint_diagnostics as diag
  read,_=self.prepare();rows=read.rows;d=rows['detail'];f=rows['facts'][0]
  payload={'ok':True,'detail':{'revisionId':d['id'],'symbol':'1111','chineseName':rows['stock']['name'],
   'sessionDate':d['session_date'],'lifecycleStage':d['lifecycle_stage'],'detailKind':d['detail_kind'],
   'title':d['title'],'summary':d['summary'],'valuation':d['valuation'],'technical':d['technical'],
   'narrativeKind':'deterministic_fact','scores':d['provenance']['revision_context']['scores'],
   'asOf':d['as_of'],'availableAt':d['available_at'],'claims':[],
   'sections':[{'key':x['key'],'title':x['title'],'body':x['body']} for x in d['sections']],
   'facts':[{'factKey':f['fact_key'],'periodEnd':f['period_end'],'value':f['value'],'unit':f['unit'],'availableAt':f['available_at']}]}}
  releases=[{'sourceCommit':x[0]} for x in assets.RELEASE_PINS]
  class Broker:
   def request(self,op):return {'sourceCommit':assets.RELEASE_PINS[op=='START_B'][0]}
  def http(port,method,target):
   if target.startswith('/stock/'):
    return 200,{},('<main>REVISION-BOUND RESEARCH 1111 2026/9/12<article>Public fixture '+fixture.MARKER+'</article></main>').encode()
   if target=='/api/stocks/1111/candidate-detail?revision='+fixture.REV:return 200,{},json.dumps(payload).encode()
   return 400,{},b'{"error":"PUBLIC_INVALID"}'
  with patch.object(controller,'_http',side_effect=http):result=checks.exercise_detail_http(Broker(),releases,read)
  self.assertIsNotNone(project_detail_http(result));self.assertNotIn(fixture.MARKER,json.dumps(result))
  class CleanupFails:
   def request(self,op):
    if op=='STOP_NEXT':raise OSError('PUBLIC_CLEANUP_CANARY')
    return {'sourceCommit':releases[0]['sourceCommit']}
  with patch.object(controller,'_http',side_effect=TimeoutError('PUBLIC_HTTP_CANARY')),patch.object(checks.time,'sleep'):
   with self.assertRaises(diag.ReadpointRejected) as error:checks.exercise_detail_http(CleanupFails(),releases,read)
  self.assertEqual(error.exception.diagnostic,{'phase':'candidate_detail_http','errorClass':'timeout'})
 def test_receipt_projection_rejects_rows_extra_fields_and_fake_status(self):
  for bad in ({'status':'PREPARED_PRIVATE_HISTORICAL_DETAIL'},{'status':'GAP_DETAIL_SCOPE','rows':fixture.MARKER},True):self.assertIsNone(project_detail_http(bad))
  self.assertEqual(project_detail_http({'status':'GAP_DETAIL_SCOPE'}),{'status':'GAP_DETAIL_SCOPE'})


if __name__=='__main__':unittest.main()
