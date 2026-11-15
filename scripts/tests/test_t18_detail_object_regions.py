"""Closed region attribution at the unchanged bound; public fixtures only."""
import copy
import json
import os
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch
import test_t18_candidate_detail_observation as fixture
from deployment.staging.vnext.t17_keyfd import t18_detail_read_adapter as m
from deployment.staging.vnext.t17_keyfd.t18_detail_http import project_detail_http

ROOT=Path(__file__).resolve().parents[2]
CANARY='PUBLIC_KEY_VALUE_PATH_SQL_URL_MUST_NOT_ESCAPE'
def large():return {str(i):None for i in range(129)}


class ObjectRegionTests(unittest.TestCase):
 def reject(self,value,region):
  with self.assertRaises(m.DetailAdapterRejected) as caught:m._bounded(value)
  error=caught.exception
  self.assertEqual((error.reason,error.bound_subtype,error.bound_region),('BOUND_EXCEEDED','OBJECT_COUNT',region))
  self.assertEqual(str(error),'fixed_detail_read_adapter_rejected')
  self.assertEqual(m._BOUND_CONTEXT.get(),('ROOT','OTHER'))
 def test_exact_map_entry_descendant_and_fixed_detail_fact_regions(self):
  cases=(({'metadata':{'datasetCompleteness':large()}},'METADATA_DATASET_MAP'),
   ({'metadata':{'datasetCompleteness':{'PUBLIC_ENTRY':large()}}},'METADATA_OTHER'),
   ({'metadata':{'datasetCompleteness':{'PUBLIC_ENTRY':{'nested':large()}}}},'METADATA_OTHER'),
   ({'metadata':{'datasetCompleteness':[large()]}},'METADATA_OTHER'),
   ({'metadata':{'datasetCompleteness':[[large()]]}},'METADATA_OTHER'),
   ({'metadata':large()},'METADATA_OTHER'),
   ({'metadata':{'other':large()}},'METADATA_OTHER'),
   ({'detail':{'provenance':large()}},'DETAIL_PROVENANCE'),
   ({'detail':{'valuation':large()}},'DETAIL_VALUATION'),
   ({'detail':{'technical':large()}},'DETAIL_TECHNICAL'),
   ({'detail':{'sections':[large()]}},'DETAIL_SECTIONS'),
   ({'facts':[{'provenance':large()}]},'FACT_PROVENANCE'),
   ({'facts':[{'derivation':large()}]},'FACT_DERIVATION'),
   ({'detail':{'source_links':[large()]}},'OTHER'))
  for value,region in cases:self.reject(value,region)
 def test_names_do_not_reclassify_nested_or_wrong_shape_containers(self):
  for value,region in (({'other':{'metadata':{'datasetCompleteness':large()}}},'OTHER'),
   ({'detail':{'valuation':{'metadata':{'datasetCompleteness':large()}}}},'DETAIL_VALUATION'),
   ({'facts':{'provenance':large()}},'OTHER'),
   ({'facts':[[{'provenance':large()}]]},'OTHER'),
   ({'metadata':{'other':{'datasetCompleteness':large()}}},'METADATA_OTHER')):
   self.reject(value,region)
 def test_same_first_failure_and_container_check_before_child_context(self):
  first={'detail':{'valuation':large()},'metadata':{'datasetCompleteness':large()}}
  self.reject(first,'DETAIL_VALUATION');self.reject(dict(reversed(tuple(first.items()))),'METADATA_DATASET_MAP')
  with patch.object(m,'_bound_child',side_effect=AssertionError('must_not_visit_child')):self.reject(large(),'OTHER')
  with self.assertRaises(m.DetailAdapterRejected) as caught:m._bounded({'detail':{'valuation':{CANARY:9007199254740992}},'metadata':{'datasetCompleteness':large()}})
  self.assertEqual(caught.exception.bound_subtype,'JS_SAFE_NUMBER');self.assertIsNone(caught.exception.bound_region)
  self.assertEqual(m._BOUND_CONTEXT.get(),('ROOT','OTHER'))
 def test_closed_output_projection_and_no_raw_path_or_values(self):
  for region in m.BOUND_REGIONS:
   diagnostic={'category':'BOUNDS','reason':'BOUND_EXCEEDED','boundSubtype':'OBJECT_COUNT','boundRegion':region}
   value={'status':'GAP_DETAIL_PUBLIC_JSON','profileDiagnostic':diagnostic,'rawFactUrlPolicy':'NOT_OBSERVED'}
   self.assertEqual(project_detail_http(value),value)
  good={'category':'BOUNDS','reason':'BOUND_EXCEEDED','boundSubtype':'OBJECT_COUNT','boundRegion':'OTHER'}
  for key,values in (('boundRegion',(CANARY,None,True,[],{})),('boundSubtype',('DEPTH','KEY_BOUND','ARRAY_COUNT')),('category',('FACT','METADATA')),('reason',('FIELD_TYPE',))):
   for value in values:self.assertIsNone(m.project_profile_diagnostic({**good,key:value}))
  self.assertIsNone(m.project_profile_diagnostic({**good,'path':CANARY}))
  for value in ({'category':'BOUNDS','reason':'BOUND_EXCEEDED'}, {k:v for k,v in good.items() if k!='boundRegion'}):
   self.assertEqual(m.project_profile_diagnostic(value),value)
  with self.assertRaises(m.DetailAdapterRejected):m._json('{"PUBLIC_DUPLICATE":1,"PUBLIC_DUPLICATE":2}')
  with self.assertRaises(m.DetailAdapterRejected) as caught:m._bounded({'metadata':{'datasetCompleteness':{CANARY:large()}}})
  caught.exception.category='BOUNDS';_,result=m._json_gap(caught.exception)
  self.assertNotIn(CANARY,json.dumps(result));self.assertEqual(result['profileDiagnostic']['boundRegion'],'METADATA_OTHER')
 def test_source_only_frozen_composition_and_poisoning(self):
  modules=os.environ.get('T18_PUBLIC_TEST_NODE_MODULES',str(ROOT/'web/node_modules'))
  result=subprocess.run(['node',str(ROOT/'scripts/tests/t18_metadata_semantics_composition.cjs'),str(ROOT),modules],capture_output=True,text=True,timeout=15)
  self.assertEqual(result.returncode,0,result.stdout);data=json.loads(result.stdout)
  self.assertEqual(data['status'],'SOURCE_ONLY_METADATA_EQUIVALENCE_VERIFIED')
  self.assertGreaterEqual(data['equivalenceCases'],50);self.assertGreaterEqual(data['negativeCases'],7)
  self.assertFalse(data['liveImported']);self.assertFalse(data['liveBoundRelaxed'])
  self.assertEqual(data['actualMetadataRegion'],'NOT_OBSERVED');self.assertNotIn(CANARY,result.stdout)
  # The original general bound remains intact; runtime composition has its own
  # raw-source validation before this unchanged general function is invoked.
  self.reject({'metadata':{'datasetCompleteness':large()}},'METADATA_DATASET_MAP')


