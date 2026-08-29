BEGIN;

-- V3.20.3: the KOL retention reader belongs to the legacy producer plane,
-- while source-document and identity-authority relations deliberately belong
-- to the opportunity RPC plane. Keep those boundaries intact: this bridge
-- returns only authorized InvestAnchors revision IDs, while the legacy reader
-- resolves its own immutable ledger.
GRANT CREATE ON SCHEMA public TO opportunity_v3_rpc_owner,legacy_correctness_rpc_owner;

CREATE OR REPLACE FUNCTION public.read_v320_authorized_investanchors_revision_ids_internal(
  p_source_cutoff timestamptz
) RETURNS TABLE(revision_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $authorized_revisions$
BEGIN
  IF p_source_cutoff IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='candidate_retention_cutoff_missing';
  END IF;
  RETURN QUERY
  SELECT revision.revision_id
  FROM public.source_document_revisions_v3 revision
  JOIN public.source_identity_authorities_v3 authority
    ON authority.source_identity_id=revision.approved_source_identity_id
   AND authority.authority_id=revision.source_identity_authority_id
   AND authority.status='active'
   AND authority.source_key=revision.source_key
   AND authority.recorded_at<=p_source_cutoff
   AND authority.approved_at<=p_source_cutoff
   AND authority.valid_from<=revision.collected_at
   AND (authority.valid_to IS NULL OR revision.collected_at<authority.valid_to)
  WHERE revision.source_key='investanchors'::public.source_key_v3;
END $authorized_revisions$;

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
      JOIN public.read_v320_authorized_investanchors_revision_ids_internal(p_source_cutoff) authorized
        ON authorized.revision_id=ledger.document_revision_id
      WHERE job.run_id=prior.run_id AND job.stage='candidate_funnel'
        AND job.job_kind='stage_barrier' AND job.status='succeeded'
        AND candidate.value->>'sourceKey'='investanchors'
        AND ledger.source_key='investanchors'::public.source_key_v3
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
  JOIN public.read_v320_authorized_investanchors_revision_ids_internal(p_source_cutoff) authorized
    ON authorized.revision_id=ledger.document_revision_id
  WHERE job.run_id=v_prior_run AND job.stage='candidate_funnel'
    AND job.job_kind='stage_barrier' AND job.status='succeeded'
    AND candidate.value->>'sourceKey'='investanchors'
    AND ledger.source_key='investanchors'::public.source_key_v3
    AND (SELECT count(*) FROM public.legacy_candidate_discovery_ledger_v3_11 exact_ledger
      WHERE exact_ledger.source_run_id=v_prior_run
        AND exact_ledger.stock_id::text=candidate.value->>'stockId')=1;

  IF jsonb_array_length(v_prior_ledger)>60 THEN
    RAISE EXCEPTION USING ERRCODE='PT413',MESSAGE='candidate_retention_prior_ledger_bound';
  END IF;
  RETURN v_prior_ledger;
END $retained$;

ALTER FUNCTION public.read_v320_authorized_investanchors_revision_ids_internal(timestamptz)
  OWNER TO opportunity_v3_rpc_owner;
ALTER FUNCTION public.read_v320_revalidated_kol_retention_internal(timestamptz)
  OWNER TO legacy_correctness_rpc_owner;

REVOKE ALL ON FUNCTION public.read_v320_authorized_investanchors_revision_ids_internal(timestamptz)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.read_v320_authorized_investanchors_revision_ids_internal(timestamptz)
  TO legacy_correctness_rpc_owner;
REVOKE ALL ON FUNCTION public.read_v320_revalidated_kol_retention_internal(timestamptz)
  FROM PUBLIC,anon,authenticated,service_role;

DO $v320_kol_retention_owner_boundary_runtime_role$
BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='stockinsider_runtime_v319') THEN
    REVOKE ALL ON FUNCTION public.read_v320_authorized_investanchors_revision_ids_internal(timestamptz)
      FROM stockinsider_runtime_v319;
    REVOKE ALL ON FUNCTION public.read_v320_revalidated_kol_retention_internal(timestamptz)
      FROM stockinsider_runtime_v319;
    GRANT EXECUTE ON FUNCTION public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)
      TO stockinsider_runtime_v319;
  END IF;
END $v320_kol_retention_owner_boundary_runtime_role$;

REVOKE CREATE ON SCHEMA public FROM opportunity_v3_rpc_owner,legacy_correctness_rpc_owner;

DO $v320_kol_retention_owner_boundary_postconditions$
BEGIN
  IF NOT (SELECT pg_get_userbyid(proowner)='opportunity_v3_rpc_owner' AND prosecdef
      AND pg_get_functiondef(oid) LIKE '%source_document_revisions_v3%'
      AND pg_get_functiondef(oid) LIKE '%source_identity_authorities_v3%'
      FROM pg_proc WHERE oid='public.read_v320_authorized_investanchors_revision_ids_internal(timestamptz)'::regprocedure)
    OR NOT (SELECT pg_get_userbyid(proowner)='legacy_correctness_rpc_owner' AND prosecdef
      AND pg_get_functiondef(oid) LIKE '%read_v320_authorized_investanchors_revision_ids_internal%'
      AND pg_get_functiondef(oid) NOT LIKE '%source_document_revisions_v3%'
      AND pg_get_functiondef(oid) NOT LIKE '%source_identity_authorities_v3%'
      FROM pg_proc WHERE oid='public.read_v320_revalidated_kol_retention_internal(timestamptz)'::regprocedure)
    OR NOT has_function_privilege('legacy_correctness_rpc_owner',
      'public.read_v320_authorized_investanchors_revision_ids_internal(timestamptz)','EXECUTE')
    OR has_function_privilege('service_role',
      'public.read_v320_authorized_investanchors_revision_ids_internal(timestamptz)','EXECUTE')
    OR has_function_privilege('service_role',
      'public.read_v320_revalidated_kol_retention_internal(timestamptz)','EXECUTE')
    OR has_schema_privilege('opportunity_v3_rpc_owner','public','CREATE')
    OR has_schema_privilege('legacy_correctness_rpc_owner','public','CREATE')
  THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='v320_kol_retention_owner_boundary_postcondition_failed'; END IF;
END $v320_kol_retention_owner_boundary_postconditions$;

COMMIT;
