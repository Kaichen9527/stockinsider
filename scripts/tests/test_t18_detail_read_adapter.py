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
   'sources':[{'referenceNumber':1,'url':f['source_url'],'label':f['fact_key'],
    'publishedAt':f['available_at'],'locator':'quarterly_revenue:2026-06-30'}],
   'sourceLinks':[],
   'facts':[{'factKey':f['fact_key'],'periodEnd':f['period_end'],'value':f['value'],'unit':f['unit'],
    'availableAt':f['available_at'],'sourceUrl':f['source_url']}]}}
  releases=[{'sourceCommit':x[0]} for x in assets.RELEASE_PINS]
  class Broker:
   def request(self,op):return {'sourceCommit':assets.RELEASE_PINS[op=='START_B'][0]}
  def http(port,method,target):
   if target.startswith('/stock/'):
    return 200,{},('<main>REVISION-BOUND RESEARCH 1111 2026/9/12<article>Public fixture '+fixture.MARKER+'</article><div hidden><a href="'+f['source_url']+'">source</a></div></main>').encode()
   if target=='/api/stocks/1111/candidate-detail?revision='+fixture.REV:return 200,{},json.dumps(payload).encode()
   return 400,{},b'{"error":"PUBLIC_INVALID"}'
  with patch.object(controller,'_http',side_effect=http):result=checks.exercise_detail_http(Broker(),releases,read)
  self.assertIsNotNone(project_detail_http(result));self.assertNotIn(fixture.MARKER,json.dumps(result))
  self.assertEqual(result['historicalFactSourceLinksWithheld'],0)
  for count in (True,-1,1,5):
   self.assertIsNone(project_detail_http({**result,'historicalFactSourceLinksWithheld':count}))
  self.assertIsNotNone(project_detail_http({**result,'historicalFactSourceLinksWithheld':4}))
  self.assertIsNotNone(project_detail_http({k:v for k,v in result.items() if k!='historicalFactSourceLinksWithheld'}))
  page='<main>REVISION-BOUND RESEARCH 1111 2026/9/12<article>Public fixture '+fixture.MARKER+'</article><div hidden><a href="'+f['source_url']+'">source</a></div></main>'
  failures=(
   ('page',503,page.encode()),
   ('page_markup',200,bytes([255])),
   ('page_link_markup',200,page.replace('href="','href="https://unrecognized.invalid/" href="',1).encode()),
   ('page_links_missing',200,page.replace(f['source_url'],'/').encode()),
   ('page_links_changed',200,page.replace(f['source_url'],'https://unrecognized.invalid/').encode()),
   ('page_links_unexpected',200,page.replace('</main>','<a href="https://unrecognized.invalid/">extra</a></main>').encode()),
   ('page_chart_attribution',200,page.replace('</main>',
    '<section aria-labelledby="candidate-price-history"><a class="underline" href="https://www.tradingview.com/lightweight-charts/" target="_blank" rel="noreferrer">credit</a></section></main>').encode()),
   ('page_identity',200,page.replace('REVISION-BOUND RESEARCH','changed').encode()),
   ('page_sections',200,page.replace('article>','section>').encode()),
   ('page_prose',200,page.replace(fixture.MARKER,'PUBLIC_DIFFERENT').encode()),
   ('page_dates',200,page.replace('2026/9/12','2026/9/13').encode()),
  )
  for subphase,status,malformed in failures:
   def altered_http(port,method,target):
    return (status,{},malformed) if target.startswith('/stock/') else http(port,method,target)
   with self.subTest(subphase=subphase),patch.object(controller,'_http',side_effect=altered_http),diag.http_trace():
    with self.assertRaises(diag.ReadpointRejected) as failure:
     checks.exercise_detail_http(Broker(),releases,read)
    self.assertEqual(failure.exception.diagnostic['httpSubphase'],'detail_a_'+subphase)
    self.assertIsNotNone(diag.project_readpoint_diagnostic(failure.exception.diagnostic))
    self.assertNotIn(fixture.MARKER,json.dumps(failure.exception.diagnostic))
  class CleanupFails:
   def request(self,op):
    if op=='STOP_NEXT':raise OSError('PUBLIC_CLEANUP_CANARY')
    return {'sourceCommit':releases[0]['sourceCommit']}
  with patch.object(controller,'_http',side_effect=TimeoutError('PUBLIC_HTTP_CANARY')),patch.object(checks.time,'sleep'):
   with self.assertRaises(diag.ReadpointRejected) as error:checks.exercise_detail_http(CleanupFails(),releases,read)
  self.assertEqual(error.exception.diagnostic,{'phase':'candidate_detail_http','errorClass':'timeout'})

 def archived_url_scope(self):
  self.sql(f"""INSERT INTO candidate_official_facts
   SELECT ('00000000-0000-4000-8000-000000000' || (310+i)::text)::uuid,
    stock_id, fact_key, fact_kind, period_end, value+i, unit, as_of, available_at,
    CASE WHEN i<=4 THEN 'https://api.finmindtrade.com/archive?dataset=public'||i::text
         WHEN i=5 THEN 'https://www.twse.com.tw/report?date=20260912'
         ELSE 'https://example.invalid/archived-'||i::text END,
    provenance,derivation
    FROM candidate_official_facts CROSS JOIN generate_series(1,8) i WHERE fact_id='{fixture.FACT}';
   UPDATE candidate_detail_snapshots SET fact_ids=(
     SELECT jsonb_agg(fact_id ORDER BY fact_id) FROM candidate_official_facts);
  """)
  return self.historical_pins()
 def historical_pins(self):
  current=fixture.m.assess_candidate_detail(self.sql)
  self.assertEqual(current['status'],'OBSERVED_PINNED_DETAIL_SCOPE')
  return tuple(current[k] for k in ('snapshotSha256','detailSha256','factsSha256'))

 def test_pinned_scope_withholds_only_four_urls_without_mutating_clone(self):
  pins=self.archived_url_scope()
  before=self.fixture.fingerprint()
  denial={'status':'GAP_DETAIL_PUBLIC_JSON','profileDiagnostic':{'category':'FACT_URL','reason':'URL_QUERY_HOST_POLICY'},
    'rawFactUrlPolicy':'REJECTED_QUERY_HOST_POLICY'}
  self.assertEqual(self.prepare(),(None,denial))
  with patch.object(m,'_PINNED_HISTORICAL_SOURCE_SCOPE',pins):
   read,result=self.prepare()
   self.assertEqual(result,{'status':'PREPARED_PRIVATE_HISTORICAL_DETAIL'})
   self.assertEqual(read.historical_fact_source_links_withheld,4)
   self.assertEqual(sum(f['source_url'] is None for f in read.rows['facts']),4)
   self.assertEqual(len(read.rows['facts']),9)
   self.assertIn('https://www.twse.com.tw/report?date=20260912',[f['source_url'] for f in read.rows['facts']])
   self.assertEqual(sorted(f['value'] for f in read.rows['facts']),list(range(123,132)))
   self.assertTrue(all(f['available_at'].startswith('2026-09-11') for f in read.rows['facts']))
   for i in range(3):
    changed=tuple('a'*64 if j==i else v for j,v in enumerate(pins))
    with patch.object(m,'_PINNED_HISTORICAL_SOURCE_SCOPE',changed):self.assertEqual(self.prepare(),(None,denial))
  self.assertEqual(self.fixture.fingerprint(),before)
  self.assertEqual(self.sql("SELECT count(*) FROM candidate_official_facts WHERE source_url LIKE 'https://api.finmindtrade.com/%';"),'4')

 def test_pinned_scope_never_omits_unknown_queries_or_separate_links(self):
  self.archived_url_scope()
  self.sql("UPDATE candidate_official_facts SET source_url='https://unrecognized.example/report?date=20260912' WHERE source_url LIKE '%dataset=public1';")
  with patch.object(m,'_PINNED_HISTORICAL_SOURCE_SCOPE',self.historical_pins()):
   read,result=self.prepare()
   self.assertIsNone(read)
   self.assertEqual(result['profileDiagnostic'],{'category':'FACT_URL','reason':'URL_QUERY_HOST_POLICY'})
  self.sql("UPDATE candidate_official_facts SET source_url='https://api.finmindtrade.com/archive?dataset=public1' WHERE source_url LIKE 'https://unrecognized.example/%';")
  self.sql("UPDATE candidate_detail_snapshots SET source_links="+fixture.quote(json.dumps([
   {'label':'Separate link','url':'https://api.finmindtrade.com/archive?dataset=public1'}]))+';')
  with patch.object(m,'_PINNED_HISTORICAL_SOURCE_SCOPE',self.historical_pins()):
   read,result=self.prepare()
   self.assertIsNone(read)
   self.assertEqual(result['profileDiagnostic'],{'category':'SOURCE_LINK','reason':'URL_QUERY_HOST_POLICY'})

 def test_receipt_projection_rejects_rows_extra_fields_and_fake_status(self):
  for bad in ({'status':'PREPARED_PRIVATE_HISTORICAL_DETAIL'},{'status':'GAP_DETAIL_SCOPE','rows':fixture.MARKER},True):self.assertIsNone(project_detail_http(bad))
  self.assertEqual(project_detail_http({'status':'GAP_DETAIL_SCOPE'}),{'status':'GAP_DETAIL_SCOPE'})


