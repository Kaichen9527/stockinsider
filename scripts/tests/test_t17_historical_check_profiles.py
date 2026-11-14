"""Actual PG17 catalog/row-profile tests with generated public data only."""
import hashlib
import json
import os
from pathlib import Path
import pwd
import shutil
import subprocess
import tempfile
import time
import unittest
from deployment.staging.vnext.t17_keyfd import historical_check_profiles as m
from deployment.staging.vnext.t17_keyfd.portable_sql_fixture_adapter import _tools
from deployment.staging.vnext.t17_keyfd.portable_restore_engine import _limits

PAID="content::text !~* '(investanchors|investanchor|定錨投資|定錨會員)'"
FINANCE="validation_status IN ('validated','pending','rejected','stale','conflict')"
VALUATION="valuation_method IS NULL OR valuation_method IN ('forward_12m','normalized_cycle','pb_reference','ev_ebitda','financial_pb_roe','ttm_multiple_reference','turnaround_conditional','no_defensible_valuation_method','insufficient_official_evidence')"


class HistoricalCheckTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pg,_=_tools();cls.root=Path(tempfile.mkdtemp(prefix='t17-profile-public-',dir='/tmp'))
        cls.sock=cls.root/'s';cls.sock.mkdir(mode=0o700);data=cls.root/'data'
        user=pwd.getpwuid(os.getuid()).pw_name
        cls.env={'PATH':str(cls.pg)+':/usr/bin:/bin','HOME':str(cls.root),'LC_ALL':'C',
          'PGHOST':str(cls.sock),'PGPORT':'6553','PGUSER':user,'PGDATABASE':'postgres',
          'PGPASSFILE':'/dev/null','PGSERVICEFILE':'/dev/null','PGCONNECT_TIMEOUT':'2'}
        cls.process=cls.log=None
        try:
            cls.runpg('initdb',['-D',str(data),'-U',user,'--auth-local=peer','--auth-host=reject','--no-locale','--encoding=UTF8'])
            with (data/'postgresql.conf').open('a') as f:
                f.write("\nlisten_addresses=''\nport=6553\nunix_socket_directories='"+str(cls.sock)+"'\n"
                    "unix_socket_permissions=0700\nshared_buffers=16MB\nmax_connections=4\n"
                    "max_worker_processes=0\nmax_parallel_workers=0\nautovacuum=off\njit=off\n")
            cls.log=(cls.root/'postgres.log').open('wb')
            cls.process=subprocess.Popen([str(cls.pg/'postgres'),'-D',str(data)],env=cls.env,
                 stdin=subprocess.DEVNULL,stdout=cls.log,stderr=cls.log,preexec_fn=_limits)
            for _ in range(40):
                p=subprocess.run([str(cls.pg/'pg_isready')],env=cls.env,capture_output=True,timeout=3)
                if p.returncode==0:break
                if cls.process.poll() is not None:raise RuntimeError('public_fixture_start_failed')
                time.sleep(.1)
            else:raise RuntimeError('public_fixture_start_timeout')
        except BaseException:
            cls.tearDownClass();raise

    @classmethod
    def tearDownClass(cls):
        if cls.process:
            if cls.process.poll() is None:cls.process.terminate()
            try:cls.process.wait(timeout=8)
            except subprocess.TimeoutExpired:cls.process.kill();cls.process.wait(timeout=5)
        if cls.log:cls.log.close()
        shutil.rmtree(cls.root)

    @classmethod
    def runpg(cls,name,args,stdin=None):
        p=subprocess.run([str(cls.pg/name),*args],env=cls.env,input=stdin,
                         capture_output=True,timeout=20,preexec_fn=_limits)
        if p.returncode:raise RuntimeError('public_profile_fixture_sql_failed:'+p.stderr.decode()[:600])
        return p.stdout.decode().strip()

    def setUp(self):
        self.db='profile_'+self._testMethodName.removeprefix('test_')[:40]
        self.runpg('createdb',[self.db])

    def sql(self,script):
        if isinstance(script,str):script=script.encode()
        return self.runpg('psql',['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-d',self.db],script)

    def fixture(self,bad_row=False,finance_type='text',finance_collation=''):
        if finance_type=='fixture_enum':
            self.sql("CREATE TYPE public.financial_validation_status_v3 AS ENUM ('pending','validated','rejected','conflict','stale');")
            finance_type='public.financial_validation_status_v3'
        self.sql(f"""CREATE TABLE candidate_research_dossiers(id integer PRIMARY KEY,content jsonb NOT NULL);
          CREATE TABLE opportunity_financial_facts_v3(id integer PRIMARY KEY,validation_status {finance_type}{finance_collation} NOT NULL);
          CREATE TABLE candidate_research_run_items(id integer PRIMARY KEY,valuation_method text);
          INSERT INTO candidate_research_dossiers VALUES(1,'{{"marker":"PUBLIC_FIXTURE"}}');
          INSERT INTO opportunity_financial_facts_v3 VALUES(1,'pending');
          INSERT INTO candidate_research_run_items VALUES(1,NULL),(2,'forward_12m');""")
        if bad_row:self.sql("UPDATE opportunity_financial_facts_v3 SET validation_status='UNACCEPTED_PUBLIC_FIXTURE';")
        self.sql(f"""ALTER TABLE candidate_research_dossiers ADD CONSTRAINT candidate_research_dossiers_paid_content_check CHECK({PAID}) NOT VALID;
          ALTER TABLE opportunity_financial_facts_v3 ADD CONSTRAINT opportunity_financial_facts_v3_validation_status_check CHECK({FINANCE}) NOT VALID;
          ALTER TABLE candidate_research_run_items ADD CONSTRAINT candidate_research_run_items_valuation_method_check CHECK({VALUATION}) NOT VALID;""")

    def test_zero_invalid_has_only_fixed_ids_and_counts(self):
        result=m.assess_historical_check_profiles(self.sql)
        self.assertEqual(result['totalUnvalidated'],0)
        self.assertEqual({p['id'] for p in result['profiles']},{p[0] for p in m.PROFILES})

    def test_three_exact_source_profiles_accept_without_mutating_bits_or_rows(self):
        self.fixture()
        before=self.sql("SELECT md5(string_agg(conname||':'||convalidated::text,',' ORDER BY conname)) FROM pg_constraint WHERE connamespace='public'::regnamespace")
        rows=self.sql("SELECT md5((SELECT json_agg(t)::text FROM candidate_research_run_items t))")
        result=m.assess_historical_check_profiles(self.sql)
        self.assertEqual(result['totalUnvalidated'],3)
        self.assertTrue(all(p['checked']==1 and p['violations']==0 for p in result['profiles']))
        self.assertEqual(before,self.sql("SELECT md5(string_agg(conname||':'||convalidated::text,',' ORDER BY conname)) FROM pg_constraint WHERE connamespace='public'::regnamespace"))
        self.assertEqual(rows,self.sql("SELECT md5((SELECT json_agg(t)::text FROM candidate_research_run_items t))"))
        self.assertEqual(self.sql("SELECT count(*) FROM pg_constraint WHERE connamespace='public'::regnamespace AND NOT convalidated"),'3')
        print('HISTORICAL_PROFILE_FIXTURE='+json.dumps(result,sort_keys=True))

    def test_false_row_rejects_without_exporting_row(self):
        self.fixture(bad_row=True)
        with self.assertRaises(m.HistoricalCheckRejected) as caught:m.assess_historical_check_profiles(self.sql)
        summary=caught.exception.diagnostic
        self.assertEqual(next(p for p in summary['profiles'] if p['id']=='financial_status_v6')['violations'],1)
        self.assertNotIn('UNACCEPTED_PUBLIC_FIXTURE',json.dumps(summary))

    def test_unknown_check_and_unvalidated_fk_reject(self):
        self.fixture()
        self.sql('CREATE TABLE extra(id integer); ALTER TABLE extra ADD CONSTRAINT unknown_check CHECK(id>=0) NOT VALID;')
        with self.assertRaises(m.HistoricalCheckRejected) as caught:m.assess_historical_check_profiles(self.sql)
        self.assertEqual(caught.exception.diagnostic['unknownChecks'],1)
        self.sql('ALTER TABLE extra DROP CONSTRAINT unknown_check; ALTER TABLE extra ADD CONSTRAINT invalid_fk FOREIGN KEY(id) REFERENCES candidate_research_dossiers(id) NOT VALID;')
        with self.assertRaises(m.HistoricalCheckRejected) as caught:m.assess_historical_check_profiles(self.sql)
        self.assertEqual(caught.exception.diagnostic['invalidForeignKeys'],1)

    def test_wider_valuation_definition_is_not_original_profile(self):
        self.fixture()
        self.sql("ALTER TABLE candidate_research_run_items DROP CONSTRAINT candidate_research_run_items_valuation_method_check; ALTER TABLE candidate_research_run_items ADD CONSTRAINT candidate_research_run_items_valuation_method_check CHECK(valuation_method IS NULL OR valuation_method IN ('forward_12m','forward_bvps_pb')) NOT VALID;")
        with self.assertRaises(m.HistoricalCheckRejected) as caught:m.assess_historical_check_profiles(self.sql)
        self.assertEqual(next(p for p in caught.exception.diagnostic['profiles'] if p['id']=='valuation_method_v6')['definitionMismatch'],1)

    def test_collation_drift_rejects(self):
        self.fixture(finance_collation=' COLLATE "C"')
        with self.assertRaises(m.HistoricalCheckRejected) as caught:m.assess_historical_check_profiles(self.sql)
        self.assertEqual(next(p for p in caught.exception.diagnostic['profiles'] if p['id']=='financial_status_v6')['typeMismatch'],1)

    def test_fixture_only_enum_is_not_production_source_evidence(self):
        self.fixture(finance_type='fixture_enum')
        with self.assertRaises(m.HistoricalCheckRejected) as caught:m.assess_historical_check_profiles(self.sql)
        self.assertEqual(next(p for p in caught.exception.diagnostic['profiles'] if p['id']=='financial_status_v6')['typeMismatch'],1)

    def test_null_check_semantics_do_not_waive_source_not_null(self):
        self.fixture()
        # CHECK rejects FALSE; UNKNOWN is not FALSE. The valuation source
        # explicitly permits NULL, while the other source columns are NOT NULL.
        observed=json.loads(self.sql("SELECT json_build_object('unknownIsFalse',(NULL::text IN ('pending')) IS FALSE,'valuationNullAllowed',("+VALUATION.replace('valuation_method','NULL::text')+") IS TRUE)"))
        self.assertEqual(observed,{'unknownIsFalse':False,'valuationNullAllowed':True})
        self.sql('ALTER TABLE opportunity_financial_facts_v3 ALTER COLUMN validation_status DROP NOT NULL; UPDATE opportunity_financial_facts_v3 SET validation_status=NULL;')
        with self.assertRaises(m.HistoricalCheckRejected) as caught:m.assess_historical_check_profiles(self.sql)
        profile=next(p for p in caught.exception.diagnostic['profiles'] if p['id']=='financial_status_v6')
        self.assertEqual((profile['columnMismatch'],profile['checked']),(1,0))

    def test_known_name_on_wrong_table_is_unknown(self):
        self.fixture()
        self.sql('CREATE TABLE wrong_table(content jsonb); ALTER TABLE wrong_table ADD CONSTRAINT candidate_research_dossiers_paid_content_check CHECK('+PAID+') NOT VALID;')
        with self.assertRaises(m.HistoricalCheckRejected) as caught:m.assess_historical_check_profiles(self.sql)
        self.assertEqual(caught.exception.diagnostic['unknownChecks'],1)

    def test_malformed_huge_boolean_or_extra_payload_has_no_diagnostic(self):
        base={'totalUnvalidated':0,'invalidForeignKeys':0,'invalidOther':0,'unknownChecks':0,
              'profiles':[{'id':p[0],**{name:0 for name in m.COUNTS}} for p in m.PROFILES]}
        malformed=[]
        for field in ('totalUnvalidated','invalidForeignKeys','invalidOther','unknownChecks'):
            value=json.loads(json.dumps(base));value[field]=m.MAX_COUNT+1;malformed.append(value)
        value=json.loads(json.dumps(base));value['totalUnvalidated']=True;malformed.append(value)
        value=json.loads(json.dumps(base));value['extra']='PUBLIC_DO_NOT_RETURN';malformed.append(value)
        for field in m.COUNTS:
            value=json.loads(json.dumps(base));value['profiles'][0][field]=m.MAX_COUNT+1;malformed.append(value)
        value=json.loads(json.dumps(base));value['profiles'][0]['violations']=True;malformed.append(value)
        value=json.loads(json.dumps(base));value['profiles'][0]['extra']='PUBLIC_DO_NOT_RETURN';malformed.append(value)
        value=json.loads(json.dumps(base));value['profiles'][0]['id']=[];malformed.append(value)
        for value in malformed:
            with self.assertRaises(m.HistoricalCheckRejected) as caught:
                m.assess_historical_check_profiles(lambda _:json.dumps(value))
            self.assertIsNone(caught.exception.diagnostic)


if __name__=='__main__':unittest.main()
