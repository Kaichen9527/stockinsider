"""Internal owned-PG17 restore engine, not a CLI, admission or key backend.

The ONLY entry may be called by the separately reviewed sandbox admission after
FULL authentication of kernel-held immutable ciphertext and trusted manifest.
`replay(write_chunk)` is an internal dependency already bound to that SAME FD,
key and context; a Python callable by itself proves none of those prerequisites.
No connection/database/SQL/binary overrides, service or application activation.
"""
import hashlib
import json
import os
from pathlib import Path
import pwd
import re
import resource
import shutil
import stat
import subprocess
import tempfile
import threading
import time
from .portable_sql_fixture_adapter import _tools, _pinned_sources, PORTABLE_ROLES, PINNED, DISARM_SQL

ROOT = Path(__file__).resolve().parents[4]
HISTORICAL = 'scripts/rehearse-contabo-database-restore.mjs'
HISTORICAL_BLOB = 'd60414b8afa907e1326ae6e79b09e32e2aa8fdd4'
MAX_CAPTURE = 1024**2
MAX_ARCHIVE_PLAINTEXT = 8 * 1024**3
MAX_INPUT_CHUNK = 1024**2
# Fixed public schema edges from the reviewed StockInsider migration contract.
# Nullable links are permitted, but every non-null value must identify a parent.
LINEAGE_EDGES = (
    ('candidate_source_mentions','stock_id','stocks','id'),
    ('candidate_source_mentions','source_run_ledger_id','source_run_ledger','id'),
    ('candidate_research_run_items','stock_id','stocks','id'),
    ('candidate_research_run_items','run_id','candidate_research_runs','id'),
    ('official_price_history','stock_id','stocks','id'),
    ('candidate_detail_snapshots','stock_id','stocks','id'),
    ('candidate_detail_snapshots','research_run_id','candidate_research_runs','id'),
)
NULLABLE_LINEAGE_LINKS = frozenset((
    ('candidate_source_mentions','source_run_ledger_id'),
    ('candidate_detail_snapshots','research_run_id'),
))


class RestoreEngineRejected(Exception):
    """Fixed codes only; never raw archive rows, SQL/logs or runtime paths."""


def _verification_sql():
    source = (ROOT/HISTORICAL).read_bytes()
    digest = hashlib.sha1(b'blob '+str(len(source)).encode()+b'\0'+source).hexdigest()
    if digest != HISTORICAL_BLOB or len(source)>65536:
        raise RestoreEngineRejected('verification_source_rejected')
    text=source.decode()
    start='const verificationSql=`'
    if text.count(start)!=1:raise RestoreEngineRejected('verification_source_rejected')
    return text.split(start,1)[1].split('`;',1)[0].encode()


def _limits(node=False,capture=False):
    resource.setrlimit(resource.RLIMIT_CPU,(600,600))
    # PostgreSQL relation segments normally reach 1GiB. Keep a finite 2GiB
    # server-file ceiling under the parent's separate work-filesystem quota;
    # command output/TOC processes retain the smaller 32MiB capture-file cap.
    file_limit=32*1024**2 if capture else 2*1024**3
    resource.setrlimit(resource.RLIMIT_FSIZE,(file_limit,file_limit))
    resource.setrlimit(resource.RLIMIT_NOFILE,(64,64))
    resource.setrlimit(resource.RLIMIT_CORE,(0,0))
    if not node:resource.setrlimit(resource.RLIMIT_AS,(768*1024**2,768*1024**2))


