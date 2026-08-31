-- Durable official-calendar reader for the candidate research scheduler.
-- This is additive and exposes only session dates already recorded from the
-- official TWSE authority plane. It does not synthesize or backfill sessions.

CREATE OR REPLACE FUNCTION public.candidate_research_official_sessions(
  p_cutoff TIMESTAMPTZ,
  p_limit INTEGER DEFAULT 1320
)
RETURNS TABLE(session_date DATE)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF p_cutoff IS NULL OR p_limit < 2 OR p_limit > 1320 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_candidate_calendar_request';
  END IF;

  RETURN QUERY
  WITH eligible AS MATERIALIZED (
    SELECT
      authority.session_id,
      authority.status,
      authority.open_at,
      authority.close_at,
      authority.provider,
      authority.source_timestamp,
      authority.collected_at,
      authority.source_ref,
      authority.recorded_at,
      MAX(authority.recorded_at) OVER (PARTITION BY authority.session_id) AS latest_recorded_at
    FROM public.tw_trading_sessions_v3 AS authority
    WHERE authority.market = 'TWSE'::public.tw_market_v3
      AND authority.recorded_at <= p_cutoff
      AND authority.source_timestamp <= p_cutoff
      AND authority.collected_at <= p_cutoff
      AND authority.close_at <= p_cutoff
  ),
  resolved AS (
    SELECT
      eligible.session_id,
      MIN(eligible.status::TEXT) AS resolved_status,
      COUNT(DISTINCT jsonb_build_array(
        eligible.status,
        eligible.open_at,
        eligible.close_at,
        eligible.provider,
        eligible.source_timestamp,
        eligible.collected_at,
        eligible.source_ref
      )) AS semantic_heads
    FROM eligible
    WHERE eligible.recorded_at = eligible.latest_recorded_at
    GROUP BY eligible.session_id
  )
  SELECT resolved.session_id
  FROM resolved
  WHERE resolved.semantic_heads = 1
    AND resolved.resolved_status = 'completed'
  ORDER BY resolved.session_id DESC
  LIMIT p_limit;
END
$function$;

REVOKE ALL ON FUNCTION public.candidate_research_official_sessions(TIMESTAMPTZ, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.candidate_research_official_sessions(TIMESTAMPTZ, INTEGER)
  TO service_role;
