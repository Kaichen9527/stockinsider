-- Add licensed 11743 market cash to the existing bound source queue.
-- Capture and consume are private. TWSE cash and qualified breadth remain gated.
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='2s';
SELECT pg_advisory_xact_lock(610091002);
SELECT pg_advisory_xact_lock(2409,6002);
SELECT pg_advisory_xact_lock(64221022);

ALTER TABLE public.vnext_launch_csv_bindings_v1 DROP CONSTRAINT vnext_launch_csv_bindings_v1_dataset_id_check,
 ADD CONSTRAINT vnext_launch_csv_bindings_v1_dataset_id_check CHECK(dataset_id IN(11370,11371,11856,11391,11755,11743));
ALTER TABLE public.vnext_launch_csv_captures_v1 DROP CONSTRAINT vnext_launch_csv_captures_v1_dataset_id_check,
 ADD CONSTRAINT vnext_launch_csv_captures_v1_dataset_id_check CHECK(dataset_id IN(11370,11371,11856,11391,11755,11743)),
 ADD CONSTRAINT vnext_launch_csv_captures_11743_bytes CHECK(dataset_id<>11743 OR byte_length<=8192);

CREATE TABLE public.vnext_launch_tpex_cash_facts_v1(
 capture_id uuid PRIMARY KEY REFERENCES public.vnext_launch_csv_captures_v1,
 session_date date NOT NULL,
 foreign_excl_dealer_twd bigint NOT NULL CHECK(foreign_excl_dealer_twd BETWEEN -9007199254740991 AND 9007199254740991),
 foreign_incl_dealer_twd bigint NOT NULL CHECK(foreign_incl_dealer_twd BETWEEN -9007199254740991 AND 9007199254740991),
 fact_hash text NOT NULL CHECK(fact_hash ~ '^[a-f0-9]{64}$')
);
ALTER TABLE public.vnext_launch_tpex_cash_facts_v1 OWNER TO stockinsider_vnext_owner;
ALTER TABLE public.vnext_launch_tpex_cash_facts_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vnext_launch_tpex_cash_facts_v1 FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER launch_tpex_cash_writer_fence BEFORE INSERT OR UPDATE OR DELETE ON public.vnext_launch_tpex_cash_facts_v1
 FOR EACH ROW EXECUTE FUNCTION public.enforce_production_writer_fence();
CREATE TRIGGER launch_tpex_cash_immutable BEFORE UPDATE OR DELETE ON public.vnext_launch_tpex_cash_facts_v1
 FOR EACH ROW EXECUTE FUNCTION public.vnext_launch_csv_immutable_v1();

CREATE FUNCTION public.vnext_launch_tpex_cash_derive_v1(profile jsonb,pool jsonb,body bytea) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $cash_derive$
DECLARE fields text[]; line integer:=0; slot integer; category text; amounts bigint[][]:=array_fill(0::bigint,ARRAY[8,3]);
 categories constant text[]:=ARRAY['外資及陸資合計','外資及陸資(不含自營商)','外資自營商','投信','自營商合計','自營商(自行買賣)','自營商(避險)','三大法人合計*'];
 seen integer[]:='{}';j integer;day date:=(profile->>'sessionDate')::date;
 roc text:=(extract(year FROM day)::integer-1911)::text||to_char(day,'MMDD');
