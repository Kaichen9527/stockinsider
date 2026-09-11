BEGIN;

-- Make the final compact projection consume the immutable source_sync
-- terminal plane from its own producer run.  This is the only authority for a
-- total-outage projection; callers cannot request outage behavior with a
-- boolean.  The wrapper is additive and preserves the reviewed predecessor.
GRANT CREATE ON SCHEMA public TO legacy_correctness_rpc_owner;

DO $source_terminal_projection_wrapper$
BEGIN
  IF to_regprocedure(
    'public.claim_legacy_producer_job_pre_source_terminal_projection_v3_20_2(uuid,uuid,uuid,integer)'
  ) IS NULL THEN
    ALTER FUNCTION public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)
      RENAME TO claim_legacy_producer_job_pre_source_terminal_projection_v3_20_2;
  END IF;
END $source_terminal_projection_wrapper$;

CREATE OR REPLACE FUNCTION public.claim_legacy_producer_job_v3_11(
  p_run uuid,p_job uuid,p_token uuid,p_lease integer
) RETURNS public.legacy_producer_claim_v3_11
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $claim$
DECLARE
  v_claim public.legacy_producer_claim_v3_11;
  v_source_result_count integer;
  v_source_acquisition jsonb;
BEGIN
  v_claim:=public.claim_legacy_producer_job_pre_source_terminal_projection_v3_20_2(
    p_run,p_job,p_token,p_lease);
  IF v_claim.run_id IS NULL OR v_claim.read_kind IS DISTINCT FROM 'compact_projection_input' THEN
    RETURN v_claim;
  END IF;

  SELECT count(*),(jsonb_agg(result.result_json->'sourceAcquisition'
      ORDER BY job.job_id)->0)
  INTO v_source_result_count,v_source_acquisition
  FROM public.legacy_producer_jobs_v3_11 job
  JOIN public.legacy_producer_job_results_v3_11 result ON result.job_id=job.job_id
  WHERE job.run_id=v_claim.run_id AND job.stage='source_sync'
    AND job.job_kind='stage_barrier' AND job.status='succeeded';
  IF v_source_result_count<>1
    OR v_source_acquisition->>'schema' IS DISTINCT FROM 'official-source-acquisition-v3.20'
    OR jsonb_typeof(v_source_acquisition->'connectorAttempts') IS DISTINCT FROM 'array'
    OR jsonb_array_length(v_source_acquisition->'connectorAttempts')<>85
  THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='source_terminal_projection_authority_invalid';
  END IF;

  v_claim.read_json:=v_claim.read_json||jsonb_build_object(
    'sourceTerminalStateInput',jsonb_build_object(
      'schema','source-terminal-state-input-v3.20',
      'sourceAcquisitionSchema',v_source_acquisition->>'schema',
      'connectorAttempts',v_source_acquisition->'connectorAttempts'));
  v_claim.read_canonical:=convert_to(v_claim.read_json::text,'utf8');
  v_claim.read_hash:=encode(extensions.digest(v_claim.read_canonical,'sha256'),'hex');
  IF octet_length(v_claim.read_canonical)>3145728 THEN
    RAISE EXCEPTION USING ERRCODE='PT413',MESSAGE='bound_violation';
  END IF;
  RETURN v_claim;
END $claim$;

CREATE OR REPLACE FUNCTION public.verify_legacy_claim_delegation_chain_v3_20()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $claim_chain$
  SELECT
    position('claim_legacy_producer_job_pre_source_terminal_projection_v3_20_2' IN pg_get_functiondef(
      'public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)'::regprocedure))>0
    AND position('sourceTerminalStateInput' IN pg_get_functiondef(
      'public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)'::regprocedure))>0
    AND position('claim_legacy_producer_job_pre_kol_retention_bridge_v3_20_1' IN pg_get_functiondef(
      'public.claim_legacy_producer_job_pre_source_terminal_projection_v3_20_2(uuid,uuid,uuid,integer)'::regprocedure))>0
    AND position('claim_legacy_producer_job_pre_kol_authority_v3_20' IN pg_get_functiondef(
      'public.claim_legacy_producer_job_pre_kol_retention_bridge_v3_20_1(uuid,uuid,uuid,integer)'::regprocedure))>0
    AND position('claim_legacy_producer_job_pre_handoff_v3_19_16' IN pg_get_functiondef(
      'public.claim_legacy_producer_job_pre_kol_authority_v3_20(uuid,uuid,uuid,integer)'::regprocedure))>0
    AND position('claim_legacy_producer_job_full_candidate_authority_base_v3_19_11' IN pg_get_functiondef(
      'public.claim_legacy_producer_job_pre_handoff_v3_19_16(uuid,uuid,uuid,integer)'::regprocedure))>0
    AND position('providerAcquisitions' IN pg_get_functiondef(
      'public.claim_legacy_producer_job_candidate_authority_base_v3_19_10(uuid,uuid,uuid,integer)'::regprocedure))>0;
$claim_chain$;

ALTER FUNCTION public.claim_legacy_producer_job_pre_source_terminal_projection_v3_20_2(
  uuid,uuid,uuid,integer) OWNER TO legacy_correctness_rpc_owner;
ALTER FUNCTION public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)
  OWNER TO legacy_correctness_rpc_owner;
ALTER FUNCTION public.verify_legacy_claim_delegation_chain_v3_20()
  OWNER TO legacy_correctness_rpc_owner;
REVOKE ALL ON FUNCTION public.claim_legacy_producer_job_pre_source_terminal_projection_v3_20_2(
  uuid,uuid,uuid,integer) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.verify_legacy_claim_delegation_chain_v3_20()
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)
  TO service_role;

DO $source_terminal_projection_runtime_role$
BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='stockinsider_runtime_v319') THEN
    REVOKE ALL ON FUNCTION public.claim_legacy_producer_job_pre_source_terminal_projection_v3_20_2(
      uuid,uuid,uuid,integer) FROM stockinsider_runtime_v319;
    GRANT EXECUTE ON FUNCTION public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)
      TO stockinsider_runtime_v319;
  END IF;
END $source_terminal_projection_runtime_role$;

REVOKE CREATE ON SCHEMA public FROM legacy_correctness_rpc_owner;

DO $source_terminal_projection_postconditions$
BEGIN
  IF NOT public.verify_legacy_claim_delegation_chain_v3_20()
    OR has_function_privilege('service_role',
      'public.claim_legacy_producer_job_pre_source_terminal_projection_v3_20_2(uuid,uuid,uuid,integer)','EXECUTE')
    OR NOT has_function_privilege('service_role',
      'public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)','EXECUTE')
    OR has_schema_privilege('legacy_correctness_rpc_owner','public','CREATE')
  THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='source_terminal_projection_postcondition_failed';
  END IF;
END $source_terminal_projection_postconditions$;

COMMIT;
