"""Executable PUBLIC SQL fixture adapter, NEVER a real-backup/live adapter.

Only creates its own nonroot PG17 cluster and fixed generated synthetic dump.
No connection, SQL, backup, key, binary override or admission argument accepted.
Pinned existing bootstrap/migration/TOC helper bytes are checked before use.
Ciphertext/fs-verity/key integration and seven-table application acceptance are
explicitly outside this adapter; live restore remains unconditionally disabled.
"""
import hashlib
import json
import os
from pathlib import Path
import pwd
import resource
import shutil
import stat
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parents[4]
PINNED = (
    ('deployment/vps/bootstrap-stockinsider-postgres.sql','c58d12585d312701d47b5789d0572f8453424697'),
    ('migrations/20260911_contabo_data_plane_v1.sql','f3fa038cf6695f9ff8a8b422b1b3a64ed6da565a'),
    ('scripts/build-contabo-restore-list.mjs','897c74009ced9a8f8d8991d8eee80a5e7e4444a0'),
)
PORTABLE_ROLES = ('anon','authenticated','service_role','authenticator',
    'opportunity_v3_rpc_owner','legacy_correctness_rpc_owner','postgres',
    'supabase_admin','supabase_auth_admin','supabase_realtime_admin',
    'supabase_storage_admin','pgbouncer','dashboard_user','stockinsider_runtime_v319')
DISARM_SQL = ('UPDATE public.stockinsider_data_plane_settings_v1 '
    'SET identity_fence_enabled=false, activated_at=NULL, activated_by=NULL WHERE singleton')
FIXTURE_SQL = """
CREATE TABLE public.stocks(id integer PRIMARY KEY,symbol text NOT NULL UNIQUE,
  market text NOT NULL CHECK(market IN ('TW','US')));
CREATE TABLE public.stock_signals(id integer PRIMARY KEY,stock_id integer NOT NULL
  REFERENCES public.stocks(id),price numeric NOT NULL CHECK(price>=0));
INSERT INTO public.stocks VALUES(1,'FIXTURE01','TW'),(2,'FIXTURE02','US');
INSERT INTO public.stock_signals SELECT i,1,100+i FROM generate_series(1,12) i;
ALTER TABLE public.stocks OWNER TO postgres;
ALTER TABLE public.stock_signals OWNER TO postgres;
ALTER TABLE public.stocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY fixture_stock_read ON public.stocks FOR SELECT TO anon USING(true);
CREATE POLICY fixture_signal_read ON public.stock_signals FOR SELECT TO anon USING(true);
GRANT SELECT ON public.stocks,public.stock_signals TO anon,authenticated,service_role;
CREATE SCHEMA vault;
CREATE TABLE vault.public_fixture_placeholder(marker text);
INSERT INTO vault.public_fixture_placeholder VALUES('PUBLIC_NONPRODUCTION_ONLY');
CREATE FUNCTION public.read_threads_source_secret() RETURNS text LANGUAGE sql
  AS $$ SELECT 'PUBLIC_NONPRODUCTION_ONLY'::text $$;
"""
DATA_HASH_SQL = """SELECT json_build_object(
'stocks',(SELECT json_agg(s ORDER BY id) FROM stocks s),
'signals',(SELECT json_agg(s ORDER BY id) FROM stock_signals s))::text"""


class PortableFixtureRejected(Exception):
    """Sanitized failure, never raw SQL diagnostics or runtime paths."""


def _pinned_sources():
    captured = {}
    for relative, expected in PINNED:
        path = ROOT / relative
        if path.is_symlink():
            raise PortableFixtureRejected('pinned_source_rejected')
        data = path.read_bytes()
        if len(data) > 65536 or hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest() != expected:
            raise PortableFixtureRejected('pinned_source_rejected')
        captured[relative] = data
    return captured


