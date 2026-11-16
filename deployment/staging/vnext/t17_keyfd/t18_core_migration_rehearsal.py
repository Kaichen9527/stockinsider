"""Fixed core migration rehearsal for the authenticated disposable T18 clone."""
import hashlib
import json
import os
from pathlib import Path
import re
import stat


_CORE_NAME = '20261022_stockinsider_vnext_20_v1.sql'
_LEGACY_NAME = '20261022_vnext_legacy_mode_fence_v1.sql'
_CORE_SHA256 = '84418af40194689ff6b85a11394bbcd04c28ce8041281bc897149a44e86c90de'
_LEGACY_SHA256 = '272130d1747d3faa1f6d65554c8af8ffbc3d7ab1ad7b1045d4f9b331293c6685'
_LEGACY_DATA = re.compile(rb"\('(public\.[a-z0-9_]+\([a-z0-9_, ]*\))','([0-9a-f]{64})'\)")
_LEGACY_EXPECTED = [
    'public.admit_research_observed_roster_v1(text,text)',
    'public.assign_research_reviewer_v2(jsonb,uuid,text,text,text,uuid,text)',
    'public.charge_research_deep_admission_v1()',
    'public.claim_candidate_deep_outbox_v1(uuid,text,integer,uuid,text,text)',
    'public.claim_candidate_dossier_outbox_v5(text,integer)',
    'public.claim_research_deep_job_v1(text)',
    'public.claim_research_observed_job_v2(text,text)',
    'public.enqueue_research_deep_jobs_v1(uuid)',
    'public.receive_research_reviewer_result_v2(jsonb,uuid,text,text,text,uuid,text,jsonb)',
    'public.record_budgeted_deep_review_v1(uuid,integer,uuid,jsonb)',
    'public.record_candidate_deep_submission_v1(uuid,text,integer,uuid,text,uuid,text,uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,text,jsonb)',
    'public.record_candidate_dossier_submission_v4(uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,text,jsonb)',
    'public.record_candidate_dossier_submission_v6(uuid,text,uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,text,jsonb)',
    'public.reserve_research_model_v1(text,text,text)',
    'public.store_observed_research_priority_v1(text,timestamp with time zone,text,jsonb,jsonb,jsonb,jsonb)',
]
_CORE_OK = {'modeEnabled':False,'legacyFenced':False,'rlsOwnedTables':14,'writerFences':14,
            'jobs':0,'publications':0,'anonDirectRead':False,'serviceDirectRead':False}
_READINESS_SQL = br"""
\set QUIET 1
BEGIN READ ONLY;
SELECT (
 current_database()='t17_restored' AND inet_server_addr() IS NULL
 AND NOT EXISTS(SELECT FROM pg_roles WHERE rolname='stockinsider_vnext_owner')
 AND NOT EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='public' AND left(c.relname,6)='vnext_')
 AND NOT EXISTS(SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                WHERE n.nspname='public' AND left(p.proname,6)='vnext_')
 AND (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role'))=3
)::text;
COMMIT;
"""
_CORE_VERIFY_SQL = br"""
\set QUIET 1
BEGIN READ ONLY;
SELECT jsonb_build_object(
 'modeEnabled',(SELECT enabled FROM public.vnext_mode_v1),
 'legacyFenced',(SELECT legacy_fenced FROM public.vnext_mode_v1),
 'rlsOwnedTables',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' AND left(c.relname,6)='vnext_'
    AND c.relrowsecurity AND c.relowner='stockinsider_vnext_owner'::regrole),
 'writerFences',(SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND left(c.relname,6)='vnext_'
    AND t.tgname='vnext_writer_fence' AND t.tgfoid='public.enforce_production_writer_fence()'::regprocedure
    AND NOT t.tgisinternal AND t.tgenabled='O'),
 'jobs',(SELECT count(*) FROM public.vnext_jobs_v1),
 'publications',(SELECT count(*) FROM public.vnext_publications_v1),
 'anonDirectRead',has_table_privilege('anon','public.vnext_publications_v1','SELECT'),
 'serviceDirectRead',has_table_privilege('service_role','public.vnext_publications_v1','SELECT'));
COMMIT;
"""
_ROLLBACK_WITNESS_SQL=b"""
SELECT (to_regprocedure('public.vnext_catalog_canonical_v1(jsonb)') IS NULL AND
 to_regclass('public.vnext_legacy_routines_v1') IS NULL AND
 EXISTS(SELECT FROM public.vnext_mode_v1 WHERE NOT enabled AND NOT legacy_fenced))::text;
"""


class CoreRehearsalRejected(Exception):
    def __init__(self):
        super().__init__('fixed_core_migration_rehearsal_rejected')


