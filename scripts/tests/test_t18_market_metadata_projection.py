"""Producer-backed raw map -> fixed consumer state. Synthetic owned PG17 only."""
import copy
import hashlib
import itertools
import json
import os
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch
import test_t18_candidate_detail_observation as fixture
from deployment.staging.vnext.t17_keyfd import t18_detail_read_adapter as m
from deployment.staging.vnext.t17_keyfd.fixed_read_proxy import start_fixed_read_proxy
from deployment.staging.vnext.t17_keyfd.stage_credentials import create_stage_jwt

ROOT=Path(__file__).resolve().parents[2]
CANARY='PUBLIC_UNKNOWN_PRIVATE_VALUE_MUST_NOT_ESCAPE'
DATASETS=('daily_price','daily_valuation','monthly_revenue','financial_statement','institutional_flow','margin_short','market_index','stock_master','trading_calendar')
def entry(terminal='complete',exchange='TWSE'):
 return {'terminal':terminal,'actionEligible':terminal=='complete','selectedProvider':exchange.lower(),'selectedAuthorityTier':'official_primary','persistence':'persisted' if terminal=='complete' else 'not_persisted'}
def progress(expected=10,completed=10,new=True):
 failed=expected-completed
 value={'expected':expected,'completed':completed,'failed':failed,'failedCandidate':failed,'failedCritical':0,'queued':0,'running':0,'missing':0,'retrying':0,'ready':expected>0 and completed==expected,'settled':expected>0,'researchReady':expected>0,'scopeSource':'registered_scope','cutoffAt':'2026-09-12T00:00:00+00:00'}
 if new:value['contractVersion']='taiwan-data-provider-v5'
 return value
def rows(raw_map,pct=100,shadow=False):
 return {'stock':{},'detail':{},'facts':[],'metadata':{'publicationPhase':'final','dataCutoffAt':'2026-09-12T00:00:00+00:00','datasetCompleteness':raw_map,'datasetCompletenessPct':pct,'shadowEligible':shadow}}
def large_map():
 result={f'daily_price:TWSE:{i:04d}':entry() for i in range(1000,1160)}
 result.update({f'monthly_revenue:TPEX:{i:04d}':entry('empty','TPEX') for i in range(1000,1160)})
 result['daily_valuation:TPEX']=entry('complete','TPEX');result['_refresh_scope_v6']=progress()
 return result
def oracle(test,pairs):
 modules=os.environ.get('T18_PUBLIC_TEST_NODE_MODULES',str(ROOT/'web/node_modules'))
 result=subprocess.run(['node',str(ROOT/'scripts/tests/t18_metadata_runtime_oracle.cjs'),str(ROOT),modules],input=json.dumps(pairs),text=True,capture_output=True,timeout=20)
 test.assertEqual(result.returncode,0,'fixed_frozen_metadata_oracle_failed')
 test.assertEqual(json.loads(result.stdout),{'status':'FROZEN_RAW_REDUCED_EQUIVALENT','cases':len(pairs)})
 test.assertNotIn(CANARY,result.stdout)


