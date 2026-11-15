"""Actual public PG17, fixed enum diagnostics, unchanged policy differential."""
import copy
import json
import subprocess
import sys
import types
import unittest
import test_t18_candidate_detail_observation as fixture
from deployment.staging.vnext.t17_keyfd import t18_detail_read_adapter as m
from deployment.staging.vnext.t17_keyfd.t18_detail_http import project_detail_http

CANARY='PUBLIC_UNRECOGNIZED_FIELD_VALUE_ID_SQL_MUST_NOT_ESCAPE'


class DetailJsonDiagnosticTests(unittest.TestCase):
 def setUp(self):
  self.fixture=fixture.CandidateDetailObservationTests(methodName='test_actual_genuine_shape_public_pin_optional_dossier_rows_and_no_mutation')
  self.addCleanup(self.fixture.doCleanups);self.fixture.setUp();self.sql=self.fixture.sql
 def gap(self,query,category,reason,raw='ACCEPTED_URL_POLICY',subtype=None):
  before_roles=self.sql("SELECT count(*) FROM pg_roles WHERE rolname LIKE 't18%'")
  self.sql(query)
  before=self.fixture.fingerprint()
  read,result=m.prepare_detail_read(self.sql)
  self.assertIsNone(read)
  expected={'status':'GAP_DETAIL_PUBLIC_JSON','profileDiagnostic':{'category':category,'reason':reason},'rawFactUrlPolicy':raw}
  if subtype is not None:expected['profileDiagnostic']['boundSubtype']=subtype
  self.assertEqual(result,expected);self.assertEqual(project_detail_http(result),expected)
  self.assertNotIn(CANARY,json.dumps(result));self.assertEqual(self.fixture.fingerprint(),before)
  self.assertEqual(self.sql("SELECT count(*) FROM pg_roles WHERE rolname LIKE 't18%'"),before_roles)
  self.assertEqual(self.sql("SELECT has_function_privilege('t18_reader','read_taiwan_data_publication_metadata_v5(date,text)','EXECUTE')"),'f')
 def update(self,column,value):return 'UPDATE candidate_detail_snapshots SET '+column+'='+fixture.quote(json.dumps(value))+';'
 def test_actual_metadata_unknown_field_type_dataset_semantics_and_no_keys_exported(self):
  for entry,category,reason in (({CANARY:CANARY,'terminal':'complete'},'METADATA_DATASET','UNSUPPORTED_FIELD'),
   ({'terminal':{CANARY:CANARY}},'METADATA_DATASET','FIELD_TYPE')):
   entry={'actionEligible':False,'selectedProvider':None,'selectedAuthorityTier':None,'persistence':'not_persisted',**entry}
   self.gap('UPDATE taiwan_data_publication_metadata_v5 SET dataset_completeness='+fixture.quote(json.dumps({'daily_price:TWSE':entry}))+';',category,reason,raw='NOT_OBSERVED')
  self.gap('UPDATE taiwan_data_publication_metadata_v5 SET dataset_completeness='+fixture.quote(json.dumps({CANARY:{'terminal':'complete'}}))+';','METADATA_DATASET','UNSUPPORTED_SEMANTICS',raw='NOT_OBSERVED')
 def test_actual_section_and_technical_rejects_classified_not_relaxed(self):
  rows=m._json(self.sql(m.PROJECTION_SQL))['projection']
  section=copy.deepcopy(rows['detail']['sections']);section[0][CANARY]=CANARY
  self.gap(self.update('sections',section),'SECTION','UNSUPPORTED_FIELD')
  self.sql(self.update('sections',rows['detail']['sections']))
  self.gap(self.update('technical',{'close':{CANARY:CANARY}}),'TECHNICAL','FIELD_TYPE')
 def test_actual_public_locator_and_source_url_policy_remain_rejected(self):
  self.gap('UPDATE candidate_official_facts SET provenance='+fixture.quote(json.dumps({'locator':{CANARY:CANARY}}))+';','PUBLIC_LOCATOR','FIELD_TYPE')
  self.sql("UPDATE candidate_official_facts SET provenance='{}';")
  self.gap(self.update('source_links',[{'label':'PUBLIC','url':'https://example.invalid/?access_token='+CANARY}]),'SOURCE_LINK','URL_QUERY_HOST_POLICY')
 def test_actual_factor_missing_type_and_unsupported_semantics_enums(self):
  factor={'score':0,'status':'missing','evidenceCount':0,'asOf':None,'reasons':[],'coveredWeight':0,'evidenceGrade':0}
  for mutation,reason in (({'status':CANARY},'FACTOR_STATUS'),({'evidenceGrade':17},'FACTOR_GRADE'),
   ({'evidenceCount':-1},'FACTOR_COUNT'),({'score':101},'FACTOR_RANGE'),({'reasons':[{}]},'FIELD_TYPE')):
   value={**factor,**mutation}
   self.gap(self.update('valuation',{'factorEvidence':{'official':value}}),'FACTOR',reason)
  value=copy.deepcopy(factor);value.pop('evidenceGrade')
  self.gap(self.update('valuation',{'factorEvidence':{'official':value}}),'FACTOR','MISSING_FIELD')
 def test_actual_bridge_rejections_are_explicit_and_no_compatibility_added(self):
  for key,category in (('earningsBridge','EARNINGS_BRIDGE'),('forwardCommonIncomeBridge','COMMON_INCOME_BRIDGE'),('forwardCommonEquityBridge','EQUITY_BRIDGE')):
   self.gap(self.update('valuation',{key:{'status':'complete'}}),category,'UNSUPPORTED_SEMANTICS')
 def test_actual_bounds_sensitive_pattern_and_blank_stock_no_values_exported(self):
  self.gap("UPDATE candidate_detail_snapshots SET title=repeat('X',65537);",'BOUNDS','BOUND_EXCEEDED','NOT_OBSERVED',subtype='STRING_BYTES')
  self.sql("UPDATE candidate_detail_snapshots SET title='PUBLIC';")
  self.gap("UPDATE candidate_detail_snapshots SET title='-----BEGIN PRIVATE KEY-----PUBLIC_ONLY';",'BOUNDS','SENSITIVE_PATTERN','NOT_OBSERVED')
  self.sql("UPDATE candidate_detail_snapshots SET title='PUBLIC';")
  self.gap("UPDATE stocks SET name='' WHERE symbol='1111';",'STOCK','FIELD_TYPE')
 def test_actual_raw_fact_query_host_is_distinct_and_not_rewritten(self):
  url='https://example.invalid/public-fixture?access_token='+CANARY
  self.gap('UPDATE candidate_official_facts SET source_url='+fixture.quote(url)+';','FACT_URL','URL_QUERY_HOST_POLICY','REJECTED_QUERY_HOST_POLICY')
  self.assertEqual(self.sql('SELECT source_url FROM candidate_official_facts'),url)
  # Parallel policy observation cannot masquerade as first validator failure.
  self.gap(self.update('valuation',{CANARY:CANARY}),'VALUATION','UNSUPPORTED_FIELD','REJECTED_QUERY_HOST_POLICY')
 def test_raw_fact_policy_is_fixed_enum_and_not_http_authority(self):
  rows=m._json(self.sql(m.PROJECTION_SQL))['projection']
  rows['facts'][0]['source_url']='http://example.invalid/'+CANARY
  self.assertEqual(m._raw_fact_url_policy(rows),'REJECTED_URL_POLICY')
  for policy in m.RAW_FACT_URL_POLICIES:
   value={'status':'GAP_DETAIL_PUBLIC_JSON','profileDiagnostic':{'category':'FACT_URL','reason':'URL_POLICY'},'rawFactUrlPolicy':policy}
   self.assertEqual(project_detail_http(value),value)
  for policy in (CANARY,True,[],{'url':CANARY}):
   value={'status':'GAP_DETAIL_PUBLIC_JSON','profileDiagnostic':{'category':'FACT_URL','reason':'URL_POLICY'},'rawFactUrlPolicy':policy}
   self.assertIsNone(project_detail_http(value))
  for status in ('GAP_DETAIL_SCOPE','HISTORICAL_DETAIL_HTTP_VERIFIED'):
   self.assertIsNone(project_detail_http({'status':status,'rawFactUrlPolicy':'REJECTED_QUERY_HOST_POLICY'}))
 def test_closed_projection_and_generic_exception_never_include_actual_payload(self):
  for category in m.PROFILE_CATEGORIES:
   for reason in m.PROFILE_REASONS:
    value={'status':'GAP_DETAIL_PUBLIC_JSON','profileDiagnostic':{'category':category,'reason':reason}}
    self.assertEqual(project_detail_http(value),value)
  for diagnostic in ({'category':CANARY,'reason':'FIELD_TYPE'},{'category':'METADATA','reason':CANARY},
   {'category':'METADATA','reason':'FIELD_TYPE','key':CANARY},{'category':['METADATA'],'reason':'FIELD_TYPE'},True):
   self.assertIsNone(project_detail_http({'status':'GAP_DETAIL_PUBLIC_JSON','profileDiagnostic':diagnostic}))
  for status in ('GAP_DETAIL_SCOPE','GAP_AUGMENTED_DETAIL','HISTORICAL_DETAIL_HTTP_VERIFIED'):
   self.assertIsNone(project_detail_http({'status':status,'profileDiagnostic':{'category':'METADATA','reason':'FIELD_TYPE'}}))
  for failure,reason in ((KeyError(CANARY),'MISSING_FIELD'),(TypeError(CANARY),'FIELD_TYPE'),(ValueError(CANARY),'INVALID_PROFILE')):
   with self.assertRaises(m.DetailAdapterRejected) as error:
    with m._profile('METADATA'):raise failure
   self.assertEqual(m._json_gap(error.exception)[1]['profileDiagnostic'],{'category':'METADATA','reason':reason})
   self.assertNotIn(CANARY,str(error.exception)+json.dumps(m._json_gap(error.exception)[1]))
 def test_legacy_validator_accept_reject_policy_unchanged_on_public_matrix(self):
  # Baseline source is public Git code. These private helpers cannot provide
  # runtime admission; compare outcomes on actual PG-sourced synthetic rows.
  path='deployment/staging/vnext/t17_keyfd/t18_detail_read_adapter.py'
  # Exact public blob in baseline e2af3017 (requires its parent objects).
  source=subprocess.check_output(['git','cat-file','blob','d8ba71232d4e5d92dab63b1a270c2ad05c7be4eb']).decode()
  module=types.ModuleType('deployment.staging.vnext.t17_keyfd._public_policy_baseline')
  module.__package__='deployment.staging.vnext.t17_keyfd';sys.modules[module.__name__]=module
  try:
   exec(compile(source,'PUBLIC_BASELINE_SOURCE','exec'),module.__dict__)
   rows=m._json(self.sql(m.PROJECTION_SQL))['projection'];matrix=[rows]
   for column,value in (('valuation',{CANARY:CANARY}),('technical',{'close':{CANARY:CANARY}}),
    ('valuation',{'businessProfile':{'operatingSegments':[{CANARY:CANARY}]}}),
    ('valuation',{'forwardBvps':{'bear':{CANARY:CANARY}}}),('valuation',{'earningsBridge':{'status':'complete'}})):
    candidate=copy.deepcopy(rows);candidate['detail'][column]=value;matrix.append(candidate)
   candidate=copy.deepcopy(rows);candidate['facts'][0]['source_url']='https://example.invalid/?unknown='+CANARY;matrix.append(candidate)
   for factor_value in (None,0,17,True,{},[],CANARY):
    candidate=copy.deepcopy(rows);candidate['detail']['valuation']={'factorEvidence':{'official':{'score':factor_value}}};matrix.append(candidate)
   def accepted(implementation,value):
    try:implementation._bounded(value);implementation._public_shapes(value);return True
    except Exception:return False
   for candidate in matrix:self.assertEqual(accepted(module,copy.deepcopy(candidate)),accepted(m,copy.deepcopy(candidate)))
  finally:sys.modules.pop(module.__name__,None)


if __name__=='__main__':unittest.main()
