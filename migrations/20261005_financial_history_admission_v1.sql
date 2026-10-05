-- Approved historical-storage/read-window separation. No facts are deleted,
-- retimed or merged by URL. Existing disclosure identity and RPC validation stay
-- intact; the 128-revision safety bound applies to ONE economic period.
BEGIN;
GRANT CREATE ON SCHEMA public TO opportunity_v3_rpc_owner;

CREATE INDEX IF NOT EXISTS opportunity_financial_facts_v3_history_page_v1
  ON public.opportunity_financial_facts_v3(stock_id,fact_key,duration_kind,
    estimate_kind,estimate_horizon,recorded_at,fact_id);
CREATE INDEX IF NOT EXISTS opportunity_financial_facts_v3_period_revisions_v1
  ON public.opportunity_financial_facts_v3(stock_id,fact_key,duration_kind,
    estimate_kind,estimate_horizon,period_end,period_start);

CREATE OR REPLACE FUNCTION public.prepare_opportunity_financial_fact_series_v3()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_count integer;
BEGIN
  -- Preserve the existing series serialization and deferred registry checks.
  PERFORM pg_advisory_xact_lock(hashtextextended(concat_ws('|','financial_fact_series',NEW.stock_id,
    NEW.fact_key,NEW.duration_kind,NEW.estimate_kind,NEW.estimate_horizon),0));
  INSERT INTO public.opportunity_financial_fact_series_registry_v3(stock_id,fact_key,duration_kind,
    estimate_kind,estimate_horizon)
  VALUES(NEW.stock_id,NEW.fact_key,NEW.duration_kind,NEW.estimate_kind,NEW.estimate_horizon)
  ON CONFLICT(stock_id,fact_key,duration_kind,estimate_kind,estimate_horizon) DO NOTHING;
  PERFORM 1 FROM public.opportunity_financial_fact_series_registry_v3 registry
  WHERE registry.stock_id=NEW.stock_id AND registry.fact_key=NEW.fact_key
    AND registry.duration_kind=NEW.duration_kind AND registry.estimate_kind=NEW.estimate_kind
    AND registry.estimate_horizon=NEW.estimate_horizon FOR UPDATE;

  -- Collection is an observation, not a disclosure revision. Publication and
  -- source timestamps remain in identity: an undated fallback is NOT backdated
  -- or merged with an earlier observation simply because its URL/value match.
  SELECT count(*) INTO v_count FROM (
    SELECT fact.value,fact.unit,fact.provider,fact.authority_tier,
      fact.filing_published_at,fact.source_timestamp,fact.filing_restatement_id,fact.source_ref
    FROM public.opportunity_financial_facts_v3 fact
    WHERE fact.stock_id=NEW.stock_id AND fact.fact_key=NEW.fact_key
      AND fact.duration_kind=NEW.duration_kind AND fact.estimate_kind=NEW.estimate_kind
      AND fact.estimate_horizon=NEW.estimate_horizon
      AND fact.period_end=NEW.period_end AND fact.period_start IS NOT DISTINCT FROM NEW.period_start
    UNION
    SELECT NEW.value,NEW.unit,NEW.provider,NEW.authority_tier,
      NEW.filing_published_at,NEW.source_timestamp,NEW.filing_restatement_id,NEW.source_ref
    LIMIT 129
  ) revisions;
  IF v_count>128 THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='financial_period_revision_bound';END IF;
  RETURN NEW;
END $function$;
ALTER FUNCTION public.prepare_opportunity_financial_fact_series_v3() OWNER TO opportunity_v3_rpc_owner;
REVOKE ALL ON FUNCTION public.prepare_opportunity_financial_fact_series_v3() FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE IF NOT EXISTS public.opportunity_financial_observations_v1 (
  observation_id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  fact_id uuid NOT NULL REFERENCES public.opportunity_financial_facts_v3(fact_id) ON DELETE RESTRICT,
  input_hash text NOT NULL CHECK(input_hash ~ '^[0-9a-f]{64}$'),
  observation_kind text NOT NULL CHECK(observation_kind IN ('legacy_fact','rpc_observation')),
  caller_principal_id uuid,
  filing_published_at timestamptz NOT NULL,
  source_timestamp timestamptz NOT NULL,
  collected_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT financial_observation_identity_v1 UNIQUE(fact_id,input_hash),
  CHECK(filing_published_at<=source_timestamp AND source_timestamp<=collected_at AND collected_at<=recorded_at),
  CHECK((observation_kind='legacy_fact' AND caller_principal_id IS NULL)
    OR (observation_kind='rpc_observation' AND caller_principal_id IS NOT NULL))
);
-- Only timestamps already present in immutable legacy facts are backfilled.
-- Historical audit hashes cannot reveal lost acquisition times; do not invent them.
INSERT INTO public.opportunity_financial_observations_v1(fact_id,input_hash,observation_kind,
  filing_published_at,source_timestamp,collected_at,recorded_at)
