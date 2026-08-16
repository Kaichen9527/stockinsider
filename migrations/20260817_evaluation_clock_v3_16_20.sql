BEGIN;

GRANT USAGE, CREATE ON SCHEMA public TO legacy_correctness_rpc_owner;

DO $upgrade_evaluation_clock$
BEGIN
  IF to_regprocedure(
    'public.claim_legacy_producer_job_evaluation_clock_base_v3_16_20(uuid,uuid,uuid,integer)'
  ) IS NULL THEN
    ALTER FUNCTION public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)
      RENAME TO claim_legacy_producer_job_evaluation_clock_base_v3_16_20;
  END IF;
END $upgrade_evaluation_clock$;

CREATE OR REPLACE FUNCTION public.claim_legacy_producer_job_v3_11(
  p_run uuid,p_job uuid,p_token uuid,p_lease integer
) RETURNS public.legacy_producer_claim_v3_11
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $claim$
DECLARE
  v_claim public.legacy_producer_claim_v3_11;
  v_started_at timestamptz;
BEGIN
  v_claim:=public.claim_legacy_producer_job_evaluation_clock_base_v3_16_20(
    p_run,p_job,p_token,p_lease);
  IF v_claim.run_id IS NULL OR v_claim.read_kind IS NULL OR v_claim.read_kind NOT IN (
    'analysis_revision_input','compact_projection_input'
  ) THEN
    RETURN v_claim;
  END IF;
  SELECT run.started_at INTO STRICT v_started_at
  FROM public.legacy_producer_runs_v3_11 run
  WHERE run.run_id=v_claim.run_id;
  v_claim.read_json:=v_claim.read_json||jsonb_build_object(
    'evaluationTimestamp',
    to_char(v_started_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );
  v_claim.read_canonical:=convert_to(v_claim.read_json::text,'utf8');
  v_claim.read_hash:=encode(extensions.digest(v_claim.read_canonical,'sha256'),'hex');
  IF octet_length(v_claim.read_canonical)>3145728 THEN
    RAISE EXCEPTION 'bound_violation';
  END IF;
  RETURN v_claim;
END $claim$;

ALTER FUNCTION public.claim_legacy_producer_job_evaluation_clock_base_v3_16_20(
  uuid,uuid,uuid,integer) OWNER TO legacy_correctness_rpc_owner;
ALTER FUNCTION public.claim_legacy_producer_job_v3_11(
  uuid,uuid,uuid,integer) OWNER TO legacy_correctness_rpc_owner;

REVOKE ALL ON FUNCTION public.claim_legacy_producer_job_evaluation_clock_base_v3_16_20(
  uuid,uuid,uuid,integer) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.claim_legacy_producer_job_v3_11(
  uuid,uuid,uuid,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.claim_legacy_producer_job_v3_11(
  uuid,uuid,uuid,integer) TO service_role;

REVOKE CREATE ON SCHEMA public FROM legacy_correctness_rpc_owner,opportunity_v3_rpc_owner;

COMMIT;
