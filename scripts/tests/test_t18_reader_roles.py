"""Actual private PG17 fixed roles, public fixtures only, no server JWT/key."""
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
from deployment.staging.vnext.t17_keyfd import t18_reader_roles as m
from deployment.staging.vnext.t17_keyfd.portable_sql_fixture_adapter import _tools,_pinned_sources,PINNED
from deployment.staging.vnext.t17_keyfd.portable_restore_engine import _limits


class ReaderRoleTests(unittest.TestCase):
    def setUp(self):
        self.pg,_=_tools();self.root=Path(tempfile.mkdtemp(prefix='t18-roles-public-',dir='/tmp'))
        self.sock=self.root/'s';self.sock.mkdir(mode=0o700);data=self.root/'data';user=pwd.getpwuid(os.getuid()).pw_name
        self.env={'PATH':str(self.pg)+':/usr/bin:/bin','HOME':str(self.root),'LC_ALL':'C',
          'PGHOST':str(self.sock),'PGPORT':'6555','PGUSER':user,'PGDATABASE':'postgres',
          'PGPASSFILE':'/dev/null','PGSERVICEFILE':'/dev/null','PGCONNECT_TIMEOUT':'2'}
        self.process=self.log=None
        self.addCleanup(self.cleanup)
        self.runpg('initdb',['-D',str(data),'-U',user,'--auth-local=peer','--auth-host=reject','--no-locale','--encoding=UTF8'])
        with (data/'postgresql.conf').open('a') as f:f.write("\nlisten_addresses=''\nport=6555\nunix_socket_directories='"+str(self.sock)+"'\nunix_socket_permissions=0700\nshared_buffers=16MB\nmax_connections=4\nmax_worker_processes=0\nmax_parallel_workers=0\nautovacuum=off\njit=off\n")
        self.log=(self.root/'postgres.log').open('wb')
        self.process=subprocess.Popen([str(self.pg/'postgres'),'-D',str(data)],env=self.env,stdin=subprocess.DEVNULL,stdout=self.log,stderr=self.log,preexec_fn=_limits)
        for _ in range(40):
            p=subprocess.run([str(self.pg/'pg_isready')],env=self.env,capture_output=True,timeout=3)
            if p.returncode==0:break
            if self.process.poll() is not None:raise RuntimeError('public_role_fixture_start_failed')
            time.sleep(.1)
        else:raise RuntimeError('public_role_fixture_start_timeout')
        self.runpg('createdb',['t17_restored'])
        self.sql(_pinned_sources()[PINNED[0][0]])
        self.sql("""CREATE TABLE radar_public_snapshots(id uuid,etag text,content_as_of timestamptz,published_at timestamptz,payload_json jsonb,window_key text,status text,unrelated_private_fixture text);
          CREATE TABLE radar_publication_state(window_key text,status text,last_attempt_at timestamptz,terminal_reason text,unrelated_private_fixture text);
          CREATE TABLE fixture_write_target(id integer);
          INSERT INTO radar_public_snapshots VALUES
           ('00000000-0000-4000-8000-000000000001','PUBLIC_ETAG','2026-09-19Z','2026-09-19Z','{}','home','valid','DO_NOT_READ'),
           ('00000000-0000-4000-8000-000000000002','PUBLIC_ETAG','2026-09-19Z','2026-09-19Z','{}','daily','valid','DO_NOT_READ'),
           ('00000000-0000-4000-8000-000000000003','PUBLIC_ETAG','2026-09-19Z','2026-09-19Z','{}','weekly','valid','DO_NOT_READ'),
           ('00000000-0000-4000-8000-000000000004','PUBLIC_ETAG','2026-09-19Z','2026-09-19Z','{}','daily','failed','DO_NOT_READ');
          INSERT INTO radar_publication_state VALUES('home','valid','2026-09-19Z','PUBLIC_ONLY','DO_NOT_READ'),('daily','failed','2026-09-19Z','PUBLIC_ONLY','DO_NOT_READ'),('weekly','valid','2026-09-19Z','PUBLIC_ONLY','DO_NOT_READ');
          ALTER TABLE radar_public_snapshots ADD CONSTRAINT public_fixture_not_valid CHECK(window_key IS NOT NULL) NOT VALID;
          CREATE FUNCTION public.fixture_dangerous_rpc() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN INSERT INTO public.fixture_write_target VALUES(1); RETURN 1; END $$;
          CREATE SCHEMA fixture_external; GRANT USAGE ON SCHEMA fixture_external TO PUBLIC;
          CREATE FUNCTION fixture_external.write_rpc() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN INSERT INTO public.fixture_write_target VALUES(42); RETURN 42; END $$;
          CREATE SEQUENCE public.fixture_sequence; GRANT USAGE ON SEQUENCE public.fixture_sequence TO PUBLIC;
          GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE ON ALL TABLES IN SCHEMA public TO PUBLIC;
          ALTER TABLE radar_public_snapshots ENABLE ROW LEVEL SECURITY;
          CREATE POLICY deliberately_broad_public ON radar_public_snapshots FOR SELECT TO PUBLIC USING(true);""")

    def cleanup(self):
        if self.process:
            if self.process.poll() is None:self.process.terminate()
            try:self.process.wait(timeout=8)
            except subprocess.TimeoutExpired:self.process.kill();self.process.wait(timeout=5)
        if self.log:self.log.close()
        shutil.rmtree(self.root)

    def runpg(self,name,args,stdin=None,fail_ok=False):
        p=subprocess.run([str(self.pg/name),*args],env=self.env,input=stdin,capture_output=True,timeout=20,preexec_fn=_limits)
        if p.returncode and not fail_ok:raise RuntimeError('public_roles_fixture_sql_failed:'+p.stderr.decode()[:700])
        return p
    def sql(self,script):
        if isinstance(script,str):script=script.encode()
        return self.runpg('psql',['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-d','t17_restored'],script).stdout.decode().strip()
    def reader(self,script,fail_ok=False):
        # SESSION authorization is changed too: SET ROLE checks the authenticator
        # session identity, not the fixture administrator's superuser rights.
        text='SET SESSION AUTHORIZATION t18_authenticator; SET ROLE t18_reader; SET default_transaction_read_only=off; '+script
        return self.runpg('psql',['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-d','t17_restored'],text.encode(),fail_ok)

    def test_actual_reader_privileges_rows_bits_and_write_rpc_denials(self):
        before=self.sql("SELECT md5((SELECT json_agg(s ORDER BY id)::text FROM radar_public_snapshots s))")
        bit=self.sql("SELECT convalidated FROM pg_constraint WHERE conname='public_fixture_not_valid'")
        receipt=m.install_fixed_reader_roles(self.sql)
        self.assertEqual(receipt,m.ROLE_COUNTS)
        self.assertEqual(self.reader('SELECT count(id) FROM radar_public_snapshots;').stdout.decode().strip(),'2')
        self.assertEqual(self.reader('SELECT count(window_key) FROM radar_publication_state;').stdout.decode().strip(),'2')
        for text in ("INSERT INTO radar_public_snapshots(window_key) VALUES('home');",
           "UPDATE radar_public_snapshots SET status='valid';","DELETE FROM radar_public_snapshots;",
           "TRUNCATE radar_public_snapshots;","CREATE TEMP TABLE forbidden(id integer);",
           "CREATE TABLE public.forbidden(id integer);","SET ROLE service_role;",
           "SELECT public.fixture_dangerous_rpc();","SELECT fixture_external.write_rpc();", "SELECT nextval('public.fixture_sequence');","SELECT unrelated_private_fixture FROM radar_public_snapshots;",
           "SELECT * FROM fixture_write_target;"):
            self.assertNotEqual(self.reader(text,fail_ok=True).returncode,0)
        self.assertEqual(self.sql('SELECT count(*) FROM fixture_write_target'),'0')
        self.assertEqual(before,self.sql("SELECT md5((SELECT json_agg(s ORDER BY id)::text FROM radar_public_snapshots s))"))
        self.assertEqual(bit,self.sql("SELECT convalidated FROM pg_constraint WHERE conname='public_fixture_not_valid'"))
        print('PUBLIC_READER_ROLES='+json.dumps(receipt,sort_keys=True))

    def test_existing_fixed_role_rejected_before_privilege_changes(self):
        self.sql('CREATE ROLE t18_reader NOLOGIN;')
        with self.assertRaises(RuntimeError):m.install_fixed_reader_roles(self.sql)
        self.assertEqual(self.sql("SELECT count(*) FROM pg_roles WHERE rolname='t18_authenticator'"),'0')
        self.assertEqual(self.sql("SELECT has_table_privilege('anon','radar_public_snapshots','INSERT')"),'t')

    def test_no_role_connection_or_readiness_override(self):
        for kwargs in ({'role':'service_role'},{'connection':'FORBIDDEN'},{'ready':True}):
            with self.assertRaises(TypeError):m.install_fixed_reader_roles(self.sql,**kwargs)


if __name__=='__main__':unittest.main()