class ObjectRegionPgTests(unittest.TestCase):
 def setUp(self):
  self.fixture=fixture.CandidateDetailObservationTests(methodName='test_actual_genuine_shape_public_pin_optional_dossier_rows_and_no_mutation')
  self.addCleanup(self.fixture.doCleanups);self.fixture.setUp();self.sql=self.fixture.sql
 def test_actual_pg_all_regions_same_rejection_no_url_probe_no_mutation(self):
  original=json.loads(self.sql(m.PROJECTION_SQL))['projection'];detail=original['detail'];fact=original['facts'][0]
  mutations=(('METADATA_DATASET_MAP','UPDATE taiwan_data_publication_metadata_v5 SET dataset_completeness=',large()),
   ('METADATA_OTHER','UPDATE taiwan_data_publication_metadata_v5 SET dataset_completeness=',{'daily_price':large()}),
   ('DETAIL_PROVENANCE','UPDATE candidate_detail_snapshots SET provenance=',{**large(),**detail['provenance']}),
   ('DETAIL_VALUATION','UPDATE candidate_detail_snapshots SET valuation=',large()),
   ('DETAIL_TECHNICAL','UPDATE candidate_detail_snapshots SET technical=',large()),
   ('DETAIL_SECTIONS','UPDATE candidate_detail_snapshots SET sections=',[{**large(),**detail['sections'][0]}]),
   ('FACT_PROVENANCE','UPDATE candidate_official_facts SET provenance=',large()),
   ('FACT_DERIVATION','UPDATE candidate_official_facts SET derivation=',large()),
   ('OTHER','UPDATE candidate_detail_snapshots SET source_links=',[{**large(),'label':'PUBLIC_FIXTURE','url':'https://example.invalid/'}]))
  for region,statement,value in mutations:
   self.sql(statement+fixture.quote(json.dumps(value))+';');before=self.fixture.fingerprint()
   with patch.object(m,'_raw_fact_url_policy',side_effect=AssertionError('url_probe_must_not_run')) as probe:
    read,result=m.prepare_detail_read(self.sql);probe.assert_not_called()
   expected={'status':'GAP_DETAIL_PUBLIC_JSON','profileDiagnostic':{'category':'BOUNDS','reason':'BOUND_EXCEEDED','boundSubtype':'OBJECT_COUNT','boundRegion':region},'rawFactUrlPolicy':'NOT_OBSERVED'}
   # Numeric raw-map keys are now rejected by source validation before generic
   # bounds. Their rejection is retained; valid source maps are tested separately.
   if region=='METADATA_DATASET_MAP':expected['profileDiagnostic']={'category':'METADATA_DATASET','reason':'UNSUPPORTED_SEMANTICS'}
   self.assertIsNone(read);self.assertEqual(result,expected);self.assertEqual(project_detail_http(result),expected)
   self.assertEqual(before,self.fixture.fingerprint());self.assertNotIn(CANARY,json.dumps(result))
   self.assertEqual(self.sql("SELECT count(*) FROM pg_roles WHERE rolname LIKE 't18%'"),'2')
   self.assertEqual(self.sql("SELECT has_function_privilege('t18_reader','read_taiwan_data_publication_metadata_v5(date,text)','EXECUTE')"),'f')
   for column in ('provenance','valuation','technical','sections','source_links'):
    self.sql('UPDATE candidate_detail_snapshots SET '+column+'='+fixture.quote(json.dumps(detail[column]))+';')
   for column in ('provenance','derivation'):
    self.sql('UPDATE candidate_official_facts SET '+column+'='+fixture.quote(json.dumps(fact[column]))+';')
   self.sql('UPDATE taiwan_data_publication_metadata_v5 SET dataset_completeness='+fixture.quote(json.dumps(original['metadata']['datasetCompleteness']))+';')


if __name__=='__main__':unittest.main()
