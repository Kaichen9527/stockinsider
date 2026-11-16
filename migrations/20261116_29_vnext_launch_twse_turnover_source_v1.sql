-- TWSE open-data dataset 11549 is a latest-session resource and supplies traded amounts only.
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='45s';
SELECT pg_advisory_xact_lock(610091002);
SELECT pg_advisory_xact_lock(2409,6002);
SELECT pg_advisory_xact_lock(64221022);

ALTER TABLE public.vnext_launch_csv_bindings_v1 DROP CONSTRAINT vnext_launch_csv_bindings_v1_dataset_id_check,
 ADD CONSTRAINT vnext_launch_csv_bindings_v1_dataset_id_check CHECK(dataset_id IN(11370,11371,11856,11391,11755,11743,11764,11549));
ALTER TABLE public.vnext_launch_csv_captures_v1 DROP CONSTRAINT vnext_launch_csv_captures_v1_dataset_id_check,
 ADD CONSTRAINT vnext_launch_csv_captures_v1_dataset_id_check CHECK(dataset_id IN(11370,11371,11856,11391,11755,11743,11764,11549));

CREATE FUNCTION public.vnext_launch_twse_turnover_derive_v1(profile jsonb,body bytea) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $twse_amount$
DECLARE rows_json jsonb; report_day date:=(profile->>'sessionDate')::date; facts jsonb;
BEGIN
 IF body IS NULL OR octet_length(body) NOT BETWEEN 2 AND 500000
 THEN RAISE EXCEPTION 'launch_twse_turnover_body_bound';END IF;
 SELECT jsonb_agg(to_jsonb(row_value) ORDER BY n) INTO rows_json
 FROM public.vnext_launch_csv_rows_v1(body,5001) WITH ORDINALITY AS parsed(row_value,n);
 IF coalesce(jsonb_array_length(rows_json),0)<2 OR rows_json->0 IS DISTINCT FROM profile->'header'
 OR EXISTS(SELECT FROM jsonb_array_elements(rows_json) r WHERE jsonb_array_length(r)<>11)
 THEN RAISE EXCEPTION 'launch_twse_turnover_schema';END IF;
 IF EXISTS(SELECT FROM jsonb_array_elements(rows_json) WITH ORDINALITY r(item,n) WHERE n>1
   AND (public.vnext_launch_csv_date_v1(item->>0) IS DISTINCT FROM report_day OR item->>1 !~ '^[0-9A-Za-z]{2,12}$'))
 THEN RAISE EXCEPTION 'launch_twse_turnover_wrong_session_or_symbol';END IF;
 IF EXISTS(SELECT FROM jsonb_array_elements(rows_json) WITH ORDINALITY r(item,n) WHERE n>1 GROUP BY item->>1 HAVING count(*)>1)
 THEN RAISE EXCEPTION 'launch_twse_turnover_duplicate_symbol';END IF;
 -- Retain every reported four-digit code. This numeric report grants no
 -- ordinary-stock, quote-adjustment, institution-volume or coverage authority.
 SELECT coalesce(jsonb_agg(jsonb_build_object('session',report_day,'symbol',item->>1,
   'shares',public.vnext_launch_csv_integer_v1(item->>3),
   'tradedNtd',public.vnext_launch_csv_integer_v1(item->>4)) ORDER BY item->>1),'[]'::jsonb)
 INTO facts FROM jsonb_array_elements(rows_json) WITH ORDINALITY r(item,n) WHERE n>1 AND item->>1~'^[0-9]{4}$';
 IF facts='[]'::jsonb THEN RAISE EXCEPTION 'launch_twse_turnover_no_stock_rows';END IF;
 RETURN jsonb_build_object('profile',profile,
  'pool',jsonb_build_object('targets','[]'::jsonb,'revision',public.vnext_launch_csv_hash_v1(jsonb_build_array('twse-11549-market-report-v1',report_day))),
  'rowCount',jsonb_array_length(rows_json)-1,'headerHash',public.vnext_launch_csv_hash_v1(rows_json->0),'facts',facts);
END $twse_amount$;

