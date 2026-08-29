BEGIN;

-- V3.20 deliberately stopped using the previous Radar payload as an input.
-- That removed the old official-market shortcut, but it also left a gap: a
-- run with no newly acquired document could only retain the immediately
-- preceding candidate result.  A sequence of empty runs therefore severed a
-- still-valid, immutable InvestAnchors structured claim.  Rebuild the prior
-- ledger from the immutable candidate result and the source-identity
-- authority, never from a public projection and never from a market factor.
GRANT CREATE ON SCHEMA public TO legacy_correctness_rpc_owner;

CREATE OR REPLACE FUNCTION public.read_v320_revalidated_kol_retention_internal(
  p_source_cutoff timestamptz
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $retained$
DECLARE
  v_prior_run uuid;
  v_prior_ledger jsonb;
BEGIN
  IF p_source_cutoff IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='candidate_retention_cutoff_missing';
  END IF;

  -- Select the most recent *non-empty, revalidated* KOL ledger.  Empty runs
  -- are valid terminal evidence, but cannot erase a bounded existing claim.
  -- The closed predicate is intentionally InvestAnchors-only: its historical
  -- revisions are the only V3.20 backfill source with the explicit structured
  -- claim/right-to-use bridge.  Threads, Podcast, YouTube and Telegram must
  -- be acquired again through their live V3.20 connectors.
  SELECT prior.run_id INTO v_prior_run
  FROM public.legacy_producer_runs_v3_11 prior
  WHERE prior.status='success' AND prior.source_cutoff<p_source_cutoff
    AND EXISTS(
      SELECT 1
      FROM public.legacy_producer_jobs_v3_11 job
      JOIN public.legacy_producer_job_results_v3_11 result ON result.job_id=job.job_id
      CROSS JOIN LATERAL jsonb_array_elements(coalesce(result.result_json->'candidates','[]'::jsonb)) candidate(value)
      JOIN public.legacy_candidate_discovery_ledger_v3_11 ledger
        ON ledger.source_run_id=prior.run_id
       AND ledger.stock_id::text=candidate.value->>'stockId'
      JOIN public.source_document_revisions_v3 revision
        ON revision.revision_id=ledger.document_revision_id
       AND revision.source_key=ledger.source_key
      JOIN LATERAL(
        SELECT authority.*
        FROM public.source_identity_authorities_v3 authority
        WHERE authority.source_identity_id=revision.approved_source_identity_id
          AND authority.authority_id=revision.source_identity_authority_id
          AND authority.status='active'
          AND authority.source_key=revision.source_key
          AND authority.recorded_at<=p_source_cutoff
          AND authority.approved_at<=p_source_cutoff
          AND authority.valid_from<=revision.collected_at
          AND (authority.valid_to IS NULL OR revision.collected_at<authority.valid_to)
        ORDER BY authority.recorded_at DESC,authority.authority_id DESC LIMIT 1
      ) authority ON true
      WHERE job.run_id=prior.run_id AND job.stage='candidate_funnel'
        AND job.job_kind='stage_barrier' AND job.status='succeeded'
        AND candidate.value->>'sourceKey'='investanchors'
        AND ledger.source_key='investanchors'::public.source_key_v3
        AND revision.source_key='investanchors'::public.source_key_v3
        AND (SELECT count(*) FROM public.legacy_candidate_discovery_ledger_v3_11 exact_ledger
          WHERE exact_ledger.source_run_id=prior.run_id
            AND exact_ledger.stock_id::text=candidate.value->>'stockId')=1
    )
  ORDER BY prior.source_cutoff DESC,prior.terminal_at DESC,prior.run_id DESC
  LIMIT 1;

  IF v_prior_run IS NULL THEN RETURN '[]'::jsonb; END IF;

  SELECT coalesce(jsonb_agg(
    candidate.value||jsonb_build_object(
      'nominationAuthority','investanchors_structured_claim',
      'structuredClaim',true,
      'rightsAttested',true,
      'kolRetentionAuthority','revalidated_investanchors_structured_claim_v3_20_1',
      'retentionBridgeSourceRunId',v_prior_run::text
    ) ORDER BY candidate.ordinality
  ),'[]'::jsonb) INTO v_prior_ledger
  FROM public.legacy_producer_jobs_v3_11 job
  JOIN public.legacy_producer_job_results_v3_11 result ON result.job_id=job.job_id
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(result.result_json->'candidates','[]'::jsonb))
    WITH ORDINALITY candidate(value,ordinality)
  JOIN public.legacy_candidate_discovery_ledger_v3_11 ledger
    ON ledger.source_run_id=v_prior_run
   AND ledger.stock_id::text=candidate.value->>'stockId'
  JOIN public.source_document_revisions_v3 revision
    ON revision.revision_id=ledger.document_revision_id
   AND revision.source_key=ledger.source_key
  JOIN LATERAL(
    SELECT authority.*
    FROM public.source_identity_authorities_v3 authority
    WHERE authority.source_identity_id=revision.approved_source_identity_id
      AND authority.authority_id=revision.source_identity_authority_id
      AND authority.status='active'
      AND authority.source_key=revision.source_key
      AND authority.recorded_at<=p_source_cutoff
      AND authority.approved_at<=p_source_cutoff
      AND authority.valid_from<=revision.collected_at
      AND (authority.valid_to IS NULL OR revision.collected_at<authority.valid_to)
    ORDER BY authority.recorded_at DESC,authority.authority_id DESC LIMIT 1
  ) authority ON true
  WHERE job.run_id=v_prior_run AND job.stage='candidate_funnel'
    AND job.job_kind='stage_barrier' AND job.status='succeeded'
    AND candidate.value->>'sourceKey'='investanchors'
    AND ledger.source_key='investanchors'::public.source_key_v3
    AND revision.source_key='investanchors'::public.source_key_v3
    AND (SELECT count(*) FROM public.legacy_candidate_discovery_ledger_v3_11 exact_ledger
      WHERE exact_ledger.source_run_id=v_prior_run
        AND exact_ledger.stock_id::text=candidate.value->>'stockId')=1;

  IF jsonb_array_length(v_prior_ledger)>60 THEN
    RAISE EXCEPTION USING ERRCODE='PT413',MESSAGE='candidate_retention_prior_ledger_bound';
  END IF;
  RETURN v_prior_ledger;
