BEGIN;

-- V3.15 appended an active-market coarse universe to every candidate-funnel
-- claim.  Later V3.20 code correctly stopped *using* that universe for
-- nomination, but the legacy wrapper still built up to 3,000 rows before the
-- handler could begin its lease heartbeat.  Keep the reviewed wrapper chain
-- intact while replacing that one historical implementation with the bounded
-- KOL-first transport: source cutoff plus immutable source claims only.
-- PostgreSQL requires the destination owner to have CREATE on the containing
-- schema while a function ownership transfer is performed.  The predecessor
-- is owned by opportunity_v3_rpc_owner, while the verifier is owned by the
-- narrowly-scoped legacy correctness owner.  Grant only the transaction-local
-- capability needed for those transfers and revoke it before commit.
GRANT CREATE ON SCHEMA public TO opportunity_v3_rpc_owner,legacy_correctness_rpc_owner;

CREATE OR REPLACE FUNCTION public.claim_legacy_producer_job_authoritative_v3_16(
  p_run uuid,p_job uuid,p_token uuid,p_lease integer
) RETURNS public.legacy_producer_claim_v3_11
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $kol_compact_claim$
DECLARE
  v_claim public.legacy_producer_claim_v3_11;
  v_cutoff timestamptz;
BEGIN
  -- The V3.11 predecessor materializes the complete per-shard result array and
  -- enforces its 3 MiB canonical bound before a wrapper can replace that
  -- value. Claim the mention barrier directly with the same row locks,
  -- owner-token, lease and attempt transitions, then return only the reviewed
  -- candidate projection. All shard evidence remains immutable in storage.
  v_claim:=public.claim_legacy_mention_barrier_transport_v3_15(p_run,p_job,p_token,p_lease);
  IF v_claim.run_id IS NOT NULL THEN RETURN v_claim; END IF;

  v_claim:=public.claim_legacy_producer_job_authoritative_v3_15(p_run,p_job,p_token,p_lease);
  IF v_claim.run_id IS NULL THEN RETURN v_claim; END IF;

  IF v_claim.read_kind='mention_shard_results' THEN
    v_claim.read_json:=public.read_legacy_mention_barrier_transport_v3_15(p_run);
    v_claim.read_row_count:=jsonb_array_length(v_claim.read_json->'candidates');
    v_claim.read_canonical:=convert_to(v_claim.read_json::text,'utf8');
    v_claim.read_hash:=encode(extensions.digest(v_claim.read_canonical,'sha256'),'hex');
    RETURN v_claim;
  END IF;
  IF v_claim.read_kind IS DISTINCT FROM 'candidate_funnel_input' THEN RETURN v_claim; END IF;

  SELECT run.source_cutoff INTO STRICT v_cutoff
  FROM public.legacy_producer_runs_v3_11 run WHERE run.run_id=v_claim.run_id;
  v_claim.read_json:=v_claim.read_json||jsonb_build_object(
    'sourceCutoff',to_char(v_cutoff AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'));
  v_claim.read_canonical:=convert_to(v_claim.read_json::text,'utf8');
  v_claim.read_hash:=encode(extensions.digest(v_claim.read_canonical,'sha256'),'hex');
  IF octet_length(v_claim.read_canonical)>3145728 OR coalesce(v_claim.read_row_count,0)>20000 THEN
    RAISE EXCEPTION USING ERRCODE='PT413',MESSAGE='bound_violation';
  END IF;
  -- The durable predecessor result remains available by job id.  Do not copy
  -- it twice through the REST claim boundary.
  v_claim.predecessor_result_canonical:=NULL;
  v_claim.predecessor_result_json:=NULL;
  v_claim.predecessor_result_hash:=NULL;
  RETURN v_claim;
END $kol_compact_claim$;

-- The public wrapper is intentionally a short delegation chain.  Assert both
-- the delegated authority and that the hidden V3.15 transport no longer
-- materializes an official-market universe.
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
      'public.claim_legacy_producer_job_candidate_authority_base_v3_19_10(uuid,uuid,uuid,integer)'::regprocedure))>0
    AND position('coarseUniverseRows' IN pg_get_functiondef(
      'public.claim_legacy_producer_job_authoritative_v3_16(uuid,uuid,uuid,integer)'::regprocedure))=0
    AND position('sourceCutoff' IN pg_get_functiondef(
      'public.claim_legacy_producer_job_authoritative_v3_16(uuid,uuid,uuid,integer)'::regprocedure))>0;
$claim_chain$;

ALTER FUNCTION public.claim_legacy_producer_job_authoritative_v3_16(
  uuid,uuid,uuid,integer) OWNER TO opportunity_v3_rpc_owner;
ALTER FUNCTION public.verify_legacy_claim_delegation_chain_v3_20()
  OWNER TO legacy_correctness_rpc_owner;
REVOKE ALL ON FUNCTION public.claim_legacy_producer_job_authoritative_v3_16(
  uuid,uuid,uuid,integer) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.verify_legacy_claim_delegation_chain_v3_20()
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.claim_legacy_producer_job_authoritative_v3_16(
  uuid,uuid,uuid,integer) TO legacy_correctness_rpc_owner;

REVOKE CREATE ON SCHEMA public FROM opportunity_v3_rpc_owner,legacy_correctness_rpc_owner;

DO $v320_kol_claim_payload_compaction_postconditions$
BEGIN
  IF NOT (SELECT pg_get_userbyid(proowner)='opportunity_v3_rpc_owner' AND prosecdef
      AND pg_get_functiondef(oid) LIKE '%sourceCutoff%'
      AND pg_get_functiondef(oid) NOT LIKE '%coarseUniverseRows%'
      AND pg_get_functiondef(oid) LIKE '%claim_legacy_mention_barrier_transport_v3_15%'
      AND pg_get_functiondef(oid) LIKE '%claim_legacy_producer_job_authoritative_v3_15%'
      FROM pg_proc WHERE oid=
        'public.claim_legacy_producer_job_authoritative_v3_16(uuid,uuid,uuid,integer)'::regprocedure)
    OR has_function_privilege('service_role',
      'public.claim_legacy_producer_job_authoritative_v3_16(uuid,uuid,uuid,integer)','EXECUTE')
    OR NOT public.verify_legacy_claim_delegation_chain_v3_20()
    OR has_function_privilege('service_role',
      'public.verify_legacy_claim_delegation_chain_v3_20()','EXECUTE')
    OR has_schema_privilege('opportunity_v3_rpc_owner','public','CREATE')
    OR has_schema_privilege('legacy_correctness_rpc_owner','public','CREATE')
  THEN RAISE EXCEPTION 'v320_kol_claim_payload_compaction_postcondition_failed'; END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='stockinsider_runtime_v319')
    AND (NOT has_function_privilege('stockinsider_runtime_v319',
      'public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)','EXECUTE')
      OR has_function_privilege('stockinsider_runtime_v319',
        'public.claim_legacy_producer_job_authoritative_v3_16(uuid,uuid,uuid,integer)','EXECUTE'))
  THEN RAISE EXCEPTION 'v320_kol_claim_payload_runtime_boundary_failed'; END IF;
END $v320_kol_claim_payload_compaction_postconditions$;

COMMIT;
