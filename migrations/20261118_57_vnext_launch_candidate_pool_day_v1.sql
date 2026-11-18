BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='2s';
SELECT pg_advisory_xact_lock(64221022);

-- The ranking table pins each session_date to the 21:30 Taipei cutoff.
-- Date selection delegates the actual projection and gate checks unchanged.
CREATE FUNCTION public.vnext_launch_candidate_pool_day_v1(p_day date) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public
SET timezone='UTC' SET statement_timeout='10s' AS $function$
 SELECT public.vnext_launch_candidate_pool_history_v2(selected.ranking_run_id)
 FROM (
   SELECT ranking_run_id
   FROM public.vnext_launch_ranking_snapshots_v1
   WHERE session_date=p_day AND published_at<=statement_timestamp()
   ORDER BY ordinal DESC LIMIT 1
 ) selected
$function$;
ALTER FUNCTION public.vnext_launch_candidate_pool_day_v1(date) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_launch_candidate_pool_day_v1(date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.vnext_launch_candidate_pool_day_v1(date) TO service_role;
COMMIT;
