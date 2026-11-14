"""Actual owned PG17 with generated PUBLIC structural app stubs, never real data.

The engine is INTERNAL: these tests supply generated archive replay directly;
they do not test or bypass parent kernel/key/manifest/sandbox admission.
"""
import json
import os
from pathlib import Path
import pwd
import shutil
import subprocess
import tempfile
import time
import unittest
from deployment.staging.vnext.t17_keyfd import portable_restore_engine as e
from deployment.staging.vnext.t17_keyfd.portable_sql_fixture_adapter import (
    _tools, _pinned_sources, PINNED, FIXTURE_SQL)


def public_archive(work, orphan=False, large_rows=12000, null_required=False, not_valid_case=None):
    if type(large_rows) is not int or not 0<=large_rows<=12000:
        raise ValueError('public_fixture_row_bound')
    pg,_=_tools();user=pwd.getpwuid(os.getuid()).pw_name
    root=Path(tempfile.mkdtemp(prefix='public-archive-source-',dir=work))
    sock=root/'s';sock.mkdir(mode=0o700);data=root/'data';process=log=None
    env={'PATH':str(pg)+':/usr/bin:/bin','HOME':str(root),'LC_ALL':'C',
      'PGHOST':str(sock),'PGPORT':'6552','PGUSER':user,'PGDATABASE':'postgres',
      'PGPASSFILE':'/dev/null','PGSERVICEFILE':'/dev/null','PGCONNECT_TIMEOUT':'2'}
    def run(name,args,stdin=None):
        p=subprocess.run([str(pg/name),*args],env=env,input=stdin,
                         capture_output=True,timeout=20,preexec_fn=e._limits)
        if p.returncode:raise RuntimeError('public_fixture_source_'+name+'_failed')
        return p.stdout
    def sql(text):return run('psql',['-X','-v','ON_ERROR_STOP=1','-d','public_fixture'],text)
    try:
        run('initdb',['-D',str(data),'-U',user,'--auth-local=peer','--auth-host=reject','--no-locale','--encoding=UTF8'])
        with (data/'postgresql.conf').open('a') as f:
            f.write("\nlisten_addresses=''\nport=6552\nunix_socket_directories='"+str(sock)+"'\n"
               "unix_socket_permissions=0700\nshared_buffers=16MB\nwork_mem=1MB\n"
               "max_connections=4\nmax_worker_processes=0\nmax_parallel_workers=0\n"
               "autovacuum=off\njit=off\nwal_level=minimal\nmax_wal_senders=0\narchive_mode=off\n"
               "max_wal_size=64MB\nmin_wal_size=32MB\n")
        log=(root/'pg.log').open('wb')
        process=subprocess.Popen([str(pg/'postgres'),'-D',str(data)],env=env,
          stdin=subprocess.DEVNULL,stdout=log,stderr=log,preexec_fn=e._limits)
        for _ in range(40):
            ready=subprocess.run([str(pg/'pg_isready')],env=env,capture_output=True,timeout=3)
            if ready.returncode==0:break
            if process.poll() is not None:raise RuntimeError('public_fixture_source_start_failed')
            time.sleep(.1)
        else:raise RuntimeError('public_fixture_source_start_timeout')
        run('createdb',['public_fixture'])
        sql(_pinned_sources()[PINNED[0][0]])
        sql(FIXTURE_SQL.encode())
        tables=('source_run_ledger','candidate_source_mentions','candidate_research_runs',
          'candidate_research_run_items','official_price_history','candidate_detail_snapshots','radar_public_snapshots')
        statements=[]
        columns={
            'candidate_source_mentions':',stock_id integer,source_run_ledger_id integer',
            'candidate_research_run_items':',stock_id integer,run_id integer',
            'official_price_history':',stock_id integer',
            'candidate_detail_snapshots':',stock_id integer,research_run_id integer',
        }
        for table in tables:
            statements.extend((f'CREATE TABLE public.{table}(id integer PRIMARY KEY,public_fixture_marker text{columns.get(table,"")});',
              f'ALTER TABLE public.{table} OWNER TO postgres;',
              f'ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY;',
              f'CREATE POLICY fixture_read ON public.{table} FOR SELECT TO service_role USING(true);',
              f'GRANT SELECT ON public.{table} TO service_role;'))
        for function in ('source_document_coverage','publish_radar_public_snapshots','candidate_research_stock_authority_page'):
            statements.extend((f"CREATE FUNCTION public.{function}() RETURNS text LANGUAGE sql AS $$ SELECT 'PUBLIC_FIXTURE_STUB'::text $$;",
              f'GRANT EXECUTE ON FUNCTION public.{function}() TO service_role;'))
        statements.extend(("CREATE FUNCTION public.fixture_noop_trigger() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;",
            'CREATE TRIGGER fixture_trigger BEFORE INSERT ON source_run_ledger FOR EACH ROW EXECUTE FUNCTION public.fixture_noop_trigger();',
            "INSERT INTO source_run_ledger VALUES(1,'PUBLIC_FIXTURE_STUB');",
            'ALTER TABLE source_run_ledger ALTER COLUMN public_fixture_marker SET STORAGE EXTERNAL;',
            f"INSERT INTO source_run_ledger SELECT i,repeat(md5(i::text),128) FROM generate_series(2,{large_rows+1}) i;",
            "INSERT INTO candidate_research_runs VALUES(1,'PUBLIC_FIXTURE_STUB');",
            "INSERT INTO candidate_source_mentions VALUES(1,'PUBLIC_FIXTURE_STUB',1,1),(2,'PUBLIC_FIXTURE_STUB',2,NULL);",
            "INSERT INTO candidate_research_run_items VALUES(1,'PUBLIC_FIXTURE_STUB',1,1);",
            "INSERT INTO official_price_history VALUES(1,'PUBLIC_FIXTURE_STUB',1);",
            "INSERT INTO candidate_detail_snapshots VALUES(1,'PUBLIC_FIXTURE_STUB',1,1),(2,'PUBLIC_FIXTURE_STUB',2,NULL);"))
        if orphan:
            # No FK exists on this public fixture link: the explicit row check,
            # not only catalog/FK counts, must reject the orphan after restore.
            statements.append('UPDATE candidate_source_mentions SET stock_id=999 WHERE id=1;')
        if null_required:
            statements.append('UPDATE candidate_source_mentions SET stock_id=NULL WHERE id=1;')
        sql('\n'.join(statements).encode())
        if not_valid_case not in (None,'valid_rows','violating_rows'):
            raise ValueError('public_fixture_case_rejected')
        if not_valid_case is not None:
            # Public synthetic marker only: demonstrate catalog NOT VALID is
            # distinct from whether historical rows satisfy the exact CHECK.
            marker='SAFE_PUBLIC_FIXTURE' if not_valid_case=='valid_rows' else 'investanchors_PUBLIC_FIXTURE'
            sql(("CREATE TABLE public.candidate_research_dossiers(id integer PRIMARY KEY,content jsonb);"
                 "INSERT INTO public.candidate_research_dossiers VALUES(1,jsonb_build_object('marker','"+marker+"'));"
                 "ALTER TABLE public.candidate_research_dossiers ADD CONSTRAINT candidate_research_dossiers_paid_content_check "
                 "CHECK(content::text !~* '(investanchors|investanchor|定錨投資|定錨會員)') NOT VALID;").encode())
            violations=run('psql',['-X','-A','-t','-v','ON_ERROR_STOP=1','-d','public_fixture','-c',
                "SELECT count(*) FROM public.candidate_research_dossiers WHERE (content::text !~* '(investanchors|investanchor|定錨投資|定錨會員)') IS FALSE"]).decode().strip()
            if violations!=('0' if not_valid_case=='valid_rows' else '1'):
                raise RuntimeError('public_fixture_case_not_proven')
        archive=run('pg_dump',['-Fc','-d','public_fixture'])
        if len(archive)>8*1024**2:raise RuntimeError('public_fixture_archive_oversize')
        return archive
    finally:
        if process:
            if process.poll() is None:process.terminate()
            try:process.wait(timeout=8)
            except subprocess.TimeoutExpired:process.kill();process.wait(timeout=5)
        if log:log.close()
        shutil.rmtree(root)


