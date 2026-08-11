-- V3.13 decision integrity: append official point-in-time facts and daily
-- exchange-reported valuation observations from the reviewed tracked producer.
-- The current run only persists acquisition; selectors can consume it from a
-- later source cutoff, preventing collection-time lookahead.

DO $reported_period_coherence$
BEGIN
  IF EXISTS(
    SELECT 1 FROM public.opportunity_financial_facts_v3 fact
    WHERE fact.estimate_kind='reported' AND (
      fact.period_end>(fact.filing_published_at AT TIME ZONE 'Asia/Taipei')::date
      OR fact.period_end>(fact.source_timestamp AT TIME ZONE 'Asia/Taipei')::date)
  ) THEN RAISE EXCEPTION 'future_reported_financial_fact_conflict';END IF;
  IF NOT EXISTS(
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.opportunity_financial_facts_v3'::regclass
      AND conname='opportunity_financial_facts_v3_reported_period_coherence'
  ) THEN
    ALTER TABLE public.opportunity_financial_facts_v3
      ADD CONSTRAINT opportunity_financial_facts_v3_reported_period_coherence CHECK(
        estimate_kind<>'reported'
        OR (period_end <= (filing_published_at AT TIME ZONE 'Asia/Taipei')::date
          AND period_end <= (source_timestamp AT TIME ZONE 'Asia/Taipei')::date)
      );
  END IF;
END $reported_period_coherence$;

CREATE TABLE IF NOT EXISTS public.legacy_approved_source_profiles_v3_13 (
  profile_id text PRIMARY KEY CHECK(profile_id~'^[a-z0-9_]{2,40}$'),
  profile_name text NOT NULL CHECK(char_length(profile_name) BETWEEN 1 AND 120)
);
INSERT INTO public.legacy_approved_source_profiles_v3_13(profile_id,profile_name) VALUES
  ('gooaye','股癌'),('micmarket','麥克風的市場開講'),('chenweytai','陳唯泰'),('twstock888','小車'),
  ('allenfinance','艾倫的財經筆記'),('agerli','阿格力'),('investaddict','投資癮'),('stockhermit','股市隱者'),
  ('zhangzhenqing','張真卿'),('ikala_stevecc','程世嘉'),('investanchors','定錨投筆'),
  ('yutinghao','游庭皓的財經皓角'),('miula','M觀點'),('macromicro','財經M平方'),
  ('statementdog','財報狗'),('johnstock888','John 林睿閔'),('s178178','郭哲榮分析師')
ON CONFLICT(profile_id) DO NOTHING;
DO $approved_profile_roster$
BEGIN
  IF (SELECT count(*) FROM public.legacy_approved_source_profiles_v3_13)<>17 OR EXISTS(
    SELECT 1 FROM (VALUES
      ('gooaye','股癌'),('micmarket','麥克風的市場開講'),('chenweytai','陳唯泰'),('twstock888','小車'),
      ('allenfinance','艾倫的財經筆記'),('agerli','阿格力'),('investaddict','投資癮'),('stockhermit','股市隱者'),
      ('zhangzhenqing','張真卿'),('ikala_stevecc','程世嘉'),('investanchors','定錨投筆'),
      ('yutinghao','游庭皓的財經皓角'),('miula','M觀點'),('macromicro','財經M平方'),
      ('statementdog','財報狗'),('johnstock888','John 林睿閔'),('s178178','郭哲榮分析師')
    ) expected(profile_id,profile_name)
    LEFT JOIN public.legacy_approved_source_profiles_v3_13 actual USING(profile_id,profile_name)
    WHERE actual.profile_id IS NULL
  ) THEN RAISE EXCEPTION 'approved_source_roster_conflict';END IF;
END $approved_profile_roster$;

-- Freeze the exact source authority visible to a legacy-correctness occurrence.
-- Completion must never consult authority appended or revoked after source_cutoff.
CREATE TABLE IF NOT EXISTS public.legacy_frozen_source_authorities_v3_13 (
  source_run_id uuid NOT NULL REFERENCES public.legacy_producer_runs_v3_11(run_id) ON DELETE RESTRICT,
  profile_id text NOT NULL REFERENCES public.legacy_approved_source_profiles_v3_13(profile_id) ON DELETE RESTRICT,
  source_key public.source_key_v3 NOT NULL CHECK(source_key IN ('threads','podcast','youtube')),
  distribution_identity text NOT NULL,
  source_identity_id uuid NOT NULL REFERENCES public.source_entities(id) ON DELETE RESTRICT,
  source_identity_authority_id uuid NOT NULL REFERENCES public.source_identity_authorities_v3(authority_id) ON DELETE RESTRICT,
  authority_cutoff timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(source_run_id,profile_id,source_key),
  UNIQUE(source_run_id,source_identity_authority_id),
  CHECK(distribution_identity=source_key::text||':'||profile_id)
);

CREATE OR REPLACE FUNCTION public.freeze_legacy_source_authorities_v3_13()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $freeze$
DECLARE conflict_count integer;
BEGIN
  PERFORM public.opportunity_authority_selected_stream_count_v3_internal('discovery_identity',NEW.source_cutoff);
  WITH heads AS MATERIALIZED (
    SELECT DISTINCT ON(authority.source_identity_id) authority.*
    FROM public.source_identity_authorities_v3 authority
    WHERE authority.recorded_at<=NEW.source_cutoff AND authority.approved_at<=NEW.source_cutoff
      AND authority.valid_from<=NEW.source_cutoff
    ORDER BY authority.source_identity_id,authority.recorded_at DESC,authority.authority_id
  ), eligible AS MATERIALIZED (
    SELECT profile.profile_id,source.source_key AS requested_source_key,heads.authority_id
    FROM public.legacy_approved_source_profiles_v3_13 profile
    CROSS JOIN (VALUES('threads'::public.source_key_v3),('podcast'::public.source_key_v3),
      ('youtube'::public.source_key_v3)) source(source_key)
    JOIN heads ON heads.source_key=source.source_key
      AND heads.distribution_identity=source.source_key::text||':'||profile.profile_id
    WHERE heads.status='active' AND (heads.valid_to IS NULL OR NEW.source_cutoff<heads.valid_to)
  ) SELECT count(*) INTO conflict_count FROM (
    SELECT profile_id,requested_source_key FROM eligible
    GROUP BY profile_id,requested_source_key HAVING count(*)<>1
  ) conflicts;
  IF conflict_count>0 THEN RAISE EXCEPTION 'authority_revision_conflict';END IF;
  INSERT INTO public.legacy_frozen_source_authorities_v3_13(source_run_id,profile_id,source_key,
    distribution_identity,source_identity_id,source_identity_authority_id,authority_cutoff)
  SELECT NEW.run_id,profile.profile_id,source.source_key,heads.distribution_identity,
    heads.source_identity_id,heads.authority_id,NEW.source_cutoff
  FROM public.legacy_approved_source_profiles_v3_13 profile
  CROSS JOIN (VALUES('threads'::public.source_key_v3),('podcast'::public.source_key_v3),
    ('youtube'::public.source_key_v3)) source(source_key)
  JOIN LATERAL (
    SELECT authority.* FROM public.source_identity_authorities_v3 authority
    WHERE authority.source_key=source.source_key
      AND authority.distribution_identity=source.source_key::text||':'||profile.profile_id
      AND authority.recorded_at<=NEW.source_cutoff AND authority.approved_at<=NEW.source_cutoff
      AND authority.valid_from<=NEW.source_cutoff
    ORDER BY authority.recorded_at DESC,authority.authority_id LIMIT 1
  ) heads ON heads.status='active' AND (heads.valid_to IS NULL OR NEW.source_cutoff<heads.valid_to);
  RETURN NEW;
END $freeze$;
DROP TRIGGER IF EXISTS legacy_freeze_source_authorities_v3_13 ON public.legacy_producer_runs_v3_11;
CREATE TRIGGER legacy_freeze_source_authorities_v3_13 AFTER INSERT ON public.legacy_producer_runs_v3_11
  FOR EACH ROW EXECUTE FUNCTION public.freeze_legacy_source_authorities_v3_13();

-- A durable, DB-owned context binds the existing validated append RPC to one frozen
-- run authority without exposing a caller-selectable historical cutoff.
CREATE TABLE IF NOT EXISTS public.legacy_source_append_context_v3_13 (
  source_run_id uuid NOT NULL REFERENCES public.legacy_producer_runs_v3_11(run_id) ON DELETE RESTRICT,
  profile_id text NOT NULL REFERENCES public.legacy_approved_source_profiles_v3_13(profile_id) ON DELETE RESTRICT,
  source_key public.source_key_v3 NOT NULL,
  stable_connector_document_id text NOT NULL CHECK(char_length(stable_connector_document_id) BETWEEN 1 AND 512),
  source_identity_authority_id uuid NOT NULL REFERENCES public.source_identity_authorities_v3(authority_id) ON DELETE RESTRICT,
  authority_cutoff timestamptz NOT NULL,
  backend_pid integer NOT NULL,
  transaction_id bigint NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(source_run_id,source_key,profile_id,stable_connector_document_id),
  FOREIGN KEY(source_run_id,profile_id,source_key) REFERENCES
    public.legacy_frozen_source_authorities_v3_13(source_run_id,profile_id,source_key) ON DELETE RESTRICT
);

-- Closed JSON canonicalizer for the bounded DecisionEnvelope disclosure payload.
-- It is deliberately recursive so separators inside strings are never rewritten.
CREATE OR REPLACE FUNCTION public.legacy_canonical_json_v3_13(value jsonb)
RETURNS text LANGUAGE plpgsql IMMUTABLE STRICT SET search_path='' AS $canonical$
DECLARE kind text:=jsonb_typeof(value);result text:='';member record;first boolean:=true;
  number_text text;
BEGIN
  IF kind='object' THEN
    result:='{';
    FOR member IN SELECT key,item FROM jsonb_each(value) entry(key,item) ORDER BY key COLLATE "C" LOOP
      IF NOT first THEN result:=result||',';END IF;first:=false;
      result:=result||to_jsonb(member.key)::text||':'||public.legacy_canonical_json_v3_13(member.item);
    END LOOP;
    RETURN result||'}';
  ELSIF kind='array' THEN
    result:='[';
    FOR member IN SELECT item FROM jsonb_array_elements(value) WITH ORDINALITY entry(item,ordinal) ORDER BY ordinal LOOP
      IF NOT first THEN result:=result||',';END IF;first:=false;
      result:=result||public.legacy_canonical_json_v3_13(member.item);
    END LOOP;
    RETURN result||']';
  ELSIF kind='number' THEN
    number_text:=value#>>'{}';
    IF number_text~'[.]' AND number_text!~'[eE]' THEN
      number_text:=regexp_replace(regexp_replace(number_text,'0+$','','g'),'[.]$','','g');
    END IF;
    IF number_text IN ('-0','-0.0') THEN number_text:='0';END IF;
    RETURN number_text;
  END IF;
  RETURN value::text;
END $canonical$;

-- PostgreSQL URL/timestamp casts are not the public contract: these helpers close
-- the same credential-free HTTPS and offset-bearing RFC3339 grammar used by Web
-- and the tracked runtime. Invalid calendar dates are caught, never normalized.
CREATE OR REPLACE FUNCTION public.legacy_valid_https_url_v3_13(value text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE STRICT SET search_path='' AS $url$
DECLARE port_text text;
BEGIN
  IF value<>btrim(value) OR value!~'^https://[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?(?::[0-9]{1,5})?(?:[/?#][^[:space:]\\]*)?$'
    OR position(E'\\\\' in value)>0 THEN RETURN false;END IF;
  port_text:=substring(value from '^https://[^/:?#]+:([0-9]+)');
  RETURN port_text IS NULL OR port_text::integer BETWEEN 1 AND 65535;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $url$;

CREATE OR REPLACE FUNCTION public.legacy_valid_rfc3339_v3_13(value text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE STRICT SET search_path='' AS $instant$
DECLARE parsed timestamptz;offset_hour integer;offset_minute integer;
  hour_value integer;minute_value integer;second_value integer;
BEGIN
  IF value!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,9})?(Z|[+-][0-9]{2}:[0-9]{2})$'
    THEN RETURN false;END IF;
  hour_value:=substring(value from 'T([0-9]{2}):')::integer;
  minute_value:=substring(value from 'T[0-9]{2}:([0-9]{2}):')::integer;
  second_value:=substring(value from 'T[0-9]{2}:[0-9]{2}:([0-9]{2})')::integer;
  IF hour_value>23 OR minute_value>59 OR second_value>59 THEN RETURN false;END IF;
  IF right(value,1)<>'Z' THEN
    offset_hour:=substring(value from '[+-]([0-9]{2}):[0-9]{2}$')::integer;
    offset_minute:=substring(value from '[+-][0-9]{2}:([0-9]{2})$')::integer;
    IF offset_hour>14 OR offset_minute>59 OR (offset_hour=14 AND offset_minute<>0) THEN RETURN false;END IF;
  END IF;
  parsed:=value::timestamptz;
  RETURN parsed IS NOT NULL;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $instant$;

