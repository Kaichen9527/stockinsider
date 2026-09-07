-- Point-in-time, append-only enterprise multiple observations. Historical
-- distributions are built from observations actually available on each
-- official session; the migration deliberately does not synthesize backfill.
BEGIN;

CREATE TABLE IF NOT EXISTS public.candidate_enterprise_multiple_snapshots_v6 (
  stock_id uuid NOT NULL REFERENCES public.stocks(id) ON DELETE RESTRICT,
  session_date date NOT NULL,
  model_version text NOT NULL CHECK(model_version ~ '^enterprise-multiple-v[0-9]+$'),
  current_price numeric NOT NULL CHECK(current_price>0),
  diluted_shares numeric NOT NULL CHECK(diluted_shares>0),
  total_debt numeric NOT NULL CHECK(total_debt>=0),
  cash_and_equivalents numeric NOT NULL CHECK(cash_and_equivalents>=0),
  enterprise_value numeric NOT NULL CHECK(enterprise_value>0),
  ttm_ebitda numeric,
  ttm_revenue numeric,
  ev_ebitda_multiple numeric CHECK(ev_ebitda_multiple>0 AND ev_ebitda_multiple<1000),
  ev_sales_multiple numeric CHECK(ev_sales_multiple>0 AND ev_sales_multiple<1000),
  fact_ids uuid[] NOT NULL CHECK(cardinality(fact_ids) BETWEEN 1 AND 128),
  calculation_input_hash text NOT NULL CHECK(calculation_input_hash ~ '^[0-9a-f]{64}$'),
  available_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(stock_id,session_date,model_version,calculation_input_hash),
  CHECK(ev_ebitda_multiple IS NOT NULL OR ev_sales_multiple IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS candidate_enterprise_multiple_snapshots_v6_history_idx
  ON public.candidate_enterprise_multiple_snapshots_v6(stock_id,session_date DESC,available_at);

ALTER TABLE public.candidate_enterprise_multiple_snapshots_v6 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.candidate_enterprise_multiple_snapshots_v6 FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.candidate_enterprise_multiple_snapshots_v6 TO service_role;

CREATE OR REPLACE FUNCTION public.append_candidate_enterprise_multiple_snapshot_v6(
  p_stock_id uuid,p_session_date date,p_model_version text,p_payload jsonb,p_fact_ids uuid[],
  p_available_at timestamptz,p_caller_principal uuid
) RETURNS TABLE(idempotent_replay boolean,calculation_input_hash text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp AS $function$
DECLARE v_hash text; v_existing text; v_inserted boolean:=false; v_enterprise numeric; v_ev_ebitda numeric; v_ev_sales numeric;
BEGIN
  IF p_stock_id IS NULL OR p_available_at IS NULL
    OR NOT public.internal_principal_role_is_exact_v3_internal(p_caller_principal,'opportunity_runner',clock_timestamp())
    OR p_session_date IS NULL OR p_session_date>p_available_at::date OR p_available_at>clock_timestamp()
    OR COALESCE(p_model_version,'') !~ '^enterprise-multiple-v[0-9]+$'
    OR jsonb_typeof(COALESCE(p_payload,'null'::jsonb))<>'object'
    OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(p_payload) key)
       IS DISTINCT FROM ARRAY['cash_and_equivalents','current_price','diluted_shares','total_debt','ttm_ebitda','ttm_revenue']::text[]
    OR p_fact_ids IS NULL OR cardinality(p_fact_ids) NOT BETWEEN 1 AND 128
  THEN RAISE EXCEPTION 'invalid_enterprise_multiple_snapshot'; END IF;
  v_enterprise:=(p_payload->>'current_price')::numeric*(p_payload->>'diluted_shares')::numeric
    +(p_payload->>'total_debt')::numeric-(p_payload->>'cash_and_equivalents')::numeric;
  IF v_enterprise<=0 OR (p_payload->>'current_price')::numeric<=0 OR (p_payload->>'diluted_shares')::numeric<=0
    OR (p_payload->>'total_debt')::numeric<0 OR (p_payload->>'cash_and_equivalents')::numeric<0
  THEN RAISE EXCEPTION 'invalid_enterprise_multiple_snapshot_values'; END IF;
  v_ev_ebitda:=CASE WHEN NULLIF(p_payload->>'ttm_ebitda','')::numeric>0
    THEN v_enterprise/(p_payload->>'ttm_ebitda')::numeric END;
  v_ev_sales:=CASE WHEN NULLIF(p_payload->>'ttm_revenue','')::numeric>0
    THEN v_enterprise/(p_payload->>'ttm_revenue')::numeric END;
  IF (v_ev_ebitda IS NULL OR v_ev_ebitda>=1000) AND (v_ev_sales IS NULL OR v_ev_sales>=1000)
  THEN RAISE EXCEPTION 'enterprise_multiple_not_defensible'; END IF;
  v_hash:=encode(digest(convert_to(p_payload::text||'|'||array_to_string(p_fact_ids,','),'utf8'),'sha256'),'hex');
  INSERT INTO public.candidate_enterprise_multiple_snapshots_v6(
    stock_id,session_date,model_version,current_price,diluted_shares,total_debt,cash_and_equivalents,
    enterprise_value,ttm_ebitda,ttm_revenue,ev_ebitda_multiple,ev_sales_multiple,fact_ids,calculation_input_hash,available_at
  ) VALUES (
    p_stock_id,p_session_date,p_model_version,(p_payload->>'current_price')::numeric,(p_payload->>'diluted_shares')::numeric,
    (p_payload->>'total_debt')::numeric,(p_payload->>'cash_and_equivalents')::numeric,v_enterprise,
    NULLIF(p_payload->>'ttm_ebitda','')::numeric,NULLIF(p_payload->>'ttm_revenue','')::numeric,
    CASE WHEN v_ev_ebitda>0 AND v_ev_ebitda<1000 THEN v_ev_ebitda END,
    CASE WHEN v_ev_sales>0 AND v_ev_sales<1000 THEN v_ev_sales END,p_fact_ids,v_hash,p_available_at
  ) ON CONFLICT DO NOTHING RETURNING candidate_enterprise_multiple_snapshots_v6.calculation_input_hash INTO v_existing;
  v_inserted:=FOUND;
  IF NOT v_inserted THEN
    SELECT snapshot.calculation_input_hash INTO v_existing
    FROM public.candidate_enterprise_multiple_snapshots_v6 snapshot
    WHERE snapshot.stock_id=p_stock_id AND snapshot.session_date=p_session_date AND snapshot.model_version=p_model_version
      AND snapshot.calculation_input_hash=v_hash;
  END IF;
  IF v_existing IS DISTINCT FROM v_hash THEN RAISE EXCEPTION 'enterprise_multiple_snapshot_conflict'; END IF;
  idempotent_replay:=NOT v_inserted;calculation_input_hash:=v_hash;RETURN NEXT;
END $function$;

REVOKE ALL ON FUNCTION public.append_candidate_enterprise_multiple_snapshot_v6(uuid,date,text,jsonb,uuid[],timestamptz,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.append_candidate_enterprise_multiple_snapshot_v6(uuid,date,text,jsonb,uuid[],timestamptz,uuid) TO service_role;

COMMIT;