def restore_owned_database(replay, work_root):
    """Restore/verify ONLY a new owned sandbox DB; always destroy it on return.

    Network/mount/cgroup/hostlock/key/artifact admission belongs to the parent
    guard, not callable/path/receipt inference here. This engine is deliberately
    INTERNAL and never evaluates caller readiness or arbitrary SQL/connection.
    Result describes DB structural checks, not provider/Next/service acceptance.
    """
    if os.getuid()==0 or not callable(replay):raise RestoreEngineRejected('engine_input_rejected')
    base=Path(work_root)
    info=base.lstat()
    if (not base.is_absolute() or base.resolve()!=base or not stat.S_ISDIR(info.st_mode)
        or info.st_uid!=os.getuid() or stat.S_IMODE(info.st_mode)!=0o700
        or not re.fullmatch(r'/[A-Za-z0-9/_-]+',str(base))):
        raise RestoreEngineRejected('private_work_root_required')
    sources=_pinned_sources(); verification_sql=_verification_sql(); pg_bin,node_bin=_tools()
    user=pwd.getpwuid(os.getuid()).pw_name
    if user in set(PORTABLE_ROLES)|{'stockinsider'}:
        raise RestoreEngineRejected('cluster_admin_role_collision')
    root=Path(tempfile.mkdtemp(prefix='t17-owned-restore-',dir=base))
    sock,data=root/'socket',root/'data'
    process=log=None
    deadline=time.monotonic()+900
    phase='setup'
    receipt={'schema':'stockinsider-owned-db-restore-v1','databaseRestored':False,
      'portableContractVerified':False,'applicationObjectContractVerified':False,
      'providerRecovery':'NOT_RUN','nextRollback':'NOT_RUN','serviceActivation':'NOT_RUN',
      'lineageValidation':'NOT_RUN','fullBusinessDataAcceptance':False,
      'productionContinuity':'HOST_REQUIRED'}
    env={'PATH':str(pg_bin)+':/usr/bin:/bin','HOME':str(root),'LC_ALL':'C',
      'PGHOST':str(sock),'PGPORT':'6551','PGUSER':user,'PGDATABASE':'postgres',
      'PGPASSFILE':'/dev/null','PGSERVICEFILE':'/dev/null','PGCONNECT_TIMEOUT':'2',
      'PGOPTIONS':'-c statement_timeout=180000 -c lock_timeout=5000'}

    def run(program,args,input_bytes=None,node=False,timeout=30):
        left=deadline-time.monotonic()
        if left<=0:raise RestoreEngineRejected('engine_deadline')
        with tempfile.TemporaryFile(dir=root) as out,tempfile.TemporaryFile(dir=root) as err:
            p=subprocess.run([str(program),*args],env=env,input=input_bytes,stdout=out,stderr=err,
                 timeout=min(timeout,left),preexec_fn=lambda:_limits(node,capture=True))
            if p.returncode:raise RestoreEngineRejected(phase+'_command_failed')
            if out.tell()>MAX_CAPTURE or err.tell()>MAX_CAPTURE:
                raise RestoreEngineRejected(phase+'_capture_truncated')
            out.seek(0);return out.read(MAX_CAPTURE)

    def sql(text):
        return run(pg_bin/'psql',['-X','-A','-t','-v','ON_ERROR_STOP=1','-d','t17_restored'],text).decode().strip()

    def replay_pg(args,allow_early_close=False):
        child=None;timer=None;input_error=None;written=0
        with tempfile.TemporaryFile(dir=root) as out,tempfile.TemporaryFile(dir=root) as err:
            try:
                def consume(chunk):
                    nonlocal child,timer,written
                    if not isinstance(chunk,(bytes,bytearray,memoryview)) or len(chunk)>MAX_INPUT_CHUNK:
                        raise RestoreEngineRejected('archive_stream_chunk_rejected')
                    written+=len(chunk)
                    if written>MAX_ARCHIVE_PLAINTEXT:raise RestoreEngineRejected('archive_stream_size_rejected')
                    if child is None:
                        child=subprocess.Popen([str(pg_bin/'pg_restore'),*args],env=env,
                          stdin=subprocess.PIPE,stdout=out,stderr=err,preexec_fn=lambda:_limits(capture=True))
                        timer=threading.Timer(min(600,max(.1,deadline-time.monotonic())),child.kill);timer.start()
                    child.stdin.write(chunk)
                try:replay(consume)
                except BaseException as error:input_error=error
                if child is None:
                    if input_error:raise RestoreEngineRejected('archive_stream_failed') from None
                    raise RestoreEngineRejected('archive_stream_empty')
                try:child.stdin.close()
                except BrokenPipeError:
                    if input_error is None:input_error=BrokenPipeError()
                status=child.wait(timeout=min(605,max(.1,deadline-time.monotonic())))
                if status:raise RestoreEngineRejected(phase+'_pg_restore_failed')
                if input_error and not (allow_early_close and isinstance(input_error,BrokenPipeError)):
                    raise RestoreEngineRejected('archive_stream_failed') from None
                if out.tell()>MAX_CAPTURE or err.tell()>MAX_CAPTURE:
                    raise RestoreEngineRejected(phase+'_capture_truncated')
                out.seek(0);return out.read(MAX_CAPTURE)
            finally:
                if timer:timer.cancel();timer.join(timeout=1)
                if child:
                    if child.poll() is None:child.kill()
                    child.wait(timeout=5)

    try:
        sock.mkdir(mode=0o700)
        version=run(pg_bin/'postgres',['--version']).decode().strip()
        if ' 17.' not in version:raise RestoreEngineRejected('pg17_required')
        # TOC consumes only the parent's already-authenticated bound replay.
        phase='toc';toc=replay_pg(['--list'],allow_early_close=True)
        if not toc:raise RestoreEngineRejected('archive_toc_empty')
        original=root/'archive.toc';filtered=root/'filtered.toc';helper=root/'pinned-filter.mjs'
        original.write_bytes(toc);helper.write_bytes(sources[PINNED[2][0]])
        result=run(node_bin,['--max-old-space-size=64',str(helper),str(original),str(filtered)],node=True)
        excluded=json.loads(result)['excluded']
        phase='initdb'
        run(pg_bin/'initdb',['-D',str(data),'-U',user,'--auth-local=peer','--auth-host=reject','--encoding=UTF8','--no-locale'])
        with (data/'postgresql.conf').open('a') as f:
            f.write("\nlisten_addresses=''\nport=6551\nunix_socket_directories='"+str(sock)+"'\n"
              "unix_socket_permissions=0700\nshared_buffers=16MB\nwork_mem=1MB\n"
              "max_connections=4\nmax_worker_processes=0\nmax_parallel_workers=0\n"
              "autovacuum=off\njit=off\nwal_level=minimal\nmax_wal_senders=0\narchive_mode=off\n"
              "max_wal_size=64MB\nmin_wal_size=32MB\ntemp_file_limit=512MB\nmaintenance_work_mem=32MB\nlog_statement=none\nlog_min_error_statement=panic\n")
        log=(root/'postgres.log').open('wb')
        process=subprocess.Popen([str(pg_bin/'postgres'),'-D',str(data)],env=env,
            stdin=subprocess.DEVNULL,stdout=log,stderr=log,preexec_fn=_limits)
        phase='startup'
        for _ in range(50):
            if process.poll() is not None:raise RestoreEngineRejected('postgres_start_failed')
            ready=subprocess.run([str(pg_bin/'pg_isready')],env=env,capture_output=True,timeout=3,preexec_fn=_limits)
            if ready.returncode==0:break
            time.sleep(.1)
        else:raise RestoreEngineRejected('postgres_start_timeout')
        run(pg_bin/'createdb',['t17_restored'])
        observed=json.loads(sql(b"SELECT json_build_object('data',current_setting('data_directory'),'socket',current_setting('unix_socket_directories'),'listen',current_setting('listen_addresses'),'db',current_database(),'user',current_user,'version',current_setting('server_version_num'))"))
        if (observed['data']!=str(data) or observed['socket']!=str(sock) or observed['listen']!=''
            or observed['db']!='t17_restored' or observed['user']!=user or not observed['version'].startswith('17')):
            raise RestoreEngineRejected('owned_cluster_identity_rejected')
        phase='bootstrap';sql(sources[PINNED[0][0]])
        phase='restore';replay_pg(['--exit-on-error','--use-list',str(filtered),'-d','t17_restored'])
        phase='compatibility_migration';sql(sources[PINNED[1][0]])
        phase='restored_identity_disarm';sql(DISARM_SQL.encode())
        phase='verification';checks=json.loads(sql(verification_sql))
        portable=(checks['portableRoles']==14 and checks['loginCompatibilityRoles']==0
          and checks['postgrestRuntimeLogin']==1 and checks['serviceRoleBypassesRls'] is True
          and checks['dataPlaneTables']==4 and checks['dataPlaneFunctions']==6
          and checks['writerFenceFunctions']==1 and checks['identityFenceEnabled'] is False
          and checks['vaultSchemaPresent'] is False and checks['vaultExtensionPresent'] is False
          and all(checks[k]>0 for k in ('publicTables','publicFunctions','userTriggers','rlsTables','policies')))
        application=(checks['applicationTables']==7 and checks['applicationFunctions']==3
          and checks['serviceRoleTableGrants']>0 and checks['serviceRoleRoutineGrants']>0)
        allowed=set(PORTABLE_ROLES)|{user,'stockinsider','pg_database_owner'}
        owners=checks['owners']
        if not isinstance(owners,dict) or not owners or not set(owners)<=allowed:
            raise RestoreEngineRejected('owner_allowlist_rejected')
        structural=json.loads(sql(b"SELECT json_build_object('invalidConstraints',(SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' AND NOT convalidated),'foreignKeys',(SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' AND contype='f'),'maxRelationBytes',(SELECT COALESCE(max(pg_relation_size(c.oid)),0) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','pg_toast')))"))
        if not portable:raise RestoreEngineRejected('portable_contract_rejected')
        if not application:raise RestoreEngineRejected('application_object_contract_rejected')
        if structural['invalidConstraints']!=0 or structural['foreignKeys']<1:
            raise RestoreEngineRejected('lineage_structure_rejected')
        named_app=json.loads(sql(b"SELECT json_build_object('appRls',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('source_run_ledger','candidate_source_mentions','candidate_research_runs','candidate_research_run_items','official_price_history','candidate_detail_snapshots','radar_public_snapshots') AND c.relkind IN ('r','p') AND c.relrowsecurity),'appSelect',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('source_run_ledger','candidate_source_mentions','candidate_research_runs','candidate_research_run_items','official_price_history','candidate_detail_snapshots','radar_public_snapshots') AND c.relkind IN ('r','p') AND has_table_privilege('service_role',c.oid,'SELECT')),'appExecute',(SELECT count(DISTINCT p.proname) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('source_document_coverage','publish_radar_public_snapshots','candidate_research_stock_authority_page') AND has_function_privilege('service_role',p.oid,'EXECUTE')))"))
        if named_app!={'appRls':7,'appSelect':7,'appExecute':3}:
            raise RestoreEngineRejected('named_application_rls_grants_rejected')
        phase='lineage_verification'
        for child,column,parent,parent_column in LINEAGE_EDGES:
            # Constants only; neither SQL identifiers nor predicates are supplied
            # by a caller, archive receipt or claimed schema metadata.
            required=((child,column),(parent,parent_column))
            for table,attribute in required:
                present=sql(("SELECT count(*) FROM pg_attribute WHERE attrelid=to_regclass('public."
                  +table+"') AND attname='"+attribute+"' AND attnum>0 AND NOT attisdropped").encode())
                if present!='1':raise RestoreEngineRejected('lineage_source_schema_rejected')
            predicate=(f'c.{column} IS NOT NULL AND p.{parent_column} IS NULL'
                if (child,column) in NULLABLE_LINEAGE_LINKS
                else f'c.{column} IS NULL OR p.{parent_column} IS NULL')
            query=(f'SELECT count(*) FROM public.{child} c LEFT JOIN public.{parent} p '
                f'ON p.{parent_column}=c.{column} WHERE ({predicate})')
            if sql(query.encode())!='0':raise RestoreEngineRejected('lineage_orphans_rejected')
        # No row payloads, user paths, keys or unknown owner names enter receipt.
        receipt.update(databaseRestored=True,portableContractVerified=True,
          applicationObjectContractVerified=True,ownerAllowlistVerified=True,
          currentDatabaseObserved=True,privateUnixClusterObserved=True,
          serverVersionNum=observed['version'],databaseBytes=checks['databaseBytes'],
          publicTables=checks['publicTables'],rlsTables=checks['rlsTables'],policies=checks['policies'],
          foreignKeys=structural['foreignKeys'],maxRelationBytes=structural['maxRelationBytes'],invalidConstraints=0,tocExcluded=excluded,
          appRls=named_app['appRls'],appSelect=named_app['appSelect'],appExecute=named_app['appExecute'],
          lineageValidation='DECLARED_FKS_AND_FIXED_PUBLIC_RELATIONS',lineageRelationsChecked=len(LINEAGE_EDGES),lineageOrphans=0,
          tocSha256=hashlib.sha256(toc).hexdigest(),filteredTocSha256=hashlib.sha256(filtered.read_bytes()).hexdigest(),
          restoredIdentityFenceDisabled=True,limitations=['declared constraints and seven fixed public row relations only',
          'no provider/key-escrow or full business-semantic validation','no Next rollback/service activation'])
    except RestoreEngineRejected:
        raise
    except Exception:
        raise RestoreEngineRejected(phase+'_failed') from None
    finally:
        if process:
            if process.poll() is None:process.terminate()
            try:process.wait(timeout=10)
            except subprocess.TimeoutExpired:process.kill();process.wait(timeout=5)
        if log:log.close()
        socket_gone=not (sock/'.s.PGSQL.6551').exists()
        reaped=process is None or process.poll() is not None
        shutil.rmtree(root)
        receipt['cleanup']={'postmasterReaped':reaped,'socketRemoved':socket_gone,'privateTreeRemoved':not root.exists()}
    if not all(receipt['cleanup'].values()):
        raise RestoreEngineRejected('engine_cleanup_failed')
    return receipt