CREATE FUNCTION public.vnext_launch_twse_turnover_close_v1(day date,cutoff timestamptz) RETURNS timestamptz
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC' AS $twse_close$
DECLARE rows_json jsonb;head jsonb;closed timestamptz;
BEGIN
 rows_json:=public.vnext_launch_today_calendar_internal_v1(day,cutoff);
 SELECT value INTO head FROM jsonb_array_elements(rows_json) WHERE value->>'market'='TWSE'
  ORDER BY (value->>'recorded_at')::timestamptz DESC,value->>'session_authority_id' LIMIT 1;
 IF head IS NULL OR head->>'provider' IS DISTINCT FROM 'twse' OR head->>'status' IS DISTINCT FROM 'completed'
  OR EXISTS(SELECT FROM jsonb_array_elements(rows_json) WHERE value->>'market'='TWSE'
   AND value->>'recorded_at'=head->>'recorded_at' AND value-'session_authority_id' IS DISTINCT FROM head-'session_authority_id')
  THEN RETURN NULL;END IF;
 closed:=(head->>'close_at')::timestamptz;
 IF closed IS NULL OR NOT isfinite(closed) OR closed>cutoff OR (closed AT TIME ZONE 'Asia/Taipei')::date<>day
  OR (head->>'source_timestamp')::timestamptz>(head->>'collected_at')::timestamptz
  OR (head->>'collected_at')::timestamptz>(head->>'recorded_at')::timestamptz THEN RETURN NULL;END IF;
 RETURN closed;
END $twse_close$;

ALTER FUNCTION public.vnext_launch_twse_turnover_derive_v1(jsonb,bytea) OWNER TO stockinsider_vnext_owner;
ALTER FUNCTION public.vnext_launch_twse_turnover_close_v1(date,timestamptz) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_launch_twse_turnover_derive_v1(jsonb,bytea),
 public.vnext_launch_twse_turnover_close_v1(date,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
DO $grants$
DECLARE command_owner text;
BEGIN
 SELECT pg_get_userbyid(proowner) INTO command_owner FROM pg_proc
 WHERE oid=to_regprocedure('public.vnext_launch_csv_command_v1(text,uuid,text,jsonb,bytea)');
 IF command_owner IS NULL THEN RAISE EXCEPTION 'launch_twse_turnover_command_missing';END IF;
 EXECUTE format('GRANT EXECUTE ON FUNCTION public.vnext_launch_twse_turnover_close_v1(date,timestamptz) TO %I',command_owner);
END $grants$;

DO $profile_update$
DECLARE target oid:=to_regprocedure('public.vnext_launch_csv_profile_v1(integer,text)');
 original text; definition text; metadata jsonb; changed text; seam record;
BEGIN
 SELECT p.prosrc,pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO original,definition,metadata FROM pg_proc p WHERE p.oid=target;
 IF encode(sha256(convert_to(original,'UTF8')),'hex') IS DISTINCT FROM '189b6c7c9a050fd861589492c2fc1d9dd4cfec62171f91d43e0f7b0d55cbfb90'
 THEN RAISE EXCEPTION 'launch_twse_turnover_predecessor_changed:vnext_launch_csv_profile_v1';END IF;
 changed:=original;
 FOR seam IN SELECT * FROM(VALUES
  ($before$BEGIN
 IF dataset=11764 THEN$before$,$after$BEGIN
 IF dataset=11549 THEN
  IF request_key IS NULL OR request_key !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'launch_csv_request_invalid';END IF;
  day:=request_key::date;
  IF to_char(day,'YYYY-MM-DD') IS DISTINCT FROM request_key THEN RAISE EXCEPTION 'launch_csv_request_invalid';END IF;
  RETURN jsonb_build_object('datasetId',11549,'requestKey',request_key,'sessionDate',day,'provider','twse',
   'exchange','TWSE','queueDataset','daily_price','sourceUrl','https://www.twse.com.tw/exchangeReport/STOCK_DAY_ALL?response=open_data',
   'header',ARRAY['日期','證券代號','證券名稱','成交股數','成交金額','開盤價','最高價','最低價','收盤價','漲跌價差','成交筆數'],'maximumBytes',500000,'maximumRows',5001,
   'coverage','twse_11549_reported_turnover_v1','datasetUrl','https://data.gov.tw/dataset/11549',
   'owner','Securities and Futures Bureau, Financial Supervisory Commission',
   'license','Taiwan Open Government Data License 1.0','licenseVersion','1.0','licenseUrl','https://data.gov.tw/license',
   'resourceMappingVersion','twse-11549-catalog-linked-latest-feed-v1');
 END IF;
 IF dataset=11764 THEN$after$)
 ) patches(before_text,after_text) LOOP
  IF length(changed)-length(replace(changed,seam.before_text,''))<>length(seam.before_text)
   THEN RAISE EXCEPTION 'launch_twse_turnover_seam_changed:vnext_launch_csv_profile_v1';END IF;
  changed:=replace(changed,seam.before_text,seam.after_text);
 END LOOP;
 EXECUTE replace(definition,original,changed);
 IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE p.oid=target) IS DISTINCT FROM metadata
 THEN RAISE EXCEPTION 'launch_twse_turnover_metadata_changed:vnext_launch_csv_profile_v1';END IF;
