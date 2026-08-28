BEGIN;

-- A lease expiry is an operational terminal state, not a successful return
-- value.  This narrow RPC is callable only by the reviewed runtime identity
-- and only for its own expired run/job tuple; it cannot cancel a live or a
-- different reviewed release.
GRANT CREATE ON SCHEMA public TO legacy_correctness_rpc_owner,opportunity_v3_rpc_owner;

SET ROLE opportunity_v3_rpc_owner;
ALTER TABLE public.legacy_decision_revision_evaluations_v3_13
  DROP CONSTRAINT IF EXISTS legacy_evaluation_schema_v314_check;
ALTER TABLE public.legacy_decision_revision_evaluations_v3_13
  ADD CONSTRAINT legacy_evaluation_schema_v314_check CHECK (
    source_led_correctness->>'schema' IN ('legacy-radar-v3.13.0','legacy-radar-v3.14.0','legacy-radar-v3.17.0',
      'legacy-radar-v3.18.0','legacy-radar-v3.19.0','legacy-radar-v3.20.0'));
RESET ROLE;

ALTER TABLE public.legacy_runtime_failure_diagnostics_v3_14
  DROP CONSTRAINT IF EXISTS legacy_runtime_failure_diagnostics_v3_14_failure_code_check;
ALTER TABLE public.legacy_runtime_failure_diagnostics_v3_14
  ADD CONSTRAINT legacy_runtime_failure_diagnostics_v3_14_failure_code_check
  CHECK (failure_code IN ('provider_unavailable','data_integrity_failure','authentication_rejected','lease_expired'));
ALTER TABLE public.legacy_runtime_failure_diagnostics_v3_14
  DROP CONSTRAINT IF EXISTS legacy_runtime_failure_diagnostics_v3_14_failure_origin_check;
ALTER TABLE public.legacy_runtime_failure_diagnostics_v3_14
  ADD CONSTRAINT legacy_runtime_failure_diagnostics_v3_14_failure_origin_check
  CHECK (failure_origin IN ('handler','rpc_validation','persistence','provider','runtime','lease_reaper'));
ALTER TABLE public.legacy_runtime_failure_diagnostics_v3_14
  DROP CONSTRAINT IF EXISTS legacy_runtime_failure_diagnostics_v3_14_invariant_code_check;
ALTER TABLE public.legacy_runtime_failure_diagnostics_v3_14
  ADD CONSTRAINT legacy_runtime_failure_diagnostics_v3_14_invariant_code_check
  CHECK (invariant_code IN ('candidate_seed_membership_missing','database_constraint_rejected','provider_timeout',
    'authentication_rejected','projection_supersession_conflict','data_integrity_failure','lease_expired'));

-- Extend the closed source-acquisition contract rather than creating a second
-- unchecked ingestion path.  The enum already contains telegram and
-- investanchors; this migration widens only the approved five-connector matrix
-- and preserves the predecessor's validation/persistence implementation.
GRANT CREATE ON SCHEMA public TO opportunity_v3_rpc_owner;
SET ROLE opportunity_v3_rpc_owner;

ALTER TABLE public.legacy_frozen_source_authorities_v3_13
  DROP CONSTRAINT IF EXISTS legacy_frozen_source_authorities_v3_13_source_key_check;
ALTER TABLE public.legacy_frozen_source_authorities_v3_13
  ADD CONSTRAINT legacy_frozen_source_authorities_v3_13_source_key_check
  CHECK(source_key IN ('threads','podcast','youtube','telegram','investanchors'));
ALTER TABLE public.legacy_source_connector_attempts_v3_13
  DROP CONSTRAINT IF EXISTS legacy_source_connector_attempts_v3_13_source_key_check;
ALTER TABLE public.legacy_source_connector_attempts_v3_13
  ADD CONSTRAINT legacy_source_connector_attempts_v3_13_source_key_check
  CHECK(source_key IN ('threads','podcast','youtube','telegram','investanchors'));

