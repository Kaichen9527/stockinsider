BEGIN;

GRANT CREATE ON SCHEMA public TO legacy_correctness_rpc_owner,opportunity_v3_rpc_owner;

-- The runtime-health REST boundary inserts into a table owned by the legacy
-- correctness role.  Keep the public RPC executable only by service_role, but
-- execute the SECURITY DEFINER body as the table owner so production health
-- publication cannot fail with 42501 after a successful producer run.
ALTER FUNCTION public.append_legacy_runtime_health_rest_v3_15(
  text,text,text,bytea,jsonb,text,timestamptz
) OWNER TO legacy_correctness_rpc_owner;

REVOKE ALL ON FUNCTION public.append_legacy_runtime_health_rest_v3_15(
  text,text,text,bytea,jsonb,text,timestamptz
) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.append_legacy_runtime_health_rest_v3_15(
  text,text,text,bytea,jsonb,text,timestamptz
) TO service_role;

REVOKE CREATE ON SCHEMA public FROM legacy_correctness_rpc_owner,opportunity_v3_rpc_owner;

COMMIT;
