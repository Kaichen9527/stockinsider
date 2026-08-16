BEGIN;

GRANT CREATE ON SCHEMA public TO legacy_correctness_rpc_owner,opportunity_v3_rpc_owner;

-- V3.16 refreshes the lease after the authoritative claim has materialized.
-- Preserve that wrapper as the predecessor, then restore the V3.13 immutable
-- analysis payload join at the outermost layer. A no-change evaluation must
-- reuse the exact prior facts; acquisition timestamps alone are not material
-- and may not mutate an existing material-change revision.
DO $upgrade_analysis_payload_reuse$
BEGIN
  IF to_regprocedure(
    'public.claim_legacy_producer_job_authoritative_v3_16_15(uuid,uuid,uuid,integer)'
  ) IS NULL THEN
    ALTER FUNCTION public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)
      RENAME TO claim_legacy_producer_job_authoritative_v3_16_15;
  END IF;
END $upgrade_analysis_payload_reuse$;

CREATE OR REPLACE FUNCTION public.enrich_legacy_analysis_prior_payloads_v3_16_15(
  p_read jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $enrich_prior_payloads$
DECLARE
  v_prior jsonb;
  v_expected integer;
  v_resolved integer;
BEGIN
  v_expected:=jsonb_array_length(coalesce(p_read->'priorRevisions','[]'::jsonb));
  WITH resolved AS MATERIALIZED (
    SELECT prior.ordinality,
      prior.value || jsonb_build_object('facts',payload.payload_json) AS value
    FROM jsonb_array_elements(coalesce(p_read->'priorRevisions','[]'::jsonb))
      WITH ORDINALITY prior(value,ordinality)
    JOIN public.legacy_analysis_revision_payloads_v3_13 payload
      ON payload.revision_id=(prior.value->>'revisionId')::uuid
      AND payload.symbol=prior.value->>'symbol'
      AND payload.material_change_hash=prior.value->>'materialChangeHash'
  )
  SELECT coalesce(jsonb_agg(value ORDER BY ordinality),'[]'::jsonb),count(*)::integer
    INTO v_prior,v_resolved FROM resolved;
  IF v_resolved<>v_expected THEN
    RAISE EXCEPTION 'analysis_prior_payload_missing';
  END IF;
  RETURN jsonb_set(p_read,'{priorRevisions}',v_prior,false);
END $enrich_prior_payloads$;

CREATE OR REPLACE FUNCTION public.claim_legacy_producer_job_v3_11(
  p_run uuid,p_job uuid,p_token uuid,p_lease integer
) RETURNS public.legacy_producer_claim_v3_11
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $claim_payload_reuse$
DECLARE
  v_claim public.legacy_producer_claim_v3_11;
BEGIN
  v_claim:=public.claim_legacy_producer_job_authoritative_v3_16_15(
    p_run,p_job,p_token,p_lease);
  IF v_claim.run_id IS NULL OR v_claim.read_kind IS DISTINCT FROM 'analysis_revision_input' THEN
    RETURN v_claim;
  END IF;

  v_claim.read_json:=public.enrich_legacy_analysis_prior_payloads_v3_16_15(v_claim.read_json);
  v_claim.read_canonical:=convert_to(v_claim.read_json::text,'utf8');
  IF octet_length(v_claim.read_canonical)>3145728 THEN
    RAISE EXCEPTION 'bound_violation';
  END IF;
  v_claim.read_hash:=encode(extensions.digest(v_claim.read_canonical,'sha256'),'hex');
  RETURN v_claim;
END $claim_payload_reuse$;

ALTER FUNCTION public.enrich_legacy_analysis_prior_payloads_v3_16_15(jsonb)
  OWNER TO opportunity_v3_rpc_owner;
ALTER FUNCTION public.claim_legacy_producer_job_authoritative_v3_16_15(uuid,uuid,uuid,integer)
  OWNER TO legacy_correctness_rpc_owner;
ALTER FUNCTION public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)
  OWNER TO legacy_correctness_rpc_owner;
REVOKE ALL ON FUNCTION
  public.enrich_legacy_analysis_prior_payloads_v3_16_15(jsonb),
  public.claim_legacy_producer_job_authoritative_v3_16_15(uuid,uuid,uuid,integer)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION
  public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
  public.enrich_legacy_analysis_prior_payloads_v3_16_15(jsonb)
  TO legacy_correctness_rpc_owner;
GRANT EXECUTE ON FUNCTION
  public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)
  TO service_role;
REVOKE CREATE ON SCHEMA public FROM legacy_correctness_rpc_owner;
REVOKE CREATE ON SCHEMA public FROM opportunity_v3_rpc_owner;

COMMIT;
