-- SOURCE CANDIDATE ONLY; no installation/native acceptance implied.
-- Reuses the existing queue, command, policy, lease, parser and immutable facts.
-- Monthly resource enumeration is NEVER proof of 520 official sessions.
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='2s';
SELECT pg_advisory_xact_lock(64221022);
DO $preflight$
BEGIN
 IF to_regprocedure('public.vnext_launch_csv_backfill_plan_v1(text,uuid)') IS NOT NULL
 OR NOT EXISTS(SELECT FROM pg_proc p JOIN pg_class q ON q.oid='public.taiwan_data_refresh_queue_v5'::regclass
  WHERE p.oid=to_regprocedure('public.vnext_launch_csv_command_v1(text,uuid,text,jsonb,bytea)')
   AND p.proowner=q.relowner AND p.prosecdef
   AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')='50b89c7bac9800aab64fdddd54252b29979e4273a65614b8ab84b3943bcf23e7')
 OR NOT EXISTS(SELECT FROM pg_proc WHERE oid=to_regprocedure('public.vnext_launch_csv_policy_v1(text)')
  AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')='716933a64f639bbd47434b38cd31c86ef63d72826118c8936369003430b1510e')
 OR NOT EXISTS(SELECT FROM pg_proc WHERE oid=to_regprocedure('public.vnext_launch_csv_backend_v1(uuid,text,integer)')
  AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')='f6a677d18b1ba6a92f25b16ba62bf7c5cdb263dc7823329e5896ae09454b897a')
 THEN RAISE EXCEPTION 'launch_index_backfill_dependency_changed';END IF;
END $preflight$;

CREATE FUNCTION public.vnext_launch_csv_backfill_plan_v1(p_principal text,p_lease_owner uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC'
 SET statement_timeout='30s' SET lock_timeout='2s' AS $plan$
DECLARE at timestamptz; policy jsonb;backend jsonb;old_plan jsonb;through_day date;month_start date;
 market_name text;resource_key text;profile jsonb;old_keys text[]:=ARRAY[]::text[];all_keys text[]:=ARRAY[]::text[];
 attempted integer:=0;skipped integer:=0;index_count integer:=0;daily_count integer:=0;head record;compatible boolean;checked_at timestamptz;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'launch_csv_read_committed_required';END IF;
 -- Same lock order and exact owned backend as the unchanged command.
 PERFORM pg_advisory_xact_lock(610091002);PERFORM pg_advisory_xact_lock(2409,6002);PERFORM pg_advisory_xact_lock(64221022);
 at:=clock_timestamp();policy:=public.vnext_launch_csv_policy_v1(p_principal);backend:=public.vnext_launch_csv_backend_v1(p_lease_owner);
 IF backend->>'writerRelease' IS DISTINCT FROM policy->>'requiredWriterRelease' THEN RAISE EXCEPTION 'launch_csv_cutover_release_required';END IF;
 -- Reuse old current admission/defer semantics; never label an older day fresh.
 old_plan:=public.vnext_launch_csv_command_v1(p_principal,p_lease_owner,'enqueue-current','{}'::jsonb,NULL);
 at:=clock_timestamp();
 backend:=public.vnext_launch_csv_backend_v1(p_lease_owner);
 IF backend->>'writerRelease' IS DISTINCT FROM policy->>'requiredWriterRelease' OR NOT EXISTS(SELECT FROM public.vnext_source_policies_v1 rights_row
  WHERE rights_row.source='official' AND rights_row.scope='official_original' AND rights_row.enabled AND rights_row.valid_until>at
   AND encode(sha256(convert_to(public.vnext_catalog_canonical_v1(to_jsonb(rights_row)),'UTF8')),'hex')=policy->>'rightsBindingHash')
 THEN RAISE EXCEPTION 'launch_index_backfill_current_rights_required';END IF;
 IF old_plan->>'status'='no_active_pool' THEN
  RETURN jsonb_build_object('schemaVersion','licensed-launch-csv-plan-v3','status','no_active_pool','reason',NULL,'jobs',0,'session',NULL,
   'plannedAt',at,'scope',NULL,'currentPlanStatus','no_active_pool','currentReason',NULL,'indexResources',0,'skippedIndexResources',0,'sourceAuthority',false,'calendarAuthority',false);
 END IF;
 IF (SELECT count(*) FROM public.vnext_members_v1 WHERE state<>'exited') NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'launch_csv_active_pool_bound';END IF;
 SELECT session_date INTO through_day FROM public.vnext_sessions_v1
  WHERE completed AND close_at<=at AND session_date<=(at AT TIME ZONE 'Asia/Taipei')::date ORDER BY session_date DESC LIMIT 1;
 IF through_day IS NULL THEN
  RETURN jsonb_build_object('schemaVersion','licensed-launch-csv-plan-v3','status','deferred','reason','completed_session_unavailable','jobs',0,'session',NULL,
   'plannedAt',at,'scope',NULL,'currentPlanStatus','deferred','currentReason','awaiting_current_completed_session','indexResources',0,'skippedIndexResources',0,'sourceAuthority',false,'calendarAuthority',false);
 END IF;
 IF old_plan->>'status'='planned' THEN
  -- These resources really WERE attempted above. When current deferred, this
  -- set must stay empty: subtracting a hypothetical old240 set loses work.
  FOR market_name IN SELECT unnest(ARRAY['TWSE','TPEX']) LOOP
   FOR resource_key IN SELECT DISTINCT to_char(session_id,'YYYY-MM') FROM(
    SELECT session_id FROM(SELECT DISTINCT ON(session_id) session_id,status,close_at FROM public.tw_trading_sessions_v3
     WHERE market::text=market_name AND provider::text=lower(market_name) AND session_id<=through_day
      AND source_timestamp<=at AND collected_at<=at AND recorded_at<=at
     ORDER BY session_id,recorded_at DESC,session_authority_id) heads
    WHERE status::text='completed' AND close_at<=at ORDER BY session_id DESC LIMIT 240) days LOOP
    old_keys:=array_append(old_keys,market_name||':'||resource_key);
   END LOOP;
  END LOOP;
  attempted:=(old_plan->>'jobs')::integer;daily_count:=attempted-cardinality(old_keys);
 ELSIF old_plan->>'status'<>'deferred' OR old_plan->>'reason'<>'awaiting_current_completed_session' THEN
  RAISE EXCEPTION 'launch_index_backfill_current_plan_invalid';
 END IF;
 month_start:=date_trunc('month',through_day)::date;
 -- Fixed36 INCLUDES the through month:35 prior month resources + this month.
 SELECT array_agg(key ORDER BY key) INTO all_keys FROM(
  SELECT unnest(old_keys) key UNION
  SELECT venue||':'||to_char(month_start-make_interval(months=>offset_number),'YYYY-MM')
   FROM unnest(ARRAY['TWSE','TPEX']) venue CROSS JOIN generate_series(0,35) offset_number
 ) resources;
 index_count:=cardinality(all_keys);
 IF daily_count<0 OR daily_count+index_count>200 THEN RAISE EXCEPTION 'launch_csv_plan_bound';END IF;
 FOREACH resource_key IN ARRAY all_keys LOOP
  IF resource_key=ANY(old_keys) THEN CONTINUE;END IF;
  checked_at:=clock_timestamp();backend:=public.vnext_launch_csv_backend_v1(p_lease_owner);
  IF backend->>'writerRelease' IS DISTINCT FROM policy->>'requiredWriterRelease' OR NOT EXISTS(SELECT FROM public.vnext_source_policies_v1 rights_row
   WHERE rights_row.source='official' AND rights_row.scope='official_original' AND rights_row.enabled AND rights_row.valid_until>checked_at
    AND encode(sha256(convert_to(public.vnext_catalog_canonical_v1(to_jsonb(rights_row)),'UTF8')),'hex')=policy->>'rightsBindingHash')
  THEN RAISE EXCEPTION 'launch_index_backfill_current_rights_required';END IF;
  market_name:=split_part(resource_key,':',1);resource_key:=split_part(resource_key,':',2);
  profile:=public.vnext_launch_csv_profile_v1(CASE WHEN market_name='TWSE' THEN 11755 ELSE 11391 END,resource_key);
  -- Pick the latest RESOURCE head before compatibility/ready filtering. An
  -- incompatible, failed or unacknowledged new head cannot resurrect old ready.
  SELECT b.job_id,b.source_url,b.profile_version,b.binding_hash,b.capture_generation,b.created_at head_binding_at,
   c.capture_id,c.dataset_id,c.request_key,c.source_url capture_url,c.provider,c.parser_version,c.header_hash,c.coverage,c.rights_binding_hash,
   c.observed_at,c.recorded_at,c.available_at,a.recorded_at ack_at,o.outcome,q.status queue_status,q.terminal_result
  INTO head FROM public.vnext_launch_csv_bindings_v1 b
  LEFT JOIN LATERAL(SELECT * FROM public.vnext_launch_csv_attempts_v1 t WHERE t.job_id=b.job_id ORDER BY attempt_order DESC LIMIT 1) t ON true
  LEFT JOIN public.vnext_launch_csv_outcomes_v1 o ON o.attempt_id=t.attempt_id
  LEFT JOIN public.vnext_launch_csv_captures_v1 c ON c.capture_id=o.capture_id
  LEFT JOIN public.vnext_launch_csv_ready_acks_v1 a ON a.capture_id=c.capture_id
  JOIN public.taiwan_data_refresh_queue_v5 q ON q.job_id=b.job_id
  WHERE b.dataset_id=(profile->>'datasetId')::integer AND b.request_key=resource_key AND b.created_at<=at
  ORDER BY b.capture_generation DESC,b.created_at DESC,b.job_id DESC LIMIT 1;
  IF EXISTS(SELECT FROM public.vnext_launch_csv_bindings_v1 other WHERE other.dataset_id=(profile->>'datasetId')::integer
   AND other.request_key=resource_key AND other.capture_generation=head.capture_generation AND other.created_at=head.head_binding_at
   AND other.job_id<>head.job_id) THEN RAISE EXCEPTION 'launch_index_backfill_resource_head_conflict';END IF;
  compatible:=head.capture_id IS NOT NULL AND head.outcome='complete' AND head.queue_status='terminal'
   AND head.terminal_result->>'captureId'=head.capture_id::text AND head.profile_version='licensed-launch-csv-v1'
   AND head.source_url=profile->>'sourceUrl' AND head.capture_url=head.source_url
   AND head.binding_hash=public.vnext_launch_csv_hash_v1(jsonb_build_array('licensed-launch-csv-binding-v1',profile,head.capture_generation))
   AND head.dataset_id=(profile->>'datasetId')::integer AND head.request_key=resource_key
   AND head.provider=profile->>'provider' AND head.parser_version='licensed-launch-csv-sql-v1'
   AND head.header_hash=public.vnext_launch_csv_hash_v1(profile->'header') AND head.coverage=profile->>'coverage'
   AND head.rights_binding_hash=policy->>'rightsBindingHash'
   AND head.ack_at IS NOT NULL AND head.ack_at>=head.recorded_at AND head.observed_at<=head.recorded_at AND head.recorded_at<=head.available_at
   AND greatest(head.available_at,head.ack_at)<=at
   -- Closed-month observation must actually follow that month. This month's
   -- response must follow the latest completed reference, with today's capture
   -- generation; neither condition certifies every unobserved calendar day.
   AND CASE WHEN resource_key<to_char(month_start,'YYYY-MM') THEN
     head.observed_at>=(((resource_key||'-01')::date+interval '1 month') AT TIME ZONE 'Asia/Taipei')
    ELSE head.capture_generation=(at AT TIME ZONE 'Asia/Taipei')::date AND head.observed_at>=(SELECT close_at FROM public.vnext_sessions_v1 WHERE session_date=through_day) END
   AND EXISTS(SELECT FROM public.vnext_launch_csv_facts_v1 f WHERE f.capture_id=head.capture_id AND f.symbol='INDEX'
    AND to_char(f.session_date,'YYYY-MM')=resource_key AND f.raw_close>0 AND f.raw_open>0 AND f.raw_high>=f.raw_close AND f.raw_low<=f.raw_close)
   -- Actual selected completed facts must exist, not merely a row count.
   AND NOT EXISTS(SELECT FROM(SELECT DISTINCT ON(session_id) session_id,status,close_at FROM public.tw_trading_sessions_v3
    WHERE market::text=market_name AND provider::text=lower(market_name) AND to_char(session_id,'YYYY-MM')=resource_key
     AND session_id<=through_day AND source_timestamp<=at AND collected_at<=at AND recorded_at<=at
    ORDER BY session_id,recorded_at DESC,session_authority_id) expected
    WHERE expected.status::text='completed' AND expected.close_at<=at AND NOT EXISTS(SELECT FROM public.vnext_launch_csv_facts_v1 f
     WHERE f.capture_id=head.capture_id AND f.symbol='INDEX' AND f.session_date=expected.session_id AND f.raw_close>0));
  IF compatible THEN skipped:=skipped+1;CONTINUE;END IF;
  PERFORM public.vnext_launch_csv_command_v1(p_principal,p_lease_owner,'enqueue',
   jsonb_build_object('datasetId',(profile->>'datasetId')::integer,'requestKey',resource_key),NULL);
  attempted:=attempted+1;
  IF attempted>200 THEN RAISE EXCEPTION 'launch_csv_plan_bound';END IF;
 END LOOP;
 checked_at:=clock_timestamp();backend:=public.vnext_launch_csv_backend_v1(p_lease_owner);
 IF backend->>'writerRelease' IS DISTINCT FROM policy->>'requiredWriterRelease' OR NOT EXISTS(SELECT FROM public.vnext_source_policies_v1 rights_row
  WHERE rights_row.source='official' AND rights_row.scope='official_original' AND rights_row.enabled AND rights_row.valid_until>checked_at
   AND encode(sha256(convert_to(public.vnext_catalog_canonical_v1(to_jsonb(rights_row)),'UTF8')),'hex')=policy->>'rightsBindingHash')
 THEN RAISE EXCEPTION 'launch_index_backfill_current_rights_required';END IF;
 RETURN jsonb_build_object('schemaVersion','licensed-launch-csv-plan-v3','status',CASE WHEN attempted=0 THEN 'already_acquired' ELSE 'planned' END,
  'reason',NULL,'jobs',attempted,'session',through_day,'plannedAt',at,'scope',CASE WHEN old_plan->>'status'='planned' THEN 'current_and_history' ELSE 'history_only' END,
  'currentPlanStatus',old_plan->>'status','currentReason',old_plan->'reason','indexResources',index_count,'skippedIndexResources',skipped,
  'sourceAuthority',false,'calendarAuthority',false);
END $plan$;
DO $owner$
DECLARE command_owner text;
BEGIN
 SELECT pg_get_userbyid(proowner) INTO command_owner FROM pg_proc
  WHERE oid='public.vnext_launch_csv_command_v1(text,uuid,text,jsonb,bytea)'::regprocedure;
 EXECUTE format('ALTER FUNCTION public.vnext_launch_csv_backfill_plan_v1(text,uuid) OWNER TO %I',command_owner);
END $owner$;
REVOKE ALL ON FUNCTION public.vnext_launch_csv_backfill_plan_v1(text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.vnext_launch_csv_backfill_plan_v1(text,uuid) TO service_role;
COMMIT;
