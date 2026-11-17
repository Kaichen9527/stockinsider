BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';
SET LOCAL search_path = pg_catalog;

DO $$
BEGIN
  IF EXISTS (
    SELECT FROM (VALUES
      ('public.enforce_production_writer_fence()', 'c3cc691d21eabd9431524b25ef53e4513100d6fe56031ebe2371ce01957417d9', 'public.source_raw_documents', 'trg_source_raw_documents_writer_fence', 23),
      ('public.fence_research_paper_book_append_v1()', 'db1f6885e858bc0c20c1657864d1da68394286f2c5656b4a332f5f5a21d6f825', 'public.research_paper_book_revisions_v1', 'trg_research_paper_book_append_v1', 7),
      ('public.fence_research_strategy_record_v1()', '11eafc6d0e201e23452d6dec2d6f64bddecddd9fa7ee8b9c6ff4f66f6e627bff', 'public.research_strategy_records_v1', 'trg_research_strategy_record_fence_v1', 7)
    ) AS expected(signature, definition_sha256, relation_name, trigger_name, event_mask)
    WHERE NOT EXISTS (
      SELECT FROM pg_proc p JOIN pg_trigger t ON t.tgfoid = p.oid
      WHERE p.oid = to_regprocedure(expected.signature) AND p.proowner = 'postgres'::regrole
        AND p.prosecdef AND p.prorettype = 'pg_catalog.trigger'::regtype
        AND encode(sha256(convert_to(pg_get_functiondef(p.oid), 'UTF8')), 'hex') = expected.definition_sha256
        AND t.tgrelid = to_regclass(expected.relation_name)
        AND t.tgname = expected.trigger_name AND t.tgtype = expected.event_mask
        AND t.tgenabled = 'O' AND NOT t.tgisinternal
    )
  ) THEN
    RAISE EXCEPTION 'source_guard_trigger_predecessor_mismatch';
  END IF;
END
$$;

-- These guards execute through their installed triggers. Limit creation or
-- replacement of their bindings to roles with an explicit execute grant.
REVOKE EXECUTE ON FUNCTION public.enforce_production_writer_fence(),
  public.fence_research_paper_book_append_v1(), public.fence_research_strategy_record_v1()
  FROM PUBLIC, anon, authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT FROM unnest(ARRAY[
      'public.enforce_production_writer_fence()',
      'public.fence_research_paper_book_append_v1()',
      'public.fence_research_strategy_record_v1()'
    ]) guards(signature)
    CROSS JOIN unnest(ARRAY['anon', 'authenticated', 'service_role', 'research_source_fence_owner_v2']) roles(name)
    WHERE has_function_privilege(roles.name, guards.signature, 'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'source_guard_trigger_acl_mismatch';
  END IF;
END
$$;

COMMIT;
