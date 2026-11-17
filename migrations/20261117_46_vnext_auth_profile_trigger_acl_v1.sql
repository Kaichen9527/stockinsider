BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';
SET LOCAL search_path = pg_catalog;

DO $$
DECLARE
  profile_hook regprocedure := 'public.handle_new_user()'::regprocedure;
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_proc
    WHERE oid = profile_hook AND proowner = 'postgres'::regrole
      AND prosecdef AND prorettype = 'pg_catalog.trigger'::regtype
      AND encode(sha256(convert_to(pg_get_functiondef(oid), 'UTF8')), 'hex')
        = '8de1a903bd2b604409bedd79a68d2a22f8d9350eaa73570910a464f8c4981453'
  ) OR (SELECT count(*) FROM pg_trigger WHERE tgfoid = profile_hook) <> 1
    OR NOT EXISTS (
      SELECT FROM pg_trigger
      WHERE tgfoid = profile_hook AND tgrelid = 'auth.users'::regclass
        AND tgname = 'on_auth_user_created' AND tgtype = 5 AND tgenabled = 'O' AND NOT tgisinternal
    )
  THEN
    RAISE EXCEPTION 'auth_profile_trigger_predecessor_mismatch';
  END IF;
END
$$;

-- The installed auth.users trigger keeps provisioning member profiles.
-- EXECUTE controls who may attach this definer to other relations.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT FROM unnest(ARRAY['anon', 'authenticated', 'service_role', 'research_source_fence_owner_v2']) principals(name)
    WHERE has_function_privilege(name, 'public.handle_new_user()', 'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'auth_profile_trigger_acl_mismatch';
  END IF;
END
$$;

COMMIT;