class MarketMetadataPrimitiveTests(unittest.TestCase):
 def reject(self,value,category=None,reason=None):
  original=copy.deepcopy(value)
  with self.assertRaises(m.DetailAdapterRejected) as caught:m._project_market_metadata(value)
  self.assertEqual(str(caught.exception),'fixed_detail_read_adapter_rejected')
  if category:self.assertEqual(caught.exception.category,category)
  if reason:self.assertEqual(caught.exception.reason,reason)
  self.assertEqual(value,original)
  self.assertEqual(m._BOUND_CONTEXT.get(),('ROOT','OTHER'))
  return caught.exception
 def test_full_validation_then_closed_reduction_keeps_raw_and_original_dates(self):
  value=rows(large_map());before=copy.deepcopy(value)
  with self.assertRaises(m.DetailAdapterRejected):m._bounded(value)
  reduced=m._project_market_metadata(value);m._bounded(reduced)
  self.assertEqual(value,before)
  self.assertEqual(reduced['metadata']['datasetCompleteness'],{'daily_price':{'terminal':'complete'},'daily_valuation':{'terminal':'complete'}})
  self.assertEqual({k:v for k,v in value['metadata'].items() if k!='datasetCompleteness'},{k:v for k,v in reduced['metadata'].items() if k!='datasetCompleteness'})
  self.assertNotIn('_refresh_scope_v6',json.dumps(reduced));self.assertNotIn('selectedProvider',json.dumps(reduced))
  oracle(self,[{'raw':value['metadata'],'reduced':reduced['metadata']}])
 def test_all_source_datasets_exchanges_provider_types_and_optional_scope_profiles(self):
  raw={f'{dataset}:{exchange}:1111':entry(exchange=exchange) for dataset,exchange in itertools.product(DATASETS,('TWSE','TPEX'))}
  for provider,tier in ((None,None),('finmind','finmind_fallback')):
   raw['daily_price:TWSE']={**entry('network_error' if provider is None else 'complete'),'selectedProvider':provider,'selectedAuthorityTier':tier}
   m._project_market_metadata(rows(raw))
  for p in (None,progress(new=False),progress(new=True),{**progress(expected=0,completed=0),'scopeSource':'phase_queue','cutoffAt':None,'contractVersion':None}):
   candidate=copy.deepcopy(raw)
   if p is not None:candidate['_refresh_scope_v6']=p
   m._project_market_metadata(rows(candidate,pct=0 if p is not None and p['expected']==0 else 100))
 def test_order_priority_absence_percent_and_shadow_match_both_frozen_sources(self):
  pairs=[]
  for terminals in itertools.product(('complete','empty','timeout','stale','conflict'),repeat=3):
   raw={'daily_price:TWSE:9999':entry(terminals[0]),'daily_price:TWSE:0001':entry(terminals[1]),'daily_price:TPEX:1234':entry(terminals[2],'TPEX'),'daily_valuation:TWSE':entry(),'monthly_revenue:TWSE':entry('http_error')}
   for mapping in (raw,dict(reversed(tuple(raw.items())))):
    value=rows(mapping);pairs.append({'raw':value['metadata'],'reduced':m._project_market_metadata(value)['metadata']})
  for raw in ({},{'daily_price:TWSE':entry()},{'daily_valuation:TWSE':entry()}):
   for pct,shadow in itertools.product((0,1,99.99,100),(False,True)):
    value=rows(raw,pct,shadow);pairs.append({'raw':value['metadata'],'reduced':m._project_market_metadata(value)['metadata']})
  oracle(self,pairs)
 def test_unknown_ignored_key_structure_pollution_or_incomplete_entry_never_disappears(self):
  for key in ('unknown:TWSE','daily_price_extra:TWSE','daily_price:','daily_price:TPEx','daily_price:TWSE:11111','__proto__','constructor','prototype'):
   self.reject(rows({key:entry()}),'METADATA_DATASET','UNSUPPORTED_SEMANTICS')
  for key in ('unknown','__proto__','constructor','prototype'):
   self.reject(rows({'monthly_revenue:TWSE':{**entry(),key:CANARY}}),'METADATA_DATASET','UNSUPPORTED_FIELD')
   self.reject(rows({'_refresh_scope_v6':{**progress(),key:CANARY}}),'METADATA_DATASET','UNSUPPORTED_FIELD')
  for field in m._RAW_ENTRY_FIELDS.split():
   value=entry();value.pop(field);self.reject(rows({'monthly_revenue:TWSE':value}),'METADATA_DATASET','MISSING_FIELD')
  for value in (None,[],True,'complete'):
   self.reject(rows({'monthly_revenue:TWSE':value}),'METADATA_DATASET','OBJECT_TYPE')
 def test_entry_enum_type_authority_poison_and_unsafe_number_refusal(self):
  for field,bad in (('terminal','PUBLIC_UNKNOWN'),('terminal',[]),('actionEligible',1),('selectedProvider','unknown'),('selectedProvider',{}),('selectedAuthorityTier','finmind_fallback'),('persistence','PUBLIC_UNKNOWN'),('selectedProvider','tpex')):
   self.reject(rows({'monthly_revenue:TWSE':{**entry(),field:bad}}))
  for pct in (-1,101,'100',True,None,float('inf')):self.reject(rows({},pct=pct))
  for shadow in (0,None,'false'):self.reject(rows({},shadow=shadow),'METADATA','FIELD_TYPE')
  for mutation in ({'expected':True},{'expected':9007199254740992},{'failed':-1},{'ready':1},{'contractVersion':'PUBLIC_UNKNOWN'},{'scopeSource':'PUBLIC_UNKNOWN'},{'cutoffAt':None}):
   self.reject(rows({'_refresh_scope_v6':{**progress(),**mutation}}))
 def test_progress_invariants_half_up_original_pct_and_shadow_not_manufactured(self):
  for expected,completed,pct in ((0,0,0),(10,9,90),(32,1,3.13),(20000,19999,99.99),(10,10,100)):
   value=rows({'_refresh_scope_v6':progress(expected,completed)},pct=pct)
   self.assertEqual(m._project_market_metadata(value)['metadata']['datasetCompletenessPct'],pct)
  for bad in ({'failedCritical':1},{'failedCandidate':1},{'queued':1},{'retrying':1},{'ready':False},{'researchReady':False},{'settled':False}):
   self.reject(rows({'_refresh_scope_v6':{**progress(),**bad}}),'METADATA_DATASET','UNSUPPORTED_SEMANTICS')
  self.reject(rows({'_refresh_scope_v6':progress(10,9)},pct=100),'METADATA','UNSUPPORTED_SEMANTICS')
  self.reject(rows({'_refresh_scope_v6':progress()},shadow=True),'METADATA','UNSUPPORTED_SEMANTICS')
 def test_dates_validate_actual_calendar_timezone_and_keep_exact_accepted_text(self):
  for date in ('2026-02-30T00:00:00Z','2026-09-12','2026-09-12T00:00:00','2026-09-12T24:00:00Z','2026-09-12T00:00:00+00:60','2026-09-12T00:00:00+15:00',None,0):
   value=rows({});value['metadata']['dataCutoffAt']=date;self.reject(value,'METADATA','FIELD_TYPE')
   value=rows({'_refresh_scope_v6':{**progress(),'cutoffAt':date}});self.reject(value,'METADATA_DATASET','FIELD_TYPE')
  for date in ('2026-09-12T00:00:00Z','2026-09-12T08:00:00.123456+08:00'):
   value=rows({});value['metadata']['dataCutoffAt']=date
   self.assertEqual(m._project_market_metadata(value)['metadata']['dataCutoffAt'],date)
 def test_private_raw_entry_all_original_bounds_and_sensitive_checks_before_discard(self):
  deep=None
  for _ in range(11):deep=[deep]
  for bad,subtype in (({str(i):None for i in range(129)},'OBJECT_COUNT'),({'X'*129:None},'KEY_BOUND'),({'extra':'X'*65537},'STRING_BYTES'),({'extra':[None]*2001},'ARRAY_COUNT'),({'extra':deep},'DEPTH'),({'extra':9007199254740992},'JS_SAFE_NUMBER')):
   error=self.reject(rows({'monthly_revenue:TWSE':bad}),'BOUNDS','BOUND_EXCEEDED');self.assertEqual(error.bound_subtype,subtype)
  self.reject(rows({'monthly_revenue:TWSE':{**entry(),'extra':'-----BEGIN PRIVATE KEY-----PUBLIC_ONLY'}}),'BOUNDS','SENSITIVE_PATTERN')
  self.reject(rows({'X'*129:entry()}),'BOUNDS','BOUND_EXCEEDED')
 def test_wire_bytes_parse_collisions_invalid_source_and_budget_refuse_before_reduction(self):
  with patch.object(m,'_json',side_effect=AssertionError('must_not_parse')):
    with self.assertRaises(m.DetailAdapterRejected):m.prepare_detail_read(lambda _: '漢'*m.MAX_BYTES)
  for raw in (b'\xff',b'\xff\xfe{\x00}\x00','{"observation":1,"obser\u0076ation":2}','{"x":NaN}','{"x":Infinity}','['*1100+']'*1100,'{',{},True):
   with patch.object(m,'_project_market_metadata',side_effect=AssertionError('must_not_reduce')):
    with self.assertRaises(m.DetailAdapterRejected) as caught:m.prepare_detail_read(lambda _:raw)
   self.assertEqual(str(caught.exception),'fixed_detail_read_adapter_rejected')
  at={f'daily_price:TWSE:{i:04d}':None for i in range(m.RAW_MARKET_MAP_MAX_ENTRIES)}
  self.reject(rows(at),'METADATA_DATASET','OBJECT_TYPE')
  at['daily_price:TPEX:9999']=None
  self.reject(rows(at),'METADATA','BOUND_EXCEEDED')
  value=rows({});value['metadata']['dataCutoffAt']='X'*(m.MAX_BYTES+1)
  self.reject(value,'METADATA','FIELD_TYPE')
  value=rows({f'daily_price:TWSE:{i:04d}':entry() for i in range(3500)})
  self.reject(value,'METADATA','BOUND_EXCEEDED')