DO $v320_frozen_source_authority_matrix$
DECLARE v_definition text;v_old text:=$old$(VALUES('threads'::public.source_key_v3),('podcast'::public.source_key_v3),
      ('youtube'::public.source_key_v3))$old$;
  v_new text:=$new$(VALUES('threads'::public.source_key_v3),('podcast'::public.source_key_v3),
      ('youtube'::public.source_key_v3),('telegram'::public.source_key_v3),('investanchors'::public.source_key_v3))$new$;
  v_count integer;
BEGIN
  SELECT pg_get_functiondef('public.freeze_legacy_source_authorities_v3_13()'::regprocedure) INTO STRICT v_definition;
  v_count:=(length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old);
  IF v_count=0 AND position('''telegram''::public.source_key_v3' IN v_definition)>0
    AND position('''investanchors''::public.source_key_v3' IN v_definition)>0 THEN RETURN; END IF;
  -- V3.19.16 has one active authority matrix; older reviewed V3.19 wrappers
  -- delegated through two copies.  Both are known predecessors, while zero
  -- or more than two copies means we do not know what would be rewritten.
  IF v_count<1 OR v_count>2 THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='v320_frozen_source_authority_predecessor_conflict'; END IF;
  EXECUTE replace(v_definition,v_old,v_new);
END $v320_frozen_source_authority_matrix$;

DO $v320_source_completion_matrix$
DECLARE v_definition text;v_old_list text:=$old$('threads','podcast','youtube')$old$;
  v_new_list text:=$new$('threads','podcast','youtube','telegram','investanchors')$new$;
  v_old_cross text:=$old$(VALUES('threads'),('podcast'),('youtube'))$old$;
  v_new_cross text:=$new$(SELECT unnest(CASE
        WHEN p_json#>>'{sourceAcquisition,schema}'='official-source-acquisition-v3.20'
          THEN ARRAY['threads','podcast','youtube','telegram','investanchors']
        ELSE ARRAY['threads','podcast','youtube'] END))$new$;
  v_old_schema text:=$old$p_json#>>'{sourceAcquisition,schema}' IS DISTINCT FROM 'official-source-acquisition-v3.13'$old$;
  v_new_schema text:=$new$coalesce(p_json#>>'{sourceAcquisition,schema}','') NOT IN ('official-source-acquisition-v3.13','official-source-acquisition-v3.20')$new$;
  v_old_header text:=$old$p_json#>>'{sourceAcquisition,schema}'<>'official-source-acquisition-v3.13'$old$;
  v_new_header text:=$new$coalesce(p_json#>>'{sourceAcquisition,schema}','') NOT IN ('official-source-acquisition-v3.13','official-source-acquisition-v3.20')$new$;
  v_old_count text:=$old$jsonb_array_length(coalesce(p_json#>'{sourceAcquisition,connectorAttempts}','[]'::jsonb))<>51$old$;
  v_new_count text:=$new$jsonb_array_length(coalesce(p_json#>'{sourceAcquisition,connectorAttempts}','[]'::jsonb))<>
        (CASE WHEN p_json#>>'{sourceAcquisition,schema}'='official-source-acquisition-v3.20' THEN 85 ELSE 51 END)$new$;
  v_old_distinct_count text:=$old$(SELECT count(DISTINCT jsonb_build_array(value->>'profileId',value->>'sourceKey'))
          FROM jsonb_array_elements(coalesce(p_json#>'{sourceAcquisition,connectorAttempts}','[]'::jsonb)) item(value))<>51$old$;
  v_new_distinct_count text:=$new$(SELECT count(DISTINCT jsonb_build_array(value->>'profileId',value->>'sourceKey'))
          FROM jsonb_array_elements(coalesce(p_json#>'{sourceAcquisition,connectorAttempts}','[]'::jsonb)) item(value))<>
          (CASE WHEN p_json#>>'{sourceAcquisition,schema}'='official-source-acquisition-v3.20' THEN 85 ELSE 51 END)$new$;
  v_count integer;
BEGIN
  SELECT pg_get_functiondef('public.complete_legacy_producer_job_authoritative_v3_19(uuid,uuid,uuid,bytea,jsonb,text)'::regprocedure)
    INTO STRICT v_definition;
  IF position('official-source-acquisition-v3.20' IN v_definition)>0
    AND position('ARRAY[''threads'',''podcast'',''youtube'',''telegram'',''investanchors'']'
      IN replace(v_definition,' ',''))>0
    AND position('THEN 85 ELSE 51' IN v_definition)>0 THEN RETURN; END IF;
  IF (length(v_definition)-length(replace(v_definition,v_old_list,'')))/length(v_old_list)<>3
    OR (length(v_definition)-length(replace(v_definition,v_old_cross,'')))/length(v_old_cross)<>1
    OR (length(v_definition)-length(replace(v_definition,v_old_schema,'')))/length(v_old_schema)<>1
    OR (length(v_definition)-length(replace(v_definition,v_old_header,'')))/length(v_old_header)<>1
    OR (length(v_definition)-length(replace(v_definition,v_old_count,'')))/length(v_old_count) NOT BETWEEN 1 AND 2
    OR (length(v_definition)-length(replace(v_definition,v_old_distinct_count,'')))/length(v_old_distinct_count)<>1
  THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='v320_source_completion_predecessor_conflict'; END IF;
  v_definition:=replace(v_definition,v_old_list,v_new_list);
  v_definition:=replace(v_definition,v_old_cross,v_new_cross);
  v_definition:=replace(v_definition,v_old_schema,v_new_schema);
  v_definition:=replace(v_definition,v_old_header,v_new_header);
  v_definition:=replace(v_definition,v_old_count,v_new_count);
  v_definition:=replace(v_definition,v_old_distinct_count,v_new_distinct_count);
  EXECUTE v_definition;
END $v320_source_completion_matrix$;

RESET ROLE;
REVOKE CREATE ON SCHEMA public FROM opportunity_v3_rpc_owner;

-- The diagnostic relation is deliberately owned by opportunity_v3_rpc_owner,
-- whereas a producer lease belongs to legacy_correctness_rpc_owner. Preserve
-- that separation: the lease reaper does not receive table DML. Instead it
-- calls this closed, fixed-shape writer only after verifying the exact expired
-- run/job identity under row locks.
GRANT CREATE ON SCHEMA public TO opportunity_v3_rpc_owner;
SET ROLE opportunity_v3_rpc_owner;
CREATE OR REPLACE FUNCTION public.append_legacy_expired_producer_diagnostic_v3_20(
  p_run uuid,p_job uuid,p_stage text,p_job_kind text,p_input_hash text,p_producer_sha text,
  p_diagnostic_hash text,p_recorded_at timestamptz
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $expired_diagnostic$
BEGIN
  IF p_stage NOT IN ('source_sync','mention_claim_extraction','candidate_funnel','facts_refresh',
      'analysis_revision','compact_radar_projection','worker_terminal')
    OR p_job_kind NOT IN ('source_root','revision_shard','stage_barrier','candidate_batch',
      'analysis_batch','projection_batch','terminal')
    OR p_input_hash !~ '^[0-9a-f]{64}$' OR p_producer_sha !~ '^[0-9a-f]{40}$'
    OR p_diagnostic_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='authentication_rejected';
  END IF;
  INSERT INTO public.legacy_runtime_failure_diagnostics_v3_14(
    run_id,job_id,stage,job_kind,failure_code,failure_origin,invariant_code,sqlstate,constraint_name,
    item_ordinal,field_path,input_hash,producer_sha,diagnostic_hash,recorded_at
  ) VALUES(
    p_run,p_job,p_stage,p_job_kind,'lease_expired','lease_reaper','lease_expired',NULL,NULL,NULL,
    'leaseExpiry',p_input_hash,p_producer_sha,p_diagnostic_hash,p_recorded_at
  ) ON CONFLICT(run_id,job_id,diagnostic_hash) DO NOTHING;
END $expired_diagnostic$;
REVOKE ALL ON FUNCTION public.append_legacy_expired_producer_diagnostic_v3_20(
  uuid,uuid,text,text,text,text,text,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.append_legacy_expired_producer_diagnostic_v3_20(
  uuid,uuid,text,text,text,text,text,timestamptz) TO legacy_correctness_rpc_owner;
RESET ROLE;
REVOKE CREATE ON SCHEMA public FROM opportunity_v3_rpc_owner;

CREATE OR REPLACE FUNCTION public.terminalize_legacy_expired_producer_run_v3_20(
  p_run uuid,p_job uuid,p_commit text,p_worker_sha256 text,p_config_sha256 text
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $terminalize$
DECLARE v_now timestamptz:=date_trunc('second',clock_timestamp()); v_hash text;
BEGIN
  IF p_commit !~ '^[0-9a-f]{40}$' OR p_worker_sha256 !~ '^[0-9a-f]{64}$'
    OR p_config_sha256 !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='authentication_rejected'; END IF;
  PERFORM 1 FROM public.legacy_producer_runs_v3_11 run
    JOIN public.legacy_producer_jobs_v3_11 job ON job.run_id=run.run_id
    WHERE run.run_id=p_run AND job.job_id=p_job AND run.status='running' AND job.status='leased'
      AND run.producer_commit_sha=p_commit AND run.worker_sha256=p_worker_sha256
      AND run.scheduler_config_sha256=p_config_sha256
      AND run.lease_expires_at<v_now AND job.lease_expires_at<v_now
    FOR UPDATE OF run,job;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_hash:=encode(extensions.digest(convert_to('lease-expired-v3.20:'||p_run::text||':'||p_job::text||':'||p_commit,'utf8'),'sha256'),'hex');
  PERFORM public.append_legacy_expired_producer_diagnostic_v3_20(
    p_run,p_job,(SELECT stage::text FROM public.legacy_producer_jobs_v3_11 WHERE job_id=p_job),
    (SELECT job_kind::text FROM public.legacy_producer_jobs_v3_11 WHERE job_id=p_job),
    (SELECT input_hash FROM public.legacy_producer_jobs_v3_11 WHERE job_id=p_job),p_commit,v_hash,v_now);
  UPDATE public.legacy_producer_jobs_v3_11 SET status='failed',terminal_at=v_now,failure_code='lease_expired',
    owner_token_hash=NULL,leased_at=NULL,heartbeat_at=NULL,lease_expires_at=NULL
    WHERE run_id=p_run AND job_id=p_job AND status='leased';
  UPDATE public.legacy_producer_jobs_v3_11 SET status='cancelled',terminal_at=v_now,failure_code='cancelled',
    owner_token_hash=NULL,leased_at=NULL,heartbeat_at=NULL,lease_expires_at=NULL
    WHERE run_id=p_run AND status IN ('queued','retryable');
  UPDATE public.legacy_producer_runs_v3_11 SET status='failed',terminal_at=v_now,failure_code='lease_expired',
    heartbeat_at=v_now,lease_expires_at=v_now WHERE run_id=p_run AND status='running';
  RETURN 'failed_recoverable';
END $terminalize$;

ALTER FUNCTION public.terminalize_legacy_expired_producer_run_v3_20(uuid,uuid,text,text,text)
  OWNER TO legacy_correctness_rpc_owner;
REVOKE ALL ON FUNCTION public.terminalize_legacy_expired_producer_run_v3_20(uuid,uuid,text,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.terminalize_legacy_expired_producer_run_v3_20(uuid,uuid,text,text,text)
  TO service_role;

-- The production incident record retained the run identity but intentionally
-- did not expose a job UUID outside the database.  This narrow reaper derives
-- it only when the exact reviewed identity has one and only one expired lease.
-- It therefore cannot become a broad "cancel whatever is running" endpoint.
CREATE OR REPLACE FUNCTION public.reap_legacy_expired_producer_run_v3_20(
  p_commit text,p_worker_sha256 text,p_config_sha256 text
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $reap$
DECLARE v_count integer;v_run uuid;v_job uuid;
BEGIN
  IF p_commit !~ '^[0-9a-f]{40}$' OR p_worker_sha256 !~ '^[0-9a-f]{64}$'
    OR p_config_sha256 !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='authentication_rejected'; END IF;
  SELECT count(*),
    (array_agg(run.run_id ORDER BY run.run_id,job.job_id))[1],
    (array_agg(job.job_id ORDER BY run.run_id,job.job_id))[1]
    INTO v_count,v_run,v_job
  FROM public.legacy_producer_runs_v3_11 run
  JOIN public.legacy_producer_jobs_v3_11 job ON job.run_id=run.run_id
  WHERE run.status='running' AND job.status='leased'
    AND run.producer_commit_sha=p_commit AND run.worker_sha256=p_worker_sha256
    AND run.scheduler_config_sha256=p_config_sha256
    AND run.lease_expires_at<clock_timestamp() AND job.lease_expires_at<clock_timestamp();
  IF v_count=0 THEN RETURN NULL; END IF;
  IF v_count<>1 THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='lease_expired_identity_ambiguous'; END IF;
  RETURN public.terminalize_legacy_expired_producer_run_v3_20(v_run,v_job,p_commit,p_worker_sha256,p_config_sha256);
END $reap$;

ALTER FUNCTION public.reap_legacy_expired_producer_run_v3_20(text,text,text)
  OWNER TO legacy_correctness_rpc_owner;
REVOKE ALL ON FUNCTION public.reap_legacy_expired_producer_run_v3_20(text,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reap_legacy_expired_producer_run_v3_20(text,text,text)
  TO service_role;

-- Later claim wrappers intentionally delegate rather than repeat the provider
-- lineage payload. Validate the closed predecessor chain itself, rather than
-- falsely requiring every final wrapper to contain an implementation detail
-- from V3.16.21.
CREATE OR REPLACE FUNCTION public.verify_legacy_claim_delegation_chain_v3_20()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $claim_chain$
  SELECT
    position('claim_legacy_producer_job_pre_handoff_v3_19_16' IN pg_get_functiondef(
      'public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)'::regprocedure))>0
    AND position('claim_legacy_producer_job_full_candidate_authority_base_v3_19_11' IN pg_get_functiondef(
      'public.claim_legacy_producer_job_pre_handoff_v3_19_16(uuid,uuid,uuid,integer)'::regprocedure))>0
    AND position('claim_legacy_producer_job_candidate_authority_base_v3_19_10' IN pg_get_functiondef(
      'public.claim_legacy_producer_job_full_candidate_authority_base_v3_19_11(uuid,uuid,uuid,integer)'::regprocedure))>0
    AND position('providerAcquisitions' IN pg_get_functiondef(
      'public.claim_legacy_producer_job_candidate_authority_base_v3_19_10(uuid,uuid,uuid,integer)'::regprocedure))>0;
$claim_chain$;
ALTER FUNCTION public.verify_legacy_claim_delegation_chain_v3_20()
  OWNER TO legacy_correctness_rpc_owner;
REVOKE ALL ON FUNCTION public.verify_legacy_claim_delegation_chain_v3_20()
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.verify_legacy_claim_delegation_chain_v3_20()
  TO legacy_correctness_rpc_owner;

DO $runtime_role_reconciliation$
BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='stockinsider_runtime_v319') THEN
    IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='stockinsider_runtime_v319'
      AND rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
      AND NOT rolreplication AND NOT rolbypassrls AND rolconnlimit=6) THEN
      RAISE EXCEPTION 'runtime_role_contract_invalid';
    END IF;
    GRANT EXECUTE ON FUNCTION public.terminalize_legacy_expired_producer_run_v3_20(uuid,uuid,text,text,text)
      TO stockinsider_runtime_v319;
    GRANT EXECUTE ON FUNCTION public.reap_legacy_expired_producer_run_v3_20(text,text,text)
      TO stockinsider_runtime_v319;
  END IF;
END $runtime_role_reconciliation$;

REVOKE CREATE ON SCHEMA public FROM legacy_correctness_rpc_owner,opportunity_v3_rpc_owner;

DO $v320_terminalize_postconditions$
BEGIN
  IF NOT has_function_privilege('service_role',
    'public.terminalize_legacy_expired_producer_run_v3_20(uuid,uuid,text,text,text)','EXECUTE')
    OR NOT (SELECT pg_get_userbyid(proowner)='legacy_correctness_rpc_owner' AND prosecdef
      AND pg_get_functiondef(oid) LIKE '%run.lease_expires_at<v_now%'
      AND pg_get_functiondef(oid) LIKE '%job.lease_expires_at<v_now%'
      AND pg_get_functiondef(oid) LIKE '%failed_recoverable%'
      FROM pg_proc WHERE oid='public.terminalize_legacy_expired_producer_run_v3_20(uuid,uuid,text,text,text)'::regprocedure)
  THEN RAISE EXCEPTION 'v320_terminalize_postcondition_failed'; END IF;
  IF NOT public.verify_legacy_claim_delegation_chain_v3_20()
    OR has_function_privilege('service_role',
      'public.verify_legacy_claim_delegation_chain_v3_20()','EXECUTE')
  THEN RAISE EXCEPTION 'v320_claim_delegation_chain_failed'; END IF;
  IF NOT (SELECT pg_get_userbyid(proowner)='opportunity_v3_rpc_owner' AND prosecdef
      FROM pg_proc WHERE oid='public.append_legacy_expired_producer_diagnostic_v3_20(uuid,uuid,text,text,text,text,text,timestamptz)'::regprocedure)
    OR NOT has_function_privilege('legacy_correctness_rpc_owner',
      'public.append_legacy_expired_producer_diagnostic_v3_20(uuid,uuid,text,text,text,text,text,timestamptz)','EXECUTE')
    OR has_function_privilege('service_role',
      'public.append_legacy_expired_producer_diagnostic_v3_20(uuid,uuid,text,text,text,text,text,timestamptz)','EXECUTE')
  THEN RAISE EXCEPTION 'v320_expired_diagnostic_boundary_failed'; END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='stockinsider_runtime_v319')
    AND NOT has_function_privilege('stockinsider_runtime_v319',
      'public.terminalize_legacy_expired_producer_run_v3_20(uuid,uuid,text,text,text)','EXECUTE')
  THEN RAISE EXCEPTION 'runtime_role_reconciliation_failed'; END IF;
  IF NOT has_function_privilege('service_role',
    'public.reap_legacy_expired_producer_run_v3_20(text,text,text)','EXECUTE')
    OR NOT (SELECT pg_get_userbyid(proowner)='legacy_correctness_rpc_owner' AND prosecdef
      AND pg_get_functiondef(oid) LIKE '%lease_expired_identity_ambiguous%'
      AND pg_get_functiondef(oid) LIKE '%terminalize_legacy_expired_producer_run_v3_20%'
      FROM pg_proc WHERE oid='public.reap_legacy_expired_producer_run_v3_20(text,text,text)'::regprocedure)
  THEN RAISE EXCEPTION 'v320_reaper_postcondition_failed'; END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='stockinsider_runtime_v319')
    AND NOT has_function_privilege('stockinsider_runtime_v319',
      'public.reap_legacy_expired_producer_run_v3_20(text,text,text)','EXECUTE')
  THEN RAISE EXCEPTION 'runtime_reaper_role_reconciliation_failed'; END IF;
END $v320_terminalize_postconditions$;

COMMIT;
