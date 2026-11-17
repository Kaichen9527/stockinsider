-- Source-only additive reader; NOT applied. Original native HOLD remains.
-- No writer, ranking pins, existing routines, RLS or authority is changed.
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='2s';
DO $pre$ BEGIN
 IF to_regprocedure('public.vnext_candidate_history_read_v1(uuid)') IS NOT NULL THEN RAISE EXCEPTION 'vnext_candidate_history_first_install_required'; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='stockinsider_vnext_owner' AND NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND rolconfig IS NULL AND NOT EXISTS(SELECT FROM pg_auth_members a WHERE a.member=pg_roles.oid OR a.roleid=pg_roles.oid) AND NOT EXISTS(SELECT FROM pg_db_role_setting d WHERE d.setrole=pg_roles.oid AND d.setconfig IS NOT NULL))
 OR NOT EXISTS(SELECT FROM pg_class WHERE oid=to_regclass('public.vnext_ranking_snapshots_v1') AND relrowsecurity AND pg_get_userbyid(relowner)='stockinsider_vnext_owner')
 OR NOT EXISTS(SELECT FROM pg_class WHERE oid=to_regclass('public.vnext_mode_v1') AND relrowsecurity AND pg_get_userbyid(relowner)='stockinsider_vnext_owner') THEN RAISE EXCEPTION 'vnext_candidate_history_existing_authority_required'; END IF;
END $pre$;
CREATE FUNCTION public.vnext_candidate_history_read_v1(p_ranking_run_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC' SET statement_timeout='5s' SET lock_timeout='2s' AS $read$
 WITH selected AS (
  SELECT ranking_run_id,previous_ranking_run_id,snapshot FROM public.vnext_ranking_snapshots_v1
  WHERE p_ranking_run_id IS NULL OR ranking_run_id=p_ranking_run_id ORDER BY ordinal DESC LIMIT 1
 ), adjacent AS (
  SELECT 'snapshot'::text AS kind,ranking_run_id,snapshot FROM selected
  UNION ALL
  SELECT 'previousSnapshot',previous.ranking_run_id,previous.snapshot FROM selected
  JOIN public.vnext_ranking_snapshots_v1 previous ON previous.ranking_run_id=selected.previous_ranking_run_id
 ), projected AS (
  SELECT kind,jsonb_build_object('schemaVersion',snapshot->'schemaVersion','policyVersion',snapshot->'policyVersion','rankingRunId',ranking_run_id,
   'previousRankingRunId',snapshot->'previousRankingRunId','cutoff',snapshot->'cutoff','candidates',
   (SELECT coalesce(jsonb_agg(jsonb_build_object('symbol',candidate->'symbol','state',candidate->'state','date',candidate->'date',
    'revisionId',candidate->'revisionId','entryEligible',candidate->'entryEligible','source',NULL,'industry',NULL) ORDER BY candidate->>'symbol'),'[]'::jsonb)
    FROM jsonb_array_elements(snapshot->'candidates') candidate)) AS document FROM adjacent
 )
 SELECT jsonb_build_object('snapshot',(SELECT document FROM projected WHERE kind='snapshot'),'previousSnapshot',(SELECT document FROM projected WHERE kind='previousSnapshot'),
  'nextSnapshot',(SELECT jsonb_build_object('rankingRunId',successor.ranking_run_id,'previousRankingRunId',successor.previous_ranking_run_id,'cutoff',successor.cutoff)
   FROM selected JOIN public.vnext_ranking_snapshots_v1 successor ON successor.previous_ranking_run_id=selected.ranking_run_id LIMIT 1))
 WHERE EXISTS(SELECT FROM public.vnext_mode_v1 WHERE enabled AND legacy_fenced)
$read$;
ALTER FUNCTION public.vnext_candidate_history_read_v1(uuid) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_candidate_history_read_v1(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vnext_candidate_history_read_v1(uuid) TO service_role;
COMMIT;