SELECT fact_id,encode(extensions.digest(convert_to('legacy_fact:'||fact_id::text,'utf8'),'sha256'),'hex'),
  'legacy_fact',filing_published_at,source_timestamp,collected_at,recorded_at
FROM public.opportunity_financial_facts_v3
ON CONFLICT(fact_id,input_hash) DO NOTHING;
ALTER TABLE public.opportunity_financial_observations_v1 OWNER TO opportunity_v3_rpc_owner;
ALTER TABLE public.opportunity_financial_observations_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.opportunity_financial_observations_v1 FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.opportunity_financial_observations_v1 TO service_role;
CREATE OR REPLACE TRIGGER opportunity_financial_observations_v1_immutable
  BEFORE UPDATE OR DELETE ON public.opportunity_financial_observations_v1
  FOR EACH ROW EXECUTE FUNCTION public.legacy_correctness_immutable_v3_11();

DO $preserve_append$
BEGIN
  IF to_regprocedure('public.append_financial_fact_pre_history_v1(public.financial_fact_input_v3,uuid)') IS NULL THEN
    IF to_regprocedure('public.append_financial_fact_pre_v3_16_16(public.financial_fact_input_v3,uuid)') IS NULL
      THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='financial_history_predecessor_missing'; END IF;
    ALTER FUNCTION public.append_financial_fact_v3(public.financial_fact_input_v3,uuid)
      RENAME TO append_financial_fact_pre_history_v1;
  END IF;
