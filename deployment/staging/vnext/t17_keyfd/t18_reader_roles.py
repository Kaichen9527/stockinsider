"""Clone-only fixed PostgREST reader privileges AFTER all T17 DB gates.

Internal owned-DB callback only. No role/username/connection/SQL override or
admission flag. Parent separately binds peer-auth to an observed nonroot broker
UID. This changes clone catalogs/ACLs, never original rows or constraint bits.
"""
import json
from .t18_launch_detail_projections import DETAIL_SIGNATURE_PINS

ROLE_COUNTS={'createdRoles':2,'elevatedRoles':0,'readOnlyRoleSettings':2,
 'membershipEdges':1,'unexpectedMemberships':0,'allowedSelectColumns':11,
 'unexpectedSelectColumns':0,'writePrivileges':0,'publicRoutineExecutions':0,'sequenceWritePrivileges':0,'nonPublicSchemaUsagePrivileges':0,
 'schemaCreatePrivileges':0,'databaseCreatePrivileges':0,'temporaryDatabasePrivileges':0,
 'authConnectPrivileges':1,'readerConnectPrivileges':0,'readerPolicies':4,'rlsTables':2}

_FIXED_READER_ROLE_SETUP_SQL=br"""
\set QUIET 1
BEGIN;
SET LOCAL search_path=pg_catalog;
DO $reader_precondition$
BEGIN
 IF current_database()<>'t17_restored' OR EXISTS(SELECT FROM pg_roles WHERE rolname IN ('t18_authenticator','t18_reader'))
 THEN RAISE EXCEPTION 'fixed_reader_role_precondition_rejected'; END IF;
END $reader_precondition$;
CREATE ROLE t18_authenticator LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD NULL CONNECTION LIMIT 3;
CREATE ROLE t18_reader NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD NULL;
GRANT t18_reader TO t18_authenticator WITH INHERIT FALSE, SET TRUE;
ALTER ROLE t18_authenticator SET default_transaction_read_only=on;
ALTER ROLE t18_reader SET default_transaction_read_only=on;
ALTER ROLE t18_authenticator SET statement_timeout='2s';
ALTER ROLE t18_reader SET statement_timeout='2s';
DO $reader_remove_public_authority$
DECLARE n record;
BEGIN
 FOR n IN SELECT nspname FROM pg_namespace WHERE nspname NOT IN ('pg_catalog','information_schema') AND nspname NOT LIKE 'pg\_%' ESCAPE '\' LOOP
  EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM PUBLIC,t18_reader,t18_authenticator',n.nspname);
  EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA %I FROM PUBLIC,t18_reader,t18_authenticator',n.nspname);
  EXECUTE format('REVOKE EXECUTE ON ALL ROUTINES IN SCHEMA %I FROM PUBLIC,t18_reader,t18_authenticator',n.nspname);
  EXECUTE format('REVOKE ALL ON SCHEMA %I FROM PUBLIC,t18_reader,t18_authenticator',n.nspname);
 END LOOP;
END $reader_remove_public_authority$;
GRANT USAGE ON SCHEMA public TO t18_reader,t18_authenticator;
REVOKE ALL ON DATABASE t17_restored FROM PUBLIC,t18_reader,t18_authenticator;
GRANT CONNECT ON DATABASE t17_restored TO t18_authenticator;
GRANT SELECT(id,etag,content_as_of,published_at,payload_json,window_key,status) ON public.radar_public_snapshots TO t18_reader;
GRANT SELECT(window_key,status,last_attempt_at,terminal_reason) ON public.radar_publication_state TO t18_reader;
ALTER TABLE public.radar_public_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_publication_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY t18_snapshot_reader_allow ON public.radar_public_snapshots AS PERMISSIVE FOR SELECT TO t18_reader
 USING(window_key IN ('home','daily') AND status='valid');
CREATE POLICY t18_snapshot_reader_bound ON public.radar_public_snapshots AS RESTRICTIVE FOR SELECT TO t18_reader
 USING(window_key IN ('home','daily') AND status='valid');
CREATE POLICY t18_state_reader_allow ON public.radar_publication_state AS PERMISSIVE FOR SELECT TO t18_reader
 USING(window_key IN ('home','daily') AND status IN ('valid','failed'));
CREATE POLICY t18_state_reader_bound ON public.radar_publication_state AS RESTRICTIVE FOR SELECT TO t18_reader
 USING(window_key IN ('home','daily') AND status IN ('valid','failed'));
DO $reader_observation$
DECLARE result jsonb;
BEGIN
 WITH fixed_columns(table_name,column_name) AS (VALUES
  ('radar_public_snapshots','id'),('radar_public_snapshots','etag'),('radar_public_snapshots','content_as_of'),
  ('radar_public_snapshots','published_at'),('radar_public_snapshots','payload_json'),
  ('radar_public_snapshots','window_key'),('radar_public_snapshots','status'),
  ('radar_publication_state','window_key'),('radar_publication_state','status'),
  ('radar_publication_state','last_attempt_at'),('radar_publication_state','terminal_reason'))
 SELECT jsonb_build_object(
  'createdRoles',(SELECT count(*) FROM pg_roles WHERE rolname IN ('t18_authenticator','t18_reader')),
  'elevatedRoles',(SELECT count(*) FROM pg_roles WHERE rolname IN ('t18_authenticator','t18_reader') AND
    (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication OR rolinherit
     OR (rolname='t18_authenticator' AND (NOT rolcanlogin OR rolconnlimit<>3)) OR (rolname='t18_reader' AND rolcanlogin))),
  'readOnlyRoleSettings',(SELECT count(*) FROM pg_roles WHERE rolname IN ('t18_authenticator','t18_reader') AND rolconfig @> ARRAY['default_transaction_read_only=on','statement_timeout=2s']),
  'membershipEdges',(SELECT count(*) FROM pg_auth_members WHERE member='t18_authenticator'::regrole AND roleid='t18_reader'::regrole AND NOT inherit_option AND set_option AND NOT admin_option),
  'unexpectedMemberships',(SELECT count(*) FROM pg_auth_members WHERE member IN ('t18_authenticator'::regrole,'t18_reader'::regrole) AND NOT(member='t18_authenticator'::regrole AND roleid='t18_reader'::regrole AND NOT inherit_option AND set_option AND NOT admin_option)),
  'allowedSelectColumns',(SELECT count(*) FROM fixed_columns e JOIN pg_namespace n ON n.nspname='public' JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=e.table_name JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname=e.column_name AND a.attnum>0 AND NOT a.attisdropped WHERE has_column_privilege('t18_reader',c.oid,a.attnum,'SELECT')),
  'unexpectedSelectColumns',(SELECT count(*) FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped WHERE r.rolname IN ('t18_reader','t18_authenticator') AND n.nspname='public' AND c.relkind IN ('r','p') AND has_column_privilege(r.oid,c.oid,a.attnum,'SELECT') AND NOT(r.rolname='t18_reader' AND EXISTS(SELECT FROM fixed_columns e WHERE e.table_name=c.relname AND e.column_name=a.attname))),
  'writePrivileges',(SELECT count(*) FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE r.rolname IN ('t18_reader','t18_authenticator') AND n.nspname='public' AND c.relkind IN ('r','p') AND (has_table_privilege(r.oid,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege(r.oid,c.oid,'INSERT,UPDATE,REFERENCES'))),
  'publicRoutineExecutions',(SELECT count(*) FROM pg_roles r CROSS JOIN pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE r.rolname IN ('t18_reader','t18_authenticator') AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg\_%' ESCAPE '\' AND has_function_privilege(r.oid,p.oid,'EXECUTE')),
  'sequenceWritePrivileges',(SELECT count(*) FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE r.rolname IN ('t18_reader','t18_authenticator') AND c.relkind='S' AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg\_%' ESCAPE '\' AND has_sequence_privilege(r.oid,c.oid,'USAGE,UPDATE')),
  'nonPublicSchemaUsagePrivileges',(SELECT count(*) FROM pg_roles r CROSS JOIN pg_namespace n WHERE r.rolname IN ('t18_reader','t18_authenticator') AND n.nspname NOT IN ('public','pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg\_%' ESCAPE '\' AND has_schema_privilege(r.oid,n.oid,'USAGE')),
  'schemaCreatePrivileges',(SELECT count(*) FROM pg_roles WHERE rolname IN ('t18_reader','t18_authenticator') AND has_schema_privilege(oid,'public','CREATE')),
  'databaseCreatePrivileges',(SELECT count(*) FROM pg_roles WHERE rolname IN ('t18_reader','t18_authenticator') AND has_database_privilege(oid,current_database(),'CREATE')),
  'temporaryDatabasePrivileges',(SELECT count(*) FROM pg_roles WHERE rolname IN ('t18_reader','t18_authenticator') AND has_database_privilege(oid,current_database(),'TEMP')),
  'authConnectPrivileges',(SELECT has_database_privilege('t18_authenticator',current_database(),'CONNECT')::int),
  'readerConnectPrivileges',(SELECT has_database_privilege('t18_reader',current_database(),'CONNECT')::int),
  'readerPolicies',(SELECT count(*) FROM pg_policy WHERE polrelid IN ('public.radar_public_snapshots'::regclass,'public.radar_publication_state'::regclass) AND polcmd='r' AND polroles=ARRAY['t18_reader'::regrole::oid] AND polname IN ('t18_snapshot_reader_allow','t18_snapshot_reader_bound','t18_state_reader_allow','t18_state_reader_bound')),
  'rlsTables',(SELECT count(*) FROM pg_class WHERE oid IN ('public.radar_public_snapshots'::regclass,'public.radar_publication_state'::regclass) AND relrowsecurity)
 ) INTO result;
 IF result<>'{"createdRoles":2,"elevatedRoles":0,"readOnlyRoleSettings":2,"membershipEdges":1,"unexpectedMemberships":0,"allowedSelectColumns":11,"unexpectedSelectColumns":0,"writePrivileges":0,"publicRoutineExecutions":0,"sequenceWritePrivileges":0,"nonPublicSchemaUsagePrivileges":0,"schemaCreatePrivileges":0,"databaseCreatePrivileges":0,"temporaryDatabasePrivileges":0,"authConnectPrivileges":1,"readerConnectPrivileges":0,"readerPolicies":4,"rlsTables":2}'::jsonb
 THEN RAISE EXCEPTION 'fixed_reader_role_privileges_rejected'; END IF;
 PERFORM set_config('stockinsider.t18_fixed_reader_roles',result::text,true);
END $reader_observation$;
"""

