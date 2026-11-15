-- Advance the default mailbox scan from durable closed-day progress.
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='2s';
SELECT pg_advisory_xact_lock(610091002);
SELECT pg_advisory_xact_lock(2409,6002);
SELECT pg_advisory_xact_lock(64221022);

CREATE UNIQUE INDEX vnext_investanchors_notice_start_v1 ON public.vnext_audit_v1(principal)
 WHERE command='investanchors-notice-start';

CREATE FUNCTION public.vnext_investanchors_notice_plan_v1(p_principal text,p_lease_owner uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC'
 SET statement_timeout='30s' SET lock_timeout='2s' AS $plan$
DECLARE closed_day date; start_day date; next_day date;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'investanchors_progress_read_committed';END IF;
 PERFORM pg_advisory_xact_lock(610091002);
 PERFORM pg_advisory_xact_lock(2409,6002);
 PERFORM pg_advisory_xact_lock(64221022);
 IF NOT EXISTS(SELECT FROM public.vnext_mode_v1 WHERE enabled AND legacy_fenced)
  OR NOT EXISTS(SELECT FROM public.vnext_principals_v1 WHERE principal=p_principal AND role='operator' AND enabled)
 THEN RAISE EXCEPTION 'investanchors_progress_operator_required';END IF;
 PERFORM public.vnext_launch_csv_backend_v1(p_lease_owner);
 closed_day:=(clock_timestamp() AT TIME ZONE 'Asia/Taipei')::date-1;

 SELECT (request->>'mailboxDay')::date INTO start_day FROM public.vnext_audit_v1
 WHERE principal=p_principal AND command='investanchors-notice-start';
 IF start_day IS NULL THEN
  SELECT min((request->>'mailboxDay')::date) INTO start_day FROM public.vnext_audit_v1
  WHERE principal=p_principal AND command='investanchors-notice-progress' AND request->>'mailboxDay'<=closed_day::text;
  start_day:=coalesce(start_day,closed_day);
  -- Commit the first pending day before opening Gmail. A failed first call
  -- cannot silently skip this date when a later morning retries.
  INSERT INTO public.vnext_audit_v1(principal,command,request,result)
  VALUES(p_principal,'investanchors-notice-start',jsonb_build_object('mailboxDay',start_day),jsonb_build_object('articleAuthority',false));
 END IF;
 IF start_day>closed_day THEN RAISE EXCEPTION 'investanchors_progress_clock_changed';END IF;

 WITH latest AS MATERIALIZED (
  SELECT DISTINCT ON(a.request->>'mailboxDay') (a.request->>'mailboxDay')::date AS mailbox_day,a.result->>'scanStatus' AS scan_status
  FROM public.vnext_audit_v1 a
  WHERE a.command='investanchors-notice-progress' AND a.principal=p_principal
   AND a.request->>'mailboxDay' BETWEEN start_day::text AND closed_day::text
  ORDER BY a.request->>'mailboxDay',a.id DESC
 ), candidates AS (
  SELECT start_day AS mailbox_day
  UNION
  SELECT head.mailbox_day+1 FROM latest head WHERE head.scan_status='scanned' AND head.mailbox_day<closed_day
 )
 SELECT min(c.mailbox_day) INTO next_day FROM candidates c LEFT JOIN latest head USING (mailbox_day)
 WHERE head.scan_status IS DISTINCT FROM 'scanned';

 RETURN jsonb_build_object('day',coalesce(next_day,closed_day),'closedThrough',closed_day,
  'kind',CASE WHEN next_day IS NULL THEN 'recheck' ELSE 'pending' END,'articleAuthority',false);
END $plan$;
ALTER FUNCTION public.vnext_investanchors_notice_plan_v1(text,uuid) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_investanchors_notice_plan_v1(text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.vnext_investanchors_notice_plan_v1(text,uuid) TO service_role;

DO $retain$
DECLARE target oid:=to_regprocedure('public.vnext_investanchors_notice_progress_v1(text,uuid,date,jsonb)');
 original text;definition text;metadata jsonb;changed text;
BEGIN
 SELECT prosrc,pg_get_functiondef(oid),to_jsonb(p)-'prosrc' INTO original,definition,metadata FROM pg_proc p WHERE oid=target;
 IF encode(sha256(convert_to(original,'UTF8')),'hex') IS DISTINCT FROM '18f60264f9cd8e624298ac144e4a72356af81d83b095cebc90679473e0b5e790'
  THEN RAISE EXCEPTION 'investanchors_resume_predecessor_changed';END IF;
 changed:=replace(original,$before$ IF p_day IS NULL OR p_day NOT BETWEEN processing_day-30 AND processing_day THEN RAISE EXCEPTION 'investanchors_progress_day_invalid';END IF;$before$,$after$ IF p_day IS NULL OR p_day>processing_day OR (p_day<processing_day-30 AND NOT EXISTS(
  SELECT FROM public.vnext_audit_v1 WHERE command='investanchors-notice-start' AND principal=p_principal
   AND request->>'mailboxDay'<=p_day::text
 )) THEN RAISE EXCEPTION 'investanchors_progress_day_invalid';END IF;$after$);
 IF encode(sha256(convert_to(changed,'UTF8')),'hex') IS DISTINCT FROM '2ef557d5a5ffe2ae12edfd25f0d4b588ef351b871a1fc00f13fa4205523a92e0'
  THEN RAISE EXCEPTION 'investanchors_resume_successor_changed';END IF;
 EXECUTE replace(definition,original,changed);
 IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE oid=target) IS DISTINCT FROM metadata
  THEN RAISE EXCEPTION 'investanchors_resume_metadata_changed';END IF;
END $retain$;
COMMIT;