def _tools():
    # Two fixed reviewed installations only; no executable/connection override.
    conventional = Path('/usr/lib/postgresql/17/bin')
    extracted = ROOT.parent / 'pg17-packages/root/usr/lib/postgresql/17/bin'
    pg = conventional if conventional.is_dir() else extracted
    for name in ('postgres','initdb','createdb','pg_dump','pg_restore','psql'):
        info = (pg/name).stat()
        if not stat.S_ISREG(info.st_mode) or info.st_uid not in (0,os.getuid()) or info.st_mode & 0o022:
            raise PortableFixtureRejected('tool_ownership_rejected')
    # Onsite explicitly supplies /usr/bin/node22; retain conventional node for
    # installations where Node22 owns that path. Neither comes from caller PATH.
    conventional_node = Path('/usr/bin/node22') if Path('/usr/bin/node22').is_file() else Path('/usr/bin/node')
    runtime_node = Path('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node')
    node = conventional_node if conventional_node.is_file() else runtime_node
    info = node.stat()
    allowed_owners = (0,os.getuid()) if node == conventional_node else (0,65534)
    # Cloud image binaries are mapped to nobody and are read-only to this user.
    # This exception applies ONLY to the fixed platform path, never caller PATH.
    if (not stat.S_ISREG(info.st_mode) or info.st_uid not in allowed_owners
            or info.st_mode & 0o022 or (node == runtime_node and os.access(node,os.W_OK))):
        raise PortableFixtureRejected('tool_ownership_rejected')
    return pg, node


def _limits(node=False):
    resource.setrlimit(resource.RLIMIT_CPU,(20,20))
    resource.setrlimit(resource.RLIMIT_FSIZE,(32*1024**2,32*1024**2))
    resource.setrlimit(resource.RLIMIT_NOFILE,(64,64))
    resource.setrlimit(resource.RLIMIT_CORE,(0,0))
    if not node:
        # V8 reserves a large virtual cage; Node is instead given a 64MiB heap.
        resource.setrlimit(resource.RLIMIT_AS,(768*1024**2,768*1024**2))


def execute_real_backup_restore(*args, **kwargs):
    raise RuntimeError('real_restore_runtime_integration_disabled')


