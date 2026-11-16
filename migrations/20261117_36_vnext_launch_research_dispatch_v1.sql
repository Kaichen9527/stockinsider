BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='2s';
SELECT pg_advisory_xact_lock(64221022);

-- Select launch work before applying the batch limit. The canonical queue
-- still owns reservation, claim, the daily ledger and provider settlement.
CREATE FUNCTION public.vnext_launch_dispatch_selection_internal_v1() RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 WITH eligible AS (
  SELECT j.* FROM public.vnext_jobs_v1 j
  JOIN public.vnext_members_v1 m ON m.symbol=j.symbol AND m.input_hash=j.input_hash
  JOIN public.vnext_launch_research_admissions_v1 a ON a.job_id=coalesce(j.retry_of,j.job_id)
    AND a.admission_hash=j.admission_hash AND a.policy_version=m.evidence->>'researchPolicyVersion'
  WHERE m.state<>'exited' AND NOT m.contraindication
    AND (j.state='queued' OR (j.state='failed' AND j.error='provider_http_429' AND j.attempt_no=0 AND m.state='waiting'
      AND NOT EXISTS(SELECT FROM public.vnext_jobs_v1 retry WHERE retry.retry_of=j.job_id)))
    AND NOT EXISTS(SELECT FROM public.vnext_provider_invocations_v1 p
      WHERE p.job_id=j.job_id AND p.state IN ('dispatching','uncertain','pending'))
    AND public.vnext_input_sources_current_v1(m.evidence,j.symbol) IS TRUE
 ), queued AS (
  SELECT job_id,created_at FROM eligible WHERE state='queued' ORDER BY created_at,job_id LIMIT 4
 ), failures AS (
  SELECT job_id,created_at FROM eligible WHERE state='failed' ORDER BY created_at,job_id LIMIT 4
 )
 SELECT jsonb_build_object(
  'queued',coalesce((SELECT jsonb_agg(jsonb_build_object('job_id',job_id) ORDER BY created_at,job_id) FROM queued),'[]'::jsonb),
  'transientFailures',coalesce((SELECT jsonb_agg(jsonb_build_object('job_id',job_id) ORDER BY created_at,job_id) FROM failures),'[]'::jsonb))
$$;
ALTER FUNCTION public.vnext_launch_dispatch_selection_internal_v1() OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_launch_dispatch_selection_internal_v1() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.vnext_launch_dispatch_context_v1(p_principal text,p_writer_release text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC'
 SET statement_timeout='30s' SET lock_timeout='2s' AS $$
DECLARE at_time timestamptz:=statement_timestamp();
 local_time timestamp:=at_time AT TIME ZONE 'Asia/Taipei';
 day date:=local_time::date;
 rows_json jsonb;
 reason text;
BEGIN
 IF NOT EXISTS(SELECT FROM public.vnext_principals_v1 WHERE principal=p_principal AND role='operator' AND enabled)
   OR NOT EXISTS(SELECT FROM public.vnext_mode_v1 WHERE enabled AND legacy_fenced)
   OR NOT EXISTS(SELECT FROM public.vnext_launch_ranking_mode_v1 WHERE enabled AND required_writer_release=p_writer_release)
 THEN reason:='launch_research_mode_unavailable';
 ELSIF local_time::time<time '20:55' OR local_time::time>=time '21:10' THEN
  reason:='launch_research_window_closed';
 ELSIF NOT EXISTS(SELECT FROM public.vnext_sessions_v1 WHERE session_date=day AND completed AND close_at<=at_time) THEN
  reason:='launch_research_official_session_missing';
 ELSE
  rows_json:=public.vnext_launch_today_calendar_internal_v1(day,at_time);
  IF NOT EXISTS(
    WITH calendar_rows AS (
     SELECT value packet,dense_rank() OVER(PARTITION BY value->>'market' ORDER BY (value->>'recorded_at')::timestamptz DESC) priority
     FROM jsonb_array_elements(rows_json)
     WHERE value->>'market' IN ('TWSE','TPEX')
    ), heads AS (
     SELECT packet->>'market' market FROM calendar_rows WHERE priority=1 GROUP BY packet->>'market'
     HAVING count(DISTINCT(packet-'session_authority_id'))=1
      AND bool_and((packet->>'status'='completed'
        AND packet->>'provider'=lower(packet->>'market') AND (packet->>'close_at')::timestamptz<=at_time) IS TRUE)
    )
    SELECT FROM heads HAVING count(*)=2
  ) THEN reason:='launch_research_both_venue_calendar_missing'; END IF;
 END IF;

 IF reason IS NOT NULL THEN RETURN jsonb_build_object('session',NULL,'reason',reason); END IF;
 RETURN jsonb_build_object('session',day,'reason',NULL)||public.vnext_launch_dispatch_selection_internal_v1();
END $$;
ALTER FUNCTION public.vnext_launch_dispatch_context_v1(text,text) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_launch_dispatch_context_v1(text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.vnext_launch_dispatch_context_v1(text,text) TO service_role;
COMMIT;
