BEGIN;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='2s';
SELECT pg_advisory_xact_lock(64221022);

-- TWSE lists this pinned archive for 2020 Q2 through 2025 Q4. Its facts
-- enter only through fact-scoped v10 evidence tied to the locked receipt.
CREATE OR REPLACE FUNCTION public.candidate_financial_taxonomy_allowed_v10(
  p_digest text,p_period_end date,p_evidence_version integer
) RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path='' AS $function$
  SELECT coalesce(p_digest='4e44e67647b1a5a575d416ef44614d9c5651bb0d895621e12f6b6ca64a457869'
    OR (p_digest='8b1910ec2dff01b91227255c82dd92385d4db6664b3a5a638ac7086ebe7dad17'
        AND p_evidence_version=10
        AND p_period_end BETWEEN date '2020-06-30' AND date '2025-12-31'
        AND (extract(month from p_period_end),extract(day from p_period_end))
            IN ((3,31),(6,30),(9,30),(12,31))),false);
$function$;
REVOKE ALL ON FUNCTION public.candidate_financial_taxonomy_allowed_v10(text,date,integer)
  FROM PUBLIC,anon,authenticated,service_role;

-- Change only the pinned taxonomy checks. Preserve each original function's
-- owner, permissions, security policy, identity and unrelated checks.
DO $taxonomy$
DECLARE spec record; target regprocedure; original text; definition text; changed text; metadata jsonb; fingerprint text;
BEGIN
  FOR spec IN SELECT * FROM (VALUES
    ('public.validate_candidate_financial_fact_scope_v10(jsonb,text,boolean)',
     '73d86f456c1e8bb40362a4f80250df64d4e3426efae4f80c5b389946b770fb9e',
     'f9651f61ba57ee6b2cab5d3245d115dba1803e37ab19da45416e07166634fd3b',
     $before$OR p_evidence->>'taxonomySha256' IS DISTINCT FROM '4e44e67647b1a5a575d416ef44614d9c5651bb0d895621e12f6b6ca64a457869'$before$,
     $after$OR COALESCE(p_evidence->>'taxonomySha256','') NOT IN ('4e44e67647b1a5a575d416ef44614d9c5651bb0d895621e12f6b6ca64a457869','8b1910ec2dff01b91227255c82dd92385d4db6664b3a5a638ac7086ebe7dad17')$after$),
    ('public.candidate_financial_parser_document_ready_v10(uuid,uuid,text)',
     '944ef0704e1256990f9b297c7668c51ecd45a5861ca45b6c1936c7e5ad9bdb08',
     '234e59145d078deefa6be861083208c3a047be2c0d0638f1c5f8753cda6841f8',
     $before$AND evidence.taxonomy_sha256='4e44e67647b1a5a575d416ef44614d9c5651bb0d895621e12f6b6ca64a457869'$before$,
     $after$AND public.candidate_financial_taxonomy_allowed_v10(evidence.taxonomy_sha256,
      (SELECT receipt.period_end FROM public.candidate_financial_document_receipts_v6 receipt
       WHERE receipt.receipt_id=evidence.receipt_id), evidence.evidence_schema_version)$after$),
    ('public.complete_candidate_financial_document_receipt_parser_v10(uuid,text,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,timestamptz)',
     '3ead0d5245f7c6864d3532bb1ee6174a1b60759bdce5298defb4ec5f5db7279f',
     '6f78d5f821d5c402e52da81b706ceb26feb8fb30a5661e50dd292ddd738d53de',
     $before$  PERFORM public.validate_candidate_financial_fact_scope_v10($before$,
     $after$  IF NOT public.candidate_financial_taxonomy_allowed_v10(p_parser_evidence->>'taxonomySha256',v_receipt.period_end,10)
  THEN RAISE EXCEPTION 'candidate_financial_taxonomy_period_mismatch'; END IF;
  PERFORM public.validate_candidate_financial_fact_scope_v10($after$),
    ('public.candidate_financial_fact_has_structural_proof_v10(uuid,timestamptz,text)',
     'bac80206042897448569a5d8a526a69156f54b3b794919f50e5df696029ec416',
     'b0d79c65799060209daf2703fb0427e74e91e5c2d8a9b6e7e273b60f7a4f1a23',
     $before$AND evidence.taxonomy_sha256='4e44e67647b1a5a575d416ef44614d9c5651bb0d895621e12f6b6ca64a457869'$before$,
     $after$AND public.candidate_financial_taxonomy_allowed_v10(evidence.taxonomy_sha256,receipt.period_end,evidence.evidence_schema_version)$after$),
    ('public.candidate_financial_fact_has_structural_proof_as_of_v10(uuid,timestamptz,text,timestamptz)',
     '67b36db42304d076c38c582070a5cb67408a9417439124ac3593d3c8959ec8f6',
     '566c84e71dda9a11ff6cf4a9c675459618ec5a180dc29d42b0db68519f4cce47',
     $before$AND evidence.taxonomy_sha256='4e44e67647b1a5a575d416ef44614d9c5651bb0d895621e12f6b6ca64a457869'$before$,
     $after$AND public.candidate_financial_taxonomy_allowed_v10(evidence.taxonomy_sha256,receipt.period_end,evidence.evidence_schema_version)$after$)
  ) AS patches(signature,predecessor,successor,old_fragment,new_fragment)
  LOOP
    target:=to_regprocedure(spec.signature);
    SELECT p.prosrc,pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc'
      INTO original,definition,metadata FROM pg_proc p WHERE p.oid=target
      AND p.prosecdef AND pg_get_userbyid(p.proowner)=current_user;
    fingerprint:=encode(sha256(convert_to(original,'UTF8')),'hex');
    IF fingerprint IS NOT DISTINCT FROM spec.successor THEN CONTINUE; END IF;
    IF fingerprint IS DISTINCT FROM spec.predecessor
      OR length(original)-length(replace(original,spec.old_fragment,''))<>length(spec.old_fragment)
    THEN RAISE EXCEPTION 'candidate_financial_taxonomy_predecessor_unverified:%',spec.signature; END IF;
    changed:=replace(original,spec.old_fragment,spec.new_fragment);
    IF encode(sha256(convert_to(changed,'UTF8')),'hex') IS DISTINCT FROM spec.successor
    THEN RAISE EXCEPTION 'candidate_financial_taxonomy_successor_unverified:%',spec.signature; END IF;
    EXECUTE replace(definition,original,changed);
    IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE p.oid=target) IS DISTINCT FROM metadata
      OR (SELECT p.prosrc FROM pg_proc p WHERE p.oid=target) IS DISTINCT FROM changed
    THEN RAISE EXCEPTION 'candidate_financial_taxonomy_metadata_changed:%',spec.signature; END IF;
  END LOOP;
END $taxonomy$;
COMMIT;
