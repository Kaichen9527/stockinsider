BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='2s';
SELECT pg_advisory_xact_lock(64221022);

-- Owner-only inspection of the latest exact official row for each venue.
-- Duplicate identical attestations are harmless; tied conflicts are unknown.
CREATE FUNCTION public.vnext_launch_completed_venue_heads_v1(day date,known_at timestamptz) RETURNS timestamptz
LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 WITH snapshots AS (
  SELECT value AS packet,dense_rank() OVER(
   PARTITION BY value->>'market' ORDER BY (value->>'recorded_at')::timestamptz DESC) AS priority
  FROM jsonb_array_elements(public.vnext_launch_today_calendar_internal_v1(day,known_at))
  WHERE value->>'market' IN ('TWSE','TPEX')
 ), agreeing AS (
  SELECT max((packet->>'close_at')::timestamptz) AS close_at
  FROM snapshots WHERE priority=1 GROUP BY packet->>'market'
  HAVING count(DISTINCT(packet-'session_authority_id'))=1
   AND bool_and((packet->>'status'='completed'
    AND packet->>'session_id'=day::text
    AND packet->>'provider'=lower(packet->>'market')
    AND NULLIF(packet->>'source_ref','') IS NOT NULL
    AND (packet->>'source_timestamp')::timestamptz<=(packet->>'collected_at')::timestamptz
    AND (packet->>'collected_at')::timestamptz<=(packet->>'recorded_at')::timestamptz
    AND (packet->>'open_at')::timestamptz<(packet->>'close_at')::timestamptz
    AND (packet->>'close_at')::timestamptz<=known_at
    AND ((packet->>'open_at')::timestamptz AT TIME ZONE 'Asia/Taipei')::date=day
    AND ((packet->>'close_at')::timestamptz AT TIME ZONE 'Asia/Taipei')::date=day) IS TRUE)
 )
 SELECT max(close_at) FROM agreeing HAVING count(*)=2
$$;
ALTER FUNCTION public.vnext_launch_completed_venue_heads_v1(date,timestamptz) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_launch_completed_venue_heads_v1(date,timestamptz) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.vnext_launch_sync_scheduled_calendar_v1(p_principal text,p_writer_release text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC'
 SET statement_timeout='30s' SET lock_timeout='2s' AS $$
DECLARE at_time timestamptz; local_time timestamp; day date; cutoff timestamptz;
 observed_close timestamptz; existing public.vnext_sessions_v1; receipt jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(64221022);
 at_time:=clock_timestamp();
 local_time:=at_time AT TIME ZONE 'Asia/Taipei';
 day:=local_time::date;
 IF NOT EXISTS(SELECT FROM public.vnext_principals_v1 WHERE principal=p_principal AND role='operator' AND enabled)
  OR NOT EXISTS(SELECT FROM public.vnext_mode_v1 WHERE enabled AND legacy_fenced)
  OR NOT EXISTS(SELECT FROM public.vnext_launch_ranking_mode_v1 WHERE enabled AND required_writer_release=p_writer_release)
 THEN RETURN jsonb_build_object('status','deferred','reason','launch_calendar_mode_unavailable');END IF;
 IF local_time::time>=time '20:55' AND local_time::time<time '21:10' THEN
  cutoff:=statement_timestamp();
 ELSIF local_time::time>=time '21:30' THEN
  cutoff:=(day+time '21:30') AT TIME ZONE 'Asia/Taipei';
 ELSE
  RETURN jsonb_build_object('status','deferred','reason','launch_calendar_window_closed');
 END IF;

 observed_close:=public.vnext_launch_completed_venue_heads_v1(day,cutoff);
 IF observed_close IS NULL OR public.vnext_launch_completed_venue_heads_v1(day,statement_timestamp()) IS DISTINCT FROM observed_close THEN
  RETURN jsonb_build_object('status','deferred','reason','launch_calendar_completed_venues_unconfirmed');
 END IF;
 SELECT * INTO existing FROM public.vnext_sessions_v1 WHERE session_date=day;
 IF existing.session_date IS NOT NULL AND existing.close_at IS DISTINCT FROM observed_close THEN
  RETURN jsonb_build_object('status','deferred','reason','launch_calendar_existing_close_conflict');
 END IF;
 IF existing.completed THEN RETURN jsonb_build_object('status','ready','session',day);END IF;

 -- The canonical sync owns stored history, immutability and the writer fence.
 -- Its receipt alone cannot turn a different day into today's session.
 receipt:=public.vnext_cached_admission_v1(p_principal,'sync-calendar','{}'::jsonb);
 IF receipt->>'latestCompleted' IS DISTINCT FROM day::text
  OR NOT EXISTS(SELECT FROM public.vnext_sessions_v1 WHERE session_date=day AND completed AND close_at=observed_close)
 THEN RAISE EXCEPTION 'launch_scheduled_calendar_receipt_uncertain';END IF;
 RETURN jsonb_build_object('status','synced','session',day);
END $$;
ALTER FUNCTION public.vnext_launch_sync_scheduled_calendar_v1(text,text) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_launch_sync_scheduled_calendar_v1(text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.vnext_launch_sync_scheduled_calendar_v1(text,text) TO service_role;
COMMIT;
