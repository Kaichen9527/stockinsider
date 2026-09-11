\set ON_ERROR_STOP on

-- Run against the new, empty StockInsider-only database before pg_restore.
-- It creates compatibility principals expected by the reviewed RLS/RPC schema;
-- it does not create users, passwords, plaintext secret tables, or a Vault shim.
DO $bootstrap$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY[
    'anon','authenticated','service_role','authenticator',
    'opportunity_v3_rpc_owner','legacy_correctness_rpc_owner',
    -- NOLOGIN compatibility owners needed to replay the reviewed Supabase
    -- archive without importing provider-managed passwords or privileges.
    'postgres','supabase_admin','supabase_auth_admin',
    'supabase_realtime_admin','supabase_storage_admin','pgbouncer','dashboard_user',
    'stockinsider_runtime_v319'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN NOINHERIT',role_name);
    END IF;
  END LOOP;
END
$bootstrap$;

GRANT anon, authenticated, service_role TO authenticator;
ALTER ROLE service_role BYPASSRLS;
CREATE SCHEMA IF NOT EXISTS extensions AUTHORIZATION postgres;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