class DetailSourceLinkChecks(unittest.TestCase):
 def setUp(self):
  self.day='2026-09-12'
  self.when=self.day+'T01:02:03+00:00'
  self.official='https://www.twse.com.tw/r?date=20260912&response=csv'
  self.independent='https://research.example/'
  f1={'fact_id':fixture.FACT,'fact_key':'official_revenue','period_end':'2026-06-30','value':12,'unit':'TWD',
      'available_at':self.when,'source_url':self.official,'provenance':{'page':2},'stock_id':fixture.STOCK}
  f2={**f1,'fact_id':'00000000-0000-4000-8000-000000000902','fact_key':'measured_balance','source_url':None}
  independent={'label':'Historical official link','url':'https://research.example','platform':'official','published_at':self.when}
  link={'label':'Exchange report','url':self.official,'factIds':[fixture.FACT]}
  context={'revision_context':{'scores':{'discovery':5,'research':4,'actionability':0,'dataConfidence':10}}}
  d={'id':fixture.REV,'session_date':self.day,'title':'fixture','summary':'fixture','lifecycle_stage':'found',
     'detail_kind':'fact','as_of':self.when,'available_at':self.when,'sections':[],'technical':{},
     'valuation':{},'provenance':context,'source_links':[link,independent],'fact_ids':[f1['fact_id'],f2['fact_id']]}
  self.rows={'detail':d,'stock':{'symbol':'1111','name':'test company'},'facts':[f1,f2]}
  p={'revisionId':d['id'],'symbol':'1111','chineseName':'test company','sessionDate':self.day,
     'lifecycleStage':'found','detailKind':'fact','title':'fixture','summary':'fixture','technical':{},
     'valuation':{},'scores':context['revision_context']['scores'],'asOf':self.when,'availableAt':self.when,
     'narrativeKind':'deterministic_fact','sections':[],'claims':[],
     'facts':[{'factKey':f['fact_key'],'periodEnd':f['period_end'],'value':f['value'],'unit':f['unit'],
       'availableAt':f['available_at'],'sourceUrl':f['source_url']} for f in (f1,f2)],
     'sourceLinks':[link,{**independent,'url':self.independent}],
     'sources':[{'referenceNumber':1,'label':'Exchange report','url':self.official,'publishedAt':None},
                {'referenceNumber':2,'label':'Historical official link','url':self.independent,'publishedAt':self.when},
                {'referenceNumber':3,'label':'official_revenue','url':self.official,'publishedAt':self.when,'locator':'page:2'}]}
  self.payload={'ok':True,'detail':p}

 def check(self,payload):
  return _check_payload(json.dumps(payload).encode(),self.rows)

 def test_accepts_exact_fact_urls_and_numbered_and_separate_source_lists(self):
  self.assertEqual(self.check(self.payload),self.payload['detail'])

 def test_fact_url_is_bound_even_when_fact_values_and_labels_are_unchanged(self):
  from deployment.staging.vnext.t17_keyfd.t18_same_clone import FixedRollbackRejected
  for index,url in ((0,None),(0,'https://different.example'),(1,self.official)):
   with self.subTest(index=index,url=url):
    payload=copy.deepcopy(self.payload)
    payload['detail']['facts'][index]['sourceUrl']=url
    with self.assertRaisesRegex(FixedRollbackRejected,'historical_detail_fact_url_changed'):self.check(payload)
  payload=copy.deepcopy(self.payload);del payload['detail']['facts'][1]['sourceUrl']
  with self.assertRaisesRegex(FixedRollbackRejected,'historical_detail_fact_url_changed'):self.check(payload)

 def test_extra_missing_replaced_or_relabelled_source_is_rejected_in_both_arrays(self):
  from deployment.staging.vnext.t17_keyfd.t18_same_clone import FixedRollbackRejected
  for field in ('sources','sourceLinks'):
   for action in ('drop','add','replace','label'):
    with self.subTest(field=field,action=action):
     payload=copy.deepcopy(self.payload);links=payload['detail'][field]
     if action=='drop':links.pop()
     if action=='add':links.append(links[-1])
     if action=='replace':links[0]['url']='https://different.example/'
     if action=='label':links[0]['label']='A different source label'
     with self.assertRaisesRegex(FixedRollbackRejected,'historical_detail_sources_changed'):self.check(payload)

 def test_streamed_markup_checks_href_with_multiplicity_while_ignoring_internal_navigation(self):
  import html
  from deployment.staging.vnext.t17_keyfd.t18_detail_http import _VisibleText,_check_page_links
  from deployment.staging.vnext.t17_keyfd.t18_same_clone import FixedRollbackRejected
  detail=self.check(self.payload)
  hrefs=[source['url'] for field in ('sources','sourceLinks') for source in detail[field]]
  def render(links,duplicate_attr=False):
   safe=[html.escape(url,quote=True) for url in links]
   extras=' href="https://different.example/"' if duplicate_attr else ''
   markup='<a href="/">home</a><div hidden id="S:0">'+''.join(
    '<a href="'+url+'"'+(extras if i==0 else '')+'>same text</a>' for i,url in enumerate(safe))+'</div>'
   parser=_VisibleText();parser.feed(markup);parser.close()
   return parser
  _check_page_links(render(hrefs),detail)
  for links,duplicates in ((hrefs[:-1],False),([*hrefs,hrefs[0]],False),
     (['https://different.example/',*hrefs[1:]],False),(hrefs,True)):
   with self.assertRaisesRegex(FixedRollbackRejected,'historical_detail_page_links_changed'):
    _check_page_links(render(links,duplicates),detail)

 def test_exact_chart_credits_per_rendered_chart_do_not_count_as_sources(self):
  import html
  from deployment.staging.vnext.t17_keyfd.t18_detail_http import _VisibleText,_check_page_links,_CHART_ATTRIBUTION
  from deployment.staging.vnext.t17_keyfd.t18_same_clone import FixedRollbackRejected
  detail=self.check(self.payload)
  detail={**detail,'valuation':{'historicalPrices':[
   {'frequency':'daily','date':'2026-09-10','close':None,'ma20':0},
   {'frequency':'monthly','month':'2026-08-31','close':101}],
   'historicalMultiples':[{'date':'2026-09-10','peRatio':10}]}}
  hrefs=[source['url'] for field in ('sources','sourceLinks') for source in detail[field]]
  evidence=''.join('<a href="'+html.escape(url,quote=True)+'">source</a>' for url in hrefs)
  a='<a class="underline" href="'+_CHART_ATTRIBUTION+'" target="_blank" rel="noreferrer">credit</a>'
  labels=['candidate-price-history','candidate-monthly-price-history','candidate-multiple-history']
  def chart(label,credit):
   return '<section aria-labelledby="'+label+'"><h3 id="'+label+'">chart</h3>'+credit+'</section>'
  charts=[chart(label,a) for label in labels]
  def parse(markup):
   parsed=_VisibleText();parsed.feed('<div hidden>'+markup+'</div>');parsed.close();return parsed
  _check_page_links(parse(evidence+''.join(charts)),detail)
  for bad in (charts[:-1], [*charts,charts[0]], [charts[0].replace(_CHART_ATTRIBUTION,'https://research.example/leak'),*charts[1:]],
    [charts[0].replace('class="underline"','class="unverified"'),*charts[1:]], [chart(labels[0],''),*charts[1:]]):
   with self.assertRaisesRegex(FixedRollbackRejected,'historical_detail_chart_attribution_changed'):
    _check_page_links(parse(evidence+''.join(bad)),detail)
  with self.assertRaisesRegex(FixedRollbackRejected,'historical_detail_page_links_changed'):
   _check_page_links(parse(evidence+''.join(charts)+a),detail)

 def test_empty_or_invalid_chart_series_does_not_authorize_credit(self):
  from deployment.staging.vnext.t17_keyfd.t18_detail_http import _expected_chart_attributions,_CHART_ATTRIBUTION
  iv={'valuation':{'historicalPrices':[
   {'frequency':'daily','date':'2026-02-30','close':100},
   {'frequency':'weekly','date':'2026-09-11','close':100},
   {'frequency':'monthly','date':'2026-08-31','ma20':13},
   {'frequency':'daily','date':'2026-09-11','close':True}],
   'historicalMultiples':[{'date':'2026-02-29','pbRatio':4},{'date':'2026-09-11','peRatio':None}]}}
  self.assertEqual(_expected_chart_attributions(iv),{})
  iv['valuation']['historicalPrices'].append({'frequency':'monthly','date':'2026-08-31','close':0})
  self.assertEqual(_expected_chart_attributions(iv),{('candidate-monthly-price-history',_CHART_ATTRIBUTION):1})


if __name__=='__main__':unittest.main()