CREATE OR REPLACE FUNCTION public.legacy_valid_decision_envelope_v3_13(value jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE STRICT SET search_path='' AS $envelope$
DECLARE authority text;readiness text;action text;kind text;technical_state text;
  summary jsonb;plan jsonb;range_value jsonb;threshold jsonb;current_price numeric;base_value numeric;base_raw numeric;
  low_value numeric;high_value numeric;upside numeric;discount numeric;entry_low numeric;
  entry_high numeric;invalidation numeric;reward_risk numeric;expected_reward_risk numeric;
  raw_upside numeric;raw_discount numeric;raw_reward_risk numeric;has_geometry boolean;has_no_geometry boolean;
  as_of_value text;
BEGIN
  IF jsonb_typeof(value)<>'object' OR value->>'version'<>'decision-envelope-v3.13.0'
    OR jsonb_typeof(value->'decisionRevisionId') IS DISTINCT FROM 'string'
    OR (value->>'decisionRevisionId')!~'^decision-v3[.]13:[0-9a-f]{64}$'
    OR jsonb_typeof(value->'reason') IS DISTINCT FROM 'string'
    OR length(value->>'reason')=0 OR value->>'reason'<>btrim(value->>'reason')
    OR jsonb_typeof(value->'whyNow') IS DISTINCT FROM 'string'
    OR length(value->>'whyNow')=0 OR value->>'whyNow'<>btrim(value->>'whyNow')
    OR jsonb_typeof(value->'blockers') IS DISTINCT FROM 'array'
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(value->'blockers') blocker(item)
      WHERE jsonb_typeof(item)<>'string' OR length(item#>>'{}')=0 OR item#>>'{}'<>btrim(item#>>'{}'))
    OR (SELECT count(DISTINCT item) FROM jsonb_array_elements(value->'blockers') blocker(item))
      <>jsonb_array_length(value->'blockers')
  THEN RETURN false;END IF;
  authority:=value->>'recommendationAuthority';readiness:=value->>'valuationReadiness';action:=value->>'userAction';
  IF authority NOT IN ('formal','conditional_research','none')
    OR readiness NOT IN ('complete','relative_only','missing','stale','conflict')
    OR action NOT IN ('buy','accumulate','research_starter','wait_breakout','wait_reclaim','avoid_chase','avoid','unavailable')
    OR (authority='formal' AND readiness<>'complete')
    OR (authority='conditional_research' AND readiness<>'relative_only')
    OR (authority='none' AND readiness NOT IN ('missing','stale','conflict'))
  THEN RETURN false;END IF;
  summary:=value->'valuationSummary';
  IF jsonb_typeof(summary)<>'object' OR jsonb_typeof(summary->'sourceRefs') IS DISTINCT FROM 'array'
    OR jsonb_typeof(summary->'blockers') IS DISTINCT FROM 'array' OR summary->'blockers'<>value->'blockers'
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(summary->'sourceRefs') source_ref(item)
      WHERE jsonb_typeof(item)<>'string' OR length(item#>>'{}')=0 OR item#>>'{}'<>btrim(item#>>'{}'))
    OR (SELECT count(DISTINCT item) FROM jsonb_array_elements(summary->'sourceRefs') source_ref(item))
      <>jsonb_array_length(summary->'sourceRefs')
  THEN RETURN false;END IF;
  kind:=summary->>'kind';
  IF (authority='formal' AND kind<>'formal_range')
    OR (authority='conditional_research' AND kind<>'relative_reference_band')
    OR (authority='none' AND kind<>'unavailable') THEN RETURN false;END IF;
  IF authority='none' THEN
    IF summary->'formalRange' IS DISTINCT FROM 'null'::jsonb OR summary->'relativeBand' IS DISTINCT FROM 'null'::jsonb
      OR summary->'baseUpsidePct' IS DISTINCT FROM 'null'::jsonb OR summary->'relativeDiscountPct' IS DISTINCT FROM 'null'::jsonb
      OR summary->'method' IS DISTINCT FROM 'null'::jsonb OR summary->'asOf' IS DISTINCT FROM 'null'::jsonb
      OR summary->'thresholdAuthority' IS DISTINCT FROM 'null'::jsonb
      OR jsonb_array_length(summary->'sourceRefs')<>0
      OR (summary->'currentPrice' IS DISTINCT FROM 'null'::jsonb AND (
        jsonb_typeof(summary->'currentPrice') IS DISTINCT FROM 'number' OR (summary->>'currentPrice')::numeric<=0))
      OR value->'entryPlan' IS DISTINCT FROM 'null'::jsonb
      OR (readiness IN ('missing','stale') AND action<>'unavailable')
      OR (action='avoid' AND readiness<>'conflict')
      OR action NOT IN ('avoid','unavailable') THEN RETURN false;END IF;
    RETURN action<>'unavailable' OR jsonb_array_length(value->'blockers')>0;
  END IF;
  IF jsonb_typeof(summary->'currentPrice') IS DISTINCT FROM 'number'
    OR (summary->>'currentPrice')::numeric<=0 OR jsonb_typeof(summary->'method') IS DISTINCT FROM 'string'
    OR length(summary->>'method')=0 OR summary->>'method'<>btrim(summary->>'method')
    OR jsonb_typeof(summary->'asOf') IS DISTINCT FROM 'string'
    OR jsonb_array_length(summary->'sourceRefs')=0 THEN RETURN false;END IF;
  as_of_value:=summary->>'asOf';
  IF as_of_value~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
    PERFORM as_of_value::date;
  ELSIF NOT public.legacy_valid_rfc3339_v3_13(as_of_value) THEN RETURN false;END IF;
  current_price:=(summary->>'currentPrice')::numeric;
  threshold:=summary->'thresholdAuthority';
  range_value:=CASE WHEN authority='formal' THEN summary->'formalRange' ELSE summary->'relativeBand' END;
  IF jsonb_typeof(range_value)<>'object' THEN RETURN false;END IF;
  IF authority='formal' THEN
    IF jsonb_typeof(range_value->'bear') IS DISTINCT FROM 'number'
      OR jsonb_typeof(range_value->'base') IS DISTINCT FROM 'number'
      OR jsonb_typeof(range_value->'bull') IS DISTINCT FROM 'number'
      OR jsonb_typeof(summary->'baseUpsidePct') IS DISTINCT FROM 'number'
      OR summary->'relativeBand' IS DISTINCT FROM 'null'::jsonb
      OR summary->'relativeDiscountPct' IS DISTINCT FROM 'null'::jsonb
      OR jsonb_typeof(threshold) IS DISTINCT FROM 'object' OR threshold->>'kind'<>'formal'
      OR jsonb_typeof(threshold->'baseTargetRaw') IS DISTINCT FROM 'number' THEN RETURN false;END IF;
    low_value:=(range_value->>'bear')::numeric;base_value:=(range_value->>'base')::numeric;
    high_value:=(range_value->>'bull')::numeric;upside:=(summary->>'baseUpsidePct')::numeric;
    base_raw:=(threshold->>'baseTargetRaw')::numeric;raw_upside:=100*(base_raw/current_price-1);
    IF low_value<=0 OR low_value>base_value OR base_value>high_value
      OR base_raw<=0 OR round(base_raw,2)<>base_value OR upside<>round(raw_upside,1) THEN RETURN false;END IF;
  ELSE
    IF jsonb_typeof(range_value->'low') IS DISTINCT FROM 'number'
      OR jsonb_typeof(range_value->'base') IS DISTINCT FROM 'number'
      OR jsonb_typeof(range_value->'high') IS DISTINCT FROM 'number'
      OR jsonb_typeof(summary->'relativeDiscountPct') IS DISTINCT FROM 'number'
      OR summary->'formalRange' IS DISTINCT FROM 'null'::jsonb
      OR summary->'baseUpsidePct' IS DISTINCT FROM 'null'::jsonb
      OR jsonb_typeof(threshold) IS DISTINCT FROM 'object' OR threshold->>'kind'<>'relative'
      OR jsonb_typeof(threshold->'currentMultiple') IS DISTINCT FROM 'number'
      OR jsonb_typeof(threshold->'referenceMultiple') IS DISTINCT FROM 'number'
      OR jsonb_typeof(threshold->'historySessions') IS DISTINCT FROM 'number'
      OR jsonb_typeof(threshold->'sectorPeers') IS DISTINCT FROM 'number'
      OR threshold->>'algorithm'<>'official-relative-pe-evidence-v1'
      OR coalesce(threshold->>'evidenceRoot','')!~'^[0-9a-f]{64}$'
      OR coalesce(threshold->>'currentObservationRoot','')!~'^[0-9a-f]{64}$'
      OR coalesce(threshold->>'historyMembershipRoot','')!~'^[0-9a-f]{64}$'
      OR coalesce(threshold->>'sectorMembershipRoot','')!~'^[0-9a-f]{64}$' THEN RETURN false;END IF;
    low_value:=(range_value->>'low')::numeric;base_value:=(range_value->>'base')::numeric;
    high_value:=(range_value->>'high')::numeric;discount:=(summary->>'relativeDiscountPct')::numeric;
    IF low_value<=0 OR low_value>base_value OR base_value>high_value
      OR (threshold->>'currentMultiple')::numeric<=0 OR (threshold->>'referenceMultiple')::numeric<=0
      OR (threshold->>'historySessions')::numeric<>trunc((threshold->>'historySessions')::numeric)
      OR (threshold->>'historySessions')::numeric<>252
      OR (threshold->>'sectorPeers')::numeric<>trunc((threshold->>'sectorPeers')::numeric)
      OR (threshold->>'sectorPeers')::numeric<8
      OR round(current_price/(threshold->>'currentMultiple')::numeric
        *(threshold->>'referenceMultiple')::numeric,2)<>base_value THEN RETURN false;END IF;
    raw_discount:=100*(1-(threshold->>'currentMultiple')::numeric/(threshold->>'referenceMultiple')::numeric);
    IF discount<>round(raw_discount,1) THEN RETURN false;END IF;
  END IF;
  plan:=value->'entryPlan';
  IF plan IS DISTINCT FROM 'null'::jsonb THEN
    IF jsonb_typeof(plan)<>'object' OR jsonb_typeof(plan->'technicalState') IS DISTINCT FROM 'string'
      OR length(plan->>'technicalState')=0 OR plan->>'technicalState'<>btrim(plan->>'technicalState')
      OR (SELECT count(*) FROM jsonb_object_keys(plan))<>5
      OR EXISTS(SELECT 1 FROM jsonb_object_keys(plan) key
        WHERE key NOT IN ('technicalState','trigger','entryZone','invalidation','rewardRisk'))
      THEN RETURN false;END IF;
    technical_state:=plan->>'technicalState';
    has_geometry:=jsonb_typeof(plan->'entryZone')='array' AND jsonb_array_length(plan->'entryZone')=2
      AND jsonb_typeof(plan#>'{entryZone,0}')='number' AND jsonb_typeof(plan#>'{entryZone,1}')='number'
      AND jsonb_typeof(plan->'invalidation')='number';
    has_no_geometry:=plan->'entryZone'='null'::jsonb AND plan->'invalidation'='null'::jsonb;
    IF NOT has_geometry AND NOT has_no_geometry THEN RETURN false;END IF;
    IF has_geometry THEN
      entry_low:=(plan#>>'{entryZone,0}')::numeric;entry_high:=(plan#>>'{entryZone,1}')::numeric;
      invalidation:=(plan->>'invalidation')::numeric;
      IF entry_low<=0 OR entry_low>entry_high OR invalidation<=0 OR invalidation>=entry_low THEN RETURN false;END IF;
    ELSE entry_low:=NULL;entry_high:=NULL;invalidation:=NULL;END IF;
    IF (technical_state IN ('below_support','reclaim_required') AND (NOT has_no_geometry
        OR plan#>>'{trigger,kind}' IS DISTINCT FROM 'reclaim'))
      OR (technical_state='breakout_pending' AND (NOT has_geometry
        OR plan#>>'{trigger,kind}' IS DISTINCT FROM 'breakout'))
      OR (technical_state='extended' AND (NOT has_no_geometry
        OR plan#>>'{trigger,kind}' IS DISTINCT FROM 'pullback'))
      OR (technical_state='invalidated' AND (NOT has_no_geometry OR plan->'trigger' IS DISTINCT FROM 'null'::jsonb))
      OR (technical_state IN ('at_support','breakout_confirmed') AND (NOT has_geometry
        OR plan->'trigger' IS DISTINCT FROM 'null'::jsonb))
      OR technical_state NOT IN ('below_support','reclaim_required','breakout_pending','extended','invalidated',
        'at_support','breakout_confirmed') THEN RETURN false;END IF;
    IF technical_state IN ('below_support','reclaim_required','breakout_pending','extended') AND (
      jsonb_typeof(plan->'trigger') IS DISTINCT FROM 'object'
      OR (SELECT count(*) FROM jsonb_object_keys(plan->'trigger')) NOT IN (2,3)
      OR EXISTS(SELECT 1 FROM jsonb_object_keys(plan->'trigger') key
        WHERE key NOT IN ('kind','threshold','volumeRatioMinimum'))
      OR jsonb_typeof(plan#>'{trigger,threshold}') IS DISTINCT FROM 'number'
      OR (plan#>>'{trigger,threshold}')::numeric<=0
      OR (plan#>'{trigger,volumeRatioMinimum}' IS NOT NULL
        AND plan#>'{trigger,volumeRatioMinimum}' IS DISTINCT FROM 'null'::jsonb
        AND (jsonb_typeof(plan#>'{trigger,volumeRatioMinimum}') IS DISTINCT FROM 'number'
          OR (plan#>>'{trigger,volumeRatioMinimum}')::numeric<=0))) THEN RETURN false;END IF;
    IF has_geometry AND authority='formal' THEN
      IF jsonb_typeof(plan->'rewardRisk') IS DISTINCT FROM 'number' THEN RETURN false;END IF;
      reward_risk:=(plan->>'rewardRisk')::numeric;
      raw_reward_risk:=(base_raw-(entry_low+entry_high)/2)/(((entry_low+entry_high)/2)-invalidation);
      expected_reward_risk:=round(raw_reward_risk,2);
      IF reward_risk<>expected_reward_risk THEN RETURN false;END IF;
    ELSIF plan->'rewardRisk' IS DISTINCT FROM 'null'::jsonb THEN RETURN false;END IF;
  ELSIF action IN ('buy','accumulate','research_starter','wait_breakout','wait_reclaim','avoid_chase') THEN
    RETURN false;
  END IF;
  IF (action='buy' AND (authority<>'formal' OR NOT has_geometry OR technical_state<>'breakout_confirmed' OR raw_upside<15
      OR raw_reward_risk<2 OR jsonb_array_length(value->'blockers')<>0))
    OR (action='accumulate' AND (authority<>'formal' OR NOT has_geometry OR technical_state<>'at_support' OR raw_upside<15
      OR raw_reward_risk<2 OR jsonb_array_length(value->'blockers')<>0))
    OR (action='research_starter' AND (authority<>'conditional_research'
      OR NOT has_geometry OR technical_state NOT IN ('at_support','breakout_confirmed') OR raw_discount<15
      OR jsonb_array_length(value->'blockers')<>0))
    OR (action='wait_breakout' AND (NOT has_geometry OR technical_state<>'breakout_pending' OR plan->'trigger'='null'::jsonb
      OR jsonb_array_length(value->'blockers')<>0))
    OR (action='wait_reclaim' AND (NOT has_no_geometry OR technical_state NOT IN ('below_support','reclaim_required') OR plan->'trigger'='null'::jsonb
      OR jsonb_array_length(value->'blockers')<>0))
    OR (action='avoid_chase' AND (NOT has_no_geometry OR technical_state<>'extended' OR plan->'trigger'='null'::jsonb
      OR jsonb_array_length(value->'blockers')<>0))
    OR (action='avoid' AND authority='formal' AND (plan IS NOT DISTINCT FROM 'null'::jsonb OR NOT (
      raw_upside<15 OR (raw_reward_risk IS NOT NULL AND raw_reward_risk<2)
      OR technical_state='invalidated' OR value->>'reason'='bias_observe_only')))
    OR (action='avoid' AND authority='conditional_research' AND (plan IS NOT DISTINCT FROM 'null'::jsonb OR NOT (
      raw_discount<15 OR technical_state='invalidated' OR value->>'reason'='bias_observe_only')))
    OR (action='unavailable' AND jsonb_array_length(value->'blockers')=0)
  THEN RETURN false;END IF;
  RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $envelope$;

CREATE TABLE IF NOT EXISTS public.legacy_source_document_persistence_v3_13 (
  source_run_id uuid NOT NULL REFERENCES public.legacy_producer_runs_v3_11(run_id) ON DELETE RESTRICT,
  profile_id text NOT NULL CHECK(profile_id~'^[a-z0-9_]{2,40}$'),
  source_key public.source_key_v3 NOT NULL,
  stable_connector_document_id text NOT NULL CHECK(char_length(stable_connector_document_id) BETWEEN 1 AND 512),
  ingestion_canonical_content_hash_v3 text CHECK(ingestion_canonical_content_hash_v3 IS NULL
    OR ingestion_canonical_content_hash_v3~'^[0-9a-f]{64}$'),
  document_terminal_identity_sha256 text NOT NULL CHECK(document_terminal_identity_sha256~'^[0-9a-f]{64}$'),
  disposition text NOT NULL CHECK(disposition IN ('new_revision','unchanged','deferred','rejected')),
  revision_id uuid REFERENCES public.source_document_revisions_v3(revision_id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK(char_length(reason) BETWEEN 1 AND 500),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(source_run_id,document_terminal_identity_sha256),
  CHECK((revision_id IS NOT NULL)=(disposition IN ('new_revision','unchanged')
    OR (disposition='rejected' AND reason='content_overflow_parse_failure')))
);

CREATE TABLE IF NOT EXISTS public.legacy_source_acquisition_outcomes_v3_13 (
  source_run_id uuid NOT NULL REFERENCES public.legacy_producer_runs_v3_11(run_id) ON DELETE RESTRICT,
  profile_id text NOT NULL CHECK(profile_id~'^[a-z0-9_]{2,40}$'),
  profile_name text NOT NULL CHECK(char_length(profile_name) BETWEEN 1 AND 120),
  status text NOT NULL CHECK(status IN ('fresh','unchanged','no_new_items','missing_endpoint','auth_failed','provider_failed')),
  reason text NOT NULL CHECK(char_length(reason) BETWEEN 1 AND 1000),
  acquired_document_count integer NOT NULL CHECK(acquired_document_count BETWEEN 0 AND 30),
  new_revision_count integer NOT NULL CHECK(new_revision_count BETWEEN 0 AND acquired_document_count),
  unchanged_count integer NOT NULL CHECK(unchanged_count BETWEEN 0 AND acquired_document_count),
  deferred_count integer NOT NULL CHECK(deferred_count BETWEEN 0 AND acquired_document_count),
  rejected_count integer NOT NULL CHECK(rejected_count BETWEEN 0 AND acquired_document_count),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(source_run_id,profile_id),
  CHECK(new_revision_count+unchanged_count+deferred_count+rejected_count=acquired_document_count)
);

CREATE TABLE IF NOT EXISTS public.legacy_source_connector_attempts_v3_13 (
  source_run_id uuid NOT NULL REFERENCES public.legacy_producer_runs_v3_11(run_id) ON DELETE RESTRICT,
  profile_id text NOT NULL REFERENCES public.legacy_approved_source_profiles_v3_13(profile_id) ON DELETE RESTRICT,
  source_key public.source_key_v3 NOT NULL CHECK(source_key IN ('threads','podcast','youtube')),
  status text NOT NULL CHECK(status IN ('items_found','successful_empty','metadata_only','missing_endpoint','auth_failed','provider_failed')),
  reason_code text NOT NULL CHECK(reason_code~'^[a-z0-9_]{2,80}$'),
  response_kind text NOT NULL CHECK(response_kind IN ('http_response','configuration','transport_error')),
  response_status_code integer CHECK(response_status_code BETWEEN 100 AND 599),
  response_bytes integer NOT NULL CHECK(response_bytes BETWEEN 0 AND 8000000),
  item_count integer NOT NULL CHECK(item_count BETWEEN 0 AND 20),
  document_count integer NOT NULL CHECK(document_count BETWEEN 0 AND 10),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(source_run_id,profile_id,source_key),
  CHECK((response_kind='http_response')=(response_status_code IS NOT NULL)),
  CHECK(status<>'successful_empty' OR (response_kind='http_response' AND response_status_code BETWEEN 200 AND 299
    AND item_count=0 AND document_count=0)),
  CHECK(status<>'items_found' OR (response_kind='http_response' AND response_status_code BETWEEN 200 AND 299
    AND (item_count>0 OR document_count>0))),
  CHECK(status<>'metadata_only' OR (response_kind='http_response' AND response_status_code BETWEEN 200 AND 299
    AND item_count>0 AND document_count=0)),
  CHECK(status<>'auth_failed' OR ((response_kind='configuration' AND response_status_code IS NULL)
    OR (response_kind='http_response' AND response_status_code IN (401,403)))),
  CHECK(status<>'missing_endpoint' OR ((response_kind='configuration' AND response_status_code IS NULL)
    OR (response_kind='http_response' AND response_status_code=404))),
  CHECK(status<>'provider_failed' OR response_kind='transport_error'
    OR (response_kind='http_response' AND response_status_code NOT BETWEEN 200 AND 299
      AND response_status_code NOT IN (401,403,404))),
  CHECK(CASE status
    WHEN 'items_found' THEN reason_code~'_items_observed$'
    WHEN 'successful_empty' THEN reason_code~'_successful_empty$'
    WHEN 'metadata_only' THEN reason_code~'(_metadata_only|_authority_missing)$'
    WHEN 'missing_endpoint' THEN reason_code~'(_missing|_not_found)$'
    WHEN 'auth_failed' THEN reason_code~'(_auth_missing|_oauth_missing|^provider_auth_rejected$)'
    WHEN 'provider_failed' THEN reason_code='provider_transport_failed'
    ELSE false END)
);

CREATE TABLE IF NOT EXISTS public.legacy_source_item_outcomes_v3_13 (
  source_run_id uuid NOT NULL REFERENCES public.legacy_producer_runs_v3_11(run_id) ON DELETE RESTRICT,
  profile_id text NOT NULL CHECK(profile_id~'^[a-z0-9_]{2,40}$'),
  source_key public.source_key_v3 NOT NULL,
  stable_item_id text NOT NULL CHECK(char_length(stable_item_id) BETWEEN 1 AND 512),
  source_url text NOT NULL CHECK(source_url~'^https://'),
  published_at timestamptz,
  acquisition_disposition text NOT NULL CHECK(acquisition_disposition IN ('transcript_ready','metadata_only','rejected','deferred')),
  analysis_disposition text NOT NULL CHECK(analysis_disposition IN
    ('eligible_for_claim_extraction','no_claim','rejected','deferred')),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(source_run_id,source_key,profile_id,stable_item_id),
  CHECK((acquisition_disposition='transcript_ready')=(analysis_disposition='eligible_for_claim_extraction')),
  CHECK((acquisition_disposition='metadata_only')=(analysis_disposition='no_claim')),
  CHECK((acquisition_disposition,analysis_disposition) IN (
    ('transcript_ready','eligible_for_claim_extraction'),('metadata_only','no_claim'),
    ('rejected','rejected'),('deferred','deferred')
  ))
);

CREATE TABLE IF NOT EXISTS public.legacy_source_processing_outcomes_v3_13 (
  source_run_id uuid NOT NULL REFERENCES public.legacy_producer_runs_v3_11(run_id) ON DELETE RESTRICT,
  revision_id uuid NOT NULL REFERENCES public.source_document_revisions_v3(revision_id) ON DELETE RESTRICT,
  scope text NOT NULL CHECK(scope IN ('document','claim','entity')),
  outcome_id uuid NOT NULL,
  parent_outcome_id uuid,
  symbol text CHECK(symbol IS NULL OR symbol~'^[0-9A-Za-z]{2,12}$'),
  stock_id uuid REFERENCES public.stocks(id) ON DELETE RESTRICT,
  outcome text NOT NULL CHECK(outcome IN ('processed_with_claims','processed_no_claim','linked','rejected','deferred')),
  reason text NOT NULL CHECK(char_length(reason) BETWEEN 1 AND 500),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(source_run_id,revision_id,scope,outcome_id),
  CHECK((scope='document' AND parent_outcome_id IS NULL)
    OR (scope IN ('claim','entity') AND parent_outcome_id IS NOT NULL)),
  CHECK((outcome='linked')=(stock_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS public.legacy_decision_revisions_v3_13 (
  decision_revision_id text PRIMARY KEY CHECK(decision_revision_id~'^decision-v3[.]13:[0-9a-f]{64}$'),
  symbol text NOT NULL CHECK(symbol~'^[0-9]{4}$'),
  decision_payload_canonical bytea NOT NULL CHECK(octet_length(decision_payload_canonical) BETWEEN 2 AND 65536),
  decision_payload_json jsonb NOT NULL,
  decision_payload_sha256 text NOT NULL CHECK(decision_payload_sha256~'^[0-9a-f]{64}$'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(symbol,decision_payload_sha256),
  CHECK(convert_from(decision_payload_canonical,'utf8')::jsonb=decision_payload_json),
  CHECK(encode(extensions.digest(decision_payload_canonical,'sha256'),'hex')=decision_payload_sha256),
  CHECK(decision_payload_json->>'decisionRevisionId'=decision_revision_id),
  CHECK(decision_payload_json->>'symbol'=symbol)
);

-- Decision material is immutable, while every scheduled no-change evaluation is a
-- new append-only health observation. Exact detail reads the newest heartbeat for the
-- immutable revision instead of aging against the first projection that contained it.
CREATE TABLE IF NOT EXISTS public.legacy_decision_revision_evaluations_v3_13 (
  evaluation_id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  decision_revision_id text NOT NULL REFERENCES public.legacy_decision_revisions_v3_13(decision_revision_id)
    ON DELETE RESTRICT,
  projection_id uuid NOT NULL,
  source_led_correctness jsonb NOT NULL,
  evaluated_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(decision_revision_id,evaluated_at),
  CHECK(source_led_correctness->>'schema'='legacy-radar-v3.13.0'),
  CHECK(source_led_correctness->>'window'='home'),
  CHECK(evaluated_at=(source_led_correctness->>'evaluatedAt')::timestamptz)
);
CREATE INDEX IF NOT EXISTS legacy_decision_revision_evaluations_v3_13_latest_idx
  ON public.legacy_decision_revision_evaluations_v3_13(decision_revision_id,evaluated_at DESC,recorded_at DESC,evaluation_id);

-- The analysis claim must be able to replay the exact immutable facts on a
-- no-material-change evaluation.  Metadata from the legacy analysis row is not a
-- substitute for the disclosure payload used by the compact projection.
CREATE TABLE IF NOT EXISTS public.legacy_analysis_revision_payloads_v3_13 (
  revision_id uuid PRIMARY KEY REFERENCES public.legacy_analysis_revisions_v3_11(revision_id) ON DELETE RESTRICT,
  symbol text NOT NULL CHECK(symbol~'^[0-9]{4}$'),
  material_change_hash text NOT NULL CHECK(material_change_hash~'^[0-9a-f]{64}$'),
  payload_canonical bytea NOT NULL CHECK(octet_length(payload_canonical) BETWEEN 2 AND 262144),
  payload_json jsonb NOT NULL,
  payload_sha256 text NOT NULL CHECK(payload_sha256~'^[0-9a-f]{64}$'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(symbol,material_change_hash),
  CHECK(convert_from(payload_canonical,'utf8')::jsonb=payload_json),
  CHECK(encode(extensions.digest(payload_canonical,'sha256'),'hex')=payload_sha256),
  CHECK(payload_json->>'symbol'=symbol),
  CHECK(payload_json->>'materialChangeHash'=material_change_hash)
);

-- Closed, append-bound identity for every financial-fact series.  The producer
-- cannot grow an unbounded correction stream under one stock/fact/horizon key.
CREATE TABLE IF NOT EXISTS public.opportunity_financial_fact_series_registry_v3 (
  stock_id uuid NOT NULL REFERENCES public.stocks(id) ON DELETE RESTRICT,
  fact_key public.financial_fact_key_v3 NOT NULL,
  duration_kind public.financial_duration_kind_v3 NOT NULL,
  estimate_kind public.financial_estimate_kind_v3 NOT NULL,
  estimate_horizon public.financial_estimate_horizon_v3 NOT NULL,
  registered_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(stock_id,fact_key,duration_kind,estimate_kind,estimate_horizon)
);
CREATE INDEX IF NOT EXISTS opportunity_financial_facts_v3_series_bound
  ON public.opportunity_financial_facts_v3(stock_id,fact_key,duration_kind,estimate_kind,
    estimate_horizon,period_end DESC,filing_published_at DESC,source_timestamp DESC,
    collected_at DESC,recorded_at DESC,fact_id);

-- Rehearsal and an additive production apply may encounter facts written by the
-- earlier contract; close their series identities before enabling the constraints.
INSERT INTO public.opportunity_financial_fact_series_registry_v3(stock_id,fact_key,duration_kind,
  estimate_kind,estimate_horizon,registered_at)
SELECT DISTINCT stock_id,fact_key,duration_kind,estimate_kind,estimate_horizon,
  min(recorded_at) OVER(PARTITION BY stock_id,fact_key,duration_kind,estimate_kind,estimate_horizon)
FROM public.opportunity_financial_facts_v3
ON CONFLICT(stock_id,fact_key,duration_kind,estimate_kind,estimate_horizon) DO NOTHING;

CREATE OR REPLACE FUNCTION public.prepare_opportunity_financial_fact_series_v3()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_count integer;
BEGIN
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
  SELECT count(*) INTO v_count FROM(
    SELECT 1 FROM public.opportunity_financial_facts_v3 fact
    WHERE fact.stock_id=NEW.stock_id AND fact.fact_key=NEW.fact_key
      AND fact.duration_kind=NEW.duration_kind AND fact.estimate_kind=NEW.estimate_kind
      AND fact.estimate_horizon=NEW.estimate_horizon
    ORDER BY fact.period_end DESC,fact.filing_published_at DESC,fact.source_timestamp DESC,
      fact.collected_at DESC,fact.recorded_at DESC,fact.fact_id LIMIT 129
  ) bounded;
  IF v_count>=128 THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='bound_violation';END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.validate_opportunity_financial_fact_series_v3()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
BEGIN
  IF TG_TABLE_NAME='opportunity_financial_facts_v3' THEN
    IF NOT EXISTS(SELECT 1 FROM public.opportunity_financial_fact_series_registry_v3 registry
      WHERE registry.stock_id=NEW.stock_id AND registry.fact_key=NEW.fact_key
        AND registry.duration_kind=NEW.duration_kind AND registry.estimate_kind=NEW.estimate_kind
        AND registry.estimate_horizon=NEW.estimate_horizon)
    THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='financial_fact_series_missing';END IF;
  ELSIF NOT EXISTS(SELECT 1 FROM public.opportunity_financial_facts_v3 fact
    WHERE fact.stock_id=NEW.stock_id AND fact.fact_key=NEW.fact_key
      AND fact.duration_kind=NEW.duration_kind AND fact.estimate_kind=NEW.estimate_kind
      AND fact.estimate_horizon=NEW.estimate_horizon)
  THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='financial_fact_series_orphan';END IF;
  RETURN NULL;
END $function$;

DROP TRIGGER IF EXISTS opportunity_financial_facts_v3_series_prepare
  ON public.opportunity_financial_facts_v3;
CREATE TRIGGER opportunity_financial_facts_v3_series_prepare
  BEFORE INSERT ON public.opportunity_financial_facts_v3 FOR EACH ROW
  EXECUTE FUNCTION public.prepare_opportunity_financial_fact_series_v3();
DROP TRIGGER IF EXISTS opportunity_financial_facts_v3_series_consistency
  ON public.opportunity_financial_facts_v3;
CREATE CONSTRAINT TRIGGER opportunity_financial_facts_v3_series_consistency
  AFTER INSERT ON public.opportunity_financial_facts_v3 DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.validate_opportunity_financial_fact_series_v3();
DROP TRIGGER IF EXISTS opportunity_financial_fact_series_registry_v3_consistency
  ON public.opportunity_financial_fact_series_registry_v3;
CREATE CONSTRAINT TRIGGER opportunity_financial_fact_series_registry_v3_consistency
  AFTER INSERT ON public.opportunity_financial_fact_series_registry_v3 DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.validate_opportunity_financial_fact_series_v3();
DROP TRIGGER IF EXISTS opportunity_financial_fact_series_registry_v3_immutable
  ON public.opportunity_financial_fact_series_registry_v3;
CREATE TRIGGER opportunity_financial_fact_series_registry_v3_immutable
  BEFORE UPDATE OR DELETE ON public.opportunity_financial_fact_series_registry_v3
  FOR EACH ROW EXECUTE FUNCTION public.legacy_correctness_immutable_v3_11();

-- V3.13 extends the official exchange valuation observation without replacing
-- the existing PE history.  A missing PE (for example, a loss-making issuer)
-- is not treated as zero and can still retain its official PB observation.
ALTER TABLE public.opportunity_exchange_reported_pe_v3
  ADD COLUMN IF NOT EXISTS reported_pb double precision;
ALTER TABLE public.opportunity_exchange_reported_pe_v3
  ALTER COLUMN reported_pe DROP NOT NULL;
DO $valuation_constraints$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='opportunity_exchange_reported_valuation_v3_13_metric') THEN
    ALTER TABLE public.opportunity_exchange_reported_pe_v3 ADD CONSTRAINT opportunity_exchange_reported_valuation_v3_13_metric
      CHECK((reported_pe IS NOT NULL AND reported_pe>'-Infinity'::double precision AND reported_pe<'Infinity'::double precision)
        OR (reported_pb IS NOT NULL AND reported_pb>0 AND reported_pb<'Infinity'::double precision));
  END IF;
END $valuation_constraints$;
CREATE INDEX IF NOT EXISTS opportunity_exchange_reported_pb_v3_13_stock_session
  ON public.opportunity_exchange_reported_pe_v3(stock_id,exchange,session_date DESC,reported_pb,
    published_at DESC,source_timestamp DESC,collected_at DESC,recorded_at DESC,source_ref);
CREATE UNIQUE INDEX IF NOT EXISTS opportunity_exchange_reported_valuation_v3_13_source
  ON public.opportunity_exchange_reported_pe_v3(stock_id,exchange,session_date,close,
    coalesce(reported_pe,'NaN'::double precision),coalesce(reported_pb,'NaN'::double precision),
    published_at,source_timestamp,collected_at,source_ref);

DO $valuation_input_type$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_type WHERE typname='exchange_reported_valuation_input_v3_13'
    AND typnamespace='public'::regnamespace) THEN
    CREATE TYPE public.exchange_reported_valuation_input_v3_13 AS(
      stock_id uuid,exchange public.stock_exchange_v3,session_date date,close double precision,
      reported_pe double precision,reported_pb double precision,published_at timestamptz,
      source_timestamp timestamptz,collected_at timestamptz,source_ref text);
  END IF;
END $valuation_input_type$;

CREATE OR REPLACE FUNCTION public.append_exchange_reported_valuation_v3_13(
  p_input public.exchange_reported_valuation_input_v3_13,p_caller uuid
) RETURNS TABLE(reported_valuation_id uuid,recorded_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_now timestamptz:=clock_timestamp();v_id uuid;v_created boolean:=false;v_hash text;
  v_session_count integer;
BEGIN
  IF NOT public.internal_principal_role_is_exact_v3_internal(p_caller,'opportunity_runner',v_now)
  THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='principal_role_unavailable';END IF;
  IF (p_input).stock_id IS NULL OR (p_input).close<=0 OR (p_input).close>='Infinity'::double precision
    OR ((p_input).reported_pe IS NULL AND (p_input).reported_pb IS NULL)
    OR ((p_input).reported_pe IS NOT NULL AND ((p_input).reported_pe<=0 OR (p_input).reported_pe>200))
    OR ((p_input).reported_pb IS NOT NULL AND ((p_input).reported_pb<=0 OR (p_input).reported_pb>100))
    OR NOT ((p_input).published_at<=(p_input).source_timestamp
      AND (p_input).source_timestamp<=(p_input).collected_at AND (p_input).collected_at<=v_now)
    OR char_length((p_input).source_ref) NOT BETWEEN 1 AND 120
    OR ((p_input).exchange='TWSE' AND (p_input).source_ref
      !~ '^(twse-openapi:BWIBBU_ALL|twse-rwd:BWIBBU_d):[0-9]{4}-[0-9]{2}-[0-9]{2}:[0-9]{4}$')
    OR ((p_input).exchange='TPEX' AND (p_input).source_ref
      !~ '^(tpex-openapi:peratio|tpex-rwd:peratio):[0-9]{4}-[0-9]{2}-[0-9]{2}:[0-9]{4}$')
  THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='invalid_exchange_reported_valuation';END IF;
  SELECT count(*) INTO v_session_count
  FROM public.resolve_legacy_trading_session_authority_v3_13((p_input).session_date,
    (p_input).exchange::text::public.tw_market_v3,(p_input).collected_at) session
  WHERE session.status='completed' AND session.close_at<=(p_input).collected_at;
  IF v_session_count<>1 THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='calendar_authority_mismatch';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(jsonb_build_array('exchange_reported_valuation',
    (p_input).stock_id,(p_input).exchange,(p_input).session_date)::text,0));
  SELECT reported_pe_id INTO v_id FROM public.opportunity_exchange_reported_pe_v3 row
  WHERE row.stock_id=(p_input).stock_id AND row.exchange=(p_input).exchange
    AND row.session_date=(p_input).session_date AND row.close=(p_input).close
    AND row.reported_pe IS NOT DISTINCT FROM (p_input).reported_pe
    AND row.reported_pb IS NOT DISTINCT FROM (p_input).reported_pb
    AND row.published_at=(p_input).published_at AND row.source_timestamp=(p_input).source_timestamp
    AND row.collected_at=(p_input).collected_at AND row.source_ref=(p_input).source_ref
  ORDER BY row.recorded_at,row.reported_pe_id LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO public.opportunity_exchange_reported_pe_v3(stock_id,exchange,session_date,close,
      reported_pe,reported_pb,published_at,source_timestamp,collected_at,source_ref,recorded_at)
    VALUES((p_input).stock_id,(p_input).exchange,(p_input).session_date,(p_input).close,
      (p_input).reported_pe,(p_input).reported_pb,(p_input).published_at,(p_input).source_timestamp,
      (p_input).collected_at,(p_input).source_ref,v_now) RETURNING reported_pe_id INTO v_id;
    v_created:=true;
  END IF;
  v_hash:=encode(extensions.digest(convert_to(regexp_replace(jsonb_build_array(
    (p_input).stock_id,(p_input).exchange,(p_input).session_date,(p_input).close,(p_input).reported_pe,
    (p_input).reported_pb,(p_input).published_at,(p_input).source_timestamp,(p_input).collected_at,
    (p_input).source_ref)::text,', ', ',', 'g'),'utf8'),'sha256'),'hex');
  INSERT INTO public.opportunity_rpc_audit_v3(function_name,caller_principal_id,subject_kind,subject_id,
    input_hash,disposition,recorded_at)
  VALUES('append_price_authority_v3',p_caller,'exchange_reported_pe',v_id,v_hash,
    (CASE WHEN v_created THEN 'appended' ELSE 'idempotent' END)::public.opportunity_rpc_audit_disposition_v3,v_now);
  RETURN QUERY SELECT v_id,v_now;
END $function$;

DROP TRIGGER IF EXISTS legacy_source_document_persistence_v3_13_immutable
  ON public.legacy_source_document_persistence_v3_13;
CREATE TRIGGER legacy_source_document_persistence_v3_13_immutable
  BEFORE UPDATE OR DELETE ON public.legacy_source_document_persistence_v3_13
  FOR EACH ROW EXECUTE FUNCTION public.legacy_correctness_immutable_v3_11();
DROP TRIGGER IF EXISTS legacy_source_acquisition_outcomes_v3_13_immutable
  ON public.legacy_source_acquisition_outcomes_v3_13;
CREATE TRIGGER legacy_source_acquisition_outcomes_v3_13_immutable
  BEFORE UPDATE OR DELETE ON public.legacy_source_acquisition_outcomes_v3_13
  FOR EACH ROW EXECUTE FUNCTION public.legacy_correctness_immutable_v3_11();
DROP TRIGGER IF EXISTS legacy_frozen_source_authorities_v3_13_immutable
  ON public.legacy_frozen_source_authorities_v3_13;
CREATE TRIGGER legacy_frozen_source_authorities_v3_13_immutable
  BEFORE UPDATE OR DELETE ON public.legacy_frozen_source_authorities_v3_13
  FOR EACH ROW EXECUTE FUNCTION public.legacy_correctness_immutable_v3_11();
DROP TRIGGER IF EXISTS legacy_source_append_context_v3_13_immutable
  ON public.legacy_source_append_context_v3_13;
CREATE TRIGGER legacy_source_append_context_v3_13_immutable
  BEFORE UPDATE OR DELETE ON public.legacy_source_append_context_v3_13
  FOR EACH ROW EXECUTE FUNCTION public.legacy_correctness_immutable_v3_11();
DROP TRIGGER IF EXISTS legacy_source_connector_attempts_v3_13_immutable
  ON public.legacy_source_connector_attempts_v3_13;
CREATE TRIGGER legacy_source_connector_attempts_v3_13_immutable
  BEFORE UPDATE OR DELETE ON public.legacy_source_connector_attempts_v3_13
  FOR EACH ROW EXECUTE FUNCTION public.legacy_correctness_immutable_v3_11();
DROP TRIGGER IF EXISTS legacy_source_item_outcomes_v3_13_immutable
  ON public.legacy_source_item_outcomes_v3_13;
CREATE TRIGGER legacy_source_item_outcomes_v3_13_immutable
  BEFORE UPDATE OR DELETE ON public.legacy_source_item_outcomes_v3_13
  FOR EACH ROW EXECUTE FUNCTION public.legacy_correctness_immutable_v3_11();
DROP TRIGGER IF EXISTS legacy_source_processing_outcomes_v3_13_immutable
  ON public.legacy_source_processing_outcomes_v3_13;
CREATE TRIGGER legacy_source_processing_outcomes_v3_13_immutable
  BEFORE UPDATE OR DELETE ON public.legacy_source_processing_outcomes_v3_13
  FOR EACH ROW EXECUTE FUNCTION public.legacy_correctness_immutable_v3_11();
DROP TRIGGER IF EXISTS legacy_decision_revisions_v3_13_immutable
  ON public.legacy_decision_revisions_v3_13;
CREATE TRIGGER legacy_decision_revisions_v3_13_immutable
  BEFORE UPDATE OR DELETE ON public.legacy_decision_revisions_v3_13
  FOR EACH ROW EXECUTE FUNCTION public.legacy_correctness_immutable_v3_11();
DROP TRIGGER IF EXISTS legacy_decision_revision_evaluations_v3_13_immutable
  ON public.legacy_decision_revision_evaluations_v3_13;
CREATE TRIGGER legacy_decision_revision_evaluations_v3_13_immutable
  BEFORE UPDATE OR DELETE ON public.legacy_decision_revision_evaluations_v3_13
  FOR EACH ROW EXECUTE FUNCTION public.legacy_correctness_immutable_v3_11();
DROP TRIGGER IF EXISTS legacy_analysis_revision_payloads_v3_13_immutable
  ON public.legacy_analysis_revision_payloads_v3_13;
CREATE TRIGGER legacy_analysis_revision_payloads_v3_13_immutable
  BEFORE UPDATE OR DELETE ON public.legacy_analysis_revision_payloads_v3_13
  FOR EACH ROW EXECUTE FUNCTION public.legacy_correctness_immutable_v3_11();

-- Every projection writer, including the atomic completion path, crosses these
-- table-level guards.  This removes the historical difference between the helper
-- append RPC and the live completion insert.
CREATE OR REPLACE FUNCTION public.guard_legacy_radar_projection_insert_v3_13()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_latest_as_of timestamptz;v_latest_hash text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW."window",0));
  SELECT projection.as_of,projection.payload_sha256 INTO v_latest_as_of,v_latest_hash
  FROM public.legacy_radar_projections_v3_11 projection
  WHERE projection."window"=NEW."window"
  ORDER BY projection.as_of DESC,projection.created_at DESC,projection.projection_id ASC LIMIT 1;
  IF v_latest_as_of IS NOT NULL AND NEW.as_of<v_latest_as_of THEN
    RAISE EXCEPTION 'non_monotonic_projection';
  END IF;
  IF v_latest_as_of=NEW.as_of AND v_latest_hash<>NEW.payload_sha256 THEN
    RAISE EXCEPTION 'projection_conflict';
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.retain_legacy_radar_projection_v3_13()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
BEGIN
  PERFORM set_config('stockinsider.legacy_projection_retention','on',true);
  DELETE FROM public.legacy_radar_projections_v3_11 projection WHERE projection.projection_id IN(
    SELECT retained.projection_id FROM public.legacy_radar_projections_v3_11 retained
    WHERE retained."window"=NEW."window"
    ORDER BY retained.as_of DESC,retained.created_at DESC,retained.projection_id ASC OFFSET 1500
  );
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS legacy_radar_projection_insert_guard_v3_13
  ON public.legacy_radar_projections_v3_11;
CREATE TRIGGER legacy_radar_projection_insert_guard_v3_13
  BEFORE INSERT ON public.legacy_radar_projections_v3_11 FOR EACH ROW
  EXECUTE FUNCTION public.guard_legacy_radar_projection_insert_v3_13();
DROP TRIGGER IF EXISTS legacy_radar_projection_retention_v3_13
  ON public.legacy_radar_projections_v3_11;
CREATE TRIGGER legacy_radar_projection_retention_v3_13
  AFTER INSERT ON public.legacy_radar_projections_v3_11 FOR EACH ROW
  EXECUTE FUNCTION public.retain_legacy_radar_projection_v3_13();

DO $rename_read_plane$
BEGIN
  IF to_regprocedure('public.read_legacy_candidate_fact_plane_authoritative_v3_13(timestamptz,jsonb)') IS NULL THEN
    ALTER FUNCTION public.read_legacy_candidate_fact_plane_v3_11(timestamptz,jsonb)
      RENAME TO read_legacy_candidate_fact_plane_authoritative_v3_13;
  END IF;
END $rename_read_plane$;

-- V3.13 consumers must resolve append-only authority streams by the latest
-- cutoff-visible database recording, never by the provider's business timestamp.
-- Equal-head semantic disagreement is an integrity failure, not a UUID tie-break.
CREATE OR REPLACE FUNCTION public.resolve_legacy_instrument_authority_v3_13_internal(
  p_stock_id uuid,p_cutoff timestamptz
) RETURNS SETOF public.stock_instruments_v3
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $resolver$
DECLARE v_head timestamptz;v_semantics integer;v_retained integer;v_registered boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM public.opportunity_authority_stream_registry_v3 registry
    WHERE registry.family='instrument_roster'
      AND (convert_from(registry.stream_key_canonical,'utf8')::jsonb->>1)::uuid=p_stock_id)
    INTO v_registered;
  IF NOT v_registered THEN RETURN;END IF;
  WITH bounded AS MATERIALIZED(SELECT authority.* FROM public.stock_instruments_v3 authority
    WHERE authority.stock_id=p_stock_id
    ORDER BY authority.recorded_at DESC,authority.instrument_authority_id LIMIT 65)
  SELECT count(*),max(recorded_at) FILTER(WHERE recorded_at<=p_cutoff
    AND source_timestamp<=p_cutoff AND valid_from<=p_cutoff) INTO v_retained,v_head FROM bounded;
  IF v_retained>64 THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='bound_violation';END IF;
  IF v_head IS NULL THEN RETURN;END IF;
  SELECT count(DISTINCT jsonb_build_array(stock_id,symbol,exchange,instrument_type,
    listing_status,official_legal_name,official_short_name,provider,source_timestamp,
    valid_from,valid_to,roster_version)) INTO v_semantics
  FROM public.stock_instruments_v3
  WHERE stock_id=p_stock_id AND recorded_at=v_head
    AND source_timestamp<=p_cutoff AND valid_from<=p_cutoff;
  IF v_semantics<>1 THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='authority_revision_conflict';END IF;
  RETURN QUERY SELECT authority.* FROM public.stock_instruments_v3 authority
  WHERE authority.stock_id=p_stock_id AND authority.recorded_at=v_head
    AND authority.source_timestamp<=p_cutoff AND authority.valid_from<=p_cutoff
  ORDER BY authority.instrument_authority_id LIMIT 1;
END $resolver$;

CREATE OR REPLACE FUNCTION public.resolve_legacy_instrument_authority_v3_13(
  p_stock_id uuid,p_cutoff timestamptz
) RETURNS SETOF public.stock_instruments_v3
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $resolver$
BEGIN
  PERFORM public.opportunity_authority_selected_stream_count_v3_internal('instrument_roster',p_cutoff);
  RETURN QUERY SELECT * FROM public.resolve_legacy_instrument_authority_v3_13_internal(p_stock_id,p_cutoff);
END $resolver$;

CREATE OR REPLACE FUNCTION public.resolve_legacy_instrument_symbol_authority_v3_13_internal(
  p_symbol text,p_cutoff timestamptz
) RETURNS SETOF public.stock_instruments_v3
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $resolver$
DECLARE v_matches integer;v_stream_count integer;v_streams uuid[];
BEGIN
  SELECT array_agg(stock_id ORDER BY stock_id),count(*) INTO v_streams,v_stream_count FROM(
    SELECT (convert_from(registry.stream_key_canonical,'utf8')::jsonb->>1)::uuid stock_id
    FROM public.opportunity_authority_stream_registry_v3 registry
    WHERE registry.family='instrument_roster'
    ORDER BY registry.stream_key_hash,registry.stream_key_canonical LIMIT 20001
  ) bounded;
  IF v_stream_count>20000 THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='roster_volume_exceeded';
  END IF;
  RETURN QUERY
  SELECT authority.* FROM unnest(coalesce(v_streams,'{}'::uuid[])) stream(stock_id)
  CROSS JOIN LATERAL public.resolve_legacy_instrument_authority_v3_13_internal(stream.stock_id,p_cutoff) authority
  WHERE authority.symbol=p_symbol ORDER BY authority.stock_id LIMIT 2;
  GET DIAGNOSTICS v_matches=ROW_COUNT;
  IF v_matches>1 THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='authority_revision_conflict';END IF;
END $resolver$;

CREATE OR REPLACE FUNCTION public.resolve_legacy_instrument_symbol_authority_v3_13(
  p_symbol text,p_cutoff timestamptz
) RETURNS SETOF public.stock_instruments_v3
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $resolver$
BEGIN
  PERFORM public.opportunity_authority_selected_stream_count_v3_internal('instrument_roster',p_cutoff);
  RETURN QUERY SELECT * FROM public.resolve_legacy_instrument_symbol_authority_v3_13_internal(p_symbol,p_cutoff);
END $resolver$;

CREATE OR REPLACE FUNCTION public.resolve_legacy_sector_authority_v3_13_internal(
  p_stock_id uuid,p_market public.tw_market_v3,p_cutoff timestamptz
) RETURNS SETOF public.stock_sector_assignments_v3
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $resolver$
DECLARE v_head timestamptz;v_semantics integer;v_retained integer;v_registered boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM public.opportunity_authority_stream_registry_v3 registry
    WHERE registry.family='sector_assignment'
      AND (convert_from(registry.stream_key_canonical,'utf8')::jsonb->>1)::uuid=p_stock_id
      AND (convert_from(registry.stream_key_canonical,'utf8')::jsonb->>2)::public.tw_market_v3=p_market)
    INTO v_registered;
  IF NOT v_registered THEN RETURN;END IF;
  WITH bounded AS MATERIALIZED(SELECT authority.* FROM public.stock_sector_assignments_v3 authority
    WHERE authority.stock_id=p_stock_id AND authority.market=p_market
    ORDER BY authority.recorded_at DESC,authority.assignment_authority_id LIMIT 65)
  SELECT count(*),max(recorded_at) FILTER(WHERE recorded_at<=p_cutoff
    AND source_timestamp<=p_cutoff AND valid_from<=p_cutoff) INTO v_retained,v_head FROM bounded;
  IF v_retained>64 THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='bound_violation';END IF;
  IF v_head IS NULL THEN RETURN;END IF;
  SELECT count(DISTINCT jsonb_build_array(stock_id,market,official_industry_code,
    canonical_sector_key,provider,source_timestamp,valid_from,valid_to,taxonomy_version,status))
    INTO v_semantics
  FROM public.stock_sector_assignments_v3
  WHERE stock_id=p_stock_id AND market=p_market AND recorded_at=v_head
    AND source_timestamp<=p_cutoff AND valid_from<=p_cutoff;
  IF v_semantics<>1 THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='authority_revision_conflict';END IF;
  RETURN QUERY SELECT authority.* FROM public.stock_sector_assignments_v3 authority
  WHERE authority.stock_id=p_stock_id AND authority.market=p_market AND authority.recorded_at=v_head
    AND authority.source_timestamp<=p_cutoff AND authority.valid_from<=p_cutoff
  ORDER BY authority.assignment_authority_id LIMIT 1;
END $resolver$;

CREATE OR REPLACE FUNCTION public.resolve_legacy_sector_authority_v3_13(
  p_stock_id uuid,p_market public.tw_market_v3,p_cutoff timestamptz
) RETURNS SETOF public.stock_sector_assignments_v3
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $resolver$
BEGIN
  PERFORM public.opportunity_authority_selected_stream_count_v3_internal('sector_assignment',p_cutoff);
  RETURN QUERY SELECT * FROM public.resolve_legacy_sector_authority_v3_13_internal(p_stock_id,p_market,p_cutoff);
END $resolver$;

CREATE OR REPLACE FUNCTION public.resolve_legacy_trading_session_authority_v3_13(
  p_session_id date,p_market public.tw_market_v3,p_cutoff timestamptz
) RETURNS SETOF public.tw_trading_sessions_v3
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $resolver$
DECLARE v_head timestamptz;v_semantics integer;v_retained integer;
BEGIN
  WITH bounded AS MATERIALIZED(SELECT authority.* FROM public.tw_trading_sessions_v3 authority
    WHERE authority.session_id=p_session_id AND authority.market=p_market
      AND authority.recorded_at<=p_cutoff AND authority.source_timestamp<=p_cutoff
      AND authority.collected_at<=p_cutoff
    ORDER BY authority.recorded_at DESC,authority.session_authority_id LIMIT 1025)
  SELECT count(*),max(recorded_at) INTO v_retained,v_head FROM bounded;
  IF v_retained>1024 THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='bound_violation';END IF;
  IF v_head IS NULL THEN RETURN;END IF;
  SELECT count(DISTINCT jsonb_build_array(session_id,market,open_at,close_at,status,
    provider,source_timestamp,collected_at,source_ref)) INTO v_semantics
  FROM public.tw_trading_sessions_v3
  WHERE session_id=p_session_id AND market=p_market AND recorded_at=v_head
    AND source_timestamp<=p_cutoff AND collected_at<=p_cutoff;
  IF v_semantics<>1 THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='authority_revision_conflict';END IF;
  RETURN QUERY SELECT authority.* FROM public.tw_trading_sessions_v3 authority
  WHERE authority.session_id=p_session_id AND authority.market=p_market AND authority.recorded_at=v_head
    AND authority.source_timestamp<=p_cutoff AND authority.collected_at<=p_cutoff
  ORDER BY authority.session_authority_id LIMIT 1;
END $resolver$;

-- Enumerate only the caller-named civil-date interval, retain one 513-member
-- sentinel and fail rather than truncating a required 513th stream.
CREATE OR REPLACE FUNCTION public.resolve_legacy_trading_session_window_v3_13(
  p_market public.tw_market_v3,p_oldest date,p_newest date,p_cutoff timestamptz
) RETURNS SETOF public.tw_trading_sessions_v3
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $resolver$
DECLARE v_sessions date[];v_stream_count integer;
BEGIN
  IF p_oldest IS NULL OR p_newest IS NULL OR p_oldest>p_newest THEN
    RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='invalid_calendar_window';
  END IF;
  SELECT array_agg(session_id ORDER BY session_id DESC),count(*)
    INTO v_sessions,v_stream_count FROM(
      SELECT DISTINCT raw.session_id FROM public.tw_trading_sessions_v3 raw
      WHERE raw.market=p_market AND raw.session_id BETWEEN p_oldest AND p_newest
      ORDER BY raw.session_id DESC LIMIT 513
    ) bounded;
  IF v_stream_count>512 THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='bound_violation';
  END IF;
  RETURN QUERY
  SELECT selected.* FROM unnest(coalesce(v_sessions,'{}'::date[])) WITH ORDINALITY stream(session_id,ordinal)
  CROSS JOIN LATERAL public.resolve_legacy_trading_session_authority_v3_13(
    stream.session_id,p_market,p_cutoff) selected
  ORDER BY stream.ordinal;
END $resolver$;

-- Resolve one cutoff-current official shares head. Units are normalized before
-- semantic tie comparison so byte-equivalent share/thousand-share facts collapse,
-- while a genuinely different equal head fails closed instead of dropping a peer.
CREATE OR REPLACE FUNCTION public.resolve_legacy_official_shares_v3_13(
  p_stock_id uuid,p_session_id date,p_cutoff timestamptz
) RETURNS double precision
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $resolver$
DECLARE v_value double precision;v_semantics integer;
BEGIN
  WITH eligible AS MATERIALIZED(
    SELECT fact.*,CASE fact.unit
      WHEN 'share'::public.financial_unit_v3 THEN fact.value
      WHEN 'thousand_shares'::public.financial_unit_v3 THEN fact.value*1000
      ELSE NULL END normalized_value
    FROM public.opportunity_financial_facts_v3 fact
    WHERE fact.stock_id=p_stock_id AND fact.fact_key='shares_outstanding'
      AND fact.authority_tier='official_filing' AND fact.value>0
      AND fact.unit IN('share','thousand_shares')
      AND fact.period_end<=p_session_id AND fact.filing_published_at<=p_cutoff
      AND fact.source_timestamp>=p_session_id::timestamp-interval '183 days'
      AND fact.source_timestamp<=p_cutoff AND fact.collected_at<=p_cutoff
      AND fact.recorded_at<=p_cutoff
  ), head AS MATERIALIZED(
    SELECT period_end,filing_published_at,source_timestamp,collected_at,recorded_at,
      coalesce(filing_restatement_id,'') filing_restatement_id
    FROM eligible ORDER BY period_end DESC,filing_published_at DESC,source_timestamp DESC,
      collected_at DESC,recorded_at DESC,coalesce(filing_restatement_id,'') DESC LIMIT 1
  ), greatest AS MATERIALIZED(
    SELECT eligible.* FROM eligible JOIN head ON eligible.period_end=head.period_end
      AND eligible.filing_published_at=head.filing_published_at
      AND eligible.source_timestamp=head.source_timestamp AND eligible.collected_at=head.collected_at
      AND eligible.recorded_at=head.recorded_at
      AND coalesce(eligible.filing_restatement_id,'')=head.filing_restatement_id
  ) SELECT min(normalized_value),count(DISTINCT normalized_value)
    INTO v_value,v_semantics FROM greatest;
  IF coalesce(v_semantics,0)>1 THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='authority_conflict';
  END IF;
  RETURN v_value;
END $resolver$;

CREATE OR REPLACE FUNCTION public.resolve_legacy_official_shares_result_v3_13(
  p_stock_id uuid,p_session_id date,p_cutoff timestamptz
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $resolver$
DECLARE v_value double precision;v_semantics integer;
BEGIN
  WITH eligible AS MATERIALIZED(
    SELECT fact.*,CASE fact.unit
      WHEN 'share'::public.financial_unit_v3 THEN fact.value
      WHEN 'thousand_shares'::public.financial_unit_v3 THEN fact.value*1000
      ELSE NULL END normalized_value
    FROM public.opportunity_financial_facts_v3 fact
    WHERE fact.stock_id=p_stock_id AND fact.fact_key='shares_outstanding'
      AND fact.authority_tier='official_filing' AND fact.value>0
      AND fact.unit IN('share','thousand_shares')
      AND fact.period_end<=p_session_id AND fact.filing_published_at<=p_cutoff
      AND fact.source_timestamp>=p_session_id::timestamp-interval '183 days'
      AND fact.source_timestamp<=p_cutoff AND fact.collected_at<=p_cutoff
      AND fact.recorded_at<=p_cutoff
  ), head AS MATERIALIZED(
    SELECT period_end,filing_published_at,source_timestamp,collected_at,recorded_at,
      coalesce(filing_restatement_id,'') filing_restatement_id
    FROM eligible ORDER BY period_end DESC,filing_published_at DESC,source_timestamp DESC,
      collected_at DESC,recorded_at DESC,coalesce(filing_restatement_id,'') DESC LIMIT 1
  ), greatest AS MATERIALIZED(
    SELECT eligible.* FROM eligible JOIN head ON eligible.period_end=head.period_end
      AND eligible.filing_published_at=head.filing_published_at
      AND eligible.source_timestamp=head.source_timestamp AND eligible.collected_at=head.collected_at
      AND eligible.recorded_at=head.recorded_at
      AND coalesce(eligible.filing_restatement_id,'')=head.filing_restatement_id
  ) SELECT min(normalized_value),count(DISTINCT normalized_value)
    INTO v_value,v_semantics FROM greatest;
  IF coalesce(v_semantics,0)>1 THEN
    RETURN jsonb_build_object('status','authority_conflict','value',NULL);
  END IF;
  RETURN jsonb_build_object('status',CASE WHEN v_value IS NULL THEN 'missing' ELSE 'available' END,
    'value',v_value);
END $resolver$;

CREATE OR REPLACE FUNCTION public.read_legacy_candidate_fact_plane_v3_11(
  p_source_cutoff timestamptz,p_candidate_result jsonb
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_base jsonb;v_reported_pe jsonb;v_source_provenance jsonb;v_backfill_sessions jsonb;
  v_price_backfill jsonb;v_action_backfill jsonb;v_freshness_schedule jsonb;
BEGIN
  PERFORM public.opportunity_authority_selected_stream_count_v3_internal('discovery_identity',p_source_cutoff);
  PERFORM public.opportunity_authority_selected_stream_count_v3_internal('instrument_roster',p_source_cutoff);
  PERFORM public.opportunity_authority_selected_stream_count_v3_internal('sector_assignment',p_source_cutoff);
  v_base:=public.read_legacy_candidate_fact_plane_authoritative_v3_13(p_source_cutoff,p_candidate_result);
  WITH candidates AS MATERIALIZED (
    SELECT (value->>'stockId')::uuid AS stock_id,value->>'symbol' AS symbol
    FROM jsonb_array_elements(coalesce(p_candidate_result->'candidates','[]'::jsonb)) item(value)
    WHERE (value->>'stockId')~*'^[0-9a-f-]{36}$' AND (value->>'symbol')~'^[0-9]{4}$'
      AND coalesce((value->>'deepSelected')::boolean,false)
  ), candidate_authorities AS MATERIALIZED (
    SELECT instrument.stock_id,instrument.symbol,instrument.exchange::text exchange,
      sector.canonical_sector_key::text sector
    FROM candidates candidate
    JOIN LATERAL(SELECT selected.stock_id,selected.symbol,selected.exchange
      FROM public.resolve_legacy_instrument_authority_v3_13_internal(candidate.stock_id,p_source_cutoff) selected
      WHERE selected.symbol=candidate.symbol AND selected.instrument_type='common_stock'
        AND selected.listing_status='active'
        AND (selected.valid_to IS NULL OR p_source_cutoff<selected.valid_to)) instrument ON true
    JOIN LATERAL(SELECT selected.canonical_sector_key
      FROM public.resolve_legacy_sector_authority_v3_13_internal(candidate.stock_id,
        instrument.exchange::text::public.tw_market_v3,p_source_cutoff) selected
      WHERE selected.status='active' AND selected.canonical_sector_key<>'unknown'
        AND (selected.valid_to IS NULL OR p_source_cutoff<selected.valid_to)) sector ON true
  ), observation_session_identities AS MATERIALIZED (
    SELECT authority.*,identity.session_date,identity.ordinal
    FROM candidate_authorities authority
    CROSS JOIN LATERAL(
      SELECT member.session_date,row_number() OVER(ORDER BY member.session_date DESC)::integer ordinal
      FROM (SELECT DISTINCT raw.session_date
        FROM public.opportunity_exchange_reported_pe_v3 raw
        WHERE raw.stock_id=authority.stock_id AND raw.exchange::text=authority.exchange
        ORDER BY raw.session_date DESC LIMIT 1261) member
    ) identity
  ), candidate_observation_session_counts AS MATERIALIZED (
    SELECT stock_id,symbol,exchange,sector,count(*) session_count
    FROM observation_session_identities
    GROUP BY stock_id,symbol,exchange,sector
  ), candidate_bound_guard AS MATERIALIZED (
    SELECT coalesce(max(CASE WHEN session_count>1260
      THEN public.opportunity_raise_pt409_v3_internal('bound_violation') ELSE 0 END),0) checked
    FROM candidate_observation_session_counts
  ), requested_calendar_windows AS MATERIALIZED (
    SELECT requested.exchange,
      (p_source_cutoff AT TIME ZONE 'Asia/Taipei')::date-730 oldest_session,
      (p_source_cutoff AT TIME ZONE 'Asia/Taipei')::date newest_session
    FROM (SELECT DISTINCT exchange FROM candidate_authorities) requested
  ), candidate_calendar_sessions AS MATERIALIZED (
    SELECT authority.stock_id,authority.symbol,authority.exchange,authority.sector,session.session_id,
      least(session.close_at,p_source_cutoff) knowledge_cutoff,
      encode(extensions.digest(convert_to(session.session_authority_id::text,'utf8'),'sha256'),'hex') authority_hash
    FROM candidate_authorities authority JOIN requested_calendar_windows bound USING(exchange)
    CROSS JOIN candidate_bound_guard guard
    CROSS JOIN LATERAL public.resolve_legacy_trading_session_window_v3_13(
      authority.exchange::public.tw_market_v3,bound.oldest_session,bound.newest_session,p_source_cutoff) session
    WHERE guard.checked=0 AND session.status='completed'
      AND session.close_at<=p_source_cutoff
  ), candidate_observation_revisions AS MATERIALIZED (
    SELECT session.stock_id,session.symbol,session.exchange,session.sector,session.session_id,session.knowledge_cutoff,
      session.authority_hash,observation.close,observation.reported_pe,observation.reported_pb,
      observation.published_at,observation.source_timestamp,observation.collected_at,
      observation.recorded_at,observation.source_ref,observation.reported_pe_id,
      dense_rank() OVER(PARTITION BY observation.stock_id,observation.exchange,observation.session_date
        ORDER BY observation.published_at DESC,observation.source_timestamp DESC,
          observation.collected_at DESC,observation.recorded_at DESC) head_rank
    FROM candidate_calendar_sessions session
    JOIN public.opportunity_exchange_reported_pe_v3 observation
      ON observation.stock_id=session.stock_id AND observation.exchange::text=session.exchange
      AND observation.session_date=session.session_id
    WHERE observation.published_at<=p_source_cutoff AND observation.source_timestamp<=p_source_cutoff
      AND observation.collected_at<=p_source_cutoff AND observation.recorded_at<=p_source_cutoff
  ), candidate_observation_heads AS MATERIALIZED (
    SELECT stock_id,symbol,exchange,sector,session_id,knowledge_cutoff,authority_hash,
      count(DISTINCT jsonb_build_array(close,reported_pe,reported_pb))>1 authority_conflict,
      min(close) close,min(reported_pe) reported_pe,min(reported_pb) reported_pb,
      min(published_at) published_at,min(source_timestamp) source_timestamp,
      min(collected_at) collected_at,min(source_ref) source_ref
    FROM candidate_observation_revisions WHERE head_rank=1
    GROUP BY stock_id,symbol,exchange,sector,session_id,knowledge_cutoff,authority_hash
  ), candidate_history_unranked AS MATERIALIZED (
    SELECT observation.symbol,observation.sector,observation.exchange,
      observation.session_id session_date,
      CASE WHEN observation.authority_conflict THEN NULL ELSE observation.close END close,
      CASE WHEN observation.authority_conflict THEN NULL ELSE observation.reported_pe END reported_pe,
      CASE WHEN observation.authority_conflict THEN NULL ELSE observation.reported_pb END reported_pb,
      CASE WHEN observation.authority_conflict THEN NULL ELSE observation.published_at END published_at,
      CASE WHEN observation.authority_conflict THEN NULL ELSE observation.source_timestamp END source_timestamp,
      CASE WHEN observation.authority_conflict THEN NULL ELSE observation.collected_at END collected_at,
      CASE WHEN observation.authority_conflict THEN NULL ELSE observation.source_ref END source_ref,
      observation.stock_id,observation.knowledge_cutoff,observation.authority_hash,
      CASE WHEN observation.authority_conflict OR metrics.authority_conflict THEN NULL ELSE metrics.ev_sales_ratio END ev_sales_ratio,
      CASE WHEN observation.authority_conflict OR metrics.authority_conflict THEN NULL ELSE metrics.ev_ebitda_ratio END ev_ebitda_ratio,
      CASE WHEN observation.authority_conflict OR metrics.authority_conflict
          OR shares.result->>'status'<>'available' OR NOT (metrics.net_asset_value>0)
        THEN NULL ELSE observation.close*(shares.result->>'value')::double precision/metrics.net_asset_value END nav_multiple,
      CASE WHEN observation.authority_conflict OR metrics.authority_conflict THEN '[]'::jsonb ELSE metrics.metric_refs END metric_refs,
      (shares.result->>'value')::double precision shares_outstanding,
      observation.authority_conflict OR coalesce(metrics.authority_conflict,false)
        OR shares.result->>'status'='authority_conflict' authority_conflict
    FROM candidate_observation_heads observation
    LEFT JOIN LATERAL(
      WITH ranked AS MATERIALIZED (
        SELECT fact.*,dense_rank() OVER(PARTITION BY fact.fact_key ORDER BY fact.filing_published_at DESC,
          fact.source_timestamp DESC,fact.collected_at DESC,fact.recorded_at DESC,
          fact.filing_restatement_id DESC NULLS LAST) head_rank
        FROM public.opportunity_financial_facts_v3 fact
        WHERE fact.stock_id=observation.stock_id AND fact.authority_tier='official_filing'
          AND ((fact.fact_key IN('ev_sales_multiple','ev_ebitda_multiple') AND fact.unit='dimensionless')
            OR (fact.fact_key='net_asset_value' AND fact.unit IN('TWD','TWD_thousand','TWD_million')))
          AND fact.filing_published_at<=observation.knowledge_cutoff
          AND fact.source_timestamp<=observation.knowledge_cutoff
          AND fact.collected_at<=observation.knowledge_cutoff AND fact.recorded_at<=observation.knowledge_cutoff
      ), heads AS MATERIALIZED (SELECT * FROM ranked WHERE head_rank=1), conflict AS MATERIALIZED (
        SELECT fact_key,count(DISTINCT value)>1 authority_conflict FROM heads GROUP BY fact_key
      )
      SELECT CASE WHEN count(DISTINCT value) FILTER(WHERE heads.fact_key='ev_sales_multiple')=1
          THEN min(value) FILTER(WHERE heads.fact_key='ev_sales_multiple') END ev_sales_ratio,
        CASE WHEN count(DISTINCT value) FILTER(WHERE heads.fact_key='ev_ebitda_multiple')=1
          THEN min(value) FILTER(WHERE heads.fact_key='ev_ebitda_multiple') END ev_ebitda_ratio,
        CASE WHEN count(DISTINCT jsonb_build_array(value,unit)) FILTER(WHERE heads.fact_key='net_asset_value')=1
          THEN min(value*CASE unit WHEN 'TWD' THEN 1 WHEN 'TWD_thousand' THEN 1000
            WHEN 'TWD_million' THEN 1000000 END) FILTER(WHERE heads.fact_key='net_asset_value') END net_asset_value,
        bool_or(coalesce(conflict.authority_conflict,false)) authority_conflict,
        coalesce(jsonb_agg(jsonb_build_array(heads.fact_key,heads.source_ref,heads.filing_published_at)
          ORDER BY heads.fact_key,heads.source_ref) FILTER(WHERE NOT conflict.authority_conflict),'[]'::jsonb) metric_refs
      FROM heads JOIN conflict USING(fact_key)
    ) metrics ON true
    LEFT JOIN LATERAL(SELECT public.resolve_legacy_official_shares_result_v3_13(
      observation.stock_id,observation.session_id,observation.knowledge_cutoff) result) shares ON true
  ), candidate_history AS MATERIALIZED (
    SELECT history.*,dense_rank() OVER(PARTITION BY stock_id ORDER BY session_date DESC) rank
    FROM candidate_history_unranked history
  ), peer_session_targets AS MATERIALIZED (
    SELECT DISTINCT exchange,session_date,knowledge_cutoff,authority_hash FROM candidate_history WHERE rank=1
  ), peer_observation_revisions AS MATERIALIZED (
    SELECT observation.*,target.knowledge_cutoff,target.authority_hash,
      dense_rank() OVER(PARTITION BY observation.stock_id,observation.exchange,observation.session_date
        ORDER BY observation.published_at DESC,observation.source_timestamp DESC,
          observation.collected_at DESC,observation.recorded_at DESC) head_rank
    FROM peer_session_targets target JOIN public.opportunity_exchange_reported_pe_v3 observation
      ON observation.exchange::text=target.exchange AND observation.session_date=target.session_date
    WHERE observation.published_at<=p_source_cutoff AND observation.source_timestamp<=p_source_cutoff
      AND observation.collected_at<=p_source_cutoff AND observation.recorded_at<=p_source_cutoff
  ), peer_observations AS MATERIALIZED (
    SELECT stock_id,exchange,session_date,knowledge_cutoff,authority_hash,
      count(DISTINCT jsonb_build_array(close,reported_pe,reported_pb))>1 authority_conflict,
      min(close) close,min(reported_pe) reported_pe,min(reported_pb) reported_pb,
      min(published_at) published_at,min(source_timestamp) source_timestamp,
      min(collected_at) collected_at,min(source_ref) source_ref
    FROM peer_observation_revisions WHERE head_rank=1
    GROUP BY stock_id,exchange,session_date,knowledge_cutoff,authority_hash
  ), peer_roster AS MATERIALIZED (
    SELECT instrument.symbol,sector.canonical_sector_key::text AS sector,
      observation.exchange::text,observation.session_date,
      CASE WHEN observation.authority_conflict THEN NULL ELSE observation.close END close,
      CASE WHEN observation.authority_conflict THEN NULL ELSE observation.reported_pe END reported_pe,
      CASE WHEN observation.authority_conflict THEN NULL ELSE observation.reported_pb END reported_pb,
      CASE WHEN observation.authority_conflict THEN NULL ELSE observation.published_at END published_at,
      CASE WHEN observation.authority_conflict THEN NULL ELSE observation.source_timestamp END source_timestamp,
      CASE WHEN observation.authority_conflict THEN NULL ELSE observation.collected_at END collected_at,
      CASE WHEN observation.authority_conflict THEN NULL ELSE observation.source_ref END source_ref,
      observation.stock_id,observation.knowledge_cutoff,observation.authority_hash,
      CASE WHEN observation.authority_conflict OR metrics.authority_conflict THEN NULL ELSE metrics.ev_sales_ratio END ev_sales_ratio,
      CASE WHEN observation.authority_conflict OR metrics.authority_conflict THEN NULL ELSE metrics.ev_ebitda_ratio END ev_ebitda_ratio,
      CASE WHEN observation.authority_conflict OR metrics.authority_conflict
          OR shares.result->>'status'<>'available' OR NOT (metrics.net_asset_value>0)
        THEN NULL ELSE observation.close*(shares.result->>'value')::double precision/metrics.net_asset_value END AS nav_multiple,
      CASE WHEN observation.authority_conflict OR metrics.authority_conflict THEN '[]'::jsonb ELSE metrics.metric_refs END metric_refs,
      (shares.result->>'value')::double precision AS shares_outstanding,
      observation.authority_conflict OR coalesce(metrics.authority_conflict,false)
        OR shares.result->>'status'='authority_conflict' AS authority_conflict,
      1::bigint AS rank
    FROM peer_observations observation
    JOIN LATERAL(SELECT selected.symbol
      FROM public.resolve_legacy_instrument_authority_v3_13_internal(observation.stock_id,p_source_cutoff) selected
      WHERE selected.exchange=observation.exchange AND selected.instrument_type='common_stock'
      AND selected.listing_status='active'
      AND (selected.valid_to IS NULL OR p_source_cutoff<selected.valid_to)) instrument ON true
    JOIN LATERAL(SELECT selected.canonical_sector_key
      FROM public.resolve_legacy_sector_authority_v3_13_internal(observation.stock_id,
        observation.exchange::text::public.tw_market_v3,p_source_cutoff) selected
      WHERE selected.status='active' AND selected.canonical_sector_key<>'unknown'
      AND (selected.valid_to IS NULL OR p_source_cutoff<selected.valid_to)) sector ON true
    LEFT JOIN LATERAL(
      WITH ranked AS MATERIALIZED (
        SELECT fact.*,dense_rank() OVER(PARTITION BY fact.fact_key ORDER BY fact.filing_published_at DESC,
          fact.source_timestamp DESC,fact.collected_at DESC,fact.recorded_at DESC,
          fact.filing_restatement_id DESC NULLS LAST) head_rank
        FROM public.opportunity_financial_facts_v3 fact
        WHERE fact.stock_id=observation.stock_id AND fact.authority_tier='official_filing'
          AND ((fact.fact_key IN('ev_sales_multiple','ev_ebitda_multiple') AND fact.unit='dimensionless')
            OR (fact.fact_key='net_asset_value' AND fact.unit IN('TWD','TWD_thousand','TWD_million')))
          AND fact.filing_published_at<=observation.knowledge_cutoff
          AND fact.source_timestamp<=observation.knowledge_cutoff
          AND fact.collected_at<=observation.knowledge_cutoff AND fact.recorded_at<=observation.knowledge_cutoff
      ), heads AS MATERIALIZED (SELECT * FROM ranked WHERE head_rank=1), conflict AS MATERIALIZED (
        SELECT fact_key,count(DISTINCT value)>1 authority_conflict FROM heads GROUP BY fact_key
      )
      SELECT CASE WHEN count(DISTINCT value) FILTER(WHERE heads.fact_key='ev_sales_multiple')=1
          THEN min(value) FILTER(WHERE heads.fact_key='ev_sales_multiple') END ev_sales_ratio,
        CASE WHEN count(DISTINCT value) FILTER(WHERE heads.fact_key='ev_ebitda_multiple')=1
          THEN min(value) FILTER(WHERE heads.fact_key='ev_ebitda_multiple') END ev_ebitda_ratio,
        CASE WHEN count(DISTINCT jsonb_build_array(value,unit)) FILTER(WHERE heads.fact_key='net_asset_value')=1
          THEN min(value*CASE unit WHEN 'TWD' THEN 1 WHEN 'TWD_thousand' THEN 1000
            WHEN 'TWD_million' THEN 1000000 END) FILTER(WHERE heads.fact_key='net_asset_value') END net_asset_value,
        bool_or(coalesce(conflict.authority_conflict,false)) authority_conflict,
        coalesce(jsonb_agg(jsonb_build_array(heads.fact_key,heads.source_ref,heads.filing_published_at)
          ORDER BY heads.fact_key,heads.source_ref) FILTER(WHERE NOT conflict.authority_conflict),'[]'::jsonb) metric_refs
      FROM heads JOIN conflict USING(fact_key)
    ) metrics ON true
    LEFT JOIN LATERAL(SELECT public.resolve_legacy_official_shares_result_v3_13(
      observation.stock_id,observation.session_date,observation.knowledge_cutoff) result) shares ON true
  ), combined AS (
    SELECT symbol,sector,exchange,session_date,close,reported_pe,reported_pb,published_at,
      source_timestamp,collected_at,source_ref,stock_id,authority_hash,ev_sales_ratio,
      ev_ebitda_ratio,nav_multiple,metric_refs,shares_outstanding,
      authority_conflict,rank
    FROM candidate_history WHERE rank<=252
    UNION ALL
    SELECT symbol,sector,exchange,session_date,close,reported_pe,reported_pb,published_at,
      source_timestamp,collected_at,source_ref,stock_id,authority_hash,ev_sales_ratio,
      ev_ebitda_ratio,nav_multiple,metric_refs,shares_outstanding,authority_conflict,rank
    FROM peer_roster WHERE shares_outstanding IS NOT NULL OR authority_conflict
  ), bounded AS (
    SELECT min(symbol) symbol,min(sector) sector,exchange,session_date,
      CASE WHEN bool_or(authority_conflict) THEN NULL ELSE min(close) END close,
      CASE WHEN bool_or(authority_conflict) THEN NULL ELSE min(reported_pe) END reported_pe,
      CASE WHEN bool_or(authority_conflict) THEN NULL ELSE min(reported_pb) END reported_pb,
      CASE WHEN bool_or(authority_conflict) THEN NULL ELSE min(published_at) END published_at,
      CASE WHEN bool_or(authority_conflict) THEN NULL ELSE min(source_timestamp) END source_timestamp,
      CASE WHEN bool_or(authority_conflict) THEN NULL ELSE min(collected_at) END collected_at,
      CASE WHEN bool_or(authority_conflict) THEN NULL ELSE min(source_ref) END source_ref,
      stock_id,min(authority_hash) authority_hash,
      CASE WHEN bool_or(authority_conflict) THEN NULL ELSE min(ev_sales_ratio) END ev_sales_ratio,
      CASE WHEN bool_or(authority_conflict) THEN NULL ELSE min(ev_ebitda_ratio) END ev_ebitda_ratio,
      CASE WHEN bool_or(authority_conflict) THEN NULL ELSE min(nav_multiple) END nav_multiple,
      CASE WHEN bool_or(authority_conflict) THEN '[]'::jsonb ELSE (min(metric_refs::text))::jsonb END metric_refs,
      CASE WHEN bool_or(authority_conflict) THEN NULL ELSE max(shares_outstanding) END shares_outstanding,
      CASE WHEN bool_or(authority_conflict) THEN 'authority_conflict' ELSE NULL END authority_status,
      min(rank) rank
    FROM combined GROUP BY stock_id,exchange,session_date
  )
  SELECT coalesce(jsonb_agg(jsonb_build_array(symbol,sector,exchange,session_date,close,reported_pe,reported_pb,
    published_at,source_timestamp,collected_at,source_ref,stock_id,authority_hash,ev_sales_ratio,ev_ebitda_ratio,nav_multiple,
    metric_refs,shares_outstanding,authority_status)
    ORDER BY symbol,session_date DESC,source_ref NULLS FIRST),'[]'::jsonb)
    INTO v_reported_pe FROM bounded;
  SELECT coalesce(jsonb_agg(jsonb_build_array(revision.revision_id,revision.source_key,
    revision.canonical_url_candidate,revision.published_at,revision.collected_at,
    coalesce(identity.display_name,authority.distribution_identity),
    authority.distribution_identity) ORDER BY revision.revision_id),'[]'::jsonb) INTO v_source_provenance
  FROM (SELECT DISTINCT NULLIF(value->>'revisionId','')::uuid revision_id
    FROM jsonb_array_elements(coalesce(p_candidate_result->'candidates','[]'::jsonb)) item(value)
    WHERE coalesce(value->>'revisionId','')~*'^[0-9a-f-]{36}$') selected
  JOIN public.source_document_revisions_v3 revision ON revision.revision_id=selected.revision_id
  JOIN LATERAL(SELECT latest.* FROM(
    SELECT authority.* FROM public.source_identity_authorities_v3 authority
    WHERE authority.source_identity_id=revision.approved_source_identity_id
      AND authority.recorded_at<=p_source_cutoff AND authority.approved_at<=p_source_cutoff
      AND authority.valid_from<=p_source_cutoff
    ORDER BY authority.recorded_at DESC,authority.authority_id LIMIT 1
  ) latest WHERE latest.status='active' AND latest.authority_id=revision.source_identity_authority_id
    AND latest.source_key=revision.source_key
    AND latest.valid_from<=revision.collected_at
    AND (latest.valid_to IS NULL OR revision.collected_at<latest.valid_to)) authority ON true
  JOIN public.source_entities identity ON identity.id=revision.approved_source_identity_id
  WHERE revision.collected_at<=p_source_cutoff AND revision.recorded_at<=p_source_cutoff
    AND (revision.published_at IS NULL OR revision.published_at<=revision.collected_at)
    AND authority.recorded_at<=p_source_cutoff;
  WITH candidates AS MATERIALIZED(
    SELECT DISTINCT instrument.stock_id,instrument.symbol,instrument.exchange
    FROM jsonb_array_elements(coalesce(p_candidate_result->'candidates','[]'::jsonb)) item(value)
    JOIN LATERAL(SELECT selected.stock_id,selected.symbol,selected.exchange
      FROM public.resolve_legacy_instrument_authority_v3_13_internal(CASE
        WHEN coalesce(value->>'stockId','')~*'^[0-9a-f-]{36}$' THEN (value->>'stockId')::uuid ELSE NULL END,
        p_source_cutoff) selected
      WHERE selected.symbol=value->>'symbol' AND selected.instrument_type='common_stock'
        AND selected.listing_status='active'
        AND (selected.valid_to IS NULL OR p_source_cutoff<selected.valid_to)) instrument ON true
    WHERE coalesce((value->>'deepSelected')::boolean,false) AND coalesce(value->>'stockId','')~*'^[0-9a-f-]{36}$'
  ), candidate_markets AS MATERIALIZED(
    SELECT DISTINCT exchange::text::public.tw_market_v3 market FROM candidates
  ), canonical_sessions AS MATERIALIZED(
    SELECT session.market,session.session_id,session.status,session.close_at
    FROM candidate_markets requested CROSS JOIN LATERAL
      public.resolve_legacy_trading_session_window_v3_13(requested.market,
        (p_source_cutoff AT TIME ZONE 'Asia/Taipei')::date-730,
        (p_source_cutoff AT TIME ZONE 'Asia/Taipei')::date,p_source_cutoff) session
  ), recent AS MATERIALIZED(
    SELECT session.market::text exchange,session.session_id,
      row_number() OVER(PARTITION BY session.market ORDER BY session.session_id DESC) rank
    FROM canonical_sessions session WHERE session.status='completed' AND session.close_at<=p_source_cutoff
  ), missing AS MATERIALIZED(
    SELECT candidate.exchange::text exchange,recent.session_id
    FROM candidates candidate JOIN recent ON recent.exchange=candidate.exchange::text AND recent.rank<=252
    WHERE NOT EXISTS(SELECT 1 FROM public.opportunity_exchange_reported_pe_v3 observation
      WHERE observation.stock_id=candidate.stock_id AND observation.exchange=candidate.exchange
        AND observation.session_date=recent.session_id AND observation.published_at<=p_source_cutoff
        AND observation.source_timestamp<=p_source_cutoff AND observation.collected_at<=p_source_cutoff
        AND observation.recorded_at<=p_source_cutoff)
  ), ranked AS(
    SELECT DISTINCT exchange,session_id,dense_rank() OVER(PARTITION BY exchange ORDER BY session_id DESC) rank FROM missing
  ) SELECT coalesce(jsonb_agg(jsonb_build_array(exchange,session_id) ORDER BY exchange,session_id DESC),'[]'::jsonb)
    INTO v_backfill_sessions FROM ranked WHERE rank<=20;
  WITH candidates AS MATERIALIZED(
    SELECT DISTINCT instrument.stock_id,instrument.symbol,instrument.exchange::text exchange
    FROM jsonb_array_elements(coalesce(p_candidate_result->'candidates','[]'::jsonb)) item(value)
    JOIN LATERAL(SELECT selected.stock_id,selected.symbol,selected.exchange
      FROM public.resolve_legacy_instrument_authority_v3_13_internal(CASE
        WHEN coalesce(value->>'stockId','')~*'^[0-9a-f-]{36}$' THEN (value->>'stockId')::uuid ELSE NULL END,
        p_source_cutoff) selected
      WHERE selected.symbol=value->>'symbol' AND selected.instrument_type='common_stock'
      AND selected.listing_status='active' AND (selected.valid_to IS NULL OR p_source_cutoff<selected.valid_to)) instrument ON true
    WHERE coalesce((value->>'deepSelected')::boolean,false)
      AND coalesce(value->>'stockId','')~*'^[0-9a-f-]{36}$'
  ), incomplete AS(
    SELECT candidate.symbol,candidate.exchange,count(DISTINCT observation.session_id) observed_sessions
    FROM candidates candidate LEFT JOIN public.opportunity_price_observations_v3 observation
      ON observation.stock_id=candidate.stock_id AND observation.exchange::text=candidate.exchange
      AND observation.source_timestamp<=p_source_cutoff AND observation.collected_at<=p_source_cutoff
      AND observation.recorded_at<=p_source_cutoff
    GROUP BY candidate.stock_id,candidate.symbol,candidate.exchange
    HAVING count(DISTINCT observation.session_id)<122
  ), bounded AS(
    SELECT symbol,exchange FROM incomplete ORDER BY observed_sessions,symbol LIMIT 4
  ) SELECT coalesce(jsonb_agg(jsonb_build_array(symbol,exchange) ORDER BY symbol),'[]'::jsonb)
    INTO v_price_backfill FROM bounded;
  WITH candidate_exchanges AS MATERIALIZED(
    SELECT DISTINCT instrument.exchange::text exchange
    FROM jsonb_array_elements(coalesce(p_candidate_result->'candidates','[]'::jsonb)) item(value)
    JOIN LATERAL(SELECT selected.exchange
      FROM public.resolve_legacy_instrument_authority_v3_13_internal(CASE
        WHEN coalesce(value->>'stockId','')~*'^[0-9a-f-]{36}$' THEN (value->>'stockId')::uuid ELSE NULL END,
        p_source_cutoff) selected
      WHERE selected.instrument_type='common_stock' AND selected.listing_status='active'
      AND (selected.valid_to IS NULL OR p_source_cutoff<selected.valid_to)) instrument ON true
    WHERE coalesce((value->>'deepSelected')::boolean,false)
  ), latest_calendar AS MATERIALIZED(
    SELECT session.market,session.session_id,session.session_authority_id,session.status,session.close_at
    FROM candidate_exchanges requested CROSS JOIN LATERAL
      public.resolve_legacy_trading_session_window_v3_13(
        requested.exchange::public.tw_market_v3,
        (p_source_cutoff AT TIME ZONE 'Asia/Taipei')::date-400,
        (p_source_cutoff AT TIME ZONE 'Asia/Taipei')::date,p_source_cutoff) session
  ), canonical AS MATERIALIZED(
    SELECT market,session_id,session_authority_id FROM latest_calendar
    WHERE status='completed' AND close_at<=p_source_cutoff
  ), recent AS MATERIALIZED(
    SELECT canonical.market::text exchange,canonical.session_id,canonical.session_authority_id,
      row_number() OVER(PARTITION BY canonical.market ORDER BY canonical.session_id DESC) rank FROM canonical
  ), missing AS(
    SELECT exchange,session_id FROM recent WHERE rank<=130 AND NOT EXISTS(
      SELECT 1 FROM public.opportunity_corporate_action_snapshots_v3 snapshot
      WHERE snapshot.exchange::text=recent.exchange AND snapshot.session_id=recent.session_id
        AND snapshot.session_authority_id=recent.session_authority_id
        AND snapshot.corporate_action_version='tw-corporate-action-v3.1'
        AND snapshot.collected_at<=p_source_cutoff AND snapshot.recorded_at<=p_source_cutoff)
    ORDER BY session_id DESC,exchange LIMIT 20
  ) SELECT coalesce(jsonb_agg(jsonb_build_array(exchange,session_id) ORDER BY session_id DESC,exchange),'[]'::jsonb)
    INTO v_action_backfill FROM missing;
  SELECT coalesce(jsonb_agg(jsonb_build_object('session_id',session.session_id,'close_at',session.close_at,
    'status',CASE WHEN session.status='completed' AND session.close_at>p_source_cutoff
      THEN 'scheduled' ELSE session.status::text END) ORDER BY session.close_at,session.session_authority_id),'[]'::jsonb)
    INTO v_freshness_schedule
  FROM public.resolve_legacy_trading_session_window_v3_13('TWSE'::public.tw_market_v3,
    (p_source_cutoff AT TIME ZONE 'Asia/Taipei')::date-35,
    (p_source_cutoff AT TIME ZONE 'Asia/Taipei')::date+14,p_source_cutoff) session
  WHERE session.close_at>=p_source_cutoff-interval '35 days'
    AND session.close_at<=p_source_cutoff+interval '14 days';
  IF jsonb_array_length(v_reported_pe)>18000 THEN RAISE EXCEPTION 'bound_violation';END IF;
  v_base:=v_base||jsonb_build_object('reportedPeRows',v_reported_pe,
    'reportedPeBackfillSessions',v_backfill_sessions,'sourceProvenanceRows',v_source_provenance,
    'officialPriceBackfillSymbols',v_price_backfill,
    'corporateActionBackfillSessions',v_action_backfill,
    'projectionFreshnessSchedule',v_freshness_schedule,'bridgeSchema','legacy-product-value-bridge-v3.13');
  IF octet_length(convert_to(v_base::text,'utf8'))>3145728 THEN RAISE EXCEPTION 'bound_violation';END IF;
  RETURN v_base;
END $function$;

-- Rebuild the compact conditional-valuation authority from the same cutoff-resolved
-- official plane that was supplied to the worker.  A self-consistent envelope hash is
-- not sufficient authority: completion must bind it back to these exact members.
CREATE OR REPLACE FUNCTION public.legacy_relative_valuation_authority_v3_13(
  p_symbol text,p_source_cutoff timestamptz
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $relative$
DECLARE v_stock uuid;v_plane jsonb;v_current jsonb;v_history jsonb;v_peers jsonb;
  v_history_count integer;v_peer_count integer;v_history_median numeric;v_peer_median numeric;
  v_current_multiple numeric;v_current_root text;v_history_root text;v_sector_root text;v_evidence_root text;
BEGIN
  SELECT selected.stock_id INTO STRICT v_stock
  FROM public.resolve_legacy_instrument_symbol_authority_v3_13(p_symbol,p_source_cutoff) selected
  WHERE selected.instrument_type='common_stock' AND selected.listing_status='active'
    AND (selected.valid_to IS NULL OR p_source_cutoff<selected.valid_to);
  v_plane:=public.read_legacy_candidate_fact_plane_v3_11(p_source_cutoff,
    jsonb_build_object('candidates',jsonb_build_array(jsonb_build_object(
      'stockId',v_stock::text,'symbol',p_symbol,'deepSelected',true))));
  WITH parsed AS MATERIALIZED(
    SELECT value->>0 symbol,value->>1 sector,value->>2 exchange,value->>3 session_date,
      (value->>5)::numeric reported_pe,value->>10 source_ref,value->>11 stock_id,
      value->>12 authority_hash,value->>18 authority_status
    FROM jsonb_array_elements(coalesce(v_plane->'reportedPeRows','[]'::jsonb)) item(value)
    WHERE jsonb_typeof(value->5)='number' AND (value->>5)::numeric>0 AND (value->>5)::numeric<=200
      AND jsonb_typeof(value->10)='string' AND coalesce(value->>18,'')<>'authority_conflict'
      AND ((value->>2='TWSE' AND value->>10
          ~ '^(twse-openapi:BWIBBU_ALL|twse-rwd:BWIBBU_d):[0-9]{4}-[0-9]{2}-[0-9]{2}:[0-9]{4}$')
        OR (value->>2='TPEX' AND value->>10
          ~ '^(tpex-openapi:peratio|tpex-rwd:peratio):[0-9]{4}-[0-9]{2}-[0-9]{2}:[0-9]{4}$'))
  ), current_row AS MATERIALIZED(
    SELECT * FROM parsed WHERE stock_id=v_stock::text
      AND ((exchange='TWSE' AND source_ref ~ '^twse-openapi:BWIBBU_ALL:')
        OR (exchange='TPEX' AND source_ref ~ '^tpex-openapi:peratio:'))
    ORDER BY session_date DESC LIMIT 1
  ), history_rows AS MATERIALIZED(
    SELECT * FROM parsed WHERE stock_id=v_stock::text ORDER BY session_date DESC LIMIT 252
  ), peer_rows AS MATERIALIZED(
    SELECT peer.* FROM parsed peer CROSS JOIN current_row current
    WHERE peer.stock_id<>v_stock::text AND peer.exchange=current.exchange
      AND peer.sector=current.sector AND peer.session_date=current.session_date
      AND ((peer.exchange='TWSE' AND peer.source_ref ~ '^twse-openapi:BWIBBU_ALL:')
        OR (peer.exchange='TPEX' AND peer.source_ref ~ '^tpex-openapi:peratio:'))
    ORDER BY peer.stock_id,peer.source_ref
  )
  SELECT (SELECT jsonb_build_array(stock_id,exchange,session_date,reported_pe,authority_hash,source_ref)
      FROM current_row),
    (SELECT coalesce(jsonb_agg(jsonb_build_array(stock_id,exchange,session_date,reported_pe,
      authority_hash,source_ref) ORDER BY session_date),'[]'::jsonb) FROM history_rows),
    (SELECT coalesce(jsonb_agg(jsonb_build_array(stock_id,exchange,session_date,reported_pe,
      authority_hash,source_ref) ORDER BY stock_id,source_ref),'[]'::jsonb) FROM peer_rows),
    (SELECT count(*) FROM history_rows),(SELECT count(*) FROM peer_rows),
    (SELECT percentile_cont(0.5) WITHIN GROUP(ORDER BY reported_pe) FROM history_rows),
    (SELECT percentile_cont(0.5) WITHIN GROUP(ORDER BY reported_pe) FROM peer_rows),
    (SELECT reported_pe FROM current_row)
  INTO v_current,v_history,v_peers,v_history_count,v_peer_count,v_history_median,v_peer_median,v_current_multiple;
  IF v_current IS NULL OR v_history_count<>252 OR v_peer_count<8
    OR v_history_median IS NULL OR v_peer_median IS NULL THEN RETURN NULL;END IF;
  v_current_root:=encode(extensions.digest(convert_to(public.legacy_canonical_json_v3_13(v_current),'utf8'),'sha256'),'hex');
  v_history_root:=encode(extensions.digest(convert_to(public.legacy_canonical_json_v3_13(v_history),'utf8'),'sha256'),'hex');
  v_sector_root:=encode(extensions.digest(convert_to(public.legacy_canonical_json_v3_13(v_peers),'utf8'),'sha256'),'hex');
  v_evidence_root:=encode(extensions.digest(convert_to(public.legacy_canonical_json_v3_13(jsonb_build_array(
    'official-relative-pe-evidence-v1',v_current,v_history,v_peers)),'utf8'),'sha256'),'hex');
  RETURN jsonb_build_object('algorithm','official-relative-pe-evidence-v1',
    'currentMultiple',v_current_multiple,'referenceMultiple',least(v_history_median,v_peer_median),
    'historySessions',v_history_count,'sectorPeers',v_peer_count,'currentObservationRoot',v_current_root,
    'historyMembershipRoot',v_history_root,'sectorMembershipRoot',v_sector_root,'evidenceRoot',v_evidence_root);
EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN RETURN NULL;
END $relative$;

CREATE OR REPLACE FUNCTION public.legacy_valid_relative_valuation_authority_v3_13(
  p_symbol text,p_source_cutoff timestamptz,p_threshold jsonb
) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $relative_guard$
DECLARE expected jsonb;
BEGIN
  expected:=public.legacy_relative_valuation_authority_v3_13(p_symbol,p_source_cutoff);
  RETURN expected IS NOT NULL AND jsonb_typeof(p_threshold)='object'
    AND p_threshold->>'algorithm'=expected->>'algorithm'
    AND p_threshold->>'evidenceRoot'=expected->>'evidenceRoot'
    AND p_threshold->>'currentObservationRoot'=expected->>'currentObservationRoot'
    AND p_threshold->>'historyMembershipRoot'=expected->>'historyMembershipRoot'
    AND p_threshold->>'sectorMembershipRoot'=expected->>'sectorMembershipRoot'
    AND (p_threshold->>'historySessions')::integer=(expected->>'historySessions')::integer
    AND (p_threshold->>'sectorPeers')::integer=(expected->>'sectorPeers')::integer
    AND (p_threshold->>'currentMultiple')::numeric=(expected->>'currentMultiple')::numeric
    AND (p_threshold->>'referenceMultiple')::numeric=(expected->>'referenceMultiple')::numeric;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $relative_guard$;

DO $rename_claim$
BEGIN
  IF to_regprocedure('public.claim_legacy_producer_job_authoritative_v3_13(uuid,uuid,uuid,integer)') IS NULL THEN
    ALTER FUNCTION public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)
      RENAME TO claim_legacy_producer_job_authoritative_v3_13;
  END IF;
END $rename_claim$;

-- Preserve the base lease/claim state machine and replace only the two read-plane
-- fragments whose V3.13 authority is richer than the legacy metadata projection.
CREATE OR REPLACE FUNCTION public.claim_legacy_producer_job_v3_11(
  p_run uuid,p_job uuid,p_token uuid,p_lease integer
) RETURNS public.legacy_producer_claim_v3_11
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_claim public.legacy_producer_claim_v3_11;v_prior jsonb;v_conflict boolean;v_cutoff timestamptz;
BEGIN
  v_claim:=public.claim_legacy_producer_job_authoritative_v3_13(p_run,p_job,p_token,p_lease);
  IF v_claim.run_id IS NULL THEN RETURN v_claim;END IF;
  SELECT run.source_cutoff INTO STRICT v_cutoff FROM public.legacy_producer_runs_v3_11 run
    WHERE run.run_id=v_claim.run_id;
  IF v_claim.read_kind='analysis_revision_input' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'symbol',prior.value->>'symbol','revisionId',prior.value->>'revisionId',
      'materialChangeHash',prior.value->>'materialChangeHash',
      'analysisGeneratedAt',prior.value->>'analysisGeneratedAt','facts',payload.payload_json)
      ORDER BY prior.value->>'symbol'),'[]'::jsonb) INTO v_prior
    FROM jsonb_array_elements(coalesce(v_claim.read_json->'priorRevisions','[]'::jsonb)) prior(value)
    JOIN public.legacy_analysis_revision_payloads_v3_13 payload
      ON payload.revision_id=(prior.value->>'revisionId')::uuid
      AND payload.symbol=prior.value->>'symbol'
      AND payload.material_change_hash=prior.value->>'materialChangeHash';
    v_claim.read_json:=jsonb_set(v_claim.read_json,'{priorRevisions}',v_prior,false);
  ELSIF v_claim.read_kind='compact_projection_input' THEN
    WITH ranked AS MATERIALIZED(
      SELECT projection."window",projection.as_of,projection.created_at,projection.projection_id,
        projection.payload_sha256,projection.payload_json,
        row_number() OVER(PARTITION BY projection."window" ORDER BY projection.as_of DESC,
          projection.created_at DESC,projection.projection_id ASC) AS rank
      FROM public.legacy_radar_projections_v3_11 projection WHERE projection.as_of<v_cutoff
    )
    SELECT EXISTS(SELECT 1 FROM ranked newest JOIN ranked sentinel
      ON sentinel."window"=newest."window" AND sentinel.rank=2
      WHERE newest.rank=1 AND newest.as_of=sentinel.as_of AND newest.created_at=sentinel.created_at
        AND newest.payload_sha256<>sentinel.payload_sha256) INTO v_conflict;
    IF v_conflict THEN RAISE EXCEPTION 'projection_conflict';END IF;
    WITH ranked AS MATERIALIZED(
      SELECT projection."window",projection.payload_json,
        row_number() OVER(PARTITION BY projection."window" ORDER BY projection.as_of DESC,
          projection.created_at DESC,projection.projection_id ASC) AS rank
      FROM public.legacy_radar_projections_v3_11 projection WHERE projection.as_of<v_cutoff
    ) SELECT coalesce(jsonb_object_agg(ranked."window",ranked.payload_json ORDER BY ranked."window"),
        '{}'::jsonb) INTO v_prior FROM ranked WHERE ranked.rank=1;
    v_claim.read_json:=jsonb_set(v_claim.read_json,'{priorProjections}',v_prior,false);
  ELSE
    RETURN v_claim;
  END IF;
  v_claim.read_canonical:=convert_to(v_claim.read_json::text,'utf8');
  v_claim.read_hash:=encode(extensions.digest(v_claim.read_canonical,'sha256'),'hex');
  IF octet_length(v_claim.read_canonical)>3145728 THEN RAISE EXCEPTION 'bound_violation';END IF;
  RETURN v_claim;
END $function$;

DO $rename_completion$
BEGIN
  IF to_regprocedure('public.complete_legacy_producer_job_authoritative_v3_13(uuid,uuid,uuid,bytea,jsonb,text)') IS NULL THEN
    ALTER FUNCTION public.complete_legacy_producer_job_v3_11(uuid,uuid,uuid,bytea,jsonb,text)
      RENAME TO complete_legacy_producer_job_authoritative_v3_13;
  END IF;
END $rename_completion$;

CREATE OR REPLACE FUNCTION public.complete_legacy_producer_job_v3_11(
  p_run uuid,p_job uuid,p_token uuid,p_result bytea,p_json jsonb,p_hash text
) RETURNS TABLE(status text,next_job jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_status text;v_next jsonb;v_stage text;v_cutoff timestamptz;v_now timestamptz:=date_trunc('second',clock_timestamp());
  v_item jsonb;v_outcome jsonb;v_citation jsonb;v_stock uuid;v_exchange public.stock_exchange_v3;v_session date;v_close double precision;
  v_session_authority uuid;
  v_feed_evidence public.corporate_action_feed_evidence_input_v3[];
  v_action_events public.corporate_action_event_input_v3[];
  v_authority public.source_identity_authorities_v3%ROWTYPE;v_prior_revision uuid;v_prior_hash text;v_revision uuid;
  v_disposition text;v_reason text;v_profile text;v_new integer;v_unchanged integer;v_deferred integer;v_rejected integer;
  v_parent uuid;v_count integer;v_projection_id uuid;v_payload_bytes bytea;v_existing_hash text;
  v_existing_correctness jsonb;v_evaluated_at timestamptz;v_identity_bytes bytea;v_identity_json jsonb;
  v_home_payload jsonb;v_home_revisions jsonb;v_submitted_revisions jsonb;
  v_relative_threshold jsonb;
  v_expected_payload_canonical text;v_expected_identity_canonical text;
  v_attempt_status text;v_derived_status text;v_attempt_reason text;
  v_attempt_provider integer;v_attempt_auth integer;v_attempt_missing integer;v_attempt_success integer;
BEGIN
  SELECT completed.status,completed.next_job INTO v_status,v_next
  FROM public.complete_legacy_producer_job_authoritative_v3_13(p_run,p_job,p_token,p_result,p_json,p_hash) completed;
  IF v_status IS NULL THEN RETURN;END IF;
  SELECT job.stage::text,run.source_cutoff INTO STRICT v_stage,v_cutoff
  FROM public.legacy_producer_jobs_v3_11 job JOIN public.legacy_producer_runs_v3_11 run ON run.run_id=job.run_id
  WHERE job.run_id=p_run AND job.job_id=p_job;
  -- The predecessor owns principal/lease/idempotency precedence. These mandatory
  -- V3.13 checks run in the same statement transaction; any rejection rolls its
  -- result, terminal status, and successor back atomically.
  IF v_stage='source_sync' AND (
      jsonb_typeof(p_json->'sourceAcquisition') IS DISTINCT FROM 'object'
      OR p_json#>>'{sourceAcquisition,schema}' IS DISTINCT FROM 'official-source-acquisition-v3.13')
  THEN RAISE EXCEPTION 'v313_source_acquisition_required';END IF;
  IF v_stage='facts_refresh' AND (
      jsonb_typeof(p_json->'officialIngestion') IS DISTINCT FROM 'object'
      OR p_json#>>'{officialIngestion,schema}' IS DISTINCT FROM 'legacy-official-ingestion-v3.13')
  THEN RAISE EXCEPTION 'v313_official_ingestion_required';END IF;
  IF v_stage='source_sync' AND jsonb_typeof(p_json->'sourceAcquisition')='object' THEN
    IF p_json#>>'{sourceAcquisition,schema}'<>'official-source-acquisition-v3.13'
      OR jsonb_array_length(coalesce(p_json#>'{sourceAcquisition,outcomes}','[]'::jsonb))<>17
      OR (SELECT count(DISTINCT value->>'profileId') FROM jsonb_array_elements(
        coalesce(p_json#>'{sourceAcquisition,outcomes}','[]'::jsonb)) item(value))<>17
      OR jsonb_array_length(coalesce(p_json#>'{sourceAcquisition,documents}','[]'::jsonb))>272
      OR jsonb_array_length(coalesce(p_json#>'{sourceAcquisition,itemOutcomes}','[]'::jsonb))>272
      OR jsonb_array_length(coalesce(p_json#>'{sourceAcquisition,connectorAttempts}','[]'::jsonb))<>51
      OR (SELECT count(DISTINCT jsonb_build_array(value->>'profileId',value->>'sourceKey'))
          FROM jsonb_array_elements(coalesce(p_json#>'{sourceAcquisition,connectorAttempts}','[]'::jsonb)) item(value))<>51
      OR EXISTS(
        SELECT 1 FROM public.legacy_approved_source_profiles_v3_13 profile
        LEFT JOIN jsonb_array_elements(coalesce(p_json#>'{sourceAcquisition,outcomes}','[]'::jsonb)) outcome(value)
          ON outcome.value->>'profileId'=profile.profile_id AND outcome.value->>'profileName'=profile.profile_name
        WHERE outcome.value IS NULL
      )
      OR EXISTS(
        SELECT 1 FROM jsonb_array_elements(coalesce(p_json#>'{sourceAcquisition,itemOutcomes}','[]'::jsonb)) item(value)
        LEFT JOIN public.legacy_approved_source_profiles_v3_13 profile ON profile.profile_id=item.value->>'profileId'
        WHERE profile.profile_id IS NULL
      )
      OR EXISTS(
        SELECT 1 FROM jsonb_array_elements(coalesce(p_json#>'{sourceAcquisition,documents}','[]'::jsonb)) document(value)
        LEFT JOIN public.legacy_approved_source_profiles_v3_13 profile ON profile.profile_id=document.value->>'profileId'
        WHERE profile.profile_id IS NULL
      )
      OR EXISTS(
        SELECT 1 FROM public.legacy_approved_source_profiles_v3_13 profile
        CROSS JOIN (VALUES('threads'),('podcast'),('youtube')) source(source_key)
        LEFT JOIN jsonb_array_elements(coalesce(p_json#>'{sourceAcquisition,connectorAttempts}','[]'::jsonb)) attempt(value)
          ON attempt.value->>'profileId'=profile.profile_id AND attempt.value->>'sourceKey'=source.source_key
        WHERE attempt.value IS NULL
      )
      OR EXISTS(
        SELECT 1 FROM jsonb_array_elements(coalesce(p_json#>'{sourceAcquisition,outcomes}','[]'::jsonb)) outcome(value)
        WHERE outcome.value ? 'status' OR outcome.value ? 'reason'
      )
      OR (SELECT count(*) FROM jsonb_array_elements(coalesce(p_json#>'{sourceAcquisition,itemOutcomes}','[]'::jsonb)))
        <>(SELECT count(DISTINCT jsonb_build_array(value->>'sourceKey',value->>'profileId',value->>'stableId'))
          FROM jsonb_array_elements(coalesce(p_json#>'{sourceAcquisition,itemOutcomes}','[]'::jsonb)) item(value))
      OR (SELECT count(*) FROM jsonb_array_elements(coalesce(p_json#>'{sourceAcquisition,documents}','[]'::jsonb)))
        <>(SELECT count(DISTINCT jsonb_build_array(value->>'sourceKey',value->>'profileId',value->>'stableConnectorDocumentId'))
          FROM jsonb_array_elements(coalesce(p_json#>'{sourceAcquisition,documents}','[]'::jsonb)) document(value))
      OR EXISTS(
        SELECT 1 FROM jsonb_array_elements(coalesce(p_json#>'{sourceAcquisition,documents}','[]'::jsonb)) document(value)
        LEFT JOIN jsonb_array_elements(coalesce(p_json#>'{sourceAcquisition,itemOutcomes}','[]'::jsonb)) item(value)
          ON jsonb_build_array(item.value->>'sourceKey',item.value->>'profileId',item.value->>'stableId')=
            jsonb_build_array(document.value->>'sourceKey',document.value->>'profileId',document.value->>'stableConnectorDocumentId')
          AND item.value->>'acquisitionDisposition'=CASE document.value->>'terminalDisposition'
            WHEN 'accepted' THEN 'transcript_ready' WHEN 'rejected' THEN 'rejected' ELSE 'deferred' END
        WHERE item.value IS NULL
      )
      OR EXISTS(
        SELECT 1 FROM jsonb_array_elements(coalesce(p_json#>'{sourceAcquisition,itemOutcomes}','[]'::jsonb)) item(value)
        LEFT JOIN jsonb_array_elements(coalesce(p_json#>'{sourceAcquisition,documents}','[]'::jsonb)) document(value)
          ON jsonb_build_array(document.value->>'sourceKey',document.value->>'profileId',document.value->>'stableConnectorDocumentId')=
            jsonb_build_array(item.value->>'sourceKey',item.value->>'profileId',item.value->>'stableId')
        WHERE item.value->>'acquisitionDisposition'<>'metadata_only' AND document.value IS NULL
      )
    THEN RAISE EXCEPTION 'data_integrity_failure/source_acquisition_header';END IF;
    FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(p_json#>'{sourceAcquisition,connectorAttempts}','[]'::jsonb)) item(value) LOOP
      IF coalesce(v_item->>'profileId','')!~'^[a-z0-9_]{2,40}$'
        OR coalesce(v_item->>'sourceKey','') NOT IN ('threads','podcast','youtube')
        OR coalesce(v_item->>'status','') NOT IN
          ('items_found','successful_empty','metadata_only','missing_endpoint','auth_failed','provider_failed')
        OR coalesce(v_item->>'reasonCode','')!~'^[a-z0-9_]{2,80}$'
        OR coalesce(v_item#>>'{responseEvidence,kind}','') NOT IN ('http_response','configuration','transport_error')
        OR (v_item#>'{responseEvidence,statusCode}' IS DISTINCT FROM 'null'::jsonb
          AND jsonb_typeof(v_item#>'{responseEvidence,statusCode}')<>'number')
        OR (v_item#>'{responseEvidence,statusCode}' IS DISTINCT FROM 'null'::jsonb AND (
          (v_item#>>'{responseEvidence,statusCode}')::numeric NOT BETWEEN 100 AND 599
          OR trunc((v_item#>>'{responseEvidence,statusCode}')::numeric)
            <>(v_item#>>'{responseEvidence,statusCode}')::numeric))
        OR jsonb_typeof(v_item#>'{responseEvidence,responseBytes}')<>'number'
        OR jsonb_typeof(v_item#>'{responseEvidence,itemCount}')<>'number'
        OR jsonb_typeof(v_item#>'{responseEvidence,documentCount}')<>'number'
        OR (v_item#>>'{responseEvidence,responseBytes}')::numeric NOT BETWEEN 0 AND 8000000
        OR (v_item#>>'{responseEvidence,itemCount}')::numeric NOT BETWEEN 0 AND 20
        OR (v_item#>>'{responseEvidence,documentCount}')::numeric NOT BETWEEN 0 AND 10
        OR trunc((v_item#>>'{responseEvidence,responseBytes}')::numeric)
          <>(v_item#>>'{responseEvidence,responseBytes}')::numeric
        OR trunc((v_item#>>'{responseEvidence,itemCount}')::numeric)
          <>(v_item#>>'{responseEvidence,itemCount}')::numeric
        OR trunc((v_item#>>'{responseEvidence,documentCount}')::numeric)
          <>(v_item#>>'{responseEvidence,documentCount}')::numeric
        OR NOT (CASE v_item->>'status'
          WHEN 'items_found' THEN (v_item->>'reasonCode')~'_items_observed$'
          WHEN 'successful_empty' THEN (v_item->>'reasonCode')~'_successful_empty$'
          WHEN 'metadata_only' THEN (v_item->>'reasonCode')~'(_metadata_only|_authority_missing)$'
          WHEN 'missing_endpoint' THEN (v_item->>'reasonCode')~'(_missing|_not_found)$'
          WHEN 'auth_failed' THEN (v_item->>'reasonCode')~'(_auth_missing|_oauth_missing|^provider_auth_rejected$)'
          WHEN 'provider_failed' THEN (v_item->>'reasonCode'='provider_transport_failed')
          ELSE false END)
        OR (v_item->>'status'='successful_empty' AND NOT (
          v_item#>>'{responseEvidence,kind}'='http_response'
          AND (v_item#>>'{responseEvidence,statusCode}')::numeric BETWEEN 200 AND 299
          AND (v_item#>>'{responseEvidence,itemCount}')::numeric=0
          AND (v_item#>>'{responseEvidence,documentCount}')::numeric=0))
        OR (v_item->>'status'='auth_failed' AND NOT (
          (v_item#>>'{responseEvidence,kind}'='configuration' AND v_item#>'{responseEvidence,statusCode}'='null'::jsonb)
          OR (v_item#>>'{responseEvidence,kind}'='http_response'
            AND (v_item#>>'{responseEvidence,statusCode}')::numeric IN (401,403))))
        OR (v_item->>'status'='items_found' AND NOT (
          v_item#>>'{responseEvidence,kind}'='http_response'
          AND (v_item#>>'{responseEvidence,statusCode}')::numeric BETWEEN 200 AND 299
          AND ((v_item#>>'{responseEvidence,itemCount}')::numeric>0
            OR (v_item#>>'{responseEvidence,documentCount}')::numeric>0)))
        OR (v_item->>'status'='metadata_only' AND NOT (
          v_item#>>'{responseEvidence,kind}'='http_response'
          AND (v_item#>>'{responseEvidence,statusCode}')::numeric BETWEEN 200 AND 299
          AND (v_item#>>'{responseEvidence,itemCount}')::numeric>0
          AND (v_item#>>'{responseEvidence,documentCount}')::numeric=0))
        OR (v_item->>'status'='missing_endpoint' AND NOT (
          (v_item#>>'{responseEvidence,kind}'='configuration' AND v_item#>'{responseEvidence,statusCode}'='null'::jsonb)
          OR (v_item#>>'{responseEvidence,kind}'='http_response'
            AND (v_item#>>'{responseEvidence,statusCode}')::numeric=404)))
        OR (v_item->>'status'='provider_failed' AND NOT (
          (v_item#>>'{responseEvidence,kind}'='transport_error' AND v_item#>'{responseEvidence,statusCode}'='null'::jsonb)
          OR (v_item#>>'{responseEvidence,kind}'='http_response'
            AND (v_item#>>'{responseEvidence,statusCode}')::numeric NOT BETWEEN 200 AND 299
            AND (v_item#>>'{responseEvidence,statusCode}')::numeric NOT IN (401,403,404))))
      THEN RAISE EXCEPTION 'data_integrity_failure/source_connector_attempt';END IF;
      INSERT INTO public.legacy_source_connector_attempts_v3_13(source_run_id,profile_id,source_key,status,
        reason_code,response_kind,response_status_code,response_bytes,item_count,document_count)
      VALUES(p_run,v_item->>'profileId',(v_item->>'sourceKey')::public.source_key_v3,v_item->>'status',
        v_item->>'reasonCode',v_item#>>'{responseEvidence,kind}',NULLIF(v_item#>>'{responseEvidence,statusCode}','')::integer,
        (v_item#>>'{responseEvidence,responseBytes}')::integer,(v_item#>>'{responseEvidence,itemCount}')::integer,
        (v_item#>>'{responseEvidence,documentCount}')::integer);
    END LOOP;
    FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(p_json#>'{sourceAcquisition,itemOutcomes}','[]'::jsonb)) item(value) LOOP
      IF coalesce(v_item->>'profileId','')!~'^[a-z0-9_]{2,40}$'
        OR coalesce(v_item->>'sourceKey','') NOT IN ('threads','podcast','youtube')
        OR coalesce(v_item->>'stableId','')='' OR char_length(v_item->>'stableId')>512
      THEN RAISE EXCEPTION 'data_integrity_failure/source_item_identity';END IF;
      IF jsonb_typeof(v_item->'sourceUrl') IS DISTINCT FROM 'string'
        OR NOT public.legacy_valid_https_url_v3_13(coalesce(v_item->>'sourceUrl',''))
      THEN RAISE EXCEPTION 'data_integrity_failure/source_item_url';END IF;
      IF v_item->'publishedAt' IS DISTINCT FROM 'null'::jsonb AND (
        jsonb_typeof(v_item->'publishedAt') IS DISTINCT FROM 'string'
        OR NOT public.legacy_valid_rfc3339_v3_13(coalesce(v_item->>'publishedAt','')))
      THEN RAISE EXCEPTION 'data_integrity_failure/source_item_published_at';END IF;
      IF coalesce(v_item->>'acquisitionDisposition','') NOT IN ('transcript_ready','metadata_only','rejected','deferred')
        OR coalesce(v_item->>'analysisDisposition','') NOT IN
          ('eligible_for_claim_extraction','no_claim','rejected','deferred')
      THEN RAISE EXCEPTION 'data_integrity_failure/source_item_disposition';END IF;
      INSERT INTO public.legacy_source_item_outcomes_v3_13(source_run_id,profile_id,source_key,stable_item_id,
        source_url,published_at,acquisition_disposition,analysis_disposition)
      VALUES(p_run,v_item->>'profileId',(v_item->>'sourceKey')::public.source_key_v3,v_item->>'stableId',
        v_item->>'sourceUrl',NULLIF(v_item->>'publishedAt','')::timestamptz,v_item->>'acquisitionDisposition',
        v_item->>'analysisDisposition');
    END LOOP;
    IF EXISTS(
      WITH documents AS(
        SELECT value->>'profileId' profile_id,value->>'sourceKey' source_key,
          value->>'stableConnectorDocumentId' stable_item_id,count(*) document_count,
          min(CASE WHEN value->>'acquisitionStatus'='content_overflow' OR value->>'terminalDisposition'='rejected'
              THEN 'rejected' WHEN value->>'terminalDisposition'='deferred' THEN 'deferred' ELSE 'transcript_ready' END) expected_acquisition,
          max(CASE WHEN value->>'acquisitionStatus'='content_overflow' OR value->>'terminalDisposition'='rejected'
              THEN 'rejected' WHEN value->>'terminalDisposition'='deferred' THEN 'deferred' ELSE 'transcript_ready' END) expected_acquisition_max,
          min(CASE WHEN value->>'acquisitionStatus'='content_overflow' OR value->>'terminalDisposition'='rejected'
              THEN 'rejected' WHEN value->>'terminalDisposition'='deferred' THEN 'deferred' ELSE 'eligible_for_claim_extraction' END) expected_analysis,
          max(CASE WHEN value->>'acquisitionStatus'='content_overflow' OR value->>'terminalDisposition'='rejected'
              THEN 'rejected' WHEN value->>'terminalDisposition'='deferred' THEN 'deferred' ELSE 'eligible_for_claim_extraction' END) expected_analysis_max
        FROM jsonb_array_elements(coalesce(p_json#>'{sourceAcquisition,documents}','[]'::jsonb)) document(value)
        GROUP BY value->>'profileId',value->>'sourceKey',value->>'stableConnectorDocumentId'
      ),items AS(
        SELECT value->>'profileId' profile_id,value->>'sourceKey' source_key,value->>'stableId' stable_item_id,
          count(*) item_count,min(value->>'acquisitionDisposition') acquisition_disposition,
          max(value->>'acquisitionDisposition') acquisition_disposition_max,
          min(value->>'analysisDisposition') analysis_disposition,
          max(value->>'analysisDisposition') analysis_disposition_max
        FROM jsonb_array_elements(coalesce(p_json#>'{sourceAcquisition,itemOutcomes}','[]'::jsonb)) item(value)
        GROUP BY value->>'profileId',value->>'sourceKey',value->>'stableId'
      )
      SELECT 1 FROM documents FULL JOIN items USING(profile_id,source_key,stable_item_id)
      WHERE coalesce(document_count,0)>1 OR coalesce(item_count,0)>1
        OR expected_acquisition IS DISTINCT FROM expected_acquisition_max
        OR expected_analysis IS DISTINCT FROM expected_analysis_max
        OR acquisition_disposition IS DISTINCT FROM acquisition_disposition_max
        OR analysis_disposition IS DISTINCT FROM analysis_disposition_max
        OR (document_count IS NOT NULL AND item_count IS NULL)
        OR (document_count IS NOT NULL AND (acquisition_disposition IS DISTINCT FROM expected_acquisition
          OR analysis_disposition IS DISTINCT FROM expected_analysis))
        OR (document_count IS NULL AND acquisition_disposition<>'metadata_only')
    ) THEN RAISE EXCEPTION 'data_integrity_failure/source_document_item_conservation';END IF;
    FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(p_json#>'{sourceAcquisition,documents}','[]'::jsonb)) item(value) LOOP
      v_profile:=v_item->>'profileId';v_revision:=NULL;v_prior_revision:=NULL;v_prior_hash:=NULL;
      IF (v_item->>'sourceKey') NOT IN ('threads','podcast','youtube') OR v_profile!~'^[a-z0-9_]{2,40}$'
        OR v_item->>'distributionIdentity'<>(v_item->>'sourceKey')||':'||v_profile
        OR (v_item->>'stableConnectorDocumentId') IS NULL
        OR char_length(v_item->>'stableConnectorDocumentId') NOT BETWEEN 1 AND 512
        OR jsonb_typeof(v_item->'canonicalUrlCandidate') IS DISTINCT FROM 'string'
        OR NOT public.legacy_valid_https_url_v3_13(coalesce(v_item->>'canonicalUrlCandidate',''))
        OR (v_item->'publishedAt' IS DISTINCT FROM 'null'::jsonb AND (
          jsonb_typeof(v_item->'publishedAt') IS DISTINCT FROM 'string'
          OR NOT public.legacy_valid_rfc3339_v3_13(coalesce(v_item->>'publishedAt',''))))
        OR jsonb_typeof(v_item->'collectedAt') IS DISTINCT FROM 'string'
        OR NOT public.legacy_valid_rfc3339_v3_13(coalesce(v_item->>'collectedAt',''))
        OR v_item->>'adapterVersion'<>'source-adapter-v3.3'
        OR coalesce(v_item->>'acquisitionStatus','') NOT IN ('complete','content_overflow')
        OR v_item->>'rawFieldPayloadAlgorithmVersion'<>'raw-field-payload-v3.0'
        OR v_item->>'canonicalContentAlgorithmVersion'<>'canonical-content-v3.0'
        OR coalesce(v_item->>'terminalDisposition','') NOT IN ('accepted','deferred','rejected')
        OR (v_item->>'acquisitionStatus'='complete' AND (
          jsonb_typeof(v_item->'rawFieldPayload')<>'array'
          OR coalesce((v_item->>'rawCodePointCount')::integer,100001)>100000
          OR (v_item->>'ingestionContentRevisionSha256')!~'^[0-9a-f]{64}$'
          OR (v_item->>'ingestionCanonicalContentHashV3')!~'^[0-9a-f]{64}$'))
        OR (v_item->>'acquisitionStatus'='content_overflow' AND (
          v_item->'rawFieldPayload'<>'null'::jsonb OR (v_item->>'rawCodePointCount')::integer<>100001
          OR v_item->'ingestionContentRevisionSha256'<>'null'::jsonb
          OR v_item->'ingestionCanonicalContentHashV3'<>'null'::jsonb
          OR v_item->>'terminalDisposition'<>'rejected'))
        OR (v_item->>'collectedAt')::timestamptz>v_now
        OR ((v_item->>'publishedAt') IS NOT NULL AND (v_item->>'publishedAt')::timestamptz>(v_item->>'collectedAt')::timestamptz)
      THEN RAISE EXCEPTION 'data_integrity_failure/source_document';END IF;
      IF coalesce(v_item->>'terminalDisposition','')='rejected' AND v_item->>'acquisitionStatus'='complete' THEN
        v_disposition:='rejected';v_reason:='adapter_rejected_authorized_document';
      ELSIF v_item->>'terminalDisposition'='deferred' THEN
        v_disposition:='deferred';v_reason:='adapter_deferred_bounded_document';
      ELSE
      v_authority.authority_id:=NULL;
      SELECT authority.* INTO v_authority
      FROM public.legacy_frozen_source_authorities_v3_13 frozen
      JOIN public.source_identity_authorities_v3 authority
        ON authority.authority_id=frozen.source_identity_authority_id
      WHERE frozen.source_run_id=p_run AND frozen.profile_id=v_profile
        AND frozen.source_key::text=v_item->>'sourceKey'
        AND frozen.distribution_identity=v_item->>'distributionIdentity'
        AND frozen.authority_cutoff=v_cutoff;
      IF v_authority.authority_id IS NULL THEN
        v_disposition:='deferred';v_reason:='approved_profile_authority_unavailable';
      ELSE
        SELECT revision.revision_id,revision.ingestion_canonical_content_hash_v3 INTO v_prior_revision,v_prior_hash
        FROM public.source_document_revisions_v3 revision
        WHERE revision.source_key=v_authority.source_key
          AND revision.approved_source_identity_id=v_authority.source_identity_id
          AND revision.stable_connector_document_id=v_item->>'stableConnectorDocumentId'
        ORDER BY revision.recorded_at DESC,revision.revision_id LIMIT 1;
        IF v_item->>'acquisitionStatus'='complete' AND v_prior_hash=v_item->>'ingestionCanonicalContentHashV3' THEN
          v_revision:=v_prior_revision;v_disposition:='unchanged';v_reason:='same_canonical_content';
        ELSE
          INSERT INTO public.legacy_source_append_context_v3_13(source_run_id,profile_id,source_key,
            stable_connector_document_id,source_identity_authority_id,authority_cutoff,backend_pid,transaction_id)
          VALUES(p_run,v_profile,v_authority.source_key,v_item->>'stableConnectorDocumentId',
            v_authority.authority_id,v_cutoff,pg_backend_pid(),txid_current());
          SELECT appended.revision_id INTO v_revision FROM public.append_source_document_revision_v3(ROW(
            v_authority.authority_id,v_item->>'stableConnectorDocumentId',v_item->>'canonicalUrlCandidate',
            NULLIF(v_item->>'publishedAt','')::timestamptz,(v_item->>'collectedAt')::timestamptz,
            v_item->>'adapterVersion',(v_item->>'acquisitionStatus')::public.source_acquisition_status_v3,
            v_item->'rawFieldPayload',(v_item->>'rawCodePointCount')::integer,v_item->>'rawFieldPayloadAlgorithmVersion',
            v_item->>'ingestionContentRevisionSha256',v_item->>'canonicalContentAlgorithmVersion',
            v_item->>'ingestionCanonicalContentHashV3',v_prior_revision)::public.source_document_revision_input_v3,
            'a11d4e67-7d0a-4c44-8a9d-1d5c3b875001'::uuid) appended;
          IF v_item->>'acquisitionStatus'='content_overflow' THEN
            v_disposition:='rejected';v_reason:='content_overflow_parse_failure';
          ELSE
            v_disposition:='new_revision';v_reason:='official_or_creator_authorized_content';
          END IF;
        END IF;
      END IF;
      END IF;
      INSERT INTO public.legacy_source_document_persistence_v3_13(source_run_id,profile_id,source_key,
        stable_connector_document_id,ingestion_canonical_content_hash_v3,document_terminal_identity_sha256,
        disposition,revision_id,reason,recorded_at)
      VALUES(p_run,v_profile,(v_item->>'sourceKey')::public.source_key_v3,v_item->>'stableConnectorDocumentId',
        NULLIF(v_item->>'ingestionCanonicalContentHashV3',''),encode(extensions.digest(convert_to(
          public.legacy_canonical_json_v3_13(jsonb_build_array(v_item->>'sourceKey',v_profile,
            v_item->>'stableConnectorDocumentId',v_item->>'collectedAt',v_item->>'acquisitionStatus',
            v_item->'ingestionCanonicalContentHashV3')),'utf8'),'sha256'),'hex'),
        v_disposition,v_revision,v_reason,v_now) ON CONFLICT DO NOTHING;
    END LOOP;
    IF EXISTS(
      SELECT 1 FROM public.legacy_source_connector_attempts_v3_13 attempt
      WHERE attempt.source_run_id=p_run AND (
        attempt.item_count<>(SELECT count(*) FROM public.legacy_source_item_outcomes_v3_13 item
          WHERE item.source_run_id=p_run AND item.profile_id=attempt.profile_id AND item.source_key=attempt.source_key)
        OR attempt.document_count<>(SELECT count(*) FROM public.legacy_source_document_persistence_v3_13 document
          WHERE document.source_run_id=p_run AND document.profile_id=attempt.profile_id AND document.source_key=attempt.source_key)
      )
    ) THEN RAISE EXCEPTION 'data_integrity_failure';END IF;
    FOR v_outcome IN SELECT value FROM jsonb_array_elements(coalesce(p_json#>'{sourceAcquisition,outcomes}','[]'::jsonb)) item(value) LOOP
      v_profile:=v_outcome->>'profileId';
      IF coalesce(v_profile,'')!~'^[a-z0-9_]{2,40}$'
        OR coalesce(v_outcome->>'profileName','')=''
        OR coalesce(v_outcome->>'documentCount','-1')::integer NOT BETWEEN 0 AND 30
      THEN RAISE EXCEPTION 'data_integrity_failure';END IF;
      SELECT count(*) FILTER(WHERE disposition='new_revision'),count(*) FILTER(WHERE disposition='unchanged'),
        count(*) FILTER(WHERE disposition='deferred'),count(*) FILTER(WHERE disposition='rejected')
        INTO v_new,v_unchanged,v_deferred,v_rejected
      FROM public.legacy_source_document_persistence_v3_13 persisted
      WHERE persisted.source_run_id=p_run AND persisted.profile_id=v_profile;
      IF v_new+v_unchanged+v_deferred+v_rejected<>(v_outcome->>'documentCount')::integer THEN RAISE EXCEPTION 'data_integrity_failure';END IF;
      SELECT count(*) FILTER(WHERE attempt.status='provider_failed'),count(*) FILTER(WHERE attempt.status='auth_failed'),
        count(*) FILTER(WHERE attempt.status='missing_endpoint'),count(*) FILTER(WHERE attempt.status IN('items_found','successful_empty','metadata_only'))
        INTO v_attempt_provider,v_attempt_auth,v_attempt_missing,v_attempt_success
      FROM public.legacy_source_connector_attempts_v3_13 attempt
      WHERE attempt.source_run_id=p_run AND attempt.profile_id=v_profile;
      IF v_attempt_provider+v_attempt_auth+v_attempt_missing+v_attempt_success<>3
      THEN RAISE EXCEPTION 'data_integrity_failure';END IF;
      v_derived_status:=CASE
        WHEN v_attempt_provider>0 THEN 'provider_failed'
        WHEN v_attempt_auth>0 THEN 'auth_failed'
        WHEN v_new>0 THEN 'fresh'
        WHEN (v_outcome->>'documentCount')::integer>0 AND v_deferred>0 THEN 'provider_failed'
        WHEN (v_outcome->>'documentCount')::integer>0 AND v_new=0 AND v_unchanged=0 THEN 'provider_failed'
      WHEN v_unchanged>0 AND v_deferred=0 THEN 'unchanged'
        WHEN v_attempt_missing=3 THEN 'missing_endpoint'
        ELSE 'no_new_items' END;
      v_attempt_reason:='database_derived_'||v_derived_status;
      INSERT INTO public.legacy_source_acquisition_outcomes_v3_13(source_run_id,profile_id,profile_name,status,reason,
        acquired_document_count,new_revision_count,unchanged_count,deferred_count,rejected_count,recorded_at)
      VALUES(p_run,v_profile,v_outcome->>'profileName',v_derived_status,v_attempt_reason,
        (v_outcome->>'documentCount')::integer,v_new,v_unchanged,v_deferred,v_rejected,v_now);
    END LOOP;
  ELSIF v_stage='mention_claim_extraction' AND p_json->>'schema'='legacy-mention-claim-result-v3.11'
      AND coalesce(p_json->>'revisionId','')~*'^[0-9a-f-]{36}$' THEN
    v_revision:=(p_json->>'revisionId')::uuid;
    v_parent:=extensions.gen_random_uuid();
    IF coalesce(p_json#>>'{documentOutcome,outcome}','') NOT IN ('processed_with_claims','processed_no_claim')
      OR coalesce(p_json#>>'{documentOutcome,reason}','')='' THEN RAISE EXCEPTION 'data_integrity_failure';END IF;
    INSERT INTO public.legacy_source_processing_outcomes_v3_13(source_run_id,revision_id,scope,outcome_id,
      parent_outcome_id,outcome,reason,recorded_at)
    VALUES(p_run,v_revision,'document',v_parent,NULL,p_json#>>'{documentOutcome,outcome}',
      p_json#>>'{documentOutcome,reason}',v_now);
    FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(p_json->'claimOutcomes','[]'::jsonb)) item(value) LOOP
      IF coalesce(v_item->>'claimId','')!~*'^[0-9a-f-]{36}$' OR coalesce(v_item->>'mentionId','')!~*'^[0-9a-f-]{36}$'
        OR coalesce(v_item->>'outcome','') NOT IN ('linked','rejected','deferred') OR coalesce(v_item->>'reason','')=''
      THEN RAISE EXCEPTION 'data_integrity_failure';END IF;
      INSERT INTO public.legacy_source_processing_outcomes_v3_13(source_run_id,revision_id,scope,outcome_id,
        parent_outcome_id,symbol,stock_id,outcome,reason,recorded_at)
      VALUES(p_run,v_revision,'claim',(v_item->>'claimId')::uuid,v_parent,NULLIF(v_item->>'symbol',''),
        NULLIF(v_item->>'stockId','')::uuid,v_item->>'outcome',v_item->>'reason',v_now);
    END LOOP;
    FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(p_json->'entityOutcomes','[]'::jsonb)) item(value) LOOP
      IF coalesce(v_item->>'entityOutcomeId','')!~*'^[0-9a-f-]{36}$' OR coalesce(v_item->>'claimId','')!~*'^[0-9a-f-]{36}$'
        OR coalesce(v_item->>'outcome','') NOT IN ('linked','rejected','deferred') OR coalesce(v_item->>'reason','')=''
      THEN RAISE EXCEPTION 'data_integrity_failure';END IF;
      INSERT INTO public.legacy_source_processing_outcomes_v3_13(source_run_id,revision_id,scope,outcome_id,
        parent_outcome_id,symbol,stock_id,outcome,reason,recorded_at)
      VALUES(p_run,v_revision,'entity',(v_item->>'entityOutcomeId')::uuid,(v_item->>'claimId')::uuid,
        NULLIF(v_item->>'symbol',''),NULLIF(v_item->>'stockId','')::uuid,v_item->>'outcome',v_item->>'reason',v_now);
    END LOOP;
    SELECT count(*) INTO v_count FROM public.legacy_source_processing_outcomes_v3_13
      WHERE source_run_id=p_run AND revision_id=v_revision AND scope='claim';
    IF v_count<>coalesce((p_json#>>'{conservation,claimCount}')::integer,-1) THEN RAISE EXCEPTION 'data_integrity_failure';END IF;
    SELECT count(*) INTO v_count FROM public.legacy_source_processing_outcomes_v3_13
      WHERE source_run_id=p_run AND revision_id=v_revision AND scope='entity';
    IF v_count<>coalesce((p_json#>>'{conservation,entityCount}')::integer,-1) THEN RAISE EXCEPTION 'data_integrity_failure';END IF;
  ELSIF v_stage='analysis_revision' THEN
    IF jsonb_array_length(coalesce(p_json->'decisionPayloads','[]'::jsonb))
        <>jsonb_array_length(coalesce(p_json->'decisions','[]'::jsonb))
      OR jsonb_array_length(coalesce(p_json->'decisionPayloads','[]'::jsonb))>60
      OR (SELECT coalesce(jsonb_agg(jsonb_build_array(value->>'symbol',value->>'materialChangeHash')
            ORDER BY value->>'symbol',value->>'materialChangeHash'),'[]'::jsonb)
          FROM jsonb_array_elements(coalesce(p_json->'decisionPayloads','[]'::jsonb)) item(value))
        <>(SELECT coalesce(jsonb_agg(jsonb_build_array(value->>'symbol',value->>'materialChangeHash')
            ORDER BY value->>'symbol',value->>'materialChangeHash'),'[]'::jsonb)
          FROM jsonb_array_elements(coalesce(p_json->'decisions','[]'::jsonb)) item(value))
    THEN RAISE EXCEPTION 'data_integrity_failure';END IF;
    FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(p_json->'decisionPayloads','[]'::jsonb)) item(value) LOOP
      IF coalesce(v_item->>'symbol','')!~'^[0-9]{4}$'
        OR coalesce(v_item->>'materialChangeHash','')!~'^[0-9a-f]{64}$'
        OR v_item#>>'{bundle,kind}'<>'legacy_analysis_fact_payload_v3_13'
        OR v_item#>>'{bundle,json,symbol}'<>v_item->>'symbol'
        OR v_item#>>'{bundle,json,materialChangeHash}'<>v_item->>'materialChangeHash'
      THEN RAISE EXCEPTION 'data_integrity_failure';END IF;
      v_payload_bytes:=convert_to(v_item#>>'{bundle,canonical}','utf8');
      IF convert_from(v_payload_bytes,'utf8')::jsonb<>v_item#>'{bundle,json}'
        OR encode(extensions.digest(v_payload_bytes,'sha256'),'hex')<>v_item#>>'{bundle,hash}'
      THEN RAISE EXCEPTION 'data_integrity_failure';END IF;
      SELECT revision.revision_id INTO STRICT v_revision
      FROM public.legacy_analysis_revisions_v3_11 revision
      WHERE revision.symbol=v_item->>'symbol'
        AND revision.material_change_hash=v_item->>'materialChangeHash';
      SELECT payload.payload_sha256 INTO v_existing_hash
      FROM public.legacy_analysis_revision_payloads_v3_13 payload WHERE payload.revision_id=v_revision;
      IF v_existing_hash IS NOT NULL AND v_existing_hash<>v_item#>>'{bundle,hash}'
      THEN RAISE EXCEPTION 'analysis_revision_payload_conflict';END IF;
      INSERT INTO public.legacy_analysis_revision_payloads_v3_13(revision_id,symbol,material_change_hash,
        payload_canonical,payload_json,payload_sha256,recorded_at)
      VALUES(v_revision,v_item->>'symbol',v_item->>'materialChangeHash',v_payload_bytes,
        v_item#>'{bundle,json}',v_item#>>'{bundle,hash}',v_now)
      ON CONFLICT(revision_id) DO NOTHING;
    END LOOP;
  ELSIF v_stage='facts_refresh' AND p_json->'officialIngestion'->>'schema'='legacy-official-ingestion-v3.13' THEN
    PERFORM public.opportunity_authority_selected_stream_count_v3_internal('instrument_roster',v_cutoff);
    IF jsonb_array_length(coalesce(p_json#>'{officialIngestion,financialFacts}','[]'::jsonb))>600
      OR jsonb_array_length(coalesce(p_json#>'{officialIngestion,priceObservations}','[]'::jsonb))>800
      OR jsonb_array_length(coalesce(p_json#>'{officialIngestion,corporateActionSnapshots}','[]'::jsonb))>20
      OR jsonb_array_length(coalesce(p_json#>'{officialIngestion,reportedValuations}','[]'::jsonb))>6001
    THEN RAISE EXCEPTION 'bound_violation';END IF;
    FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(p_json#>'{officialIngestion,financialFacts}','[]'::jsonb)) item(value) LOOP
      IF (v_item->>'symbol')!~'^[0-9]{4}$' OR (v_item->>'sourceRef') NOT LIKE (v_item->>'provider')||'-openapi:%'
        OR (v_item->>'filingPublishedAt')::timestamptz>v_cutoff
        OR (v_item->>'filingPublishedAt')::timestamptz>(v_item->>'sourceTimestamp')::timestamptz
        OR (v_item->>'sourceTimestamp')::timestamptz>(v_item->>'collectedAt')::timestamptz
        OR (v_item->>'collectedAt')::timestamptz>v_now THEN RAISE EXCEPTION 'data_integrity_failure';END IF;
      SELECT selected.stock_id INTO v_stock
      FROM public.resolve_legacy_instrument_symbol_authority_v3_13(v_item->>'symbol',
        (v_item->>'collectedAt')::timestamptz) selected
      WHERE selected.instrument_type='common_stock' AND selected.listing_status='active'
        AND selected.provider::text=v_item->>'provider'
        AND (selected.valid_to IS NULL OR (v_item->>'collectedAt')::timestamptz<selected.valid_to);
      IF v_stock IS NULL THEN CONTINUE;END IF;
      PERFORM public.append_financial_fact_v3(ROW(v_stock,
        (v_item->>'factKey')::public.financial_fact_key_v3,(v_item->>'periodStart')::date,
        (v_item->>'periodEnd')::date,(v_item->>'durationKind')::public.financial_duration_kind_v3,
        (v_item->>'value')::double precision,(v_item->>'unit')::public.financial_unit_v3,
        (v_item->>'provider')::public.financial_provider_v3,
        (v_item->>'authorityTier')::public.financial_authority_tier_v3,
        (v_item->>'estimateKind')::public.financial_estimate_kind_v3,
        (v_item->>'estimateHorizon')::public.financial_estimate_horizon_v3,
        (v_item->>'filingPublishedAt')::timestamptz,(v_item->>'sourceTimestamp')::timestamptz,
        (v_item->>'collectedAt')::timestamptz,NULL,v_item->>'sourceRef')::public.financial_fact_input_v3,
        'a11d4e67-7d0a-4c44-8a9d-1d5c3b875001'::uuid);
    END LOOP;
    FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(p_json#>'{officialIngestion,priceObservations}','[]'::jsonb)) item(value) LOOP
      IF (v_item->>'symbol')!~'^[0-9]{4}$' OR coalesce(v_item->>'exchange','') NOT IN ('TWSE','TPEX')
        OR (v_item->>'session')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        OR (v_item->>'provider')<>lower(v_item->>'exchange')
        OR (v_item->>'sourceRef')<>lower(v_item->>'exchange')||'-rwd:'||
          (CASE WHEN v_item->>'exchange'='TWSE' THEN 'STOCK_DAY' ELSE 'tradingStock' END)||':'||
          (v_item->>'session')||':'||(v_item->>'symbol')
        OR (v_item->>'sourceTimestamp')::timestamptz<>((v_item->>'session')||' 06:30:00+00')::timestamptz
        OR (v_item->>'sourceTimestamp')::timestamptz>(v_item->>'collectedAt')::timestamptz
        OR (v_item->>'sourceTimestamp')::timestamptz>v_cutoff
        OR (v_item->>'collectedAt')::timestamptz>v_now
        OR NOT ((v_item->>'open')~'^[0-9]+([.][0-9]+)?$' AND (v_item->>'high')~'^[0-9]+([.][0-9]+)?$'
          AND (v_item->>'low')~'^[0-9]+([.][0-9]+)?$' AND (v_item->>'close')~'^[0-9]+([.][0-9]+)?$'
          AND (v_item->>'volume')~'^[0-9]+([.][0-9]+)?$' AND (v_item->>'turnoverTwd')~'^[0-9]+([.][0-9]+)?$')
        OR (v_item->>'high')::double precision<greatest((v_item->>'open')::double precision,(v_item->>'close')::double precision)
        OR (v_item->>'low')::double precision>least((v_item->>'open')::double precision,(v_item->>'close')::double precision)
      THEN RAISE EXCEPTION 'data_integrity_failure';END IF;
      v_exchange:=(v_item->>'exchange')::public.stock_exchange_v3;v_session:=(v_item->>'session')::date;
      SELECT selected.stock_id INTO v_stock
      FROM public.resolve_legacy_instrument_symbol_authority_v3_13(v_item->>'symbol',
        (v_item->>'collectedAt')::timestamptz) selected
      WHERE selected.exchange=v_exchange AND selected.instrument_type='common_stock'
        AND selected.listing_status='active'
        AND (selected.valid_to IS NULL OR (v_item->>'collectedAt')::timestamptz<selected.valid_to);
      SELECT selected.session_authority_id INTO v_session_authority
      FROM public.resolve_legacy_trading_session_authority_v3_13(v_session,
        v_exchange::text::public.tw_market_v3,(v_item->>'collectedAt')::timestamptz) selected
      WHERE selected.provider::text=v_item->>'provider' AND selected.status='completed'
        AND selected.close_at<=(v_item->>'collectedAt')::timestamptz;
      IF v_stock IS NULL OR v_session_authority IS NULL THEN CONTINUE;END IF;
      PERFORM public.append_price_authority_v3(ROW('raw_price',ROW(v_stock,v_exchange,v_session,
        v_session_authority,(v_item->>'open')::double precision,(v_item->>'high')::double precision,
        (v_item->>'low')::double precision,(v_item->>'close')::double precision,
        (v_item->>'volume')::double precision,(v_item->>'turnoverTwd')::double precision,
        (v_item->>'provider')::public.price_provider_v3,(v_item->>'sourceTimestamp')::timestamptz,
        (v_item->>'collectedAt')::timestamptz,v_item->>'sourceRef')::public.price_observation_input_v3,
        NULL,NULL)::public.price_authority_input_v3,'a11d4e67-7d0a-4c44-8a9d-1d5c3b875001'::uuid);
    END LOOP;
    FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(p_json#>'{officialIngestion,corporateActionSnapshots}','[]'::jsonb)) item(value) LOOP
      IF coalesce(v_item->>'exchange','') NOT IN ('TWSE','TPEX')
        OR (v_item->>'session')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        OR (v_item->>'provider')<>lower(v_item->>'exchange')
        OR (v_item->>'corporateActionVersion')<>'tw-corporate-action-v3.1'
        OR (v_item->>'collectedAt')::timestamptz>v_now
        OR jsonb_array_length(coalesce(v_item->'feedEvidence','[]'::jsonb))<>3
        OR jsonb_array_length(coalesce(v_item->'events','[]'::jsonb))<>coalesce((v_item->>'declaredEventCount')::integer,-1)
      THEN RAISE EXCEPTION 'data_integrity_failure';END IF;
      v_exchange:=(v_item->>'exchange')::public.stock_exchange_v3;v_session:=(v_item->>'session')::date;
      SELECT selected.session_authority_id INTO v_session_authority
      FROM public.resolve_legacy_trading_session_authority_v3_13(v_session,
        v_exchange::text::public.tw_market_v3,(v_item->>'collectedAt')::timestamptz) selected
      WHERE selected.provider::text=v_item->>'provider' AND selected.status='completed'
        AND selected.close_at<=(v_item->>'collectedAt')::timestamptz;
      IF v_session_authority IS NULL THEN CONTINUE;END IF;
      SELECT coalesce(array_agg(ROW(value->>'feedIdentity',(value->>'responseByteCount')::integer,
        value->>'responseSha256',(value->>'parsedRowCount')::integer)::public.corporate_action_feed_evidence_input_v3
        ORDER BY ordinality),ARRAY[]::public.corporate_action_feed_evidence_input_v3[])
        INTO v_feed_evidence FROM jsonb_array_elements(v_item->'feedEvidence') WITH ORDINALITY feed(value,ordinality);
      SELECT coalesce(array_agg(ROW(value->>'symbol',(value->>'eventKind')::public.corporate_action_kind_v3,
        (value->>'preActionReferencePrice')::double precision,(value->>'postActionReferencePrice')::double precision,
        value->>'feedIdentity',value->>'sourceRowRef')::public.corporate_action_event_input_v3 ORDER BY value->>'symbol'),
        ARRAY[]::public.corporate_action_event_input_v3[]) INTO v_action_events
      FROM jsonb_array_elements(v_item->'events') event(value);
      PERFORM public.append_price_authority_v3(ROW('corporate_action_snapshot',NULL,
        ROW(v_exchange,v_session,v_session_authority,'tw-corporate-action-v3.1',
          (v_item->>'provider')::public.official_roster_provider_v3,(v_item->>'collectedAt')::timestamptz,
          v_feed_evidence,(v_item->>'declaredEventCount')::integer,v_action_events)::public.corporate_action_snapshot_input_v3,
        NULL)::public.price_authority_input_v3,'a11d4e67-7d0a-4c44-8a9d-1d5c3b875001'::uuid);
    END LOOP;
    FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(p_json#>'{officialIngestion,reportedValuations}','[]'::jsonb)) item(value) LOOP
      IF (v_item->>'symbol')!~'^[0-9]{4}$' OR (v_item->>'session')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        OR NOT ((v_item->>'sourceRef') LIKE 'twse-openapi:%' OR (v_item->>'sourceRef') LIKE 'tpex-openapi:%'
          OR (v_item->>'sourceRef') LIKE 'twse-rwd:%' OR (v_item->>'sourceRef') LIKE 'tpex-rwd:%')
        OR (v_item->>'collectedAt')::timestamptz>v_now THEN RAISE EXCEPTION 'data_integrity_failure';END IF;
      v_exchange:=CASE WHEN (v_item->>'sourceRef') LIKE 'twse-%' THEN 'TWSE'::public.stock_exchange_v3 ELSE 'TPEX'::public.stock_exchange_v3 END;
      v_session:=(v_item->>'session')::date;
      SELECT selected.stock_id INTO v_stock
      FROM public.resolve_legacy_instrument_symbol_authority_v3_13(v_item->>'symbol',
        (v_item->>'collectedAt')::timestamptz) selected
      WHERE selected.exchange::text=v_exchange::text AND selected.instrument_type='common_stock'
        AND selected.listing_status='active'
        AND (selected.valid_to IS NULL OR (v_item->>'collectedAt')::timestamptz<selected.valid_to);
      v_close:=CASE WHEN (v_item->>'sourceRef') LIKE '%-openapi:%' AND coalesce(v_item->>'closeSourceRef','')
        LIKE lower(v_exchange::text)||'-openapi:official-close:%' AND coalesce(v_item->>'close','')~'^[0-9]+([.][0-9]+)?$'
        THEN (v_item->>'close')::double precision ELSE NULL END;
      IF v_close IS NULL THEN
        SELECT price.raw_close INTO v_close FROM public.opportunity_price_observations_v3 price
        WHERE price.stock_id=v_stock AND price.exchange=v_exchange AND price.session_id=v_session AND price.raw_close>0
          AND price.source_timestamp<=(v_item->>'collectedAt')::timestamptz
          AND price.collected_at<=(v_item->>'collectedAt')::timestamptz
        ORDER BY price.source_timestamp DESC,price.collected_at DESC,price.recorded_at DESC,
          price.source_ref,price.observation_id LIMIT 1;
      END IF;
      IF v_stock IS NULL OR v_close IS NULL OR (
        NOT (coalesce(v_item->>'peRatio','')~'^[0-9]+([.][0-9]+)?$' AND (v_item->>'peRatio')::double precision>0)
        AND NOT (coalesce(v_item->>'pbRatio','')~'^[0-9]+([.][0-9]+)?$' AND (v_item->>'pbRatio')::double precision>0)
      ) THEN CONTINUE;END IF;
      PERFORM public.append_exchange_reported_valuation_v3_13(ROW(v_stock,v_exchange,v_session,v_close,
        CASE WHEN coalesce(v_item->>'peRatio','')~'^[0-9]+([.][0-9]+)?$' AND (v_item->>'peRatio')::double precision>0
          THEN (v_item->>'peRatio')::double precision ELSE NULL END,
        CASE WHEN coalesce(v_item->>'pbRatio','')~'^[0-9]+([.][0-9]+)?$' AND (v_item->>'pbRatio')::double precision>0
          THEN (v_item->>'pbRatio')::double precision ELSE NULL END,
        (v_session::text||' 06:30:00+00')::timestamptz,(v_session::text||' 06:30:00+00')::timestamptz,
        (v_item->>'collectedAt')::timestamptz,v_item->>'sourceRef')::public.exchange_reported_valuation_input_v3_13,
        'a11d4e67-7d0a-4c44-8a9d-1d5c3b875001'::uuid);
    END LOOP;
  ELSIF v_stage='compact_radar_projection' THEN
    IF jsonb_array_length(coalesce(p_json->'decisionRevisions','[]'::jsonb))>30
      OR (SELECT count(DISTINCT value->>'decisionRevisionId') FROM jsonb_array_elements(
        coalesce(p_json->'decisionRevisions','[]'::jsonb)) item(value))
        <>jsonb_array_length(coalesce(p_json->'decisionRevisions','[]'::jsonb))
      OR (SELECT count(DISTINCT value->>'symbol') FROM jsonb_array_elements(
        coalesce(p_json->'decisionRevisions','[]'::jsonb)) item(value))
        <>jsonb_array_length(coalesce(p_json->'decisionRevisions','[]'::jsonb))
    THEN RAISE EXCEPTION 'bound_violation';END IF;
    SELECT projection.projection_id,projection.payload_json INTO STRICT v_projection_id,v_home_payload
    FROM public.legacy_radar_projections_v3_11 projection
    WHERE projection.projection_key=(SELECT value->>'projectionKey' FROM jsonb_array_elements(p_json->'projections') item(value)
      WHERE value->>'storageWindow'='home');
    IF jsonb_typeof(v_home_payload->'sourceSignals')<>'array'
      OR jsonb_array_length(v_home_payload->'sourceSignals')>30
      OR (SELECT count(DISTINCT value->>'decisionRevisionId')
          FROM jsonb_array_elements(v_home_payload->'sourceSignals') card(value))
        <>jsonb_array_length(v_home_payload->'sourceSignals')
      OR (SELECT count(DISTINCT value->>'symbol')
          FROM jsonb_array_elements(v_home_payload->'sourceSignals') card(value))
        <>jsonb_array_length(v_home_payload->'sourceSignals')
    THEN RAISE EXCEPTION 'data_integrity_failure';END IF;
    SELECT coalesce(jsonb_agg(
      ((value-'lastEvaluatedAt'-'noChangeMessage')||jsonb_build_object('decisionEnvelope',
        (value->'decisionEnvelope')-'evaluatedAt'))
      ORDER BY value->>'decisionRevisionId'),'[]'::jsonb)
      INTO v_home_revisions FROM jsonb_array_elements(v_home_payload->'sourceSignals') card(value);
    SELECT coalesce(jsonb_agg(value#>'{bundle,json}' ORDER BY value->>'decisionRevisionId'),'[]'::jsonb)
      INTO v_submitted_revisions
    FROM jsonb_array_elements(coalesce(p_json->'decisionRevisions','[]'::jsonb)) revision(value);
    IF v_home_revisions<>v_submitted_revisions THEN
      RAISE EXCEPTION 'decision_revision_projection_mismatch';
    END IF;
    FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(p_json->'decisionRevisions','[]'::jsonb)) item(value) LOOP
      IF jsonb_typeof(v_item#>'{bundle,json,citations}')='array' THEN
        FOR v_citation IN SELECT value FROM jsonb_array_elements(v_item#>'{bundle,json,citations}') citation(value) LOOP
          BEGIN
            IF NOT public.legacy_valid_rfc3339_v3_13(coalesce(v_citation->>'publishedAt',''))
              OR NOT public.legacy_valid_rfc3339_v3_13(coalesce(v_citation->>'collectedAt',''))
              OR NOT public.legacy_valid_rfc3339_v3_13(coalesce(v_citation->>'evaluatedAt',''))
              OR (v_citation->>'publishedAt')::timestamptz>(v_citation->>'collectedAt')::timestamptz
              OR (v_citation->>'collectedAt')::timestamptz>(v_citation->>'evaluatedAt')::timestamptz
            THEN RAISE EXCEPTION 'data_integrity_failure' USING ERRCODE='PT409';END IF;
          EXCEPTION WHEN SQLSTATE 'PT409' THEN RAISE;
            WHEN OTHERS THEN RAISE EXCEPTION 'data_integrity_failure' USING ERRCODE='PT409';
          END;
        END LOOP;
      END IF;
      IF v_item#>>'{bundle,json,decisionEnvelope,recommendationAuthority}'='conditional_research' THEN
        v_relative_threshold:=v_item#>'{bundle,json,decisionEnvelope,valuationSummary,thresholdAuthority}';
        IF NOT public.legacy_valid_relative_valuation_authority_v3_13(
          v_item->>'symbol',v_cutoff,v_relative_threshold)
        THEN RAISE EXCEPTION 'data_integrity_failure/relative_valuation_authority';END IF;
      END IF;
      IF coalesce(v_item->>'symbol','')!~'^[0-9]{4}$'
        OR coalesce(v_item->>'decisionRevisionId','')!~'^decision-v3[.]13:[0-9a-f]{64}$'
        OR v_item#>>'{bundle,kind}'<>'legacy_decision_revision_v3_13'
        OR v_item#>>'{identityBundle,kind}'<>'legacy_decision_revision_identity_v3_13'
        OR coalesce(v_item#>>'{bundle,hash}','')!~'^[0-9a-f]{64}$'
        OR coalesce(v_item#>>'{identityBundle,hash}','')!~'^[0-9a-f]{64}$'
        OR v_item#>>'{bundle,json,symbol}'<>v_item->>'symbol'
        OR v_item#>>'{bundle,json,decisionRevisionId}'<>v_item->>'decisionRevisionId'
        OR v_item#>>'{bundle,json,decisionEnvelope,decisionRevisionId}'<>v_item->>'decisionRevisionId'
        OR NOT public.legacy_valid_decision_envelope_v3_13(v_item#>'{bundle,json,decisionEnvelope}')
        OR (v_item#>'{bundle,json,researchDecision}' IS NOT NULL AND (
          jsonb_typeof(v_item#>'{bundle,json,researchDecision}')<>'object'
          OR v_item#>'{bundle,json,researchDecision,decisionEnvelope}'
            IS DISTINCT FROM v_item#>'{bundle,json,decisionEnvelope}'))
        OR coalesce(v_item#>>'{bundle,json,decisionEnvelope,version}','')<>'decision-envelope-v3.13.0'
        OR coalesce(v_item#>>'{bundle,json,decisionEnvelope,recommendationAuthority}','')
          NOT IN ('formal','conditional_research','none')
        OR coalesce(v_item#>>'{bundle,json,decisionEnvelope,valuationReadiness}','')
          NOT IN ('complete','relative_only','missing','stale','conflict')
        OR coalesce(v_item#>>'{bundle,json,decisionEnvelope,userAction}','')
          NOT IN ('buy','accumulate','research_starter','wait_breakout','wait_reclaim','avoid_chase','avoid','unavailable')
        OR (v_item#>>'{bundle,json,decisionEnvelope,recommendationAuthority}'='formal'
          AND v_item#>>'{bundle,json,decisionEnvelope,valuationReadiness}'<>'complete')
        OR (v_item#>>'{bundle,json,decisionEnvelope,recommendationAuthority}'='conditional_research'
          AND v_item#>>'{bundle,json,decisionEnvelope,valuationReadiness}'<>'relative_only')
        OR (v_item#>>'{bundle,json,decisionEnvelope,recommendationAuthority}'='none'
          AND v_item#>>'{bundle,json,decisionEnvelope,valuationReadiness}' NOT IN ('missing','stale','conflict'))
        OR (v_item#>>'{bundle,json,decisionEnvelope,userAction}' IN ('buy','accumulate')
          AND v_item#>>'{bundle,json,decisionEnvelope,recommendationAuthority}'<>'formal')
        OR (v_item#>>'{bundle,json,decisionEnvelope,userAction}'='research_starter'
          AND v_item#>>'{bundle,json,decisionEnvelope,recommendationAuthority}'<>'conditional_research')
        OR (v_item#>>'{bundle,json,decisionEnvelope,userAction}' IN
          ('buy','accumulate','research_starter','wait_breakout','wait_reclaim','avoid_chase')
          AND v_item#>>'{bundle,json,decisionEnvelope,recommendationAuthority}'='none')
        OR (
          (NOT (
            jsonb_typeof(v_item#>'{bundle,json,decisionBrief}')='object'
            AND v_item#>>'{bundle,json,decisionBrief,availability}'='unavailable'
            AND v_item#>>'{bundle,json,decisionBrief,reason}'='insufficient_cited_decision_brief'
            AND (SELECT count(*) FROM jsonb_object_keys(v_item#>'{bundle,json,decisionBrief}'))=2
            AND v_item#>>'{bundle,json,decisionEnvelope,userAction}'='unavailable'
          ) AND (
          jsonb_typeof(v_item#>'{bundle,json,decisionBrief}')<>'object'
          OR jsonb_typeof(v_item#>'{bundle,json,decisionBrief,thesis}')<>'array'
          OR jsonb_array_length(v_item#>'{bundle,json,decisionBrief,thesis}')<>3
          OR EXISTS(SELECT 1 FROM jsonb_array_elements(v_item#>'{bundle,json,decisionBrief,thesis}') point(value)
            WHERE jsonb_typeof(value)<>'string' OR length(value#>>'{}') NOT BETWEEN 1 AND 240
              OR value#>>'{}'<>btrim(value#>>'{}'))
          OR jsonb_typeof(v_item#>'{bundle,json,decisionBrief,risks}')<>'array'
          OR jsonb_array_length(v_item#>'{bundle,json,decisionBrief,risks}')<>3
          OR EXISTS(SELECT 1 FROM jsonb_array_elements(v_item#>'{bundle,json,decisionBrief,risks}') point(value)
            WHERE jsonb_typeof(value)<>'string' OR length(value#>>'{}') NOT BETWEEN 1 AND 240
              OR value#>>'{}'<>btrim(value#>>'{}'))
          OR jsonb_typeof(v_item#>'{bundle,json,decisionBrief,evidence}')<>'array'
          OR jsonb_array_length(v_item#>'{bundle,json,decisionBrief,evidence}')<>6
          OR (SELECT count(DISTINCT value->>'point') FROM jsonb_array_elements(
            v_item#>'{bundle,json,decisionBrief,evidence}') point(value))<>6
          OR EXISTS(SELECT 1 FROM jsonb_array_elements(v_item#>'{bundle,json,decisionBrief,evidence}') point(value)
            WHERE coalesce(value->>'point','') NOT IN ('thesis:0','thesis:1','thesis:2','risk:0','risk:1','risk:2')
              OR jsonb_typeof(value->'refs')<>'array' OR jsonb_array_length(value->'refs')=0
              OR EXISTS(SELECT 1 FROM jsonb_array_elements(value->'refs') ref(value)
                WHERE jsonb_typeof(ref.value)<>'string')
              OR (SELECT count(DISTINCT ref.value) FROM jsonb_array_elements(value->'refs') ref(value))
                <>jsonb_array_length(value->'refs')
              OR EXISTS(SELECT 1 FROM jsonb_array_elements(value->'refs') ref(value)
                WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(
                  v_item#>'{bundle,json,citations}','[]'::jsonb)) citation(value)
                  WHERE citation.value->>'ref'=ref.value#>>'{}'
                    AND length(coalesce(citation.value->>'sourceKey',''))>0
                    AND citation.value->>'sourceKey'=btrim(citation.value->>'sourceKey')
                    AND length(coalesce(citation.value->>'sourceName',''))>0
                    AND citation.value->>'sourceName'=btrim(citation.value->>'sourceName')
                    AND public.legacy_valid_https_url_v3_13(coalesce(citation.value->>'sourceUrl',''))
                    AND public.legacy_valid_rfc3339_v3_13(coalesce(citation.value->>'publishedAt',''))
                    AND public.legacy_valid_rfc3339_v3_13(coalesce(citation.value->>'collectedAt',''))
                    AND public.legacy_valid_rfc3339_v3_13(coalesce(citation.value->>'evaluatedAt',''))
                    AND (citation.value->>'publishedAt')::timestamptz
                      <=(citation.value->>'collectedAt')::timestamptz
                    AND (citation.value->>'collectedAt')::timestamptz
                      <=(citation.value->>'evaluatedAt')::timestamptz)))
          ))
          OR jsonb_typeof(v_item#>'{bundle,json,citations}')<>'array'
          OR (SELECT count(DISTINCT value->>'ref') FROM jsonb_array_elements(
            v_item#>'{bundle,json,citations}') citation(value))
            <>jsonb_array_length(v_item#>'{bundle,json,citations}')
          OR EXISTS(SELECT 1 FROM jsonb_array_elements(v_item#>'{bundle,json,citations}') citation(value)
            WHERE jsonb_typeof(value)<>'object' OR jsonb_typeof(value->'ref')<>'string'
              OR jsonb_typeof(value->'sourceKey')<>'string' OR jsonb_typeof(value->'sourceName')<>'string'
              OR jsonb_typeof(value->'sourceUrl')<>'string' OR jsonb_typeof(value->'publishedAt')<>'string'
              OR jsonb_typeof(value->'collectedAt')<>'string' OR jsonb_typeof(value->'evaluatedAt')<>'string'
              OR length(coalesce(value->>'ref',''))=0 OR value->>'ref'<>btrim(value->>'ref')
              OR length(coalesce(value->>'sourceKey',''))=0 OR value->>'sourceKey'<>btrim(value->>'sourceKey')
              OR length(coalesce(value->>'sourceName',''))=0 OR value->>'sourceName'<>btrim(value->>'sourceName')
              OR NOT public.legacy_valid_https_url_v3_13(coalesce(value->>'sourceUrl',''))
              OR NOT public.legacy_valid_rfc3339_v3_13(coalesce(value->>'publishedAt',''))
              OR NOT public.legacy_valid_rfc3339_v3_13(coalesce(value->>'collectedAt',''))
              OR NOT public.legacy_valid_rfc3339_v3_13(coalesce(value->>'evaluatedAt',''))
              OR (value->>'publishedAt')::timestamptz>(value->>'collectedAt')::timestamptz
              OR (value->>'collectedAt')::timestamptz>(value->>'evaluatedAt')::timestamptz)
          OR jsonb_typeof(v_item#>'{bundle,json,sourceProvenance}')<>'object'
          OR jsonb_typeof(v_item#>'{bundle,json,sourceProvenance,sourceKey}')<>'string'
          OR jsonb_typeof(v_item#>'{bundle,json,sourceProvenance,sourceName}')<>'string'
          OR jsonb_typeof(v_item#>'{bundle,json,sourceProvenance,sourceUrl}')<>'string'
          OR jsonb_typeof(v_item#>'{bundle,json,sourceProvenance,publishedAt}')<>'string'
          OR jsonb_typeof(v_item#>'{bundle,json,sourceProvenance,collectedAt}')<>'string'
          OR jsonb_typeof(v_item#>'{bundle,json,sourceProvenance,evaluatedAt}')<>'string'
          OR v_item#>>'{bundle,json,sourceProvenance,sourceKey}'
            <>btrim(v_item#>>'{bundle,json,sourceProvenance,sourceKey}')
          OR v_item#>>'{bundle,json,sourceProvenance,sourceName}'
            <>btrim(v_item#>>'{bundle,json,sourceProvenance,sourceName}')
          OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_item#>'{bundle,json,citations}') citation(value)
            WHERE citation.value->>'sourceKey'=v_item#>>'{bundle,json,sourceProvenance,sourceKey}'
              AND citation.value->>'sourceName'=v_item#>>'{bundle,json,sourceProvenance,sourceName}'
              AND citation.value->>'sourceUrl'=v_item#>>'{bundle,json,sourceProvenance,sourceUrl}'
              AND citation.value->>'publishedAt'=v_item#>>'{bundle,json,sourceProvenance,publishedAt}'
              AND citation.value->>'collectedAt'=v_item#>>'{bundle,json,sourceProvenance,collectedAt}'
              AND citation.value->>'evaluatedAt'=v_item#>>'{bundle,json,sourceProvenance,evaluatedAt}')
        )
      THEN RAISE EXCEPTION 'data_integrity_failure';END IF;
      v_payload_bytes:=convert_to(v_item#>>'{bundle,canonical}','utf8');
      v_expected_payload_canonical:=public.legacy_canonical_json_v3_13(v_item#>'{bundle,json}');
      IF convert_from(v_payload_bytes,'utf8')::jsonb<>v_item#>'{bundle,json}'
        OR convert_from(v_payload_bytes,'utf8')<>v_expected_payload_canonical
        OR encode(extensions.digest(v_payload_bytes,'sha256'),'hex')<>v_item#>>'{bundle,hash}'
      THEN RAISE EXCEPTION 'data_integrity_failure';END IF;
      v_identity_bytes:=convert_to(v_item#>>'{identityBundle,canonical}','utf8');
      v_identity_json:=jsonb_build_array('decision-revision-v3.13.2',
        ((v_item#>'{bundle,json}')-'decisionRevisionId'::text)||jsonb_build_object('decisionEnvelope',
          (v_item#>'{bundle,json,decisionEnvelope}')-'decisionRevisionId'::text));
      v_expected_identity_canonical:=public.legacy_canonical_json_v3_13(v_identity_json);
      IF convert_from(v_identity_bytes,'utf8')::jsonb<>v_identity_json
        OR convert_from(v_identity_bytes,'utf8')<>v_expected_identity_canonical
        OR encode(extensions.digest(v_identity_bytes,'sha256'),'hex')<>v_item#>>'{identityBundle,hash}'
        OR v_item->>'decisionRevisionId'<>'decision-v3.13:'||(v_item#>>'{identityBundle,hash}')
      THEN RAISE EXCEPTION 'decision_revision_identity_conflict';END IF;
      SELECT decision_payload_sha256 INTO v_existing_hash
      FROM public.legacy_decision_revisions_v3_13
      WHERE decision_revision_id=v_item->>'decisionRevisionId';
      IF v_existing_hash IS NOT NULL AND v_existing_hash<>v_item#>>'{bundle,hash}'
      THEN RAISE EXCEPTION 'decision_revision_checksum_conflict';END IF;
      INSERT INTO public.legacy_decision_revisions_v3_13(decision_revision_id,symbol,
        decision_payload_canonical,decision_payload_json,decision_payload_sha256,recorded_at)
      VALUES(v_item->>'decisionRevisionId',v_item->>'symbol',v_payload_bytes,v_item#>'{bundle,json}',
        v_item#>>'{bundle,hash}',v_now)
      ON CONFLICT(decision_revision_id) DO NOTHING;
      v_evaluated_at:=(v_item#>>'{sourceLedCorrectness,evaluatedAt}')::timestamptz;
      SELECT evaluation.source_led_correctness INTO v_existing_correctness
      FROM public.legacy_decision_revision_evaluations_v3_13 evaluation
      WHERE evaluation.decision_revision_id=v_item->>'decisionRevisionId'
        AND evaluation.evaluated_at=v_evaluated_at FOR UPDATE;
      IF v_existing_correctness IS NOT NULL AND v_existing_correctness<>v_item->'sourceLedCorrectness'
      THEN RAISE EXCEPTION 'decision_evaluation_checksum_conflict';END IF;
      INSERT INTO public.legacy_decision_revision_evaluations_v3_13(decision_revision_id,projection_id,
        source_led_correctness,evaluated_at,recorded_at)
      VALUES(v_item->>'decisionRevisionId',v_projection_id,v_item->'sourceLedCorrectness',
        v_evaluated_at,v_now)
      ON CONFLICT(decision_revision_id,evaluated_at) DO NOTHING;
    END LOOP;
  END IF;
  status:=v_status;next_job:=v_next;RETURN NEXT;
END $function$;

DO $v313_rls$
DECLARE rel text;
BEGIN
  FOREACH rel IN ARRAY ARRAY[
    'legacy_approved_source_profiles_v3_13',
    'legacy_frozen_source_authorities_v3_13','legacy_source_append_context_v3_13',
    'legacy_source_document_persistence_v3_13','legacy_source_acquisition_outcomes_v3_13',
    'legacy_source_connector_attempts_v3_13','legacy_source_item_outcomes_v3_13','legacy_source_processing_outcomes_v3_13',
    'legacy_decision_revisions_v3_13','legacy_decision_revision_evaluations_v3_13',
    'legacy_analysis_revision_payloads_v3_13',
    'opportunity_financial_fact_series_registry_v3'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',rel);
    EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY',rel);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC,anon,authenticated,service_role',rel);
  END LOOP;
END $v313_rls$;

GRANT CREATE ON SCHEMA public TO opportunity_v3_rpc_owner,legacy_correctness_rpc_owner;
ALTER TABLE public.legacy_approved_source_profiles_v3_13 OWNER TO opportunity_v3_rpc_owner;
ALTER TABLE public.legacy_frozen_source_authorities_v3_13 OWNER TO opportunity_v3_rpc_owner;
ALTER TABLE public.legacy_source_append_context_v3_13 OWNER TO opportunity_v3_rpc_owner;
ALTER TABLE public.legacy_source_document_persistence_v3_13 OWNER TO opportunity_v3_rpc_owner;
ALTER TABLE public.legacy_source_acquisition_outcomes_v3_13 OWNER TO opportunity_v3_rpc_owner;
ALTER TABLE public.legacy_source_connector_attempts_v3_13 OWNER TO opportunity_v3_rpc_owner;
ALTER TABLE public.legacy_source_item_outcomes_v3_13 OWNER TO opportunity_v3_rpc_owner;
ALTER TABLE public.legacy_source_processing_outcomes_v3_13 OWNER TO opportunity_v3_rpc_owner;
ALTER TABLE public.legacy_decision_revisions_v3_13 OWNER TO opportunity_v3_rpc_owner;
ALTER TABLE public.legacy_decision_revision_evaluations_v3_13 OWNER TO opportunity_v3_rpc_owner;
ALTER TABLE public.legacy_analysis_revision_payloads_v3_13 OWNER TO opportunity_v3_rpc_owner;
ALTER TABLE public.opportunity_financial_fact_series_registry_v3 OWNER TO opportunity_v3_rpc_owner;
ALTER FUNCTION public.prepare_opportunity_financial_fact_series_v3() OWNER TO opportunity_v3_rpc_owner;
ALTER FUNCTION public.validate_opportunity_financial_fact_series_v3() OWNER TO opportunity_v3_rpc_owner;
ALTER FUNCTION public.read_legacy_candidate_fact_plane_v3_11(timestamptz,jsonb) OWNER TO opportunity_v3_rpc_owner;
ALTER FUNCTION public.legacy_relative_valuation_authority_v3_13(text,timestamptz) OWNER TO opportunity_v3_rpc_owner;
ALTER FUNCTION public.legacy_valid_relative_valuation_authority_v3_13(text,timestamptz,jsonb) OWNER TO opportunity_v3_rpc_owner;
ALTER FUNCTION public.resolve_legacy_instrument_authority_v3_13_internal(uuid,timestamptz) OWNER TO opportunity_v3_rpc_owner;
ALTER FUNCTION public.resolve_legacy_instrument_authority_v3_13(uuid,timestamptz) OWNER TO opportunity_v3_rpc_owner;
ALTER FUNCTION public.resolve_legacy_instrument_symbol_authority_v3_13_internal(text,timestamptz) OWNER TO opportunity_v3_rpc_owner;
ALTER FUNCTION public.resolve_legacy_instrument_symbol_authority_v3_13(text,timestamptz) OWNER TO opportunity_v3_rpc_owner;
ALTER FUNCTION public.resolve_legacy_sector_authority_v3_13_internal(uuid,public.tw_market_v3,timestamptz) OWNER TO opportunity_v3_rpc_owner;
ALTER FUNCTION public.resolve_legacy_sector_authority_v3_13(uuid,public.tw_market_v3,timestamptz) OWNER TO opportunity_v3_rpc_owner;
ALTER FUNCTION public.resolve_legacy_trading_session_authority_v3_13(date,public.tw_market_v3,timestamptz) OWNER TO opportunity_v3_rpc_owner;
ALTER FUNCTION public.resolve_legacy_trading_session_window_v3_13(public.tw_market_v3,date,date,timestamptz) OWNER TO opportunity_v3_rpc_owner;
ALTER FUNCTION public.resolve_legacy_official_shares_v3_13(uuid,date,timestamptz) OWNER TO opportunity_v3_rpc_owner;
ALTER FUNCTION public.resolve_legacy_official_shares_result_v3_13(uuid,date,timestamptz) OWNER TO opportunity_v3_rpc_owner;
ALTER FUNCTION public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer) OWNER TO opportunity_v3_rpc_owner;
ALTER FUNCTION public.complete_legacy_producer_job_v3_11(uuid,uuid,uuid,bytea,jsonb,text) OWNER TO opportunity_v3_rpc_owner;
ALTER FUNCTION public.legacy_canonical_json_v3_13(jsonb) OWNER TO opportunity_v3_rpc_owner;
ALTER FUNCTION public.legacy_valid_https_url_v3_13(text) OWNER TO opportunity_v3_rpc_owner;
ALTER FUNCTION public.legacy_valid_rfc3339_v3_13(text) OWNER TO opportunity_v3_rpc_owner;
ALTER FUNCTION public.legacy_valid_decision_envelope_v3_13(jsonb) OWNER TO opportunity_v3_rpc_owner;
ALTER FUNCTION public.freeze_legacy_source_authorities_v3_13() OWNER TO opportunity_v3_rpc_owner;
ALTER FUNCTION public.guard_legacy_radar_projection_insert_v3_13() OWNER TO legacy_correctness_rpc_owner;
ALTER FUNCTION public.retain_legacy_radar_projection_v3_13() OWNER TO legacy_correctness_rpc_owner;
ALTER FUNCTION public.append_exchange_reported_valuation_v3_13(public.exchange_reported_valuation_input_v3_13,uuid)
  OWNER TO opportunity_v3_rpc_owner;
GRANT SELECT(id,display_name) ON TABLE public.source_entities TO opportunity_v3_rpc_owner;
GRANT SELECT ON TABLE public.legacy_radar_projections_v3_11 TO opportunity_v3_rpc_owner;
GRANT SELECT ON TABLE public.legacy_analysis_revisions_v3_11 TO opportunity_v3_rpc_owner;
DROP POLICY IF EXISTS legacy_radar_projections_v3_11_v313_completion_read
  ON public.legacy_radar_projections_v3_11;
CREATE POLICY legacy_radar_projections_v3_11_v313_completion_read
  ON public.legacy_radar_projections_v3_11 FOR SELECT TO opportunity_v3_rpc_owner USING (true);
DROP POLICY IF EXISTS legacy_analysis_revisions_v3_11_v313_completion_read
  ON public.legacy_analysis_revisions_v3_11;
CREATE POLICY legacy_analysis_revisions_v3_11_v313_completion_read
  ON public.legacy_analysis_revisions_v3_11 FOR SELECT TO opportunity_v3_rpc_owner USING (true);
GRANT SELECT ON TABLE public.legacy_decision_revisions_v3_13 TO service_role;
GRANT SELECT ON TABLE public.legacy_decision_revision_evaluations_v3_13 TO service_role;
REVOKE ALL ON TABLE public.opportunity_financial_fact_series_registry_v3 FROM service_role;
REVOKE CREATE ON SCHEMA public FROM opportunity_v3_rpc_owner;
REVOKE CREATE ON SCHEMA public FROM legacy_correctness_rpc_owner;
REVOKE ALL ON FUNCTION public.read_legacy_candidate_fact_plane_v3_11(timestamptz,jsonb),
  public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer),
  public.complete_legacy_producer_job_v3_11(uuid,uuid,uuid,bytea,jsonb,text),
  public.append_exchange_reported_valuation_v3_13(public.exchange_reported_valuation_input_v3_13,uuid),
  public.read_legacy_candidate_fact_plane_authoritative_v3_13(timestamptz,jsonb),
  public.claim_legacy_producer_job_authoritative_v3_13(uuid,uuid,uuid,integer),
  public.complete_legacy_producer_job_authoritative_v3_13(uuid,uuid,uuid,bytea,jsonb,text)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.prepare_opportunity_financial_fact_series_v3(),
  public.validate_opportunity_financial_fact_series_v3(),
  public.legacy_canonical_json_v3_13(jsonb),
  public.legacy_valid_https_url_v3_13(text),
  public.legacy_valid_rfc3339_v3_13(text),
  public.legacy_valid_decision_envelope_v3_13(jsonb),
  public.legacy_relative_valuation_authority_v3_13(text,timestamptz),
  public.legacy_valid_relative_valuation_authority_v3_13(text,timestamptz,jsonb),
  public.freeze_legacy_source_authorities_v3_13(),
  public.guard_legacy_radar_projection_insert_v3_13(),
  public.retain_legacy_radar_projection_v3_13()
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.resolve_legacy_instrument_authority_v3_13_internal(uuid,timestamptz),
  public.resolve_legacy_instrument_authority_v3_13(uuid,timestamptz),
  public.resolve_legacy_instrument_symbol_authority_v3_13_internal(text,timestamptz),
  public.resolve_legacy_instrument_symbol_authority_v3_13(text,timestamptz),
  public.resolve_legacy_sector_authority_v3_13_internal(uuid,public.tw_market_v3,timestamptz),
  public.resolve_legacy_sector_authority_v3_13(uuid,public.tw_market_v3,timestamptz),
  public.resolve_legacy_trading_session_authority_v3_13(date,public.tw_market_v3,timestamptz),
  public.resolve_legacy_trading_session_window_v3_13(public.tw_market_v3,date,date,timestamptz),
  public.resolve_legacy_official_shares_v3_13(uuid,date,timestamptz),
  public.resolve_legacy_official_shares_result_v3_13(uuid,date,timestamptz)
FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.append_exchange_reported_valuation_v3_13(
  public.exchange_reported_valuation_input_v3_13,uuid) TO opportunity_v3_rpc_owner;
GRANT EXECUTE ON FUNCTION public.read_legacy_candidate_fact_plane_authoritative_v3_13(timestamptz,jsonb),
  public.claim_legacy_producer_job_authoritative_v3_13(uuid,uuid,uuid,integer),
  public.complete_legacy_producer_job_authoritative_v3_13(uuid,uuid,uuid,bytea,jsonb,text)
  TO opportunity_v3_rpc_owner;
GRANT EXECUTE ON FUNCTION public.read_legacy_candidate_fact_plane_v3_11(timestamptz,jsonb),
  public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer),
  public.complete_legacy_producer_job_v3_11(uuid,uuid,uuid,bytea,jsonb,text)
  TO legacy_correctness_rpc_owner;
GRANT EXECUTE ON FUNCTION public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_legacy_producer_job_v3_11(uuid,uuid,uuid,bytea,jsonb,text)
  TO service_role;
