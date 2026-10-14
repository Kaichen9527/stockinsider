BEGIN;
-- Additive exact predecessor/successor update; preserves owner, OID and ACL.
DO $precondition$
DECLARE target record; routine oid; body_hash text; attributes jsonb; expected_attributes jsonb;
BEGIN
  FOR target IN SELECT * FROM (VALUES
    ('public.fence_candidate_thesis_append_v1()','108ffb2c9a6c3497e25b485c98640865f9b8ccc53b0efc4a474b42a3c4fbee8b','e93aab1e75c3ba28eabed3b0c198182e12936b3e4bbb39259ff278bc2ebb7784','search_path=public,pg_temp')
  ) AS expected(signature,predecessor_hash,successor_hash,configuration) LOOP
    routine:=to_regprocedure(target.signature);
    IF routine IS NULL THEN RAISE EXCEPTION 'research_precision_predecessor_missing: %',target.signature; END IF;
    SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') INTO body_hash FROM pg_proc WHERE oid=routine;
    SELECT jsonb_build_object('language',l.lanname,'securityDefiner',p.prosecdef,
      'volatility',p.provolatile::text,'strict',p.proisstrict,'leakproof',p.proleakproof,
      'parallel',p.proparallel::text,'cost',p.procost,'rows',p.prorows,'kind',p.prokind::text,
      'returnsSet',p.proretset,'defaults',p.pronargdefaults,'variadic',p.provariadic::text,
      'support',p.prosupport::oid::text,'transforms',p.protrftypes::text,'binary',p.probin,
      'configuration',(SELECT jsonb_agg(regexp_replace(setting,'[[:space:]]','','g') ORDER BY setting)
        FROM unnest(p.proconfig) setting)) INTO attributes
      FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=routine;
    expected_attributes:=jsonb_build_object('language','plpgsql','securityDefiner',true,
      'volatility','v','strict',false,'leakproof',false,'parallel','u','cost',100,
      'rows',0,'kind','f','returnsSet',false,
      'defaults',0,'variadic','0','support','0','transforms',NULL,'binary',NULL,
      'configuration',jsonb_build_array(target.configuration));
    IF body_hash NOT IN (target.predecessor_hash,target.successor_hash)
      OR attributes IS DISTINCT FROM expected_attributes
      THEN RAISE EXCEPTION 'research_precision_predecessor_changed: %',target.signature; END IF;
  END LOOP;
END $precondition$;

CREATE OR REPLACE FUNCTION public.fence_candidate_thesis_append_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $function$
DECLARE v_head public.candidate_thesis_qualifications_v1;
BEGIN
  IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed'
    THEN RAISE EXCEPTION 'research_thesis_read_committed_required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.stock_id::text, 6101));
  SELECT * INTO v_head FROM public.candidate_thesis_qualifications_v1
    WHERE stock_id=NEW.stock_id ORDER BY created_at DESC,id DESC LIMIT 1;
  IF NEW.parent_id IS DISTINCT FROM v_head.id THEN
    RAISE EXCEPTION 'research_thesis_head_changed';
  END IF;
  IF NEW.payload->>'reviewReceiptHash' IS DISTINCT FROM NEW.review_receipt_hash
    OR NEW.payload->>'status' IS DISTINCT FROM NEW.status
    OR NEW.payload->>'articleHash' IS DISTINCT FROM NEW.article_hash
    OR (NEW.payload->>'qualifiedAt')::timestamptz IS DISTINCT FROM NEW.qualified_at
    OR (NEW.payload->>'nextReviewAt')::timestamptz IS DISTINCT FROM NEW.next_review_at
    OR jsonb_typeof(NEW.payload->'materialEventIds') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'research_thesis_payload_mismatch';
  END IF;
  IF v_head.id IS NOT NULL THEN
    IF NOT ((NEW.payload->'materialEventIds') @> (v_head.payload->'materialEventIds')) THEN
      RAISE EXCEPTION 'research_thesis_events_not_reconciled';
    END IF;
    IF NEW.status IN ('qualified','rejected','needs_evidence') THEN
      IF NEW.qualified_at <= (CASE WHEN v_head.status IN ('stale','invalidated')
        THEN v_head.next_review_at ELSE v_head.qualified_at END) THEN
        RAISE EXCEPTION 'research_thesis_review_not_newer';
      END IF;
      IF v_head.status IN ('stale','invalidated') AND NEW.article_hash=v_head.article_hash THEN
        RAISE EXCEPTION 'research_thesis_revised_article_required';
      END IF;
    ELSE
      IF NEW.qualified_at<>v_head.qualified_at OR NEW.article_hash<>v_head.article_hash
        OR NEW.next_review_at < (CASE WHEN v_head.status IN ('stale','invalidated')
          THEN v_head.next_review_at ELSE v_head.qualified_at END) THEN
        RAISE EXCEPTION 'research_thesis_event_clock_invalid';
      END IF;
    END IF;
  END IF;
  NEW.created_at := GREATEST(clock_timestamp(), coalesce(v_head.created_at + interval '1 microsecond',clock_timestamp()));
  RETURN NEW;
END $function$;
COMMIT;
