BEGIN;

-- V3.19.11 used max(jsonb) while selecting the sole successful prior
-- candidate-funnel barrier. PostgreSQL has no max(jsonb) aggregate, so a
-- production run could acquire its lease but fail before the source-sync job
-- was claimed. Keep the cardinality check authoritative and select the single
-- immutable JSONB value through a bounded aggregate array instead.
GRANT CREATE ON SCHEMA public TO legacy_correctness_rpc_owner;

CREATE OR REPLACE FUNCTION public.read_legacy_prior_candidate_result_v3_19_12_internal(
  p_prior_run uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $prior$
DECLARE v_count integer;v_candidates jsonb;
BEGIN
  SELECT count(*),
    (jsonb_agg(result.result_json->'candidates'
      ORDER BY job.terminal_at DESC,job.job_id DESC)->0)
  INTO v_count,v_candidates
  FROM public.legacy_producer_jobs_v3_11 job
  JOIN public.legacy_producer_job_results_v3_11 result ON result.job_id=job.job_id
  WHERE job.run_id=p_prior_run AND job.stage='candidate_funnel'
    AND job.job_kind='stage_barrier' AND job.status='succeeded';
  IF v_count<>1 THEN RAISE EXCEPTION 'candidate_retention_full_result_cardinality';END IF;
  IF jsonb_typeof(v_candidates)<>'array' OR jsonb_array_length(v_candidates)>60 THEN
    RAISE EXCEPTION 'candidate_retention_prior_ledger_bound';
  END IF;
  RETURN v_candidates;
END $prior$;

CREATE OR REPLACE FUNCTION public.claim_legacy_producer_job_v3_11(
  p_run uuid,p_job uuid,p_token uuid,p_lease integer
) RETURNS public.legacy_producer_claim_v3_11
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $claim$
DECLARE
  v_claim public.legacy_producer_claim_v3_11;
  v_cutoff timestamptz;
  v_prior_run uuid;
  v_prior_ledger jsonb;
  v_source_available boolean:=false;
BEGIN
  v_claim:=public.claim_legacy_producer_job_full_candidate_authority_base_v3_19_11(
    p_run,p_job,p_token,p_lease);
  IF v_claim.run_id IS NULL OR v_claim.read_kind IS DISTINCT FROM 'candidate_funnel_input' THEN
    RETURN v_claim;
  END IF;

  SELECT run.source_cutoff INTO STRICT v_cutoff
  FROM public.legacy_producer_runs_v3_11 run WHERE run.run_id=v_claim.run_id;
  SELECT prior.run_id INTO v_prior_run
  FROM public.legacy_producer_runs_v3_11 prior
  WHERE prior.status='success' AND prior.source_cutoff<v_cutoff
  ORDER BY prior.source_cutoff DESC,prior.terminal_at DESC,prior.run_id DESC LIMIT 1;

  IF v_prior_run IS NULL THEN
    v_prior_ledger:='[]'::jsonb;
  ELSE
    v_prior_ledger:=public.read_legacy_prior_candidate_result_v3_19_12_internal(v_prior_run);
  END IF;
  v_prior_ledger:=public.enrich_legacy_retained_candidate_authority_v3_19_11_internal(
    v_prior_run,v_prior_ledger);

  SELECT EXISTS(
    SELECT 1 FROM public.legacy_producer_jobs_v3_11 source_job
    JOIN public.legacy_producer_job_results_v3_11 source_result
      ON source_result.job_id=source_job.job_id
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(
      source_result.result_json#>'{sourceAcquisition,connectorAttempts}','[]'::jsonb)) connector(value)
    WHERE source_job.run_id=v_claim.run_id AND source_job.stage='source_sync'
      AND source_job.job_kind='stage_barrier' AND source_job.status='succeeded'
      AND connector.value->>'status' IN ('items_found','successful_empty','metadata_only')
  ) INTO v_source_available;

  v_claim.read_json:=v_claim.read_json||jsonb_build_object(
    'candidateLedgerContract','candidate-ledger-v3.19.12',
    'candidateAuthorityContract','candidate-authority-v3.19.12',
    'priorLedger',v_prior_ledger,
    'sourceAvailable',v_source_available);
  v_claim.read_canonical:=convert_to(v_claim.read_json::text,'utf8');
  v_claim.read_hash:=encode(extensions.digest(v_claim.read_canonical,'sha256'),'hex');
  IF octet_length(v_claim.read_canonical)>3145728 THEN RAISE EXCEPTION 'bound_violation';END IF;
  RETURN v_claim;
END $claim$;

ALTER FUNCTION public.read_legacy_prior_candidate_result_v3_19_12_internal(uuid)
  OWNER TO legacy_correctness_rpc_owner;
ALTER FUNCTION public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)
  OWNER TO legacy_correctness_rpc_owner;

REVOKE ALL ON FUNCTION public.read_legacy_prior_candidate_result_v3_19_12_internal(uuid)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)
  TO service_role;

