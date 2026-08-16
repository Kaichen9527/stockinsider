-- StockInsider V3.16.16 production repair: a later observation of the exact
-- same official financial disclosure is an acquisition heartbeat, not a new
-- fact revision. Preserve the true collection timestamp in the audit input,
-- while returning the already-validated immutable fact so repeated producer
-- runs cannot exhaust the closed 128-row semantic-series bound.

BEGIN;

GRANT CREATE ON SCHEMA public TO opportunity_v3_rpc_owner;

DO $preserve_financial_fact_append_v3_16_16$
BEGIN
  IF to_regprocedure(
    'public.append_financial_fact_pre_v3_16_16(public.financial_fact_input_v3,uuid)'
  ) IS NULL THEN
    IF to_regprocedure('public.append_financial_fact_v3(public.financial_fact_input_v3,uuid)') IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='financial_fact_append_predecessor_missing';
    END IF;
    ALTER FUNCTION public.append_financial_fact_v3(public.financial_fact_input_v3,uuid)
      RENAME TO append_financial_fact_pre_v3_16_16;
  END IF;
END $preserve_financial_fact_append_v3_16_16$;

CREATE OR REPLACE FUNCTION public.append_financial_fact_v3(
  input public.financial_fact_input_v3,caller_principal uuid
) RETURNS TABLE(fact_id uuid,recorded_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_now timestamptz:=clock_timestamp();v_existing uuid;v_existing_recorded_at timestamptz;v_hash text;
BEGIN
  IF NOT public.internal_principal_role_is_exact_v3_internal(caller_principal,'opportunity_runner',v_now)
  THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='principal_role_unavailable';END IF;
  IF (input).collected_at<(input).source_timestamp OR (input).collected_at>v_now
  THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='invalid_authority_request';END IF;

  -- Use the predecessor's exact series lock.  This serializes the lookup with
  -- both another recollection and a genuine new revision; using a narrower
  -- recollection-only key would permit two first observers to miss each other.
  PERFORM pg_advisory_xact_lock(hashtextextended(concat_ws('|',
    (input).stock_id,(input).fact_key,coalesce((input).period_start::text,''),
    (input).period_end,(input).duration_kind),0));
  SELECT fact.fact_id,fact.recorded_at INTO v_existing,v_existing_recorded_at
  FROM public.opportunity_financial_facts_v3 fact
  WHERE fact.stock_id=(input).stock_id AND fact.fact_key=(input).fact_key
    AND fact.period_start IS NOT DISTINCT FROM (input).period_start
    AND fact.period_end=(input).period_end AND fact.duration_kind=(input).duration_kind
    AND fact.value=(input).value AND fact.unit=(input).unit AND fact.provider=(input).provider
    AND fact.authority_tier=(input).authority_tier AND fact.estimate_kind=(input).estimate_kind
    AND fact.estimate_horizon=(input).estimate_horizon
    AND fact.filing_published_at=(input).filing_published_at
    AND fact.source_timestamp=(input).source_timestamp
    AND fact.filing_restatement_id IS NOT DISTINCT FROM (input).filing_restatement_id
    AND fact.source_ref=(input).source_ref AND fact.collected_at<=(input).collected_at
  ORDER BY fact.collected_at,fact.recorded_at,fact.fact_id LIMIT 1;
  IF v_existing IS NOT NULL THEN
    v_hash:=encode(extensions.digest(convert_to(regexp_replace(jsonb_build_array(
      (input).stock_id,(input).fact_key,(input).period_start,(input).period_end,(input).duration_kind,
      (input).value,(input).unit,(input).provider,(input).authority_tier,(input).estimate_kind,
      (input).estimate_horizon,(input).filing_published_at,(input).source_timestamp,
      (input).collected_at,(input).filing_restatement_id,(input).source_ref
    )::text,', ', ',', 'g'),'utf8'),'sha256'),'hex');
    INSERT INTO public.opportunity_rpc_audit_v3(function_name,caller_principal_id,subject_kind,subject_id,
      input_hash,disposition,recorded_at)
    VALUES('append_financial_fact_v3',caller_principal,'financial_fact',v_existing,v_hash,
      'idempotent'::public.opportunity_rpc_audit_disposition_v3,v_now);
    RETURN QUERY SELECT v_existing,v_existing_recorded_at;
    RETURN;
  END IF;
  RETURN QUERY SELECT appended.fact_id,appended.recorded_at
  FROM public.append_financial_fact_pre_v3_16_16(input,caller_principal) appended;
END $function$;

ALTER FUNCTION public.append_financial_fact_pre_v3_16_16(public.financial_fact_input_v3,uuid)
  OWNER TO opportunity_v3_rpc_owner;
ALTER FUNCTION public.append_financial_fact_v3(public.financial_fact_input_v3,uuid)
  OWNER TO opportunity_v3_rpc_owner;
REVOKE ALL ON FUNCTION public.append_financial_fact_pre_v3_16_16(public.financial_fact_input_v3,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.append_financial_fact_v3(public.financial_fact_input_v3,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.append_financial_fact_v3(public.financial_fact_input_v3,uuid)
  TO service_role;

REVOKE CREATE ON SCHEMA public FROM opportunity_v3_rpc_owner;

COMMIT;
