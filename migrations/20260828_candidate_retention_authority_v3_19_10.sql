BEGIN;

-- V3.18 preserves the full prior candidate object so citations and the
-- research-only detail survive a no-new-source session.  Some historical
-- terminal results predate that contract and contain only stock identity and
-- material hash.  Rebind those legacy objects to the immutable discovery
-- ledger from the exact same prior successful run before the worker applies
-- retention.  Never infer or hard-code a source.
GRANT CREATE ON SCHEMA public TO legacy_correctness_rpc_owner;

DO $upgrade_candidate_retention_authority$
BEGIN
  IF to_regprocedure(
    'public.claim_legacy_producer_job_candidate_authority_base_v3_19_10(uuid,uuid,uuid,integer)'
  ) IS NULL THEN
    ALTER FUNCTION public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)
      RENAME TO claim_legacy_producer_job_candidate_authority_base_v3_19_10;
  END IF;
END $upgrade_candidate_retention_authority$;

CREATE OR REPLACE FUNCTION public.claim_legacy_producer_job_v3_11(
  p_run uuid,p_job uuid,p_token uuid,p_lease integer
) RETURNS public.legacy_producer_claim_v3_11
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $claim$
DECLARE
  v_claim public.legacy_producer_claim_v3_11;
  v_cutoff timestamptz;
  v_prior_run uuid;
  v_prior_ledger jsonb;
  v_enriched jsonb;
