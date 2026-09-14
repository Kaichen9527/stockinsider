BEGIN;

CREATE TABLE IF NOT EXISTS public.candidate_history_authority_reconciliations_v1 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id UUID NOT NULL REFERENCES public.stocks(id),
  dataset TEXT NOT NULL CHECK (dataset IN ('price','multiple')),
  target_table TEXT NOT NULL CHECK (target_table IN ('official_price_history','official_multiple_history','fundamental_snapshots')),
  session_date DATE NOT NULL,
  replaced_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  old_values JSONB NOT NULL,
  old_source_url TEXT NOT NULL,
  old_provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
  new_values JSONB NOT NULL,
  new_source_url TEXT NOT NULL,
  terminal_reason TEXT NOT NULL CHECK (terminal_reason='non_authoritative_cache_replaced_by_exchange'),
  parser_version TEXT NOT NULL,
  UNIQUE(stock_id,dataset,target_table,session_date,new_source_url,parser_version)
);
CREATE INDEX IF NOT EXISTS candidate_history_authority_reconciliations_recent_v1
  ON public.candidate_history_authority_reconciliations_v1(replaced_at DESC,stock_id);
ALTER TABLE public.candidate_history_authority_reconciliations_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.candidate_history_authority_reconciliations_v1 FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.candidate_history_authority_reconciliations_v1 TO service_role;