def _migration_bytes(root,name,digest):
    fd=os.open(root/'migrations'/name,os.O_RDONLY|os.O_CLOEXEC|os.O_NOFOLLOW)
    with os.fdopen(fd,'rb') as data:
        info=os.fstat(data.fileno())
        if (not stat.S_ISREG(info.st_mode) or info.st_uid!=0 or info.st_mode&0o022
            or not 0<info.st_size<=96*1024):
            raise CoreRehearsalRejected()
        content=data.read(96*1024+1)
    if hashlib.sha256(content).hexdigest()!=digest:
        raise CoreRehearsalRejected()
    return content


def _legacy_probe_sql(legacy):
    catalog=legacy.split(b'CREATE FUNCTION public.vnext_catalog_canonical_v1',1)
    if len(catalog)!=2:
        raise CoreRehearsalRejected()
    catalog=b'CREATE FUNCTION public.vnext_catalog_canonical_v1'+catalog[1].split(
        b'ALTER FUNCTION public.vnext_catalog_canonical_v1',1)[0]
    expected=_LEGACY_DATA.findall(legacy)
    if [sig.decode('ascii') for sig,_ in expected]!=_LEGACY_EXPECTED:
        raise CoreRehearsalRejected()
    install=legacy.split(b'DO $install$',1)[1].split(b'END $install$;',1)[0]
    marker=b"  SELECT jsonb_build_object('name',p.proname"
    clause=b' INTO metadata FROM pg_proc p WHERE oid=routine;'
    if install.count(marker)!=1 or install.count(clause)!=1:
        raise CoreRehearsalRejected()
    start=install.index(marker)
    metadata=install[start:install.index(clause,start)]
    values=b','.join(b"('"+signature+b"','"+digest+b"')" for signature,digest in expected)
    return br"""
\set QUIET 1
BEGIN;
SET LOCAL statement_timeout='20s';
"""+catalog+b"""
WITH expected(signature,body_hash) AS (VALUES """+values+b"""), actual AS (
 SELECT expected.*,to_regprocedure(signature) AS routine FROM expected
), classified AS (
 SELECT signature,CASE
  WHEN routine IS NULL THEN 'MISSING'
  WHEN (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname=(SELECT proname FROM pg_proc WHERE oid=routine))<>1
  THEN 'OVERLOAD'
  WHEN encode(sha256(convert_to(public.vnext_catalog_canonical_v1((
"""+metadata+b""" FROM pg_proc p WHERE p.oid=routine
  )),'UTF8')),'hex')=body_hash
  THEN 'MATCH'
  ELSE 'DEFINITION_OR_AUTHORITY_DIFFERS'
  END AS status FROM actual
)
SELECT jsonb_object_agg(signature,status) FROM classified;
ROLLBACK;
"""


def _project_json(raw):
    if not isinstance(raw,(str,bytes)) or len(raw)>8192:
        raise CoreRehearsalRejected()
    try:
        return json.loads(raw)
    except (ValueError,UnicodeError):
        raise CoreRehearsalRejected() from None


def project_core_rehearsal(value):
    if type(value) is not dict or set(value)!={'status','core','legacyPredecessors','probeRolledBack'}:
        return None
    if value['status']!='CORE_INSTALLED_DISABLED' or value['probeRolledBack'] is not True:
        return None
    core=value['core']
    legacy=value['legacyPredecessors']
    if (type(core) is not dict or set(core)!=set(_CORE_OK)
        or any(type(core[key]) is not type(expected) or core[key]!=expected
               for key,expected in _CORE_OK.items())
        or type(legacy) is not dict or set(legacy)!=set(_LEGACY_EXPECTED)
        or any(status not in ('MISSING','OVERLOAD','MATCH','DEFINITION_OR_AUTHORITY_DIFFERS')
               for status in legacy.values())):
        return None
    return value


def rehearse_core_migration(sql,markers):
    """Own only the fixed core DDL; probe the next migration in a rollback."""
    root=Path(__file__).resolve().parents[4]
    paths=(root/'migrations'/_CORE_NAME,root/'migrations'/_LEGACY_NAME)
    available=[path.exists() for path in paths]
    if not any(available):
        return None
    if not all(available):
        raise CoreRehearsalRejected()
    if not markers['writerFenceGuardPinned'] or not markers['opportunityOwner']:
        return None
    if sql(_READINESS_SQL) not in ('true',b'true'):
        return None
    core=_migration_bytes(root,_CORE_NAME,_CORE_SHA256)
    legacy=_migration_bytes(root,_LEGACY_NAME,_LEGACY_SHA256)
    legacy_probe=_legacy_probe_sql(legacy)
    sql(br'\set QUIET 1'+b'\n'+core)
    verified=_project_json(sql(_CORE_VERIFY_SQL))
    predecessors=_project_json(sql(legacy_probe))
    if sql(_ROLLBACK_WITNESS_SQL) not in ('true',b'true'):
        raise CoreRehearsalRejected()
    result=project_core_rehearsal({'status':'CORE_INSTALLED_DISABLED','core':verified,
              'legacyPredecessors':predecessors,'probeRolledBack':True})
    if result is None:
        raise CoreRehearsalRejected()
    return result
