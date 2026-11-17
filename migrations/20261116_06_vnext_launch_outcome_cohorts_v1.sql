-- Aggregate only actual, frozen, published signal versions. No queue or source work.
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';
SELECT pg_advisory_xact_lock(610091002);
SELECT pg_advisory_xact_lock(2409,6002);
SELECT pg_advisory_xact_lock(64221022);
CREATE INDEX vnext_launch_outcome_signal_session_idx_v1 ON public.vnext_launch_outcome_signals_v1(signal_session,published_at);

CREATE FUNCTION public.vnext_launch_outcome_cohorts_v1() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC' SET statement_timeout='5s' AS $$
DECLARE observed timestamptz:=statement_timestamp();last_day date;first_day date;body jsonb;latest_at timestamptz;
BEGIN
 IF NOT EXISTS(SELECT FROM public.vnext_mode_v1 WHERE enabled AND legacy_fenced)
 OR NOT EXISTS(SELECT FROM public.vnext_launch_ranking_mode_v1 WHERE enabled) THEN RETURN NULL;END IF;
 SELECT session_date INTO last_day FROM public.vnext_launch_ranking_snapshots_v1
 WHERE published_at<=observed ORDER BY ordinal DESC LIMIT 1;
 last_day:=coalesce(last_day,(observed AT TIME ZONE 'Asia/Taipei')::date);
 first_day:=last_day-364;
 IF (SELECT count(*) FROM(SELECT FROM public.vnext_launch_outcome_signals_v1
    WHERE signal_session BETWEEN first_day AND last_day AND published_at<=observed LIMIT 3661) bounded)>3660
 THEN RETURN NULL;END IF;

 WITH cohorts(cohort) AS (VALUES('first'),('repeat')),
 subjects AS MATERIALIZED(
   SELECT CASE WHEN s.ranking_run_id=s.first_ranking_run_id THEN 'first' ELSE 'repeat' END cohort,
     v.as_of,v.result
   FROM public.vnext_launch_outcome_signals_v1 s
   LEFT JOIN LATERAL(
     SELECT o.as_of,o.result FROM public.vnext_launch_outcome_versions_v1 o
     WHERE o.ranking_run_id=s.ranking_run_id AND o.symbol=s.symbol AND o.policy_version='launch-outcomes-v1'
       AND o.as_of<=observed AND o.result->>'scope'='published_rank'
     ORDER BY o.as_of DESC LIMIT 1
   ) v ON true
   WHERE s.signal_session BETWEEN first_day AND last_day AND s.published_at<=observed
 ), membership AS (
   SELECT c.cohort,count(*) FILTER(WHERE s.cohort IS NOT NULL) signals,
     count(*) FILTER(WHERE s.result IS NOT NULL) observed_count,
     count(*) FILTER(WHERE s.result#>>'{execution,status}'='modeled_fill') filled,
     count(*) FILTER(WHERE s.result#>>'{execution,status}'='unfillable') unfillable,
     count(*) FILTER(WHERE s.result#>>'{execution,status}'='pending') opening_pending,
     count(*) FILTER(WHERE s.result IS NOT NULL AND coalesce(s.result#>>'{execution,status}','') NOT IN
       ('modeled_fill','unfillable','pending')) opening_gap
   FROM cohorts c LEFT JOIN subjects s USING(cohort) GROUP BY c.cohort
 ), tracks AS MATERIALIZED(
   SELECT cohort,'research' track,result#>'{research,barrier20}' barrier,result#>'{research,horizons}' horizons,result IS NULL waiting
   FROM subjects
   UNION ALL
   SELECT cohort,'execution',result#>'{execution,netBarrier20}',result#>'{execution,horizons}',false
   FROM subjects WHERE result#>>'{execution,status}'='modeled_fill'
 ), track_types(track) AS (VALUES('research'),('execution')),
 windows(days,slot) AS (VALUES(20,0),(60,1),(120,2)),
 barrier_counts AS (
   SELECT c.cohort,k.track,jsonb_build_object(
     'upFirst',count(*) FILTER(WHERE t.barrier->>'state'='up_first'),
     'downFirst',count(*) FILTER(WHERE t.barrier->>'state'='down_first'),
     'orderUnknown',count(*) FILTER(WHERE t.barrier->>'state'='order_unknown'),
     'notHit',count(*) FILTER(WHERE t.barrier->>'state'='not_hit'),
     'pending',count(*) FILTER(WHERE t.barrier->>'state'='pending'),
     'waitingObservation',count(*) FILTER(WHERE t.waiting),
     'dataGap',count(*) FILTER(WHERE t.waiting IS FALSE AND coalesce(t.barrier->>'state','') NOT IN
       ('up_first','down_first','order_unknown','not_hit','pending'))
   ) barrier FROM cohorts c CROSS JOIN track_types k LEFT JOIN tracks t ON t.cohort=c.cohort AND t.track=k.track
   GROUP BY c.cohort,k.track
 ), marks AS (
   SELECT t.cohort,t.track,w.days,t.waiting,
     CASE WHEN point->>'horizon'=w.days::text THEN point END item,
     CASE WHEN t.track='research' THEN 'grossPriceReturnPct' ELSE 'netSimulatedReturnPct' END return_key,
     CASE WHEN t.track='research' THEN 'marketExcessPct' ELSE 'netMarketExcessPct' END excess_key
   FROM tracks t CROSS JOIN windows w CROSS JOIN LATERAL (SELECT t.horizons->w.slot point) selected
 ), numbers AS (
   SELECT cohort,track,days,waiting,item->>'state' status,
     CASE WHEN item->>'state'='ready' AND jsonb_typeof(item->return_key)='number' THEN (item->>return_key)::numeric END gain,
     CASE WHEN item->>'state'='ready' AND jsonb_typeof(item->return_key)='number'
       AND jsonb_typeof(item->excess_key)='number' THEN (item->>excess_key)::numeric END excess
   FROM marks
 ), window_counts AS (
   SELECT c.cohort,k.track,w.days,jsonb_build_object('days',w.days,'ready',count(n.gain),
     'pending',count(*) FILTER(WHERE n.status='pending'),'waitingObservation',count(*) FILTER(WHERE n.waiting),
     'dataGap',count(*) FILTER(WHERE n.waiting IS FALSE AND n.gain IS NULL AND n.status IS DISTINCT FROM 'pending'),
     'withBenchmark',count(n.excess),'meanReturnPct',round(avg(n.gain),4),'meanExcessPct',round(avg(n.excess),4)
   ) window_stats FROM cohorts c CROSS JOIN track_types k CROSS JOIN windows w
   LEFT JOIN numbers n ON n.cohort=c.cohort AND n.track=k.track AND n.days=w.days GROUP BY c.cohort,k.track,w.days
 ), track_stats AS (
   SELECT b.cohort,b.track,jsonb_build_object('barrier20',b.barrier,
     'horizons',jsonb_agg(w.window_stats ORDER BY w.days)) stats
   FROM barrier_counts b JOIN window_counts w USING(cohort,track) GROUP BY b.cohort,b.track,b.barrier
 )
 SELECT jsonb_agg(jsonb_build_object('cohort',m.cohort,'signals',m.signals,'observed',m.observed_count,
   'opening',jsonb_build_object('filled',m.filled,'unfillable',m.unfillable,'pending',m.opening_pending,
     'evidenceGap',m.opening_gap,'waitingObservation',m.signals-m.observed_count),
   'research',research.stats,'execution',execution.stats) ORDER BY m.cohort),(SELECT max(as_of) FROM subjects)
 INTO body,latest_at FROM membership m
 JOIN track_stats research ON research.cohort=m.cohort AND research.track='research'
 JOIN track_stats execution ON execution.cohort=m.cohort AND execution.track='execution';
 RETURN jsonb_build_object('schemaVersion','vnext-launch-outcome-cohorts-v1','fromSession',first_day,
   'throughSession',last_day,'observedThrough',latest_at,'cohorts',body);
END $$;

ALTER FUNCTION public.vnext_launch_outcome_cohorts_v1() OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_launch_outcome_cohorts_v1() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.vnext_launch_outcome_cohorts_v1() TO service_role;
COMMIT;
