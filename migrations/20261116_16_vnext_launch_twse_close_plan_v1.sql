-- Use the established source scheduler and its existing writer lease.
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='2s';
SELECT pg_advisory_xact_lock(610091002);
SELECT pg_advisory_xact_lock(2409,6002);
SELECT pg_advisory_xact_lock(64221022);

CREATE INDEX vnext_launch_twse_close_request_head_v1
 ON public.vnext_launch_csv_bindings_v1(request_key,capture_generation DESC,created_at DESC,job_id DESC) WHERE dataset_id=11764;

-- Selection is as of the requested cutoff. A newer failed or unacknowledged
-- acquisition remains a gap. It cannot reactivate an older ready capture.
CREATE FUNCTION public.vnext_launch_twse_close_committed_v1(
 p_report_day date,cutoff timestamptz,p_session_id uuid,p_roster_hash text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC' AS $committed$
DECLARE profile jsonb; rights_hash text; calendar_rows jsonb; session_row jsonb; answer jsonb;
BEGIN
 IF p_report_day IS NULL OR cutoff IS NULL OR NOT isfinite(cutoff) OR cutoff>statement_timestamp()
  OR p_session_id IS NULL OR p_roster_hash IS NULL OR p_roster_hash!~'^[a-f0-9]{64}$' THEN RETURN NULL;END IF;
 profile:=public.vnext_launch_csv_profile_v1(11764,p_report_day::text);
 IF cutoff<(profile->>'catalogKnownAt')::timestamptz THEN RETURN NULL;END IF;
 SELECT public.vnext_launch_csv_hash_v1(jsonb_build_array('twse-11764-private-close-purpose-v1',
  public.vnext_launch_twse_close_profile_v1(p_report_day),to_jsonb(p))) INTO rights_hash
 FROM public.vnext_source_policies_v1 p
 WHERE p.source='official' AND p.scope='official_original' AND p.enabled AND p.valid_until>statement_timestamp();
 IF rights_hash IS NULL THEN RETURN NULL;END IF;
 calendar_rows:=public.vnext_launch_today_calendar_internal_v1(p_report_day,statement_timestamp());
 SELECT value INTO session_row FROM jsonb_array_elements(calendar_rows) WHERE value->>'market'='TWSE'
 ORDER BY (value->>'recorded_at')::timestamptz DESC,value->>'session_authority_id' LIMIT 1;
 IF session_row->>'status' IS DISTINCT FROM 'completed' OR session_row->>'provider' IS DISTINCT FROM 'twse'
  OR session_row->>'session_authority_id' IS DISTINCT FROM p_session_id::text
  OR session_row->>'close_at' IS NULL OR (session_row->>'close_at')::timestamptz>cutoff
  OR EXISTS(SELECT FROM jsonb_array_elements(calendar_rows) WHERE value->>'market'='TWSE' AND value->>'recorded_at'=session_row->>'recorded_at'
   AND value-'session_authority_id' IS DISTINCT FROM session_row-'session_authority_id') THEN RETURN NULL;END IF;

 WITH head AS MATERIALIZED (
  SELECT b.* FROM public.vnext_launch_csv_bindings_v1 b
  WHERE b.dataset_id=11764 AND b.request_key=p_report_day::text AND b.created_at<=cutoff
  ORDER BY b.capture_generation DESC,b.created_at DESC,b.job_id DESC LIMIT 1
 )
 SELECT jsonb_build_object('session',p_report_day,'sessionAuthorityId',s.session_authority_id,'rosterHash',s.roster_hash,
  'captureId',c.capture_id,'artifactHash',c.artifact_hash,'ackId',a.ack_id,'observedAt',c.observed_at,
  'knownAt',greatest(c.available_at,a.recorded_at),'rightsRevision',c.rights_binding_hash,'closeFactCount',s.fact_count,
  'rosterCount',s.roster_count,'captureCalendarRevision',s.calendar_revision)
 INTO answer FROM head b
 JOIN public.taiwan_data_refresh_queue_v5 q ON q.job_id=b.job_id
 JOIN LATERAL (SELECT t.* FROM public.vnext_launch_csv_attempts_v1 t
  WHERE t.job_id=b.job_id AND t.started_at<=cutoff ORDER BY t.attempt_order DESC LIMIT 1) t ON true
 JOIN public.vnext_launch_csv_outcomes_v1 o ON o.attempt_id=t.attempt_id AND o.outcome='complete' AND o.recorded_at<=cutoff
 JOIN public.vnext_launch_csv_captures_v1 c ON c.capture_id=o.capture_id AND c.attempt_id=t.attempt_id
 JOIN public.vnext_launch_csv_ready_acks_v1 a ON a.capture_id=c.capture_id
 JOIN public.vnext_launch_twse_close_scope_v1 s ON s.capture_id=c.capture_id
 WHERE b.profile_version='licensed-launch-csv-v1' AND b.source_url=profile->>'sourceUrl'
  AND b.binding_hash=public.vnext_launch_csv_hash_v1(jsonb_build_array('licensed-launch-csv-binding-v1',profile,b.capture_generation))
  AND NOT EXISTS(SELECT FROM public.vnext_launch_csv_bindings_v1 other WHERE other.dataset_id=11764
   AND other.request_key=b.request_key AND other.capture_generation=b.capture_generation AND other.created_at=b.created_at AND other.job_id<>b.job_id)
  AND q.status='terminal' AND q.terminal_status='complete' AND q.terminal_result->>'captureId'=c.capture_id::text AND q.completed_at<=cutoff
  AND c.dataset_id=11764 AND c.request_key=b.request_key AND c.source_url=b.source_url AND c.provider='twse'
  AND c.parser_version='licensed-launch-csv-sql-v1' AND c.header_hash=public.vnext_launch_csv_hash_v1(profile->'header')
  AND c.coverage=profile->>'coverage' AND c.rights_binding_hash=rights_hash
  AND c.observed_at>=greatest((session_row->>'close_at')::timestamptz,t.started_at)
  AND c.observed_at<=s.selection_cutoff AND s.selection_cutoff<=s.prepared_at AND s.prepared_at<=c.recorded_at
  AND c.observed_at<=c.recorded_at AND c.recorded_at<=c.available_at
  AND a.recorded_at>=c.recorded_at AND greatest(a.recorded_at,c.available_at)<=cutoff
  AND s.report_day=p_report_day AND s.selection_day=b.capture_generation
  AND s.roster_hash=p_roster_hash AND s.roster_hash=c.pool_revision AND s.session_authority_id=p_session_id
  AND s.fact_count=(SELECT count(*) FROM public.vnext_launch_twse_close_facts_v1 f WHERE f.capture_id=c.capture_id);
 RETURN answer;
END $committed$;

CREATE FUNCTION public.vnext_launch_twse_close_plan_v1(
 p_principal text,p_lease_owner uuid,p_day date,p_remaining integer
) RETURNS integer LANGUAGE plpgsql SET search_path=pg_catalog,public SET timezone='UTC' AS $close_plan$
DECLARE at timestamptz; calendar jsonb; roster jsonb; session_row jsonb; report_day date; report_session_id uuid;
 available integer; added integer:=0; result jsonb;
BEGIN
 IF p_remaining IS NULL OR p_remaining NOT BETWEEN 0 AND 200 THEN RAISE EXCEPTION 'launch_twse_close_plan_bound';END IF;
 IF p_remaining=0 THEN RETURN 0;END IF;
 -- The outer plan holds these locks. Keep the same order for private tests and
 -- callers, and measure the actual remaining capacity after index planning.
 PERFORM pg_advisory_xact_lock(610091002);PERFORM pg_advisory_xact_lock(2409,6002);PERFORM pg_advisory_xact_lock(64221022);
 at:=statement_timestamp();
 IF p_day IS DISTINCT FROM (clock_timestamp() AT TIME ZONE 'Asia/Taipei')::date
  OR p_day IS DISTINCT FROM (at AT TIME ZONE 'Asia/Taipei')::date
  OR NOT EXISTS(SELECT FROM public.vnext_sessions_v1 WHERE session_date=p_day AND completed AND close_at<=at) THEN RETURN 0;END IF;
 SELECT least(p_remaining,200-count(*),30-count(*) FILTER(WHERE dataset_id=11764)) INTO available
 FROM public.vnext_launch_csv_bindings_v1 WHERE capture_generation=p_day;
 IF available<=0 THEN RETURN 0;END IF;
 calendar:=public.vnext_launch_calendar_v1('TWSE',p_day,at,240);
 roster:=public.vnext_launch_breadth_roster_v1(p_day,at);
 IF roster IS NULL OR jsonb_array_length(calendar->'sessions') IS DISTINCT FROM 240
  OR calendar->'sessions'->-1->>'session_id' IS DISTINCT FROM p_day::text THEN RETURN 0;END IF;

 FOR session_row IN SELECT value FROM jsonb_array_elements(calendar->'sessions') WITH ORDINALITY r(value,ordinal)
  WHERE ordinal>210 ORDER BY ordinal DESC LOOP
  EXIT WHEN added>=available OR (clock_timestamp() AT TIME ZONE 'Asia/Taipei')::date IS DISTINCT FROM p_day;
  report_day:=(session_row->>'session_id')::date;
  report_session_id:=(session_row->>'session_authority_id')::uuid;
  IF report_session_id IS NULL OR EXISTS(SELECT FROM public.vnext_launch_csv_bindings_v1 b
   WHERE b.dataset_id=11764 AND b.request_key=report_day::text AND b.capture_generation=p_day) THEN CONTINUE;END IF;
  IF public.vnext_launch_twse_close_committed_v1(report_day,at,report_session_id,roster->>'rosterManifestHash') IS NOT NULL THEN CONTINUE;END IF;
  result:=public.vnext_launch_csv_command_v1(p_principal,p_lease_owner,'enqueue',
   jsonb_build_object('datasetId',11764,'requestKey',report_day::text),NULL);
  IF result->>'bound' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'launch_twse_close_plan_not_bound';END IF;
  IF result->>'replay'='false' THEN added:=added+1;END IF;
 END LOOP;
 RETURN added;
END $close_plan$;

DO $close_owners$
DECLARE signature text; command_owner text;
BEGIN
 SELECT pg_get_userbyid(proowner) INTO command_owner FROM pg_proc
 WHERE oid='public.vnext_launch_csv_command_v1(text,uuid,text,jsonb,bytea)'::regprocedure;
 FOREACH signature IN ARRAY ARRAY['vnext_launch_twse_close_committed_v1(date,timestamptz,uuid,text)',
  'vnext_launch_twse_close_plan_v1(text,uuid,date,integer)'] LOOP
  EXECUTE 'ALTER FUNCTION public.'||signature||' OWNER TO stockinsider_vnext_owner';
  EXECUTE 'REVOKE ALL ON FUNCTION public.'||signature||' FROM PUBLIC,anon,authenticated,service_role';
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO %I',signature,command_owner);
 END LOOP;
 EXECUTE format('ALTER FUNCTION public.vnext_launch_twse_close_committed_v1(date,timestamptz,uuid,text) OWNER TO %I',command_owner);
 GRANT EXECUTE ON FUNCTION public.vnext_launch_twse_close_committed_v1(date,timestamptz,uuid,text) TO stockinsider_vnext_owner;
END $close_owners$;

DO $apply$
DECLARE target oid:=to_regprocedure('public.vnext_launch_csv_backfill_plan_v1(text,uuid)');
 original text; definition text; metadata jsonb; changed text; seam record;
BEGIN
 SELECT prosrc,pg_get_functiondef(oid),to_jsonb(p)-'prosrc' INTO original,definition,metadata FROM pg_proc p WHERE oid=target;
 IF encode(sha256(convert_to(original,'UTF8')),'hex') IS DISTINCT FROM '57ff7bcb862a91c9355d63c0a0f72dafac3bd0663cd738c1f54a13bb00d51280'
 THEN RAISE EXCEPTION 'launch_twse_close_plan_predecessor_changed';END IF;
 changed:=original;
 FOR seam IN SELECT * FROM (VALUES
 ($b0$attempted integer:=0;skipped integer:=0;$b0$,$a0$attempted integer:=0;twse_close_jobs integer:=0;skipped integer:=0;$a0$),
 ($b1$ RETURN jsonb_build_object('schemaVersion','licensed-launch-csv-plan-v3','status',CASE WHEN attempted=0 THEN 'already_acquired' ELSE 'planned' END,
  'reason',NULL,'jobs',attempted,$b1$,$a1$ IF old_plan->>'status'='planned' THEN
  twse_close_jobs:=public.vnext_launch_twse_close_plan_v1(p_principal,p_lease_owner,through_day,200-attempted);
 END IF;
 RETURN jsonb_build_object('schemaVersion','licensed-launch-csv-plan-v3','status',CASE WHEN attempted=0 THEN 'already_acquired' ELSE 'planned' END,
  'reason',NULL,'jobs',attempted+twse_close_jobs,$a1$),
 ($b2$  'sourceAuthority',false,'calendarAuthority',false);
END $b2$,$a2$  'sourceAuthority',false,'calendarAuthority',false)
  ||CASE WHEN twse_close_jobs>0 THEN jsonb_build_object('twseCloseJobs',twse_close_jobs) ELSE '{}'::jsonb END;
END $a2$)
 ) patches(before_text,after_text) LOOP
  changed:=replace(changed,seam.before_text,seam.after_text);
 END LOOP;
 IF encode(sha256(convert_to(changed,'UTF8')),'hex') IS DISTINCT FROM '5f585de5ecf46625abd5c4121fb932c8999b6d1c619beb152ba12ad48e8e114a'
 THEN RAISE EXCEPTION 'launch_twse_close_plan_successor_changed';END IF;
 EXECUTE replace(definition,original,changed);
 IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE oid=target) IS DISTINCT FROM metadata
 THEN RAISE EXCEPTION 'launch_twse_close_plan_metadata_changed';END IF;
