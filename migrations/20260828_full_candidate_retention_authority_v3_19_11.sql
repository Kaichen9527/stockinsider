BEGIN;

-- V3.19.7 restored current-run acquisition lineage by replacing the public
-- claim wrapper. That replacement bypassed the V3.18 wrapper which selected
-- the complete prior terminal candidate objects. V3.19.10 repaired the
-- missing ledger authority on the resulting partial objects; this successor
-- restores the complete immutable objects first, then validates and fills
-- their authority from the exact same prior run's discovery ledger.
GRANT CREATE ON SCHEMA public TO legacy_correctness_rpc_owner;

DO $upgrade_full_candidate_retention_authority$
BEGIN
  IF to_regprocedure(
    'public.claim_legacy_producer_job_full_candidate_authority_base_v3_19_11(uuid,uuid,uuid,integer)'
  ) IS NULL THEN
    ALTER FUNCTION public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)
      RENAME TO claim_legacy_producer_job_full_candidate_authority_base_v3_19_11;
  END IF;
END $upgrade_full_candidate_retention_authority$;

CREATE OR REPLACE FUNCTION public.enrich_legacy_retained_candidate_authority_v3_19_11_internal(
  p_prior_run uuid,p_prior_ledger jsonb
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $enrich$
DECLARE v_enriched jsonb;
BEGIN
  IF jsonb_typeof(p_prior_ledger)<>'array' OR jsonb_array_length(p_prior_ledger)>60 THEN
    RAISE EXCEPTION 'candidate_retention_prior_ledger_bound';
  END IF;
  IF jsonb_array_length(p_prior_ledger)=0 THEN RETURN '[]'::jsonb;END IF;
  IF p_prior_run IS NULL THEN RAISE EXCEPTION 'candidate_retention_authority_run_missing';END IF;

  IF EXISTS(
    SELECT 1 FROM jsonb_array_elements(p_prior_ledger) candidate(value)
    WHERE (SELECT count(*) FROM public.legacy_candidate_discovery_ledger_v3_11 ledger
      WHERE ledger.source_run_id=p_prior_run
        AND ledger.stock_id::text=candidate.value->>'stockId')=0
  ) THEN RAISE EXCEPTION 'candidate_retention_authority_missing';END IF;
  IF EXISTS(
    SELECT 1 FROM jsonb_array_elements(p_prior_ledger) candidate(value)
    WHERE (SELECT count(*) FROM public.legacy_candidate_discovery_ledger_v3_11 ledger
      WHERE ledger.source_run_id=p_prior_run
        AND ledger.stock_id::text=candidate.value->>'stockId')<>1
  ) THEN RAISE EXCEPTION 'candidate_retention_authority_cardinality';END IF;

  IF EXISTS(
    SELECT 1
    FROM jsonb_array_elements(p_prior_ledger) candidate(value)
    JOIN LATERAL (
      SELECT ledger.* FROM public.legacy_candidate_discovery_ledger_v3_11 ledger
      WHERE ledger.source_run_id=p_prior_run
        AND ledger.stock_id::text=candidate.value->>'stockId'
      ORDER BY ledger.recorded_at DESC,ledger.discovery_id DESC LIMIT 1
    ) authority ON true
    WHERE (nullif(candidate.value->>'sourceKey','') IS NOT NULL
        AND nullif(candidate.value->>'sourceKey','') IS DISTINCT FROM authority.source_key::text)
      OR (nullif(candidate.value->>'revisionId','') IS NOT NULL
        AND nullif(candidate.value->>'revisionId','') IS DISTINCT FROM authority.document_revision_id::text)
      OR (nullif(candidate.value->>'claimId','') IS NOT NULL
        AND nullif(candidate.value->>'claimId','') IS DISTINCT FROM authority.claim_id::text)
      OR (nullif(candidate.value->>'mentionId','') IS NOT NULL
        AND nullif(candidate.value->>'mentionId','') IS DISTINCT FROM authority.mention_id::text)
      OR (nullif(candidate.value->>'stockId','') IS NOT NULL
        AND nullif(candidate.value->>'stockId','') IS DISTINCT FROM authority.stock_id::text)
      OR (nullif(candidate.value->>'symbol','') IS NOT NULL
        AND nullif(candidate.value->>'symbol','') IS DISTINCT FROM authority.symbol)
      OR (nullif(candidate.value->>'materialEvidenceHash','') IS NOT NULL
        AND nullif(candidate.value->>'materialEvidenceHash','') IS DISTINCT FROM authority.material_evidence_hash)
      OR (nullif(candidate.value->>'disposition','') IS NOT NULL
        AND nullif(candidate.value->>'disposition','') IS DISTINCT FROM authority.disposition::text)
      OR (nullif(candidate.value->>'reason','') IS NOT NULL
        AND nullif(candidate.value->>'reason','') IS DISTINCT FROM authority.reason::text)
      OR (nullif(candidate.value->>'researchDisposition','') IS NOT NULL
        AND nullif(candidate.value->>'researchDisposition','') IS DISTINCT FROM authority.research_disposition::text)
      OR (nullif(candidate.value->>'researchReason','') IS NOT NULL
        AND nullif(candidate.value->>'researchReason','') IS DISTINCT FROM authority.research_reason::text)
      OR (nullif(candidate.value->>'seedMembership','') IS NOT NULL
        AND nullif(candidate.value->>'seedMembership','') IS DISTINCT FROM authority.seed_membership::text)
      OR (nullif(candidate.value->>'legacySeedSetHash','') IS NOT NULL
        AND nullif(candidate.value->>'legacySeedSetHash','') IS DISTINCT FROM authority.legacy_seed_set_hash)
  ) THEN RAISE EXCEPTION 'candidate_retention_authority_conflict';END IF;

  SELECT coalesce(jsonb_agg(
    candidate.value||jsonb_strip_nulls(jsonb_build_object(
      'sourceKey',authority.source_key::text,
      'revisionId',authority.document_revision_id,
      'claimId',authority.claim_id,
      'mentionId',authority.mention_id,
      'stockId',authority.stock_id,
      'symbol',authority.symbol,
      'disposition',authority.disposition::text,
      'reason',authority.reason::text,
      'researchDisposition',authority.research_disposition::text,
      'researchReason',authority.research_reason::text,
      'seedMembership',authority.seed_membership::text,
      'legacySeedSetHash',authority.legacy_seed_set_hash,
      'materialEvidenceHash',authority.material_evidence_hash
    )) ORDER BY candidate.ordinality),'[]'::jsonb)
  INTO v_enriched
  FROM jsonb_array_elements(p_prior_ledger) WITH ORDINALITY candidate(value,ordinality)
  JOIN LATERAL (
    SELECT ledger.* FROM public.legacy_candidate_discovery_ledger_v3_11 ledger
    WHERE ledger.source_run_id=p_prior_run
      AND ledger.stock_id::text=candidate.value->>'stockId'
    ORDER BY ledger.recorded_at DESC,ledger.discovery_id DESC LIMIT 1
  ) authority ON true;
  RETURN v_enriched;
END $enrich$;

CREATE OR REPLACE FUNCTION public.claim_legacy_producer_job_v3_11(
  p_run uuid,p_job uuid,p_token uuid,p_lease integer
) RETURNS public.legacy_producer_claim_v3_11
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $claim$
DECLARE
  v_claim public.legacy_producer_claim_v3_11;
  v_cutoff timestamptz;
  v_prior_run uuid;
  v_prior_ledger jsonb;
  v_prior_result_count integer;
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
    SELECT count(*),max(result.result_json->'candidates')
    INTO v_prior_result_count,v_prior_ledger
    FROM public.legacy_producer_jobs_v3_11 job
    JOIN public.legacy_producer_job_results_v3_11 result ON result.job_id=job.job_id
    WHERE job.run_id=v_prior_run AND job.stage='candidate_funnel'
      AND job.job_kind='stage_barrier' AND job.status='succeeded';
    IF v_prior_result_count<>1 THEN
      RAISE EXCEPTION 'candidate_retention_full_result_cardinality';
    END IF;
  END IF;
  v_prior_ledger:=coalesce(v_prior_ledger,'[]'::jsonb);
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
    'candidateLedgerContract','candidate-ledger-v3.19.11',
    'candidateAuthorityContract','candidate-authority-v3.19.11',
    'priorLedger',v_prior_ledger,
    'sourceAvailable',v_source_available);
  v_claim.read_canonical:=convert_to(v_claim.read_json::text,'utf8');
  v_claim.read_hash:=encode(extensions.digest(v_claim.read_canonical,'sha256'),'hex');
  IF octet_length(v_claim.read_canonical)>3145728 THEN RAISE EXCEPTION 'bound_violation';END IF;
  RETURN v_claim;