END $retained$;

DO $v320_kol_retention_bridge_wrapper$
BEGIN
  IF to_regprocedure(
    'public.claim_legacy_producer_job_pre_kol_retention_bridge_v3_20_1(uuid,uuid,uuid,integer)'
  ) IS NULL THEN
    ALTER FUNCTION public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)
      RENAME TO claim_legacy_producer_job_pre_kol_retention_bridge_v3_20_1;
  END IF;
END $v320_kol_retention_bridge_wrapper$;

CREATE OR REPLACE FUNCTION public.claim_legacy_producer_job_v3_11(
  p_run uuid,p_job uuid,p_token uuid,p_lease integer
) RETURNS public.legacy_producer_claim_v3_11
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $claim$
DECLARE
  v_claim public.legacy_producer_claim_v3_11;
  v_cutoff timestamptz;
  v_prior_ledger jsonb;
BEGIN
  v_claim:=public.claim_legacy_producer_job_pre_kol_retention_bridge_v3_20_1(
    p_run,p_job,p_token,p_lease);
  IF v_claim.run_id IS NULL OR v_claim.read_kind IS DISTINCT FROM 'candidate_funnel_input' THEN
    RETURN v_claim;
  END IF;

  SELECT run.source_cutoff INTO STRICT v_cutoff
  FROM public.legacy_producer_runs_v3_11 run WHERE run.run_id=v_claim.run_id;
  v_prior_ledger:=public.read_v320_revalidated_kol_retention_internal(v_cutoff);

  v_claim.read_json:=v_claim.read_json||jsonb_build_object(
    'candidateLedgerContract','candidate-ledger-v3.20.1',
    'candidateAuthorityContract','candidate-authority-v3.20.1',
    'kolRetentionAuthorityContract','v3.20.1',
    'priorLedger',v_prior_ledger);
  v_claim.read_canonical:=convert_to(v_claim.read_json::text,'utf8');
  v_claim.read_hash:=encode(extensions.digest(v_claim.read_canonical,'sha256'),'hex');
  IF octet_length(v_claim.read_canonical)>3145728 THEN
    RAISE EXCEPTION USING ERRCODE='PT413',MESSAGE='bound_violation';
  END IF;
  RETURN v_claim;
END $claim$;

-- The doctor already validates the complete closed delegation graph.  This
-- successor adds one wrapper, so keep the verifier graph-aware rather than
-- weakening it to a name-only check on the outer function.
CREATE OR REPLACE FUNCTION public.verify_legacy_claim_delegation_chain_v3_20()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $claim_chain$
  SELECT
    position('claim_legacy_producer_job_pre_kol_retention_bridge_v3_20_1' IN pg_get_functiondef(
      'public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)'::regprocedure))>0
    AND position('claim_legacy_producer_job_pre_kol_authority_v3_20' IN pg_get_functiondef(
      'public.claim_legacy_producer_job_pre_kol_retention_bridge_v3_20_1(uuid,uuid,uuid,integer)'::regprocedure))>0
    AND position('claim_legacy_producer_job_pre_handoff_v3_19_16' IN pg_get_functiondef(
      'public.claim_legacy_producer_job_pre_kol_authority_v3_20(uuid,uuid,uuid,integer)'::regprocedure))>0
    AND position('claim_legacy_producer_job_full_candidate_authority_base_v3_19_11' IN pg_get_functiondef(
      'public.claim_legacy_producer_job_pre_handoff_v3_19_16(uuid,uuid,uuid,integer)'::regprocedure))>0
    AND position('claim_legacy_producer_job_candidate_authority_base_v3_19_10' IN pg_get_functiondef(
      'public.claim_legacy_producer_job_full_candidate_authority_base_v3_19_11(uuid,uuid,uuid,integer)'::regprocedure))>0
    AND position('providerAcquisitions' IN pg_get_functiondef(
      'public.claim_legacy_producer_job_candidate_authority_base_v3_19_10(uuid,uuid,uuid,integer)'::regprocedure))>0;