BEGIN
 IF body IS NULL OR octet_length(body) NOT BETWEEN 2 AND 8192 THEN RAISE EXCEPTION 'launch_tpex_cash_invalid_bytes';END IF;
 FOR fields IN SELECT * FROM public.vnext_launch_csv_rows_v1(body,9) LOOP
  line:=line+1;
  IF line=1 THEN
   IF to_jsonb(fields) IS DISTINCT FROM profile->'header' THEN RAISE EXCEPTION 'launch_tpex_cash_header';END IF;
   CONTINUE;
  END IF;
  IF cardinality(fields)<>5 OR fields[1] IS DISTINCT FROM roc THEN RAISE EXCEPTION 'launch_tpex_cash_report_date';END IF;
  category:=btrim(fields[2],chr(32)||chr(12288)||chr(9)||chr(10)||chr(13));
  slot:=array_position(categories,category);
  IF slot IS NULL OR slot=ANY(seen) THEN RAISE EXCEPTION 'launch_tpex_cash_category';END IF;
  seen:=array_append(seen,slot);
  FOR j IN 1..3 LOOP
   amounts[slot][j]:=public.vnext_launch_csv_integer_v1(fields[j+2],j=3);
  END LOOP;
  IF amounts[slot][1]-amounts[slot][2]<>amounts[slot][3] THEN RAISE EXCEPTION 'launch_tpex_cash_net';END IF;
 END LOOP;
 IF line<>9 OR cardinality(seen)<>8 THEN RAISE EXCEPTION 'launch_tpex_cash_category';END IF;
 FOR j IN 1..3 LOOP
  IF amounts[1][j]<>amounts[2][j]+amounts[3][j] OR amounts[5][j]<>amounts[6][j]+amounts[7][j]
   OR amounts[8][j]<>amounts[2][j]+amounts[4][j]+amounts[5][j] THEN RAISE EXCEPTION 'launch_tpex_cash_subtotal';END IF;
 END LOOP;
 RETURN jsonb_build_object('profile',profile,'pool',pool,'rowCount',line-1,
  'headerHash',public.vnext_launch_csv_hash_v1(profile->'header'),'facts','[]'::jsonb,
  'marketFact',jsonb_build_object('session',day,'market','TPEX','currency','TWD','scope','foreign_and_mainland_excluding_dealers',
   'foreignExclDealerTwd',amounts[2][3],'foreignInclDealerTwd',amounts[1][3]));
END $cash_derive$;

-- Select the latest venue head before testing completion. A newer cancellation
-- or a conflicting same-clock receipt cannot revive the older close.
CREATE FUNCTION public.vnext_launch_tpex_cash_close_v1(day date,cutoff timestamptz) RETURNS timestamptz
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC' AS $cash_close$
DECLARE rows_json jsonb;head jsonb;closed timestamptz;
BEGIN
 rows_json:=public.vnext_launch_today_calendar_internal_v1(day,cutoff);
 SELECT value INTO head FROM jsonb_array_elements(rows_json) WHERE value->>'market'='TPEX'
  ORDER BY (value->>'recorded_at')::timestamptz DESC,value->>'session_authority_id' LIMIT 1;
 IF head IS NULL OR head->>'provider' IS DISTINCT FROM 'tpex' OR head->>'status' IS DISTINCT FROM 'completed'
  OR EXISTS(SELECT FROM jsonb_array_elements(rows_json) WHERE value->>'market'='TPEX'
   AND value->>'recorded_at'=head->>'recorded_at' AND value-'session_authority_id' IS DISTINCT FROM head-'session_authority_id')
  THEN RETURN NULL;END IF;
 closed:=(head->>'close_at')::timestamptz;
 IF closed IS NULL OR NOT isfinite(closed) OR closed>cutoff OR (closed AT TIME ZONE 'Asia/Taipei')::date<>day
  OR (head->>'source_timestamp')::timestamptz>(head->>'collected_at')::timestamptz
  OR (head->>'collected_at')::timestamptz>(head->>'recorded_at')::timestamptz THEN RETURN NULL;END IF;
 RETURN closed;
END $cash_close$;

