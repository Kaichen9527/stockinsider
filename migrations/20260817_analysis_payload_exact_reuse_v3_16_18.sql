BEGIN;

GRANT CREATE ON SCHEMA public TO legacy_correctness_rpc_owner,opportunity_v3_rpc_owner;

-- The V3.13 wrapper only retained predecessor revisions that already had an
-- immutable payload and the V3.11 predecessor excluded same-cutoff retries.
-- Resolve the reusable payload from the current decision identities instead:
-- prefer the exact material hash at or before this cutoff, then the newest
-- payload-backed predecessor. Legacy revisions without a payload are skipped;
-- they are metadata only and cannot safely be replayed as disclosure facts.
DO $upgrade_analysis_payload_exact_reuse$
BEGIN
  IF to_regprocedure(
    'public.claim_legacy_producer_job_authoritative_v3_16_18(uuid,uuid,uuid,integer)'
  ) IS NULL THEN
    ALTER FUNCTION public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)
      RENAME TO claim_legacy_producer_job_authoritative_v3_16_18;
  END IF;
END $upgrade_analysis_payload_exact_reuse$;

CREATE OR REPLACE FUNCTION public.resolve_legacy_analysis_prior_payloads_v3_16_18(
  p_read jsonb
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $resolve_prior_payloads$
DECLARE
  v_cutoff timestamptz;
  v_prior jsonb;
BEGIN
  v_cutoff:=(p_read->>'sourceCutoff')::timestamptz;
  WITH decisions AS MATERIALIZED (
    SELECT decision.value,decision.ordinality
    FROM jsonb_array_elements(coalesce(p_read#>'{factsResult,decisions}','[]'::jsonb))
      WITH ORDINALITY decision(value,ordinality)
    WHERE decision.value->>'symbol'~'^[0-9]{4}$'
      AND decision.value->>'materialChangeHash'~'^[0-9a-f]{64}$'
  ), resolved AS MATERIALIZED (
    SELECT decision.ordinality,jsonb_build_object(
      'symbol',revision.symbol,
      'revisionId',revision.revision_id,
      'materialChangeHash',revision.material_change_hash,
      'analysisGeneratedAt',to_char(
        revision.analysis_generated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'facts',payload.payload_json
    ) AS value
    FROM decisions decision
    JOIN LATERAL (
      SELECT candidate.*
      FROM public.legacy_analysis_revisions_v3_11 candidate
      JOIN public.legacy_analysis_revision_payloads_v3_13 candidate_payload
        ON candidate_payload.revision_id=candidate.revision_id
        AND candidate_payload.symbol=candidate.symbol
        AND candidate_payload.material_change_hash=candidate.material_change_hash
      WHERE candidate.symbol=decision.value->>'symbol'
        AND candidate.source_cutoff<=v_cutoff
        AND (
          candidate.material_change_hash=decision.value->>'materialChangeHash'
          OR candidate.source_cutoff<v_cutoff
        )
      ORDER BY
        (candidate.material_change_hash=decision.value->>'materialChangeHash') DESC,
        candidate.source_cutoff DESC,candidate.recorded_at DESC,candidate.revision_id
      LIMIT 1
    ) revision ON true
    JOIN public.legacy_analysis_revision_payloads_v3_13 payload
      ON payload.revision_id=revision.revision_id
  )
  SELECT coalesce(jsonb_agg(value ORDER BY ordinality),'[]'::jsonb)
    INTO v_prior FROM resolved;
  RETURN jsonb_set(p_read,'{priorRevisions}',v_prior,true);
EXCEPTION
  WHEN invalid_text_representation OR datetime_field_overflow THEN
    RAISE EXCEPTION 'analysis_prior_payload_input_invalid';
END $resolve_prior_payloads$;

CREATE OR REPLACE FUNCTION public.claim_legacy_producer_job_v3_11(
  p_run uuid,p_job uuid,p_token uuid,p_lease integer
) RETURNS public.legacy_producer_claim_v3_11
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $claim_payload_exact_reuse$
DECLARE
  v_claim public.legacy_producer_claim_v3_11;
BEGIN
  v_claim:=public.claim_legacy_producer_job_authoritative_v3_16_18(
    p_run,p_job,p_token,p_lease);
  IF v_claim.run_id IS NULL OR v_claim.read_kind IS DISTINCT FROM 'analysis_revision_input' THEN
    RETURN v_claim;
  END IF;

  v_claim.read_json:=public.resolve_legacy_analysis_prior_payloads_v3_16_18(v_claim.read_json);
  v_claim.read_canonical:=convert_to(v_claim.read_json::text,'utf8');
  IF octet_length(v_claim.read_canonical)>3145728 THEN
    RAISE EXCEPTION 'bound_violation';
  END IF;
  v_claim.read_hash:=encode(extensions.digest(v_claim.read_canonical,'sha256'),'hex');
  RETURN v_claim;
END $claim_payload_exact_reuse$;

ALTER FUNCTION public.resolve_legacy_analysis_prior_payloads_v3_16_18(jsonb)
  OWNER TO opportunity_v3_rpc_owner;
ALTER FUNCTION public.claim_legacy_producer_job_authoritative_v3_16_18(uuid,uuid,uuid,integer)
  OWNER TO legacy_correctness_rpc_owner;
ALTER FUNCTION public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)
  OWNER TO legacy_correctness_rpc_owner;
REVOKE ALL ON FUNCTION
  public.resolve_legacy_analysis_prior_payloads_v3_16_18(jsonb),
  public.claim_legacy_producer_job_authoritative_v3_16_18(uuid,uuid,uuid,integer)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION
  public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
  public.resolve_legacy_analysis_prior_payloads_v3_16_18(jsonb)
  TO legacy_correctness_rpc_owner;
GRANT EXECUTE ON FUNCTION
  public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)
  TO service_role;
REVOKE CREATE ON SCHEMA public FROM legacy_correctness_rpc_owner;
REVOKE CREATE ON SCHEMA public FROM opportunity_v3_rpc_owner;

COMMIT;