END $apply$;
-- Reserve 11764 for the licensed worker. A previous day's pending binding
-- stays auditable but cannot use a fresh day's network or writer allocation.
CREATE FUNCTION public.vnext_launch_twse_close_bound_v1(p_job_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $bound$
 SELECT EXISTS(SELECT FROM public.vnext_launch_csv_bindings_v1 b WHERE b.job_id=p_job_id AND b.dataset_id=11764)
$bound$;
ALTER FUNCTION public.vnext_launch_twse_close_bound_v1(uuid) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_launch_twse_close_bound_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;
DO $legacy_acl$
DECLARE claim_owner text;
BEGIN
 SELECT pg_get_userbyid(proowner) INTO claim_owner FROM pg_proc
 WHERE oid='public.claim_taiwan_data_refresh_jobs_v6(integer,text,timestamptz,timestamptz,date,text)'::regprocedure;
 EXECUTE format('GRANT EXECUTE ON FUNCTION public.vnext_launch_twse_close_bound_v1(uuid) TO %I',claim_owner);
END $legacy_acl$;

DO $claim_update_0$
DECLARE target oid:=to_regprocedure('public.vnext_launch_csv_command_v1(text,uuid,text,jsonb,bytea)');
 original text; definition text; metadata jsonb; changed text; seam record;
BEGIN
 SELECT prosrc,pg_get_functiondef(oid),to_jsonb(p)-'prosrc' INTO original,definition,metadata FROM pg_proc p WHERE oid=target;
 IF encode(sha256(convert_to(original,'UTF8')),'hex') IS DISTINCT FROM 'b0de5782c8099e71a1d1492e7c602dcf36ad469a1e0aff5705020d7654dc2d93'
 THEN RAISE EXCEPTION 'launch_twse_close_claim_predecessor_changed:vnext_launch_csv_command_v1';END IF;
 changed:=original;
 FOR seam IN SELECT * FROM(VALUES
  ($b0$   WHERE q.attempts<3 AND ((q.status=$b0$,$a0$   WHERE q.attempts<3 AND (b.dataset_id<>11764 OR b.capture_generation=(at AT TIME ZONE 'Asia/Taipei')::date)
    AND ((q.status=$a0$),
  ($b1$   ORDER BY q.queued_at,q.job_id FOR UPDATE$b1$,$a1$   ORDER BY CASE WHEN b.dataset_id=11764 AND b.request_key=((at AT TIME ZONE 'Asia/Taipei')::date)::text THEN 0 ELSE 1 END,
    q.queued_at,q.job_id FOR UPDATE$a1$),
  ($b2$  IF binding.job_id IS NULL OR job.status<>'running'$b2$,$a2$  IF binding.job_id IS NULL OR binding.dataset_id=11764 OR job.status<>'running'$a2$)
 ) patches(before_text,after_text) LOOP
  changed:=replace(changed,seam.before_text,seam.after_text);
 END LOOP;
 IF encode(sha256(convert_to(changed,'UTF8')),'hex') IS DISTINCT FROM 'a39fafc4baaecbc22351628596485033e4d03a64051e0562877956b5a8586933'
 THEN RAISE EXCEPTION 'launch_twse_close_claim_successor_changed:vnext_launch_csv_command_v1';END IF;
 EXECUTE replace(definition,original,changed);
 IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE oid=target) IS DISTINCT FROM metadata
 THEN RAISE EXCEPTION 'launch_twse_close_claim_metadata_changed:vnext_launch_csv_command_v1';END IF;
END $claim_update_0$;

DO $claim_update_1$
DECLARE target oid:=to_regprocedure('public.claim_taiwan_data_refresh_jobs_v6(integer,text,timestamptz,timestamptz,date,text)');
 original text; definition text; metadata jsonb; changed text; seam record;
BEGIN
 SELECT prosrc,pg_get_functiondef(oid),to_jsonb(p)-'prosrc' INTO original,definition,metadata FROM pg_proc p WHERE oid=target;
 IF encode(sha256(convert_to(original,'UTF8')),'hex') IS DISTINCT FROM '73e4fcf67f736b3d57b17b1f098a6207f5375393023dd0b78acc14f438859fc0'
 THEN RAISE EXCEPTION 'launch_twse_close_claim_predecessor_changed:claim_taiwan_data_refresh_jobs_v6';END IF;
 changed:=original;
 FOR seam IN SELECT * FROM(VALUES
  ($b0$    WHERE queue.attempts<20 AND$b0$,$a0$    WHERE queue.attempts<20 AND NOT public.vnext_launch_twse_close_bound_v1(queue.job_id) AND$a0$)
 ) patches(before_text,after_text) LOOP
  changed:=replace(changed,seam.before_text,seam.after_text);
 END LOOP;
 IF encode(sha256(convert_to(changed,'UTF8')),'hex') IS DISTINCT FROM 'da389e2baf6ff7f8cb14ec706125d46363b7d7508cbd5987013d5f9855827624'
 THEN RAISE EXCEPTION 'launch_twse_close_claim_successor_changed:claim_taiwan_data_refresh_jobs_v6';END IF;
 EXECUTE replace(definition,original,changed);
 IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE oid=target) IS DISTINCT FROM metadata
 THEN RAISE EXCEPTION 'launch_twse_close_claim_metadata_changed:claim_taiwan_data_refresh_jobs_v6';END IF;
END $claim_update_1$;

COMMIT;
