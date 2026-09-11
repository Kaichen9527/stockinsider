\set ON_ERROR_STOP on

-- Run against the new, empty StockInsider-only database before pg_restore.
-- It creates compatibility principals expected by the reviewed RLS/RPC schema;
-- it does not create users, passwords, plaintext secret tables, or a Vault shim.
DO $bootstrap$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY[
    'anon','authenticated','service_role','authenticator',
    'opportunity_v3_rpc_owner','legacy_correctness_rpc_owner'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN NOINHERIT',role_name);
    END IF;
  END LOOP;
END
$bootstrap$;

GRANT anon, authenticated, service_role TO authenticator;
ALTER ROLE service_role BYPASSRLS;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
