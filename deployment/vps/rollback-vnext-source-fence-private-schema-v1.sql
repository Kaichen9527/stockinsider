-- Reverse the source fence migration in one transaction; receipt rows stay in place.
-- Use the reviewed Contabo database operator path during a rollback.
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';
SET LOCAL search_path=pg_catalog;

DO $preflight$
BEGIN
  IF current_user<>'postgres' OR session_user<>'postgres' OR inet_server_addr() IS NOT NULL THEN
    RAISE EXCEPTION 'source_fence_local_postgres_operator_required';
  END IF;
  IF to_regnamespace('stockinsider_source_fence') IS NULL
    OR NOT EXISTS (
      SELECT FROM pg_roles r WHERE r.rolname='research_source_fence_owner_v2'
        AND NOT r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolbypassrls
        AND NOT r.rolcreaterole AND NOT r.rolcreatedb AND NOT r.rolreplication
        AND NOT EXISTS(SELECT FROM pg_auth_members m WHERE m.member=r.oid)
    )
    OR has_schema_privilege('research_source_fence_owner_v2','public','USAGE')
    OR has_schema_privilege('research_input_preparation_owner_v2','public','USAGE')
  THEN
    RAISE EXCEPTION 'source_fence_namespace_profile_mismatch';
  END IF;
  IF EXISTS (
    SELECT FROM (VALUES
      ('public.research_source_fence_record_v2()', '34dac73f063b0bb64223fdfa503248b315221e860ced16b53890c7d658ee7a15'),
      ('public.seal_research_sources_v2(jsonb,timestamptz)', 'f11accbb81b9991d098b8428909e473d7c9632d8bec1fd3fb0716dc8e08ddb35'),
      ('public.assert_research_source_seal_v2(uuid)', 'fae5d839c7cadcd360c8e1c16ca7a726e2a4ec79ec35bf6fbd792daeace763d7'),
      ('public.research_publication_source_state_v2(uuid)', '4a2510b7f6b7aa1060138f8ef626c6e400d241478b64b1f907829e835becfaa7')
    ) expected(signature, body_sha256)
    WHERE NOT EXISTS (
      SELECT FROM pg_proc p
      WHERE p.oid=to_regprocedure(expected.signature)
        AND p.proowner='research_source_fence_owner_v2'::regrole AND p.prosecdef
        AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')=expected.body_sha256
    )
  ) THEN
    RAISE EXCEPTION 'source_fence_function_profile_mismatch';
  END IF;
  IF EXISTS (
    SELECT FROM pg_class c
    WHERE c.oid=ANY(ARRAY['stockinsider_source_fence.research_source_fence_events_v2', 'stockinsider_source_fence.research_source_seals_v2', 'stockinsider_source_fence.research_source_seal_invalidations_v2']::regclass[])
      AND (c.relkind<>'r' OR c.relowner<>'research_source_fence_owner_v2'::regrole OR NOT c.relrowsecurity)
  ) OR EXISTS (
    SELECT FROM pg_class c CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a
    WHERE c.oid=ANY(ARRAY['stockinsider_source_fence.research_source_fence_events_v2', 'stockinsider_source_fence.research_source_seals_v2', 'stockinsider_source_fence.research_source_seal_invalidations_v2']::regclass[]) AND a.grantee<>c.relowner
      AND NOT (c.relname='research_source_seals_v2' AND a.grantee='research_input_preparation_owner_v2'::regrole
        AND a.privilege_type='SELECT' AND NOT a.is_grantable)
  ) OR NOT has_table_privilege('research_input_preparation_owner_v2','stockinsider_source_fence.research_source_seals_v2','SELECT')
  THEN
    RAISE EXCEPTION 'source_fence_receipt_acl_mismatch';
  END IF;
END
$preflight$;

-- Match the order used by source writers. SHARE excludes source mutations,
-- while readers can finish. An in-flight seal gets priority over the DDL.
LOCK TABLE public.source_raw_documents IN SHARE MODE;
DO $lock$
BEGIN
  IF NOT pg_try_advisory_xact_lock(610091002::bigint) THEN
    RAISE EXCEPTION 'source_fence_active_receipt_operation' USING ERRCODE='55P03';
  END IF;
END
$lock$;
LOCK TABLE stockinsider_source_fence.research_source_fence_events_v2,
  stockinsider_source_fence.research_source_seals_v2,
  stockinsider_source_fence.research_source_seal_invalidations_v2 IN ACCESS EXCLUSIVE MODE;

