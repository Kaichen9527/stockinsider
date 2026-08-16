BEGIN;

-- V3.16.12 keeps the complete 60-candidate discovery ledger visible while
-- bounding expensive, fully evidenced deep-research facts to the first ten
-- deterministic deep candidates. The prior implementation materialized up to
-- thirty candidates, including 130 session-by-session corporate-action proof
-- rows per candidate, and exceeded both its 6 MiB helper bound and the claim
-- envelope's 3 MiB bound in production.
DO $rename_prior$
BEGIN
  IF to_regprocedure('public.read_legacy_candidate_fact_plane_v3_16_11_internal(timestamptz,jsonb)') IS NULL THEN
    ALTER FUNCTION public.read_legacy_candidate_fact_plane_v3_11(timestamptz,jsonb)
      RENAME TO read_legacy_candidate_fact_plane_v3_16_11_internal;
  END IF;
END
$rename_prior$;

CREATE OR REPLACE FUNCTION public.read_legacy_candidate_fact_plane_v3_11(
  p_source_cutoff timestamptz,p_candidate_result jsonb
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_bounded_candidates jsonb;v_bounded_result jsonb;v_result jsonb;v_bytes integer;
BEGIN
  IF jsonb_typeof(p_candidate_result)<>'object'
    OR jsonb_typeof(coalesce(p_candidate_result->'candidates','[]'::jsonb))<>'array'
    OR jsonb_array_length(coalesce(p_candidate_result->'candidates','[]'::jsonb))>60
  THEN RAISE EXCEPTION 'bound_violation';END IF;

  SELECT coalesce(jsonb_agg(candidate.value ORDER BY candidate.ordinality),'[]'::jsonb)
  INTO v_bounded_candidates
  FROM jsonb_array_elements(coalesce(p_candidate_result->'candidates','[]'::jsonb))
    WITH ORDINALITY candidate(value,ordinality)
  WHERE coalesce((candidate.value->>'deepSelected')::boolean,false)
  AND candidate.ordinality<=10;

  v_bounded_result:=jsonb_set(p_candidate_result,'{candidates}',v_bounded_candidates,true);
  v_result:=public.read_legacy_candidate_fact_plane_v3_16_11_internal(
    p_source_cutoff,v_bounded_result
  );
  -- Preserve every visible source/shallow candidate. Only authority-heavy fact
  -- arrays are bounded; omitted deep candidates remain explicitly unavailable.
  v_result:=jsonb_set(v_result,'{candidateResult}',p_candidate_result,true);
  v_bytes:=octet_length(convert_to(v_result::text,'utf8'));
  IF jsonb_array_length(v_bounded_candidates)>10 OR v_bytes>3145728
  THEN RAISE EXCEPTION 'bound_violation';END IF;
  RETURN v_result;
END
$function$;

ALTER FUNCTION public.read_legacy_candidate_fact_plane_v3_16_11_internal(timestamptz,jsonb)
  OWNER TO opportunity_v3_rpc_owner;
ALTER FUNCTION public.read_legacy_candidate_fact_plane_v3_11(timestamptz,jsonb)
  OWNER TO opportunity_v3_rpc_owner;
REVOKE ALL ON FUNCTION public.read_legacy_candidate_fact_plane_v3_16_11_internal(timestamptz,jsonb)
  FROM PUBLIC,anon,authenticated,service_role,legacy_correctness_rpc_owner;
REVOKE ALL ON FUNCTION public.read_legacy_candidate_fact_plane_v3_11(timestamptz,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.read_legacy_candidate_fact_plane_v3_11(timestamptz,jsonb)
  TO legacy_correctness_rpc_owner;

DO $postconditions$
DECLARE v_owner text;v_internal_legacy boolean;v_wrapper_legacy boolean;
BEGIN
  SELECT owner.rolname INTO v_owner FROM pg_proc function
  JOIN pg_roles owner ON owner.oid=function.proowner
  WHERE function.oid='public.read_legacy_candidate_fact_plane_v3_11(timestamptz,jsonb)'::regprocedure;
  v_internal_legacy:=has_function_privilege('legacy_correctness_rpc_owner',
    'public.read_legacy_candidate_fact_plane_v3_16_11_internal(timestamptz,jsonb)','EXECUTE');
  v_wrapper_legacy:=has_function_privilege('legacy_correctness_rpc_owner',
    'public.read_legacy_candidate_fact_plane_v3_11(timestamptz,jsonb)','EXECUTE');
  IF v_owner<>'opportunity_v3_rpc_owner' OR v_internal_legacy OR NOT v_wrapper_legacy
  THEN RAISE EXCEPTION 'candidate_fact_plane_authority_unavailable';END IF;
END
$postconditions$;

COMMIT;