END $preserve_append$;
CREATE OR REPLACE FUNCTION public.append_financial_fact_v3(input public.financial_fact_input_v3,caller_principal uuid)
RETURNS TABLE(fact_id uuid,recorded_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_fact uuid;v_recorded timestamptz;v_hash text;
BEGIN
  -- The predecessor performs principal, disclosure, period and recollection
  -- validation. Receipt and fact/audit are committed or rolled back together.
  SELECT appended.fact_id,appended.recorded_at INTO STRICT v_fact,v_recorded
  FROM public.append_financial_fact_pre_history_v1(input,caller_principal) appended;
  v_hash:=encode(extensions.digest(convert_to(regexp_replace(jsonb_build_array(
    (input).stock_id,(input).fact_key,(input).period_start,(input).period_end,(input).duration_kind,
    (input).value,(input).unit,(input).provider,(input).authority_tier,(input).estimate_kind,
    (input).estimate_horizon,(input).filing_published_at,(input).source_timestamp,
    (input).collected_at,(input).filing_restatement_id,(input).source_ref
  )::text,', ', ',', 'g'),'utf8'),'sha256'),'hex');
  INSERT INTO public.opportunity_financial_observations_v1(fact_id,input_hash,observation_kind,
    caller_principal_id,filing_published_at,source_timestamp,collected_at)
  VALUES(v_fact,v_hash,'rpc_observation',caller_principal,(input).filing_published_at,
    (input).source_timestamp,(input).collected_at)
  ON CONFLICT ON CONSTRAINT financial_observation_identity_v1 DO NOTHING;
  RETURN QUERY SELECT v_fact,v_recorded;
END $function$;
ALTER FUNCTION public.append_financial_fact_pre_history_v1(public.financial_fact_input_v3,uuid) OWNER TO opportunity_v3_rpc_owner;
ALTER FUNCTION public.append_financial_fact_v3(public.financial_fact_input_v3,uuid) OWNER TO opportunity_v3_rpc_owner;
REVOKE ALL ON FUNCTION public.append_financial_fact_pre_history_v1(public.financial_fact_input_v3,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.append_financial_fact_v3(public.financial_fact_input_v3,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.append_financial_fact_v3(public.financial_fact_input_v3,uuid) TO service_role;

-- Keyset order is immutable recorded_at/fact_id, NOT a mutable latest-head
-- ranking. A fixed cutoff and explicit sentinel preserve conflicts and revisions.
CREATE OR REPLACE FUNCTION public.read_financial_history_page_v1(
  p_stock uuid,p_fact_key public.financial_fact_key_v3,p_duration public.financial_duration_kind_v3,
  p_kind public.financial_estimate_kind_v3,p_horizon public.financial_estimate_horizon_v3,
  p_period_from date,p_period_to date,p_cutoff timestamptz,p_after uuid,p_limit integer,p_caller uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_after_recorded timestamptz;v_result jsonb;
BEGIN
  IF NOT public.internal_principal_role_is_exact_v3_internal(p_caller,'opportunity_runner',clock_timestamp())
    THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='principal_role_unavailable'; END IF;
  IF p_stock IS NULL OR p_fact_key IS NULL OR p_duration IS NULL OR p_kind IS NULL OR p_horizon IS NULL
    OR p_period_from IS NULL OR p_period_to IS NULL OR p_period_from>p_period_to
    OR p_cutoff IS NULL OR p_cutoff>clock_timestamp() OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 128
    THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='financial_history_page_invalid'; END IF;
  IF p_after IS NOT NULL THEN
    SELECT f.recorded_at INTO v_after_recorded FROM public.opportunity_financial_facts_v3 f
    WHERE f.fact_id=p_after AND f.stock_id=p_stock AND f.fact_key=p_fact_key AND f.duration_kind=p_duration
      AND f.estimate_kind=p_kind AND f.estimate_horizon=p_horizon AND f.period_end BETWEEN p_period_from AND p_period_to
      AND f.recorded_at<=p_cutoff AND f.collected_at<=p_cutoff AND f.source_timestamp<=p_cutoff AND f.filing_published_at<=p_cutoff;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='financial_history_cursor_invalid'; END IF;
  END IF;
  WITH bounded AS MATERIALIZED (
    SELECT f.* FROM public.opportunity_financial_facts_v3 f
    WHERE f.stock_id=p_stock AND f.fact_key=p_fact_key AND f.duration_kind=p_duration
      AND f.estimate_kind=p_kind AND f.estimate_horizon=p_horizon AND f.period_end BETWEEN p_period_from AND p_period_to
      AND f.recorded_at<=p_cutoff AND f.collected_at<=p_cutoff AND f.source_timestamp<=p_cutoff AND f.filing_published_at<=p_cutoff
      AND (p_after IS NULL OR (f.recorded_at,f.fact_id)>(v_after_recorded,p_after))
    ORDER BY f.recorded_at,f.fact_id LIMIT p_limit+1
  ), page AS (SELECT * FROM bounded ORDER BY recorded_at,fact_id LIMIT p_limit)
  SELECT jsonb_build_object('schema','financial-history-page-v1','cutoff',p_cutoff,
    'accounting_scope','legacy_unspecified','currency','derived_from_unit_not_independently_disclosed',
    'rows',coalesce((SELECT jsonb_agg(to_jsonb(page) ORDER BY recorded_at,fact_id) FROM page),'[]'::jsonb),
    'has_more',(SELECT count(*)>p_limit FROM bounded),
    'next_cursor',CASE WHEN (SELECT count(*)>p_limit FROM bounded)
      THEN (SELECT fact_id FROM page ORDER BY recorded_at DESC,fact_id DESC LIMIT 1) ELSE NULL END)
  INTO v_result;
  RETURN v_result;
END $function$;
ALTER FUNCTION public.read_financial_history_page_v1(uuid,public.financial_fact_key_v3,public.financial_duration_kind_v3,
  public.financial_estimate_kind_v3,public.financial_estimate_horizon_v3,date,date,timestamptz,uuid,integer,uuid)
  OWNER TO opportunity_v3_rpc_owner;
REVOKE ALL ON FUNCTION public.read_financial_history_page_v1(uuid,public.financial_fact_key_v3,public.financial_duration_kind_v3,
  public.financial_estimate_kind_v3,public.financial_estimate_horizon_v3,date,date,timestamptz,uuid,integer,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_financial_history_page_v1(uuid,public.financial_fact_key_v3,public.financial_duration_kind_v3,
  public.financial_estimate_kind_v3,public.financial_estimate_horizon_v3,date,date,timestamptz,uuid,integer,uuid) TO service_role;
REVOKE CREATE ON SCHEMA public FROM opportunity_v3_rpc_owner;
COMMIT;
