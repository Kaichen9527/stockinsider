-- V3.20.2: a worker can be interrupted after the run lease is recorded but
-- before it claims its first job.  The original V3.20 reaper selected only a
-- leased job, which left precisely that safe-to-identify run permanently
-- nonterminal.  Extend the existing exact-identity reaper without granting
-- table DML to service_role or creating a broad cancellation endpoint.

CREATE OR REPLACE FUNCTION public.reap_legacy_expired_producer_run_v3_20(
  p_commit text,p_worker_sha256 text,p_config_sha256 text
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $reap_unclaimed$
DECLARE
  v_now timestamptz:=date_trunc('second',clock_timestamp());
  v_count integer;v_run uuid;v_leased_job uuid;v_job uuid;
  v_stage text;v_job_kind text;v_input_hash text;v_hash text;
BEGIN
  IF p_commit !~ '^[0-9a-f]{40}$' OR p_worker_sha256 !~ '^[0-9a-f]{64}$'
    OR p_config_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='authentication_rejected';
  END IF;
  SELECT count(*),(array_agg(run.run_id ORDER BY run.run_id))[1]
    INTO v_count,v_run
  FROM public.legacy_producer_runs_v3_11 run
  WHERE run.status='running' AND run.producer_commit_sha=p_commit
    AND run.worker_sha256=p_worker_sha256 AND run.scheduler_config_sha256=p_config_sha256
    AND run.lease_expires_at<v_now;
  IF v_count=0 THEN RETURN NULL; END IF;
  IF v_count<>1 THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='lease_expired_identity_ambiguous';
  END IF;

  SELECT job.job_id INTO v_leased_job
  FROM public.legacy_producer_jobs_v3_11 job
  WHERE job.run_id=v_run AND job.status='leased' AND job.lease_expires_at<v_now
  ORDER BY job.job_id FOR UPDATE;
  IF v_leased_job IS NOT NULL THEN
    RETURN public.terminalize_legacy_expired_producer_run_v3_20(
      v_run,v_leased_job,p_commit,p_worker_sha256,p_config_sha256);
  END IF;

  -- Do not reclaim a run that has a newer job heartbeat even when the outer
  -- run row is stale.  A mismatched lease remains fail-closed for operator
  -- investigation rather than becoming a cancellation primitive.
  IF EXISTS(SELECT 1 FROM public.legacy_producer_jobs_v3_11 job
    WHERE job.run_id=v_run AND job.status='leased' AND job.lease_expires_at>=v_now) THEN
    RETURN NULL;
  END IF;

  SELECT job.job_id,job.stage::text,job.job_kind::text,job.input_hash
    INTO v_job,v_stage,v_job_kind,v_input_hash
  FROM public.legacy_producer_jobs_v3_11 job
  WHERE job.run_id=v_run AND job.status IN ('queued','retryable')
  ORDER BY job.stage_ordinal,job.shard_ordinal NULLS FIRST,job.execution_ordinal,job.job_id
  LIMIT 1 FOR UPDATE;
  IF v_job IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='lease_expired_unclaimed_job_missing';
  END IF;
  v_hash:=encode(extensions.digest(convert_to(
    'lease-expired-unclaimed-v3.20:'||v_run::text||':'||v_job::text||':'||p_commit,'utf8'),'sha256'),'hex');
  PERFORM public.append_legacy_expired_producer_diagnostic_v3_20(
    v_run,v_job,v_stage,v_job_kind,v_input_hash,p_commit,v_hash,v_now);
  UPDATE public.legacy_producer_jobs_v3_11 SET status='failed',terminal_at=v_now,
    failure_code='lease_expired',owner_token_hash=NULL,leased_at=NULL,heartbeat_at=NULL,lease_expires_at=NULL
    WHERE run_id=v_run AND job_id=v_job AND status IN ('queued','retryable');
  UPDATE public.legacy_producer_jobs_v3_11 SET status='cancelled',terminal_at=v_now,
    failure_code='cancelled',owner_token_hash=NULL,leased_at=NULL,heartbeat_at=NULL,lease_expires_at=NULL
    WHERE run_id=v_run AND status IN ('queued','retryable');
  UPDATE public.legacy_producer_runs_v3_11 SET status='failed',terminal_at=v_now,
    failure_code='lease_expired',heartbeat_at=v_now,lease_expires_at=v_now
    WHERE run_id=v_run AND status='running';
  RETURN 'failed_recoverable';
END $reap_unclaimed$;

ALTER FUNCTION public.reap_legacy_expired_producer_run_v3_20(text,text,text)
  OWNER TO legacy_correctness_rpc_owner;
REVOKE ALL ON FUNCTION public.reap_legacy_expired_producer_run_v3_20(text,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reap_legacy_expired_producer_run_v3_20(text,text,text)
  TO service_role;

DO $v320_unclaimed_reaper_postcondition$
BEGIN
  IF to_regprocedure('public.reap_legacy_expired_producer_run_v3_20(text,text,text)') IS NULL
    OR NOT has_function_privilege('service_role',
      'public.reap_legacy_expired_producer_run_v3_20(text,text,text)','EXECUTE')
    OR has_function_privilege('anon',
      'public.reap_legacy_expired_producer_run_v3_20(text,text,text)','EXECUTE') THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='v320_unclaimed_reaper_postcondition_failed';
  END IF;
END $v320_unclaimed_reaper_postcondition$;