END $profile_update$;

DO $parser_update$
DECLARE target oid:=to_regprocedure('public.vnext_launch_csv_derive_v1(integer,text,bytea)');
 original text; definition text; metadata jsonb; changed text; seam record;
BEGIN
 SELECT p.prosrc,pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO original,definition,metadata FROM pg_proc p WHERE p.oid=target;
 IF encode(sha256(convert_to(original,'UTF8')),'hex') IS DISTINCT FROM '8915b77fed89dc13661c6370e390a37d01639cdf630625468d9c27916773e9b1'
 THEN RAISE EXCEPTION 'launch_twse_turnover_predecessor_changed:vnext_launch_csv_derive_v1';END IF;
 changed:=original;
 FOR seam IN SELECT * FROM(VALUES
  ($before$ IF dataset=11743 THEN RETURN$before$,$after$ IF dataset=11549 THEN RETURN public.vnext_launch_twse_turnover_derive_v1(profile,body);END IF;
 IF dataset=11743 THEN RETURN$after$)
 ) patches(before_text,after_text) LOOP
  IF length(changed)-length(replace(changed,seam.before_text,''))<>length(seam.before_text)
   THEN RAISE EXCEPTION 'launch_twse_turnover_seam_changed:vnext_launch_csv_derive_v1';END IF;
  changed:=replace(changed,seam.before_text,seam.after_text);
 END LOOP;
 EXECUTE replace(definition,original,changed);
 IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE p.oid=target) IS DISTINCT FROM metadata
 THEN RAISE EXCEPTION 'launch_twse_turnover_metadata_changed:vnext_launch_csv_derive_v1';END IF;
END $parser_update$;

DO $queue_update$
DECLARE target oid:=to_regprocedure('public.vnext_launch_csv_command_v1(text,uuid,text,jsonb,bytea)');
 original text; definition text; metadata jsonb; changed text; seam record;
BEGIN
 SELECT p.prosrc,pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO original,definition,metadata FROM pg_proc p WHERE p.oid=target;
 IF encode(sha256(convert_to(original,'UTF8')),'hex') IS DISTINCT FROM 'a39fafc4baaecbc22351628596485033e4d03a64051e0562877956b5a8586933'
 THEN RAISE EXCEPTION 'launch_twse_turnover_predecessor_changed:vnext_launch_csv_command_v1';END IF;
 changed:=original;
 FOR seam IN SELECT * FROM(VALUES
  ($before$  FOR target_market IN SELECT unnest(ARRAY['TWSE','TPEX']) LOOP$before$,$after$  IF public.vnext_launch_twse_turnover_close_v1(session_day,at) IS NOT NULL THEN
   PERFORM public.vnext_launch_csv_command_v1(p_principal,p_lease_owner,'enqueue',
    jsonb_build_object('datasetId',11549,'requestKey',session_day::text),NULL);planned:=planned+1;
  END IF;
  FOR target_market IN SELECT unnest(ARRAY['TWSE','TPEX']) LOOP$after$),
  ($before$  -- At most one immutable capture generation per resource and real Taipei day.$before$,$after$  IF (profile->>'datasetId')::integer=11549 AND
   ((profile->>'sessionDate')::date IS DISTINCT FROM (at AT TIME ZONE 'Asia/Taipei')::date
    OR public.vnext_launch_twse_turnover_close_v1((profile->>'sessionDate')::date,at) IS NULL)
  THEN RAISE EXCEPTION 'launch_twse_turnover_current_session_required';END IF;
  -- At most one immutable capture generation per resource and real Taipei day.$after$),
  ($before$(b.dataset_id<>11764 OR b.capture_generation=(at AT TIME ZONE 'Asia/Taipei')::date)$before$,$after$(b.dataset_id NOT IN(11764,11549) OR b.capture_generation=(at AT TIME ZONE 'Asia/Taipei')::date)$after$),
  ($before$CASE WHEN b.dataset_id=11764 AND b.request_key$before$,$after$CASE WHEN b.dataset_id IN(11764,11549) AND b.request_key$after$),
  ($before$IF binding.job_id IS NULL OR binding.dataset_id=11764 OR job.status$before$,$after$IF binding.job_id IS NULL OR binding.dataset_id IN(11764,11549) OR job.status$after$),
  ($before$  backend:=public.vnext_launch_csv_backend_v1(p_lease_owner,artifact,octet_length(p_body));
  IF binding.dataset_id=11764 THEN$before$,$after$  IF binding.dataset_id=11549 AND (
   binding.capture_generation IS DISTINCT FROM binding.request_key::date
   OR (observed AT TIME ZONE 'Asia/Taipei')::date IS DISTINCT FROM binding.capture_generation
   OR (statement_timestamp() AT TIME ZONE 'Asia/Taipei')::date IS DISTINCT FROM binding.capture_generation
   OR public.vnext_launch_twse_turnover_close_v1(binding.capture_generation,observed) IS NULL
   OR lower(btrim(split_part(p_request->>'contentType',';',1)))<>'text/csv')
  THEN RAISE EXCEPTION 'launch_twse_turnover_capture_proof_invalid';END IF;
  backend:=public.vnext_launch_csv_backend_v1(p_lease_owner,artifact,octet_length(p_body));
  IF binding.dataset_id=11764 THEN$after$)
 ) patches(before_text,after_text) LOOP
  IF length(changed)-length(replace(changed,seam.before_text,''))<>length(seam.before_text)
   THEN RAISE EXCEPTION 'launch_twse_turnover_seam_changed:vnext_launch_csv_command_v1';END IF;
  changed:=replace(changed,seam.before_text,seam.after_text);
 END LOOP;
 EXECUTE replace(definition,original,changed);
 IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE p.oid=target) IS DISTINCT FROM metadata
 THEN RAISE EXCEPTION 'launch_twse_turnover_metadata_changed:vnext_launch_csv_command_v1';END IF;
