-- Deliberately incomplete experiment for the isolated native regression.
-- Built-in foreign-key checks still need namespace usage on the parent tables.
-- Do not install this fixture as a migration.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';
SELECT pg_advisory_xact_lock(610091002::bigint);

DO $preflight$
BEGIN
 IF current_database()<>'stockinsider_source_fence_probe' OR inet_server_addr() IS NOT NULL
  OR current_setting('stockinsider.source_fence_probe',true) IS DISTINCT FROM 'enabled'
 THEN RAISE EXCEPTION 'source_fence_probe_database_required'; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='research_source_fence_owner_v2'
  AND NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication)
  OR has_schema_privilege('research_source_fence_owner_v2','public','USAGE')
  OR EXISTS(SELECT FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname='research_source_fence_owner_v2')
 THEN RAISE EXCEPTION 'source_fence_private_review_predecessor_role'; END IF;
END $preflight$;

CREATE SCHEMA stockinsider_source_fence;
REVOKE ALL ON SCHEMA stockinsider_source_fence FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE ON SCHEMA stockinsider_source_fence TO research_source_fence_owner_v2;

-- Invoker views retain the original table ACL, RLS, defaults and triggers.
-- PostgreSQL binds their underlying relations when creating the view.
CREATE VIEW stockinsider_source_fence.events WITH (security_invoker=true) AS
 SELECT event_id,document_id,operation,before_hash,after_hash
 FROM public.research_source_fence_events_v2;
CREATE VIEW stockinsider_source_fence.seals WITH (security_invoker=true) AS
 SELECT seal_id,request_hash,cutoff,documents,received_at
 FROM public.research_source_seals_v2;
CREATE VIEW stockinsider_source_fence.invalidations WITH (security_invoker=true) AS
 SELECT seal_id,event_id FROM public.research_source_seal_invalidations_v2;

REVOKE ALL ON stockinsider_source_fence.events,stockinsider_source_fence.seals,
 stockinsider_source_fence.invalidations FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT,SELECT(event_id) ON stockinsider_source_fence.events TO research_source_fence_owner_v2;
GRANT SELECT,INSERT ON stockinsider_source_fence.seals,stockinsider_source_fence.invalidations TO research_source_fence_owner_v2;

-- SQL-standard bodies pre-bind object identities. Conversion to JSON of
-- the actual composite preserves whole-row hashing, including later columns.
CREATE FUNCTION stockinsider_source_fence.root_key(doc jsonb)
RETURNS text LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog
BEGIN ATOMIC
 RETURN public.research_source_root_v2(doc);
END;

CREATE FUNCTION stockinsider_source_fence.document_row(target_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog
BEGIN ATOMIC
 SELECT to_jsonb(s) FROM public.source_raw_documents s WHERE s.id=target_id;
END;

CREATE FUNCTION stockinsider_source_fence.root_changed(target_root text,target_id uuid,target_collected timestamptz)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog
BEGIN ATOMIC
 SELECT EXISTS(SELECT FROM public.source_raw_documents s WHERE public.research_source_root_v2(to_jsonb(s))=target_root
  AND s.id<>target_id AND (s.collected_at>=target_collected
   OR NULLIF(s.metadata->>'retracted_at','') IS NOT NULL OR s.metadata->>'claim_status'='denied'));
END;

REVOKE ALL ON FUNCTION stockinsider_source_fence.root_key(jsonb),stockinsider_source_fence.document_row(uuid),
 stockinsider_source_fence.root_changed(text,uuid,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION stockinsider_source_fence.root_key(jsonb),stockinsider_source_fence.document_row(uuid),
 stockinsider_source_fence.root_changed(text,uuid,timestamptz) TO research_source_fence_owner_v2;

DO $rewire$
DECLARE spec record; target oid; body text; revised text; definition text; metadata jsonb;
BEGIN
 FOR spec IN SELECT * FROM(VALUES
  ('public.research_source_fence_record_v2()','28cf9e99f6898f299d918e952120cd1f81d82642318237a4dba0e586d023ff65'),
  ('public.seal_research_sources_v2(jsonb,timestamptz)','90f26718aeb382066efe1551c97ead057706de84c0af36c50e2946394f65b646'),
  ('public.assert_research_source_seal_v2(uuid)','e4cf543bc708d8b85920223e591527c5332ff62b96f3d2346205fb7c701e95af'),
  ('public.research_publication_source_state_v2(uuid)','ef512b72d6d910ab2bf662fafd88eeff92b3cda0bb149e95fc4c85cb03092157')
 ) AS pinned(signature,body_hash) LOOP
  target:=to_regprocedure(spec.signature);
  SELECT p.prosrc,pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc'
  INTO body,definition,metadata
  FROM pg_proc p WHERE p.oid=target AND p.prosecdef
   AND p.proowner='research_source_fence_owner_v2'::regrole;
  IF encode(sha256(convert_to(body,'UTF8')),'hex') IS DISTINCT FROM spec.body_hash THEN
   RAISE EXCEPTION 'source_fence_private_review_predecessor_body:%',spec.signature;
  END IF;

  revised:=replace(body,
   'SELECT to_jsonb(s) INTO doc FROM public.source_raw_documents s WHERE s.id=(item->>''id'')::uuid;',
   'doc:=stockinsider_source_fence.document_row((item->>''id'')::uuid);');
  revised:=replace(revised,$old$IF EXISTS(SELECT FROM public.source_raw_documents s WHERE public.research_source_root_v2(to_jsonb(s))=root
   AND s.id<>(doc->>'id')::uuid AND (s.collected_at>=(doc->>'collected_at')::timestamptz
    OR NULLIF(s.metadata->>'retracted_at','') IS NOT NULL OR s.metadata->>'claim_status'='denied'))$old$,
   $new$IF stockinsider_source_fence.root_changed(root,(doc->>'id')::uuid,(doc->>'collected_at')::timestamptz)$new$);
  revised:=replace(revised,
   $old$SELECT encode(sha256(convert_to(to_jsonb(s)::text,'UTF8')),'hex') INTO actual_hash FROM public.source_raw_documents s WHERE s.id=(item->>'id')::uuid;$old$,
   $new$actual_hash:=encode(sha256(convert_to(stockinsider_source_fence.document_row((item->>'id')::uuid)::text,'UTF8')),'hex');$new$);
  revised:=replace(revised,'public.research_source_root_v2','stockinsider_source_fence.root_key');
  revised:=replace(revised,'public.research_source_fence_events_v2','stockinsider_source_fence.events');
  revised:=replace(revised,'public.research_source_seal_invalidations_v2','stockinsider_source_fence.invalidations');
  revised:=replace(revised,'public.research_source_seals_v2','stockinsider_source_fence.seals');

  IF revised=body OR revised LIKE '%public.%' OR strpos(definition,body)=0 THEN
   RAISE EXCEPTION 'source_fence_private_review_rewrite:%',spec.signature;
  END IF;
  EXECUTE replace(definition,body,revised);
  IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE p.oid=target) IS DISTINCT FROM metadata THEN
   RAISE EXCEPTION 'source_fence_private_review_metadata:%',spec.signature;
  END IF;
 END LOOP;
END $rewire$;
COMMIT;
