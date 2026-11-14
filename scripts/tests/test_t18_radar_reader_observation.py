"""Actual private PG17, public fixtures only; observer never creates rows."""
import copy
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
from deployment.staging.vnext.t17_keyfd import radar_reader_observation as m
from deployment.staging.vnext.t17_keyfd.portable_sql_fixture_adapter import _tools
from deployment.staging.vnext.t17_keyfd.portable_restore_engine import _limits

SCHEMA="""CREATE TABLE radar_public_snapshots(id uuid,etag text,content_as_of timestamptz,
 published_at timestamptz,payload_json jsonb,window_key text,status text);
CREATE TABLE radar_publication_state(window_key text,status text,last_attempt_at timestamptz,terminal_reason text);"""


class RadarReaderObservationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pg,_=_tools();cls.root=Path(tempfile.mkdtemp(prefix='t18-reader-public-',dir='/tmp'))
        cls.sock=cls.root/'s';cls.sock.mkdir(mode=0o700);data=cls.root/'data';user=pwd.getpwuid(os.getuid()).pw_name
        cls.env={'PATH':str(cls.pg)+':/usr/bin:/bin','HOME':str(cls.root),'LC_ALL':'C',
          'PGHOST':str(cls.sock),'PGPORT':'6554','PGUSER':user,'PGDATABASE':'postgres',
          'PGPASSFILE':'/dev/null','PGSERVICEFILE':'/dev/null','PGCONNECT_TIMEOUT':'2'}
        cls.process=cls.log=None
        try:
            cls.runpg('initdb',['-D',str(data),'-U',user,'--auth-local=peer','--auth-host=reject','--no-locale','--encoding=UTF8'])
            with (data/'postgresql.conf').open('a') as f:f.write("\nlisten_addresses=''\nport=6554\nunix_socket_directories='"+str(cls.sock)+"'\nunix_socket_permissions=0700\nshared_buffers=16MB\nmax_connections=4\nmax_worker_processes=0\nmax_parallel_workers=0\nautovacuum=off\njit=off\n")
            cls.log=(cls.root/'postgres.log').open('wb')
            cls.process=subprocess.Popen([str(cls.pg/'postgres'),'-D',str(data)],env=cls.env,stdin=subprocess.DEVNULL,stdout=cls.log,stderr=cls.log,preexec_fn=_limits)
            for _ in range(40):
                p=subprocess.run([str(cls.pg/'pg_isready')],env=cls.env,capture_output=True,timeout=3)
                if p.returncode==0:break
                if cls.process.poll() is not None:raise RuntimeError('public_reader_start_failed')
                time.sleep(.1)
            else:raise RuntimeError('public_reader_start_timeout')
        except BaseException:cls.tearDownClass();raise

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
        p=subprocess.run([str(cls.pg/name),*args],env=cls.env,input=stdin,capture_output=True,timeout=20,preexec_fn=_limits)
        if p.returncode:raise RuntimeError('public_reader_fixture_sql_failed:'+p.stderr.decode()[:600])
        return p.stdout.decode().strip()

    def setUp(self):
        self.db='reader_'+self._testMethodName.removeprefix('test_')[:40];self.runpg('createdb',[self.db])

    def sql(self,script):
        if isinstance(script,str):script=script.encode()
        return self.runpg('psql',['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-d',self.db],script)

    def test_absent_schema_reports_gap_and_creates_no_tables(self):
        observed=m.assess_radar_reader(self.sql)
        self.assertEqual(observed['status'],'GAP_SCHEMA');self.assertEqual(observed['missingColumns'],11)
        self.assertEqual(self.sql("SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'"),'0')

    def test_wrong_type_is_schema_gap(self):
        self.sql(SCHEMA.replace('payload_json jsonb','payload_json text'))
        observed=m.assess_radar_reader(self.sql)
        self.assertEqual(observed['status'],'GAP_SCHEMA');self.assertEqual(observed['typeMismatchColumns'],1)
        self.assertEqual(observed['rowObservation'],'NOT_RUN_SCHEMA_GAP')

    def test_matching_schema_no_snapshot_is_explicit_gap(self):
        self.sql(SCHEMA)
        observed=m.assess_radar_reader(self.sql)
        self.assertEqual(observed['status'],'GAP_NO_PUBLISHED_SNAPSHOT')
        self.assertIsNone(observed['oldestContentDate']);self.assertEqual(observed['homeValidSnapshots'],0)

    def test_september19_snapshot_stays_stale_and_rows_unchanged(self):
        self.sql(SCHEMA)
        self.sql("""INSERT INTO radar_public_snapshots VALUES
          ('00000000-0000-4000-8000-000000000001','DO_NOT_EXPORT_PUBLIC_ETAG','2026-09-19T05:00:00Z',
           '2026-09-19T06:00:00Z','{"marker":"DO_NOT_EXPORT_PUBLIC_PAYLOAD"}','home','valid'),
          ('00000000-0000-4000-8000-000000000002','DO_NOT_EXPORT_PUBLIC_ETAG','2026-09-19T05:00:00Z',
           '2026-09-19T06:00:00Z','{"marker":"DO_NOT_EXPORT_PUBLIC_PAYLOAD"}','daily','valid');
          INSERT INTO radar_publication_state VALUES('home','valid','2026-09-19T06:00:00Z','DO_NOT_EXPORT_PUBLIC_REASON');""")
        rowhash="SELECT md5((SELECT json_agg(s ORDER BY id)::text FROM radar_public_snapshots s))"
        before=self.sql(rowhash);observed=m.assess_radar_reader(self.sql)
        self.assertEqual(before,self.sql(rowhash))
        self.assertEqual(observed['status'],'OBSERVED_PUBLISHED_SNAPSHOT')
        self.assertEqual((observed['homeValidSnapshots'],observed['dailyValidSnapshots'],observed['staleSnapshots26h']),(1,1,2))
        self.assertEqual((observed['oldestContentDate'],observed['newestContentDate']),('2026-09-19','2026-09-19'))
        self.assertTrue(observed['readOnly']);self.assertFalse(observed['appAcceptance'])
        self.assertNotIn('DO_NOT_EXPORT',json.dumps(observed))
        print('PUBLIC_RADAR_READER_OBSERVATION='+json.dumps(observed,sort_keys=True))

    def test_projection_rejects_unknown_payload_booleans_huge_counts_and_dates(self):
        self.sql(SCHEMA);base=m.assess_radar_reader(self.sql)
        malformed=[]
        for count in m.COUNTS:
            for value in (True,-1,m.MAX_COUNT+1):
                row=copy.deepcopy(base);row[count]=value;malformed.append(row)
        row=copy.deepcopy(base);row['payload_json']='DO_NOT_EXPORT';malformed.append(row)
        row=copy.deepcopy(base);row['oldestContentDate']='2026-09-19T05:00:00Z';malformed.append(row)
        row=copy.deepcopy(base);row['oldestContentDate']='2026-02-30';malformed.append(row)
        row=copy.deepcopy(base);row['oldestContentDate']='2026-09-19';malformed.append(row)
        row=copy.deepcopy(base);row['appAcceptance']=True;malformed.append(row)
        for row in malformed:self.assertIsNone(m.project_radar_reader_observation(row))


if __name__=='__main__':unittest.main()
