-- SOURCE CANDIDATE / NOT APPLIED. Incremental qualification-outcome revision;
-- original045240/763a source receipts retain their old meaning in Git.
-- Separate launch policy; legacy financial
-- ranking routines, published history, bodies/ACLs and native HOLD are intact.
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='2s';
SET LOCAL timezone='UTC'; SET LOCAL extra_float_digits=3;
SELECT pg_advisory_xact_lock(64221022);
DO $pre$
BEGIN
 IF to_regclass('public.vnext_launch_ranking_snapshots_v1') IS NOT NULL THEN RAISE EXCEPTION 'launch_ranking_first_install_required';END IF;
 IF (SELECT count(*) FROM pg_roles WHERE rolname IN('stockinsider_vnext_owner','opportunity_v3_rpc_owner')
  AND NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND rolconfig IS NULL)<>2
  OR EXISTS(SELECT FROM pg_auth_members WHERE roleid IN(to_regrole('stockinsider_vnext_owner'),to_regrole('opportunity_v3_rpc_owner'))
   OR member IN(to_regrole('stockinsider_vnext_owner'),to_regrole('opportunity_v3_rpc_owner')))
  THEN RAISE EXCEPTION 'launch_existing_private_owner_profile_changed';END IF;
 IF to_regclass('public.vnext_launch_csv_ready_acks_v1') IS NULL OR to_regprocedure('public.vnext_launch_csv_backend_v1(uuid,text,integer)') IS NULL
 OR to_regprocedure('public.vnext_input_sources_current_v1(jsonb,text)') IS NULL
 OR to_regprocedure('public.vnext_business_criteria_current_v1(uuid,text)') IS NULL
 OR to_regprocedure('public.vnext_trading_invalid_current_v1(text,text)') IS NULL
 OR to_regprocedure('public.vnext_action_terms_current_internal_v1(uuid,text,timestamptz)') IS NULL
 OR to_regclass('public.vnext_publications_v1') IS NULL OR to_regclass('public.vnext_provider_invocations_v1') IS NULL
 THEN RAISE EXCEPTION 'launch_ranking_source_and_research_authority_required';END IF;
END $pre$;

CREATE TABLE public.vnext_launch_ranking_mode_v1(
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),enabled boolean NOT NULL DEFAULT false,
 required_writer_release text CHECK(required_writer_release IS NULL OR required_writer_release ~ '^[a-f0-9]{40}$'),
 required_calendar_producer_release text CHECK(required_calendar_producer_release IS NULL OR required_calendar_producer_release ~ '^[a-f0-9]{40}$'),
 policy_version text NOT NULL DEFAULT 'stockinsider-launch-radar-v1' CHECK(policy_version='stockinsider-launch-radar-v1'),
 rules_version text NOT NULL DEFAULT 'launch-radar-comparisons-v5' CHECK(rules_version='launch-radar-comparisons-v5'),
 arithmetic_version text NOT NULL DEFAULT 'binary64-v1' CHECK(arithmetic_version='binary64-v1')
);
INSERT INTO public.vnext_launch_ranking_mode_v1 DEFAULT VALUES;
CREATE TABLE public.vnext_launch_score_evidence_v1(
 score_revision uuid PRIMARY KEY DEFAULT gen_random_uuid(),research_revision uuid NOT NULL REFERENCES public.vnext_publications_v1(revision_id),
 symbol text NOT NULL CHECK(symbol ~ '^[0-9]{4}$'),input_hash text NOT NULL CHECK(input_hash ~ '^[a-f0-9]{64}$'),
 signal_session date NOT NULL,input_cutoff timestamptz NOT NULL,
 policy_version text NOT NULL CHECK(policy_version='stockinsider-launch-radar-v1'),rules_version text NOT NULL CHECK(rules_version='launch-radar-comparisons-v5'),
 arithmetic_version text NOT NULL CHECK(arithmetic_version='binary64-v1'),
 source_inputs jsonb NOT NULL,source_hash text NOT NULL CHECK(source_hash ~ '^[a-f0-9]{64}$'),score jsonb NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(input_cutoff=(signal_session::text||'T21:30:00+08:00')::timestamptz)
);
CREATE TABLE public.vnext_launch_qualifications_v1(
 qualification_revision uuid PRIMARY KEY DEFAULT gen_random_uuid(),score_revision uuid NOT NULL REFERENCES public.vnext_launch_score_evidence_v1,
 research_revision uuid NOT NULL REFERENCES public.vnext_publications_v1(revision_id),symbol text NOT NULL,input_hash text NOT NULL,
 checked_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,
 qualified boolean NOT NULL,entry_eligible boolean NOT NULL,checks jsonb NOT NULL,reasons jsonb NOT NULL,revisions jsonb NOT NULL,
 CHECK(expires_at>checked_at AND expires_at<=checked_at+interval '120 seconds')
);
CREATE TABLE public.vnext_launch_ranking_snapshots_v1(
 ordinal bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,ranking_run_id uuid NOT NULL UNIQUE,
 previous_ranking_run_id uuid REFERENCES public.vnext_launch_ranking_snapshots_v1(ranking_run_id),
 request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),input_hash text NOT NULL CHECK(input_hash ~ '^[a-f0-9]{64}$'),
 input_cutoff timestamptz NOT NULL,session_date date NOT NULL,published_at timestamptz NOT NULL,
 snapshot jsonb NOT NULL,CHECK(published_at>=input_cutoff),
 CHECK(input_cutoff=(session_date::text||'T21:30:00+08:00')::timestamptz)
);
CREATE UNIQUE INDEX vnext_launch_ranking_single_successor_v1 ON public.vnext_launch_ranking_snapshots_v1((coalesce(previous_ranking_run_id,'00000000-0000-0000-0000-000000000000'::uuid)));
CREATE TABLE public.vnext_launch_ranking_members_v1(
 ranking_run_id uuid NOT NULL REFERENCES public.vnext_launch_ranking_snapshots_v1(ranking_run_id),symbol text NOT NULL,
 rank integer CHECK(rank BETWEEN 1 AND 10),research_revision uuid NOT NULL REFERENCES public.vnext_publications_v1(revision_id),
 score_revision uuid NOT NULL REFERENCES public.vnext_launch_score_evidence_v1,qualification_revision uuid NOT NULL REFERENCES public.vnext_launch_qualifications_v1,
 input_hash text NOT NULL,PRIMARY KEY(ranking_run_id,symbol),UNIQUE(ranking_run_id,rank)
);
CREATE TABLE public.vnext_launch_score_source_pins_v1(
 score_revision uuid NOT NULL REFERENCES public.vnext_launch_score_evidence_v1,capture_id uuid NOT NULL,
 session_date date NOT NULL,symbol text NOT NULL,
 PRIMARY KEY(score_revision,capture_id,session_date,symbol),
 FOREIGN KEY(capture_id,session_date,symbol) REFERENCES public.vnext_launch_csv_facts_v1(capture_id,session_date,symbol)
);
CREATE TABLE public.vnext_launch_score_price_pins_v1(
 score_revision uuid NOT NULL REFERENCES public.vnext_launch_score_evidence_v1,
 observation_id uuid NOT NULL REFERENCES public.opportunity_price_observations_v3(observation_id),
 calendar_id uuid NOT NULL REFERENCES public.tw_trading_sessions_v3(session_authority_id),
 PRIMARY KEY(score_revision,observation_id)
);
CREATE TABLE public.vnext_launch_score_action_pins_v1(
 score_revision uuid NOT NULL REFERENCES public.vnext_launch_score_evidence_v1,
 snapshot_id uuid NOT NULL REFERENCES public.opportunity_corporate_action_snapshots_v3(snapshot_id),PRIMARY KEY(score_revision,snapshot_id)
);
CREATE TABLE public.vnext_launch_rank_exclusions_v1(
 exclusion_revision uuid PRIMARY KEY DEFAULT gen_random_uuid(),ranking_run_id uuid NOT NULL REFERENCES public.vnext_launch_ranking_snapshots_v1(ranking_run_id),
 symbol text NOT NULL CHECK(symbol ~ '^[0-9]{4}$'),input_hash text NOT NULL CHECK(input_hash ~ '^[a-f0-9]{64}$'),
 reason text NOT NULL CHECK(reason IN('non_ordinary','suspended','delisted','illiquid')),
 input_cutoff timestamptz NOT NULL,checked_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,
 known_at timestamptz NOT NULL,cash_known_at timestamptz,knowledge_scope text NOT NULL CHECK(knowledge_scope IN('current_venue','cutoff_liquidity')),
 classification_digest text NOT NULL CHECK(classification_digest ~ '^[a-f0-9]{64}$'),evidence jsonb NOT NULL,
 instrument_id uuid NOT NULL REFERENCES public.stock_instruments_v3(instrument_authority_id),
 frozen_instrument_id uuid REFERENCES public.stock_instruments_v3(instrument_authority_id),
 UNIQUE(ranking_run_id,symbol),CHECK(expires_at>checked_at AND expires_at<=checked_at+interval '120 seconds'),
 CHECK(known_at<=checked_at),CHECK(knowledge_scope<>'cutoff_liquidity' OR (cash_known_at IS NOT NULL AND cash_known_at<=input_cutoff))
);
CREATE TABLE public.vnext_launch_exclusion_source_pins_v1(
 exclusion_revision uuid NOT NULL REFERENCES public.vnext_launch_rank_exclusions_v1(exclusion_revision),
 capture_id uuid NOT NULL,session_date date NOT NULL,symbol text NOT NULL,
 calendar_id uuid NOT NULL REFERENCES public.tw_trading_sessions_v3(session_authority_id),
 PRIMARY KEY(exclusion_revision,capture_id,session_date,symbol),
 FOREIGN KEY(capture_id,session_date,symbol) REFERENCES public.vnext_launch_csv_facts_v1(capture_id,session_date,symbol)
);
DO $tables$
DECLARE name text;
BEGIN
 FOREACH name IN ARRAY ARRAY['vnext_launch_ranking_mode_v1','vnext_launch_score_evidence_v1','vnext_launch_qualifications_v1','vnext_launch_ranking_snapshots_v1','vnext_launch_ranking_members_v1','vnext_launch_score_source_pins_v1','vnext_launch_score_price_pins_v1','vnext_launch_score_action_pins_v1','vnext_launch_rank_exclusions_v1','vnext_launch_exclusion_source_pins_v1'] LOOP
  EXECUTE format('ALTER TABLE public.%I OWNER TO stockinsider_vnext_owner',name);
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',name);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',name);
  EXECUTE format('CREATE TRIGGER launch_writer_fence BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enforce_production_writer_fence()',name);
  IF name<>'vnext_launch_ranking_mode_v1' THEN
   EXECUTE format('CREATE TRIGGER launch_no_mutation BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.vnext_launch_csv_immutable_v1()',name);
   EXECUTE format('CREATE TRIGGER launch_no_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.vnext_launch_csv_immutable_v1()',name);
  END IF;
 END LOOP;
END $tables$;
REVOKE ALL ON SEQUENCE public.vnext_launch_ranking_snapshots_v1_ordinal_seq FROM PUBLIC,anon,authenticated,service_role;

-- The only conversion boundary from exact stored facts into binary64 rule
-- arithmetic. Do not use isfinite(float8), NUMERIC rule math or epsilon repair.
CREATE FUNCTION public.vnext_launch_finite_v1(value double precision) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT value IS NOT NULL AND value::text NOT IN('NaN','Infinity','-Infinity')
$$;
CREATE FUNCTION public.vnext_launch_binary64_v1(value numeric) RETURNS double precision
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public SET extra_float_digits=3 AS $$
DECLARE converted double precision;
BEGIN
 IF value IS NULL THEN RETURN NULL;END IF;
 IF value::text IN('NaN','Infinity','-Infinity') OR abs(value)>9007199254740991 THEN RETURN NULL;END IF;
 converted:=value::double precision;
 IF NOT public.vnext_launch_finite_v1(converted) THEN RETURN NULL;END IF;
 RETURN CASE WHEN converted=0::double precision THEN 0::double precision ELSE converted END;
END $$;

CREATE FUNCTION public.vnext_launch_action_day_v1(market_name text,calendar_id uuid,day date,target text,cutoff timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC' SET extra_float_digits=3 AS $$
DECLARE selected public.opportunity_corporate_action_snapshots_v3;feeds jsonb;events jsonb;f jsonb;e jsonb;
 expected text[];feed_tuples jsonb;event_tuples jsonb;timestamp_text text;fingerprint text;i integer;known_at timestamptz;target_event jsonb;
BEGIN
 IF market_name NOT IN('TWSE','TPEX') OR calendar_id IS NULL OR day IS NULL OR cutoff IS NULL OR cutoff>statement_timestamp() THEN RETURN NULL;END IF;
 SELECT * INTO selected FROM public.opportunity_corporate_action_snapshots_v3 WHERE exchange::text=market_name AND session_id=day
  AND session_authority_id=calendar_id AND collected_at<=cutoff AND recorded_at<=cutoff
  ORDER BY collected_at DESC,recorded_at DESC,snapshot_id LIMIT 1;
 IF selected.snapshot_id IS NULL OR selected.provider::text<>lower(market_name) OR selected.corporate_action_version<>'tw-corporate-action-v3.1'
  OR selected.collected_at>selected.recorded_at OR EXISTS(SELECT FROM public.opportunity_corporate_action_snapshots_v3 other
   WHERE other.exchange=selected.exchange AND other.session_id=selected.session_id AND other.session_authority_id=selected.session_authority_id
    AND other.collected_at=selected.collected_at AND other.recorded_at=selected.recorded_at
    AND to_jsonb(other)-'snapshot_id' IS DISTINCT FROM to_jsonb(selected)-'snapshot_id') THEN RETURN NULL;END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(f) ORDER BY feed_ordinal),'[]'::jsonb) INTO feeds
 FROM public.opportunity_corporate_action_feed_evidence_v3 f WHERE snapshot_id=selected.snapshot_id;
 SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY event_ordinal),'[]'::jsonb) INTO events
 FROM public.opportunity_corporate_action_events_v3 e WHERE snapshot_id=selected.snapshot_id;
 IF jsonb_array_length(feeds)<>3 OR jsonb_array_length(events)<>selected.declared_event_count
  OR (SELECT sum((f->>'parsed_row_count')::integer) FROM jsonb_array_elements(feeds) f)<>selected.declared_event_count THEN RETURN NULL;END IF;
 expected:=CASE market_name WHEN 'TWSE' THEN ARRAY['twse:twt49u:v1','twse:twtauu:v1','twse:twtb8u:v1']
  ELSE ARRAY['tpex:exright-cal:v1','tpex:reduction-reference:v1','tpex:change-reference:v1'] END;
 known_at:=selected.recorded_at;
 FOR i IN 0..2 LOOP
  f:=feeds->i;
  IF (f->>'feed_ordinal')::integer<>i OR f->>'feed_identity'<>expected[i+1] OR f->>'response_sha256'!~'^[a-f0-9]{64}$'
   OR (f->>'response_byte_count')::integer NOT BETWEEN 0 AND 8388608 OR (f->>'parsed_row_count')::integer NOT BETWEEN 0 AND 20000
   OR (f->>'recorded_at')::timestamptz>cutoff THEN RETURN NULL;END IF;
  known_at:=greatest(known_at,(f->>'recorded_at')::timestamptz);
 END LOOP;
 i:=0;
 FOR e IN SELECT value FROM jsonb_array_elements(events) LOOP
  IF (e->>'event_ordinal')::integer<>i OR e->>'symbol'!~'^[0-9A-Za-z]{2,12}$' OR (i>0 AND (e->>'symbol') COLLATE "C"<=(events->(i-1)->>'symbol') COLLATE "C")
   OR e->>'event_kind' NOT IN('ex_right_dividend','capital_reduction','par_value_change')
   OR e->>'feed_identity'<>expected[array_position(ARRAY['ex_right_dividend','capital_reduction','par_value_change'],e->>'event_kind')]
   OR NOT public.vnext_launch_finite_v1((e->>'pre_action_reference_price')::double precision)
   OR NOT public.vnext_launch_finite_v1((e->>'post_action_reference_price')::double precision)
   OR NOT public.vnext_launch_finite_v1((e->>'daily_adjustment_factor')::double precision)
   OR (e->>'pre_action_reference_price')::double precision<=0 OR (e->>'post_action_reference_price')::double precision<=0
   OR (e->>'daily_adjustment_factor')::double precision<=0 OR (e->>'recorded_at')::timestamptz>cutoff
   OR abs((e->>'daily_adjustment_factor')::double precision-(e->>'post_action_reference_price')::double precision/(e->>'pre_action_reference_price')::double precision)>=1e-10::double precision
   THEN RETURN NULL;END IF;
  IF e->>'source_row_ref'<>public.vnext_launch_csv_hash_v1(jsonb_build_array('corporate-action-source-row-v3.1',market_name,day,e->>'symbol',e->>'event_kind',
    e->'pre_action_reference_price',e->'post_action_reference_price',e->>'feed_identity'))
   THEN RETURN jsonb_build_object('gap','launch_action_numeric_hash_codec_unavailable');END IF;
  IF e->>'symbol'=target THEN target_event:=e;END IF;
  known_at:=greatest(known_at,(e->>'recorded_at')::timestamptz);i:=i+1;
 END LOOP;
 SELECT jsonb_agg(jsonb_build_array(f->>'feed_identity',f->'response_byte_count',f->>'response_sha256',f->'parsed_row_count') ORDER BY (f->>'feed_ordinal')::integer)
 INTO feed_tuples FROM jsonb_array_elements(feeds) f;
 SELECT coalesce(jsonb_agg(jsonb_build_array(e->>'symbol',e->>'event_kind',e->'pre_action_reference_price',e->'post_action_reference_price',e->>'feed_identity',e->>'source_row_ref') ORDER BY (e->>'event_ordinal')::integer),'[]'::jsonb)
 INTO event_tuples FROM jsonb_array_elements(events) e;
 timestamp_text:=rtrim(rtrim(to_char(selected.collected_at,'YYYY-MM-DD"T"HH24:MI:SS.US'),'0'),'.')||'+00:00';
 fingerprint:=public.vnext_launch_csv_hash_v1(jsonb_build_array('corporate-action-snapshot-v3.1',market_name,day,calendar_id,selected.corporate_action_version,selected.provider,timestamp_text,feed_tuples,event_tuples));
 IF fingerprint<>selected.dataset_hash THEN RETURN jsonb_build_object('gap','launch_action_numeric_hash_codec_unavailable');END IF;
 RETURN jsonb_build_object('snapshotId',selected.snapshot_id,'session',day,'calendarId',calendar_id,'hash',selected.dataset_hash,
  'knownAt',known_at,'targetEvent',target_event,'coverage','supported_feeds_only','completeCapitalCoverage',false);
