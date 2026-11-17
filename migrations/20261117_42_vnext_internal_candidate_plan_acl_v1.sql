BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';

-- Keep the internal candidate planner available to the existing RPC owner
-- and service caller. Browser roles read only the published projections.
REVOKE EXECUTE ON FUNCTION public.opportunity_candidate_plan_v3_internal(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.opportunity_candidate_plan_v3_internal(uuid, text)
  TO opportunity_v3_rpc_owner, service_role;

DO $$
DECLARE
  planner regprocedure := 'public.opportunity_candidate_plan_v3_internal(uuid,text)'::regprocedure;
BEGIN
  IF has_function_privilege('anon', planner, 'EXECUTE')
     OR has_function_privilege('authenticated', planner, 'EXECUTE')
     OR NOT has_function_privilege('opportunity_v3_rpc_owner', planner, 'EXECUTE')
     OR NOT has_function_privilege('service_role', planner, 'EXECUTE')
  THEN
    RAISE EXCEPTION 'internal_candidate_plan_acl_mismatch';
  END IF;
END
$$;

COMMIT;