def run_portable_sql_fixture():
    """Observe and exercise only new owned PGDATA and generated public rows."""
    if os.getuid() == 0:
        raise PortableFixtureRejected('nonroot_required')
    sources = _pinned_sources()
    pg_bin, node_bin = _tools()
    user = pwd.getpwuid(os.getuid()).pw_name
    # Do not inherit TMPDIR into PostgreSQL config or cleanup paths.
    root = Path(tempfile.mkdtemp(prefix='t17-portable-public-',dir='/tmp'))
    sock, data = root/'socket', root/'data'
    try:
        os.chmod(root,0o700)
        sock.mkdir(mode=0o700)
    except BaseException:
        shutil.rmtree(root)
        raise
    env = {'PATH':str(pg_bin)+':/usr/bin:/bin','HOME':str(root),'LC_ALL':'C',
           'PGHOST':str(sock),'PGPORT':'6549','PGUSER':user,'PGDATABASE':'postgres',
           'PGPASSFILE':'/dev/null','PGSERVICEFILE':'/dev/null','PGCONNECT_TIMEOUT':'2',
           'PGOPTIONS':'-c statement_timeout=5000 -c lock_timeout=2000'}
    process = None
    log = None
    receipt = {'schema':'stockinsider-t17-portable-sql-fixture-v1',
       'scope':'generated_public_sql_fixture_only','liveRestoreAllowed':False,
       'productionBackupOrKeyReceived':False,'diskCiphertextCustodyIntegrated':False,
       'fullApplicationAcceptance':False,'passed':False}
    deadline = time.monotonic()+90
    def run(program, arguments, stdin=None, allowed_failure=False, node=False):
        if time.monotonic()>=deadline:
            raise PortableFixtureRejected('fixture_deadline')
        result = subprocess.run([str(program),*arguments],env=env,input=stdin,
          stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=min(15,max(.1,deadline-time.monotonic())),
          preexec_fn=lambda:_limits(node))
        if result.returncode and not allowed_failure:
            raise PortableFixtureRejected(Path(program).name+'_failed')
        if len(result.stdout)>1024**2 or len(result.stderr)>1024**2:
            raise PortableFixtureRejected('bounded_capture_rejected')
        return result
    def sql(database, text, allowed_failure=False):
        return run(pg_bin/'psql',['-X','-A','-t','-v','ON_ERROR_STOP=1','-d',database],
                   text.encode(),allowed_failure).stdout.decode().strip()
    def data_hash(database):
        return hashlib.sha256(sql(database,DATA_HASH_SQL).encode()).hexdigest()
    try:
        version = run(pg_bin/'postgres',['--version']).stdout.decode().strip()
        if ' 17.' not in version:raise PortableFixtureRejected('pg17_required')
        receipt['postgresToolVersion'] = version
        run(pg_bin/'initdb',['-D',str(data),'-U',user,'--auth-local=peer',
                '--auth-host=reject','--encoding=UTF8','--no-locale'])
        with (data/'postgresql.conf').open('a') as f:
            f.write("\nlisten_addresses=''\nport=6549\nunix_socket_directories='"+str(sock)+"'\n"
                "unix_socket_permissions=0700\nshared_buffers=16MB\nwork_mem=1MB\n"
                "max_connections=4\nmax_worker_processes=0\nmax_parallel_workers=0\n"
                "autovacuum=off\njit=off\nwal_level=minimal\nmax_wal_senders=0\n"
                "archive_mode=off\nmax_wal_size=64MB\nmin_wal_size=32MB\ntemp_file_limit=16MB\n")
        log = (root/'postgres.log').open('wb')
        process = subprocess.Popen([str(pg_bin/'postgres'),'-D',str(data)],env=env,
                  stdin=subprocess.DEVNULL,stdout=log,stderr=log,preexec_fn=_limits)
        for _ in range(40):
            if process.poll() is not None:raise PortableFixtureRejected('postgres_start_failed')
            ready=run(pg_bin/'psql',['-X','-A','-t','-d','postgres','-c','SELECT 1'],allowed_failure=True)
            if ready.returncode==0:break
            time.sleep(.1)
        else:raise PortableFixtureRejected('postgres_start_timeout')
        actual=json.loads(sql('postgres',"SELECT json_build_object('version',current_setting('server_version_num'),"
           "'data',current_setting('data_directory'),'socket',current_setting('unix_socket_directories'),"
           "'listen',current_setting('listen_addresses'),'database',current_database(),'user',current_user)"))
        if (not str(actual['version']).startswith('17') or actual['data']!=str(data)
                or actual['socket']!=str(sock) or actual['listen']!=''
                or actual['database']!='postgres' or actual['user']!=user):
            raise PortableFixtureRejected('owned_cluster_identity_rejected')
        receipt.update(serverVersionNum=actual['version'],nonroot=True,unixSocketOnly=True,
                       ownedPgdataObserved=True,currentDatabaseObserved=True)
        for db in ('fixture_source','fixture_target'):
            run(pg_bin/'createdb',[db])
            run(pg_bin/'psql',['-X','-v','ON_ERROR_STOP=1','-d',db],sources[PINNED[0][0]])
        sql('fixture_source',FIXTURE_SQL)
        expected=data_hash('fixture_source')
        archive=root/'public.dump';toc=root/'original.toc';filtered=root/'filtered.toc'
        run(pg_bin/'pg_dump',['-Fc','-d','fixture_source','-f',str(archive)])
        toc.write_bytes(run(pg_bin/'pg_restore',['--list',str(archive)]).stdout)
        helper=root/'pinned-filter.mjs';helper.write_bytes(sources[PINNED[2][0]])
        result=run(node_bin,['--max-old-space-size=64',str(helper),str(toc),str(filtered)],node=True)
        exclusions=json.loads(result.stdout)['excluded']
        if exclusions<3:raise PortableFixtureRejected('toc_exclusions_not_exercised')
        run(pg_bin/'pg_restore',['--exit-on-error','--use-list',str(filtered),'-d','fixture_target',str(archive)])
        run(pg_bin/'psql',['-X','-v','ON_ERROR_STOP=1','-d','fixture_target'],sources[PINNED[1][0]])
        # Reproduce an inherited active fence only in the synthetic restored DB.
        sql('fixture_target',"UPDATE stockinsider_data_plane_settings_v1 SET identity_fence_enabled=true,activated_at=clock_timestamp(),activated_by='PUBLIC_FIXTURE'")
        sql('fixture_target',DISARM_SQL)
        names=','.join("'"+r+"'" for r in PORTABLE_ROLES)
        checks=json.loads(sql('fixture_target',"SELECT json_build_object("
          "'stocks',(SELECT count(*) FROM stocks),'signals',(SELECT count(*) FROM stock_signals),"
          "'portableRoles',(SELECT count(*) FROM pg_roles WHERE rolname IN ("+names+")),"
          "'compatLogin',(SELECT count(*) FROM pg_roles WHERE rolname IN ("+names+") AND rolcanlogin),"
          "'fixtureOwners',(SELECT count(*) FROM pg_class WHERE oid IN ('stocks'::regclass,'stock_signals'::regclass) AND pg_get_userbyid(relowner)='postgres'),"
          "'fixtureRls',(SELECT count(*) FROM pg_class WHERE oid IN ('stocks'::regclass,'stock_signals'::regclass) AND relrowsecurity),"
          "'fixturePolicies',(SELECT count(*) FROM pg_policy WHERE polrelid IN ('stocks'::regclass,'stock_signals'::regclass)),"
          "'vaultAbsent',to_regnamespace('vault') IS NULL,"
          "'legacyFunctionAbsent',to_regprocedure('public.read_threads_source_secret()') IS NULL,"
          "'fenceDisabled',(SELECT NOT identity_fence_enabled AND activated_at IS NULL AND activated_by IS NULL FROM stockinsider_data_plane_settings_v1 WHERE singleton),"
          "'providerRows',(SELECT count(*) FROM provider_credentials_encrypted_v1),"
          "'dataPlaneRls',(SELECT count(*) FROM pg_class WHERE relname IN ('stockinsider_data_plane_settings_v1','stockinsider_backend_identities_v1','provider_credentials_encrypted_v1','private_artifact_receipts_v1') AND relrowsecurity))"))
        if checks!={'stocks':2,'signals':12,'portableRoles':14,'compatLogin':0,'fixtureOwners':2,
                    'fixtureRls':2,'fixturePolicies':2,'vaultAbsent':True,'legacyFunctionAbsent':True,
                    'fenceDisabled':True,'providerRows':0,'dataPlaneRls':4}:
            raise PortableFixtureRejected('portable_fixture_checks_failed')
        if data_hash('fixture_target')!=expected or data_hash('fixture_source')!=expected:
            raise PortableFixtureRejected('fixture_data_hash_failed')
        # Demonstrate owner/ACL/RLS behavior: anon can select but cannot write.
        if sql('fixture_target','SET ROLE anon; SELECT count(*) FROM stocks').splitlines()[-1]!='2':
            raise PortableFixtureRejected('fixture_select_grant_failed')
        rejected=run(pg_bin/'psql',['-X','-v','ON_ERROR_STOP=1','-d','fixture_target'],
              b"SET ROLE anon; INSERT INTO stocks VALUES(99,'NOT_ALLOWED','TW');",allowed_failure=True)
        if rejected.returncode==0:raise PortableFixtureRejected('fixture_write_grant_failed')
        receipt.update(passed=True,checks=checks,tocExcluded=exclusions,
            dataSha256=expected,ownerAclReplayed=True,fixtureAnonWriteRejected=True,
            sourceSqlBlobIds=dict(PINNED),limitations=['fixed generated SQL subset only',
            'not full seven-table application validation','no backup/key/ciphertext integration',
            'no production admission; live entry disabled'])
    finally:
        if process:
            if process.poll() is None:process.terminate()
            try:process.wait(timeout=8)
            except subprocess.TimeoutExpired:process.kill();process.wait(timeout=5)
        if log:log.close()
        socket_gone=not (sock/'.s.PGSQL.6549').exists()
        reaped=process is None or process.poll() is not None
        shutil.rmtree(root)
        receipt['cleanup']={'postmasterReaped':reaped,'socketRemoved':socket_gone,'privateTreeRemoved':not root.exists()}
    return receipt
