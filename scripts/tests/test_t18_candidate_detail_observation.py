"""Actual owned PG17, independent public DDL/data, no native/app admission."""
import copy
import json
import select
import subprocess
from pathlib import Path
import unittest
import test_t18_reader_roles as role_fixture
from deployment.staging.vnext.t17_keyfd import candidate_detail_observation as m
from deployment.staging.vnext.t17_keyfd.t18_reader_roles import install_fixed_reader_roles
from deployment.staging.vnext.t17_keyfd.portable_restore_engine import _ValidatedClone,RestoreEngineRejected

STOCK='00000000-0000-4000-8000-000000000101'
OTHER='00000000-0000-4000-8000-000000000102'
REV='00000000-0000-4000-8000-000000000301'
FACT='00000000-0000-4000-8000-000000000201'
MARKER='PUBLIC_NARRATIVE_MUST_NOT_LEAVE_OBSERVER'


def quote(value):return "'"+str(value).replace("'","''")+"'"


class CandidateDetailObservationTests(unittest.TestCase):
 def setUp(self):
  self.pg=role_fixture.ReaderRoleTests(methodName='test_no_role_connection_or_readiness_override')
  self.addCleanup(self.pg.doCleanups);self.pg.setUp()
  self.sql=self.pg.sql
  self.sql("""
  CREATE TABLE public.stocks(id uuid PRIMARY KEY,symbol varchar(20),name varchar(255),market varchar(10));
  CREATE TABLE public.candidate_detail_snapshots(id uuid PRIMARY KEY,stock_id uuid,session_date date,lifecycle_stage text,detail_kind text,title text,summary text,sections jsonb,fact_ids jsonb,source_links jsonb,valuation jsonb,technical jsonb,as_of timestamptz,available_at timestamptz,publication_phase text,provenance jsonb);
  CREATE TABLE public.candidate_research_dossiers(id uuid,detail_snapshot_id uuid,narrative_kind text,content jsonb,validation_status text,bundle_id uuid,bundle_hash text,input_hash text,published_at timestamptz,created_at timestamptz);
  CREATE TABLE public.candidate_dossier_submission_receipts(dossier_id uuid,bundle_id uuid,revision_id uuid,input_hash text,status text,received_at timestamptz);
  CREATE TABLE public.candidate_official_facts(fact_id uuid PRIMARY KEY,stock_id uuid,fact_key text,fact_kind text,period_end date,value numeric,unit text,as_of timestamptz,available_at timestamptz,source_url text,provenance jsonb,derivation jsonb);
  CREATE TABLE public.taiwan_data_publication_metadata_v5(session_date date,publication_phase text,data_cutoff_at timestamptz,dataset_completeness jsonb,dataset_completeness_pct numeric,shadow_eligible boolean);
  CREATE FUNCTION public.read_taiwan_data_publication_metadata_v5(date,text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT jsonb_build_object('publicationPhase',publication_phase,'dataCutoffAt',data_cutoff_at,'datasetCompleteness',dataset_completeness,'datasetCompletenessPct',dataset_completeness_pct,'shadowEligible',shadow_eligible) FROM public.taiwan_data_publication_metadata_v5 WHERE session_date=$1 AND publication_phase=$2 $$;
  """)
  self.sql(f"INSERT INTO stocks VALUES('{STOCK}','1111','PUBLIC_FIXTURE_STOCK','TW'),('{OTHER}','2222','PUBLIC_OTHER','TW');")
  self.sql(f"INSERT INTO candidate_official_facts VALUES('{FACT}','{STOCK}','quarterly_revenue','official_numeric','2026-06-30',123,'TWD','2026-09-11Z','2026-09-11Z','https://example.invalid/public-fixture','{{}}','{{}}');")
  context={'revision_context':{'version':1,'scores':{'discovery':40,'research':40,'actionability':40,'dataConfidence':40},'riskAction':{'state':'data_incomplete','reasons':['PUBLIC_ONLY']}}}
  sections=[{'key':'fixture','title':'Public fixture','body':MARKER,'factIds':[FACT]}]
  self.sql(f"INSERT INTO candidate_detail_snapshots VALUES('{REV}','{STOCK}','2026-09-12','found','fact',{quote(MARKER)},{quote(MARKER)},{quote(json.dumps(sections))},'{json.dumps([FACT])}','[]','{{}}','{{}}','2026-09-12Z','2026-09-12Z','final',{quote(json.dumps(context))});")
  self.payload={'stages':{'found':[{'symbol':'1111','detailRevisionId':REV,'detailHref':f'/stock/1111?candidateRevision={REV}'}],'waiting':[],'actionable':[]}}
  self.set_payload(self.payload)
  self.sql("UPDATE radar_public_snapshots SET content_as_of='2026-09-12Z',published_at='2026-09-19Z' WHERE window_key='daily' AND status='valid';")
  self.sql("INSERT INTO taiwan_data_publication_metadata_v5 VALUES('2026-09-12','final','2026-09-12Z','{}',100,false);")
  install_fixed_reader_roles(self.sql)

 def set_payload(self,payload):
  self.sql('UPDATE radar_public_snapshots SET payload_json='+quote(json.dumps(payload))+" WHERE window_key='daily' AND status='valid';")

 def observe(self):
  result=m.assess_candidate_detail(self.sql)
  self.assertNotIn(MARKER,json.dumps(result));self.assertFalse(result['appAcceptance']);self.assertEqual(result['grantsChanged'],0)
  return result

 def fingerprint(self):
  return self.sql("SELECT md5((SELECT json_agg(t ORDER BY id)::text FROM candidate_detail_snapshots t))||md5((SELECT json_agg(t ORDER BY fact_id)::text FROM candidate_official_facts t))||md5((SELECT json_agg(t ORDER BY oid)::text FROM pg_constraint t))||md5((SELECT json_agg(t ORDER BY oid)::text FROM pg_proc t));")

 def test_actual_genuine_shape_public_pin_optional_dossier_rows_and_no_mutation(self):
  before=self.fingerprint();roles=self.sql("SELECT count(*) FROM pg_roles WHERE rolname LIKE 't18%'")
  result=self.observe()
  self.assertEqual(result['status'],'OBSERVED_PINNED_DETAIL_SCOPE')
  self.assertEqual((result['stockSymbol'],result['revisionId']),('1111',REV))
  self.assertEqual((result['requiredColumns'],result['matchingColumns'],result['matchingTables']),(60,60,7))
  self.assertEqual(result['dossierRows'],0);self.assertEqual(result['acceptedReceiptRows'],0)
  self.assertEqual(result['factIds'],1);self.assertEqual(result['revisionContextAvailable'],1)
  self.assertEqual(result['snapshotContentDate'],'2026-09-12');self.assertEqual(result['snapshotPublishedDate'],'2026-09-19')
  self.assertEqual(result['originalRpcExecution'],'NOT_GRANTED_NOT_CALLED')
  self.assertEqual(result['enrichedAcceptance'],'NOT_RUN');self.assertEqual(result['detailHttpAcceptance'],'NOT_RUN')
  for key in m.HASHES:self.assertRegex(result[key],'^[0-9a-f]{64}$')
  self.assertEqual(before,self.fingerprint());self.assertEqual(roles,self.sql("SELECT count(*) FROM pg_roles WHERE rolname LIKE 't18%'"))
  self.assertEqual(self.sql("SELECT has_function_privilege('t18_reader','read_taiwan_data_publication_metadata_v5(date,text)','EXECUTE')"),'f')

 def test_no_arbitrary_latest_private_revision_fallback_and_exact_published_href(self):
  for card,expected in (({'symbol':'1111','detailRevisionId':REV},'GAP_PUBLISHED_DETAIL_PIN'),
   ({'symbol':'2222','detailRevisionId':REV,'detailHref':f'/stock/2222?candidateRevision={REV}'},'GAP_DETAIL_REVISION'),
   ({'symbol':'1111','detailRevisionId':'00000000-0000-4000-8000-000000000399','detailHref':'/stock/1111?candidateRevision=00000000-0000-4000-8000-000000000399'},'GAP_DETAIL_REVISION')):
   self.set_payload({'stages':{'found':[card]}});self.assertEqual(self.observe()['status'],expected)
  self.set_payload({'stages':{'found':[]}});self.assertEqual(self.observe()['status'],'GAP_PUBLISHED_DETAIL_PIN')

 def test_actual_wrong_schema_and_supported_stock_varchar(self):
  self.sql('ALTER TABLE candidate_official_facts DROP COLUMN derivation;')
  result=self.observe();self.assertEqual(result['status'],'GAP_SCHEMA');self.assertEqual(result['missingColumns'],1)
  self.sql('ALTER TABLE candidate_official_facts ADD COLUMN derivation jsonb; ALTER TABLE stocks ALTER COLUMN market TYPE varchar(11);')
  result=self.observe();self.assertEqual(result['typeMismatchColumns'],1);self.assertEqual(result['status'],'GAP_SCHEMA')
  self.sql('ALTER TABLE stocks ALTER COLUMN market TYPE text;');self.assertEqual(self.observe()['status'],'OBSERVED_PINNED_DETAIL_SCOPE')

 def test_actual_fact_closure_uuid_duplicate_missing_cross_stock_future_and_paid(self):
  cases=[('UPDATE candidate_detail_snapshots SET fact_ids='+quote(json.dumps([FACT,FACT])),'duplicateFactIds'),
   ('UPDATE candidate_detail_snapshots SET fact_ids='+quote(json.dumps(['bad-id'])),'invalidFactIds'),
   ("UPDATE candidate_detail_snapshots SET fact_ids='[\"00000000-0000-4000-8000-000000000299\"]'",'missingFacts'),
   (f"UPDATE candidate_official_facts SET stock_id='{OTHER}'",'crossStockFacts'),
   ("UPDATE candidate_official_facts SET available_at='2026-09-13Z'",'futureFacts'),
   ("UPDATE candidate_official_facts SET provenance='{\"source\":\"InvestAnchors\"}'",'paidFacts')]
  for mutation,count in cases:
   self.sql('BEGIN; '+mutation+'; COMMIT;')
   result=self.observe();self.assertEqual(result['status'],'GAP_FACT_CLOSURE');self.assertGreater(result[count],0)
   self.sql(f"UPDATE candidate_detail_snapshots SET fact_ids='{json.dumps([FACT])}'; UPDATE candidate_official_facts SET stock_id='{STOCK}',available_at='2026-09-11Z',provenance='{{}}';")

 def test_actual_content_context_and_metadata_gaps_never_synthesize_rows(self):
  self.sql("UPDATE candidate_detail_snapshots SET sections='{}';")
  self.assertEqual(self.observe()['status'],'GAP_DETAIL_CONTENT')
  self.sql("UPDATE candidate_detail_snapshots SET sections='[{\"key\":\"fixture\",\"title\":\"Public\",\"body\":\"Public\",\"factIds\":[]}]',provenance='{}';")
  result=self.observe();self.assertEqual(result['status'],'GAP_REVISION_CONTEXT');self.assertEqual(result['revisionContextAvailable'],0)
  self.sql('DELETE FROM taiwan_data_publication_metadata_v5;')
  self.assertEqual(self.observe()['status'],'GAP_PUBLICATION_METADATA')

 def test_null_section_scalar_factids_or_blank_body_are_real_content_gaps(self):
  for sections in ([None],[{'key':'fixture','title':'Public','body':'Public','factIds':'scalar'}],
   [{'key':'fixture','title':'Public','body':'','factIds':[]}],[{'key':'fixture','title':'Public','body':'Public','factIds':[None]}]):
   self.sql('UPDATE candidate_detail_snapshots SET sections='+quote(json.dumps(sections))+';')
   result=self.observe();self.assertEqual(result['status'],'GAP_DETAIL_CONTENT');self.assertGreater(result['invalidSections'],0)

 def test_stable_definer_presence_is_not_execution_permission(self):
  self.sql("CREATE FUNCTION public.public_fixture_bomb() RETURNS jsonb LANGUAGE plpgsql VOLATILE AS $$ BEGIN INSERT INTO public.fixture_write_target VALUES(999); RAISE EXCEPTION 'PUBLIC_SHOULD_NOT_EXECUTE'; END $$; CREATE OR REPLACE FUNCTION public.read_taiwan_data_publication_metadata_v5(date,text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT public.public_fixture_bomb() $$; REVOKE EXECUTE ON FUNCTION public.public_fixture_bomb() FROM PUBLIC;")
  result=self.observe();self.assertEqual(result['status'],'OBSERVED_PINNED_DETAIL_SCOPE')
  self.assertEqual(self.sql('SELECT count(*) FROM fixture_write_target'),'0')
  self.assertEqual(self.sql("SELECT has_function_privilege('t18_reader','read_taiwan_data_publication_metadata_v5(date,text)','EXECUTE')"),'f')

 def test_same_stock_ambiguous_publication_tie_and_temporal_binding_reject(self):
  self.sql("UPDATE candidate_detail_snapshots SET available_at='2026-09-20Z';")
  self.assertEqual(self.observe()['status'],'GAP_DETAIL_REVISION')
  self.sql("UPDATE candidate_detail_snapshots SET available_at='2026-09-12Z'; INSERT INTO stocks VALUES('00000000-0000-4000-8000-000000000103','1111','PUBLIC_DUPLICATE','TW');")
  self.assertEqual(self.observe()['status'],'GAP_STOCK_AMBIGUITY')
  self.sql("INSERT INTO radar_public_snapshots(id,window_key,status,published_at,content_as_of,payload_json) VALUES('00000000-0000-4000-8000-000000000099','daily','valid','2026-09-19Z','2026-09-12Z','{}');")
  self.assertEqual(self.observe()['status'],'GAP_AMBIGUOUS_PUBLIC_SNAPSHOT')

 def test_exact_privacy_projection_rejects_unknown_rows_counts_route_or_hash(self):
  original=self.observe()
  for key,value in (('rawRows',MARKER),('factIds',True),('factIds',2001),('publishedCards',0),('publishedPins',0),('matchingDetailRows',0),('stockSymbol','1111&select=*'),('revisionId','bad'),('factsSha256',MARKER),('appAcceptance',True)):
   bad=copy.deepcopy(original);bad[key]=value;self.assertIsNone(m.project_candidate_detail_observation(bad))
  clone=_ValidatedClone(None,{});clone._close()
  with self.assertRaisesRegex(RestoreEngineRejected,'verified_clone_scope_closed'):clone.observe_candidate_detail()

 def test_actual_lock_budget_returns_gap_and_reaps_owned_client(self):
  env={**self.pg.env,'PGAPPNAME':'t18-public-detail-lock-fixture'}
  locker=subprocess.Popen([str(self.pg.pg/'psql'),'-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-d','t17_restored'],
   env=env,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
  try:
   locker.stdin.write(b"BEGIN; LOCK TABLE public.candidate_official_facts IN ACCESS EXCLUSIVE MODE; SELECT 'PUBLIC_LOCK_HELD'; SELECT pg_sleep(20); ROLLBACK;\n")
   locker.stdin.close();locker.stdin=None
   self.assertTrue(select.select([locker.stdout],[],[],5)[0])
   self.assertEqual(locker.stdout.readline().strip(),b'PUBLIC_LOCK_HELD')
   self.assertEqual(self.observe()['status'],'GAP_QUERY_BUDGET')
  finally:
   self.sql("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='t17_restored' AND application_name='t18-public-detail-lock-fixture';")
   locker.wait(timeout=5);locker.stdout.close()


if __name__=='__main__':unittest.main()
