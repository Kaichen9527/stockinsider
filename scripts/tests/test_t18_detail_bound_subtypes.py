"""Synthetic boundary fixtures + actual owned PG17. Closed enum output only."""
import ast
import copy
import hashlib
import json
import math
import subprocess
import sys
import types
import unittest
from unittest.mock import patch
import test_t18_candidate_detail_observation as fixture
from deployment.staging.vnext.t17_keyfd import t18_detail_read_adapter as m
from deployment.staging.vnext.t17_keyfd.t18_detail_http import project_detail_http

BASELINE_BLOB='50bfcc3d9d76758741e6c18981c0cd568d044c95'
CANARY='PUBLIC_KEY_VALUE_URL_ID_SQL_MUST_NOT_ESCAPE'


def nested(depth):
 value=None
 for _ in range(depth):value=[value]
 return value


class BoundSubtypePrimitiveTests(unittest.TestCase):
 def rejected(self,value,subtype,depth=0):
  try:m._bounded(value,depth)
  except m.DetailAdapterRejected as error:
   self.assertEqual((error.reason,error.bound_subtype),('BOUND_EXCEEDED',subtype))
   self.assertEqual(str(error),'fixed_detail_read_adapter_rejected')
   return
  self.fail('public_fixture_expected_bound_refusal')
 def test_exact_depth_boundary_and_depth_before_scalar_type(self):
  m._bounded(nested(12));self.rejected(nested(13),'DEPTH')
  self.rejected(9007199254740992,'DEPTH',depth=13)
 def test_exact_js_safe_number_boundary_finiteness_and_bool_semantics(self):
  for value in (9007199254740991,-9007199254740991,1.5,True,False,None):m._bounded(value)
  for value in (9007199254740992,-9007199254740992,float('inf'),float('-inf'),float('nan')):self.rejected(value,'JS_SAFE_NUMBER')
 def test_exact_string_byte_boundary_including_utf8(self):
  m._bounded('X'*65536);self.rejected('X'*65537,'STRING_BYTES')
  m._bounded('漢'*21845);self.rejected('漢'*21846,'STRING_BYTES')
 def test_exact_array_object_and_key_boundaries(self):
  m._bounded([None]*2000);self.rejected([None]*2001,'ARRAY_COUNT')
  m._bounded({str(i):None for i in range(128)});self.rejected({str(i):None for i in range(129)},'OBJECT_COUNT')
  m._bounded({'X'*128:None});m._bounded({'漢'*128:None})
  self.rejected({'X'*129:None},'KEY_BOUND');self.rejected({CANARY:None,1:None},'KEY_BOUND')
 def test_container_checks_and_insertion_traversal_preserve_first_failure(self):
  self.rejected([9007199254740992]+[None]*2000,'ARRAY_COUNT')
  self.rejected({**{str(i):None for i in range(128)},None:None},'OBJECT_COUNT')
  self.rejected({'first':9007199254740992,'X'*129:None},'JS_SAFE_NUMBER')
  self.rejected({'X'*129:None,'second':9007199254740992},'KEY_BOUND')
  self.rejected(['X'*65537,9007199254740992],'STRING_BYTES')
  self.rejected([9007199254740992,'X'*65537],'JS_SAFE_NUMBER')
 def test_closed_subtype_projection_scope_and_no_data_export(self):
  for subtype in m.BOUND_SUBTYPES:
   diagnostic={'category':'BOUNDS','reason':'BOUND_EXCEEDED','boundSubtype':subtype}
   value={'status':'GAP_DETAIL_PUBLIC_JSON','profileDiagnostic':diagnostic,'rawFactUrlPolicy':'NOT_OBSERVED'}
   self.assertEqual(project_detail_http(value),value)
  for subtype in (CANARY,True,[],{'value':CANARY},None):
   self.assertIsNone(m.project_profile_diagnostic({'category':'BOUNDS','reason':'BOUND_EXCEEDED','boundSubtype':subtype}))
  for category,reason in (('FACT','BOUND_EXCEEDED'),('BOUNDS','SENSITIVE_PATTERN')):
   self.assertIsNone(m.project_profile_diagnostic({'category':category,'reason':reason,'boundSubtype':'DEPTH'}))
  self.assertIsNone(m.project_profile_diagnostic({'category':'BOUNDS','reason':'BOUND_EXCEEDED','boundSubtype':'DEPTH','observed':CANARY}))
  self.assertEqual(m.project_profile_diagnostic({'category':'BOUNDS','reason':'BOUND_EXCEEDED'}),{'category':'BOUNDS','reason':'BOUND_EXCEEDED'})
  error=m.DetailAdapterRejected('BOUND_EXCEEDED',bound_subtype=CANARY);error.category='BOUNDS'
  with self.assertRaises(m.DetailAdapterRejected) as rejected:m._json_gap(error)
  self.assertNotIn(CANARY,str(rejected.exception))
 def test_original_bound_predicates_traversal_and_contract_constants_identical(self):
  source=subprocess.check_output(['git','cat-file','blob',BASELINE_BLOB]).decode()
  original=ast.parse(source);current=ast.parse(__import__('inspect').getsource(m))
  class StripDiagnosticKeyword(ast.NodeTransformer):
   def visit_Call(self,node):
    self.generic_visit(node)
    if isinstance(node.func,ast.Name) and node.func.id=='DetailAdapterRejected':node.keywords=[x for x in node.keywords if x.arg!='bound_subtype']
    return node
  def bound_tree(tree):
   function=next(x for x in tree.body if isinstance(x,ast.FunctionDef) and x.name=='_bounded')
   return ast.dump(StripDiagnosticKeyword().visit(function),include_attributes=False)
  self.assertEqual(bound_tree(original),bound_tree(current))
  module=types.ModuleType('deployment.staging.vnext.t17_keyfd._public_bound_baseline');module.__package__='deployment.staging.vnext.t17_keyfd';sys.modules[module.__name__]=module
  try:
   exec(compile(source,'PUBLIC_BOUND_BASELINE','exec'),module.__dict__)
   for name in ('PROJECTION_SQL','MAX_BYTES','STOCK_SELECT','DETAIL_SELECT','DOSSIER_SELECT','RECEIPT_SELECT','FACT_SELECT','RPC_PATH'):
    old,new=getattr(module,name),getattr(m,name)
    if type(old) is bytes:self.assertEqual(hashlib.sha256(old).digest(),hashlib.sha256(new).digest())
    else:self.assertEqual(old,new)
   # Old/new first bound subtype semantics can be compared via old rejection
   # outcome while the AST proof above verifies exact condition/order identity.
   for value in (nested(12),nested(13),9007199254740991,9007199254740992,'X'*65537,[None]*2001,{'X'*129:None}):
    outcomes=[]
    for implementation in (module,m):
     try:implementation._bounded(copy.deepcopy(value));outcomes.append(True)
     except Exception:outcomes.append(False)
    self.assertEqual(outcomes[0],outcomes[1])
  finally:sys.modules.pop(module.__name__,None)