class OwnedRestoreEngineTests(unittest.TestCase):
    def test_actual_owned_pg17_full_structural_contract_with_public_stubs(self):
        with tempfile.TemporaryDirectory(prefix='t17-engine-test-',dir='/tmp') as directory:
            os.chmod(directory,0o700)
            archive=public_archive(directory)
            def replay(consumer):
                for offset in range(0,len(archive),16384):consumer(archive[offset:offset+16384])
            old={name:os.environ.get(name) for name in ('PGHOST','PGDATABASE','PGSERVICE','TMPDIR')}
            try:
                os.environ.update(PGHOST='FORBIDDEN_EXTERNAL_CONNECTION',PGDATABASE='forbidden',PGSERVICE='forbidden',TMPDIR='/forbidden')
                result=e.restore_owned_database(replay,Path(directory))
            finally:
                for name,value in old.items():
                    if value is None:os.environ.pop(name,None)
                    else:os.environ[name]=value
            self.assertTrue(result['databaseRestored'])
            self.assertTrue(result['portableContractVerified'])
            self.assertTrue(result['applicationObjectContractVerified'])
            self.assertTrue(result['ownerAllowlistVerified'])
            self.assertTrue(result['restoredIdentityFenceDisabled'])
            self.assertEqual((result['appRls'],result['appSelect'],result['appExecute']),(7,7,3))
            self.assertEqual(result['productionContinuity'],'HOST_REQUIRED')
            self.assertGreater(result['maxRelationBytes'],32*1024**2)
            self.assertTrue(all(result['cleanup'].values()))
            self.assertFalse(result['fullBusinessDataAcceptance'])
            self.assertEqual(result['lineageValidation'],'DECLARED_FKS_AND_FIXED_PUBLIC_RELATIONS')
            self.assertEqual(result['lineageRelationsChecked'],7)
            self.assertEqual(result['lineageOrphans'],0)
            self.assertEqual(result['providerRecovery'],'NOT_RUN')
            self.assertEqual(list(Path(directory).iterdir()),[])
            print('OWNED_RESTORE_ENGINE_FIXTURE='+json.dumps({'fixture':'GENERATED_PUBLIC_STRUCTURAL_STUBS_NOT_REAL_APP',**result},sort_keys=True))

    def test_bad_archive_and_stream_failure_reject_and_cleanup(self):
        with tempfile.TemporaryDirectory(prefix='t17-engine-test-',dir='/tmp') as directory:
            os.chmod(directory,0o700)
            def bad(consume):consume(b'PUBLIC_NOT_A_PG_ARCHIVE')
            def failing(consume):raise RuntimeError('public_fixture_stream_error')
            for replay in (bad,failing):
                with self.assertRaises(e.RestoreEngineRejected):e.restore_owned_database(replay,Path(directory))
                self.assertEqual(list(Path(directory).iterdir()),[])

    def test_actual_orphan_without_declared_fk_is_rejected_after_restore(self):
        with tempfile.TemporaryDirectory(prefix='t17-engine-test-',dir='/tmp') as directory:
            os.chmod(directory,0o700)
            for bad in ({'orphan':True},{'null_required':True}):
                archive=public_archive(directory,large_rows=2,**bad)
                def replay(consumer):
                    for offset in range(0,len(archive),16384):consumer(archive[offset:offset+16384])
                with self.assertRaisesRegex(e.RestoreEngineRejected,'^lineage_orphans_rejected$'):
                    e.restore_owned_database(replay,Path(directory))
                self.assertEqual(list(Path(directory).iterdir()),[])

    def test_no_caller_connection_database_or_sql_override(self):
        for kwargs in ({'connection':'forbidden'},{'database':'production'},{'sql':'forbidden'},{'ready':True}):
            with self.assertRaises(TypeError):e.restore_owned_database(lambda _:None,Path('/tmp'),**kwargs)

    def test_nonprivate_work_root_rejects(self):
        with tempfile.TemporaryDirectory(prefix='t17-engine-test-',dir='/tmp') as directory:
            os.chmod(directory,0o755)
            with self.assertRaisesRegex(e.RestoreEngineRejected,'private_work_root_required'):
                e.restore_owned_database(lambda _:None,Path(directory))


if __name__=='__main__':unittest.main()