_FIXED_READER_RECEIPT_SQL=br"""SELECT current_setting('stockinsider.t18_fixed_reader_roles')::jsonb;
COMMIT;
"""
FIXED_READER_ROLE_SQL=_FIXED_READER_ROLE_SETUP_SQL+_FIXED_READER_RECEIPT_SQL

# Clone-only PG17 routine pins from the launch ranking and outcome migrations.
_LAUNCH_PINS = (
    ('public.vnext_launch_ranking_read_v1(uuid,text)',
     '6acbe1a334f15419d3293c8d5384ff61b732112ec40f0ace0db4088eb96ab189'),
    ('public.vnext_launch_outcome_public_v1(uuid,text)',
     '79690d17c3ba526eef7a5804636667422e33c526777f83b530625d3f7bf3e51a'),
)
_LAUNCH_READER_GRANTS_SQL = br"""
DO $launch_reader_admission$
DECLARE owner_oid oid; granted_oids oid[]; routine_oid oid; allowed integer;
BEGIN
 IF inet_server_addr() IS NOT NULL OR current_database()<>'t17_restored' THEN
  RAISE EXCEPTION 'launch_reader_clone_socket_required';
 END IF;
 SELECT oid INTO owner_oid FROM pg_roles WHERE rolname='stockinsider_vnext_owner'
  AND NOT (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)
  AND rolconfig IS NULL;
 IF owner_oid IS NULL OR EXISTS(SELECT FROM pg_auth_members WHERE member=owner_oid OR roleid=owner_oid)
  OR EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=owner_oid AND setconfig IS NOT NULL) THEN
  RAISE EXCEPTION 'launch_reader_definer_role_rejected';
 END IF;
 WITH expected(signature,definition_sha256) AS (VALUES
   __FIXED_PINS__
 )
 SELECT array_agg(p.oid) INTO granted_oids FROM expected e JOIN pg_proc p ON p.oid=to_regprocedure(e.signature)
 WHERE p.prokind='f' AND p.provolatile='s' AND p.prosecdef AND p.proowner=owner_oid
  AND p.prorettype='pg_catalog.jsonb'::regtype AND NOT p.proretset
  AND CASE WHEN p.prokind='f' THEN
   encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')=e.definition_sha256
  ELSE false END;
 IF cardinality(granted_oids) IS DISTINCT FROM __FIXED_COUNT__ THEN
  RAISE EXCEPTION 'launch_reader_projection_definition_rejected';
 END IF;

 FOREACH routine_oid IN ARRAY granted_oids LOOP
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO t18_reader',routine_oid::regprocedure);
 END LOOP;
 SELECT count(*) INTO allowed FROM pg_proc p
 WHERE p.oid=ANY(granted_oids) AND has_function_privilege('t18_reader',p.oid,'EXECUTE')
  AND NOT has_function_privilege('t18_authenticator',p.oid,'EXECUTE');
 IF allowed<>__FIXED_COUNT__ OR EXISTS(
  SELECT FROM pg_roles r CROSS JOIN pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE r.rolname IN ('t18_reader','t18_authenticator')
   AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg\_%' ESCAPE '\'
   AND has_function_privilege(r.oid,p.oid,'EXECUTE')
   AND NOT (r.rolname='t18_reader' AND p.oid=ANY(granted_oids))
 ) THEN RAISE EXCEPTION 'launch_reader_projection_privileges_rejected'; END IF;
 PERFORM set_config('stockinsider.t18_fixed_reader_roles',
  (current_setting('stockinsider.t18_fixed_reader_roles')::jsonb||
   jsonb_build_object('publicRoutineExecutions',allowed,'launchProjectionDefinitionsPinned',cardinality(granted_oids)))::text,true);
END $launch_reader_admission$;
"""