END $claim$;

ALTER FUNCTION public.enrich_legacy_retained_candidate_authority_v3_19_11_internal(uuid,jsonb)
  OWNER TO legacy_correctness_rpc_owner;
ALTER FUNCTION public.claim_legacy_producer_job_full_candidate_authority_base_v3_19_11(
  uuid,uuid,uuid,integer) OWNER TO legacy_correctness_rpc_owner;
ALTER FUNCTION public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)
  OWNER TO legacy_correctness_rpc_owner;

REVOKE ALL ON FUNCTION public.enrich_legacy_retained_candidate_authority_v3_19_11_internal(uuid,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.claim_legacy_producer_job_full_candidate_authority_base_v3_19_11(
  uuid,uuid,uuid,integer) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)
  TO service_role;
REVOKE CREATE ON SCHEMA public FROM legacy_correctness_rpc_owner;

DO $full_candidate_retention_authority_postconditions$
BEGIN
  IF NOT has_function_privilege('service_role',
      'public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)','EXECUTE')
    OR has_function_privilege('service_role',
      'public.claim_legacy_producer_job_full_candidate_authority_base_v3_19_11(uuid,uuid,uuid,integer)','EXECUTE')
    OR has_function_privilege('service_role',
      'public.enrich_legacy_retained_candidate_authority_v3_19_11_internal(uuid,jsonb)','EXECUTE')
    OR has_schema_privilege('legacy_correctness_rpc_owner','public','CREATE')
    OR NOT (SELECT pg_get_userbyid(proowner)='legacy_correctness_rpc_owner' AND prosecdef
      AND pg_get_functiondef(oid) LIKE '%legacy_candidate_discovery_ledger_v3_11%'
      AND pg_get_functiondef(oid) LIKE '%candidate_retention_authority_conflict%'
      FROM pg_proc WHERE oid=
        'public.enrich_legacy_retained_candidate_authority_v3_19_11_internal(uuid,jsonb)'::regprocedure)
    OR NOT (SELECT pg_get_userbyid(proowner)='legacy_correctness_rpc_owner' AND prosecdef
      AND pg_get_functiondef(oid) LIKE '%candidateLedgerContract%'
      AND pg_get_functiondef(oid) LIKE '%candidateAuthorityContract%'
      AND pg_get_functiondef(oid) LIKE '%sourceAvailable%'
      AND pg_get_functiondef(oid) LIKE '%legacy_producer_job_results_v3_11%'
      FROM pg_proc WHERE oid=
        'public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)'::regprocedure)
  THEN RAISE EXCEPTION 'full_candidate_retention_authority_postcondition_failed';END IF;
END $full_candidate_retention_authority_postconditions$;

COMMIT;