class MarketMetadataPgTests(unittest.TestCase):
 def setUp(self):
  self.fixture=fixture.CandidateDetailObservationTests(methodName='test_actual_genuine_shape_public_pin_optional_dossier_rows_and_no_mutation')
  self.addCleanup(self.fixture.doCleanups);self.fixture.setUp();self.sql=self.fixture.sql
 def write(self,value,pct=100):
  self.sql('UPDATE taiwan_data_publication_metadata_v5 SET dataset_completeness='+fixture.quote(json.dumps(value))+',dataset_completeness_pct='+str(pct)+';')
 def fingerprint(self):
  return self.fixture.fingerprint()+self.sql('SELECT md5(json_agg(t)::text) FROM taiwan_data_publication_metadata_v5 t;')
 def test_actual_pg_large_map_dates_identity_data_grants_and_frozen_consumer(self):
  self.write(large_map());before=self.fingerprint();original=json.loads(self.sql(m.PROJECTION_SQL))
  read,status=m.prepare_detail_read(self.sql);self.assertEqual(status,{'status':'PREPARED_PRIVATE_HISTORICAL_DETAIL'})
  self.assertEqual(before,self.fingerprint());self.assertIsNotNone(read)
  for key in ('session_date','as_of','available_at'):self.assertEqual(read.rows['detail'][key],original['projection']['detail'][key])
  self.assertEqual(read.rows['detail']['id'],original['observation']['revisionId']);self.assertEqual(read.rows['stock']['symbol'],original['observation']['stockSymbol'])
  self.assertEqual(self.sql("SELECT count(*) FROM pg_roles WHERE rolname LIKE 't18%'"),'2')
  self.assertEqual(self.sql("SELECT has_function_privilege('t18_reader','read_taiwan_data_publication_metadata_v5(date,text)','EXECUTE')"),'f')
  self.assertEqual(set(read.rows['metadata']['datasetCompleteness']),{'daily_price','daily_valuation'})
  oracle(self,[{'raw':original['projection']['metadata'],'reduced':read.rows['metadata']}])
 def test_actual_pg_ignored_poison_shapes_sensitive_and_bounds_fail_before_url(self):
  for key,value in (('unknown:TWSE',entry()),('monthly_revenue:TWSE',{**entry(),'privateToken':CANARY}),('_refresh_scope_v6',{**progress(),'privateToken':CANARY}),('monthly_revenue:TPEX',{**entry('complete','TPEX'),'selectedProvider':'twse'}),('monthly_revenue:TWSE',{**entry(),'extra':'-----BEGIN PRIVATE KEY-----PUBLIC_ONLY'}),('daily_price:TWSE',{'terminal':'complete'})):
   raw=large_map();raw[key]=value;self.write(raw);before=self.fingerprint()
   with patch.object(m,'_raw_fact_url_policy',side_effect=AssertionError('must_not_observe_url')) as probe:
    read,result=m.prepare_detail_read(self.sql);probe.assert_not_called()
   self.assertIsNone(read);self.assertEqual(result['status'],'GAP_DETAIL_PUBLIC_JSON');self.assertEqual(result['rawFactUrlPolicy'],'NOT_OBSERVED')
   self.assertNotIn(CANARY,json.dumps(result));self.assertEqual(before,self.fingerprint())
 def test_actual_pg_duplicate_identity_wrong_source_type_and_next_url_gate(self):
  self.write(large_map())
  self.sql('INSERT INTO taiwan_data_publication_metadata_v5 SELECT * FROM taiwan_data_publication_metadata_v5;')
  with patch.object(m,'_project_market_metadata',side_effect=AssertionError('must_not_reduce')):
   self.assertEqual(m.prepare_detail_read(self.sql),(None,{'status':'GAP_DETAIL_SCOPE'}))
  self.sql('DELETE FROM taiwan_data_publication_metadata_v5 WHERE ctid NOT IN(SELECT min(ctid) FROM taiwan_data_publication_metadata_v5);')
  self.sql('ALTER TABLE taiwan_data_publication_metadata_v5 ALTER COLUMN dataset_completeness TYPE json USING dataset_completeness::json;')
  self.assertEqual(m.prepare_detail_read(self.sql),(None,{'status':'GAP_DETAIL_SCOPE'}))
  self.sql('ALTER TABLE taiwan_data_publication_metadata_v5 ALTER COLUMN dataset_completeness TYPE jsonb USING dataset_completeness::jsonb;')
  url='https://example.invalid/?unknown='+CANARY
  self.sql('UPDATE candidate_official_facts SET source_url='+fixture.quote(url)+';');before=self.fingerprint()
  read,result=m.prepare_detail_read(self.sql)
  self.assertIsNone(read);self.assertEqual(result,{'status':'GAP_DETAIL_PUBLIC_JSON','profileDiagnostic':{'category':'FACT_URL','reason':'URL_QUERY_HOST_POLICY'},'rawFactUrlPolicy':'REJECTED_QUERY_HOST_POLICY'})
  self.assertEqual(before,self.fingerprint());self.assertEqual(self.sql('SELECT source_url FROM candidate_official_facts'),url)
 def test_actual_pg_large_map_pinned_sdk_nextresponse_private_component(self):
  self.write(large_map());read,status=m.prepare_detail_read(self.sql);self.assertIsNotNone(read)
  secret,token=create_stage_jwt();modules=os.environ.get('T18_PUBLIC_TEST_NODE_MODULES',str(ROOT/'web/node_modules'))
  try:
   with start_fixed_read_proxy(token,detail_read=read):
    result=subprocess.run(['node',str(ROOT/'scripts/tests/t18_pinned_detail_source_harness.cjs'),str(ROOT),modules],input=json.dumps({'token':token,'symbol':'1111','revision':fixture.REV,'expectedSummary':fixture.MARKER}).encode(),capture_output=True,env={'PATH':os.environ['PATH'],'LC_ALL':'C'},timeout=15)
    self.assertEqual(result.returncode,0,'fixed_pinned_component_failed');value=json.loads(result.stdout)
    self.assertEqual(value['status'],'PINNED_SOURCE_COMPONENT_VERIFIED');self.assertNotIn(fixture.MARKER,result.stdout.decode())
  finally:secret[:]=bytes(32)


if __name__=='__main__':unittest.main()