CREATE FUNCTION public.vnext_launch_tpex_cash_calendar_v1(day date,cutoff timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC' AS $cash_calendar$
DECLARE basis jsonb;days jsonb;
BEGIN
 basis:=public.vnext_launch_calendar_v1('TPEX',day,cutoff,240);
 IF basis IS NULL THEN RETURN NULL;END IF;
 SELECT jsonb_agg(value ORDER BY ordinal) INTO days
 FROM jsonb_array_elements(basis->'sessions') WITH ORDINALITY item(value,ordinal) WHERE ordinal>235;
 IF jsonb_array_length(days) IS DISTINCT FROM 5 OR days->-1->>'session_id' IS DISTINCT FROM day::text THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('revision',basis->>'calendarRevision','sessions',days);
END $cash_calendar$;

-- Require current rights plus five exact, acknowledged captures before the
-- original decision cutoff. If the selected receipt lacks a fact, refuse it.
CREATE FUNCTION public.vnext_launch_tpex_cash_window_v1(signal_day date,cutoff timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC' AS $cash_window$
DECLARE policy_hash text;calendar jsonb;session_row jsonb;day date;closed timestamptz;headers jsonb;
 selected jsonb;fact public.vnext_launch_tpex_cash_facts_v1;inventory jsonb:='[]';total numeric:=0;last_cash bigint;known_at timestamptz;
BEGIN
 IF cutoff IS NULL OR cutoff>statement_timestamp() OR signal_day IS NULL THEN RETURN NULL;END IF;
 SELECT public.vnext_launch_csv_hash_v1(to_jsonb(policy)) INTO policy_hash
 FROM public.vnext_source_policies_v1 policy
 WHERE source='official' AND scope='official_original' AND enabled AND valid_until>statement_timestamp();
 IF policy_hash IS NULL THEN RETURN NULL;END IF;
 calendar:=public.vnext_launch_tpex_cash_calendar_v1(signal_day,cutoff);
 IF calendar IS NULL THEN RETURN NULL;END IF;
 FOR session_row IN SELECT value FROM jsonb_array_elements(calendar->'sessions') LOOP
  day:=(session_row->>'session_id')::date;closed:=(session_row->>'close_at')::timestamptz;
  IF closed IS NULL OR public.vnext_launch_tpex_cash_close_v1(day,statement_timestamp()) IS DISTINCT FROM closed THEN RETURN NULL;END IF;
  SELECT jsonb_agg(packet ORDER BY ready_at DESC,capture_id) INTO headers FROM (
   SELECT c.capture_id,greatest(c.available_at,a.recorded_at) ready_at,
    jsonb_build_object('captureId',c.capture_id,'artifactHash',c.artifact_hash,'ackId',a.ack_id,
     'observedAt',c.observed_at,'knownAt',greatest(c.available_at,a.recorded_at),'rightsRevision',c.rights_binding_hash) packet
   FROM public.vnext_launch_csv_captures_v1 c
   JOIN public.vnext_launch_csv_ready_acks_v1 a USING(capture_id)
   JOIN public.vnext_launch_csv_outcomes_v1 o ON o.capture_id=c.capture_id AND o.attempt_id=c.attempt_id AND o.outcome='complete'
   JOIN public.vnext_launch_csv_attempts_v1 attempt ON attempt.attempt_id=c.attempt_id
   JOIN public.vnext_launch_csv_bindings_v1 b ON b.job_id=attempt.job_id AND b.dataset_id=c.dataset_id AND b.request_key=c.request_key
   WHERE c.dataset_id=11743 AND c.request_key=day::text AND c.provider='tpex'
    AND c.source_url=public.vnext_launch_csv_profile_v1(11743,day::text)->>'sourceUrl'
    AND c.source_url=b.source_url AND c.coverage='tpex_11743_foreign_excluding_dealer_twd_v1'
    AND c.rights_binding_hash=policy_hash AND c.observed_at>=closed AND c.available_at<=cutoff AND a.recorded_at<=cutoff
   ORDER BY ready_at DESC,c.capture_id LIMIT 101
  ) recent;
  IF headers IS NULL OR jsonb_array_length(headers)>100 THEN RETURN NULL;END IF;
  selected:=headers->0;
  IF EXISTS(SELECT FROM jsonb_array_elements(headers) candidate WHERE candidate->>'knownAt'=selected->>'knownAt'
   AND candidate-'captureId'-'ackId' IS DISTINCT FROM selected-'captureId'-'ackId') THEN RETURN NULL;END IF;
  SELECT * INTO fact FROM public.vnext_launch_tpex_cash_facts_v1 f
   WHERE f.capture_id=(selected->>'captureId')::uuid AND f.session_date=day;
  IF fact.capture_id IS NULL THEN RETURN NULL;END IF;
  last_cash:=fact.foreign_excl_dealer_twd;total:=total+last_cash;
  known_at:=greatest(known_at,(selected->>'knownAt')::timestamptz);
  inventory:=inventory||jsonb_build_array(selected||jsonb_build_object('session',day,'factHash',fact.fact_hash));
 END LOOP;
 IF abs(total)>9007199254740991 THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('market','TPEX','currency','TWD','scope','foreign_and_mainland_excluding_dealers',
  'oneDayTwd',last_cash,'fiveDayTwd',total,'knownAt',known_at,'calendarRevision',calendar->>'revision','receipts',inventory,
  'revision',public.vnext_launch_csv_hash_v1(jsonb_build_array('tpex-11743-cash-v1',calendar->>'revision',inventory)));
END $cash_window$;

DO $cash_owners$
DECLARE signature text;queue_owner text;
BEGIN
 SELECT pg_get_userbyid(relowner) INTO queue_owner FROM pg_class WHERE oid='public.taiwan_data_refresh_queue_v5'::regclass;
 FOREACH signature IN ARRAY ARRAY['vnext_launch_tpex_cash_derive_v1(jsonb,jsonb,bytea)','vnext_launch_tpex_cash_close_v1(date,timestamptz)',
  'vnext_launch_tpex_cash_calendar_v1(date,timestamptz)','vnext_launch_tpex_cash_window_v1(date,timestamptz)'] LOOP
  EXECUTE 'ALTER FUNCTION public.'||signature||' OWNER TO stockinsider_vnext_owner';
  EXECUTE 'REVOKE ALL ON FUNCTION public.'||signature||' FROM PUBLIC,anon,authenticated,service_role';
 END LOOP;
 EXECUTE format('GRANT INSERT ON public.vnext_launch_tpex_cash_facts_v1 TO %I',queue_owner);
 EXECUTE format('GRANT EXECUTE ON FUNCTION public.vnext_launch_tpex_cash_close_v1(date,timestamptz),public.vnext_launch_tpex_cash_calendar_v1(date,timestamptz) TO %I',queue_owner);
END $cash_owners$;

-- Preserve predecessor identity, permissions and old fact serialization.
DO $apply$
DECLARE target oid; original text; definition text; metadata jsonb; changed text; seam record;
BEGIN
  target:=to_regprocedure('public.vnext_launch_csv_profile_v1(integer,text)');
  SELECT prosrc,pg_get_functiondef(oid),to_jsonb(p)-'prosrc' INTO original,definition,metadata FROM pg_proc p WHERE oid=target;
  IF encode(sha256(convert_to(original,'UTF8')),'hex') IS DISTINCT FROM 'e393a9daaaddd8420f416df84354487cd80e1e02804980fb43190338cde5823f'
   THEN RAISE EXCEPTION 'launch_tpex_cash_predecessor_changed:vnext_launch_csv_profile_v1';END IF;
  changed:=original;
  FOR seam IN SELECT * FROM(VALUES
      ($f0old0$dataset NOT IN(11370,11371,11856,11391,11755)$f0old0$,$f0new0$dataset NOT IN(11370,11371,11856,11391,11755,11743)$f0new0$),
      ($f0old1$ WHEN 11391 THEN headers$f0old1$,$f0new1$ WHEN 11743 THEN
  headers:=ARRAY['資料日期','單位名稱','買進金額','賣出金額','買賣超'];
  url:='https://www.tpex.org.tw/web/stock/3insti/3insti_SUMMARY/3itrdsum_result.php?l=zh-tw&o=data&t=D&d='||(extract(year FROM day)::integer-1911)::text||'%2F'||to_char(day,'MM')||'%2F'||to_char(day,'DD');coverage:='tpex_11743_foreign_excluding_dealer_twd_v1';
 WHEN 11391 THEN headers$f0new1$),
      ($f0old2$WHEN dataset=11856 THEN 'institutional_flow'$f0old2$,$f0new2$WHEN dataset IN(11856,11743) THEN 'institutional_flow'$f0new2$),
      ($f0old3$WHEN dataset=11370 THEN 3145728 ELSE 500000$f0old3$,$f0new3$WHEN dataset=11370 THEN 3145728 WHEN dataset=11743 THEN 8192 ELSE 500000$f0new3$),
      ($f0old4$WHEN dataset=11370 THEN 16001 WHEN month_profile$f0old4$,$f0new4$WHEN dataset=11370 THEN 16001 WHEN dataset=11743 THEN 9 WHEN month_profile$f0new4$)
   )fragments(before_text,after_text) LOOP
   IF (length(changed)-length(replace(changed,seam.before_text,'')))<>length(seam.before_text)
    THEN RAISE EXCEPTION 'launch_tpex_cash_source_seam_changed';END IF;
   changed:=replace(changed,seam.before_text,seam.after_text);
  END LOOP;
  IF encode(sha256(convert_to(changed,'UTF8')),'hex') IS DISTINCT FROM 'e1e5b3b0fd522e458abdfd983ab622459ec3d171f48605b0c87677911fa3535d'
   THEN RAISE EXCEPTION 'launch_tpex_cash_successor_changed:vnext_launch_csv_profile_v1';END IF;
  EXECUTE replace(definition,original,changed);
  IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE oid=target) IS DISTINCT FROM metadata
   THEN RAISE EXCEPTION 'launch_tpex_cash_original_function_metadata_changed';END IF;

  target:=to_regprocedure('public.vnext_launch_csv_derive_v1(integer,text,bytea)');
  SELECT prosrc,pg_get_functiondef(oid),to_jsonb(p)-'prosrc' INTO original,definition,metadata FROM pg_proc p WHERE oid=target;
  IF encode(sha256(convert_to(original,'UTF8')),'hex') IS DISTINCT FROM 'f80e62b5e0f480e8c958e346321834c43fcdb689bfa961f80686bcbc14e45e5f'
   THEN RAISE EXCEPTION 'launch_tpex_cash_predecessor_changed:vnext_launch_csv_derive_v1';END IF;
  changed:=original;
  FOR seam IN SELECT * FROM(VALUES
      ($f1old0$BEGIN
 IF octet_length(body)$f1old0$,$f1new0$BEGIN
 IF dataset=11743 THEN RETURN public.vnext_launch_tpex_cash_derive_v1(profile,pool,body);END IF;
 IF octet_length(body)$f1new0$)
   )fragments(before_text,after_text) LOOP
   IF (length(changed)-length(replace(changed,seam.before_text,'')))<>length(seam.before_text)
    THEN RAISE EXCEPTION 'launch_tpex_cash_source_seam_changed';END IF;
   changed:=replace(changed,seam.before_text,seam.after_text);
  END LOOP;
  IF encode(sha256(convert_to(changed,'UTF8')),'hex') IS DISTINCT FROM '8915b77fed89dc13661c6370e390a37d01639cdf630625468d9c27916773e9b1'
   THEN RAISE EXCEPTION 'launch_tpex_cash_successor_changed:vnext_launch_csv_derive_v1';END IF;
  EXECUTE replace(definition,original,changed);
  IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE oid=target) IS DISTINCT FROM metadata
   THEN RAISE EXCEPTION 'launch_tpex_cash_original_function_metadata_changed';END IF;

  target:=to_regprocedure('public.vnext_launch_csv_command_v1(text,uuid,text,jsonb,bytea)');
  SELECT prosrc,pg_get_functiondef(oid),to_jsonb(p)-'prosrc' INTO original,definition,metadata FROM pg_proc p WHERE oid=target;
  IF encode(sha256(convert_to(original,'UTF8')),'hex') IS DISTINCT FROM '50b89c7bac9800aab64fdddd54252b29979e4273a65614b8ab84b3943bcf23e7'
   THEN RAISE EXCEPTION 'launch_tpex_cash_predecessor_changed:vnext_launch_csv_command_v1';END IF;
  changed:=original;
  FOR seam IN SELECT * FROM(VALUES
      ($f2old0$session_day date; planned integer:=0; target_market text; date_key text;$f2old0$,$f2new0$session_day date; planned integer:=0; target_market text; date_key text; flow_calendar jsonb; flow_close timestamptz;$f2new0$),
      ($f2old1$  IF planned=0 THEN RAISE EXCEPTION 'launch_csv_current_plan_empty';END IF;$f2old1$,$f2new1$  flow_calendar:=public.vnext_launch_tpex_cash_calendar_v1(session_day,statement_timestamp());
  IF flow_calendar IS NOT NULL THEN
   FOR date_key IN SELECT value->>'session_id' FROM jsonb_array_elements(flow_calendar->'sessions') LOOP
    PERFORM public.vnext_launch_csv_command_v1(p_principal,p_lease_owner,'enqueue',jsonb_build_object('datasetId',11743,'requestKey',date_key),NULL);
    planned:=planned+1;
    IF planned>200 THEN RAISE EXCEPTION 'launch_csv_plan_bound';END IF;
   END LOOP;
  ELSIF public.vnext_launch_tpex_cash_close_v1(session_day,statement_timestamp()) IS NOT NULL THEN
   PERFORM public.vnext_launch_csv_command_v1(p_principal,p_lease_owner,'enqueue',
    jsonb_build_object('datasetId',11743,'requestKey',session_day::text),NULL);
   planned:=planned+1;
   IF planned>200 THEN RAISE EXCEPTION 'launch_csv_plan_bound';END IF;
  END IF;
  IF planned=0 THEN RAISE EXCEPTION 'launch_csv_current_plan_empty';END IF;$f2new1$),
      ($f2old2$  -- At most one immutable capture generation per resource and real Taipei day.$f2old2$,$f2new2$  IF (profile->>'datasetId')::integer=11743
   AND public.vnext_launch_tpex_cash_close_v1((profile->>'sessionDate')::date,statement_timestamp()) IS NULL
  THEN RAISE EXCEPTION 'launch_tpex_cash_completed_session_required';END IF;
  -- At most one immutable capture generation per resource and real Taipei day.$f2new2$),
      ($f2old3$  backend:=public.vnext_launch_csv_backend_v1(p_lease_owner,artifact,octet_length(p_body));
  derived:=$f2old3$,$f2new3$  IF binding.dataset_id=11743 THEN
   flow_close:=public.vnext_launch_tpex_cash_close_v1(binding.request_key::date,statement_timestamp());
   IF flow_close IS NULL OR observed<flow_close THEN RAISE EXCEPTION 'launch_tpex_cash_capture_before_close';END IF;
  END IF;
  backend:=public.vnext_launch_csv_backend_v1(p_lease_owner,artifact,octet_length(p_body));
  derived:=$f2new3$),
      ($f2old4$  FOR fact IN SELECT value FROM jsonb_array_elements(derived->'facts') LOOP$f2old4$,$f2new4$  IF binding.dataset_id=11743 THEN
   fact:=derived->'marketFact';
   INSERT INTO public.vnext_launch_tpex_cash_facts_v1(capture_id,session_date,foreign_excl_dealer_twd,foreign_incl_dealer_twd,fact_hash)
   VALUES(capture.capture_id,(fact->>'session')::date,(fact->>'foreignExclDealerTwd')::bigint,(fact->>'foreignInclDealerTwd')::bigint,
    public.vnext_launch_csv_hash_v1(fact));
  END IF;
  FOR fact IN SELECT value FROM jsonb_array_elements(derived->'facts') LOOP$f2new4$),
      ($f2old5$'facts',(SELECT count(*) FROM public.vnext_launch_csv_facts_v1 WHERE capture_id=capture.capture_id)$f2old5$,$f2new5$'facts',CASE WHEN binding.dataset_id=11743 THEN 1 ELSE (SELECT count(*) FROM public.vnext_launch_csv_facts_v1 WHERE capture_id=capture.capture_id) END$f2new5$)
   )fragments(before_text,after_text) LOOP
   IF (length(changed)-length(replace(changed,seam.before_text,'')))<>length(seam.before_text)
    THEN RAISE EXCEPTION 'launch_tpex_cash_source_seam_changed';END IF;
   changed:=replace(changed,seam.before_text,seam.after_text);
  END LOOP;
  IF encode(sha256(convert_to(changed,'UTF8')),'hex') IS DISTINCT FROM 'dda5c8c2021592aaaa5584b44dd6b01c9d4110d65f1f86095ac2ec8974fdbc09'
   THEN RAISE EXCEPTION 'launch_tpex_cash_successor_changed:vnext_launch_csv_command_v1';END IF;
  EXECUTE replace(definition,original,changed);
  IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE oid=target) IS DISTINCT FROM metadata
   THEN RAISE EXCEPTION 'launch_tpex_cash_original_function_metadata_changed';END IF;

  target:=to_regprocedure('public.vnext_launch_market_context_v1(date,timestamptz)');
  SELECT prosrc,pg_get_functiondef(oid),to_jsonb(p)-'prosrc' INTO original,definition,metadata FROM pg_proc p WHERE oid=target;
  IF encode(sha256(convert_to(original,'UTF8')),'hex') IS DISTINCT FROM '5b8b041e627c4be2d1145db6b34784e82bb71381f0b699ead956001fddee1336'
   THEN RAISE EXCEPTION 'launch_tpex_cash_predecessor_changed:vnext_launch_market_context_v1';END IF;
  changed:=original;
  FOR seam IN SELECT * FROM(VALUES
      ($f3old0$ known_at timestamptz;index_value double precision;$f3old0$,$f3new0$ known_at timestamptz;index_value double precision;tpex_cash jsonb;$f3new0$),
      ($f3old1$ RETURN jsonb_build_object('complete',false,'reason','launch_market_breadth_and_flow_typed_producer_not_connected','risk','unknown',$f3old1$,$f3new1$ tpex_cash:=public.vnext_launch_tpex_cash_window_v1(signal_day,cutoff);
 RETURN jsonb_build_object('complete',false,'reason','launch_market_breadth_and_flow_typed_producer_not_connected','risk','unknown',
  'tpexCashReady',tpex_cash IS NOT NULL,'tpexCashRevision',tpex_cash->>'revision',$f3new1$)
   )fragments(before_text,after_text) LOOP
   IF (length(changed)-length(replace(changed,seam.before_text,'')))<>length(seam.before_text)
    THEN RAISE EXCEPTION 'launch_tpex_cash_source_seam_changed';END IF;
   changed:=replace(changed,seam.before_text,seam.after_text);
  END LOOP;
  IF encode(sha256(convert_to(changed,'UTF8')),'hex') IS DISTINCT FROM '58754c89ecb3ae02dbe889aa939a232cc9b208ee4bf29a12f3c731e583647ba8'
   THEN RAISE EXCEPTION 'launch_tpex_cash_successor_changed:vnext_launch_market_context_v1';END IF;
  EXECUTE replace(definition,original,changed);
  IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE oid=target) IS DISTINCT FROM metadata
   THEN RAISE EXCEPTION 'launch_tpex_cash_original_function_metadata_changed';END IF;
END $apply$;
COMMIT;
