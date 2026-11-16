BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='2s';
SELECT pg_advisory_xact_lock(64221022);

-- Only previously published launch snapshots may provide pool observations.
-- Candidate source, research text and live membership are different scopes.
CREATE FUNCTION public.vnext_launch_candidate_pool_projection_v1(doc jsonb) RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'symbol',item->>'symbol','state',item->>'state') ORDER BY ordinal),'[]'::jsonb)
 FROM jsonb_array_elements(doc->'candidates') WITH ORDINALITY AS row(item,ordinal)
$$;
ALTER FUNCTION public.vnext_launch_candidate_pool_projection_v1(jsonb) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_launch_candidate_pool_projection_v1(jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.vnext_launch_candidate_pool_history_v1(p_catalog_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC' SET statement_timeout='10s' AS $$
DECLARE at_time timestamptz:=statement_timestamp();
 selected public.vnext_launch_ranking_snapshots_v1;
 prior public.vnext_launch_ranking_snapshots_v1;
 successor public.vnext_launch_ranking_snapshots_v1;
BEGIN
 IF NOT EXISTS(SELECT FROM public.vnext_mode_v1 WHERE enabled AND legacy_fenced)
 OR NOT EXISTS(SELECT FROM public.vnext_launch_ranking_mode_v1 WHERE enabled AND required_writer_release IS NOT NULL)
 THEN RETURN NULL;END IF;
 SELECT * INTO selected FROM public.vnext_launch_ranking_snapshots_v1
 WHERE published_at<=at_time AND (p_catalog_id IS NULL OR ranking_run_id=p_catalog_id)
 ORDER BY ordinal DESC LIMIT 1;
 IF selected.ranking_run_id IS NULL THEN RETURN NULL;END IF;
 SELECT * INTO prior FROM public.vnext_launch_ranking_snapshots_v1
 WHERE ranking_run_id=selected.previous_ranking_run_id AND published_at<=selected.published_at;
 SELECT * INTO successor FROM public.vnext_launch_ranking_snapshots_v1
 WHERE previous_ranking_run_id=selected.ranking_run_id AND published_at<=at_time;
 IF selected.previous_ranking_run_id IS DISTINCT FROM prior.ranking_run_id
  OR selected.snapshot->>'policyVersion' IS DISTINCT FROM 'stockinsider-launch-radar-v1'
  OR (prior.ranking_run_id IS NOT NULL AND prior.snapshot->>'policyVersion' IS DISTINCT FROM 'stockinsider-launch-radar-v1')
  OR (successor.ranking_run_id IS NOT NULL AND successor.snapshot->>'policyVersion' IS DISTINCT FROM 'stockinsider-launch-radar-v1')
  OR jsonb_typeof(selected.snapshot->'candidates') IS DISTINCT FROM 'array'
  OR jsonb_array_length(selected.snapshot->'candidates')>20 OR (prior.ranking_run_id IS NOT NULL
    AND (jsonb_typeof(prior.snapshot->'candidates') IS DISTINCT FROM 'array' OR jsonb_array_length(prior.snapshot->'candidates')>20))
 THEN RAISE EXCEPTION 'launch_candidate_pool_snapshot_invalid';END IF;
 RETURN jsonb_build_object(
  'schemaVersion','launch-candidate-pool-history-v1',
  'current',jsonb_build_object('id',selected.ranking_run_id,'cutoff',selected.input_cutoff,
   'rows',public.vnext_launch_candidate_pool_projection_v1(selected.snapshot)),
  'previous',CASE WHEN prior.ranking_run_id IS NOT NULL THEN
   jsonb_build_object('id',prior.ranking_run_id,'cutoff',prior.input_cutoff,
    'rows',public.vnext_launch_candidate_pool_projection_v1(prior.snapshot)) END,
  'next',CASE WHEN successor.ranking_run_id IS NOT NULL THEN
   jsonb_build_object('id',successor.ranking_run_id,'cutoff',successor.input_cutoff) END);
END $$;
ALTER FUNCTION public.vnext_launch_candidate_pool_history_v1(uuid) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_launch_candidate_pool_history_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.vnext_launch_candidate_pool_history_v1(uuid) TO service_role;
COMMIT;
