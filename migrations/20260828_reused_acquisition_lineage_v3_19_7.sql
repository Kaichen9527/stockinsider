BEGIN;

GRANT USAGE, CREATE ON SCHEMA public TO legacy_correctness_rpc_owner;

CREATE OR REPLACE FUNCTION public.resolve_legacy_provider_acquisition_lineage_v3_19_7_internal(
  p_run uuid
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $lineage$
  WITH result_references AS (
    SELECT member.value AS reference
    FROM public.legacy_producer_jobs_v3_11 job
    JOIN public.legacy_producer_job_results_v3_11 result ON result.job_id=job.job_id
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN job.stage='source_sync'
        AND jsonb_typeof(result.result_json->'providerAcquisitions')='array'
      THEN result.result_json->'providerAcquisitions' ELSE '[]'::jsonb END
    ) member
    WHERE job.run_id=p_run AND job.status='succeeded'
    UNION ALL
    SELECT CASE job.stage
      WHEN 'candidate_funnel' THEN result.result_json->'coarseProviderAcquisition'
      WHEN 'facts_refresh' THEN result.result_json->'providerAcquisition'
      ELSE NULL
    END AS reference
    FROM public.legacy_producer_jobs_v3_11 job
    JOIN public.legacy_producer_job_results_v3_11 result ON result.job_id=job.job_id
    WHERE job.run_id=p_run AND job.status='succeeded'
      AND ((job.stage='candidate_funnel'
          AND jsonb_typeof(result.result_json->'coarseProviderAcquisition')='object')
        OR (job.stage='facts_refresh'
          AND jsonb_typeof(result.result_json->'providerAcquisition')='object'))
  ), authoritative_revisions AS (
    SELECT revision.*
    FROM public.legacy_provider_acquisition_revisions_v3_16_21 revision
    WHERE revision.run_id=p_run
    UNION
    SELECT revision.*
    FROM result_references referenced
    JOIN public.legacy_provider_acquisition_revisions_v3_16_21 revision
      ON revision.provider=referenced.reference->>'provider'
      AND revision.request_key=referenced.reference->>'requestKey'
      AND to_char(revision.source_cutoff AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"')=
        referenced.reference->>'sourceCutoff'
      AND revision.evidence_root=referenced.reference->>'evidenceRoot'
      AND revision.response_sha256=referenced.reference->>'responseSha256'
      AND revision.normalized_payload_sha256=referenced.reference->>'normalizedPayloadSha256'
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'schema','provider-acquisition-lineage-member-v3.19.7',
    'provider',selected.provider,'requestKey',selected.request_key,'runId',selected.run_id::text,
    'stage',selected.stage,
    'sourceCutoff',to_char(selected.source_cutoff AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'fetchedAt',to_char(selected.fetched_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'responseSha256',selected.response_sha256,'responseBytes',selected.response_bytes,
    'normalizedPayloadSha256',selected.normalized_payload_sha256,
    'terminalStatus',selected.terminal_status,'evidenceRoot',selected.evidence_root,
    'actionEligible',selected.action_eligible
  ) ORDER BY selected.provider,selected.request_key),'[]'::jsonb)
  FROM authoritative_revisions selected;
$lineage$;

CREATE OR REPLACE FUNCTION public.claim_legacy_producer_job_v3_11(
  p_run uuid,p_job uuid,p_token uuid,p_lease integer
) RETURNS public.legacy_producer_claim_v3_11
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $claim$
DECLARE
  v_claim public.legacy_producer_claim_v3_11;
  v_lineage jsonb;
  v_evidence_at timestamptz;
  v_evaluation_at timestamptz;
BEGIN
  v_claim:=public.claim_legacy_producer_job_provider_acquisition_base_v3_16_21(
    p_run,p_job,p_token,p_lease);
  IF v_claim.run_id IS NULL OR v_claim.read_kind NOT IN (
    'analysis_revision_input','compact_projection_input'
  ) THEN
    RETURN v_claim;
  END IF;
  v_lineage:=public.resolve_legacy_provider_acquisition_lineage_v3_19_7_internal(v_claim.run_id);
  SELECT max((member->>'fetchedAt')::timestamptz) INTO v_evidence_at
  FROM jsonb_array_elements(v_lineage) member;
  v_evaluation_at:=greatest((v_claim.read_json->>'evaluationTimestamp')::timestamptz,v_evidence_at);
  v_claim.read_json:=v_claim.read_json||jsonb_build_object(
    'evaluationTimestamp',to_char(v_evaluation_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );
  IF v_claim.read_kind='compact_projection_input' THEN
    v_claim.read_json:=v_claim.read_json||jsonb_build_object('providerAcquisitions',v_lineage);
  END IF;
  v_claim.read_canonical:=convert_to(v_claim.read_json::text,'utf8');
  v_claim.read_hash:=encode(extensions.digest(v_claim.read_canonical,'sha256'),'hex');
  IF octet_length(v_claim.read_canonical)>3145728 THEN RAISE EXCEPTION 'bound_violation';END IF;
  RETURN v_claim;
END $claim$;

ALTER FUNCTION public.resolve_legacy_provider_acquisition_lineage_v3_19_7_internal(uuid)
  OWNER TO legacy_correctness_rpc_owner;
ALTER FUNCTION public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)
  OWNER TO legacy_correctness_rpc_owner;

REVOKE ALL ON FUNCTION public.resolve_legacy_provider_acquisition_lineage_v3_19_7_internal(uuid)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)
  TO service_role;

REVOKE CREATE ON SCHEMA public FROM legacy_correctness_rpc_owner;

DO $v3197_reused_lineage_contract$
BEGIN
  IF to_regprocedure(
      'public.resolve_legacy_provider_acquisition_lineage_v3_19_7_internal(uuid)') IS NULL
    OR NOT (SELECT prosecdef AND pg_get_userbyid(proowner)='legacy_correctness_rpc_owner'
      FROM pg_proc WHERE oid=
        'public.resolve_legacy_provider_acquisition_lineage_v3_19_7_internal(uuid)'::regprocedure)
    OR has_function_privilege('service_role',
      'public.resolve_legacy_provider_acquisition_lineage_v3_19_7_internal(uuid)','EXECUTE')
    OR NOT has_function_privilege('service_role',
      'public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)','EXECUTE')
    OR has_schema_privilege('legacy_correctness_rpc_owner','public','CREATE')
  THEN RAISE EXCEPTION 'v3197_reused_acquisition_lineage_contract_unavailable';END IF;
END $v3197_reused_lineage_contract$;

COMMIT;