class BoundSubtypePgTests(unittest.TestCase):
 def setUp(self):
  self.fixture=fixture.CandidateDetailObservationTests(methodName='test_actual_genuine_shape_public_pin_optional_dossier_rows_and_no_mutation')
  self.addCleanup(self.fixture.doCleanups);self.fixture.setUp();self.sql=self.fixture.sql
 def test_actual_pg_all_six_bound_subtypes_reject_before_url_probe_without_mutation(self):
  original=json.loads(self.sql(m.PROJECTION_SQL))['projection']['detail']
  mutations=(('DEPTH',"UPDATE candidate_detail_snapshots SET valuation="+fixture.quote(json.dumps({'fixture':nested(10)}))+';'),
   ('JS_SAFE_NUMBER','UPDATE candidate_official_facts SET value=9007199254740992;'),
   ('STRING_BYTES',"UPDATE candidate_detail_snapshots SET title=repeat('X',65537);"),
   ('ARRAY_COUNT','UPDATE candidate_detail_snapshots SET technical='+fixture.quote(json.dumps({'fixture':[None]*2001}))+';'),
   ('OBJECT_COUNT','UPDATE candidate_detail_snapshots SET valuation='+fixture.quote(json.dumps({str(i):None for i in range(129)}))+';'),
   ('KEY_BOUND','UPDATE candidate_detail_snapshots SET technical='+fixture.quote(json.dumps({'X'*129:None}))+';'))
  for subtype,mutation in mutations:
   self.sql(mutation);before=self.fixture.fingerprint()
   with patch.object(m,'_raw_fact_url_policy',side_effect=AssertionError('url_probe_must_not_run')) as probe:
    read,result=m.prepare_detail_read(self.sql);probe.assert_not_called()
   self.assertIsNone(read)
   self.assertEqual(result,{'status':'GAP_DETAIL_PUBLIC_JSON','profileDiagnostic':{'category':'BOUNDS','reason':'BOUND_EXCEEDED','boundSubtype':subtype},'rawFactUrlPolicy':'NOT_OBSERVED'})
   self.assertEqual(project_detail_http(result),result);self.assertNotIn(CANARY,json.dumps(result))
   self.assertEqual(self.fixture.fingerprint(),before)
   self.assertEqual(self.sql("SELECT count(*) FROM pg_roles WHERE rolname LIKE 't18%'"),'2')
   self.assertEqual(self.sql("SELECT has_function_privilege('t18_reader','read_taiwan_data_publication_metadata_v5(date,text)','EXECUTE')"),'f')
   self.sql('UPDATE candidate_detail_snapshots SET title='+fixture.quote(original['title'])+",valuation='{}',technical='{}'; UPDATE candidate_official_facts SET value=123;")
 def test_actual_pg_first_array_rejection_does_not_observe_later_url_policy(self):
  self.sql('UPDATE candidate_detail_snapshots SET technical='+fixture.quote(json.dumps({'fixture':[None]*2001}))+';')
  self.sql('UPDATE candidate_official_facts SET source_url='+fixture.quote('https://example.invalid/?unknown='+CANARY)+';')
  with patch.object(m,'_raw_fact_url_policy',side_effect=AssertionError('url_probe_must_not_run')) as probe:
   read,result=m.prepare_detail_read(self.sql);probe.assert_not_called()
  self.assertIsNone(read);self.assertEqual(result['profileDiagnostic']['boundSubtype'],'ARRAY_COUNT')
  self.assertEqual(result['rawFactUrlPolicy'],'NOT_OBSERVED')


if __name__=='__main__':unittest.main()
