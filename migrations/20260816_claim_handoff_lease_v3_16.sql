BEGIN;

GRANT CREATE ON SCHEMA public TO legacy_correctness_rpc_owner;

-- Building the point-in-time candidate fact plane can exceed the ordinary
-- 120-second job lease inside the claim transaction.  The claimed row is not
-- visible to a separate heartbeat until that transaction commits, so wrap the
-- reviewed V3.15 claim and hand off a fresh lease only after every bounded read
-- has been materialized.  Row locks held by the predecessor serialize any
-- competing claimant until this refresh commits.
DO $upgrade_claim_handoff$
BEGIN
  IF to_regprocedure('public.claim_legacy_producer_job_authoritative_v3_16(uuid,uuid,uuid,integer)') IS NULL THEN
    ALTER FUNCTION public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)
      RENAME TO claim_legacy_producer_job_authoritative_v3_16;
  END IF;
END $upgrade_claim_handoff$;

CREATE OR REPLACE FUNCTION public.claim_legacy_producer_job_v3_11(
  p_run uuid,p_job uuid,p_token uuid,p_lease integer
) RETURNS public.legacy_producer_claim_v3_11
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $claim_handoff$
DECLARE
  v_claim public.legacy_producer_claim_v3_11;
  v_now timestamptz;
  v_owner_hash text;
BEGIN
  IF p_lease<>120 THEN RETURN NULL; END IF;
  v_claim:=public.claim_legacy_producer_job_authoritative_v3_16(
    p_run,p_job,p_token,p_lease);
  IF v_claim.run_id IS NULL THEN RETURN v_claim; END IF;

  -- Use a post-materialization wall-clock value.  Do not require the lease
  -- timestamp written at claim entry to remain live: this transaction still
  -- owns both locked rows, and no competing claim can commit before it.
  v_now:=date_trunc('second',clock_timestamp());
  v_owner_hash:=encode(extensions.digest(
    convert_to(p_token::text,'utf8'),'sha256'),'hex');
  PERFORM 1 FROM public.legacy_producer_runs_v3_11 run
  WHERE run.run_id=v_claim.run_id AND run.status='running'
    AND run.owner_token_hash=v_owner_hash FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  PERFORM 1 FROM public.legacy_producer_jobs_v3_11 job
  WHERE job.run_id=v_claim.run_id AND job.job_id=v_claim.job_id
    AND job.status='leased' AND job.owner_token_hash=v_owner_hash FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  UPDATE public.legacy_producer_runs_v3_11
    SET heartbeat_at=v_now,lease_expires_at=v_now+interval '120 seconds'
  WHERE run_id=v_claim.run_id;
  UPDATE public.legacy_producer_jobs_v3_11
    SET heartbeat_at=v_now,lease_expires_at=v_now+interval '120 seconds'
  WHERE run_id=v_claim.run_id AND job_id=v_claim.job_id;
  v_claim.lease_expires_at:=v_now+interval '120 seconds';
  RETURN v_claim;
END $claim_handoff$;

ALTER FUNCTION public.claim_legacy_producer_job_authoritative_v3_16(uuid,uuid,uuid,integer)
  OWNER TO opportunity_v3_rpc_owner;
ALTER FUNCTION public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)
  OWNER TO legacy_correctness_rpc_owner;
REVOKE ALL ON FUNCTION
  public.claim_legacy_producer_job_authoritative_v3_16(uuid,uuid,uuid,integer)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION
  public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
  public.claim_legacy_producer_job_authoritative_v3_16(uuid,uuid,uuid,integer)
  TO legacy_correctness_rpc_owner;
GRANT EXECUTE ON FUNCTION
  public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)
  TO service_role;
REVOKE CREATE ON SCHEMA public FROM legacy_correctness_rpc_owner;

COMMIT;
