-- V3.12 product-value recovery: bridge reviewed legacy observations into the
-- tracked producer's read plane without granting a public or Web mutation path.

DO $rename_authoritative_plane$
BEGIN
  IF to_regprocedure('public.read_legacy_candidate_fact_plane_authoritative_v3_12(timestamptz,jsonb)') IS NULL THEN
    ALTER FUNCTION public.read_legacy_candidate_fact_plane_v3_11(timestamptz,jsonb)
      RENAME TO read_legacy_candidate_fact_plane_authoritative_v3_12;
  END IF;
END $rename_authoritative_plane$;

GRANT SELECT ON public.stocks,public.stock_signals,public.revenue_signals,public.market_snapshots
  TO opportunity_v3_rpc_owner;

CREATE OR REPLACE FUNCTION public.read_legacy_candidate_fact_plane_v3_11(
  p_source_cutoff timestamptz,p_candidate_result jsonb
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $function$
DECLARE
  v_base jsonb;
  v_legacy_prices jsonb;
  v_revenue jsonb;
  v_dislocations jsonb;
  v_breadth jsonb;
  v_market jsonb;
  v_result jsonb;
BEGIN
  v_base:=public.read_legacy_candidate_fact_plane_authoritative_v3_12(p_source_cutoff,p_candidate_result);

  WITH candidates AS MATERIALIZED (
    SELECT value->>'stockId' AS stock_id,value->>'symbol' AS symbol,ordinality::integer AS ordinal
    FROM jsonb_array_elements(coalesce(p_candidate_result->'candidates','[]'::jsonb)) WITH ORDINALITY item(value,ordinality)
    WHERE (value->>'stockId')~*'^[0-9a-f-]{36}$' AND (value->>'symbol')~'^[0-9]{4}$'
      AND coalesce((value->>'shallowSelected')::boolean,false)
  ), ranked AS MATERIALIZED (
    SELECT candidate.ordinal,candidate.symbol,signal.id,signal.as_of::date AS session_id,
      signal.price::double precision AS close,coalesce(signal.volume,0)::double precision AS volume,
      signal.source,signal.source_timestamp,signal.ingested_at,signal.chip_metrics,
      row_number() OVER (PARTITION BY candidate.stock_id,signal.as_of::date
        ORDER BY signal.source_timestamp DESC,signal.ingested_at DESC,signal.id) AS day_rank,
      dense_rank() OVER (PARTITION BY candidate.stock_id ORDER BY signal.as_of::date DESC) AS session_rank
    FROM candidates candidate JOIN public.stock_signals signal ON signal.stock_id=candidate.stock_id::uuid
    WHERE signal.as_of<=p_source_cutoff AND signal.source_timestamp<=p_source_cutoff
      AND signal.ingested_at<=p_source_cutoff AND signal.price>0
  ), selected AS MATERIALIZED (
    SELECT * FROM ranked WHERE day_rank=1 AND session_rank<=130
  )
  SELECT coalesce(jsonb_agg(jsonb_build_array(symbol,session_id,
    CASE WHEN chip_metrics->>'open'~'^[0-9]+([.][0-9]+)?$' THEN (chip_metrics->>'open')::double precision ELSE close END,
    CASE WHEN chip_metrics->>'high'~'^[0-9]+([.][0-9]+)?$' THEN (chip_metrics->>'high')::double precision ELSE close END,
    CASE WHEN chip_metrics->>'low'~'^[0-9]+([.][0-9]+)?$' THEN (chip_metrics->>'low')::double precision ELSE close END,
    close,volume,'legacy-stock-signal:'||id::text,source,source_timestamp,ingested_at)
    ORDER BY ordinal,session_id),'[]'::jsonb) INTO v_legacy_prices FROM selected;

  WITH candidates AS MATERIALIZED (
    SELECT value->>'stockId' AS stock_id,value->>'symbol' AS symbol,ordinality::integer AS ordinal
    FROM jsonb_array_elements(coalesce(p_candidate_result->'candidates','[]'::jsonb)) WITH ORDINALITY item(value,ordinality)
    WHERE (value->>'stockId')~*'^[0-9a-f-]{36}$' AND (value->>'symbol')~'^[0-9]{4}$'
  ), selected AS MATERIALIZED (
    SELECT candidate.ordinal,candidate.symbol,revenue.id,revenue.as_of_date,revenue.monthly_revenue,
      revenue.yoy_growth,revenue.mom_growth,revenue.source_url,revenue.created_at,
      row_number() OVER (PARTITION BY revenue.stock_id ORDER BY revenue.as_of_date DESC,revenue.created_at DESC,revenue.id) AS precedence
    FROM candidates candidate JOIN public.revenue_signals revenue ON revenue.stock_id=candidate.stock_id::uuid
    WHERE revenue.as_of_date<=p_source_cutoff::date AND revenue.created_at<=p_source_cutoff
  )
  SELECT coalesce(jsonb_agg(jsonb_build_array(symbol,as_of_date,monthly_revenue,yoy_growth,mom_growth,
    source_url,created_at,'legacy-revenue-signal:'||id::text) ORDER BY ordinal,as_of_date DESC),'[]'::jsonb)
    INTO v_revenue FROM selected WHERE precedence<=3;

  WITH daily_ranked AS MATERIALIZED (
    SELECT signal.stock_id,signal.id,signal.as_of::date AS session_id,signal.price::double precision AS close,
      coalesce(signal.volume,0)::double precision AS volume,
      signal.source,signal.source_timestamp,signal.ingested_at,
      row_number() OVER (PARTITION BY signal.stock_id,signal.as_of::date
        ORDER BY signal.source_timestamp DESC,signal.ingested_at DESC,signal.id) AS day_rank
    FROM public.stock_signals signal
    WHERE signal.as_of<=p_source_cutoff AND signal.source_timestamp<=p_source_cutoff
      AND signal.ingested_at<=p_source_cutoff AND signal.price>0
  ), recent AS MATERIALIZED (
    SELECT daily_ranked.*,row_number() OVER (PARTITION BY stock_id ORDER BY session_id DESC) AS session_rank
    FROM daily_ranked WHERE day_rank=1
  ), stats AS MATERIALIZED (
    SELECT stock_id,count(*) FILTER (WHERE session_rank<=120)::integer AS sessions,
      (array_agg(close ORDER BY session_id DESC))[1] AS current_price,
      (array_agg(volume ORDER BY session_id DESC))[1] AS current_volume,
      max(close) FILTER (WHERE session_rank<=20) AS high20,
      max(close) FILTER (WHERE session_rank<=60) AS high60,
      max(close) FILTER (WHERE session_rank<=120) AS high120,
      avg(close) FILTER (WHERE session_rank<=20) AS ma20,
      avg(close) FILTER (WHERE session_rank<=60) AS ma60,
      avg(close) FILTER (WHERE session_rank<=120) AS ma120,
      avg(volume) FILTER (WHERE session_rank BETWEEN 2 AND 20) AS avg_prior_volume20,
      (array_agg(session_id ORDER BY session_id DESC))[1] AS latest_session,
      (array_agg(id ORDER BY session_id DESC))[1] AS latest_id,
      (array_agg(source ORDER BY session_id DESC))[1] AS latest_source,
      (array_agg(source_timestamp ORDER BY session_id DESC))[1] AS latest_source_timestamp,
      (array_agg(ingested_at ORDER BY session_id DESC))[1] AS latest_ingested_at
    FROM recent WHERE session_rank<=120 GROUP BY stock_id
  ), eligible AS MATERIALIZED (
    SELECT instrument.stock_id,instrument.symbol,instrument.official_name,
      coalesce(sector.canonical_sector_key::text,'unknown') AS sector,
      stats.sessions,stats.current_price,stats.current_volume,stats.high20,stats.high60,stats.high120,
      stats.ma20,stats.ma60,stats.ma120,stats.avg_prior_volume20,
      stats.latest_session,stats.latest_id,stats.latest_source,stats.latest_source_timestamp,stats.latest_ingested_at,
      revenue.as_of_date AS revenue_as_of,revenue.yoy_growth,revenue.mom_growth,revenue.source_url AS revenue_source,
      CASE WHEN stats.high20>0 THEN 100*(stats.current_price/stats.high20-1) END AS drawdown20_pct,
      CASE WHEN stats.high60>0 THEN 100*(stats.current_price/stats.high60-1) END AS drawdown60_pct,
      CASE WHEN stats.high120>0 THEN 100*(stats.current_price/stats.high120-1) END AS drawdown120_pct,
      CASE WHEN stats.ma20>0 THEN 100*(stats.current_price/stats.ma20-1) END AS bias20_pct,
      CASE WHEN stats.ma60>0 THEN 100*(stats.current_price/stats.ma60-1) END AS bias60_pct,
      CASE WHEN stats.ma120>0 THEN 100*(stats.current_price/stats.ma120-1) END AS bias120_pct,
      CASE WHEN stats.avg_prior_volume20>0 THEN stats.current_volume/stats.avg_prior_volume20 END AS volume_ratio20
    FROM stats JOIN public.stock_instruments_v3 instrument ON instrument.stock_id=stats.stock_id
      AND instrument.instrument_type='common_stock' AND instrument.listing_status='active'
      AND instrument.recorded_at<=p_source_cutoff AND instrument.valid_from<=p_source_cutoff
      AND (instrument.valid_to IS NULL OR instrument.valid_to>p_source_cutoff)
    LEFT JOIN LATERAL (
      SELECT assignment.canonical_sector_key FROM public.stock_sector_assignments_v3 assignment
      WHERE assignment.stock_id=stats.stock_id AND assignment.status='active'
        AND assignment.recorded_at<=p_source_cutoff AND assignment.valid_from<=p_source_cutoff
        AND (assignment.valid_to IS NULL OR assignment.valid_to>p_source_cutoff)
      ORDER BY assignment.source_timestamp DESC,assignment.recorded_at DESC,assignment.assignment_authority_id LIMIT 1
    ) sector ON true
    LEFT JOIN LATERAL (
      SELECT observation.as_of_date,observation.yoy_growth,observation.mom_growth,observation.source_url
      FROM public.revenue_signals observation WHERE observation.stock_id=stats.stock_id
        AND observation.as_of_date<=p_source_cutoff::date AND observation.created_at<=p_source_cutoff
      ORDER BY observation.as_of_date DESC,observation.created_at DESC,observation.id LIMIT 1
    ) revenue ON true
    WHERE stats.sessions>=20 AND stats.high60>0
  ), bounded AS MATERIALIZED (
    SELECT * FROM eligible WHERE least(drawdown60_pct,coalesce(drawdown120_pct,drawdown60_pct))<=-5
    ORDER BY least(drawdown60_pct,coalesce(drawdown120_pct,drawdown60_pct)),bias20_pct,symbol LIMIT 30
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'stockId',stock_id,'symbol',symbol,'name',official_name,'canonicalSector',sector,
    'currentPrice',current_price,'session',latest_session,'sessions',sessions,
    'high20',high20,'high60',high60,'high120',high120,'ma20',ma20,'ma60',ma60,'ma120',ma120,
    'drawdown20Pct',drawdown20_pct,'drawdown60Pct',drawdown60_pct,'drawdown120Pct',drawdown120_pct,
    'bias20Pct',bias20_pct,'bias60Pct',bias60_pct,'bias120Pct',bias120_pct,'volumeRatio20',volume_ratio20,
    'sourceRef','legacy-stock-signal:'||latest_id::text,'source',latest_source,
    'sourceTimestamp',latest_source_timestamp,'ingestedAt',latest_ingested_at,
    'revenueAsOf',revenue_as_of,'revenueYoy',yoy_growth,'revenueMom',mom_growth,'revenueSource',revenue_source
  ) ORDER BY drawdown60_pct,bias20_pct,symbol),'[]'::jsonb) INTO v_dislocations FROM bounded;

  WITH daily_ranked AS MATERIALIZED (
    SELECT signal.stock_id,signal.as_of::date AS session_id,signal.price::double precision AS close,
      row_number() OVER (PARTITION BY signal.stock_id,signal.as_of::date
        ORDER BY signal.source_timestamp DESC,signal.ingested_at DESC,signal.id) AS day_rank
    FROM public.stock_signals signal
    WHERE signal.as_of<=p_source_cutoff AND signal.source_timestamp<=p_source_cutoff
      AND signal.ingested_at<=p_source_cutoff AND signal.price>0
  ), recent AS MATERIALIZED (
    SELECT daily_ranked.*,row_number() OVER (PARTITION BY stock_id ORDER BY session_id DESC) AS session_rank
    FROM daily_ranked WHERE day_rank=1
  ), stats AS MATERIALIZED (
    SELECT stock_id,count(*) FILTER (WHERE session_rank<=20)::integer AS sessions,
      (array_agg(close ORDER BY session_id DESC))[1] AS current_price,
      avg(close) FILTER (WHERE session_rank<=20) AS ma20,
      (array_agg(session_id ORDER BY session_id DESC))[1] AS latest_session
    FROM recent WHERE session_rank<=20 GROUP BY stock_id
  )
  SELECT jsonb_build_object('trackedCount',count(*),'aboveMa20Count',count(*) FILTER (WHERE current_price>=ma20),
    'aboveMa20Pct',CASE WHEN count(*)>0 THEN 100.0*count(*) FILTER (WHERE current_price>=ma20)/count(*) ELSE NULL END,
    'asOf',max(latest_session),'scope','tracked-point-in-time-universe') INTO v_breadth
  FROM stats WHERE sessions>=20 AND ma20>0;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'asOf',snapshot.as_of,'source',snapshot.source,'sourceKey',snapshot.source_key,
    'sectorFlows',snapshot.sector_flows,'indexState',snapshot.index_state,
    'freshnessStatus',snapshot.freshness_status,'sourceTimestamp',snapshot.source_timestamp,
    'ingestedAt',snapshot.ingested_at
  ) ORDER BY snapshot.as_of DESC),'[]'::jsonb) INTO v_market
  FROM (SELECT * FROM public.market_snapshots WHERE market='TW' AND as_of<=p_source_cutoff
    AND source_timestamp<=p_source_cutoff AND ingested_at<=p_source_cutoff ORDER BY as_of DESC LIMIT 3) snapshot;

  v_result:=v_base||jsonb_build_object(
    'legacyPriceRows',v_legacy_prices,
    'legacyRevenueRows',v_revenue,
    'dislocationCandidates',v_dislocations,
    'marketBreadth',v_breadth,
    'legacyMarketRows',v_market,
    'bridgeSchema','legacy-product-value-bridge-v3.12'
  );
  IF octet_length(convert_to(v_result::text,'utf8'))>3145728 THEN RAISE EXCEPTION 'bound_violation';END IF;
  RETURN v_result;
END $function$;

GRANT CREATE ON SCHEMA public TO opportunity_v3_rpc_owner;
ALTER FUNCTION public.read_legacy_candidate_fact_plane_v3_11(timestamptz,jsonb)
  OWNER TO opportunity_v3_rpc_owner;
REVOKE CREATE ON SCHEMA public FROM opportunity_v3_rpc_owner;
REVOKE ALL ON FUNCTION public.read_legacy_candidate_fact_plane_v3_11(timestamptz,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.read_legacy_candidate_fact_plane_v3_11(timestamptz,jsonb)
  TO legacy_correctness_rpc_owner;

REVOKE ALL ON FUNCTION public.read_legacy_candidate_fact_plane_authoritative_v3_12(timestamptz,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.read_legacy_candidate_fact_plane_authoritative_v3_12(timestamptz,jsonb)
  TO legacy_correctness_rpc_owner;
