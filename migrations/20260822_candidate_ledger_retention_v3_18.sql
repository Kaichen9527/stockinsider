BEGIN;

-- V3.18 keeps the complete immutable candidate object from the immediately
-- preceding terminal source session.  The legacy discovery table deliberately
-- stores only audit columns; reconstructing a card from it loses citations
-- and incorrectly turns an ordinary no-new session into an empty radar.
GRANT CREATE ON SCHEMA public TO legacy_correctness_rpc_owner;

DO $upgrade_candidate_retention_claim$
BEGIN
  IF to_regprocedure(
    'public.claim_legacy_producer_job_candidate_retention_base_v3_18(uuid,uuid,uuid,integer)'
  ) IS NULL THEN
    ALTER FUNCTION public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)
      RENAME TO claim_legacy_producer_job_candidate_retention_base_v3_18;
  END IF;
END $upgrade_candidate_retention_claim$;

CREATE OR REPLACE FUNCTION public.claim_legacy_producer_job_v3_11(
  p_run uuid,p_job uuid,p_token uuid,p_lease integer
) RETURNS public.legacy_producer_claim_v3_11
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $claim$
DECLARE
  v_claim public.legacy_producer_claim_v3_11;
  v_cutoff timestamptz;
  v_prior_ledger jsonb;
  v_source_available boolean:=true;
  v_provider_acquisitions jsonb;
BEGIN
  v_claim:=public.claim_legacy_producer_job_candidate_retention_base_v3_18(
    p_run,p_job,p_token,p_lease);
  -- Preserve the prior V3.16.21 provider lineage contract at the public
  -- wrapper boundary.  The predecessor enriches the compact-projection input;
  -- V3.18 consumes neither live providers nor an unbound replacement.
  IF v_claim.read_kind='compact_projection_input' THEN
    v_provider_acquisitions:=v_claim.read_json->'providerAcquisitions';
    IF jsonb_typeof(v_provider_acquisitions)<>'array' THEN
      RAISE EXCEPTION 'provider_acquisition_lineage_unavailable';
    END IF;
  END IF;
  IF v_claim.run_id IS NULL OR v_claim.read_kind IS DISTINCT FROM 'candidate_funnel_input' THEN
    RETURN v_claim;
  END IF;
  SELECT run.source_cutoff INTO STRICT v_cutoff
  FROM public.legacy_producer_runs_v3_11 run WHERE run.run_id=v_claim.run_id;

  WITH prior_success AS MATERIALIZED (
    SELECT prior.run_id
    FROM public.legacy_producer_runs_v3_11 prior
    WHERE prior.status='success' AND prior.source_cutoff<v_cutoff
    ORDER BY prior.source_cutoff DESC,prior.terminal_at DESC,prior.run_id DESC
    LIMIT 1
  ), prior_result AS MATERIALIZED (
    SELECT result.result_json->'candidates' AS candidates
    FROM prior_success
    JOIN public.legacy_producer_jobs_v3_11 job
      ON job.run_id=prior_success.run_id AND job.stage='candidate_funnel'
      AND job.job_kind='stage_barrier' AND job.status='succeeded'
    JOIN public.legacy_producer_job_results_v3_11 result ON result.job_id=job.job_id
    ORDER BY job.terminal_at DESC NULLS LAST,job.job_id DESC
    LIMIT 1
  ) SELECT candidates INTO v_prior_ledger FROM prior_result;

  v_prior_ledger:=coalesce(v_prior_ledger,'[]'::jsonb);
  IF jsonb_typeof(v_prior_ledger)<>'array' OR jsonb_array_length(v_prior_ledger)>60 THEN
    RAISE EXCEPTION 'candidate_retention_prior_ledger_bound';
  END IF;
  -- Full prior objects are immutable terminal evidence, not a live provider
  -- read. The source worker applies the 20 completed-session retention limit
  -- and records its typed retained/exit outcome in its new terminal result.
  SELECT EXISTS(
    SELECT 1
    FROM public.legacy_producer_jobs_v3_11 source_job
    JOIN public.legacy_producer_job_results_v3_11 source_result ON source_result.job_id=source_job.job_id
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(
      source_result.result_json#>'{sourceAcquisition,connectorAttempts}','[]'::jsonb)) connector(value)
    WHERE source_job.run_id=v_claim.run_id AND source_job.stage='source_sync'
      AND source_job.job_kind='stage_barrier' AND source_job.status='succeeded'
      AND connector.value->>'status' IN ('items_found','successful_empty','metadata_only')
  ) INTO v_source_available;
  v_claim.read_json:=v_claim.read_json||jsonb_build_object(
    'candidateLedgerContract','candidate-ledger-v3.18',
    'priorLedger',v_prior_ledger,
    'sourceAvailable',v_source_available
  );
  v_claim.read_canonical:=convert_to(v_claim.read_json::text,'utf8');
  v_claim.read_hash:=encode(extensions.digest(v_claim.read_canonical,'sha256'),'hex');
  IF octet_length(v_claim.read_canonical)>3145728 THEN
    RAISE EXCEPTION 'bound_violation';
  END IF;
  RETURN v_claim;
END $claim$;

ALTER FUNCTION public.claim_legacy_producer_job_candidate_retention_base_v3_18(
  uuid,uuid,uuid,integer) OWNER TO legacy_correctness_rpc_owner;
ALTER FUNCTION public.claim_legacy_producer_job_v3_11(
  uuid,uuid,uuid,integer) OWNER TO legacy_correctness_rpc_owner;

REVOKE ALL ON FUNCTION public.claim_legacy_producer_job_candidate_retention_base_v3_18(
  uuid,uuid,uuid,integer) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.claim_legacy_producer_job_v3_11(
  uuid,uuid,uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_legacy_producer_job_v3_11(
  uuid,uuid,uuid,integer) TO service_role;
REVOKE CREATE ON SCHEMA public FROM legacy_correctness_rpc_owner;

DO $candidate_retention_postconditions$
DECLARE v_owner text;v_base_exposed boolean;v_owner_create boolean;v_contract_present boolean;
BEGIN
  SELECT owner.rolname,position('candidateLedgerContract' IN pg_get_functiondef(function.oid))>0
  INTO v_owner,v_contract_present
  FROM pg_proc function JOIN pg_roles owner ON owner.oid=function.proowner
  WHERE function.oid='public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)'::regprocedure;
  v_base_exposed:=has_function_privilege('service_role',
    'public.claim_legacy_producer_job_candidate_retention_base_v3_18(uuid,uuid,uuid,integer)','EXECUTE');
  v_owner_create:=has_schema_privilege('legacy_correctness_rpc_owner','public','CREATE');
  IF v_owner<>'legacy_correctness_rpc_owner' OR v_base_exposed OR v_owner_create OR NOT v_contract_present THEN
    RAISE EXCEPTION 'candidate_retention_claim_contract_unavailable';
  END IF;
END $candidate_retention_postconditions$;

COMMIT;