DO $catalog$
DECLARE
  receipts regclass[]:=ARRAY['stockinsider_source_fence.research_source_fence_events_v2', 'stockinsider_source_fence.research_source_seals_v2', 'stockinsider_source_fence.research_source_seal_invalidations_v2']::regclass[];
  entrypoints regprocedure[]:=ARRAY['public.research_source_fence_record_v2()', 'public.seal_research_sources_v2(jsonb,timestamptz)', 'public.assert_research_source_seal_v2(uuid)', 'public.research_publication_source_state_v2(uuid)']::regprocedure[];
  profile jsonb;
BEGIN
  SELECT jsonb_build_object(
    'tables',(SELECT jsonb_agg(jsonb_build_array(c.oid,c.relname,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity) ORDER BY c.oid)
       FROM pg_class c WHERE c.oid=ANY(receipts)),
    'constraints',(SELECT jsonb_agg(to_jsonb(k)-'connamespace' ORDER BY k.oid)
       FROM pg_constraint k WHERE k.conrelid=ANY(receipts) OR k.confrelid=ANY(receipts)),
    'triggers',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid)
       FROM pg_trigger t WHERE t.tgrelid=ANY(receipts) OR t.tgconstrrelid=ANY(receipts)),
    'functions',(SELECT jsonb_agg(to_jsonb(p)-'prosrc' ORDER BY p.oid) FROM pg_proc p WHERE p.oid=ANY(entrypoints)),
    'public_schema',(SELECT to_jsonb(n) FROM pg_namespace n WHERE n.nspname='public')
  ) INTO profile;
  PERFORM set_config('stockinsider.source_fence_predecessor_profile',profile::text,true);
END
$catalog$;

DROP VIEW public.research_source_fence_events_v2,
  public.research_source_seals_v2,
  public.research_source_seal_invalidations_v2 RESTRICT;
ALTER TABLE stockinsider_source_fence.research_source_fence_events_v2 SET SCHEMA public;
ALTER TABLE stockinsider_source_fence.research_source_seals_v2 SET SCHEMA public;
ALTER TABLE stockinsider_source_fence.research_source_seal_invalidations_v2 SET SCHEMA public;

CREATE OR REPLACE FUNCTION public.research_source_fence_record_v2() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $body$
DECLARE old_doc jsonb; new_doc jsonb; eid bigint; roots text[];
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'source_fence_read_committed_required'; END IF;
 PERFORM pg_advisory_xact_lock(610091002::bigint);
 IF TG_OP<>'INSERT' THEN old_doc:=to_jsonb(OLD); END IF;
 IF TG_OP<>'DELETE' THEN new_doc:=to_jsonb(NEW); END IF;
 IF old_doc IS NOT DISTINCT FROM new_doc THEN RETURN NEW; END IF;
 roots:=ARRAY[public.research_source_root_v2(old_doc),public.research_source_root_v2(new_doc)];
 INSERT INTO public.research_source_fence_events_v2(document_id,operation,before_hash,after_hash)
 VALUES(COALESCE(NEW.id,OLD.id),TG_OP,
  CASE WHEN old_doc IS NOT NULL THEN encode(sha256(convert_to(old_doc::text,'UTF8')),'hex') END,
  CASE WHEN new_doc IS NOT NULL THEN encode(sha256(convert_to(new_doc::text,'UTF8')),'hex') END) RETURNING event_id INTO eid;
 INSERT INTO public.research_source_seal_invalidations_v2(seal_id,event_id)
 SELECT s.seal_id,eid FROM public.research_source_seals_v2 s
 WHERE EXISTS(SELECT FROM jsonb_array_elements(s.documents) d WHERE d->>'root'=ANY(roots));
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $body$;

