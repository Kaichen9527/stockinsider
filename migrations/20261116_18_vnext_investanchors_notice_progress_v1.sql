-- Reuse the private vNext audit ledger for Gmail receiver progress.
-- A mailbox receipt is separate from contents, extraction and research.
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='2s';
SELECT pg_advisory_xact_lock(64221022);

CREATE INDEX vnext_audit_investanchors_notice_day_v1
 ON public.vnext_audit_v1(principal,(request->>'mailboxDay'),id DESC)
 WHERE command='investanchors-notice-progress';
CREATE INDEX vnext_audit_investanchors_notice_processing_v1
 ON public.vnext_audit_v1((request->>'processingDay'))
 WHERE command='investanchors-notice-progress';

CREATE FUNCTION public.vnext_investanchors_notice_progress_v1(
 p_principal text,p_lease_owner uuid,p_day date,p_progress jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
 SET timezone='UTC' SET statement_timeout='30s' SET lock_timeout='2s' AS $notice$
DECLARE now_at timestamptz; processing_day date; start_at timestamptz;end_at timestamptz;
 before_row public.vnext_audit_v1;after_id bigint;checked jsonb; requested_hash text;
 article_total integer;article_source integer;notice_reads integer;available integer;
 keys integer;waiting integer;rejected integer;no_article_authority constant boolean:=false;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'investanchors_progress_read_committed';END IF;
 PERFORM pg_advisory_xact_lock(610091002);
 PERFORM pg_advisory_xact_lock(2409,6002);
 PERFORM pg_advisory_xact_lock(64221022);
 IF NOT EXISTS(SELECT FROM public.vnext_mode_v1 WHERE enabled AND legacy_fenced)
  OR NOT EXISTS(SELECT FROM public.vnext_principals_v1 WHERE principal=p_principal AND role='operator' AND enabled)
  THEN RAISE EXCEPTION 'investanchors_progress_operator_required';END IF;
 PERFORM public.vnext_launch_csv_backend_v1(p_lease_owner);
 now_at:=clock_timestamp();
 processing_day:=(now_at AT TIME ZONE 'Asia/Taipei')::date;
 IF p_day IS NULL OR p_day NOT BETWEEN processing_day-30 AND processing_day THEN RAISE EXCEPTION 'investanchors_progress_day_invalid';END IF;
 start_at:=p_day::timestamp AT TIME ZONE 'Asia/Taipei';
 end_at:=(p_day+1)::timestamp AT TIME ZONE 'Asia/Taipei';

 SELECT * INTO before_row FROM public.vnext_audit_v1
 WHERE command='investanchors-notice-progress' AND principal=p_principal AND request->>'mailboxDay'=p_day::text
 ORDER BY id DESC LIMIT 1;
 SELECT coalesce(jsonb_agg(DISTINCT item.value ORDER BY item.value),'[]'::jsonb) INTO checked
 FROM public.vnext_audit_v1 a CROSS JOIN LATERAL jsonb_array_elements_text(a.result->'checkedKeys') item(value)
 WHERE a.command='investanchors-notice-progress' AND a.principal=p_principal AND a.request->>'mailboxDay'=p_day::text;
 IF jsonb_array_length(checked)>500 THEN RAISE EXCEPTION 'investanchors_progress_inventory_bound';END IF;

 SELECT count(*),count(*) FILTER(WHERE source='investanchors') INTO article_total,article_source
 FROM (SELECT content_hash,source FROM public.vnext_content_v1 WHERE processing_date=processing_day
  UNION SELECT content_hash,source FROM public.vnext_extractions_v1 WHERE processing_date=processing_day) reads;
 SELECT coalesce(sum(jsonb_array_length(result->'checkedKeys')),0) INTO notice_reads FROM public.vnext_audit_v1
 WHERE command='investanchors-notice-progress' AND request->>'processingDay'=processing_day::text;
 available:=greatest(0,least(50-article_source-notice_reads,200-article_total-notice_reads));

 IF p_progress IS NULL THEN
  RETURN jsonb_build_object('progressId',before_row.id::text,'checkedKeys',checked,'readBudget',available,
   'checkpointDay',CASE WHEN before_row.result->>'scanStatus'='scanned' THEN p_day ELSE NULL END,
   'articleAuthority',no_article_authority);
 END IF;
 IF jsonb_typeof(p_progress) IS DISTINCT FROM 'object' OR octet_length(p_progress::text)>32768
  OR (SELECT count(*) FROM jsonb_object_keys(p_progress))<>6
  OR NOT(p_progress ?& ARRAY['baseProgressId','scanStatus','checkedKeys','notices','deferred','rejected'])
  OR (p_progress->'baseProgressId'<>'null'::jsonb AND (jsonb_typeof(p_progress->'baseProgressId')<>'string' OR coalesce(p_progress->>'baseProgressId','')!~'^[1-9][0-9]{0,18}$'))
  OR coalesce(p_progress->>'scanStatus','') NOT IN('scanned','open_day','deferred')
  OR jsonb_typeof(p_progress->'checkedKeys') IS DISTINCT FROM 'array' OR jsonb_typeof(p_progress->'notices') IS DISTINCT FROM 'array'
  OR jsonb_typeof(p_progress->'deferred') IS DISTINCT FROM 'number' OR coalesce(p_progress->>'deferred','')!~'^[0-9]{1,3}$'
  OR jsonb_typeof(p_progress->'rejected') IS DISTINCT FROM 'number' OR coalesce(p_progress->>'rejected','')!~'^[0-9]{1,2}$'
 THEN RAISE EXCEPTION 'investanchors_progress_shape';END IF;
 requested_hash:=public.vnext_launch_csv_hash_v1(jsonb_build_array('investanchors-notice-progress-v1',p_day,p_progress));
 IF before_row.request->>'progressHash'=requested_hash THEN
  RETURN jsonb_build_object('progressId',before_row.id::text,'replay',true,'articleAuthority',no_article_authority);
 END IF;
 IF p_progress->>'baseProgressId' IS DISTINCT FROM before_row.id::text THEN RAISE EXCEPTION 'investanchors_progress_stale';END IF;
 keys:=jsonb_array_length(p_progress->'checkedKeys');
 waiting:=(p_progress->>'deferred')::integer;
 rejected:=(p_progress->>'rejected')::integer;
 IF keys>available OR keys+jsonb_array_length(checked)>500
  OR waiting>500 OR rejected+jsonb_array_length(p_progress->'notices')>keys
  OR (p_progress->>'scanStatus'='deferred') IS DISTINCT FROM (waiting>0)
  OR (p_progress->>'scanStatus'='scanned' AND (p_day>=processing_day OR waiting<>0))
  OR (before_row.result->>'scanStatus'='scanned' AND p_progress->>'scanStatus'='open_day')
  OR EXISTS(SELECT FROM jsonb_array_elements(p_progress->'checkedKeys') k(value)
   WHERE jsonb_typeof(k.value)<>'string' OR (k.value#>>'{}')!~'^[a-f0-9]{64}$' OR checked ? (k.value#>>'{}'))
  OR (SELECT count(DISTINCT k.value) FROM jsonb_array_elements(p_progress->'checkedKeys') k(value))<>keys
 THEN RAISE EXCEPTION 'investanchors_progress_bounds';END IF;
 IF EXISTS(
  SELECT FROM jsonb_array_elements(p_progress->'notices') n(value)
  WHERE jsonb_typeof(n.value) IS DISTINCT FROM 'object'
 ) THEN RAISE EXCEPTION 'investanchors_notice_shape';END IF;
 IF EXISTS(
  SELECT FROM jsonb_array_elements(p_progress->'notices') n(value)
  WHERE (SELECT count(*) FROM jsonb_object_keys(n.value))<>6
   OR NOT(n.value ?& ARRAY['noticeKey','receivedAt','observedAt','subjectKey','articleKey','status'])
   OR jsonb_typeof(n.value->'noticeKey') IS DISTINCT FROM 'string'
   OR jsonb_typeof(n.value->'subjectKey') IS DISTINCT FROM 'string'
   OR coalesce(n.value->>'noticeKey','')!~'^[a-f0-9]{64}$'
   OR coalesce(n.value->>'subjectKey','')!~'^[a-f0-9]{64}$'
   OR NOT(p_progress->'checkedKeys' ? (n.value->>'noticeKey'))
   OR coalesce(n.value->>'status','') NOT IN('awaiting_member_article','awaiting_article_resolution','notice_content_unavailable')
   OR (n.value->>'status'='awaiting_member_article' AND (jsonb_typeof(n.value->'articleKey') IS DISTINCT FROM 'string'
    OR coalesce(n.value->>'articleKey','')!~'^[a-f0-9]{64}$'))
   OR (n.value->>'status'<>'awaiting_member_article' AND n.value->'articleKey' IS DISTINCT FROM 'null'::jsonb)
   OR jsonb_typeof(n.value->'receivedAt') IS DISTINCT FROM 'string' OR jsonb_typeof(n.value->'observedAt') IS DISTINCT FROM 'string'
   OR coalesce(n.value->>'receivedAt','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$'
   OR coalesce(n.value->>'observedAt','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$'
   OR (n.value->>'receivedAt')::timestamptz<start_at OR (n.value->>'receivedAt')::timestamptz>=end_at
   OR (n.value->>'observedAt')::timestamptz<(n.value->>'receivedAt')::timestamptz
   OR (n.value->>'observedAt')::timestamptz>now_at
 ) OR EXISTS(
  SELECT FROM jsonb_array_elements(p_progress->'notices') n(value) GROUP BY n.value->>'noticeKey' HAVING count(*)>1
 ) THEN RAISE EXCEPTION 'investanchors_notice_shape';END IF;

 -- No second empty receipt unless the receiver state actually changed.
 IF keys=0 AND before_row.id IS NOT NULL AND before_row.result->>'scanStatus'=p_progress->>'scanStatus'
  AND before_row.result->>'deferred'=p_progress->>'deferred' THEN
  RETURN jsonb_build_object('progressId',before_row.id::text,'replay',true,'articleAuthority',no_article_authority);
 END IF;
 PERFORM public.vnext_launch_csv_backend_v1(p_lease_owner);
 IF processing_day IS DISTINCT FROM (clock_timestamp() AT TIME ZONE 'Asia/Taipei')::date THEN
  RAISE EXCEPTION 'investanchors_progress_clock_changed';
 END IF;
 INSERT INTO public.vnext_audit_v1(principal,command,request,result)
 VALUES(p_principal,'investanchors-notice-progress',jsonb_build_object('mailboxDay',p_day,'processingDay',processing_day,
  'progressHash',requested_hash),p_progress-'baseProgressId') RETURNING id INTO after_id;
 RETURN jsonb_build_object('progressId',after_id::text,'replay',false,'articleAuthority',no_article_authority);
END $notice$;
ALTER FUNCTION public.vnext_investanchors_notice_progress_v1(text,uuid,date,jsonb) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_investanchors_notice_progress_v1(text,uuid,date,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.vnext_investanchors_notice_progress_v1(text,uuid,date,jsonb) TO service_role;
COMMIT;
