BEGIN;

-- Every claim wrapper added after V3.16 can materialize additional bounded
-- authority data.  The original V3.16 handoff refreshed the lease before
-- those successor enrichments ran, so a large final claim could still commit
-- with an already-expired 120-second lease.  Keep the whole current claim
-- chain as the authoritative predecessor and refresh both locked rows only
-- after the final claim payload has been materialized.
GRANT CREATE ON SCHEMA public TO legacy_correctness_rpc_owner;

DO $upgrade_final_claim_handoff$
BEGIN
  IF to_regprocedure(
    'public.claim_legacy_producer_job_pre_handoff_v3_19_16(uuid,uuid,uuid,integer)'
  ) IS NULL THEN
    ALTER FUNCTION public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)
      RENAME TO claim_legacy_producer_job_pre_handoff_v3_19_16;
  END IF;
END $upgrade_final_claim_handoff$;

CREATE OR REPLACE FUNCTION public.claim_legacy_producer_job_v3_11(
  p_run uuid,p_job uuid,p_token uuid,p_lease integer
) RETURNS public.legacy_producer_claim_v3_11
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $claim_handoff$
DECLARE
  v_claim public.legacy_producer_claim_v3_11;
  v_now timestamptz;
  v_owner_hash text;
BEGIN
  IF p_lease<>120 THEN RETURN NULL;END IF;
  v_claim:=public.claim_legacy_producer_job_pre_handoff_v3_19_16(
    p_run,p_job,p_token,p_lease);
  IF v_claim.run_id IS NULL THEN RETURN v_claim;END IF;

  v_now:=date_trunc('second',clock_timestamp());
  v_owner_hash:=encode(extensions.digest(
    convert_to(p_token::text,'utf8'),'sha256'),'hex');
  PERFORM 1 FROM public.legacy_producer_runs_v3_11 run
  WHERE run.run_id=v_claim.run_id AND run.status='running'
    AND run.owner_token_hash=v_owner_hash FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL;END IF;
  PERFORM 1 FROM public.legacy_producer_jobs_v3_11 job
  WHERE job.run_id=v_claim.run_id AND job.job_id=v_claim.job_id
    AND job.status='leased' AND job.owner_token_hash=v_owner_hash FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL;END IF;

  UPDATE public.legacy_producer_runs_v3_11
    SET heartbeat_at=v_now,lease_expires_at=v_now+interval '120 seconds'
  WHERE run_id=v_claim.run_id;
  UPDATE public.legacy_producer_jobs_v3_11
    SET heartbeat_at=v_now,lease_expires_at=v_now+interval '120 seconds'
  WHERE run_id=v_claim.run_id AND job_id=v_claim.job_id;
  v_claim.lease_expires_at:=v_now+interval '120 seconds';
  RETURN v_claim;
END $claim_handoff$;

ALTER FUNCTION public.claim_legacy_producer_job_pre_handoff_v3_19_16(
  uuid,uuid,uuid,integer) OWNER TO legacy_correctness_rpc_owner;
ALTER FUNCTION public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)
  OWNER TO legacy_correctness_rpc_owner;

REVOKE ALL ON FUNCTION
  public.claim_legacy_producer_job_pre_handoff_v3_19_16(uuid,uuid,uuid,integer)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION
  public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
  public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)
  TO service_role;

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
      public.claim_legacy_producer_job_pre_handoff_v3_19_16(uuid,uuid,uuid,integer)
      FROM stockinsider_runtime_v319;
    GRANT EXECUTE ON FUNCTION
      public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)
      TO stockinsider_runtime_v319;
  END IF;
END $runtime_role_reconciliation$;

REVOKE CREATE ON SCHEMA public FROM legacy_correctness_rpc_owner;

DO $final_claim_handoff_postconditions$
BEGIN
  IF NOT has_function_privilege('service_role',
      'public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)','EXECUTE')
    OR has_function_privilege('service_role',
      'public.claim_legacy_producer_job_pre_handoff_v3_19_16(uuid,uuid,uuid,integer)',
      'EXECUTE')
    OR has_schema_privilege('legacy_correctness_rpc_owner','public','CREATE')
    OR NOT (SELECT pg_get_userbyid(proowner)='legacy_correctness_rpc_owner'
      AND prosecdef
      AND pg_get_functiondef(oid) LIKE
        '%claim_legacy_producer_job_pre_handoff_v3_19_16%'
      AND pg_get_functiondef(oid) LIKE
        '%v_now:=date_trunc(''second'',clock_timestamp())%'
      AND pg_get_functiondef(oid) LIKE
        '%v_claim.lease_expires_at:=v_now+interval ''120 seconds''%'
      FROM pg_proc WHERE oid=
        'public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)'::regprocedure)
  THEN RAISE EXCEPTION 'final_claim_handoff_postcondition_failed';END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='stockinsider_runtime_v319')
    AND (NOT has_function_privilege('stockinsider_runtime_v319',
      'public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)','EXECUTE')
      OR has_function_privilege('stockinsider_runtime_v319',
      'public.claim_legacy_producer_job_pre_handoff_v3_19_16(uuid,uuid,uuid,integer)',
      'EXECUTE'))
  THEN RAISE EXCEPTION 'runtime_role_reconciliation_failed';END IF;
END $final_claim_handoff_postconditions$;

COMMIT;