CREATE OR REPLACE FUNCTION public.seal_research_sources_v2(p_documents jsonb,p_cutoff timestamptz)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $body$
DECLARE item jsonb; doc jsonb; root text; docs jsonb:='[]'; row_hash text; req text; result public.research_source_seals_v2;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'source_fence_read_committed_required'; END IF;
 PERFORM pg_advisory_xact_lock(610091002::bigint);
 IF p_cutoff IS NULL OR NOT isfinite(p_cutoff) OR p_cutoff>clock_timestamp()
  OR p_documents IS NULL OR jsonb_typeof(p_documents)<>'array' THEN RAISE EXCEPTION 'source_seal_shape'; END IF;
 IF jsonb_array_length(p_documents) NOT BETWEEN 1 AND 64 THEN RAISE EXCEPTION 'source_seal_shape'; END IF;
 IF (SELECT count(DISTINCT x->>'id') FROM jsonb_array_elements(p_documents) x)<>jsonb_array_length(p_documents) THEN RAISE EXCEPTION 'source_seal_duplicate'; END IF;
 FOR item IN SELECT x FROM jsonb_array_elements(p_documents) x ORDER BY x->>'id' LOOP
  IF jsonb_typeof(item)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(item))<>2
   OR jsonb_typeof(item->'id')<>'string' OR jsonb_typeof(item->'rowHash')<>'string'
   OR NOT(item ? 'id' AND item ? 'rowHash') OR COALESCE(item->>'rowHash','')!~'^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'source_seal_shape'; END IF;
  SELECT to_jsonb(s) INTO doc FROM public.source_raw_documents s WHERE s.id=(item->>'id')::uuid;
  IF doc IS NULL THEN RAISE EXCEPTION 'source_seal_missing'; END IF;
  -- Reposts cannot launder an older ancestor's revoked rights. Until the full
  -- immutable ancestor closure is implemented, admit originals only; never
  -- infer ancestor permission from the child's public-citation flag.
  IF NULLIF(doc->'metadata'->>'parent_source_url','') IS NOT NULL
   AND doc->'metadata'->>'parent_source_url' IS DISTINCT FROM COALESCE(NULLIF(doc->'metadata'->>'canonical_url',''),split_part(doc->>'document_url','#si-revision-',1)) THEN RAISE EXCEPTION 'source_seal_unsupported_parent_lineage'; END IF;
  IF octet_length(doc::text)>4194304 THEN RAISE EXCEPTION 'source_seal_document_bound'; END IF;
  row_hash:=encode(sha256(convert_to(doc::text,'UTF8')),'hex'); root:=public.research_source_root_v2(doc);
  IF row_hash<>item->>'rowHash' THEN RAISE EXCEPTION 'source_seal_hash_changed'; END IF;
  IF root IS NULL OR root='' OR octet_length(root)>4096 OR (doc->>'collected_at')::timestamptz IS NULL
   OR NOT isfinite((doc->>'collected_at')::timestamptz) OR (doc->>'collected_at')::timestamptz>p_cutoff
   OR (doc->>'published_at')::timestamptz>p_cutoff THEN RAISE EXCEPTION 'source_seal_clock'; END IF;
  IF COALESCE(doc->'metadata'->>'rights_boundary','') NOT IN ('public_citation','bounded_summary_only')
   OR NULLIF(doc->'metadata'->>'retracted_at','') IS NOT NULL OR doc->'metadata'->>'claim_status'='denied' THEN RAISE EXCEPTION 'source_seal_rights_or_withdrawn'; END IF;
  IF EXISTS(SELECT FROM public.source_raw_documents s WHERE public.research_source_root_v2(to_jsonb(s))=root
   AND s.id<>(doc->>'id')::uuid AND (s.collected_at>=(doc->>'collected_at')::timestamptz
    OR NULLIF(s.metadata->>'retracted_at','') IS NOT NULL OR s.metadata->>'claim_status'='denied')) THEN RAISE EXCEPTION 'source_seal_root_changed'; END IF;
  docs:=docs||jsonb_build_array(jsonb_build_object('id',doc->>'id','rowHash',row_hash,'root',root,
   'publishedAt',doc->'published_at','observedAt',doc->'collected_at','rights',doc->'metadata'->>'rights_boundary'));
 END LOOP;
 req:=encode(sha256(convert_to(jsonb_build_object('documents',docs,'cutoff',p_cutoff)::text,'UTF8')),'hex');
 SELECT * INTO result FROM public.research_source_seals_v2 WHERE request_hash=req;
 IF FOUND THEN
  IF EXISTS(SELECT FROM public.research_source_seal_invalidations_v2 WHERE seal_id=result.seal_id) THEN RAISE EXCEPTION 'source_seal_invalidated'; END IF;
 ELSE
  INSERT INTO public.research_source_seals_v2(request_hash,cutoff,documents) VALUES(req,p_cutoff,docs) RETURNING * INTO result;
 END IF;
 RETURN to_jsonb(result)||jsonb_build_object('publicationAuthorized',false,'historicalPITEligible',false);
END $body$;

