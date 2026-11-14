"""Clone-only fixed PostgREST reader privileges AFTER all T17 DB gates.

Internal owned-DB callback only. No role/username/connection/SQL override or
admission flag. Parent separately binds peer-auth to an observed nonroot broker
UID. This changes clone catalogs/ACLs, never original rows or constraint bits.
"""
import json

ROLE_COUNTS={'createdRoles':2,'elevatedRoles':0,'readOnlyRoleSettings':2,
 'membershipEdges':1,'unexpectedMemberships':0,'allowedSelectColumns':11,
 'unexpectedSelectColumns':0,'writePrivileges':0,'publicRoutineExecutions':0,'sequenceWritePrivileges':0,'nonPublicSchemaUsagePrivileges':0,
 'schemaCreatePrivileges':0,'databaseCreatePrivileges':0,'temporaryDatabasePrivileges':0,
 'authConnectPrivileges':1,'readerConnectPrivileges':0,'readerPolicies':4,'rlsTables':2}

FIXED_READER_ROLE_SQL=br"""
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
SELECT current_setting('stockinsider.t18_fixed_reader_roles')::jsonb;
COMMIT;
"""


class FixedReaderRolesRejected(Exception):
    def __init__(self):super().__init__('fixed_reader_role_installation_rejected')


def install_fixed_reader_roles(sql):
    if not callable(sql):raise FixedReaderRolesRejected()
    raw=sql(FIXED_READER_ROLE_SQL)
    if not isinstance(raw,(str,bytes)) or len(raw)>4096:raise FixedReaderRolesRejected()
    try:result=json.loads(raw)
    except (TypeError,ValueError):raise FixedReaderRolesRejected() from None
    if (type(result) is not dict or set(result)!=set(ROLE_COUNTS)
        or any(type(result[k]) is not int or result[k]!=v for k,v in ROLE_COUNTS.items())):
        raise FixedReaderRolesRejected()
    return dict(result)
