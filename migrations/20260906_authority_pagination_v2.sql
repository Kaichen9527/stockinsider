-- PostgREST applies the project response ceiling before Range headers on RPC
-- POST responses.  These page functions make offset/limit part of the
-- database contract so callers cannot repeatedly receive the first 1,000 rows
-- while believing that they traversed the complete authority set.

CREATE OR REPLACE FUNCTION public.candidate_research_stock_authority_page(
  p_cutoff TIMESTAMPTZ,
  p_page_offset INTEGER DEFAULT 0,
  p_page_limit INTEGER DEFAULT 1000
)
RETURNS TABLE(
  stock_id UUID,
  symbol TEXT,
  name TEXT,
  exchange TEXT,
  sector TEXT,
  source_timestamp TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF p_cutoff IS NULL
    OR p_page_offset < 0 OR p_page_offset > 10000
    OR p_page_limit < 1 OR p_page_limit > 1000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_candidate_stock_authority_page';
  END IF;

  RETURN QUERY
  SELECT authority.stock_id, authority.symbol, authority.name, authority.exchange,
    authority.sector, authority.source_timestamp
  FROM public.candidate_research_stock_authority(p_cutoff) AS authority
  ORDER BY authority.symbol, authority.stock_id
  OFFSET p_page_offset
  LIMIT p_page_limit;
END
$function$;

CREATE OR REPLACE FUNCTION public.candidate_research_official_sessions_page(
  p_cutoff TIMESTAMPTZ,
  p_page_offset INTEGER DEFAULT 0,
  p_page_limit INTEGER DEFAULT 1000
)
RETURNS TABLE(session_date DATE)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF p_cutoff IS NULL
    OR p_page_offset < 0 OR p_page_offset > 1320
    OR p_page_limit < 1 OR p_page_limit > 1000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_candidate_session_authority_page';
  END IF;

  RETURN QUERY
  SELECT authority.session_date
  FROM public.candidate_research_official_sessions(p_cutoff, 1320) AS authority
  ORDER BY authority.session_date DESC
  OFFSET p_page_offset
  LIMIT p_page_limit;
END
$function$;

REVOKE ALL ON FUNCTION public.candidate_research_stock_authority_page(TIMESTAMPTZ, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.candidate_research_stock_authority_page(TIMESTAMPTZ, INTEGER, INTEGER)
  TO service_role;

REVOKE ALL ON FUNCTION public.candidate_research_official_sessions_page(TIMESTAMPTZ, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.candidate_research_official_sessions_page(TIMESTAMPTZ, INTEGER, INTEGER)
  TO service_role;

COMMENT ON FUNCTION public.candidate_research_stock_authority_page(TIMESTAMPTZ, INTEGER, INTEGER)
  IS 'Service-role-only deterministic pagination over the complete PIT common-stock authority.';
COMMENT ON FUNCTION public.candidate_research_official_sessions_page(TIMESTAMPTZ, INTEGER, INTEGER)
  IS 'Service-role-only deterministic pagination over the 1,320-session official calendar.';
