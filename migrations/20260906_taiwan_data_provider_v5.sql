-- Taiwan data provider v5: a VPS-owned, append-only record of official
-- attempts and FinMind mirror fallbacks.  This migration is additive and does
-- not reinterpret existing market, candidate, or valuation evidence.

BEGIN;

CREATE TABLE IF NOT EXISTS public.taiwan_data_refresh_queue_v5 (
  job_id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  queue_key text NOT NULL CHECK(queue_key ~ '^[0-9a-f]{64}$'),
  dataset text NOT NULL CHECK(dataset IN ('daily_price','daily_valuation','monthly_revenue','financial_statement','institutional_flow','margin_short','market_index','stock_master','trading_calendar')),
  symbol text CHECK(symbol IS NULL OR symbol ~ '^\d{4}$'),
  exchange text NOT NULL CHECK(exchange IN ('TWSE','TPEX')),
  refresh_phase text NOT NULL CHECK(refresh_phase IN ('preliminary','final')),
  requested_session_date date NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','terminal')),
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 20),
  next_attempt_at timestamptz,
  lease_owner text,
  lease_expires_at timestamptz,
  terminal_status text CHECK(terminal_status IN ('complete','empty','timeout','usage_limited','auth_failed','http_error','network_error','schema_invalid','not_configured')),
  terminal_result jsonb,
  queued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(queue_key),
  CHECK((status = 'terminal') = (terminal_status IS NOT NULL)),
  CHECK(status <> 'terminal' OR (completed_at IS NOT NULL AND terminal_result IS NOT NULL AND lease_owner IS NULL AND lease_expires_at IS NULL)),
  CHECK(status = 'running' OR (lease_owner IS NULL AND lease_expires_at IS NULL)),
  CHECK(status <> 'running' OR (lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS public.taiwan_data_provider_attempts_v5 (
  attempt_id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.taiwan_data_refresh_queue_v5(job_id) ON DELETE RESTRICT,
  attempt_order integer NOT NULL CHECK(attempt_order BETWEEN 1 AND 40),
  provider text NOT NULL CHECK(provider IN ('twse','tpex','finmind')),
  authority_tier text NOT NULL CHECK(authority_tier IN ('official_primary','finmind_fallback')),
  terminal_status text NOT NULL CHECK(terminal_status IN ('complete','empty','timeout','usage_limited','auth_failed','http_error','network_error','schema_invalid','not_configured')),
  source_url text NOT NULL,
  fetched_at timestamptz NOT NULL,
  http_status integer CHECK(http_status IS NULL OR http_status BETWEEN 100 AND 599),
  response_sha256 text CHECK(response_sha256 IS NULL OR response_sha256 ~ '^[0-9a-f]{64}$'),
  response_bytes integer NOT NULL CHECK(response_bytes BETWEEN 0 AND 2097152),
  api_usage jsonb,
  normalized_payload jsonb,
  detail text,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(job_id, attempt_order),
  CHECK((provider IN ('twse','tpex') AND authority_tier = 'official_primary') OR (provider = 'finmind' AND authority_tier = 'finmind_fallback')),
  CHECK((terminal_status IN ('complete','empty')) = (normalized_payload IS NOT NULL)),
  CHECK(api_usage IS NULL OR jsonb_typeof(api_usage) = 'object'),
  CHECK(normalized_payload IS NULL OR jsonb_typeof(normalized_payload) = 'object')
);

CREATE TABLE IF NOT EXISTS public.taiwan_data_canonical_results_v5 (
  canonical_result_id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  job_id uuid NOT NULL UNIQUE REFERENCES public.taiwan_data_refresh_queue_v5(job_id) ON DELETE RESTRICT,
  dataset text NOT NULL CHECK(dataset IN ('daily_price','daily_valuation','monthly_revenue','financial_statement','institutional_flow','margin_short','market_index','stock_master','trading_calendar')),
  symbol text CHECK(symbol IS NULL OR symbol ~ '^\d{4}$'),
  exchange text NOT NULL CHECK(exchange IN ('TWSE','TPEX')),
  requested_session_date date NOT NULL,
  provider text NOT NULL CHECK(provider IN ('twse','tpex','finmind')),
  authority_tier text NOT NULL CHECK(authority_tier IN ('official_primary','finmind_fallback')),
  canonical_schema text NOT NULL CHECK(canonical_schema='taiwan-data-canonical-v1'),
  record_count integer NOT NULL CHECK(record_count BETWEEN 1 AND 10000),
  records jsonb NOT NULL CHECK(jsonb_typeof(records)='array'),
  records_sha256 text NOT NULL CHECK(records_sha256 ~ '^[0-9a-f]{64}$'),
  persisted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK((provider IN ('twse','tpex') AND authority_tier='official_primary') OR (provider='finmind' AND authority_tier='finmind_fallback'))
);

-- Publication metadata is intentionally separate from the raw provider ledger:
-- it tells a publisher what phase and completeness it may safely claim without
-- converting a FinMind mirror into official evidence.
CREATE TABLE IF NOT EXISTS public.taiwan_data_publication_metadata_v5 (
  session_date date NOT NULL,
  publication_phase text NOT NULL CHECK(publication_phase IN ('preliminary','final')),
  data_cutoff_at timestamptz NOT NULL,
  dataset_completeness jsonb NOT NULL CHECK(jsonb_typeof(dataset_completeness)='object'),
  dataset_completeness_pct numeric NOT NULL CHECK(dataset_completeness_pct BETWEEN 0 AND 100),
  shadow_eligible boolean NOT NULL DEFAULT false,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(session_date, publication_phase),
  CHECK(NOT shadow_eligible OR publication_phase='final')
);

CREATE INDEX IF NOT EXISTS taiwan_data_refresh_queue_v5_claim_idx
  ON public.taiwan_data_refresh_queue_v5(status, next_attempt_at, queued_at)
  WHERE status IN ('queued','running');
CREATE INDEX IF NOT EXISTS taiwan_data_provider_attempts_v5_job_idx
  ON public.taiwan_data_provider_attempts_v5(job_id, recorded_at);

ALTER TABLE public.taiwan_data_refresh_queue_v5 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taiwan_data_provider_attempts_v5 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taiwan_data_canonical_results_v5 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taiwan_data_publication_metadata_v5 ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.radar_public_snapshots
  ADD COLUMN IF NOT EXISTS publication_phase text NOT NULL DEFAULT 'final'
    CHECK(publication_phase IN ('preliminary','final')),
  ADD COLUMN IF NOT EXISTS data_cutoff_at timestamptz,
  ADD COLUMN IF NOT EXISTS dataset_completeness_pct numeric;
ALTER TABLE public.candidate_detail_snapshots
  ADD COLUMN IF NOT EXISTS publication_phase text NOT NULL DEFAULT 'final'
    CHECK(publication_phase IN ('preliminary','final'));

CREATE OR REPLACE FUNCTION public.enqueue_taiwan_data_refresh_v5(
  p_queue_key text, p_dataset text, p_symbol text, p_exchange text,
  p_refresh_phase text, p_requested_session_date date, p_queued_at timestamptz
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $enqueue$
DECLARE v_job_id uuid;
BEGIN
  IF p_queue_key !~ '^[0-9a-f]{64}$' OR p_dataset NOT IN ('daily_price','daily_valuation','monthly_revenue','financial_statement','institutional_flow','margin_short','market_index','stock_master','trading_calendar')
    OR p_symbol IS NOT NULL AND p_symbol !~ '^\d{4}$' OR p_exchange NOT IN ('TWSE','TPEX')
    OR p_refresh_phase NOT IN ('preliminary','final') OR p_queued_at > clock_timestamp() + interval '5 minutes' THEN
    RAISE EXCEPTION USING ERRCODE = 'PT422', MESSAGE = 'invalid_taiwan_data_refresh_request';
  END IF;
  INSERT INTO public.taiwan_data_refresh_queue_v5(
    queue_key,dataset,symbol,exchange,refresh_phase,requested_session_date,status,next_attempt_at,queued_at,updated_at
  ) VALUES(
    p_queue_key,p_dataset,p_symbol,p_exchange,p_refresh_phase,p_requested_session_date,'queued',p_queued_at,p_queued_at,p_queued_at
  ) ON CONFLICT(queue_key) DO UPDATE SET
    next_attempt_at = LEAST(COALESCE(public.taiwan_data_refresh_queue_v5.next_attempt_at, EXCLUDED.next_attempt_at), EXCLUDED.next_attempt_at),
    updated_at = EXCLUDED.updated_at
  WHERE public.taiwan_data_refresh_queue_v5.status <> 'terminal'
  RETURNING job_id INTO v_job_id;
  IF v_job_id IS NULL THEN
    SELECT job_id INTO v_job_id FROM public.taiwan_data_refresh_queue_v5 WHERE queue_key = p_queue_key;
  END IF;
  RETURN v_job_id;
END $enqueue$;

CREATE OR REPLACE FUNCTION public.claim_taiwan_data_refresh_jobs_v5(
  p_limit integer, p_owner text, p_claimed_at timestamptz, p_lease_expires_at timestamptz
) RETURNS TABLE(job_id uuid, dataset text, symbol text, exchange text, refresh_phase text, requested_session_date date, attempts integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $claim$
BEGIN
  IF p_limit NOT BETWEEN 1 AND 100 OR length(p_owner) NOT BETWEEN 16 AND 200
    OR p_lease_expires_at <= p_claimed_at OR p_lease_expires_at > p_claimed_at + interval '30 minutes'
    OR p_claimed_at > clock_timestamp() + interval '5 minutes' THEN
    RAISE EXCEPTION USING ERRCODE = 'PT422', MESSAGE = 'invalid_taiwan_data_claim';
  END IF;
  RETURN QUERY
  WITH picked AS (
    SELECT q.job_id FROM public.taiwan_data_refresh_queue_v5 q
    WHERE (q.status = 'queued' AND COALESCE(q.next_attempt_at, q.queued_at) <= p_claimed_at)
       OR (q.status = 'running' AND q.lease_expires_at < p_claimed_at)
    ORDER BY q.queued_at, q.job_id
    FOR UPDATE SKIP LOCKED LIMIT p_limit
  ), claimed AS (
    UPDATE public.taiwan_data_refresh_queue_v5 q SET status='running', attempts=q.attempts+1,
      lease_owner=p_owner, lease_expires_at=p_lease_expires_at, updated_at=p_claimed_at
    FROM picked WHERE q.job_id=picked.job_id
    RETURNING q.job_id,q.dataset,q.symbol,q.exchange,q.refresh_phase,q.requested_session_date,q.attempts
  ) SELECT * FROM claimed;
END $claim$;

CREATE OR REPLACE FUNCTION public.read_taiwan_data_candidate_universe_v5(p_limit integer DEFAULT 5000)
RETURNS TABLE(symbol text, exchange text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $candidate_universe$
  WITH candidate_ids AS (
    SELECT DISTINCT stock_id FROM public.candidate_daily_stage_snapshots
  ), resolved AS (
    SELECT s.symbol, i.exchange,
      row_number() OVER (PARTITION BY s.id ORDER BY i.recorded_at DESC NULLS LAST) AS rn
    FROM candidate_ids c
    JOIN public.stocks s ON s.id=c.stock_id AND s.market='TW'
    JOIN public.stock_instruments_v3 i ON i.symbol=s.symbol
      AND i.instrument_type='common_stock' AND i.listing_status='active' AND i.exchange IN ('TWSE','TPEX')
  )
  SELECT symbol,exchange FROM resolved WHERE rn=1 ORDER BY symbol LIMIT p_limit;
$candidate_universe$;

CREATE OR REPLACE FUNCTION public.complete_taiwan_data_refresh_job_v5(
  p_job_id uuid, p_owner text, p_result jsonb, p_completed_at timestamptz
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $complete$
DECLARE v_status text; v_attempt jsonb; v_order integer := 0; v_job_attempts integer; v_terminal text;
  v_dataset text; v_symbol text; v_exchange text; v_phase text;
BEGIN
  IF jsonb_typeof(p_result) <> 'object' OR p_result->>'schema' <> 'taiwan-data-provider-result-v1'
    OR p_result->>'terminal' NOT IN ('complete','empty','timeout','usage_limited','auth_failed','http_error','network_error','schema_invalid','not_configured')
    OR jsonb_typeof(p_result->'attempts') <> 'array' OR jsonb_array_length(p_result->'attempts') NOT BETWEEN 1 AND 2 THEN
    RAISE EXCEPTION USING ERRCODE = 'PT422', MESSAGE = 'invalid_taiwan_data_terminal_result';
  END IF;
  SELECT status,attempts,dataset,symbol,exchange,refresh_phase
    INTO v_status,v_job_attempts,v_dataset,v_symbol,v_exchange,v_phase
    FROM public.taiwan_data_refresh_queue_v5
    WHERE job_id=p_job_id AND status='running' AND lease_owner=p_owner AND lease_expires_at >= p_completed_at FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'taiwan_data_job_lease_lost'; END IF;
  IF p_result->>'dataset' IS DISTINCT FROM v_dataset
    OR p_result->>'symbol' IS DISTINCT FROM v_symbol
    OR p_result->>'exchange' IS DISTINCT FROM v_exchange
    OR p_result->>'phase' IS DISTINCT FROM v_phase THEN
    RAISE EXCEPTION USING ERRCODE = 'PT422', MESSAGE = 'taiwan_data_result_identity_mismatch';
  END IF;
  IF p_result->>'terminal'='complete' AND (
    COALESCE((p_result->>'actionEligible')::boolean,false) IS NOT TRUE
    OR NOT EXISTS(SELECT 1 FROM public.taiwan_data_canonical_results_v5 c WHERE c.job_id=p_job_id)
  ) THEN RAISE EXCEPTION USING ERRCODE='PT422', MESSAGE='taiwan_data_canonical_persistence_required'; END IF;
  SELECT COALESCE(max(attempt_order),0) INTO v_order FROM public.taiwan_data_provider_attempts_v5 WHERE job_id=p_job_id;
  FOR v_attempt IN SELECT value FROM jsonb_array_elements(p_result->'attempts') LOOP
    v_order := v_order + 1;
    IF v_attempt->>'provider' NOT IN ('twse','tpex','finmind')
      OR v_attempt->>'authorityTier' NOT IN ('official_primary','finmind_fallback')
      OR v_attempt->>'terminal' NOT IN ('complete','empty','timeout','usage_limited','auth_failed','http_error','network_error','schema_invalid','not_configured')
      OR (v_attempt->>'provider'='finmind') <> (v_attempt->>'authorityTier'='finmind_fallback')
      OR COALESCE((v_attempt->>'responseBytes')::integer, -1) NOT BETWEEN 0 AND 2097152
      OR (v_attempt->>'responseSha256' IS NOT NULL AND v_attempt->>'responseSha256' !~ '^[0-9a-f]{64}$')
      OR (v_attempt->>'httpStatus' IS NOT NULL AND COALESCE((v_attempt->>'httpStatus')::integer,0) NOT BETWEEN 100 AND 599)
    THEN RAISE EXCEPTION USING ERRCODE = 'PT422', MESSAGE = 'invalid_taiwan_data_attempt'; END IF;
    INSERT INTO public.taiwan_data_provider_attempts_v5(
      job_id,attempt_order,provider,authority_tier,terminal_status,source_url,fetched_at,http_status,response_sha256,response_bytes,api_usage,normalized_payload,detail
    ) VALUES (
      p_job_id,v_order,v_attempt->>'provider',v_attempt->>'authorityTier',v_attempt->>'terminal',
      COALESCE(v_attempt->>'sourceUrl',''),(v_attempt->>'fetchedAt')::timestamptz,
      NULLIF(v_attempt->>'httpStatus','')::integer,v_attempt->>'responseSha256',(v_attempt->>'responseBytes')::integer,
      NULLIF(v_attempt->'apiUsage','null'::jsonb),
      NULLIF(v_attempt->'normalizedPayload','null'::jsonb),
      v_attempt->>'detail'
    );
  END LOOP;
  v_terminal:=p_result->>'terminal';
  IF v_terminal IN ('timeout','usage_limited','http_error','network_error') AND v_job_attempts < 3 THEN
    UPDATE public.taiwan_data_refresh_queue_v5 SET status='queued',terminal_status=NULL,terminal_result=NULL,
      completed_at=NULL,lease_owner=NULL,lease_expires_at=NULL,next_attempt_at=p_completed_at + interval '15 minutes',updated_at=p_completed_at
    WHERE job_id=p_job_id;
    RETURN 'retry_scheduled';
  END IF;
  UPDATE public.taiwan_data_refresh_queue_v5 SET status='terminal',terminal_status=v_terminal,terminal_result=p_result,
    completed_at=p_completed_at,lease_owner=NULL,lease_expires_at=NULL,next_attempt_at=NULL,updated_at=p_completed_at WHERE job_id=p_job_id;
  RETURN 'terminal';
END $complete$;

CREATE OR REPLACE FUNCTION public.persist_taiwan_data_canonical_result_v5(
  p_job_id uuid, p_owner text, p_result jsonb, p_persisted_at timestamptz
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $persist$
DECLARE v_dataset text; v_symbol text; v_exchange text; v_session date; v_provider text; v_tier text;
  v_records jsonb; v_hash text; v_id uuid; v_stock_id uuid; v_row jsonb;
  v_open numeric; v_high numeric; v_low numeric; v_close numeric; v_volume numeric; v_pe numeric; v_pb numeric; v_revenue numeric;
  v_source_url text; v_pe_text text; v_pb_text text; v_pe_index integer; v_pb_index integer;
  v_row_symbol text; v_period_text text; v_period date; v_typed_rows integer := 0;
BEGIN
  IF jsonb_typeof(p_result)<>'object' OR p_result->>'schema'<>'taiwan-data-provider-result-v1'
    OR p_result->>'terminal'<>'complete' OR jsonb_typeof(p_result->'canonical')<>'object'
    OR p_result->'canonical'->>'schema'<>'taiwan-data-canonical-v1'
    OR jsonb_typeof(p_result->'canonical'->'records')<>'array'
    OR jsonb_array_length(p_result->'canonical'->'records') NOT BETWEEN 1 AND 10000 THEN
    RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='invalid_taiwan_canonical_result';
  END IF;
  SELECT dataset,symbol,exchange,requested_session_date INTO v_dataset,v_symbol,v_exchange,v_session
  FROM public.taiwan_data_refresh_queue_v5 WHERE job_id=p_job_id AND status='running' AND lease_owner=p_owner AND lease_expires_at>=p_persisted_at FOR UPDATE;
  IF v_dataset IS NULL OR p_result->>'dataset' IS DISTINCT FROM v_dataset OR p_result->>'symbol' IS DISTINCT FROM v_symbol
    OR p_result->>'exchange' IS DISTINCT FROM v_exchange OR (p_result->'canonical'->>'expectedSessionDate')::date IS DISTINCT FROM v_session THEN
    RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='taiwan_canonical_identity_mismatch';
  END IF;
  v_provider:=p_result->>'selectedProvider'; v_tier:=p_result->>'selectedAuthorityTier'; v_records:=p_result->'canonical'->'records';
  IF v_provider NOT IN ('twse','tpex','finmind') OR v_tier NOT IN ('official_primary','finmind_fallback')
    OR (v_provider='finmind') <> (v_tier='finmind_fallback') THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='taiwan_canonical_provenance_invalid'; END IF;
  SELECT attempt->>'sourceUrl' INTO v_source_url FROM jsonb_array_elements(p_result->'attempts') attempt
  WHERE attempt->>'provider'=v_provider AND attempt->>'authorityTier'=v_tier LIMIT 1;
  IF (v_provider='finmind' AND v_source_url !~ '^https://api\.finmindtrade\.com/api/v4/data(?:\?|$)')
    OR (v_provider='twse' AND v_source_url !~ '^https://(www\.twse\.com\.tw|openapi\.twse\.com\.tw|mopsov\.twse\.com\.tw)/')
    OR (v_provider='tpex' AND v_source_url !~ '^https://www\.tpex\.org\.tw/') THEN
    RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='taiwan_canonical_source_url_invalid';
  END IF;
  v_hash:=encode(extensions.digest(convert_to(v_records::text,'utf8'),'sha256'),'hex');
  INSERT INTO public.taiwan_data_canonical_results_v5(job_id,dataset,symbol,exchange,requested_session_date,provider,authority_tier,canonical_schema,record_count,records,records_sha256,persisted_at)
  VALUES(p_job_id,v_dataset,v_symbol,v_exchange,v_session,v_provider,v_tier,'taiwan-data-canonical-v1',jsonb_array_length(v_records),v_records,v_hash,p_persisted_at)
  ON CONFLICT(job_id) DO NOTHING RETURNING canonical_result_id INTO v_id;
  IF v_id IS NULL THEN SELECT canonical_result_id INTO v_id FROM public.taiwan_data_canonical_results_v5 WHERE job_id=p_job_id AND records_sha256=v_hash; END IF;
  IF v_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='taiwan_canonical_conflict'; END IF;
  -- Aggregate valuation/revenue responses are fetched once per exchange. Each
  -- canonical row is mapped to its own stock before a typed upsert; no loop of
  -- candidate-specific official requests is permitted.
  IF v_dataset IN ('daily_valuation','monthly_revenue') AND v_symbol IS NULL THEN
    FOR v_row IN SELECT value FROM jsonb_array_elements(v_records) value LOOP
      v_row_symbol:=COALESCE(v_row->>'stock_id',v_row->>'data_id',v_row->>'公司代號',v_row->>'證券代號',v_row->>'股票代號',v_row->'values'->>0);
      IF v_row_symbol !~ '^\d{4}$' THEN CONTINUE; END IF;
      SELECT id INTO v_stock_id FROM public.stocks WHERE symbol=v_row_symbol AND market='TW';
      IF v_stock_id IS NULL THEN CONTINUE; END IF;
      IF v_dataset='daily_valuation' THEN
        v_pe_text:=COALESCE(v_row->>'PER',v_row->>'pe_ratio',v_row->>'本益比');
        v_pb_text:=COALESCE(v_row->>'PBR',v_row->>'pb_ratio',v_row->>'股價淨值比');
        IF jsonb_typeof(v_row->'fields')='array' THEN
          SELECT ordinal-1 INTO v_pe_index FROM jsonb_array_elements_text(v_row->'fields') WITH ORDINALITY item(name,ordinal) WHERE name='本益比' LIMIT 1;
          SELECT ordinal-1 INTO v_pb_index FROM jsonb_array_elements_text(v_row->'fields') WITH ORDINALITY item(name,ordinal) WHERE name='股價淨值比' LIMIT 1;
          v_pe_text:=COALESCE(v_pe_text,v_row->'values'->>v_pe_index); v_pb_text:=COALESCE(v_pb_text,v_row->'values'->>v_pb_index);
        END IF;
        v_pe:=NULLIF(regexp_replace(COALESCE(v_pe_text,''),'[^0-9.\-]','','g'),'')::numeric;
        v_pb:=NULLIF(regexp_replace(COALESCE(v_pb_text,''),'[^0-9.\-]','','g'),'')::numeric;
        IF v_pe IS NULL AND v_pb IS NULL THEN CONTINUE; END IF;
        INSERT INTO public.official_multiple_history(stock_id,month_end,close,pe_ratio,pb_ratio,source_url,as_of,available_at,provenance)
        VALUES(v_stock_id,v_session,NULL,v_pe,v_pb,v_source_url,(v_session::text||'T13:30:00+08:00')::timestamptz,p_persisted_at,jsonb_build_object('canonical_result_id',v_id,'provider',v_provider,'authorityTier',v_tier,'valuation_parser_version','taiwan-data-v5'))
        ON CONFLICT(stock_id,month_end) DO UPDATE SET pe_ratio=EXCLUDED.pe_ratio,pb_ratio=EXCLUDED.pb_ratio,source_url=EXCLUDED.source_url,as_of=EXCLUDED.as_of,available_at=EXCLUDED.available_at,provenance=EXCLUDED.provenance;
        v_typed_rows:=v_typed_rows+1;
      ELSE
        v_period_text:=COALESCE(v_row->>'revenue_month',v_row->>'date',v_row->>'資料年月');
        v_period:=CASE
          WHEN v_period_text ~ '^\d{4}-\d{2}' THEN (substring(v_period_text,1,7)||'-01')::date
          WHEN v_period_text ~ '^\d{3}/\d{2}$' THEN ((substring(v_period_text,1,3)::integer+1911)::text||'-'||substring(v_period_text,5,2)||'-01')::date
          WHEN v_period_text ~ '^\d{5}$' THEN ((substring(v_period_text,1,3)::integer+1911)::text||'-'||substring(v_period_text,4,2)||'-01')::date
          ELSE NULL END;
        v_revenue:=NULLIF(regexp_replace(COALESCE(v_row->>'revenue',v_row->>'monthly_revenue',v_row->>'當月營收',v_row->>'營業收入-當月營收',''),'[^0-9.\-]','','g'),'')::numeric;
        IF v_period IS NULL OR v_revenue IS NULL OR v_revenue<0 THEN CONTINUE; END IF;
        INSERT INTO public.revenue_signals(stock_id,as_of_date,monthly_revenue,yoy_growth,mom_growth,source_url)
        VALUES(v_stock_id,v_period,v_revenue,NULL,NULL,v_source_url)
        ON CONFLICT(stock_id,as_of_date) DO UPDATE SET monthly_revenue=EXCLUDED.monthly_revenue,source_url=EXCLUDED.source_url;
        v_typed_rows:=v_typed_rows+1;
      END IF;
    END LOOP;
    IF v_typed_rows=0 AND v_dataset='daily_valuation' THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='aggregate_valuation_no_typed_rows'; END IF;
    IF v_typed_rows=0 AND v_dataset='monthly_revenue' THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='aggregate_revenue_no_typed_rows'; END IF;
    RETURN v_id;
  END IF;
  -- These are the three canonical planes consumed by candidate research. The
  -- generic ledger above is audit lineage; success is not promoted until this
  -- same transaction writes the typed research tables.
  IF v_dataset IN ('daily_price','daily_valuation','monthly_revenue') THEN
    SELECT id INTO v_stock_id FROM public.stocks WHERE symbol=v_symbol AND market='TW';
    IF v_stock_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='taiwan_canonical_stock_missing'; END IF;
    SELECT value INTO v_row FROM jsonb_array_elements(v_records) value
      WHERE COALESCE(value->>'stock_id',value->>'data_id',value->>'公司代號',value->'values'->>0,v_symbol)=v_symbol LIMIT 1;
    v_row:=COALESCE(v_row,v_records->0);
  END IF;
  IF v_dataset='daily_price' THEN
    v_open:=NULLIF(regexp_replace(COALESCE(v_row->>'open',v_row->>'Open',v_row->'values'->>3,''),'[^0-9.\-]','','g'),'')::numeric;
    v_high:=NULLIF(regexp_replace(COALESCE(v_row->>'max',v_row->>'high',v_row->>'High',v_row->'values'->>4,''),'[^0-9.\-]','','g'),'')::numeric;
    v_low:=NULLIF(regexp_replace(COALESCE(v_row->>'min',v_row->>'low',v_row->>'Low',v_row->'values'->>5,''),'[^0-9.\-]','','g'),'')::numeric;
    v_close:=NULLIF(regexp_replace(COALESCE(v_row->>'close',v_row->>'Close',v_row->'values'->>6,''),'[^0-9.\-]','','g'),'')::numeric;
    v_volume:=NULLIF(regexp_replace(COALESCE(v_row->>'Trading_Volume',v_row->>'volume',v_row->>'Volume',v_row->'values'->>1,''),'[^0-9.\-]','','g'),'')::numeric;
    IF v_provider='tpex' AND v_volume IS NOT NULL AND jsonb_typeof(v_row->'fields')='array' AND EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(v_row->'fields') item(name)
      WHERE regexp_replace(item.name,'\s','','g')='成交張數'
    ) THEN v_volume:=v_volume*1000; END IF;
    IF v_open IS NULL OR v_high IS NULL OR v_low IS NULL OR v_close IS NULL OR v_open<=0 OR v_high<GREATEST(v_open,v_close) OR v_low>LEAST(v_open,v_close) THEN
      RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='daily_price_canonical_values_invalid';
    END IF;
    INSERT INTO public.official_price_history(stock_id,session_date,open,high,low,close,volume,source_url,as_of,available_at,provenance)
    VALUES(v_stock_id,v_session,v_open,v_high,v_low,v_close,v_volume,v_source_url,(v_session::text||'T13:30:00+08:00')::timestamptz,p_persisted_at,
      jsonb_build_object('canonical_result_id',v_id,'provider',v_provider,'authorityTier',v_tier))
    ON CONFLICT(stock_id,session_date) DO UPDATE SET open=EXCLUDED.open,high=EXCLUDED.high,low=EXCLUDED.low,close=EXCLUDED.close,volume=EXCLUDED.volume,source_url=EXCLUDED.source_url,as_of=EXCLUDED.as_of,available_at=EXCLUDED.available_at,provenance=EXCLUDED.provenance;
  ELSIF v_dataset='daily_valuation' THEN
    v_pe_text:=COALESCE(v_row->>'PER',v_row->>'pe_ratio',v_row->>'本益比');
    v_pb_text:=COALESCE(v_row->>'PBR',v_row->>'pb_ratio',v_row->>'股價淨值比');
    IF jsonb_typeof(v_row->'fields')='array' THEN
      SELECT ordinal-1 INTO v_pe_index FROM jsonb_array_elements_text(v_row->'fields') WITH ORDINALITY item(name,ordinal) WHERE name='本益比' LIMIT 1;
      SELECT ordinal-1 INTO v_pb_index FROM jsonb_array_elements_text(v_row->'fields') WITH ORDINALITY item(name,ordinal) WHERE name='股價淨值比' LIMIT 1;
      v_pe_text:=COALESCE(v_pe_text,v_row->'values'->>v_pe_index);
      v_pb_text:=COALESCE(v_pb_text,v_row->'values'->>v_pb_index);
    END IF;
    v_pe:=NULLIF(regexp_replace(COALESCE(v_pe_text,''),'[^0-9.\-]','','g'),'')::numeric;
    v_pb:=NULLIF(regexp_replace(COALESCE(v_pb_text,''),'[^0-9.\-]','','g'),'')::numeric;
    IF v_pe IS NULL AND v_pb IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='daily_valuation_canonical_values_invalid'; END IF;
    INSERT INTO public.official_multiple_history(stock_id,month_end,close,pe_ratio,pb_ratio,source_url,as_of,available_at,provenance)
    VALUES(v_stock_id,v_session,NULL,v_pe,v_pb,v_source_url,(v_session::text||'T13:30:00+08:00')::timestamptz,p_persisted_at,
      jsonb_build_object('canonical_result_id',v_id,'provider',v_provider,'authorityTier',v_tier,'valuation_parser_version','taiwan-data-v5'))
    ON CONFLICT(stock_id,month_end) DO UPDATE SET pe_ratio=EXCLUDED.pe_ratio,pb_ratio=EXCLUDED.pb_ratio,source_url=EXCLUDED.source_url,as_of=EXCLUDED.as_of,available_at=EXCLUDED.available_at,provenance=EXCLUDED.provenance;
  ELSIF v_dataset='monthly_revenue' THEN
    v_revenue:=NULLIF(regexp_replace(COALESCE(v_row->>'revenue',v_row->>'monthly_revenue',v_row->>'當月營收',v_row->>'營業收入-當月營收',''),'[^0-9.\-]','','g'),'')::numeric;
    IF v_revenue IS NULL OR v_revenue<0 THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='monthly_revenue_canonical_values_invalid'; END IF;
    INSERT INTO public.revenue_signals(stock_id,as_of_date,monthly_revenue,yoy_growth,mom_growth,source_url)
    VALUES(v_stock_id,v_session,v_revenue,NULL,NULL,v_source_url)
    ON CONFLICT(stock_id,as_of_date) DO UPDATE SET monthly_revenue=EXCLUDED.monthly_revenue,source_url=EXCLUDED.source_url;
  END IF;
  RETURN v_id;
END $persist$;

CREATE OR REPLACE FUNCTION public.record_taiwan_data_publication_metadata_v5(
  p_session_date date, p_publication_phase text, p_data_cutoff_at timestamptz, p_dataset_completeness jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $publication$
DECLARE v_merged jsonb; v_total integer; v_complete integer; v_pct numeric; v_shadow boolean;
BEGIN
  IF p_publication_phase NOT IN ('preliminary','final') OR jsonb_typeof(p_dataset_completeness) <> 'object'
    OR p_data_cutoff_at > clock_timestamp() + interval '5 minutes' THEN
    RAISE EXCEPTION USING ERRCODE='PT422', MESSAGE='invalid_taiwan_publication_metadata';
  END IF;
  SELECT COALESCE(dataset_completeness,'{}'::jsonb) || p_dataset_completeness INTO v_merged
  FROM public.taiwan_data_publication_metadata_v5
  WHERE session_date=p_session_date AND publication_phase=p_publication_phase FOR UPDATE;
  v_merged:=COALESCE(v_merged,p_dataset_completeness);
  SELECT count(*),count(*) FILTER (WHERE value->>'terminal'='complete' AND value->>'persistence'='persisted') INTO v_total,v_complete
  FROM jsonb_each(v_merged)
  WHERE split_part(key,':',1) IN ('daily_price','daily_valuation','monthly_revenue');
  v_pct:=CASE WHEN v_total=0 THEN 0 ELSE round(100.0*v_complete/v_total,2) END;
  -- Only datasets transactionally projected into candidate research tables may
  -- attest final provider completeness. Other authority planes are validated
  -- by candidate research and its immutable replay.
  v_shadow:=p_publication_phase='final' AND NOT EXISTS (
    SELECT 1 FROM unnest(ARRAY[
      'daily_price','daily_valuation','monthly_revenue'
    ]) required(dataset)
    WHERE NOT EXISTS (
      SELECT 1 FROM jsonb_each(v_merged) item(key,value)
      WHERE item.key=required.dataset OR item.key LIKE required.dataset||':%'
    ) OR EXISTS (
      SELECT 1 FROM jsonb_each(v_merged) item(key,value)
      WHERE (item.key=required.dataset OR item.key LIKE required.dataset||':%')
        AND (item.value->>'terminal'<>'complete' OR item.value->>'persistence'<>'persisted')
    )
  );
  INSERT INTO public.taiwan_data_publication_metadata_v5(
    session_date,publication_phase,data_cutoff_at,dataset_completeness,dataset_completeness_pct,shadow_eligible,recorded_at
  ) VALUES(p_session_date,p_publication_phase,p_data_cutoff_at,v_merged,v_pct,v_shadow,clock_timestamp())
  ON CONFLICT(session_date,publication_phase) DO UPDATE SET
    data_cutoff_at=GREATEST(public.taiwan_data_publication_metadata_v5.data_cutoff_at,EXCLUDED.data_cutoff_at),
    dataset_completeness=EXCLUDED.dataset_completeness,dataset_completeness_pct=EXCLUDED.dataset_completeness_pct,
    shadow_eligible=EXCLUDED.shadow_eligible,recorded_at=EXCLUDED.recorded_at;
  RETURN jsonb_build_object('publicationPhase',p_publication_phase,'dataCutoffAt',p_data_cutoff_at,
    'datasetCompletenessPct',v_pct,'shadowEligible',v_shadow);
END $publication$;

CREATE OR REPLACE FUNCTION public.read_taiwan_data_publication_metadata_v5(
  p_session_date date, p_publication_phase text
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $read_publication$
  SELECT jsonb_build_object('publicationPhase',publication_phase,'dataCutoffAt',data_cutoff_at,
    'datasetCompleteness',dataset_completeness,'datasetCompletenessPct',dataset_completeness_pct,
    'shadowEligible',shadow_eligible)
  FROM public.taiwan_data_publication_metadata_v5
  WHERE session_date=p_session_date AND publication_phase=p_publication_phase;
$read_publication$;

-- Keep the RPC signature stable for existing writers. Snapshot phase and
-- completeness are derived from the home payload so old callers stay final.
CREATE OR REPLACE FUNCTION public.publish_radar_public_snapshots(
  p_home_payload JSONB,p_home_hash TEXT,p_home_etag TEXT,p_daily_payload JSONB,p_daily_hash TEXT,p_daily_etag TEXT,
  p_schema_version TEXT,p_content_as_of TIMESTAMPTZ,p_pipeline_run_id UUID,p_ruleset_version TEXT,p_model_version TEXT,p_published_at TIMESTAMPTZ
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $radar$
DECLARE home_id UUID; daily_id UUID; v_phase text; v_cutoff timestamptz; v_pct numeric;
BEGIN
  v_phase:=COALESCE(NULLIF(p_home_payload->>'snapshotPhase',''),'final');
  IF v_phase NOT IN ('preliminary','final') THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='invalid_snapshot_phase'; END IF;
  v_cutoff:=COALESCE(NULLIF(p_home_payload->>'dataCutoffAt','')::timestamptz,p_content_as_of);
  v_pct:=COALESCE(NULLIF(p_home_payload->>'datasetCompletenessPct','')::numeric,100);
  IF v_pct NOT BETWEEN 0 AND 100 THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='invalid_dataset_completeness_pct'; END IF;
  INSERT INTO public.radar_public_snapshots(window_key,schema_version,payload_json,payload_hash,etag,content_as_of,pipeline_run_id,ruleset_version,model_version,status,published_at,publication_phase,data_cutoff_at,dataset_completeness_pct)
  VALUES('home',p_schema_version,p_home_payload,p_home_hash,p_home_etag,p_content_as_of,p_pipeline_run_id,p_ruleset_version,p_model_version,'valid',p_published_at,v_phase,v_cutoff,v_pct)
  RETURNING id INTO home_id;
  INSERT INTO public.radar_public_snapshots(window_key,schema_version,payload_json,payload_hash,etag,content_as_of,pipeline_run_id,ruleset_version,model_version,status,published_at,publication_phase,data_cutoff_at,dataset_completeness_pct)
  VALUES('daily',p_schema_version,p_daily_payload,p_daily_hash,p_daily_etag,p_content_as_of,p_pipeline_run_id,p_ruleset_version,p_model_version,'valid',p_published_at,v_phase,v_cutoff,v_pct)
  RETURNING id INTO daily_id;
  INSERT INTO public.radar_publication_state(window_key,status,last_attempt_at,last_success_snapshot_id,terminal_reason,updated_at)
  VALUES('home','valid',p_published_at,home_id,NULL,p_published_at),('daily','valid',p_published_at,daily_id,NULL,p_published_at)
  ON CONFLICT(window_key) DO UPDATE SET status=EXCLUDED.status,last_attempt_at=EXCLUDED.last_attempt_at,last_success_snapshot_id=EXCLUDED.last_success_snapshot_id,terminal_reason=NULL,updated_at=EXCLUDED.updated_at;
  RETURN jsonb_build_object('homeId',home_id,'dailyId',daily_id,'publicationPhase',v_phase,'dataCutoffAt',v_cutoff,'datasetCompletenessPct',v_pct);
END $radar$;

REVOKE ALL ON TABLE public.taiwan_data_refresh_queue_v5, public.taiwan_data_provider_attempts_v5, public.taiwan_data_canonical_results_v5, public.taiwan_data_publication_metadata_v5 FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.enqueue_taiwan_data_refresh_v5(text,text,text,text,text,date,timestamptz),
  public.claim_taiwan_data_refresh_jobs_v5(integer,text,timestamptz,timestamptz),
  public.read_taiwan_data_candidate_universe_v5(integer),
  public.complete_taiwan_data_refresh_job_v5(uuid,text,jsonb,timestamptz),
  public.persist_taiwan_data_canonical_result_v5(uuid,text,jsonb,timestamptz),
  public.record_taiwan_data_publication_metadata_v5(date,text,timestamptz,jsonb),
  public.read_taiwan_data_publication_metadata_v5(date,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_taiwan_data_refresh_v5(text,text,text,text,text,date,timestamptz),
  public.claim_taiwan_data_refresh_jobs_v5(integer,text,timestamptz,timestamptz),
  public.read_taiwan_data_candidate_universe_v5(integer),
  public.complete_taiwan_data_refresh_job_v5(uuid,text,jsonb,timestamptz),
  public.persist_taiwan_data_canonical_result_v5(uuid,text,jsonb,timestamptz),
  public.record_taiwan_data_publication_metadata_v5(date,text,timestamptz,jsonb),
  public.read_taiwan_data_publication_metadata_v5(date,text) TO service_role;

COMMIT;