-- The production Session Pooler login is deliberately environment-specific.
-- When present, reconcile it to the same nine-RPC boundary after a wrapper is
-- replaced; rehearsals without that role remain portable.
DO $runtime_role_reconciliation$
BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='stockinsider_runtime_v319') THEN
    IF NOT EXISTS(
      SELECT 1 FROM pg_roles WHERE rolname='stockinsider_runtime_v319'
        AND rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolcreatedb
        AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls
        AND rolconnlimit=6
    ) THEN RAISE EXCEPTION 'runtime_role_contract_invalid';END IF;
    REVOKE EXECUTE ON FUNCTION
      public.claim_legacy_producer_job_candidate_authority_base_v3_19_10(uuid,uuid,uuid,integer)
      FROM stockinsider_runtime_v319;
    REVOKE EXECUTE ON FUNCTION
      public.claim_legacy_producer_job_full_candidate_authority_base_v3_19_11(uuid,uuid,uuid,integer)
      FROM stockinsider_runtime_v319;
    REVOKE EXECUTE ON FUNCTION
      public.enrich_legacy_retained_candidate_authority_v3_19_11_internal(uuid,jsonb)
      FROM stockinsider_runtime_v319;
    REVOKE EXECUTE ON FUNCTION
      public.read_legacy_prior_candidate_result_v3_19_12_internal(uuid)
      FROM stockinsider_runtime_v319;
    GRANT EXECUTE ON FUNCTION public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)
      TO stockinsider_runtime_v319;
  END IF;
END $runtime_role_reconciliation$;

REVOKE CREATE ON SCHEMA public FROM legacy_correctness_rpc_owner;

DO $retained_candidate_jsonb_cardinality_postconditions$
BEGIN
  IF NOT has_function_privilege('service_role',
      'public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)','EXECUTE')
    OR has_function_privilege('service_role',
      'public.read_legacy_prior_candidate_result_v3_19_12_internal(uuid)','EXECUTE')
    OR has_schema_privilege('legacy_correctness_rpc_owner','public','CREATE')
    OR NOT (SELECT pg_get_userbyid(proowner)='legacy_correctness_rpc_owner' AND prosecdef
      AND pg_get_functiondef(oid) LIKE '%jsonb_agg(result.result_json->''candidates''%'
      AND pg_get_functiondef(oid) NOT LIKE '%max(result.result_json->''candidates'')%'
      AND pg_get_functiondef(oid) LIKE '%candidate_retention_full_result_cardinality%'
      FROM pg_proc WHERE oid=
        'public.read_legacy_prior_candidate_result_v3_19_12_internal(uuid)'::regprocedure)
    OR NOT (SELECT pg_get_userbyid(proowner)='legacy_correctness_rpc_owner' AND prosecdef
      AND pg_get_functiondef(oid) LIKE '%candidate-ledger-v3.19.12%'
      AND pg_get_functiondef(oid) LIKE '%read_legacy_prior_candidate_result_v3_19_12_internal%'
      FROM pg_proc WHERE oid=
        'public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)'::regprocedure)
  THEN RAISE EXCEPTION 'retained_candidate_jsonb_cardinality_postcondition_failed';END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='stockinsider_runtime_v319') AND (
    NOT has_function_privilege('stockinsider_runtime_v319',
      'public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)','EXECUTE')
    OR has_function_privilege('stockinsider_runtime_v319',
      'public.claim_legacy_producer_job_candidate_authority_base_v3_19_10(uuid,uuid,uuid,integer)','EXECUTE')
    OR has_function_privilege('stockinsider_runtime_v319',
      'public.claim_legacy_producer_job_full_candidate_authority_base_v3_19_11(uuid,uuid,uuid,integer)','EXECUTE')
    OR has_function_privilege('stockinsider_runtime_v319',
      'public.enrich_legacy_retained_candidate_authority_v3_19_11_internal(uuid,jsonb)','EXECUTE')
    OR has_function_privilege('stockinsider_runtime_v319',
      'public.read_legacy_prior_candidate_result_v3_19_12_internal(uuid)','EXECUTE')
  ) THEN RAISE EXCEPTION 'runtime_role_reconciliation_failed';END IF;
END $retained_candidate_jsonb_cardinality_postconditions$;

COMMIT;