$claim_chain$;

ALTER FUNCTION public.read_v320_revalidated_kol_retention_internal(timestamptz)
  OWNER TO legacy_correctness_rpc_owner;
ALTER FUNCTION public.claim_legacy_producer_job_pre_kol_retention_bridge_v3_20_1(
  uuid,uuid,uuid,integer) OWNER TO legacy_correctness_rpc_owner;
ALTER FUNCTION public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)
  OWNER TO legacy_correctness_rpc_owner;
ALTER FUNCTION public.verify_legacy_claim_delegation_chain_v3_20()
  OWNER TO legacy_correctness_rpc_owner;

REVOKE ALL ON FUNCTION public.read_v320_revalidated_kol_retention_internal(timestamptz)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.claim_legacy_producer_job_pre_kol_retention_bridge_v3_20_1(
  uuid,uuid,uuid,integer) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.verify_legacy_claim_delegation_chain_v3_20()
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)
  TO service_role;

DO $v320_kol_retention_runtime_role$
BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='stockinsider_runtime_v319') THEN
    REVOKE ALL ON FUNCTION public.claim_legacy_producer_job_pre_kol_retention_bridge_v3_20_1(
      uuid,uuid,uuid,integer) FROM stockinsider_runtime_v319;
    REVOKE ALL ON FUNCTION public.read_v320_revalidated_kol_retention_internal(timestamptz)
      FROM stockinsider_runtime_v319;
    GRANT EXECUTE ON FUNCTION public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)
      TO stockinsider_runtime_v319;
  END IF;
END $v320_kol_retention_runtime_role$;

REVOKE CREATE ON SCHEMA public FROM legacy_correctness_rpc_owner;

DO $v320_kol_retention_bridge_postconditions$
BEGIN
  IF NOT (SELECT pg_get_userbyid(proowner)='legacy_correctness_rpc_owner' AND prosecdef
      AND pg_get_functiondef(oid) LIKE '%read_v320_revalidated_kol_retention_internal%'
      AND pg_get_functiondef(oid) LIKE '%kolRetentionAuthorityContract%'
      FROM pg_proc WHERE oid='public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)'::regprocedure)
  OR NOT (SELECT pg_get_userbyid(proowner)='legacy_correctness_rpc_owner' AND prosecdef
      AND pg_get_functiondef(oid) LIKE '%investanchors_structured_claim%'
      AND pg_get_functiondef(oid) LIKE '%source_identity_authorities_v3%'
      AND pg_get_functiondef(oid) LIKE '%ledger.source_key=''investanchors''%'
      FROM pg_proc WHERE oid='public.read_v320_revalidated_kol_retention_internal(timestamptz)'::regprocedure)
    OR NOT has_function_privilege('service_role',
      'public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)','EXECUTE')
    OR has_function_privilege('service_role',
      'public.claim_legacy_producer_job_pre_kol_retention_bridge_v3_20_1(uuid,uuid,uuid,integer)','EXECUTE')
    OR has_function_privilege('service_role',
      'public.read_v320_revalidated_kol_retention_internal(timestamptz)','EXECUTE')
    OR NOT public.verify_legacy_claim_delegation_chain_v3_20()
    OR has_function_privilege('service_role',
      'public.verify_legacy_claim_delegation_chain_v3_20()','EXECUTE')
    OR has_schema_privilege('legacy_correctness_rpc_owner','public','CREATE')
  THEN RAISE EXCEPTION 'v320_kol_retention_bridge_postcondition_failed'; END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='stockinsider_runtime_v319')
    AND (NOT has_function_privilege('stockinsider_runtime_v319',
      'public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)','EXECUTE')
      OR has_function_privilege('stockinsider_runtime_v319',
        'public.claim_legacy_producer_job_pre_kol_retention_bridge_v3_20_1(uuid,uuid,uuid,integer)','EXECUTE')
      OR has_function_privilege('stockinsider_runtime_v319',
        'public.read_v320_revalidated_kol_retention_internal(timestamptz)','EXECUTE'))
  THEN RAISE EXCEPTION 'v320_kol_retention_runtime_role_postcondition_failed'; END IF;
END $v320_kol_retention_bridge_postconditions$;

COMMIT;