END $$;
CREATE FUNCTION public.vnext_launch_mean64_v1(values_array double precision[],first_index integer,number_values integer) RETURNS double precision
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public SET extra_float_digits=3 AS $$
DECLARE total double precision:=0;result double precision;i integer;
BEGIN
 IF first_index<1 OR number_values NOT BETWEEN 1 AND 240 OR cardinality(values_array)<first_index+number_values-1 THEN RETURN NULL;END IF;
 FOR i IN first_index..first_index+number_values-1 LOOP
  IF NOT public.vnext_launch_finite_v1(values_array[i]) THEN RETURN NULL;END IF;
  total:=total+values_array[i];IF NOT public.vnext_launch_finite_v1(total) THEN RETURN NULL;END IF;
 END LOOP;
 result:=total/number_values::double precision;
 RETURN CASE WHEN result=0::double precision THEN 0::double precision ELSE result END;
END $$;
CREATE FUNCTION public.vnext_launch_ratio64_v1(numerator double precision,denominator double precision) RETURNS double precision
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public SET extra_float_digits=3 AS $$
DECLARE result double precision;
BEGIN
 IF NOT public.vnext_launch_finite_v1(numerator) OR NOT public.vnext_launch_finite_v1(denominator) OR denominator<=0::double precision THEN RETURN NULL;END IF;
 result:=numerator/denominator;IF NOT public.vnext_launch_finite_v1(result) THEN RETURN NULL;END IF;
 RETURN CASE WHEN result=0::double precision THEN 0::double precision ELSE result END;
END $$;
CREATE FUNCTION public.vnext_launch_integer_sum_v1(values_array bigint[]) RETURNS bigint
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE total numeric:=0;value bigint;
BEGIN
 IF values_array IS NULL OR cardinality(values_array) NOT BETWEEN 1 AND 51 THEN RETURN NULL;END IF;
 FOREACH value IN ARRAY values_array LOOP
  IF value IS NULL OR value NOT BETWEEN -9007199254740991 AND 9007199254740991 THEN RETURN NULL;END IF;total:=total+value::numeric;
 END LOOP;
 IF total NOT BETWEEN -9007199254740991 AND 9007199254740991 THEN RETURN NULL;END IF;RETURN total::bigint;
END $$;
CREATE FUNCTION public.vnext_launch_atr64_v1(highs double precision[],lows double precision[],closes double precision[],period integer) RETURNS double precision
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public SET extra_float_digits=3 AS $$
DECLARE value double precision:=0;range_value double precision;i integer;size integer:=cardinality(closes);
BEGIN
 IF period NOT IN(5,20) OR size<period OR size>239 OR cardinality(highs)<>size OR cardinality(lows)<>size THEN RETURN NULL;END IF;
 FOR i IN 1..size LOOP
  IF NOT public.vnext_launch_finite_v1(highs[i]) OR NOT public.vnext_launch_finite_v1(lows[i]) OR NOT public.vnext_launch_finite_v1(closes[i])
   OR closes[i]<=0::double precision OR highs[i]<lows[i] THEN RETURN NULL;END IF;
  range_value:=highs[i]-lows[i];
  IF i>1 THEN range_value:=greatest(range_value,abs(highs[i]-closes[i-1]),abs(lows[i]-closes[i-1]));END IF;
  IF i<=period THEN value:=value+range_value;IF i=period THEN value:=value/period::double precision;END IF;
  ELSE value:=(value*(period-1)::double precision+range_value)/period::double precision;END IF;
  IF NOT public.vnext_launch_finite_v1(value) THEN RETURN NULL;END IF;
 END LOOP;
 IF value<=0::double precision THEN RETURN NULL;END IF;RETURN value;
END $$;