CREATE OR REPLACE FUNCTION public.complete_candidate_history_month_v1(
  p_stock_id UUID,p_dataset TEXT,p_month DATE,p_attempted_at TIMESTAMPTZ,p_latest_session DATE,
  p_observed_through DATE,p_status TEXT,p_terminal_reason TEXT,p_next_attempt_at TIMESTAMPTZ,
  p_source_url TEXT,p_parser_version TEXT,p_prices JSONB,p_multiples JSONB
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_row JSONB; v_session DATE; v_sessions JSONB:='[]'::jsonb; v_conflict BOOLEAN:=p_status='conflict';
  v_status TEXT:=p_status; v_reason TEXT:=p_terminal_reason; v_attempt public.candidate_history_backfill_attempts_v1;
  v_available_at TIMESTAMPTZ:=clock_timestamp(); v_prior_conflict_reason TEXT;
  v_price public.official_price_history; v_multiple public.official_multiple_history; v_fundamental public.fundamental_snapshots;
  v_values_equal BOOLEAN; v_old_values JSONB;
BEGIN
  IF p_stock_id IS NULL OR p_dataset IS NULL OR p_dataset NOT IN ('price','multiple') OR p_month IS NULL OR extract(day FROM p_month)<>1
    OR p_attempted_at IS NULL OR p_latest_session IS NULL OR p_status IS NULL OR p_status NOT IN ('complete','retry','conflict')
    OR p_terminal_reason IS NULL OR p_parser_version IS NULL OR p_parser_version<>'candidate-history-month-v1'
    OR p_latest_session>(v_available_at AT TIME ZONE 'Asia/Taipei')::date
    OR p_source_url IS NULL OR p_source_url!~'^https://www\.(twse\.com\.tw|tpex\.org\.tw)/'
    OR jsonb_typeof(p_prices) IS DISTINCT FROM 'array' OR jsonb_typeof(p_multiples) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_prices)>31 OR jsonb_array_length(p_multiples)>1
    OR (p_dataset='price' AND jsonb_array_length(p_multiples)>0)
    OR (p_dataset='multiple' AND jsonb_array_length(p_prices)>0)
    OR (p_status='complete' AND jsonb_array_length(p_prices)+jsonb_array_length(p_multiples)=0)
    OR (p_status='retry' AND (p_next_attempt_at IS NULL OR p_next_attempt_at<=p_attempted_at))
    OR (p_status='conflict' AND (p_dataset<>'price' OR p_terminal_reason<>'official_history_provider_conflict'
      OR jsonb_array_length(p_prices)+jsonb_array_length(p_multiples)<>0 OR p_next_attempt_at IS NOT NULL
      OR p_observed_through IS NULL OR date_trunc('month',p_observed_through)::date<>p_month
      OR p_observed_through>p_latest_session))
  THEN RAISE EXCEPTION 'candidate_history_completion_invalid'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_stock_id::text||':'||p_dataset||':'||p_month::text,0));
  SELECT terminal_reason INTO v_prior_conflict_reason FROM public.candidate_history_backfill_months_v1
    WHERE stock_id=p_stock_id AND dataset=p_dataset AND month=p_month AND status='conflict';
  -- Provider-vs-provider contradictions remain quarantined. A legacy mirror row
  -- may be adjudicated only by a later complete exchange-owner response.
  IF FOUND AND (v_prior_conflict_reason<>'official_history_existing_row_conflict' OR p_status<>'complete') THEN v_conflict:=true; END IF;
  SELECT * INTO v_attempt FROM public.candidate_history_backfill_attempts_v1
    WHERE stock_id=p_stock_id AND dataset=p_dataset AND month=p_month AND attempted_at=p_attempted_at;
  IF FOUND THEN RETURN CASE WHEN v_prior_conflict_reason IS NOT NULL
    THEN jsonb_build_object('status','conflict','terminal_reason',v_prior_conflict_reason)
    ELSE jsonb_build_object('status',v_attempt.status,'terminal_reason',v_attempt.terminal_reason) END; END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(CASE WHEN p_dataset='price' THEN p_prices ELSE p_multiples END) LOOP
    v_session:=COALESCE(v_row->>'time',v_row->>'date')::date;
    IF v_session IS NULL OR date_trunc('month',v_session)::date<>p_month OR v_session>p_latest_session
      OR v_row->>'authorityTier' IS DISTINCT FROM 'official_primary'
      OR v_row->>'provider' IS DISTINCT FROM 'official_primary'
      OR v_row->>'sourceUrl' IS DISTINCT FROM p_source_url
    THEN RAISE EXCEPTION 'candidate_history_row_provenance_invalid'; END IF;
    IF p_dataset='price' THEN
      IF (v_row->>'open')::numeric IS NULL OR (v_row->>'high')::numeric IS NULL OR (v_row->>'low')::numeric IS NULL OR (v_row->>'close')::numeric IS NULL
        OR (v_row->>'low')::numeric<=0 OR (v_row->>'low')::numeric>least((v_row->>'open')::numeric,(v_row->>'close')::numeric)
        OR (v_row->>'high')::numeric<greatest((v_row->>'open')::numeric,(v_row->>'close')::numeric)
        OR (v_row->>'volume')::numeric<0 THEN RAISE EXCEPTION 'candidate_history_price_invalid'; END IF;
      SELECT * INTO v_price FROM public.official_price_history WHERE stock_id=p_stock_id AND session_date=v_session FOR UPDATE;
      IF FOUND THEN
        v_values_equal:=v_price.open IS NOT DISTINCT FROM (v_row->>'open')::numeric
          AND v_price.high IS NOT DISTINCT FROM (v_row->>'high')::numeric
          AND v_price.low IS NOT DISTINCT FROM (v_row->>'low')::numeric
          AND v_price.close IS NOT DISTINCT FROM (v_row->>'close')::numeric
          AND (v_price.volume IS NOT DISTINCT FROM (v_row->>'volume')::numeric
            OR (p_source_url~'^https://www\.tpex\.org\.tw/www/zh-tw/afterTrading/tradingStock'
              AND v_price.volume IS NOT NULL AND trunc(v_price.volume/1000)=trunc((v_row->>'volume')::numeric/1000)));
        IF v_price.source_url!~'^https://www\.(twse\.com\.tw|tpex\.org\.tw)/' THEN
            v_old_values:=jsonb_build_object('open',v_price.open,'high',v_price.high,'low',v_price.low,'close',v_price.close,'volume',v_price.volume);
            INSERT INTO public.candidate_history_authority_reconciliations_v1(stock_id,dataset,target_table,session_date,old_values,old_source_url,old_provenance,new_values,new_source_url,terminal_reason,parser_version)
              VALUES(p_stock_id,'price','official_price_history',v_session,v_old_values,v_price.source_url,v_price.provenance,
                jsonb_build_object('open',(v_row->>'open')::numeric,'high',(v_row->>'high')::numeric,'low',(v_row->>'low')::numeric,'close',(v_row->>'close')::numeric,'volume',(v_row->>'volume')::numeric),
                p_source_url,'non_authoritative_cache_replaced_by_exchange',p_parser_version) ON CONFLICT DO NOTHING;
            UPDATE public.official_price_history SET open=(v_row->>'open')::numeric,high=(v_row->>'high')::numeric,
              low=(v_row->>'low')::numeric,close=(v_row->>'close')::numeric,volume=(v_row->>'volume')::numeric,
              source_url=p_source_url,as_of=(v_session::text||'T13:30:00+08:00')::timestamptz,available_at=v_available_at,
              provenance=jsonb_build_object('provider','official_primary','authorityTier','official_primary','integrityStatus','valid','history_policy',p_parser_version,'reconciled_from','non_authoritative_cache')
              WHERE stock_id=p_stock_id AND session_date=v_session;
        ELSIF NOT v_values_equal THEN v_conflict:=true; END IF;
      END IF;
    ELSE
      IF ((v_row->>'peRatio')::numeric IS NULL AND (v_row->>'pbRatio')::numeric IS NULL)
        OR (v_row->>'peRatio')::numeric<=0 OR (v_row->>'pbRatio')::numeric<=0
      THEN RAISE EXCEPTION 'candidate_history_multiple_invalid'; END IF;
      SELECT * INTO v_multiple FROM public.official_multiple_history WHERE stock_id=p_stock_id AND month_end=v_session FOR UPDATE;
      IF FOUND THEN
        IF v_multiple.source_url!~'^https://www\.(twse\.com\.tw|tpex\.org\.tw)/' THEN
          INSERT INTO public.candidate_history_authority_reconciliations_v1(stock_id,dataset,target_table,session_date,old_values,old_source_url,old_provenance,new_values,new_source_url,terminal_reason,parser_version)
            VALUES(p_stock_id,'multiple','official_multiple_history',v_session,
              jsonb_build_object('peRatio',v_multiple.pe_ratio,'pbRatio',v_multiple.pb_ratio),v_multiple.source_url,v_multiple.provenance,
              jsonb_build_object('peRatio',(v_row->>'peRatio')::numeric,'pbRatio',(v_row->>'pbRatio')::numeric),p_source_url,
              'non_authoritative_cache_replaced_by_exchange',p_parser_version) ON CONFLICT DO NOTHING;
          UPDATE public.official_multiple_history SET pe_ratio=(v_row->>'peRatio')::numeric,pb_ratio=(v_row->>'pbRatio')::numeric,
            source_url=p_source_url,as_of=(v_session::text||'T13:30:00+08:00')::timestamptz,available_at=v_available_at,
            provenance=jsonb_build_object('provider','official_primary','official',true,'valuation_parser_version',v_row->>'parserVersion','history_policy',p_parser_version,'reconciled_from','non_authoritative_cache'),
            valuation_parser_version=v_row->>'parserVersion',quality_status='valid'
            WHERE stock_id=p_stock_id AND month_end=v_session;
        ELSIF v_multiple.pe_ratio IS DISTINCT FROM (v_row->>'peRatio')::numeric
          OR v_multiple.pb_ratio IS DISTINCT FROM (v_row->>'pbRatio')::numeric THEN v_conflict:=true; END IF;
      END IF;
    END IF;
    v_sessions:=v_sessions||jsonb_build_array(v_session::text);
  END LOOP;

  IF v_conflict THEN v_status:='conflict'; v_reason:=COALESCE(v_prior_conflict_reason,
    CASE WHEN p_status='conflict' THEN p_terminal_reason ELSE 'official_history_existing_row_conflict' END);
  ELSE
    FOR v_row IN SELECT value FROM jsonb_array_elements(p_prices) LOOP
      v_session:=(v_row->>'time')::date;
      INSERT INTO public.official_price_history(stock_id,session_date,open,high,low,close,volume,source_url,as_of,available_at,provenance)
        VALUES(p_stock_id,v_session,(v_row->>'open')::numeric,(v_row->>'high')::numeric,(v_row->>'low')::numeric,
          (v_row->>'close')::numeric,(v_row->>'volume')::numeric,p_source_url,
          (v_session::text||'T13:30:00+08:00')::timestamptz,v_available_at,
          jsonb_build_object('provider','official_primary','authorityTier','official_primary','integrityStatus','valid','history_policy',p_parser_version))
        ON CONFLICT(stock_id,session_date) DO NOTHING;
      SELECT * INTO v_price FROM public.official_price_history WHERE stock_id=p_stock_id AND session_date=v_session FOR UPDATE;
      v_values_equal:=FOUND AND v_price.open IS NOT DISTINCT FROM (v_row->>'open')::numeric
        AND v_price.high IS NOT DISTINCT FROM (v_row->>'high')::numeric
        AND v_price.low IS NOT DISTINCT FROM (v_row->>'low')::numeric
        AND v_price.close IS NOT DISTINCT FROM (v_row->>'close')::numeric
        AND (v_price.volume IS NOT DISTINCT FROM (v_row->>'volume')::numeric
          OR (p_source_url~'^https://www\.tpex\.org\.tw/www/zh-tw/afterTrading/tradingStock'
            AND v_price.volume IS NOT NULL AND trunc(v_price.volume/1000)=trunc((v_row->>'volume')::numeric/1000)));
      IF NOT v_values_equal THEN v_conflict:=true; END IF;
    END LOOP;
    FOR v_row IN SELECT value FROM jsonb_array_elements(p_multiples) LOOP
      v_session:=(v_row->>'date')::date;
      INSERT INTO public.official_multiple_history(stock_id,month_end,close,pe_ratio,pb_ratio,source_url,as_of,available_at,provenance,valuation_parser_version,quality_status)
        VALUES(p_stock_id,v_session,NULL,(v_row->>'peRatio')::numeric,(v_row->>'pbRatio')::numeric,p_source_url,
          (v_session::text||'T13:30:00+08:00')::timestamptz,v_available_at,
          jsonb_build_object('provider','official_primary','official',true,'valuation_parser_version',v_row->>'parserVersion','history_policy',p_parser_version),
          v_row->>'parserVersion','valid') ON CONFLICT(stock_id,month_end) DO NOTHING;
      SELECT * INTO v_multiple FROM public.official_multiple_history WHERE stock_id=p_stock_id AND month_end=v_session FOR UPDATE;
      IF NOT FOUND OR v_multiple.pe_ratio IS DISTINCT FROM (v_row->>'peRatio')::numeric OR v_multiple.pb_ratio IS DISTINCT FROM (v_row->>'pbRatio')::numeric
      THEN v_conflict:=true; CONTINUE; END IF;
      SELECT * INTO v_fundamental FROM public.fundamental_snapshots WHERE stock_id=p_stock_id AND as_of_date=v_session FOR UPDATE;
      IF FOUND AND v_fundamental.source_url!~'^https://www\.(twse\.com\.tw|tpex\.org\.tw)/' THEN
        INSERT INTO public.candidate_history_authority_reconciliations_v1(stock_id,dataset,target_table,session_date,old_values,old_source_url,old_provenance,new_values,new_source_url,terminal_reason,parser_version)
          VALUES(p_stock_id,'multiple','fundamental_snapshots',v_session,jsonb_build_object('peRatio',v_fundamental.pe_ratio,'pbRatio',v_fundamental.pb_ratio),
            v_fundamental.source_url,'{}'::jsonb,jsonb_build_object('peRatio',(v_row->>'peRatio')::numeric,'pbRatio',(v_row->>'pbRatio')::numeric),p_source_url,
            'non_authoritative_cache_replaced_by_exchange',p_parser_version) ON CONFLICT DO NOTHING;
        UPDATE public.fundamental_snapshots SET pe_ratio=(v_row->>'peRatio')::numeric,pb_ratio=(v_row->>'pbRatio')::numeric,
          source_url=p_source_url,valuation_parser_version=v_row->>'parserVersion',quality_status='valid'
          WHERE stock_id=p_stock_id AND as_of_date=v_session;
      ELSIF FOUND AND (v_fundamental.pe_ratio IS DISTINCT FROM (v_row->>'peRatio')::numeric OR v_fundamental.pb_ratio IS DISTINCT FROM (v_row->>'pbRatio')::numeric) THEN
        v_conflict:=true;
      ELSIF NOT FOUND THEN
        INSERT INTO public.fundamental_snapshots(stock_id,as_of_date,pe_ratio,pb_ratio,source_url,valuation_parser_version,quality_status)
          VALUES(p_stock_id,v_session,(v_row->>'peRatio')::numeric,(v_row->>'pbRatio')::numeric,p_source_url,v_row->>'parserVersion','valid');
      END IF;
    END LOOP;
  END IF;

  IF v_conflict THEN v_status:='conflict'; v_reason:=COALESCE(v_prior_conflict_reason,
    CASE WHEN p_status='conflict' THEN p_terminal_reason ELSE 'official_history_existing_row_conflict' END); END IF;
  INSERT INTO public.candidate_history_backfill_attempts_v1(stock_id,dataset,month,attempted_at,status,terminal_reason,acquired_rows,source_url,parser_version)
    VALUES(p_stock_id,p_dataset,p_month,p_attempted_at,v_status,v_reason,jsonb_array_length(v_sessions),p_source_url,p_parser_version);
  INSERT INTO public.candidate_history_backfill_months_v1(stock_id,dataset,month,status,attempted_at,next_attempt_at,attempts,observed_through,observed_sessions,terminal_reason,source_url,parser_version)
    VALUES(p_stock_id,p_dataset,p_month,v_status,p_attempted_at,CASE WHEN v_status='retry' THEN p_next_attempt_at END,1,p_observed_through,v_sessions,v_reason,p_source_url,p_parser_version)
    ON CONFLICT(stock_id,dataset,month) DO UPDATE SET status=excluded.status,attempted_at=excluded.attempted_at,
      next_attempt_at=excluded.next_attempt_at,attempts=candidate_history_backfill_months_v1.attempts+1,
      observed_through=excluded.observed_through,observed_sessions=excluded.observed_sessions,
      terminal_reason=excluded.terminal_reason,source_url=excluded.source_url,parser_version=excluded.parser_version;
  RETURN jsonb_build_object('status',v_status,'terminal_reason',v_reason);
END $$;
REVOKE ALL ON FUNCTION public.complete_candidate_history_month_v1(UUID,TEXT,DATE,TIMESTAMPTZ,DATE,DATE,TEXT,TEXT,TIMESTAMPTZ,TEXT,TEXT,JSONB,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_candidate_history_month_v1(UUID,TEXT,DATE,TIMESTAMPTZ,DATE,DATE,TEXT,TEXT,TIMESTAMPTZ,TEXT,TEXT,JSONB,JSONB) TO service_role;

COMMIT;
