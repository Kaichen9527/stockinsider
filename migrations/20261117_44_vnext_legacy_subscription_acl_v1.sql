BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';

-- Preserve the explicitly granted web and service callers. A source-processing
-- role has no reason to execute the legacy subscriber identity lookup.
REVOKE EXECUTE ON FUNCTION public.is_subscriber() FROM PUBLIC;
ALTER FUNCTION public.is_subscriber() SET search_path = pg_catalog;

DO $$
DECLARE
  subscriber_check regprocedure := 'public.is_subscriber()'::regprocedure;
BEGIN
  IF NOT has_function_privilege('anon', subscriber_check, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', subscriber_check, 'EXECUTE')
     OR NOT has_function_privilege('service_role', subscriber_check, 'EXECUTE')
     OR has_function_privilege('research_source_fence_owner_v2', subscriber_check, 'EXECUTE')
  THEN
    RAISE EXCEPTION 'legacy_subscriber_acl_mismatch';
  END IF;
END
$$;

COMMIT;