END $queue_update$;

DO $fact_update$
DECLARE target oid:=to_regprocedure('public.vnext_launch_source_fact_v1(integer,date,text,text,timestamptz)');
 original text; definition text; metadata jsonb; changed text; seam record;
BEGIN
 SELECT p.prosrc,pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO original,definition,metadata FROM pg_proc p WHERE p.oid=target;
 IF encode(sha256(convert_to(original,'UTF8')),'hex') IS DISTINCT FROM '03975243fc19d303f1aead12bc9177de61700ab112879b9b798ed0df348f5dff'
 THEN RAISE EXCEPTION 'launch_twse_turnover_predecessor_changed:vnext_launch_source_fact_v1';END IF;
 changed:=original;
 FOR seam IN SELECT * FROM(VALUES
  ($before$IF dataset NOT IN(11370,11371,11856,11391,11755)$before$,$after$IF dataset NOT IN(11370,11371,11856,11391,11755,11549)$after$),
  ($before$  WHERE c.dataset_id=dataset AND c.request_key=expected_key$before$,$after$  WHERE c.dataset_id=dataset AND c.request_key=expected_key
   AND (dataset<>11549 OR (binding.capture_generation=day AND binding.created_at<=cutoff AND target<>'INDEX'
      AND c.provider='twse' AND (c.observed_at AT TIME ZONE 'Asia/Taipei')::date=day AND c.pool_targets='[]'::jsonb))$after$),
  ($before$ IF target<>'INDEX' AND NOT EXISTS$before$,$after$ IF dataset<>11549 AND target<>'INDEX' AND NOT EXISTS$after$)
 ) patches(before_text,after_text) LOOP
  IF length(changed)-length(replace(changed,seam.before_text,''))<>length(seam.before_text)
   THEN RAISE EXCEPTION 'launch_twse_turnover_seam_changed:vnext_launch_source_fact_v1';END IF;
  changed:=replace(changed,seam.before_text,seam.after_text);
 END LOOP;
 EXECUTE replace(definition,original,changed);
 IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE p.oid=target) IS DISTINCT FROM metadata
 THEN RAISE EXCEPTION 'launch_twse_turnover_metadata_changed:vnext_launch_source_fact_v1';END IF;
END $fact_update$;

-- Keep both TWSE source jobs on the licensed-source claim path.
DO $legacy_bound$
DECLARE target oid:=to_regprocedure('public.vnext_launch_twse_close_bound_v1(uuid)');
 original text; definition text; metadata jsonb;
 expected constant text:=$expected$
 SELECT EXISTS(SELECT FROM public.vnext_launch_csv_bindings_v1 b WHERE b.job_id=p_job_id AND b.dataset_id=11764)
$expected$;
BEGIN
 SELECT p.prosrc,pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO original,definition,metadata FROM pg_proc p WHERE p.oid=target;
 IF original IS DISTINCT FROM expected THEN RAISE EXCEPTION 'launch_twse_turnover_legacy_predecessor_changed';END IF;
 EXECUTE replace(definition,original,replace(original,'b.dataset_id=11764','b.dataset_id IN(11764,11549)'));
 IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE p.oid=target) IS DISTINCT FROM metadata
 THEN RAISE EXCEPTION 'launch_twse_turnover_legacy_metadata_changed';END IF;
END $legacy_bound$;

COMMIT;