CREATE OR REPLACE FUNCTION public.assert_research_source_seal_v2(p_seal uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $body$
DECLARE result public.research_source_seals_v2; item jsonb; actual_hash text;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'source_fence_read_committed_required'; END IF;
 PERFORM pg_advisory_xact_lock(610091002::bigint);
 SELECT * INTO result FROM public.research_source_seals_v2 WHERE seal_id=p_seal;
 IF NOT FOUND OR EXISTS(SELECT FROM public.research_source_seal_invalidations_v2 WHERE seal_id=p_seal) THEN RAISE EXCEPTION 'source_seal_invalidated_or_missing'; END IF;
 FOR item IN SELECT x FROM jsonb_array_elements(result.documents) x LOOP
  SELECT encode(sha256(convert_to(to_jsonb(s)::text,'UTF8')),'hex') INTO actual_hash FROM public.source_raw_documents s WHERE s.id=(item->>'id')::uuid;
  IF actual_hash IS DISTINCT FROM item->>'rowHash' THEN RAISE EXCEPTION 'source_seal_hash_changed'; END IF;
 END LOOP;
 RETURN to_jsonb(result);
END $body$;

CREATE OR REPLACE FUNCTION public.research_publication_source_state_v2(p_seal uuid) RETURNS text
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $body$
 SELECT CASE WHEN EXISTS(SELECT FROM public.research_source_seal_invalidations_v2 WHERE seal_id=p_seal)
 THEN 'withdrawn' ELSE 'published' END
$body$;

DROP FUNCTION stockinsider_source_fence.root_key(jsonb),
  stockinsider_source_fence.document_row(uuid),
  stockinsider_source_fence.root_changed(text,uuid,timestamptz) RESTRICT;
DROP SCHEMA stockinsider_source_fence RESTRICT;

DO $catalog$
DECLARE
  receipts regclass[]:=ARRAY['public.research_source_fence_events_v2', 'public.research_source_seals_v2', 'public.research_source_seal_invalidations_v2']::regclass[];
  entrypoints regprocedure[]:=ARRAY['public.research_source_fence_record_v2()', 'public.seal_research_sources_v2(jsonb,timestamptz)', 'public.assert_research_source_seal_v2(uuid)', 'public.research_publication_source_state_v2(uuid)']::regprocedure[];
  profile jsonb;
BEGIN
  SELECT jsonb_build_object(
    'tables',(SELECT jsonb_agg(jsonb_build_array(c.oid,c.relname,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity) ORDER BY c.oid)
       FROM pg_class c WHERE c.oid=ANY(receipts)),
    'constraints',(SELECT jsonb_agg(to_jsonb(k)-'connamespace' ORDER BY k.oid)
       FROM pg_constraint k WHERE k.conrelid=ANY(receipts) OR k.confrelid=ANY(receipts)),
    'triggers',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid)
       FROM pg_trigger t WHERE t.tgrelid=ANY(receipts) OR t.tgconstrrelid=ANY(receipts)),
    'functions',(SELECT jsonb_agg(to_jsonb(p)-'prosrc' ORDER BY p.oid) FROM pg_proc p WHERE p.oid=ANY(entrypoints)),
    'public_schema',(SELECT to_jsonb(n) FROM pg_namespace n WHERE n.nspname='public')
  ) INTO profile;
  IF profile IS DISTINCT FROM current_setting('stockinsider.source_fence_predecessor_profile')::jsonb
    OR has_schema_privilege('research_source_fence_owner_v2','public','USAGE')
    OR has_schema_privilege('research_input_preparation_owner_v2','public','USAGE')
    OR EXISTS(SELECT FROM pg_namespace n WHERE n.nspname='stockinsider_source_fence')
  THEN
    RAISE EXCEPTION 'source_fence_metadata_changed';
  END IF;
  IF EXISTS (
    SELECT FROM (VALUES
      ('public.research_source_fence_record_v2()', '28cf9e99f6898f299d918e952120cd1f81d82642318237a4dba0e586d023ff65'),
      ('public.seal_research_sources_v2(jsonb,timestamptz)', '90f26718aeb382066efe1551c97ead057706de84c0af36c50e2946394f65b646'),
      ('public.assert_research_source_seal_v2(uuid)', 'e4cf543bc708d8b85920223e591527c5332ff62b96f3d2346205fb7c701e95af'),
      ('public.research_publication_source_state_v2(uuid)', 'ef512b72d6d910ab2bf662fafd88eeff92b3cda0bb149e95fc4c85cb03092157')
    ) expected(signature, body_sha256)
    WHERE NOT EXISTS (
      SELECT FROM pg_proc p
      WHERE p.oid=to_regprocedure(expected.signature)
        AND p.proowner='research_source_fence_owner_v2'::regrole AND p.prosecdef
        AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')=expected.body_sha256
    )
  ) THEN
    RAISE EXCEPTION 'source_fence_function_profile_mismatch';
  END IF;
END
$catalog$;

COMMIT;