BEGIN
  v_claim:=public.claim_legacy_producer_job_candidate_authority_base_v3_19_10(
    p_run,p_job,p_token,p_lease);
  IF v_claim.run_id IS NULL OR v_claim.read_kind IS DISTINCT FROM 'candidate_funnel_input' THEN
    RETURN v_claim;
  END IF;

  SELECT run.source_cutoff INTO STRICT v_cutoff
  FROM public.legacy_producer_runs_v3_11 run WHERE run.run_id=v_claim.run_id;
  SELECT prior.run_id INTO v_prior_run
  FROM public.legacy_producer_runs_v3_11 prior
  WHERE prior.status='success' AND prior.source_cutoff<v_cutoff
  ORDER BY prior.source_cutoff DESC,prior.terminal_at DESC,prior.run_id DESC
  LIMIT 1;

  v_prior_ledger:=coalesce(v_claim.read_json->'priorLedger','[]'::jsonb);
  IF jsonb_typeof(v_prior_ledger)<>'array' OR jsonb_array_length(v_prior_ledger)>60 THEN
    RAISE EXCEPTION 'candidate_retention_prior_ledger_bound';
  END IF;
  IF jsonb_array_length(v_prior_ledger)=0 THEN
    v_claim.read_json:=v_claim.read_json||jsonb_build_object(
      'candidateAuthorityContract','candidate-authority-v3.19.10');
    v_claim.read_canonical:=convert_to(v_claim.read_json::text,'utf8');
    v_claim.read_hash:=encode(extensions.digest(v_claim.read_canonical,'sha256'),'hex');
    IF octet_length(v_claim.read_canonical)>3145728 THEN RAISE EXCEPTION 'bound_violation';END IF;
    RETURN v_claim;
  END IF;
  IF v_prior_run IS NULL THEN
    RAISE EXCEPTION 'candidate_retention_authority_run_missing';
  END IF;

  IF EXISTS(
    SELECT 1 FROM jsonb_array_elements(v_prior_ledger) candidate(value)
    WHERE NOT EXISTS(
      SELECT 1 FROM public.legacy_candidate_discovery_ledger_v3_11 ledger
      WHERE ledger.source_run_id=v_prior_run
        AND ledger.stock_id::text=candidate.value->>'stockId'
    )
  ) THEN RAISE EXCEPTION 'candidate_retention_authority_missing';END IF;
  IF EXISTS(
    SELECT 1 FROM jsonb_array_elements(v_prior_ledger) candidate(value)
    WHERE (SELECT count(*) FROM public.legacy_candidate_discovery_ledger_v3_11 ledger
      WHERE ledger.source_run_id=v_prior_run
        AND ledger.stock_id::text=candidate.value->>'stockId')<>1
  ) THEN RAISE EXCEPTION 'candidate_retention_authority_cardinality';END IF;

  IF EXISTS(
    SELECT 1
    FROM jsonb_array_elements(v_prior_ledger) candidate(value)
    JOIN LATERAL (
      SELECT ledger.*
      FROM public.legacy_candidate_discovery_ledger_v3_11 ledger
      WHERE ledger.source_run_id=v_prior_run
        AND ledger.stock_id::text=candidate.value->>'stockId'
      ORDER BY ledger.recorded_at DESC,ledger.discovery_id DESC
      LIMIT 1
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
  FROM jsonb_array_elements(v_prior_ledger) WITH ORDINALITY candidate(value,ordinality)
  JOIN LATERAL (
    SELECT ledger.*
    FROM public.legacy_candidate_discovery_ledger_v3_11 ledger
    WHERE ledger.source_run_id=v_prior_run
      AND ledger.stock_id::text=candidate.value->>'stockId'
    ORDER BY ledger.recorded_at DESC,ledger.discovery_id DESC
    LIMIT 1
  ) authority ON true;

  v_claim.read_json:=v_claim.read_json||jsonb_build_object(
    'candidateLedgerContract','candidate-ledger-v3.19.10',
    'candidateAuthorityContract','candidate-authority-v3.19.10',
    'priorLedger',v_enriched);
  v_claim.read_canonical:=convert_to(v_claim.read_json::text,'utf8');
  v_claim.read_hash:=encode(extensions.digest(v_claim.read_canonical,'sha256'),'hex');
  IF octet_length(v_claim.read_canonical)>3145728 THEN RAISE EXCEPTION 'bound_violation';END IF;
  RETURN v_claim;
END $claim$;

ALTER FUNCTION public.claim_legacy_producer_job_candidate_authority_base_v3_19_10(
  uuid,uuid,uuid,integer) OWNER TO legacy_correctness_rpc_owner;
ALTER FUNCTION public.claim_legacy_producer_job_v3_11(
  uuid,uuid,uuid,integer) OWNER TO legacy_correctness_rpc_owner;

REVOKE ALL ON FUNCTION public.claim_legacy_producer_job_candidate_authority_base_v3_19_10(
  uuid,uuid,uuid,integer) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.claim_legacy_producer_job_v3_11(
  uuid,uuid,uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_legacy_producer_job_v3_11(
  uuid,uuid,uuid,integer) TO service_role;
REVOKE CREATE ON SCHEMA public FROM legacy_correctness_rpc_owner;

DO $candidate_retention_authority_postconditions$
DECLARE v_owner text;v_contract boolean;v_base_exposed boolean;v_owner_create boolean;
BEGIN
  SELECT pg_get_userbyid(function.proowner),
    position('candidateAuthorityContract' IN pg_get_functiondef(function.oid))>0
  INTO v_owner,v_contract
  FROM pg_proc function
  WHERE function.oid='public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)'::regprocedure;
  v_base_exposed:=has_function_privilege('service_role',
    'public.claim_legacy_producer_job_candidate_authority_base_v3_19_10(uuid,uuid,uuid,integer)','EXECUTE');
  v_owner_create:=has_schema_privilege('legacy_correctness_rpc_owner','public','CREATE');
  IF v_owner IS DISTINCT FROM 'legacy_correctness_rpc_owner' OR NOT v_contract OR v_base_exposed
    OR NOT has_function_privilege('service_role',
      'public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)','EXECUTE')
    OR v_owner_create
  THEN RAISE EXCEPTION 'candidate_retention_authority_postcondition_failed';END IF;
END $candidate_retention_authority_postconditions$;

COMMIT;