def _launch_role_profile(pins):
    values = b',\n'.join(f"('{signature}','{digest}')".encode('ascii') for signature, digest in pins)
    grants = _LAUNCH_READER_GRANTS_SQL.replace(b'__FIXED_PINS__',values).replace(
        b'__FIXED_COUNT__',str(len(pins)).encode('ascii'))
    counts = {**ROLE_COUNTS,'publicRoutineExecutions':len(pins),'launchProjectionDefinitionsPinned':len(pins)}
    return _FIXED_READER_ROLE_SETUP_SQL + grants + _FIXED_READER_RECEIPT_SQL, counts


LAUNCH_READER_ROLE_SQL, LAUNCH_ROLE_COUNTS = _launch_role_profile(_LAUNCH_PINS)
LAUNCH_DETAIL_READER_ROLE_SQL, LAUNCH_DETAIL_ROLE_COUNTS = _launch_role_profile(_LAUNCH_PINS + DETAIL_SIGNATURE_PINS)


class FixedReaderRolesRejected(Exception):
    def __init__(self):super().__init__('fixed_reader_role_installation_rejected')


def install_fixed_reader_roles(sql, *, allow_launch_reads=False, allow_launch_detail_reads=False):
    """Install one fixed privilege set using the trusted clone-only SQL callback."""
    if (not callable(sql) or type(allow_launch_reads) is not bool or type(allow_launch_detail_reads) is not bool
            or allow_launch_detail_reads and not allow_launch_reads):raise FixedReaderRolesRejected()
    if allow_launch_detail_reads:
        statement,expected=LAUNCH_DETAIL_READER_ROLE_SQL,LAUNCH_DETAIL_ROLE_COUNTS
    elif allow_launch_reads:
        statement,expected=LAUNCH_READER_ROLE_SQL,LAUNCH_ROLE_COUNTS
    else:
        statement,expected=FIXED_READER_ROLE_SQL,ROLE_COUNTS
    raw=sql(statement)
    if not isinstance(raw,(str,bytes)) or len(raw)>4096:raise FixedReaderRolesRejected()
    try:result=json.loads(raw)
    except (TypeError,ValueError):raise FixedReaderRolesRejected() from None
    if (type(result) is not dict or set(result)!=set(expected)
        or any(type(result[k]) is not int or result[k]!=v for k,v in expected.items())):
        raise FixedReaderRolesRejected()
    return dict(result)