-- Read-only, canonical source selection. The ready ACK is indispensable: an
-- append transaction's recorded_at alone is not knowledge of its commit.
CREATE FUNCTION public.vnext_launch_source_fact_v1(dataset integer,day date,target text,input_digest text,cutoff timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC' SET extra_float_digits=3 AS $$
DECLARE rows_json jsonb;selected jsonb;policy_hash text;fact jsonb;expected_key text;
BEGIN
 IF dataset NOT IN(11370,11371,11856,11391,11755) OR day IS NULL OR cutoff IS NULL OR cutoff>clock_timestamp()
 OR target IS NULL OR target!~'^(INDEX|[0-9]{4})$' THEN RETURN NULL;END IF;
 SELECT public.vnext_launch_csv_hash_v1(to_jsonb(policy)) INTO policy_hash FROM public.vnext_source_policies_v1 policy
 WHERE source='official' AND scope='official_original' AND enabled AND valid_until>clock_timestamp();
 IF policy_hash IS NULL THEN RETURN NULL;END IF;
 expected_key:=CASE WHEN dataset IN(11391,11755) THEN to_char(day,'YYYY-MM') ELSE day::text END;
 SELECT coalesce(jsonb_agg(packet ORDER BY available DESC,capture),'[]'::jsonb) INTO rows_json FROM(
  SELECT jsonb_build_object('captureId',c.capture_id,'artifactHash',c.artifact_hash,'coverage',c.coverage,'poolTargets',c.pool_targets,
   'poolRevision',c.pool_revision,'rightsRevision',c.rights_binding_hash,'observedAt',c.observed_at,
   'availableAt',greatest(c.available_at,a.recorded_at),'ackId',a.ack_id,'datasetId',c.dataset_id) packet,
   greatest(c.available_at,a.recorded_at) available,c.capture_id capture
  FROM public.vnext_launch_csv_captures_v1 c
  JOIN public.vnext_launch_csv_ready_acks_v1 a USING(capture_id)
  JOIN public.vnext_launch_csv_outcomes_v1 o ON o.capture_id=c.capture_id AND o.outcome='complete'
  JOIN public.vnext_launch_csv_attempts_v1 attempt ON attempt.attempt_id=c.attempt_id AND o.attempt_id=attempt.attempt_id
  JOIN public.vnext_launch_csv_bindings_v1 binding ON binding.job_id=attempt.job_id AND binding.dataset_id=c.dataset_id
  WHERE c.dataset_id=dataset AND c.request_key=expected_key
   AND c.observed_at<=cutoff AND c.recorded_at<=cutoff AND c.available_at<=cutoff AND a.recorded_at<=cutoff
   AND c.rights_binding_hash=policy_hash
   AND c.source_url=public.vnext_launch_csv_profile_v1(c.dataset_id,c.request_key)->>'sourceUrl'
   AND c.coverage=public.vnext_launch_csv_profile_v1(c.dataset_id,c.request_key)->>'coverage'
  ORDER BY greatest(c.available_at,a.recorded_at) DESC,c.capture_id LIMIT 101
 ) bounded;
 IF jsonb_array_length(rows_json)=0 THEN RETURN NULL;END IF;
 selected:=rows_json->0;
 IF jsonb_array_length(rows_json)=101 AND rows_json->100->>'availableAt'=selected->>'availableAt' THEN RETURN NULL;END IF;
 IF EXISTS(SELECT FROM jsonb_array_elements(rows_json) candidate WHERE candidate->>'availableAt'=selected->>'availableAt'
  AND candidate-'captureId'-'ackId' IS DISTINCT FROM selected-'captureId'-'ackId') THEN RETURN NULL;END IF;
 -- The complete resource head is selected BEFORE the target filter. A newer
 -- valid response omitting a symbol/date invalidates it; it cannot resurrect
 -- an older target row or an older pool/input snapshot from the same resource.
 IF target<>'INDEX' AND NOT EXISTS(SELECT FROM jsonb_array_elements(selected->'poolTargets') member
  WHERE member->>'symbol'=target AND member->>'inputHash'=input_digest AND member->>'state'<>'exited') THEN RETURN NULL;END IF;
 SELECT to_jsonb(f) INTO fact FROM public.vnext_launch_csv_facts_v1 f WHERE f.capture_id=(selected->>'captureId')::uuid AND f.session_date=day AND f.symbol=target;
 IF fact IS NULL THEN RETURN NULL;END IF;
 RETURN selected-'poolTargets'||jsonb_build_object('fact',fact);
END $$;

-- DB clock and today's completed official session only. A weekend never
-- creates a new Friday ranking; a requested run/session cannot set the cutoff.
CREATE FUNCTION public.vnext_launch_today_calendar_internal_v1(day date,cutoff timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb;
BEGIN
 IF day IS NULL OR cutoff IS NULL OR cutoff>statement_timestamp() THEN RETURN NULL;END IF;
 SELECT jsonb_agg(to_jsonb(t) ORDER BY market,recorded_at DESC,session_authority_id) INTO result
 FROM(SELECT * FROM public.tw_trading_sessions_v3 WHERE session_id=day AND source_timestamp<=cutoff AND collected_at<=cutoff AND recorded_at<=cutoff
  ORDER BY market,recorded_at DESC,session_authority_id LIMIT 1001) t;
 IF result IS NULL OR jsonb_array_length(result)>1000 THEN RETURN NULL;END IF;RETURN result;
END $$;
ALTER FUNCTION public.vnext_launch_today_calendar_internal_v1(date,timestamptz) OWNER TO opportunity_v3_rpc_owner;
REVOKE ALL ON FUNCTION public.vnext_launch_today_calendar_internal_v1(date,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.vnext_launch_today_calendar_internal_v1(date,timestamptz) TO stockinsider_vnext_owner;
CREATE FUNCTION public.vnext_launch_cycle_context_v1(p_principal text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC' AS $$
DECLARE at timestamptz:=statement_timestamp();day date:=(at AT TIME ZONE 'Asia/Taipei')::date;slot timestamptz;reason text;rows_json jsonb;current_rows jsonb;
BEGIN
 IF NOT EXISTS(SELECT FROM public.vnext_principals_v1 WHERE principal=p_principal AND role='operator' AND enabled)
 OR NOT EXISTS(SELECT FROM public.vnext_mode_v1 WHERE enabled AND legacy_fenced)
 OR NOT EXISTS(SELECT FROM public.vnext_launch_ranking_mode_v1 WHERE enabled AND required_writer_release IS NOT NULL)
 THEN reason:='launch_ranking_disabled';
 ELSE
  slot:=(day::text||'T21:30:00+08:00')::timestamptz;
  IF at>=slot THEN rows_json:=public.vnext_launch_today_calendar_internal_v1(day,slot);current_rows:=public.vnext_launch_today_calendar_internal_v1(day,at);END IF;
  IF at<slot THEN reason:='launch_official_2130_slot_not_ready';
  ELSIF NOT EXISTS(SELECT FROM public.vnext_sessions_v1 WHERE session_date=day AND completed AND close_at<=slot)
   THEN reason:='launch_today_official_session_missing';
  ELSIF rows_json IS NULL OR (SELECT count(*) FROM(
    SELECT DISTINCT ON(value->>'market') value FROM jsonb_array_elements(rows_json) ORDER BY value->>'market',(value->>'recorded_at')::timestamptz DESC,value->>'session_authority_id'
   ) heads WHERE value->>'status'='completed' AND (value->>'close_at')::timestamptz<=slot AND value->>'provider'=lower(value->>'market'))<>2
   THEN reason:='launch_both_venue_calendar_missing';
  ELSIF EXISTS(WITH ranked AS(SELECT value,dense_rank() OVER(PARTITION BY value->>'market' ORDER BY (value->>'recorded_at')::timestamptz DESC) priority
    FROM jsonb_array_elements(rows_json)) SELECT FROM ranked WHERE priority=1 GROUP BY value->>'market' HAVING count(DISTINCT(value-'session_authority_id'))>1)
   THEN reason:='launch_today_calendar_conflict';
  ELSIF current_rows IS NULL OR EXISTS(SELECT FROM(SELECT DISTINCT ON(value->>'market') value FROM jsonb_array_elements(current_rows)
    ORDER BY value->>'market',(value->>'recorded_at')::timestamptz DESC,value->>'session_authority_id') current_heads WHERE value->>'status'<>'completed')
   THEN reason:='launch_today_current_calendar_not_completed';END IF;
 END IF;
 RETURN jsonb_build_object('ready',reason IS NULL,'reason',reason,'session',CASE WHEN reason IS NULL THEN day END,
  'cutoff',CASE WHEN reason IS NULL THEN slot END,'policyVersion','stockinsider-launch-radar-v1');
END $$;

-- Narrow owner edge: no old table ACL is granted to the vNext owner. Every
-- annual row returned here has its actual applied ingestion chunk/hash/time.
-- A later JS calendar object or a count of calendar rows is not equivalent.
CREATE FUNCTION public.vnext_launch_calendar_release_v1() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT required_calendar_producer_release FROM public.vnext_launch_ranking_mode_v1 WHERE singleton
$$;
ALTER FUNCTION public.vnext_launch_calendar_release_v1() OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_launch_calendar_release_v1() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.vnext_launch_calendar_release_v1() TO opportunity_v3_rpc_owner;
CREATE FUNCTION public.vnext_launch_annual_rows_internal_v1(market_name text,first_day date,last_day date,cutoff timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC' AS $$
DECLARE result jsonb;release text:=public.vnext_launch_calendar_release_v1();
BEGIN
 IF market_name NOT IN('TWSE','TPEX') OR first_day IS NULL OR last_day<first_day OR last_day-first_day>2400
 OR cutoff IS NULL OR cutoff>clock_timestamp() OR release IS NULL THEN RETURN NULL;END IF;
 SELECT coalesce(jsonb_agg(candidate.packet ORDER BY candidate.session_order,candidate.applied_order DESC,candidate.job_order,candidate.chunk_order,candidate.row_order),'[]'::jsonb)
 INTO result FROM(
 SELECT jsonb_build_object('row',item.value,'chunkHash',chunk.chunk_hash,'jobId',chunk.job_id,
   'runId',chunk.run_id,'producer',chunk.producer_sha,'knownAt',greatest(chunk.recorded_at,applied.applied_at,completed.recorded_at,job.terminal_at)) packet,
  item.value->>'session' session_order,applied.applied_at applied_order,chunk.job_id job_order,chunk.chunk_ordinal chunk_order,item.ordinality row_order
 FROM public.legacy_official_ingestion_chunks_v3_14 chunk
 JOIN public.legacy_official_ingestion_applications_v3_15 applied USING(job_id,chunk_kind,chunk_ordinal)
 JOIN public.legacy_producer_runs_v3_11 run ON run.run_id=chunk.run_id AND run.producer_commit_sha=chunk.producer_sha
 JOIN public.legacy_producer_jobs_v3_11 job ON job.job_id=chunk.job_id AND job.run_id=run.run_id
 JOIN public.legacy_producer_job_results_v3_11 completed ON completed.job_id=job.job_id
 CROSS JOIN LATERAL jsonb_array_elements(chunk.items_json) WITH ORDINALITY item(value,ordinality)
 WHERE chunk.chunk_kind='trading_sessions' AND applied.run_id=chunk.run_id AND applied.chunk_hash=chunk.chunk_hash
  AND chunk.producer_sha=release AND job.stage::text='facts_refresh' AND job.status::text='succeeded'
  AND job.terminal_at<=cutoff AND completed.recorded_at<=cutoff AND run.recorded_at<=cutoff
  AND completed.result_hash=encode(sha256(completed.result_canonical),'hex')
  AND convert_from(completed.result_canonical,'UTF8')::jsonb=completed.result_json
  AND completed.result_json->>'schema'='legacy-facts-refresh-result-v3.11'
  AND completed.result_json#>>'{officialIngestion,schema}'='legacy-official-ingestion-v3.14'
  AND (completed.result_json#>>'{officialIngestion,sourceCutoff}')::timestamptz=chunk.source_cutoff
  AND (completed.result_json#>>'{officialIngestion,counts,trading_sessions}')::integer=(SELECT sum(member.item_count)
   FROM public.legacy_official_ingestion_chunks_v3_14 member WHERE member.job_id=job.job_id AND member.chunk_kind='trading_sessions')
  AND EXISTS(SELECT FROM jsonb_array_elements(completed.result_json#>'{officialIngestion,chunks}') descriptor
   WHERE descriptor->>'kind'=chunk.chunk_kind AND (descriptor->>'ordinal')::integer=chunk.chunk_ordinal
    AND (descriptor->>'itemCount')::integer=chunk.item_count AND descriptor->>'chunkHash'=chunk.chunk_hash)
  AND NOT EXISTS(SELECT FROM jsonb_array_elements(completed.result_json#>'{officialIngestion,chunks}') descriptor
   WHERE NOT EXISTS(SELECT FROM public.legacy_official_ingestion_applications_v3_15 witness
    WHERE witness.job_id=job.job_id AND witness.run_id=run.run_id AND witness.chunk_kind=descriptor->>'kind'
     AND witness.chunk_ordinal=(descriptor->>'ordinal')::integer AND witness.chunk_hash=descriptor->>'chunkHash'
     AND witness.item_count=(descriptor->>'itemCount')::integer AND witness.applied_at<=cutoff))
  AND applied.producer_sha=chunk.producer_sha AND applied.source_cutoff=chunk.source_cutoff
  AND applied.item_count=chunk.item_count AND chunk.item_count=jsonb_array_length(chunk.items_json)
  AND chunk.item_count<=200 AND chunk.recorded_at<=cutoff AND applied.applied_at<=cutoff AND chunk.source_cutoff<=cutoff
  AND chunk.chunk_hash=encode(sha256(convert_to(public.legacy_canonical_json_v3_13(jsonb_build_array(
   'official-ingestion-chunk-v3.14',chunk.chunk_kind,chunk.chunk_ordinal,chunk.items_json)),'UTF8')),'hex')
  AND item.value->>'market'=market_name AND (item.value->>'session')::date BETWEEN first_day AND last_day
 ORDER BY item.value->>'session',applied.applied_at DESC,chunk.job_id,chunk.chunk_ordinal,item.ordinality LIMIT 12001
 ) candidate;
 IF jsonb_array_length(result)>12000 THEN RETURN NULL;END IF;RETURN result;
END $$;
ALTER FUNCTION public.vnext_launch_annual_rows_internal_v1(text,date,date,timestamptz) OWNER TO opportunity_v3_rpc_owner;
REVOKE ALL ON FUNCTION public.vnext_launch_annual_rows_internal_v1(text,date,date,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.vnext_launch_annual_rows_internal_v1(text,date,date,timestamptz) TO stockinsider_vnext_owner;

CREATE FUNCTION public.vnext_launch_calendar_v1(market_name text,signal_day date,cutoff timestamptz,required_sessions integer DEFAULT 240) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC' AS $$
DECLARE heads jsonb;annual jsonb;first_day date;day date;entry jsonb;row_item jsonb;known_at timestamptz;days jsonb;
BEGIN
 IF market_name NOT IN('TWSE','TPEX') OR cutoff IS NULL OR cutoff>statement_timestamp() OR signal_day IS NULL OR required_sessions NOT IN(240,520) THEN RETURN NULL;END IF;
 IF EXISTS(WITH ranked AS(SELECT t.*,dense_rank() OVER(PARTITION BY session_id ORDER BY recorded_at DESC) priority
  FROM public.tw_trading_sessions_v3 t WHERE market::text=market_name AND session_id<=signal_day AND session_id>=signal_day-2400
   AND source_timestamp<=cutoff AND collected_at<=cutoff AND recorded_at<=cutoff)
  SELECT FROM ranked WHERE priority=1 GROUP BY session_id HAVING count(DISTINCT(to_jsonb(ranked)-'session_authority_id'-'priority'))>1) THEN RETURN NULL;END IF;
 SELECT jsonb_agg(to_jsonb(r) ORDER BY session_id) INTO heads FROM(
  SELECT DISTINCT ON(session_id) * FROM public.tw_trading_sessions_v3 WHERE market::text=market_name
   AND session_id BETWEEN signal_day-2400 AND signal_day AND source_timestamp<=cutoff AND collected_at<=cutoff AND recorded_at<=cutoff
  ORDER BY session_id,recorded_at DESC,session_authority_id
 ) r;
 IF heads IS NULL OR jsonb_array_length(heads)>2401 OR EXISTS(SELECT FROM jsonb_array_elements(heads) r
  WHERE r->>'provider'<>lower(market_name) OR r->>'status' NOT IN('completed','cancelled')
   OR (r->>'source_timestamp')::timestamptz>(r->>'collected_at')::timestamptz
   OR (r->>'collected_at')::timestamptz>(r->>'recorded_at')::timestamptz
   OR (r->>'open_at')::timestamptz>=(r->>'close_at')::timestamptz
   OR ((r->>'close_at')::timestamptz AT TIME ZONE 'Asia/Taipei')::date<>(r->>'session_id')::date) THEN RETURN NULL;END IF;
 SELECT jsonb_agg(value ORDER BY value->>'session_id') INTO days FROM(
  SELECT value FROM jsonb_array_elements(heads) WHERE value->>'status'='completed' AND (value->>'close_at')::timestamptz<=cutoff
  ORDER BY value->>'session_id' DESC LIMIT required_sessions
 ) required;
 IF days IS NULL OR jsonb_array_length(days)<>required_sessions OR days->-1->>'session_id'<>signal_day::text THEN RETURN NULL;END IF;
 first_day:=(days->0->>'session_id')::date;
 -- The mechanical score's existing floor is240. The separate1320 backfill
 -- target/listing-limited coverage and three-year chart+warmup are not silently
 -- converted into a new universal listing-age requirement. Chart staysNULL.
 annual:=public.vnext_launch_annual_rows_internal_v1(market_name,first_day,signal_day,cutoff);
 IF annual IS NULL OR jsonb_array_length(annual)=0 THEN RETURN NULL;END IF;
 FOR day IN SELECT generate_series(first_day,signal_day,interval '1 day')::date LOOP
  SELECT value INTO row_item FROM jsonb_array_elements(heads) WHERE value->>'session_id'=day::text;
  SELECT value INTO entry FROM jsonb_array_elements(annual) WHERE value->'row'->>'session'=day::text
   ORDER BY (value->>'knownAt')::timestamptz DESC,value->>'jobId' LIMIT 1;
  IF row_item IS NOT NULL AND row_item->>'status'='cancelled' THEN CONTINUE;END IF;
  IF entry IS NULL THEN
   -- Reuse ONLY the pinned completed v3.14 producer's weekday-only contract.
   -- A recorded weekend/makeup opening contradicts it and remains unsupported.
   IF row_item IS NULL AND extract(isodow FROM day) IN(6,7) THEN CONTINUE;ELSE RETURN NULL;END IF;
  END IF;
  IF EXISTS(SELECT FROM jsonb_array_elements(annual) other WHERE other->'row'->>'session'=day::text
   AND other->>'knownAt'=entry->>'knownAt' AND other->'row' IS DISTINCT FROM entry->'row') THEN RETURN NULL;END IF;
  IF entry->'row'->>'provider'<>lower(market_name) OR entry->'row'->>'sourceSha256'!~'^[a-f0-9]{64}$'
   OR entry->'row'->>'sourceRef'<>lower(market_name)||'-annual-calendar:'||extract(year FROM day)::text||':'||day::text||':'||(entry->'row'->>'sourceSha256')
   OR entry->'row'->>'sourceUrl'<>(CASE market_name WHEN 'TWSE' THEN 'https://www.twse.com.tw/rwd/zh/holidaySchedule/holidaySchedule?response=json&date='||extract(year FROM day)::integer::text||'0101'
    ELSE 'https://www.tpex.org.tw/storage/zh-tw/web/bulletin/trading_date/trading_date_'||(extract(year FROM day)::integer-1911)::text||'.htm' END)
   OR (entry->'row'->>'sourceTimestamp')::timestamptz>(entry->'row'->>'collectedAt')::timestamptz
   OR (entry->'row'->>'collectedAt')::timestamptz>(entry->>'knownAt')::timestamptz
   OR entry->'row'->>'status' NOT IN('completed','holiday') THEN RETURN NULL;END IF;
  IF (entry->'row'->>'status'='completed') IS DISTINCT FROM(row_item IS NOT NULL AND row_item->>'status'='completed') THEN RETURN NULL;END IF;
 END LOOP;
 SELECT greatest(max((d->>'recorded_at')::timestamptz),(SELECT max((a->>'knownAt')::timestamptz) FROM jsonb_array_elements(annual) a)) INTO known_at FROM jsonb_array_elements(heads) d;
 RETURN jsonb_build_object('sessions',days,'calendarRevision',public.vnext_launch_csv_hash_v1(jsonb_build_array('launch-calendar-selected-v1',market_name,signal_day,cutoff,heads,annual,
  'official-calendar-acquisition-v3.14:weekday-only:220147e99e54ecda8fdaad10f6bee026591f88dc144c3a19f886ab78dc2b668a')),
  'coverage','verified_v314_weekday_calendar_only','knownAt',known_at,'annual',annual);
END $$;

-- Private mechanical kernel. No role receiving HTTP requests can execute this
-- or submit its operands to the writer. Its sole authority-bearing caller is
-- the DB selector below; this function itself conveys no provenance approval.
CREATE FUNCTION public.vnext_launch_rule_v1(rule_id text,rule_group text,weight integer,known_match boolean,operands jsonb,cutoff timestamptz,through_day date) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('id',rule_id,'group',rule_group,'weight',weight,'matches',known_match,
  'points',CASE WHEN known_match IS NULL THEN NULL WHEN known_match THEN weight ELSE 0 END,'operands',operands,'cutoff',cutoff,'throughSession',through_day)
$$;
-- Genuine520 continuity can be checked from licensed raw-derived index facts.
-- That is still NOT a complete market regime: the old fixed regime also needs
-- source-bound breadth and foreign-flow inputs. Its JS operator packet is not
-- a SQL proof. Their absent typed producer leaves risk UNKNOWN, hence the
-- command below retains the previous publication/date just as the old policy.
CREATE FUNCTION public.vnext_launch_market_context_v1(signal_day date,cutoff timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC' SET extra_float_digits=3 AS $$
DECLARE venue text;calendar jsonb;c jsonb;f jsonb;inventory jsonb:='[]'::jsonb;venues jsonb:='{}'::jsonb;closes double precision[];
 known_at timestamptz;index_value double precision;
BEGIN
 FOREACH venue IN ARRAY ARRAY['TWSE','TPEX'] LOOP
  calendar:=public.vnext_launch_calendar_v1(venue,signal_day,cutoff,520);
  IF calendar IS NULL THEN RETURN jsonb_build_object('complete',false,'reason','launch_market_520_calendar_missing','risk','unknown');END IF;
  closes:='{}';
  FOR c IN SELECT value FROM jsonb_array_elements(calendar->'sessions') LOOP
   f:=public.vnext_launch_source_fact_v1(CASE venue WHEN 'TWSE' THEN 11755 ELSE 11391 END,(c->>'session_id')::date,'INDEX',NULL,cutoff);
   IF f IS NULL OR (f->>'observedAt')::timestamptz<(c->>'close_at')::timestamptz THEN
    RETURN jsonb_build_object('complete',false,'reason','launch_market_520_licensed_source_missing','risk','unknown');END IF;
   index_value:=public.vnext_launch_binary64_v1((f->'fact'->>'raw_close')::numeric);
   IF index_value IS NULL OR index_value<=0 THEN RETURN jsonb_build_object('complete',false,'reason','launch_market_index_value_invalid','risk','unknown');END IF;
   closes:=array_append(closes,index_value);inventory:=inventory||jsonb_build_array(f);known_at:=greatest(known_at,(f->>'availableAt')::timestamptz);
  END LOOP;
  venues:=venues||jsonb_build_object(venue,jsonb_build_object('calendarRevision',calendar->>'calendarRevision','close',closes[520],
   'ma20',public.vnext_launch_mean64_v1(closes,501,20),'ma60',public.vnext_launch_mean64_v1(closes,461,60)));
 END LOOP;
 RETURN jsonb_build_object('complete',false,'reason','launch_market_breadth_and_flow_typed_producer_not_connected','risk','unknown',
  'session',signal_day,'sourceAt',known_at,'continuity',true,'inventory',inventory,'venues',venues,
  'snapshotHash',public.vnext_launch_csv_hash_v1(jsonb_build_array('launch-market-db-selected-v1',signal_day,cutoff,inventory,venues)),
  'gaps',jsonb_build_array('launch_market_breadth_and_flow_typed_producer_not_connected'));
END $$;
CREATE FUNCTION public.vnext_launch_mechanical_v1(
 sessions date[],opens double precision[],highs double precision[],lows double precision[],closes double precision[],
 technical_shares bigint[],index_closes double precision[],foreign_shares bigint[],trust_shares bigint[],institutional_shares bigint[],
 cutoff timestamptz
) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public SET timezone='UTC' SET extra_float_digits=3 AS $$
DECLARE n integer:=cardinality(closes);i integer;signal_day date;ma50 double precision;ma200 double precision;prior_ma200 double precision;
 market_ma50 double precision;market_ma200 double precision;stock20 double precision;stock63 double precision;market20 double precision;market63 double precision;
 excess20 double precision;excess63 double precision;prior_high double precision;prior_low double precision;depth double precision;distance double precision;
 atr5 double precision;atr20 double precision;atr_ratio double precision;recent5 double precision;prior20 double precision;volume_ratio double precision;breakout_ratio double precision;
 volume64 double precision[];denom5 bigint;denom20 bigint;net bigint;ratio double precision;match boolean;breakout boolean;
 rules jsonb:='[]'::jsonb;components jsonb;group_name text;points integer;known_weight integer;technical_points integer;total integer;
BEGIN
 IF closes IS NULL OR sessions IS NULL OR opens IS NULL OR highs IS NULL OR lows IS NULL OR index_closes IS NULL
  OR n<>240 OR cardinality(sessions)<>n OR cardinality(opens)<>n OR cardinality(highs)<>n OR cardinality(lows)<>n
  OR cardinality(index_closes)<>200 OR cutoff IS NULL OR sessions[n] IS NULL THEN RETURN NULL;END IF;
 signal_day:=sessions[n];
 FOR i IN 1..n LOOP
  IF sessions[i] IS NULL OR (i>1 AND sessions[i]<=sessions[i-1]) OR NOT public.vnext_launch_finite_v1(opens[i])
   OR NOT public.vnext_launch_finite_v1(highs[i]) OR NOT public.vnext_launch_finite_v1(lows[i]) OR NOT public.vnext_launch_finite_v1(closes[i])
   OR lows[i]<=0::double precision OR lows[i]>least(opens[i],closes[i]) OR highs[i]<greatest(opens[i],closes[i]) THEN RETURN NULL;END IF;
 END LOOP;
 FOR i IN 1..200 LOOP IF NOT public.vnext_launch_finite_v1(index_closes[i]) OR index_closes[i]<=0::double precision THEN RETURN NULL;END IF;END LOOP;
 ma50:=public.vnext_launch_mean64_v1(closes,191,50);ma200:=public.vnext_launch_mean64_v1(closes,41,200);
 prior_ma200:=public.vnext_launch_mean64_v1(closes,36,200);
 market_ma50:=public.vnext_launch_mean64_v1(index_closes,151,50);market_ma200:=public.vnext_launch_mean64_v1(index_closes,1,200);
 stock20:=public.vnext_launch_ratio64_v1(closes[240],closes[220])-1::double precision;
 stock63:=public.vnext_launch_ratio64_v1(closes[240],closes[177])-1::double precision;
 market20:=public.vnext_launch_ratio64_v1(index_closes[200],index_closes[180])-1::double precision;
 market63:=public.vnext_launch_ratio64_v1(index_closes[200],index_closes[137])-1::double precision;
 excess20:=stock20-market20;excess63:=stock63-market63;
 -- Canonical +0 at every wire operand, never an epsilon threshold repair.
 IF excess20=0 THEN excess20:=0::double precision;END IF;IF excess63=0 THEN excess63:=0::double precision;END IF;
 rules:=rules||jsonb_build_array(
  public.vnext_launch_rule_v1('trend_close_above_ma50','trendRelativeStrength',5,closes[240]>ma50,jsonb_build_object('close',closes[240],'ma50',ma50),cutoff,signal_day),
  public.vnext_launch_rule_v1('trend_ma50_above_ma200','trendRelativeStrength',5,ma50>ma200,jsonb_build_object('ma50',ma50,'ma200',ma200),cutoff,signal_day),
  public.vnext_launch_rule_v1('trend_ma200_rising_5sessions','trendRelativeStrength',5,ma200>prior_ma200,jsonb_build_object('ma200',ma200,'priorMa200',prior_ma200,'priorEndpoint',sessions[235]),cutoff,signal_day),
  public.vnext_launch_rule_v1('trend_excess_return20_positive','trendRelativeStrength',5,excess20>0::double precision,jsonb_build_object('stockReturn',stock20,'marketReturn',market20,'excessReturn',excess20),cutoff,signal_day),
  public.vnext_launch_rule_v1('trend_excess_return63_positive','trendRelativeStrength',5,excess63>0::double precision,jsonb_build_object('stockReturn',stock63,'marketReturn',market63,'excessReturn',excess63),cutoff,signal_day));
 SELECT max(value) INTO prior_high FROM unnest(highs[215:239]) q(value);
 SELECT min(value) INTO prior_low FROM unnest(lows[215:239]) q(value);
 depth:=public.vnext_launch_ratio64_v1(prior_high-prior_low,prior_high);
 distance:=public.vnext_launch_ratio64_v1(abs(prior_high-closes[240]),prior_high);
 atr5:=public.vnext_launch_atr64_v1(highs[1:239],lows[1:239],closes[1:239],5);
 atr20:=public.vnext_launch_atr64_v1(highs[1:239],lows[1:239],closes[1:239],20);
 atr_ratio:=public.vnext_launch_ratio64_v1(atr5,atr20);
 IF cardinality(technical_shares)=51 AND public.vnext_launch_integer_sum_v1(technical_shares) IS NOT NULL
  AND NOT EXISTS(SELECT FROM unnest(technical_shares) shares WHERE shares IS NULL OR shares<0) THEN
  SELECT array_agg(value::double precision ORDER BY ordinal) INTO volume64 FROM unnest(technical_shares) WITH ORDINALITY q(value,ordinal);
  recent5:=public.vnext_launch_mean64_v1(volume64,47,5);prior20:=public.vnext_launch_mean64_v1(volume64,27,20);
  volume_ratio:=public.vnext_launch_ratio64_v1(recent5,prior20);
  breakout_ratio:=public.vnext_launch_ratio64_v1(volume64[51],public.vnext_launch_mean64_v1(volume64,1,50));
 END IF;
 breakout:=(closes[240]>prior_high AND breakout_ratio>=1.4::double precision);
 -- False breakout plus absent originally-published fixed hold is UNKNOWN.
 -- No rolling high, retrospectively minted original marker, or restart window.
 match:=CASE WHEN breakout IS TRUE THEN true ELSE NULL END;
 rules:=rules||jsonb_build_array(
  public.vnext_launch_rule_v1('consolidation_depth_within15pct','consolidation',10,depth<=.15::double precision,jsonb_build_object('depth',depth),cutoff,signal_day),
  public.vnext_launch_rule_v1('consolidation_distance_within5pct','consolidation',5,distance<=.05::double precision,jsonb_build_object('distance',distance),cutoff,signal_day),
  public.vnext_launch_rule_v1('consolidation_prior_atr_ratio_within08','consolidation',5,atr_ratio<=.8::double precision,jsonb_build_object('ratio',atr_ratio,'throughSession',sessions[239]),cutoff,signal_day),
  public.vnext_launch_rule_v1('consolidation_volume_ratio_within08','consolidation',5,volume_ratio<=.8::double precision,jsonb_build_object('ratio',volume_ratio),cutoff,signal_day),
  public.vnext_launch_rule_v1('breakout_or_fixed_closing_hold','breakoutHold',20,match,jsonb_build_object('breakout',breakout,'closingHold',NULL,'originalSession',NULL,'originalLevel',NULL),cutoff,signal_day));
 IF cardinality(institutional_shares)=20 AND cardinality(foreign_shares)=20 AND cardinality(trust_shares)=20
  AND NOT EXISTS(SELECT FROM unnest(institutional_shares) shares WHERE shares IS NULL OR shares<=0) THEN
  denom5:=public.vnext_launch_integer_sum_v1(institutional_shares[16:20]);denom20:=public.vnext_launch_integer_sum_v1(institutional_shares);
 END IF;
 FOR i IN 1..4 LOOP
  net:=public.vnext_launch_integer_sum_v1(CASE i WHEN 1 THEN foreign_shares[16:20] WHEN 2 THEN foreign_shares WHEN 3 THEN trust_shares[16:20] ELSE trust_shares END);
  -- Exact signed NUMERIC aggregation FIRST; a matching safe share denominator
  -- is then converted to float8 BEFORE division and the strict comparison.
  ratio:=public.vnext_launch_ratio64_v1(net::double precision,(CASE WHEN i IN(1,3) THEN denom5 ELSE denom20 END)::double precision);
  IF EXISTS(SELECT FROM generate_series(CASE WHEN i IN(1,3) THEN 16 ELSE 1 END,20) position
   WHERE abs((CASE WHEN i IN(1,2) THEN foreign_shares[position] ELSE trust_shares[position] END)::numeric)>institutional_shares[position]::numeric) THEN ratio:=NULL;END IF;
  match:=CASE WHEN ratio IS NULL THEN NULL ELSE net>0 END;
  rules:=rules||jsonb_build_array(public.vnext_launch_rule_v1((ARRAY['chips_foreign5_positive','chips_foreign20_positive','chips_trust5_positive','chips_trust20_positive'])[i],
   'chips',5,match,jsonb_build_object('netShares',net,'volumeShares',CASE WHEN i IN(1,3) THEN denom5 ELSE denom20 END,'netVolumeRatio',ratio),cutoff,signal_day));
 END LOOP;
 rules:=rules||jsonb_build_array(
  public.vnext_launch_rule_v1('market_close_above_ma50','market',5,index_closes[200]>market_ma50,jsonb_build_object('close',index_closes[200],'ma50',market_ma50),cutoff,signal_day),
  public.vnext_launch_rule_v1('market_close_above_ma200','market',5,index_closes[200]>market_ma200,jsonb_build_object('close',index_closes[200],'ma200',market_ma200),cutoff,signal_day));
 SELECT sum(CASE WHEN r->'matches'<>'null'::jsonb THEN (r->>'weight')::integer ELSE 0 END),sum((r->>'points')::integer)
 INTO known_weight,points FROM jsonb_array_elements(rules) r;
 components:='{}'::jsonb;technical_points:=0;
 FOREACH group_name IN ARRAY ARRAY['trendRelativeStrength','consolidation','breakoutHold','chips','market'] LOOP
  SELECT CASE WHEN bool_and(r->'matches'<>'null'::jsonb) THEN sum((r->>'points')::integer) END INTO points FROM jsonb_array_elements(rules) r WHERE r->>'group'=group_name;
  components:=components||jsonb_build_object(group_name,points);
  IF group_name IN('trendRelativeStrength','consolidation','breakoutHold') THEN technical_points:=technical_points+points;END IF;
 END LOOP;
 SELECT CASE WHEN known_weight=100 THEN sum((r->>'points')::integer) END INTO total FROM jsonb_array_elements(rules) r;
 RETURN jsonb_build_object('rulesVersion','launch-radar-comparisons-v5','arithmeticVersion','binary64-v1','rules',rules,
  'availableWeight',known_weight,'totalScore',total,'technicalScore',technical_points,'relativeStrength63',excess63,'components',components);
END $$;

-- The existing owner reads its own raw price relation. No broad SELECT grant
-- or invocation of the differently bounded/log-product old adjusted helper.
CREATE FUNCTION public.vnext_launch_price_rows_internal_v1(stock uuid,market_name text,first_day date,last_day date,cutoff timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC' SET extra_float_digits=3 AS $$
DECLARE rows_json jsonb;
BEGIN
 IF stock IS NULL OR market_name NOT IN('TWSE','TPEX') OR first_day IS NULL OR last_day<first_day OR last_day-first_day>900
  OR cutoff IS NULL OR cutoff>statement_timestamp() THEN RETURN NULL;END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY session_id,source_timestamp DESC,collected_at DESC,recorded_at DESC,observation_id),'[]'::jsonb)
 INTO rows_json FROM(
  SELECT observation_id,stock_id,exchange,session_id,session_authority_id,raw_open,raw_high,raw_low,raw_close,
   provider,source_timestamp,collected_at,source_ref,recorded_at
  FROM public.opportunity_price_observations_v3 WHERE stock_id=stock AND exchange::text=market_name AND session_id BETWEEN first_day AND last_day
   AND source_timestamp<=cutoff AND collected_at<=cutoff AND recorded_at<=cutoff
  ORDER BY session_id,source_timestamp DESC,collected_at DESC,recorded_at DESC,observation_id LIMIT 24001
 ) p;
 IF jsonb_array_length(rows_json)>24000 THEN RETURN NULL;END IF;RETURN rows_json;
END $$;
ALTER FUNCTION public.vnext_launch_price_rows_internal_v1(uuid,text,date,date,timestamptz) OWNER TO opportunity_v3_rpc_owner;
REVOKE ALL ON FUNCTION public.vnext_launch_price_rows_internal_v1(uuid,text,date,date,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.vnext_launch_price_rows_internal_v1(uuid,text,date,date,timestamptz) TO stockinsider_vnext_owner;

CREATE FUNCTION public.vnext_launch_price_v1(stock uuid,target text,market_name text,calendar jsonb,cutoff timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC' SET extra_float_digits=3 AS $$
DECLARE sessions jsonb:=calendar->'sessions';raw_rows jsonb;selected_rows jsonb:='[]'::jsonb;action_rows jsonb:='[]'::jsonb;
 c jsonb;p jsonb;a jsonb;e jsonb;terms jsonb;receipt jsonb;factor double precision;adjusted jsonb:='[]'::jsonb;bar jsonb;value double precision;
 known_at timestamptz;day date;first_day date;signal_day date;i integer;j integer;
BEGIN
 IF stock IS NULL OR target!~'^[0-9]{4}$' OR market_name NOT IN('TWSE','TPEX') OR sessions IS NULL OR jsonb_array_length(sessions)<>240 THEN RETURN NULL;END IF;
 first_day:=(sessions->0->>'session_id')::date;signal_day:=(sessions->-1->>'session_id')::date;
 raw_rows:=public.vnext_launch_price_rows_internal_v1(stock,market_name,first_day,signal_day,cutoff);
 IF raw_rows IS NULL THEN RETURN NULL;END IF;known_at:=(calendar->>'knownAt')::timestamptz;
 FOR i IN 0..239 LOOP
  c:=sessions->i;day:=(c->>'session_id')::date;
  SELECT value INTO p FROM jsonb_array_elements(raw_rows) r WHERE r->>'session_id'=day::text
   ORDER BY (r->>'source_timestamp')::timestamptz DESC,(r->>'collected_at')::timestamptz DESC,(r->>'recorded_at')::timestamptz DESC,r->>'observation_id' LIMIT 1;
  IF p IS NULL OR p->>'session_authority_id'<>c->>'session_authority_id' OR p->>'provider'<>lower(market_name)
   OR p->>'source_ref' NOT LIKE lower(market_name)||'-%' OR (p->>'source_timestamp')::timestamptz<(c->>'close_at')::timestamptz
   OR (p->>'source_timestamp')::timestamptz>(p->>'collected_at')::timestamptz OR (p->>'collected_at')::timestamptz>(p->>'recorded_at')::timestamptz
   OR EXISTS(SELECT FROM jsonb_array_elements(raw_rows) other WHERE other->>'session_id'=day::text
    AND other->>'source_timestamp'=p->>'source_timestamp' AND other->>'collected_at'=p->>'collected_at' AND other->>'recorded_at'=p->>'recorded_at'
    AND other-'observation_id' IS DISTINCT FROM p-'observation_id') THEN RETURN NULL;END IF;
  IF EXISTS(SELECT FROM unnest(ARRAY['raw_open','raw_high','raw_low','raw_close']) key
   WHERE NOT public.vnext_launch_finite_v1((p->>key)::double precision) OR (p->>key)::double precision<=0)
   OR (p->>'raw_low')::double precision>least((p->>'raw_open')::double precision,(p->>'raw_close')::double precision)
   OR (p->>'raw_high')::double precision<greatest((p->>'raw_open')::double precision,(p->>'raw_close')::double precision) THEN RETURN NULL;END IF;
  known_at:=greatest(known_at,(p->>'recorded_at')::timestamptz);selected_rows:=selected_rows||jsonb_build_array(p);
  IF i>0 THEN
   a:=public.vnext_launch_action_day_v1(market_name,(c->>'session_authority_id')::uuid,day,target,cutoff);
   IF a IS NULL THEN RETURN NULL;END IF;IF a ? 'gap' THEN RETURN a;END IF;known_at:=greatest(known_at,(a->>'knownAt')::timestamptz);
   e:=a->'targetEvent';
   IF e<>'null'::jsonb THEN
    IF terms IS NULL THEN terms:=public.vnext_action_terms_current_internal_v1(stock,target,cutoff);END IF;
    SELECT value INTO receipt FROM jsonb_array_elements(terms->'receipts') r
     WHERE r->'event'->>'snapshotId'=a->>'snapshotId' AND r->'event'->'ordinal'=e->'event_ordinal';
    -- No guessed share terms/cash reinvestment, reference14790.91 is not the
    -- tick trading base14790, and an IR receipt is not this typed bridge.
    IF receipt IS NULL OR receipt->'event'->>'kind'<>'par_value_change'
     OR (receipt->'terms'->>'cashDividendPerOldShare')::numeric<>0 OR (receipt->'terms'->>'cashReturnPerOldShare')::numeric<>0
     OR (receipt->'terms'->>'subscriptionCashPerOldShare')::numeric<>0 THEN RETURN NULL;END IF;
    known_at:=greatest(known_at,(receipt->'source'->>'knownAt')::timestamptz);a:=a||jsonb_build_object('typedTermsReceipt',receipt->>'receiptHash');
   END IF;
   action_rows:=action_rows||jsonb_build_array(a);
  END IF;
 END LOOP;
 FOR i IN 0..239 LOOP
  factor:=1::double precision;
  FOR j IN i..238 LOOP
   e:=action_rows->j->'targetEvent';
   IF e IS NOT NULL AND e<>'null'::jsonb THEN factor:=factor*(e->>'daily_adjustment_factor')::double precision;END IF;
  END LOOP;
  IF NOT public.vnext_launch_finite_v1(factor) OR factor<=0 THEN RETURN NULL;END IF;
  p:=selected_rows->i;
  bar:=jsonb_build_object('session',p->'session_id','observationId',p->'observation_id','calendarId',p->'session_authority_id',
   'rawOpen',p->'raw_open','rawHigh',p->'raw_high','rawLow',p->'raw_low','rawClose',p->'raw_close','factor',factor,
   'open',(p->>'raw_open')::double precision*factor,'high',(p->>'raw_high')::double precision*factor,
   'low',(p->>'raw_low')::double precision*factor,'close',(p->>'raw_close')::double precision*factor);
  adjusted:=adjusted||jsonb_build_array(bar);
 END LOOP;
 RETURN jsonb_build_object('schemaVersion','launch-db-selected-price-v1','priceBasis','adjusted_to_signal_session',
  'anchor',signal_day,'calendarRevision',calendar->>'calendarRevision','actionsRevision',public.vnext_launch_csv_hash_v1(action_rows),
  'priceRevision',public.vnext_launch_csv_hash_v1(jsonb_build_array('launch-db-price-binary64-v1',stock,target,signal_day,cutoff,selected_rows,action_rows,adjusted)),
  'knownAt',known_at,'bars',adjusted,'actions',action_rows,'rawRows',selected_rows);
END $$;

CREATE FUNCTION public.vnext_launch_instrument_v1(target text,cutoff timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE rows_json jsonb;selected jsonb;
BEGIN
 IF target!~'^[0-9]{4}$' OR cutoff IS NULL OR cutoff>clock_timestamp() THEN RETURN NULL;END IF;
 SELECT jsonb_agg(packet ORDER BY recorded_at DESC,instrument_authority_id) INTO rows_json FROM(
  SELECT jsonb_build_object('id',instrument_authority_id,'stockId',stock_id,'symbol',symbol,'exchange',exchange,
   'instrumentType',instrument_type,'listingStatus',listing_status,'provider',provider,'rosterVersion',roster_version,
   'sourceAt',source_timestamp,'recordedAt',recorded_at,'validFrom',valid_from,'validTo',valid_to) packet,recorded_at,instrument_authority_id
  FROM public.stock_instruments_v3 WHERE symbol=target AND recorded_at<=cutoff AND source_timestamp<=cutoff
  ORDER BY recorded_at DESC,instrument_authority_id LIMIT 101
 ) bounded;
 IF rows_json IS NULL OR jsonb_array_length(rows_json)>100 THEN RETURN NULL;END IF;selected:=rows_json->0;
 IF EXISTS(SELECT FROM jsonb_array_elements(rows_json) other WHERE other->>'recordedAt'=selected->>'recordedAt'
  AND other-'id' IS DISTINCT FROM selected-'id') THEN RETURN NULL;END IF;
 -- Select the full head BEFORE checking common/active/validity. An old active
 -- listing cannot hide a newer delisted, renamed or different-instrument row.
 IF selected->>'rosterVersion'<>'tw-instrument-roster-v3.0' OR selected->>'exchange' NOT IN('TWSE','TPEX')
  OR selected->>'provider'<>lower(selected->>'exchange') OR NOT isfinite((selected->>'sourceAt')::timestamptz)
  OR NOT isfinite((selected->>'recordedAt')::timestamptz) OR NOT isfinite((selected->>'validFrom')::timestamptz)
  OR (selected->>'sourceAt')::timestamptz>(selected->>'recordedAt')::timestamptz OR (selected->>'validFrom')::timestamptz>cutoff
  OR (selected->>'validTo' IS NOT NULL AND (NOT isfinite((selected->>'validTo')::timestamptz) OR (selected->>'validTo')::timestamptz<=cutoff)) THEN RETURN NULL;END IF;
 IF EXISTS(SELECT FROM public.stock_instruments_v3 other WHERE other.stock_id=(selected->>'stockId')::uuid AND other.symbol<>target
  AND other.recorded_at<=cutoff AND other.source_timestamp<=cutoff AND other.valid_from<=cutoff AND(other.valid_to IS NULL OR other.valid_to>cutoff)) THEN RETURN NULL;END IF;
 RETURN selected;
END $$;

CREATE FUNCTION public.vnext_launch_selected_score_v1(target text,input_digest text,instrument jsonb,signal_day date,cutoff timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC' SET extra_float_digits=3 AS $$
DECLARE market_name text:=instrument->>'exchange';calendar jsonb;price jsonb;bars jsonb;cal_days jsonb;f jsonb;fact jsonb;bar jsonb;native_row jsonb;
 native_inventory jsonb:='[]'::jsonb;institutional_inventory jsonb:='[]'::jsonb;flow_inventory jsonb:='[]'::jsonb;index_inventory jsonb:='[]'::jsonb;
 technical_ok boolean:=true;institutional_ok boolean:=true;flow_ok boolean:=true;issued bigint;native_previous_issued bigint;institutional_previous_issued bigint;native_total numeric:=0;
 sessions date[]:='{}';opens double precision[]:='{}';highs double precision[]:='{}';lows double precision[]:='{}';closes double precision[]:='{}';
 technical bigint[]:='{}';denominator bigint[]:='{}';foreign_net bigint[]:='{}';trust_net bigint[]:='{}';index_close double precision[]:='{}';
 gaps jsonb:='[]'::jsonb;score jsonb;known_at timestamptz;day date;i integer;ma20_ratio double precision;waiting jsonb;
BEGIN
 IF target!~'^[0-9]{4}$' OR input_digest!~'^[a-f0-9]{64}$' OR instrument->>'symbol'<>target OR market_name NOT IN('TWSE','TPEX') THEN RETURN NULL;END IF;
 calendar:=public.vnext_launch_calendar_v1(market_name,signal_day,cutoff);
 IF calendar IS NULL THEN RETURN jsonb_build_object('complete',false,'gaps',jsonb_build_array('launch_calendar_240_annual_authority_missing'));END IF;
 price:=public.vnext_launch_price_v1((instrument->>'stockId')::uuid,target,market_name,calendar,cutoff);
 IF price IS NULL THEN RETURN jsonb_build_object('complete',false,'gaps',jsonb_build_array('launch_adjusted_price_or_typed_action_authority_missing'));END IF;
 IF price ? 'gap' THEN RETURN jsonb_build_object('complete',false,'gaps',jsonb_build_array(price->>'gap'));END IF;
 bars:=price->'bars';cal_days:=calendar->'sessions';known_at:=(price->>'knownAt')::timestamptz;
 FOR i IN 0..239 LOOP
  bar:=bars->i;day:=(bar->>'session')::date;sessions:=array_append(sessions,day);
  opens:=array_append(opens,(bar->>'open')::double precision);highs:=array_append(highs,(bar->>'high')::double precision);
  lows:=array_append(lows,(bar->>'low')::double precision);closes:=array_append(closes,(bar->>'close')::double precision);
  IF i>=40 THEN
   f:=public.vnext_launch_source_fact_v1(CASE market_name WHEN 'TPEX' THEN 11391 ELSE 11755 END,day,'INDEX',NULL,cutoff);
   IF f IS NULL OR (f->>'observedAt')::timestamptz<(cal_days->i->>'close_at')::timestamptz
    OR public.vnext_launch_binary64_v1((f->'fact'->>'raw_close')::numeric) IS NULL THEN
    RETURN jsonb_build_object('complete',false,'gaps',jsonb_build_array('launch_same_venue_index_200_missing'));END IF;
   index_close:=array_append(index_close,public.vnext_launch_binary64_v1((f->'fact'->>'raw_close')::numeric));
   index_inventory:=index_inventory||jsonb_build_array(f);known_at:=greatest(known_at,(f->>'availableAt')::timestamptz);
  END IF;
  IF i>=188 THEN
   -- Technical51 plus the immediately preceding official session. This is
   -- independent of the institutional20 denominator/continuity window.
   f:=CASE WHEN market_name='TPEX' THEN public.vnext_launch_source_fact_v1(11371,day,target,input_digest,cutoff) END;
   IF f IS NULL THEN technical_ok:=false;
   ELSE
    fact:=f->'fact';issued:=(fact->>'issued_shares')::bigint;
    IF f->>'coverage'<>'tpex_11371_report_excluding_fixed_price_v1' OR (f->>'observedAt')::timestamptz<(cal_days->i->>'close_at')::timestamptz
     OR issued IS NULL OR issued<=0 OR (i>188 AND native_previous_issued IS DISTINCT FROM issued)
     OR (fact->>'shares')::bigint IS NULL OR (fact->>'shares')::bigint<0
     OR (fact->>'raw_open')::double precision IS DISTINCT FROM (bar->>'rawOpen')::double precision
     OR (fact->>'raw_high')::double precision IS DISTINCT FROM (bar->>'rawHigh')::double precision
     OR (fact->>'raw_low')::double precision IS DISTINCT FROM (bar->>'rawLow')::double precision
     OR (fact->>'raw_close')::double precision IS DISTINCT FROM (bar->>'rawClose')::double precision
     OR (i>=189 AND (bar->>'factor')::double precision<>1::double precision) THEN technical_ok:=false;END IF;
    native_previous_issued:=issued;native_inventory:=native_inventory||jsonb_build_array(f);known_at:=greatest(known_at,(f->>'availableAt')::timestamptz);
    IF i>=189 THEN technical:=array_append(technical,(fact->>'shares')::bigint);native_total:=native_total+(fact->>'shares')::numeric;END IF;
   END IF;
  END IF;
  IF i>=220 THEN
   f:=CASE WHEN market_name='TPEX' THEN public.vnext_launch_source_fact_v1(11370,day,target,input_digest,cutoff) END;
   IF f IS NULL THEN institutional_ok:=false;
   ELSE
    fact:=f->'fact';issued:=(fact->>'issued_shares')::bigint;
    IF f->>'coverage'<>'tpex_11370_all_sessions_v1' OR (f->>'observedAt')::timestamptz<(cal_days->i->>'close_at')::timestamptz
     OR issued IS NULL OR issued<=0 OR (i>220 AND institutional_previous_issued IS DISTINCT FROM issued) OR (fact->>'shares')::bigint IS NULL OR (fact->>'shares')::bigint<=0 THEN institutional_ok:=false;END IF;
    institutional_previous_issued:=issued;denominator:=array_append(denominator,(fact->>'shares')::bigint);
    institutional_inventory:=institutional_inventory||jsonb_build_array(f);known_at:=greatest(known_at,(f->>'availableAt')::timestamptz);
   END IF;
   f:=CASE WHEN market_name='TPEX' THEN public.vnext_launch_source_fact_v1(11856,day,target,input_digest,cutoff) END;
   IF f IS NULL THEN flow_ok:=false;
   ELSE
    fact:=f->'fact';
    IF f->>'coverage'<>'tpex_11856_combined_sessions_v1' OR (f->>'observedAt')::timestamptz<(cal_days->i->>'close_at')::timestamptz
     OR fact->>'foreign_net_shares' IS NULL OR fact->>'trust_net_shares' IS NULL THEN flow_ok:=false;END IF;
    foreign_net:=array_append(foreign_net,(fact->>'foreign_net_shares')::bigint);trust_net:=array_append(trust_net,(fact->>'trust_net_shares')::bigint);
    flow_inventory:=flow_inventory||jsonb_build_array(f);known_at:=greatest(known_at,(f->>'availableAt')::timestamptz);
   END IF;
  END IF;
 END LOOP;
 -- Separate previous-issued registers preserve the independent51/20 windows.
 IF (SELECT count(DISTINCT (r->'fact'->>'issued_shares')::bigint) FROM jsonb_array_elements(native_inventory) r)<>1 THEN technical_ok:=false;END IF;
 IF cardinality(technical)<>51 OR native_total>9007199254740991 OR jsonb_array_length(native_inventory)<>52
  OR EXISTS(SELECT FROM jsonb_array_elements(price->'actions') a WHERE a->'targetEvent'<>'null'::jsonb AND (a->>'session')::date>=sessions[190]) THEN technical_ok:=false;END IF;
 IF cardinality(denominator)<>20 OR (SELECT count(DISTINCT (r->'fact'->>'issued_shares')::bigint) FROM jsonb_array_elements(institutional_inventory) r)<>1
  OR public.vnext_launch_integer_sum_v1(denominator) IS NULL
  OR EXISTS(SELECT FROM jsonb_array_elements(price->'actions') a WHERE a->'targetEvent'<>'null'::jsonb AND (a->>'session')::date>=sessions[221]) THEN institutional_ok:=false;END IF;
 IF cardinality(foreign_net)<>20 OR cardinality(trust_net)<>20 THEN flow_ok:=false;END IF;
 IF NOT technical_ok THEN gaps:=gaps||'"launch_technical_native_51_or_capital_continuity_missing"'::jsonb;technical:=NULL;END IF;
 IF NOT institutional_ok THEN gaps:=gaps||'"launch_institutional_same_scope_20_or_capital_continuity_missing"'::jsonb;denominator:=NULL;END IF;
 IF NOT flow_ok THEN gaps:=gaps||'"launch_flow_20_exact_source_missing"'::jsonb;foreign_net:=NULL;trust_net:=NULL;END IF;
 score:=public.vnext_launch_mechanical_v1(sessions,opens,highs,lows,closes,technical,index_close,foreign_net,trust_net,denominator,cutoff);
 IF score IS NULL THEN RETURN jsonb_build_object('complete',false,'gaps',jsonb_build_array('launch_rule_operands_invalid'));END IF;
 IF (score->>'availableWeight')::integer<>100 THEN gaps:=gaps||'"launch_full_100_weight_not_known"'::jsonb;END IF;
 ma20_ratio:=public.vnext_launch_ratio64_v1(closes[240],public.vnext_launch_mean64_v1(closes,221,20));
 waiting:=jsonb_build_array('launch_same_session_price_limit_authority_missing','launch_fixed_original_extension_authority_missing');
 IF ma20_ratio>1.15::double precision THEN waiting:=waiting||'"launch_ma20_extension_above_15pct"'::jsonb;END IF;
 RETURN jsonb_build_object('complete',gaps='[]'::jsonb,'gaps',gaps,'score',score,'price',price,'calendar',calendar,
  'entry',jsonb_build_object('eligible',false,'ma20Ratio',ma20_ratio,'fixedOriginalExtension',NULL,'sameSessionOnePriceLimit',NULL,'reasons',waiting),
  'technicalInventory',native_inventory,'institutionalInventory',institutional_inventory,'flowInventory',flow_inventory,'indexInventory',index_inventory,
  'knownAt',known_at,'technicalRevision',public.vnext_launch_csv_hash_v1(native_inventory),
  'institutionalRevision',public.vnext_launch_csv_hash_v1(institutional_inventory),'flowRevision',public.vnext_launch_csv_hash_v1(flow_inventory),
  'marketRevision',public.vnext_launch_csv_hash_v1(index_inventory));
END $$;

-- Independent qualification window:20 OFFICIAL sessions, not the last20
-- listed/traded stock rows. No technical240/51/share-adjustment gate is weakened
-- or borrowed. This private getter is owned by the existing authority owner.
CREATE FUNCTION public.vnext_launch_cash_calendar_internal_v1(target text,stock uuid,venue text,signal_day date,cutoff timestamptz,observed_at timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC' AS $$
DECLARE identities jsonb;rows_json jsonb;heads jsonb;current_rows jsonb;current_heads jsonb;sessions jsonb;annual jsonb;annual_current jsonb;first_day date;day date;c jsonb;a jsonb;known_at timestamptz;
BEGIN
 IF target IS NULL OR target!~'^[0-9]{4}$' OR stock IS NULL OR venue IS NULL OR venue NOT IN('TWSE','TPEX') OR signal_day IS NULL OR cutoff IS NULL
  OR observed_at IS NULL OR cutoff>observed_at OR observed_at>clock_timestamp() THEN RETURN NULL;END IF;
 SELECT jsonb_agg(to_jsonb(r) ORDER BY recorded_at,instrument_authority_id) INTO identities FROM(
  SELECT instrument_authority_id,stock_id,symbol,exchange,source_timestamp,recorded_at FROM public.stock_instruments_v3 WHERE symbol=target
   AND recorded_at<=observed_at AND source_timestamp<=observed_at ORDER BY recorded_at DESC,instrument_authority_id LIMIT 1001
 ) r;
 IF identities IS NULL OR jsonb_array_length(identities)>1000 OR EXISTS(SELECT FROM jsonb_array_elements(identities) r
  WHERE r->>'stock_id' IS DISTINCT FROM stock::text OR r->>'exchange' IS DISTINCT FROM venue
   OR NOT isfinite((r->>'source_timestamp')::timestamptz) OR NOT isfinite((r->>'recorded_at')::timestamptz)
   OR (r->>'source_timestamp')::timestamptz>(r->>'recorded_at')::timestamptz) THEN RETURN NULL;END IF;
 SELECT jsonb_agg(to_jsonb(r) ORDER BY session_id,recorded_at DESC,session_authority_id) INTO rows_json FROM(
  SELECT * FROM public.tw_trading_sessions_v3 WHERE market::text=venue AND session_id BETWEEN signal_day-180 AND signal_day
   AND source_timestamp<=cutoff AND collected_at<=cutoff AND recorded_at<=cutoff
  ORDER BY session_id DESC,recorded_at DESC,session_authority_id LIMIT 12001
 ) r;
 IF rows_json IS NULL OR jsonb_array_length(rows_json)>12000 THEN RETURN NULL;END IF;
 IF EXISTS(WITH ranked AS(SELECT value,dense_rank() OVER(PARTITION BY value->>'session_id' ORDER BY (value->>'recorded_at')::timestamptz DESC) priority
  FROM jsonb_array_elements(rows_json)) SELECT FROM ranked WHERE priority=1 GROUP BY value->>'session_id' HAVING count(DISTINCT(value-'session_authority_id'))>1) THEN RETURN NULL;END IF;
 SELECT jsonb_agg(value ORDER BY value->>'session_id') INTO heads FROM(
  SELECT DISTINCT ON(value->>'session_id') value FROM jsonb_array_elements(rows_json)
  ORDER BY value->>'session_id',(value->>'recorded_at')::timestamptz DESC,value->>'session_authority_id'
 ) selected;
 SELECT jsonb_agg(value ORDER BY value->>'session_id') INTO sessions FROM(
  SELECT value FROM jsonb_array_elements(heads) WHERE value->>'status'='completed' AND (value->>'close_at')::timestamptz<=cutoff
  ORDER BY value->>'session_id' DESC LIMIT 20
 ) selected;
 IF sessions IS NULL OR jsonb_array_length(sessions)<>20 OR sessions->-1->>'session_id'<>signal_day::text THEN RETURN NULL;END IF;
 first_day:=(sessions->0->>'session_id')::date;
 -- A later official cancellation/correction cannot silently keep the older
 -- cash-window negative current. It may demote to UNKNOWN, never backfill cash.
 SELECT jsonb_agg(to_jsonb(r) ORDER BY session_id,recorded_at DESC,session_authority_id) INTO current_rows FROM(
  SELECT * FROM public.tw_trading_sessions_v3 WHERE market::text=venue AND session_id BETWEEN first_day AND signal_day
   AND source_timestamp<=observed_at AND collected_at<=observed_at AND recorded_at<=observed_at
  ORDER BY session_id DESC,recorded_at DESC,session_authority_id LIMIT 12001
 ) r;
 IF current_rows IS NULL OR jsonb_array_length(current_rows)>12000 THEN RETURN NULL;END IF;
 IF EXISTS(WITH ranked AS(SELECT value,dense_rank() OVER(PARTITION BY value->>'session_id' ORDER BY (value->>'recorded_at')::timestamptz DESC) priority
  FROM jsonb_array_elements(current_rows)) SELECT FROM ranked WHERE priority=1 GROUP BY value->>'session_id' HAVING count(DISTINCT(value-'session_authority_id'))>1) THEN RETURN NULL;END IF;
 SELECT jsonb_agg(value ORDER BY value->>'session_id') INTO current_heads FROM(
  SELECT DISTINCT ON(value->>'session_id') value FROM jsonb_array_elements(current_rows)
  ORDER BY value->>'session_id',(value->>'recorded_at')::timestamptz DESC,value->>'session_authority_id'
 ) selected;
 IF current_heads IS DISTINCT FROM(SELECT jsonb_agg(value ORDER BY value->>'session_id') FROM jsonb_array_elements(heads)
  WHERE (value->>'session_id')::date>=first_day) THEN RETURN NULL;END IF;
 annual:=public.vnext_launch_annual_rows_internal_v1(venue,first_day,signal_day,cutoff);
 IF annual IS NULL OR jsonb_array_length(annual)=0 THEN RETURN NULL;END IF;
 annual_current:=public.vnext_launch_annual_rows_internal_v1(venue,first_day,signal_day,observed_at);
 IF annual_current IS DISTINCT FROM annual THEN RETURN NULL;END IF;
 FOR day IN SELECT generate_series(first_day,signal_day,interval '1 day')::date LOOP
  SELECT value INTO c FROM jsonb_array_elements(heads) r WHERE r->>'session_id'=day::text;
  SELECT value INTO a FROM jsonb_array_elements(annual) r WHERE r->'row'->>'session'=day::text
   ORDER BY (r->>'knownAt')::timestamptz DESC,r->>'jobId' LIMIT 1;
  IF c IS NOT NULL AND(c->>'provider'<>lower(venue) OR c->>'status' NOT IN('completed','cancelled')
   OR (c->>'source_timestamp')::timestamptz>(c->>'collected_at')::timestamptz OR (c->>'collected_at')::timestamptz>(c->>'recorded_at')::timestamptz
   OR (c->>'open_at')::timestamptz>=(c->>'close_at')::timestamptz OR ((c->>'close_at')::timestamptz AT TIME ZONE 'Asia/Taipei')::date<>day) THEN RETURN NULL;END IF;
  IF c->>'status'='cancelled' THEN CONTINUE;END IF;
  IF a IS NULL THEN IF c IS NULL AND extract(isodow FROM day) IN(6,7) THEN CONTINUE;ELSE RETURN NULL;END IF;END IF;
  IF EXISTS(SELECT FROM jsonb_array_elements(annual) other WHERE other->'row'->>'session'=day::text AND other->>'knownAt'=a->>'knownAt' AND other->'row' IS DISTINCT FROM a->'row') THEN RETURN NULL;END IF;
  IF coalesce((a->'row'->>'provider'<>lower(venue) OR a->'row'->>'sourceSha256'!~'^[a-f0-9]{64}$'
   OR a->'row'->>'sourceRef'<>lower(venue)||'-annual-calendar:'||extract(year FROM day)::integer::text||':'||day::text||':'||(a->'row'->>'sourceSha256')
   OR a->'row'->>'sourceUrl'<>CASE venue WHEN 'TWSE' THEN 'https://www.twse.com.tw/rwd/zh/holidaySchedule/holidaySchedule?response=json&date='||extract(year FROM day)::integer::text||'0101'
    ELSE 'https://www.tpex.org.tw/storage/zh-tw/web/bulletin/trading_date/trading_date_'||(extract(year FROM day)::integer-1911)::text||'.htm' END
   OR NOT(a->'row'->>'status' IN('completed','holiday')) OR (a->'row'->>'sourceTimestamp')::timestamptz>(a->'row'->>'collectedAt')::timestamptz
   OR (a->'row'->>'collectedAt')::timestamptz>(a->>'knownAt')::timestamptz
   OR (a->'row'->>'status'='completed') IS DISTINCT FROM(c IS NOT NULL AND c->>'status'='completed')),true) THEN RETURN NULL;END IF;
 END LOOP;
 SELECT greatest(max((r->>'recorded_at')::timestamptz),(SELECT max((a->>'knownAt')::timestamptz) FROM jsonb_array_elements(annual) a)) INTO known_at FROM jsonb_array_elements(sessions) r;
 RETURN jsonb_build_object('sessions',sessions,'annual',annual,'identityRows',identities,'knownAt',known_at,
  'identityKnownAt',(SELECT max(greatest((r->>'source_timestamp')::timestamptz,(r->>'recorded_at')::timestamptz)) FROM jsonb_array_elements(identities) r),'identityRevision',public.vnext_launch_csv_hash_v1(identities),
  'calendarRevision',public.vnext_launch_csv_hash_v1(jsonb_build_array('launch-qualification-official20-v1',venue,signal_day,cutoff,sessions,annual)));
END $$;

CREATE FUNCTION public.vnext_launch_rank_preflight_v1(target text,input_digest text,signal_day date,cutoff timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC' AS $$
DECLARE at timestamptz:=clock_timestamp();member public.vnext_members_v1;current_instrument jsonb;frozen_instrument jsonb;invalidity jsonb;calendar jsonb;
 c jsonb;f jsonb;current_fact jsonb;inventory jsonb:='[]'::jsonb;sum_ntd numeric:=0;cash_known boolean:=true;identity_known boolean:=false;
 outcome text:='unknown';reason text;scope text;known_at timestamptz;cash_known_at timestamptz;identity_known_at timestamptz;venue text;reasons jsonb:='[]'::jsonb;basis jsonb;result jsonb;
BEGIN
 IF target IS NULL OR target!~'^[0-9]{4}$' OR input_digest IS NULL OR input_digest!~'^[a-f0-9]{64}$' OR signal_day IS NULL OR cutoff IS NULL OR cutoff>at THEN RETURN NULL;END IF;
 SELECT * INTO member FROM public.vnext_members_v1 WHERE symbol=target;
 IF member.symbol IS NULL OR member.state='exited' OR member.input_hash IS DISTINCT FROM input_digest THEN RETURN NULL;END IF;
 current_instrument:=public.vnext_launch_instrument_v1(target,at);frozen_instrument:=public.vnext_launch_instrument_v1(target,cutoff);
 IF current_instrument IS NOT NULL THEN
  IF current_instrument->>'instrumentType'<>'common_stock' THEN reason:='non_ordinary';scope:='current_venue';
  ELSIF current_instrument->>'listingStatus' IN('suspended','delisted') THEN
   invalidity:=public.vnext_trading_invalid_current_v1(target,input_digest);
   IF invalidity->>'schemaVersion'='stockinsider-vnext-trading-invalidity-v1' AND invalidity->>'symbol'=target AND invalidity->>'inputHash'=input_digest
    AND invalidity->'instrument'->>'instrument_authority_id'=current_instrument->>'id'
    AND invalidity->>'proofHash'=public.vnext_launch_csv_hash_v1(invalidity-'proofHash') THEN reason:=current_instrument->>'listingStatus';scope:='current_venue';END IF;
  END IF;
  IF reason IS NOT NULL THEN known_at:=greatest((current_instrument->>'recordedAt')::timestamptz,(current_instrument->>'sourceAt')::timestamptz);END IF;
  identity_known:=frozen_instrument IS NOT NULL AND current_instrument->>'stockId'=frozen_instrument->>'stockId'
   AND current_instrument->>'exchange'=frozen_instrument->>'exchange' AND current_instrument->>'instrumentType'='common_stock';
 END IF;
 -- Cash20 is independently attempted before folding UNKNOWN. A known low cash
 -- gate may reject this candidate even with missing unrelated original/CA/score
 -- evidence. Missing identity cannot choose a convenient old TPEX venue.
 venue:=CASE WHEN identity_known THEN current_instrument->>'exchange' END;
 IF venue='TPEX' THEN
  calendar:=public.vnext_launch_cash_calendar_internal_v1(target,(current_instrument->>'stockId')::uuid,venue,signal_day,cutoff,at);
  IF calendar IS NULL OR (current_instrument->>'validFrom')::timestamptz>(calendar->'sessions'->0->>'open_at')::timestamptz
   OR (frozen_instrument->>'validFrom')::timestamptz>(calendar->'sessions'->0->>'open_at')::timestamptz THEN cash_known:=false;
  ELSE
   FOR c IN SELECT value FROM jsonb_array_elements(calendar->'sessions') LOOP
    f:=public.vnext_launch_source_fact_v1(11370,(c->>'session_id')::date,target,input_digest,cutoff);
    IF f IS NULL OR f->>'datasetId' IS DISTINCT FROM '11370' OR f->>'coverage' IS DISTINCT FROM 'tpex_11370_all_sessions_v1' OR f->'fact'->>'traded_ntd' IS NULL
     OR (f->'fact'->>'traded_ntd')::numeric<0 OR (f->>'observedAt')::timestamptz<(c->>'close_at')::timestamptz THEN cash_known:=false;EXIT;END IF;
    -- Later correction/withdrawal may invalidate this cutoff operand, but
    -- cannot replace it with a newly captured postcutoff cash measurement.
    current_fact:=public.vnext_launch_source_fact_v1(11370,(c->>'session_id')::date,target,input_digest,at);
    IF current_fact IS DISTINCT FROM f THEN cash_known:=false;EXIT;END IF;
    sum_ntd:=sum_ntd+(f->'fact'->>'traded_ntd')::numeric;
    inventory:=inventory||jsonb_build_array(jsonb_build_object('source',f,'calendarId',c->>'session_authority_id'));
   END LOOP;
   IF jsonb_array_length(inventory)<>20 THEN cash_known:=false;END IF;
  END IF;
 ELSE cash_known:=false;END IF;
 IF reason IS NULL AND cash_known AND sum_ntd<1000000000::numeric THEN
  reason:='illiquid';scope:='cutoff_liquidity';
  SELECT greatest((calendar->>'knownAt')::timestamptz,(frozen_instrument->>'recordedAt')::timestamptz,(frozen_instrument->>'sourceAt')::timestamptz,max((r->'source'->>'availableAt')::timestamptz)) INTO cash_known_at FROM jsonb_array_elements(inventory) r;
  identity_known_at:=greatest((current_instrument->>'recordedAt')::timestamptz,(current_instrument->>'sourceAt')::timestamptz,(calendar->>'identityKnownAt')::timestamptz);
  known_at:=greatest(cash_known_at,identity_known_at);
 END IF;
 IF reason IS NOT NULL THEN outcome:='known_reject';reasons:=jsonb_build_array('launch_qualification_'||reason);
 ELSE
  IF NOT identity_known THEN reasons:=reasons||'"launch_qualification_identity_unknown"'::jsonb;END IF;
  IF NOT cash_known THEN reasons:=reasons||'"launch_qualification_cash20_unknown"'::jsonb;END IF;
  -- No typed29082/11677 producer is installed by this change. An active roster
  -- or trading_invalid deferred response is NOT positive disposition coverage.
  reasons:=reasons||'"launch_positive_disposition_coverage_producer_not_connected"'::jsonb;
 END IF;
 basis:=jsonb_build_object('schemaVersion','launch-rank-preflight-v1','outcome',outcome,'symbol',target,'inputHash',input_digest,'signalSession',signal_day,'inputCutoff',cutoff,
  'reason',reason,'knowledgeScope',scope,'knownAt',known_at,'cashKnownAt',cash_known_at,'currentIdentityKnownAt',identity_known_at,'instrument',current_instrument,'frozenInstrument',frozen_instrument,
  'invalidity',invalidity,'cashCalendar',calendar,'cashCurrency','TWD','cashCoverage','tpex_11370_all_sessions_v1','cashKnown',cash_known,'cashTotalNtd',CASE WHEN cash_known THEN sum_ntd END,'cashInventory',inventory,
  'calendarRevision',calendar->>'calendarRevision','identityRevision',calendar->>'identityRevision','reasons',reasons);
 -- Checked/expiry clocks are intentionally OUTSIDE the stable state digest.
 result:=basis||jsonb_build_object('classificationDigest',public.vnext_launch_csv_hash_v1(basis),'checkedAt',at,'expiresAt',at+interval '90 seconds');
 RETURN result;
END $$;

-- Public links are a separate current-rights projection. Neither an arbitrary
-- research citation, a safe hostname nor a matching hash grants public rights.
CREATE FUNCTION public.vnext_launch_public_citations_v1(score_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT coalesce(jsonb_agg(packet ORDER BY dataset_id,capture_id),'[]'::jsonb) FROM(
  SELECT DISTINCT ON(c.dataset_id) c.dataset_id,c.capture_id,jsonb_build_object('id','licensed-dataset:'||c.dataset_id::text||':'||c.capture_id::text,
   'url','https://data.gov.tw/dataset/'||c.dataset_id::text,'contentHash',c.artifact_hash,'sourceRevision',c.capture_id,
   'publicRights',jsonb_build_object('schemaVersion','launch-public-rights-v1','datasetId',c.dataset_id,
    'license','Taiwan Open Government Data License 1.0','licenseUrl','https://data.gov.tw/license',
    'attribution','Securities and Futures Bureau, Financial Supervisory Commission','rightsRevision',c.rights_binding_hash)) packet
  FROM public.vnext_launch_score_source_pins_v1 pin JOIN public.vnext_launch_csv_captures_v1 c USING(capture_id)
  JOIN public.vnext_source_policies_v1 policy ON policy.source='official' AND policy.scope='official_original' AND policy.enabled
   AND policy.valid_until>statement_timestamp() AND public.vnext_launch_csv_hash_v1(to_jsonb(policy))=c.rights_binding_hash
  WHERE pin.score_revision=score_id AND c.dataset_id IN(11370,11371,11856,11391,11755)
   AND c.source_url=public.vnext_launch_csv_profile_v1(c.dataset_id,c.request_key)->>'sourceUrl'
  -- At most one representative immutable capture per licensed dataset. All
  -- consumed captures remain privately FK-pinned; this is not a full raw index.
  ORDER BY c.dataset_id,c.observed_at DESC,c.capture_id
 ) allowed
$$;

-- This is deliberately three-valued. The existing roster proves an identity
-- and may prove suspension/delisting; its absence of a negative is NOT a
-- positive disposition/suspension coverage manifest. No boolean/GUC/HTTP field
-- fills that missing producer. Source gaps are publication blockers, not exits.
CREATE FUNCTION public.vnext_launch_qualification_checks_v1(target text,research_id uuid,input_digest text,selected jsonb,cutoff timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC' AS $$
DECLARE publication public.vnext_publications_v1;member public.vnext_members_v1;job public.vnext_jobs_v1;instrument jsonb;
 formal jsonb;review_ok boolean;rights_ok boolean;price_ok boolean;source_ok boolean;liquidity_ok boolean;venue_ok boolean;
 total_ntd numeric:=0;row_item jsonb;checks jsonb;reasons jsonb:='[]'::jsonb;at timestamptz:=statement_timestamp();official_rights text;
BEGIN
 SELECT * INTO publication FROM public.vnext_publications_v1 WHERE revision_id=research_id AND symbol=target AND input_hash=input_digest;
 SELECT * INTO member FROM public.vnext_members_v1 WHERE symbol=target;
 SELECT * INTO job FROM public.vnext_jobs_v1 WHERE job_id=publication.job_id;
 formal:=public.vnext_business_criteria_current_v1(research_id,input_digest);
 review_ok:=formal IS NOT NULL AND publication.published_at<=cutoff AND job.sources_read_at<=cutoff
  AND member.state<>'exited' AND member.contraindication IS FALSE AND member.input_hash=input_digest
  AND NOT EXISTS(SELECT FROM public.vnext_jobs_v1 pending WHERE pending.symbol=target AND pending.state IN('queued','running','authored','reviewing'))
  AND NOT EXISTS(SELECT FROM public.vnext_provider_invocations_v1 unresolved JOIN public.vnext_jobs_v1 j USING(job_id)
   WHERE j.symbol=target AND unresolved.state IN('dispatching','pending','uncertain'));
 SELECT public.vnext_launch_csv_hash_v1(to_jsonb(policy)) INTO official_rights FROM public.vnext_source_policies_v1 policy
  WHERE source='official' AND scope='official_original' AND enabled AND valid_until>at;
 rights_ok:=publication.revision_id IS NOT NULL AND public.vnext_input_sources_current_v1(member.evidence,target) IS TRUE
  AND official_rights IS NOT NULL AND NOT EXISTS(SELECT FROM jsonb_array_elements(selected->'technicalInventory'||selected->'institutionalInventory'||selected->'flowInventory'||selected->'indexInventory') item
   WHERE item->>'rightsRevision' IS DISTINCT FROM official_rights);
 -- Licensed price/flow facts and a provider-approved research artifact do not
 -- prove a launch-original source. The old source checker exempts
 -- official items and its horizons are different. Until the actual typed
 -- extraction/review/catalyst producer is connected, keep this NULL; no source
 -- hostname, business annotation, market receipt or JSON flag can fill it.
 -- A six-month catalyst requires validation ONLY WHEN ASSERTED; pure momentum
 -- can represent not_asserted/not_applicable and never needs a made-up catalyst.
 source_ok:=NULL;
 reasons:=reasons||'"launch_original_source_producer_not_connected"'::jsonb;
 price_ok:=selected->'price'->>'priceBasis'='adjusted_to_signal_session' AND selected->'price'->>'anchor'=selected->'calendar'->'sessions'->-1->>'session_id';
 instrument:=public.vnext_launch_instrument_v1(target,at);
 IF instrument IS NULL THEN reasons:=reasons||'"launch_current_instrument_unknown"'::jsonb;
 ELSIF instrument->>'instrumentType'<>'common_stock' OR instrument->>'listingStatus' IN('suspended','delisted') THEN venue_ok:=false;
 ELSE reasons:=reasons||'"launch_positive_disposition_coverage_producer_not_connected"'::jsonb;END IF;
 -- Complete20 same-coverage turnover, not old20M admission or technical11371
 -- amount. Use exact integer facts and threshold sum>=20*50M, without losing
 -- integer precision to a fractional display average.
 IF jsonb_array_length(selected->'institutionalInventory')=20 THEN
  FOR row_item IN SELECT value FROM jsonb_array_elements(selected->'institutionalInventory') LOOP
   IF row_item->>'coverage'<>'tpex_11370_all_sessions_v1' OR row_item->'fact'->>'traded_ntd' IS NULL THEN total_ntd:=NULL;EXIT;END IF;
   total_ntd:=total_ntd+(row_item->'fact'->>'traded_ntd')::numeric;
  END LOOP;
  liquidity_ok:=total_ntd>=1000000000::numeric;
 END IF;
 checks:=jsonb_build_object('rights',rights_ok,'review',review_ok,'venue',venue_ok,'liquidity',liquidity_ok,
  'price',price_ok,'actions',price_ok,'source',source_ok,'completeWeight',(selected->'score'->>'availableWeight')::integer=100);
 IF EXISTS(SELECT FROM jsonb_each(checks) c WHERE c.value IS DISTINCT FROM 'true'::jsonb) THEN reasons:=reasons||'"launch_current_qualification_incomplete"'::jsonb;END IF;
 RETURN jsonb_build_object('qualified',NOT EXISTS(SELECT FROM jsonb_each(checks) c WHERE c.value IS DISTINCT FROM 'true'::jsonb),
  'checks',checks,'reasons',reasons,'checkedAt',at,'expiresAt',at+interval '90 seconds','instrument',instrument);
END $$;

CREATE FUNCTION public.vnext_launch_write_receipt_v1(requested uuid,actual uuid,did_publish boolean,reason_code text,is_replay boolean DEFAULT false) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('schemaVersion','vnext-launch-ranking-write-v2','policyVersion','stockinsider-launch-radar-v1',
  'rulesVersion','launch-radar-comparisons-v5','arithmeticVersion','binary64-v1','published',did_publish,'retained',NOT did_publish,
  'reason',CASE WHEN did_publish THEN NULL ELSE reason_code END,'rankingRunId',actual,'requestRunId',requested,
  'replay',is_replay,'historicalReceipt',is_replay)
$$;

CREATE FUNCTION public.vnext_launch_ranking_command_v1(p_principal text,p_lease_owner uuid,p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC' SET extra_float_digits=3 SET statement_timeout='30s' SET lock_timeout='2s' AS $$
DECLARE requested uuid;expected uuid;request_digest text;prior public.vnext_launch_ranking_snapshots_v1;replay public.vnext_launch_ranking_snapshots_v1;
 mode public.vnext_launch_ranking_mode_v1;backend jsonb;context jsonb;cutoff timestamptz;day date;at timestamptz;
 member public.vnext_members_v1;publication public.vnext_publications_v1;instrument jsonb;selected jsonb;qualification jsonb;
 preflight jsonb;fresh_preflight jsonb;preflights jsonb:='[]'::jsonb;exclusions jsonb:='[]'::jsonb;exclusion_id uuid;
 score_id uuid;qualification_id uuid;revisions jsonb;scored jsonb:='[]'::jsonb;candidates jsonb:='[]'::jsonb;changes jsonb:='[]'::jsonb;
 packet jsonb;item jsonb;old_item jsonb;market jsonb;market_revision text;document jsonb;ranked jsonb;score_rules jsonb;pool_revision text;count_active integer;bound_scored jsonb:='[]'::jsonb;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'launch_ranking_read_committed_required';END IF;
 IF jsonb_typeof(p_request) IS DISTINCT FROM 'object' OR NOT(p_request ?& ARRAY['rankingRunId','expectedPreviousRankingRunId'])
  OR (SELECT count(*) FROM jsonb_object_keys(p_request))<>2
  OR coalesce(p_request->>'rankingRunId','')!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  OR (p_request->'expectedPreviousRankingRunId'<>'null'::jsonb AND coalesce(p_request->>'expectedPreviousRankingRunId','')!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$')
  THEN RAISE EXCEPTION 'launch_ranking_closed_ids_required';END IF;
 requested:=(p_request->>'rankingRunId')::uuid;expected:=(p_request->>'expectedPreviousRankingRunId')::uuid;
 PERFORM pg_advisory_xact_lock(610091002);PERFORM pg_advisory_xact_lock(2409,6002);PERFORM pg_advisory_xact_lock(64221022);
 backend:=public.vnext_launch_csv_backend_v1(p_lease_owner);PERFORM public.vnext_launch_csv_policy_v1(p_principal);
 SELECT * INTO mode FROM public.vnext_launch_ranking_mode_v1 WHERE singleton;
 IF NOT mode.enabled OR mode.required_writer_release IS DISTINCT FROM backend->>'writerRelease' THEN RAISE EXCEPTION 'launch_ranking_reviewed_mode_required';END IF;
 request_digest:=public.vnext_launch_csv_hash_v1(jsonb_build_object('principal',p_principal,'policy',mode.policy_version,'rules',mode.rules_version,'arithmetic',mode.arithmetic_version,'request',p_request));
 SELECT * INTO replay FROM public.vnext_launch_ranking_snapshots_v1 WHERE ranking_run_id=requested;
 IF replay.ranking_run_id IS NOT NULL THEN
  IF replay.request_hash<>request_digest THEN RAISE EXCEPTION 'launch_ranking_idempotency_conflict';END IF;
  -- No qualification append, provider/quota work, refreshed cutoff or newtime.
  RETURN public.vnext_launch_write_receipt_v1(requested,requested,true,NULL,true);
 END IF;
 SELECT * INTO prior FROM public.vnext_launch_ranking_snapshots_v1 ORDER BY ordinal DESC LIMIT 1;
 IF prior.ranking_run_id IS DISTINCT FROM expected THEN RAISE EXCEPTION 'launch_ranking_compare_and_swap_conflict';END IF;
 context:=public.vnext_launch_cycle_context_v1(p_principal);
 IF context->>'ready' IS DISTINCT FROM 'true' THEN RETURN public.vnext_launch_write_receipt_v1(requested,prior.ranking_run_id,false,context->>'reason');END IF;
 day:=(context->>'session')::date;cutoff:=(context->>'cutoff')::timestamptz;
 IF prior.input_cutoff>=cutoff THEN RETURN public.vnext_launch_write_receipt_v1(requested,prior.ranking_run_id,false,'launch_cutoff_already_frozen');END IF;
 market:=public.vnext_launch_market_context_v1(day,cutoff);
 IF market IS NULL OR market->>'complete' IS DISTINCT FROM 'true' OR market->>'session'<>day::text OR market->>'continuity' IS DISTINCT FROM 'true'
  OR EXISTS(SELECT FROM unnest(ARRAY['session','snapshotHash','sourceAt','expiresAt','risk']) key WHERE jsonb_typeof(market->key) IS DISTINCT FROM 'string')
  OR coalesce(market->>'snapshotHash','')!~'^[a-f0-9]{64}$' OR (market->>'sourceAt')::timestamptz>cutoff OR (market->>'expiresAt')::timestamptz<=statement_timestamp()
  OR coalesce(market->>'risk','') NOT IN('risk_on','selective','risk_off','breakdown')
  OR jsonb_typeof(market->'provenance') IS DISTINCT FROM 'array' OR jsonb_array_length(market->'provenance')=0
  OR jsonb_typeof(market->'gaps') IS DISTINCT FROM 'array'
  OR EXISTS(SELECT FROM jsonb_array_elements_text(market->'gaps') gap WHERE gap NOT LIKE 'overseas_unavailable:%' AND gap NOT LIKE 'supplemental_unavailable:%')
  THEN RETURN public.vnext_launch_write_receipt_v1(requested,prior.ranking_run_id,false,'launch_market_520_current_authority_incomplete');END IF;
 market_revision:=market->>'snapshotHash';pool_revision:=public.vnext_launch_csv_hash_v1(public.vnext_launch_csv_pool_v1());
 SELECT count(*) INTO count_active FROM public.vnext_members_v1 WHERE state<>'exited';
 IF count_active>20 THEN RAISE EXCEPTION 'launch_existing_active_pool_bound';END IF;
 FOR member IN SELECT * FROM public.vnext_members_v1 WHERE state<>'exited' ORDER BY symbol LOOP
  -- Independent hard negatives precede publication/fullscore/unknown folding.
  -- A proved exclusion is a waiting snapshot observation, NEVER a pool exit.
  preflight:=public.vnext_launch_rank_preflight_v1(member.symbol,member.input_hash,day,cutoff);
  IF preflight IS NULL THEN RETURN public.vnext_launch_write_receipt_v1(requested,prior.ranking_run_id,false,'launch_active_preflight_unknown');END IF;
  preflights:=preflights||jsonb_build_array(preflight);
  IF preflight->>'outcome'='known_reject' THEN
   exclusions:=exclusions||jsonb_build_array(preflight);
   candidates:=candidates||jsonb_build_array(jsonb_build_object('symbol',member.symbol,'state','waiting','reasons',preflight->'reasons'));CONTINUE;
  END IF;
  -- No known rejection is NOT approval. Existing fullscore/formal/source/venue
  -- checks below must still resolve every required field positively.
  instrument:=public.vnext_launch_instrument_v1(member.symbol,cutoff);
  -- Do not filter a missing candidate and thereby publish an artificialTop0,
  -- partial ranking, freshdate or a different competitor's apparentlyfull run.
  IF instrument IS NULL THEN RETURN public.vnext_launch_write_receipt_v1(requested,prior.ranking_run_id,false,'launch_active_instrument_unknown');END IF;
  SELECT * INTO publication FROM public.vnext_publications_v1 WHERE symbol=member.symbol AND input_hash=member.input_hash AND published_at<=cutoff ORDER BY published_at DESC,revision_id DESC LIMIT 1;
  IF publication.revision_id IS NULL THEN RETURN public.vnext_launch_write_receipt_v1(requested,prior.ranking_run_id,false,'launch_formal_research_not_available_at_cutoff');END IF;
  selected:=public.vnext_launch_selected_score_v1(member.symbol,member.input_hash,instrument,day,cutoff);
  IF selected IS NULL OR selected->>'complete' IS DISTINCT FROM 'true' THEN
   RETURN public.vnext_launch_write_receipt_v1(requested,prior.ranking_run_id,false,'launch_active_source_or_full_weight_incomplete');END IF;
  selected:=selected||jsonb_build_object('marketContext520',market);
  qualification:=public.vnext_launch_qualification_checks_v1(member.symbol,publication.revision_id,member.input_hash,selected,cutoff);
  IF qualification->>'qualified' IS DISTINCT FROM 'true' THEN
   RETURN public.vnext_launch_write_receipt_v1(requested,prior.ranking_run_id,false,'launch_active_current_qualification_incomplete');END IF;
  score_id:=gen_random_uuid();qualification_id:=gen_random_uuid();
  revisions:=jsonb_build_object('research',publication.revision_id,'score',score_id,'qualification',qualification_id,
   'price',selected->'price'->>'priceRevision','calendar',selected->'calendar'->>'calendarRevision','actions',selected->'price'->>'actionsRevision',
   'technicalVolume',selected->>'technicalRevision','institutionalVolume',selected->>'institutionalRevision','flow',selected->>'flowRevision','market',market_revision);
  SELECT jsonb_agg(value||jsonb_build_object('revisions',revisions) ORDER BY ordinal) INTO score_rules FROM jsonb_array_elements(selected->'score'->'rules') WITH ORDINALITY q(value,ordinal);
  packet:=jsonb_build_object('symbol',member.symbol,'revisionId',publication.revision_id,'inputHash',member.input_hash,'scoreRevision',score_id,
   'launchQualificationRevision',qualification_id,'totalScore',selected->'score'->'totalScore','availableWeight',100,
   'technicalScore',selected->'score'->'technicalScore','relativeStrength63',selected->'score'->'relativeStrength63',
   'components',selected->'score'->'components','entryEligible',selected->'entry'->>'eligible'='true' AND market->>'risk' IN('risk_on','selective'),'reasons',selected->'entry'->'reasons',
   'revisions',revisions,'financial',NULL,'valuation',NULL);
  IF market->>'risk' IN('risk_off','breakdown') THEN packet:=packet||jsonb_build_object('reasons',packet->'reasons'||'"launch_market_wait"'::jsonb);END IF;
  -- Defer all durable appends until EVERY active member has a complete result.
  scored:=scored||jsonb_build_array(jsonb_build_object('packet',packet,'selected',selected,'qualification',qualification,'rules',score_rules));
  candidates:=candidates||jsonb_build_array(jsonb_build_object('symbol',member.symbol,'state',CASE WHEN packet->>'entryEligible'='true' THEN 'eligible' ELSE 'waiting' END,'reasons',packet->'reasons'));
 END LOOP;
 -- One public market reference binds BOTH the genuine520 context and every
 -- member's own-venue200 operands. An index series is never interchangeable
 -- merely because the displayed date or old market cache hash agrees.
 market_revision:=public.vnext_launch_csv_hash_v1(jsonb_build_array('launch-market-selected-binary64-v1',market_revision,
  (SELECT coalesce(jsonb_agg(jsonb_build_array(q->'packet'->>'symbol',q->'selected'->>'marketRevision') ORDER BY q->'packet'->>'symbol'),'[]'::jsonb) FROM jsonb_array_elements(scored) q)));
 FOR item IN SELECT value FROM jsonb_array_elements(scored) LOOP
  PERFORM public.vnext_launch_csv_backend_v1(p_lease_owner);
  packet:=item->'packet';revisions:=packet->'revisions'||jsonb_build_object('market',market_revision);packet:=packet||jsonb_build_object('revisions',revisions);
  SELECT jsonb_agg(value||jsonb_build_object('revisions',revisions) ORDER BY ordinal) INTO score_rules FROM jsonb_array_elements(item->'rules') WITH ORDINALITY q(value,ordinal);
  bound_scored:=bound_scored||jsonb_build_array(item||jsonb_build_object('packet',packet,'rules',score_rules));
 END LOOP;
 scored:=bound_scored;
 IF pool_revision<>public.vnext_launch_csv_hash_v1(public.vnext_launch_csv_pool_v1()) THEN RAISE EXCEPTION 'launch_pool_changed_under_lock';END IF;
 at:=clock_timestamp();PERFORM public.vnext_launch_csv_backend_v1(p_lease_owner);
 IF EXISTS(SELECT FROM jsonb_array_elements(scored) q WHERE (q->'qualification'->>'expiresAt')::timestamptz<=at) THEN
  RETURN public.vnext_launch_write_receipt_v1(requested,prior.ranking_run_id,false,'launch_current_qualification_expired_during_recompute');END IF;
 SELECT coalesce(jsonb_agg((q->'packet')||jsonb_build_object('rank',rank) ORDER BY rank),'[]'::jsonb) INTO ranked FROM(
  SELECT value q,row_number() OVER(ORDER BY (value->'packet'->>'totalScore')::double precision DESC,(value->'packet'->>'technicalScore')::double precision DESC,
   (value->'packet'->>'relativeStrength63')::double precision DESC,value->'packet'->>'symbol') rank FROM jsonb_array_elements(scored)
 ) ordered WHERE rank<=10;
 FOR item IN SELECT value FROM jsonb_array_elements(ranked) LOOP
  SELECT value INTO old_item FROM jsonb_array_elements(coalesce(prior.snapshot->'members','[]'::jsonb)) m WHERE m->>'symbol'=item->>'symbol';
  changes:=changes||jsonb_build_array(jsonb_build_object('symbol',item->>'symbol','kind',CASE WHEN old_item IS NULL THEN 'entered' ELSE 'maintained' END,'reason','launch_complete_source_recomputed'));
 END LOOP;
 FOR old_item IN SELECT value FROM jsonb_array_elements(coalesce(prior.snapshot->'members','[]'::jsonb)) m WHERE NOT EXISTS(SELECT FROM jsonb_array_elements(ranked) n WHERE n->>'symbol'=m->>'symbol') LOOP
  changes:=changes||jsonb_build_array(jsonb_build_object('symbol',old_item->>'symbol','kind','exited','reason','launch_complete_ranking_transition'));
 END LOOP;
 document:=jsonb_build_object('schemaVersion','vnext-launch-ranking-snapshot-v2','policyVersion',mode.policy_version,'rulesVersion',mode.rules_version,'arithmeticVersion',mode.arithmetic_version,
  'rankingRunId',requested,'previousRankingRunId',expected,'cutoff',cutoff,'inputCutoff',cutoff,'session',day,'publishedAt',at,'marketRevision',market_revision,
  'market',jsonb_build_object('session',day,'risk',market->>'risk','confidence','complete','sourceAt',market->'sourceAt','expiresAt',market->'expiresAt',
   'reasons',jsonb_build_array('verified_legacy_market_520_context'),'conditions','[]'::jsonb,'gaps','[]'::jsonb),
  'members',ranked,'candidates',candidates,'changes',changes);
 -- Re-observe EVERY classification under the same owned lease/CAS locks
 -- before ANY durable append. Changed/late venue or cash heads retain the old
 -- run atomically; no partially written peers or stale exclusion is accepted.
 FOR preflight IN SELECT value FROM jsonb_array_elements(preflights) LOOP
  PERFORM public.vnext_launch_csv_backend_v1(p_lease_owner);
  fresh_preflight:=public.vnext_launch_rank_preflight_v1(preflight->>'symbol',preflight->>'inputHash',day,cutoff);
  IF fresh_preflight IS NULL OR fresh_preflight->>'classificationDigest' IS DISTINCT FROM preflight->>'classificationDigest'
   OR (preflight->>'expiresAt')::timestamptz<=clock_timestamp() THEN
   RETURN public.vnext_launch_write_receipt_v1(requested,prior.ranking_run_id,false,'launch_preflight_changed_before_append');END IF;
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(scored) LOOP
  PERFORM public.vnext_launch_csv_backend_v1(p_lease_owner);
  qualification:=public.vnext_launch_qualification_checks_v1(item->'packet'->>'symbol',(item->'packet'->>'revisionId')::uuid,item->'packet'->>'inputHash',item->'selected',cutoff);
  IF qualification->>'qualified' IS DISTINCT FROM 'true' OR qualification->'checks' IS DISTINCT FROM item->'qualification'->'checks'
   OR qualification->'instrument' IS DISTINCT FROM item->'qualification'->'instrument' THEN
   RETURN public.vnext_launch_write_receipt_v1(requested,prior.ranking_run_id,false,'launch_current_qualification_changed_before_append');END IF;
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(scored) LOOP
  PERFORM public.vnext_launch_csv_backend_v1(p_lease_owner);
  packet:=item->'packet';selected:=item->'selected';qualification:=item->'qualification';score_id:=(packet->>'scoreRevision')::uuid;qualification_id:=(packet->>'launchQualificationRevision')::uuid;
  INSERT INTO public.vnext_launch_score_evidence_v1(score_revision,research_revision,symbol,input_hash,signal_session,input_cutoff,policy_version,rules_version,arithmetic_version,source_inputs,source_hash,score)
  VALUES(score_id,(packet->>'revisionId')::uuid,packet->>'symbol',packet->>'inputHash',day,cutoff,mode.policy_version,mode.rules_version,mode.arithmetic_version,selected,public.vnext_launch_csv_hash_v1(selected),jsonb_build_object('packet',packet,'rules',item->'rules'));
  INSERT INTO public.vnext_launch_qualifications_v1(qualification_revision,score_revision,research_revision,symbol,input_hash,checked_at,expires_at,qualified,entry_eligible,checks,reasons,revisions)
  VALUES(qualification_id,score_id,(packet->>'revisionId')::uuid,packet->>'symbol',packet->>'inputHash',(qualification->>'checkedAt')::timestamptz,(qualification->>'expiresAt')::timestamptz,true,(packet->>'entryEligible')::boolean,qualification->'checks',qualification->'reasons',packet->'revisions');
  INSERT INTO public.vnext_launch_score_source_pins_v1 SELECT DISTINCT score_id,(f->>'captureId')::uuid,(f->'fact'->>'session_date')::date,f->'fact'->>'symbol'
  FROM jsonb_array_elements(selected->'technicalInventory'||selected->'institutionalInventory'||selected->'flowInventory'||selected->'indexInventory') f;
  INSERT INTO public.vnext_launch_score_price_pins_v1 SELECT score_id,(b->>'observationId')::uuid,(b->>'calendarId')::uuid FROM jsonb_array_elements(selected->'price'->'bars') b;
  INSERT INTO public.vnext_launch_score_action_pins_v1 SELECT score_id,(a->>'snapshotId')::uuid FROM jsonb_array_elements(selected->'price'->'actions') a;
 END LOOP;
 INSERT INTO public.vnext_launch_ranking_snapshots_v1(ranking_run_id,previous_ranking_run_id,request_hash,input_hash,input_cutoff,session_date,published_at,snapshot)
 VALUES(requested,expected,request_digest,public.vnext_launch_csv_hash_v1(jsonb_build_array(pool_revision,scored,exclusions,market_revision)),cutoff,day,at,document);
 FOR preflight IN SELECT value FROM jsonb_array_elements(exclusions) LOOP
  PERFORM public.vnext_launch_csv_backend_v1(p_lease_owner);exclusion_id:=gen_random_uuid();
  INSERT INTO public.vnext_launch_rank_exclusions_v1(exclusion_revision,ranking_run_id,symbol,input_hash,reason,input_cutoff,checked_at,expires_at,
   known_at,cash_known_at,knowledge_scope,classification_digest,evidence,instrument_id,frozen_instrument_id)
  VALUES(exclusion_id,requested,preflight->>'symbol',preflight->>'inputHash',preflight->>'reason',cutoff,(preflight->>'checkedAt')::timestamptz,
   (preflight->>'expiresAt')::timestamptz,(preflight->>'knownAt')::timestamptz,(preflight->>'cashKnownAt')::timestamptz,preflight->>'knowledgeScope',preflight->>'classificationDigest',preflight,(preflight->'instrument'->>'id')::uuid,(preflight->'frozenInstrument'->>'id')::uuid);
  INSERT INTO public.vnext_launch_exclusion_source_pins_v1 SELECT exclusion_id,(r->'source'->>'captureId')::uuid,
   (r->'source'->'fact'->>'session_date')::date,r->'source'->'fact'->>'symbol',(r->>'calendarId')::uuid
  FROM jsonb_array_elements(preflight->'cashInventory') r;
 END LOOP;
 INSERT INTO public.vnext_launch_ranking_members_v1 SELECT requested,p.packet->>'symbol',(ranked_member.member_packet->>'rank')::integer,(p.packet->>'revisionId')::uuid,
  (p.packet->>'scoreRevision')::uuid,(p.packet->>'launchQualificationRevision')::uuid,p.packet->>'inputHash' FROM jsonb_array_elements(scored) q
  CROSS JOIN LATERAL(SELECT q->'packet' packet) p LEFT JOIN LATERAL(SELECT value member_packet FROM jsonb_array_elements(ranked) r WHERE r->>'symbol'=p.packet->>'symbol') ranked_member ON true;
 PERFORM public.vnext_launch_csv_backend_v1(p_lease_owner);
 INSERT INTO public.vnext_audit_v1(principal,command,request,result) VALUES(p_principal,'launch-ranking-publish',p_request,
  public.vnext_launch_write_receipt_v1(requested,requested,true,NULL));
 RETURN public.vnext_launch_write_receipt_v1(requested,requested,true,NULL);
END $$;

-- GET-only current facts. Rechecking does not append/renew the frozen
-- qualification or ranking, settle a provider call, acquire a lease or enqueue.
CREATE FUNCTION public.vnext_launch_live_v1(score_id uuid,qualification_id uuid,current_market jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC' SET extra_float_digits=3 AS $$
DECLARE score_row public.vnext_launch_score_evidence_v1;frozen public.vnext_launch_qualifications_v1;selected jsonb;qualified jsonb;
 inventory jsonb;item jsonb;fresh jsonb;raw_rows jsonb;old_row jsonb;head jsonb;checks jsonb;reasons jsonb;state text;
 price_current boolean:=true;source_current boolean:=true;market_entry boolean:=false;at timestamptz:=statement_timestamp();market_name text;day date;today date;
 calendar_now jsonb;recent_rows jsonb;terms_now jsonb;preflight jsonb;
BEGIN
 SELECT * INTO score_row FROM public.vnext_launch_score_evidence_v1 WHERE score_revision=score_id;
 SELECT * INTO frozen FROM public.vnext_launch_qualifications_v1 WHERE qualification_revision=qualification_id AND score_revision=score_id;
 IF score_row.score_revision IS NULL OR frozen.qualification_revision IS NULL THEN RETURN NULL;END IF;
 selected:=score_row.source_inputs;market_name:=selected->'calendar'->'sessions'->0->>'market';
 qualified:=public.vnext_launch_qualification_checks_v1(score_row.symbol,score_row.research_revision,score_row.input_hash,selected,score_row.input_cutoff);
 checks:=qualified->'checks';reasons:=qualified->'reasons';
 preflight:=public.vnext_launch_rank_preflight_v1(score_row.symbol,score_row.input_hash,score_row.signal_session,score_row.input_cutoff);
 IF preflight IS NULL THEN
  checks:=checks||jsonb_build_object('venue',NULL);reasons:=reasons||'"launch_current_preflight_unknown"'::jsonb;
 ELSIF preflight->>'outcome'='known_reject' THEN
  reasons:=reasons||preflight->'reasons';
  checks:=checks||CASE WHEN preflight->>'reason'='illiquid' THEN jsonb_build_object('liquidity',false) ELSE jsonb_build_object('venue',false) END;
 END IF;
 IF public.vnext_launch_csv_hash_v1(selected)<>score_row.source_hash THEN source_current:=false;price_current:=false;END IF;
 inventory:=selected->'technicalInventory'||selected->'institutionalInventory'||selected->'flowInventory'||selected->'indexInventory';
 FOR item IN SELECT value FROM jsonb_array_elements(inventory) LOOP
  fresh:=public.vnext_launch_source_fact_v1((item->>'datasetId')::integer,(item->'fact'->>'session_date')::date,item->'fact'->>'symbol',score_row.input_hash,at);
  IF fresh IS NULL OR fresh->>'artifactHash' IS DISTINCT FROM item->>'artifactHash' OR fresh->'fact'->>'fact_hash' IS DISTINCT FROM item->'fact'->>'fact_hash'
   OR fresh->>'rightsRevision' IS DISTINCT FROM item->>'rightsRevision' THEN source_current:=false;END IF;
 END LOOP;
 raw_rows:=public.vnext_launch_price_rows_internal_v1((qualified->'instrument'->>'stockId')::uuid,market_name,
  (selected->'price'->'bars'->0->>'session')::date,score_row.signal_session,at);
 IF raw_rows IS NULL THEN price_current:=false;
 ELSE
  FOR old_row IN SELECT value FROM jsonb_array_elements(selected->'price'->'rawRows') LOOP
   SELECT value INTO head FROM jsonb_array_elements(raw_rows) r WHERE r->>'session_id'=old_row->>'session_id'
    ORDER BY (r->>'source_timestamp')::timestamptz DESC,(r->>'collected_at')::timestamptz DESC,(r->>'recorded_at')::timestamptz DESC,r->>'observation_id' LIMIT 1;
   IF head IS DISTINCT FROM old_row THEN price_current:=false;END IF;
  END LOOP;
 END IF;
 calendar_now:=public.vnext_launch_calendar_v1(market_name,score_row.signal_session,at);
 IF calendar_now IS NULL OR calendar_now->'sessions' IS DISTINCT FROM selected->'calendar'->'sessions' THEN price_current:=false;END IF;
 IF calendar_now IS NULL OR calendar_now->'annual' IS DISTINCT FROM selected->'calendar'->'annual' THEN
  price_current:=false;reasons:=reasons||'"launch_current_annual_calendar_lineage_changed"'::jsonb;
 END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(selected->'price'->'actions') LOOP
  fresh:=public.vnext_launch_action_day_v1(market_name,(item->>'calendarId')::uuid,(item->>'session')::date,score_row.symbol,at);
  IF fresh IS NULL OR fresh->>'snapshotId' IS DISTINCT FROM item->>'snapshotId' OR fresh->>'hash' IS DISTINCT FROM item->>'hash' THEN price_current:=false;END IF;
  IF item ? 'typedTermsReceipt' THEN
   IF qualified->'instrument'->>'stockId' IS NULL THEN price_current:=false;
   ELSE
    IF terms_now IS NULL THEN terms_now:=public.vnext_action_terms_current_internal_v1((qualified->'instrument'->>'stockId')::uuid,score_row.symbol,at);END IF;
    IF NOT EXISTS(SELECT FROM jsonb_array_elements(terms_now->'receipts') receipt WHERE receipt->>'receiptHash'=item->>'typedTermsReceipt') THEN price_current:=false;END IF;
   END IF;
  END IF;
 END LOOP;
 -- The private scheduling table is not the same-venue latest official head.
 -- Any newly known completed or conflicting/unknown post-signal head demotes
 -- current status even when that older scheduling table has not caught up.
 today:=(at AT TIME ZONE 'Asia/Taipei')::date;
 IF today-score_row.signal_session>7 OR today<score_row.signal_session THEN price_current:=false;
 ELSE
  FOR day IN SELECT generate_series(score_row.signal_session,today,interval '1 day')::date LOOP
   recent_rows:=public.vnext_launch_today_calendar_internal_v1(day,at);
   IF recent_rows IS NOT NULL THEN
    SELECT value INTO head FROM jsonb_array_elements(recent_rows) r WHERE r->>'market'=market_name
     ORDER BY (r->>'recorded_at')::timestamptz DESC,r->>'session_authority_id' LIMIT 1;
    IF head IS NOT NULL THEN
     IF EXISTS(SELECT FROM jsonb_array_elements(recent_rows) other WHERE other->>'market'=market_name AND other->>'recorded_at'=head->>'recorded_at'
      AND other-'session_authority_id' IS DISTINCT FROM head-'session_authority_id') OR head->>'status' NOT IN('completed','cancelled','scheduled')
      OR (day>score_row.signal_session AND head->>'status'='completed' AND (head->>'close_at')::timestamptz<=at)
      OR (head->>'status'='scheduled' AND (head->>'close_at')::timestamptz<=at) THEN price_current:=false;END IF;
    END IF;
   END IF;
  END LOOP;
 END IF;
 IF score_row.signal_session IS DISTINCT FROM(SELECT max(session_date) FROM public.vnext_sessions_v1 WHERE completed AND close_at<=at) THEN price_current:=false;END IF;
 checks:=checks||jsonb_build_object('source',source_current AND checks->>'source'='true','price',price_current AND checks->>'price'='true','actions',price_current AND checks->>'actions'='true');
 IF NOT source_current THEN reasons:=reasons||'"launch_current_source_head_or_rights_changed"'::jsonb;END IF;
 IF NOT price_current THEN reasons:=reasons||'"launch_current_price_calendar_or_actions_changed"'::jsonb;END IF;
 reasons:=reasons||coalesce(score_row.score->'packet'->'reasons','[]'::jsonb);
 -- This argument is computed once by the sole server read RPC below. This
 -- private routine has no caller/API execute grant or JSON registration path.
 IF current_market IS NULL OR current_market->>'complete' IS DISTINCT FROM 'true' OR current_market->>'risk' NOT IN('risk_on','selective','risk_off','breakdown') THEN
  checks:=checks||jsonb_build_object('source',false);reasons:=reasons||'"launch_current_market_authority_incomplete"'::jsonb;
 ELSIF current_market->>'risk' IN('risk_on','selective') THEN market_entry:=true;
 ELSE reasons:=reasons||'"launch_market_wait"'::jsonb;END IF;
 state:=CASE WHEN preflight->>'outcome'='known_reject' OR checks->>'rights'='false' OR checks->>'venue'='false' THEN 'invalid'
  WHEN NOT EXISTS(SELECT FROM jsonb_each(checks) c WHERE c.value IS DISTINCT FROM 'true'::jsonb) AND frozen.entry_eligible AND market_entry THEN 'current' ELSE 'waiting' END;
 RETURN jsonb_build_object('symbol',score_row.symbol,'revisionId',score_row.research_revision,'inputHash',score_row.input_hash,
  'scoreRevision',score_row.score_revision,'launchQualificationRevision',frozen.qualification_revision,'revisions',frozen.revisions,
  'checkedAt',at,'expiresAt',at+interval '90 seconds','status',state,'entryEligible',state='current','checks',checks,'reasons',reasons);
END $$;

CREATE FUNCTION public.vnext_launch_ranking_read_v1(p_ranking_run_id uuid DEFAULT NULL,p_symbol text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC' SET extra_float_digits=3 SET statement_timeout='30s' SET lock_timeout='2s' AS $$
DECLARE snapshot_row public.vnext_launch_ranking_snapshots_v1;score_row public.vnext_launch_score_evidence_v1;packet jsonb;live jsonb:='[]'::jsonb;
 detail jsonb;selected jsonb;current_row jsonb;availability text:='ready';reason text;document jsonb;current_market jsonb;
BEGIN
 IF p_symbol IS NOT NULL AND p_symbol!~'^[0-9]{4}$' THEN RAISE EXCEPTION 'launch_read_symbol_invalid';END IF;
 IF NOT EXISTS(SELECT FROM public.vnext_mode_v1 WHERE enabled AND legacy_fenced)
  OR NOT EXISTS(SELECT FROM public.vnext_launch_ranking_mode_v1 WHERE enabled) THEN availability:='producer_unavailable';reason:='launch_ranking_disabled';
 ELSE
  IF p_ranking_run_id IS NULL THEN SELECT * INTO snapshot_row FROM public.vnext_launch_ranking_snapshots_v1 ORDER BY ordinal DESC LIMIT 1;
  ELSE SELECT * INTO snapshot_row FROM public.vnext_launch_ranking_snapshots_v1 WHERE ranking_run_id=p_ranking_run_id;END IF;
  IF snapshot_row.ranking_run_id IS NULL THEN
   availability:=CASE WHEN p_ranking_run_id IS NULL THEN 'not_published' ELSE 'not_found' END;reason:='launch_ranking_no_matching_immutable_run';
  ELSE
   document:=snapshot_row.snapshot;
   current_market:=public.vnext_launch_market_context_v1(snapshot_row.session_date,statement_timestamp());
   FOR packet IN SELECT value FROM jsonb_array_elements(document->'members') LOOP
    current_row:=public.vnext_launch_live_v1((packet->>'scoreRevision')::uuid,(packet->>'launchQualificationRevision')::uuid,current_market);
    IF current_row IS NULL THEN RAISE EXCEPTION 'launch_read_immutable_member_binding_missing';END IF;
    IF (document->'market'->>'expiresAt')::timestamptz<=statement_timestamp() THEN
     current_row:=current_row||jsonb_build_object('status','waiting','entryEligible',false,'reasons',current_row->'reasons'||'"launch_current_market_expired"'::jsonb);
    END IF;
    live:=live||jsonb_build_array(current_row);
   END LOOP;
   IF p_symbol IS NOT NULL THEN
    SELECT value INTO selected FROM jsonb_array_elements(document->'members') m WHERE m->>'symbol'=p_symbol;
    IF selected IS NULL THEN availability:='not_found';reason:='launch_symbol_not_in_requested_run';document:=NULL;live:='[]'::jsonb;
    ELSE
     SELECT * INTO score_row FROM public.vnext_launch_score_evidence_v1 WHERE score_revision=(selected->>'scoreRevision')::uuid AND research_revision=(selected->>'revisionId')::uuid
      AND symbol=p_symbol AND input_hash=selected->>'inputHash';
     IF score_row.score_revision IS NULL THEN RAISE EXCEPTION 'launch_read_score_pin_missing';END IF;
     detail:=jsonb_build_object('arithmeticVersion','binary64-v1','rankingRunId',snapshot_row.ranking_run_id,'symbol',p_symbol,
      'revisionId',selected->'revisionId','scoreRevision',selected->'scoreRevision','launchQualificationRevision',selected->'launchQualificationRevision',
      'inputHash',selected->'inputHash','summary',NULL,'scoreEvidence',score_row.score->'rules',
      'citations',public.vnext_launch_public_citations_v1(score_row.score_revision),'chart',NULL);
    END IF;
   END IF;
  END IF;
 END IF;
 RETURN jsonb_build_object('schemaVersion','vnext-launch-ranking-read-v2','arithmeticVersion','binary64-v1','availability',availability,'reason',reason,
  'snapshot',document,'current',jsonb_build_object('schemaVersion','vnext-launch-current-validity-v2','arithmeticVersion','binary64-v1','members',live),'detail',detail);
END $$;

-- Only new routines and the two explicit Stage A private adapters receive
-- grants. No old market/price/action/roster relation ACL or policy is widened.
DO $owners$
DECLARE signature text;
BEGIN
 FOREACH signature IN ARRAY ARRAY[
  'vnext_launch_finite_v1(double precision)','vnext_launch_binary64_v1(numeric)',
  'vnext_launch_mean64_v1(double precision[],integer,integer)','vnext_launch_ratio64_v1(double precision,double precision)',
  'vnext_launch_integer_sum_v1(bigint[])','vnext_launch_atr64_v1(double precision[],double precision[],double precision[],integer)',
  'vnext_launch_source_fact_v1(integer,date,text,text,timestamptz)','vnext_launch_cycle_context_v1(text)',
  'vnext_launch_calendar_release_v1()','vnext_launch_rule_v1(text,text,integer,boolean,jsonb,timestamptz,date)',
  'vnext_launch_market_context_v1(date,timestamptz)','vnext_launch_rank_preflight_v1(text,text,date,timestamptz)',
  'vnext_launch_mechanical_v1(date[],double precision[],double precision[],double precision[],double precision[],bigint[],double precision[],bigint[],bigint[],bigint[],timestamptz)',
  'vnext_launch_price_v1(uuid,text,text,jsonb,timestamptz)','vnext_launch_selected_score_v1(text,text,jsonb,date,timestamptz)',
  'vnext_launch_public_citations_v1(uuid)','vnext_launch_qualification_checks_v1(text,uuid,text,jsonb,timestamptz)',
  'vnext_launch_write_receipt_v1(uuid,uuid,boolean,text,boolean)','vnext_launch_ranking_command_v1(text,uuid,jsonb)',
  'vnext_launch_live_v1(uuid,uuid,jsonb)','vnext_launch_ranking_read_v1(uuid,text)'
 ] LOOP
  EXECUTE 'ALTER FUNCTION public.'||signature||' OWNER TO stockinsider_vnext_owner';
  EXECUTE 'REVOKE ALL ON FUNCTION public.'||signature||' FROM PUBLIC,anon,authenticated,service_role';
 END LOOP;
 FOREACH signature IN ARRAY ARRAY[
  'vnext_launch_today_calendar_internal_v1(date,timestamptz)','vnext_launch_annual_rows_internal_v1(text,date,date,timestamptz)',
  'vnext_launch_price_rows_internal_v1(uuid,text,date,date,timestamptz)',
  'vnext_launch_action_day_v1(text,uuid,date,text,timestamptz)','vnext_launch_calendar_v1(text,date,timestamptz,integer)',
  'vnext_launch_instrument_v1(text,timestamptz)','vnext_launch_cash_calendar_internal_v1(text,uuid,text,date,timestamptz,timestamptz)'
 ] LOOP
  EXECUTE 'ALTER FUNCTION public.'||signature||' OWNER TO opportunity_v3_rpc_owner';
  EXECUTE 'REVOKE ALL ON FUNCTION public.'||signature||' FROM PUBLIC,anon,authenticated,service_role';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.'||signature||' TO stockinsider_vnext_owner';
 END LOOP;
 GRANT EXECUTE ON FUNCTION public.vnext_launch_calendar_release_v1(),public.vnext_launch_finite_v1(double precision),public.vnext_launch_csv_hash_v1(jsonb) TO opportunity_v3_rpc_owner;
 GRANT EXECUTE ON FUNCTION public.vnext_launch_csv_backend_v1(uuid,text,integer) TO stockinsider_vnext_owner;
 GRANT EXECUTE ON FUNCTION public.vnext_launch_cycle_context_v1(text),public.vnext_launch_ranking_command_v1(text,uuid,jsonb),public.vnext_launch_ranking_read_v1(uuid,text) TO service_role;
END $owners$;

COMMENT ON TABLE public.vnext_launch_ranking_mode_v1 IS
 'SOURCE ONLY: defaultOFF. No production permission or activation. Missing typed market regime, positive disposition, original/catalyst proof, action/hash codec and source retention/currentness remain blockers; never reinterpret unknown as Top0.';
COMMENT ON FUNCTION public.vnext_launch_ranking_read_v1(uuid,text) IS
 'Read-only current sidecar, immutable ranking/research/score references; no append, queue, acquisition, provider call, model charge or qualification renewal.';
COMMIT;
