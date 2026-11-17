-- Use the existing licensed CSV queue and ready acknowledgement for verified
-- positive disposition notices only. Missing rows never prove an unrestricted venue.
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='45s';
SELECT pg_advisory_xact_lock(610091002);
SELECT pg_advisory_xact_lock(2409,6002);
SELECT pg_advisory_xact_lock(64221022);

ALTER TABLE public.vnext_launch_csv_bindings_v1 DROP CONSTRAINT vnext_launch_csv_bindings_v1_dataset_id_check,
 ADD CONSTRAINT vnext_launch_csv_bindings_v1_dataset_id_check CHECK(dataset_id IN(11370,11371,11856,11391,11755,11743,11764,11549,29082,11396));
ALTER TABLE public.vnext_launch_csv_captures_v1 DROP CONSTRAINT vnext_launch_csv_captures_v1_dataset_id_check,
 ADD CONSTRAINT vnext_launch_csv_captures_v1_dataset_id_check CHECK(dataset_id IN(11370,11371,11856,11391,11755,11743,11764,11549,29082,11396));
ALTER TABLE public.vnext_launch_csv_captures_v1 DROP CONSTRAINT vnext_launch_csv_captures_v1_row_count_check,
 ADD CONSTRAINT vnext_launch_csv_captures_v1_row_count_check CHECK(row_count BETWEEN
  (CASE WHEN dataset_id IN(29082,11396) THEN 0 ELSE 1 END) AND 16000);
ALTER TABLE public.vnext_launch_rank_exclusions_v1 DROP CONSTRAINT vnext_launch_rank_exclusions_v1_reason_check,
 ADD CONSTRAINT vnext_launch_rank_exclusions_v1_reason_check CHECK(reason IN('non_ordinary','suspended','delisted','illiquid','disposed')),
 ADD CONSTRAINT vnext_launch_rank_disposition_before_cutoff CHECK(reason<>'disposed' OR known_at<=input_cutoff);

CREATE FUNCTION public.vnext_launch_disposition_profile_v1(dataset integer,request_key text) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $disposition_profile$
DECLARE day date;key text;header text[];market text;url text;
BEGIN
 IF dataset IS NULL OR dataset NOT IN(29082,11396) OR request_key IS NULL
  OR request_key!~'^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'launch_disposition_profile_invalid';END IF;
 day:=request_key::date;
 IF to_char(day,'YYYY-MM-DD') IS DISTINCT FROM request_key THEN RAISE EXCEPTION 'launch_disposition_profile_invalid';END IF;
 key:=to_char(day,'YYYYMMDD');
 IF dataset=29082 THEN
  market:='TWSE';
  header:=ARRAY['編號','公布日期','證券代號','證券名稱','累計','處置條件','處置起迄時間','處置措施','處置內容','備註'];
  url:='https://www.twse.com.tw/announcement/punish?response=open_data&startDate='||key||'&endDate='||key;
 ELSE
  market:='TPEX';
  header:=ARRAY['公布日期','證券代號','證券名稱','處置起訖時間','處置原因','處置內容'];
  url:='https://www.tpex.org.tw/web/bulletin/disposal_information/disposal_information_result.php?l=zh-tw&o=data';
 END IF;
 RETURN jsonb_build_object('datasetId',dataset,'requestKey',request_key,'sessionDate',day,'exchange',market,'provider',lower(market),
  'header',header,'sourceUrl',url,'queueDataset','daily_price','maximumBytes',262144,'maximumRows',4001,
  'coverage','announced_disposition_positive_only_v1','datasetUrl','https://data.gov.tw/dataset/'||dataset::text,
  'owner','Securities and Futures Bureau, Financial Supervisory Commission',
  'license','Taiwan Open Government Data License 1.0','licenseVersion','1.0','licenseUrl','https://data.gov.tw/license',
  'resourceMappingVersion','licensed-disposition-notices-v1');
END $disposition_profile$;

CREATE FUNCTION public.vnext_launch_disposition_derive_v1(profile jsonb,body bytea) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $disposition_derive$
DECLARE day date:=(profile->>'sessionDate')::date;listed boolean:=profile->>'datasetId'='29082';
 fields text[];raw_symbol text;raw_notice text;interval_value text;bounds text[];
 starts date;ends date;announced date;item record;row_count integer:=0;symbols text[]:=ARRAY[]::text[];facts jsonb;
BEGIN
 IF body IS NULL OR octet_length(body) NOT BETWEEN 2 AND 262144 THEN RAISE EXCEPTION 'launch_disposition_body_bound';END IF;
 FOR item IN SELECT value,position FROM public.vnext_launch_csv_rows_v1(body,4001) WITH ORDINALITY parsed(value,position) LOOP
  fields:=item.value;
  IF item.position=1 THEN
   IF to_jsonb(fields) IS DISTINCT FROM profile->'header' THEN RAISE EXCEPTION 'launch_disposition_header';END IF;
   CONTINUE;
  END IF;
  row_count:=row_count+1;
  IF cardinality(fields)<>jsonb_array_length(profile->'header') THEN RAISE EXCEPTION 'launch_disposition_row';END IF;
  raw_symbol:=fields[CASE WHEN listed THEN 3 ELSE 2 END];
  raw_notice:=fields[CASE WHEN listed THEN 2 ELSE 1 END];
  interval_value:=fields[CASE WHEN listed THEN 7 ELSE 4 END];
  IF raw_symbol!~'^[0-9A-Z]{4,6}$' OR raw_notice!~'^[0-9]{7}$' OR left(raw_notice,3)='000'
   OR btrim(fields[CASE WHEN listed THEN 4 ELSE 3 END])='' OR (listed AND fields[1]!~'^[1-9][0-9]*$')
   OR (listed AND interval_value!~'^[0-9]{3}/[0-9]{2}/[0-9]{2}～[0-9]{3}/[0-9]{2}/[0-9]{2}$')
   OR (NOT listed AND interval_value!~'^[0-9]{7}~[0-9]{7}$') THEN RAISE EXCEPTION 'launch_disposition_row';END IF;
  bounds:=regexp_split_to_array(interval_value,'[～~]');
  IF left(bounds[1],3)='000' OR left(bounds[2],3)='000' THEN RAISE EXCEPTION 'launch_disposition_row';END IF;
  announced:=public.vnext_launch_csv_date_v1(raw_notice);
  starts:=public.vnext_launch_csv_date_v1(bounds[1]);
  ends:=public.vnext_launch_csv_date_v1(bounds[2]);
  IF announced>day OR announced>starts OR starts>ends OR (listed AND day NOT BETWEEN starts AND ends)
  THEN RAISE EXCEPTION 'launch_disposition_interval';END IF;
  IF day BETWEEN starts AND ends AND raw_symbol~'^[0-9]{4}$' THEN symbols:=array_append(symbols,raw_symbol);END IF;
 END LOOP;
 IF fields IS NULL THEN RAISE EXCEPTION 'launch_disposition_header';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('session',day,'symbol',symbol,'disposition','observed')
  ORDER BY symbol),'[]'::jsonb) INTO facts FROM(SELECT DISTINCT unnest(symbols) symbol) eligible;
 RETURN jsonb_build_object('profile',profile,'headerHash',public.vnext_launch_csv_hash_v1(profile->'header'),
  'rowCount',row_count,'facts',facts,'pool',jsonb_build_object('targets','[]'::jsonb,'revision',
   public.vnext_launch_csv_hash_v1(jsonb_build_array('launch-disposition-positive-only-v1',profile->'datasetId',day))));
END $disposition_derive$;

CREATE FUNCTION public.vnext_launch_disposition_session_v1(market text,day date,known_at timestamptz)
RETURNS uuid LANGUAGE plpgsql STABLE SET search_path=pg_catalog,public AS $disposition_session$
DECLARE close_at timestamptz;
BEGIN
 close_at:=CASE market
  WHEN 'TWSE' THEN public.vnext_launch_twse_turnover_close_v1(day,known_at)
  WHEN 'TPEX' THEN public.vnext_launch_tpex_cash_close_v1(day,known_at) END;
 IF close_at IS NULL THEN RETURN NULL;END IF;
 RETURN (SELECT (value->>'session_authority_id')::uuid
  FROM jsonb_array_elements(public.vnext_launch_today_calendar_internal_v1(day,known_at))
  WHERE value->>'market'=market ORDER BY (value->>'recorded_at')::timestamptz DESC,value->>'session_authority_id' LIMIT 1);
END $disposition_session$;

ALTER FUNCTION public.vnext_launch_disposition_profile_v1(integer,text) OWNER TO stockinsider_vnext_owner;
ALTER FUNCTION public.vnext_launch_disposition_derive_v1(jsonb,bytea) OWNER TO stockinsider_vnext_owner;
ALTER FUNCTION public.vnext_launch_disposition_session_v1(text,date,timestamptz) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_launch_disposition_profile_v1(integer,text),
 public.vnext_launch_disposition_derive_v1(jsonb,bytea),public.vnext_launch_disposition_session_v1(text,date,timestamptz)
 FROM PUBLIC,anon,authenticated,service_role;

DO $disposition_bind$
DECLARE change record;seam record;target oid;original text;definition text;metadata jsonb;revised text;command_owner text;
BEGIN
 SELECT pg_get_userbyid(proowner) INTO command_owner FROM pg_proc
  WHERE oid=to_regprocedure('public.vnext_launch_csv_command_v1(text,uuid,text,jsonb,bytea)');
 EXECUTE format('GRANT EXECUTE ON FUNCTION public.vnext_launch_disposition_session_v1(text,date,timestamptz) TO %I',command_owner);
 FOR change IN SELECT * FROM(VALUES
  ('public.vnext_launch_csv_profile_v1(integer,text)','1d2cb4dec5acc97bf9f7c9dd6278792d5d8ccb2557a0f0ec9cd78aa7ec09ba4c','bb10623cdfe108df43b8c49b195f1112f2c7dfc80ae8254f2b019dcf0bd3a946'),
  ('public.vnext_launch_csv_derive_v1(integer,text,bytea)','379639066605be54e0b4aa9b997d64b329e55ad5e850b76aed619049cd7b6b0c','f2d73eebe8fc3f56952ad12c40ce72ee4e035e40e53bf285f81f9f9c5ac24a3c'),
  ('public.vnext_launch_csv_command_v1(text,uuid,text,jsonb,bytea)','c168a3054ae972f3c988f187a896b101299ed6fbe181b78526b45dfa2157b417','902d7183e780d7bb48100480914b9aa5fb04b575544ae47b22f94b617ac37956'),
  ('public.vnext_launch_source_fact_v1(integer,date,text,text,timestamptz)','58c400a57c71c1008c98b9ffd37d2759fc778e6e1c37b6879d1c15e0f855e648','256054881e223b8b61ca6912108f290a18e175c9b224f2334b74653b06c5c48c'),
  ('public.vnext_launch_rank_preflight_v1(text,text,date,timestamptz)','9b7f095a4a2a0aed5dc6c61ebee6fee9bbc38cd07759c3def8480ff251d7267e','28eec3557a9c23dde92cec941fd95ec364f1146241829a111bb13a7e8ad2d068'),
  ('public.vnext_launch_ranking_command_v1(text,uuid,jsonb)','1b0243ea4da21ae1ad84ac55b36cc8475f7b799bc94ced4749ef0431347ffdd3','740377cd90fa2cf08c44a524d6fa7051178412df1181aa5947027d9dfe08616d'),
  ('public.vnext_launch_twse_close_bound_v1(uuid)','512e23cb60dc2354e06610819a4525d72573af1d445930672026a8a1af45db0f','4cb9f23dcffad44dc90cb35b33376220e836d087c1e6e4269465e775fcd088ce')
 ) revisions(signature,old_hash,new_hash) LOOP
  target:=to_regprocedure(change.signature);
  SELECT p.prosrc,pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO original,definition,metadata FROM pg_proc p WHERE p.oid=target;
  IF encode(sha256(convert_to(original,'UTF8')),'hex') IS DISTINCT FROM change.old_hash THEN
   RAISE EXCEPTION 'launch_disposition_predecessor_changed:%',change.signature;END IF;
  revised:=original;
  FOR seam IN SELECT * FROM(VALUES
   ('vnext_launch_csv_profile_v1',$prior$BEGIN
 IF dataset=11549 THEN$prior$,$next$BEGIN
 IF dataset IN(29082,11396) THEN RETURN public.vnext_launch_disposition_profile_v1(dataset,request_key);END IF;
 IF dataset=11549 THEN$next$),
   ('vnext_launch_csv_derive_v1',$prior$ IF dataset=11549 THEN$prior$,$next$ IF dataset IN(29082,11396) THEN RETURN public.vnext_launch_disposition_derive_v1(profile,body);END IF;
 IF dataset=11549 THEN$next$),
   ('vnext_launch_csv_command_v1',$prior$  FOR target_market IN SELECT unnest(ARRAY['TWSE','TPEX']) LOOP$prior$,$next$  IF at<(session_day+time '21:30') AT TIME ZONE 'Asia/Taipei' THEN
   FOR target_market IN SELECT unnest(ARRAY['TWSE','TPEX']) LOOP
    IF public.vnext_launch_disposition_session_v1(target_market,session_day,statement_timestamp()) IS NOT NULL THEN
     PERFORM public.vnext_launch_csv_command_v1(p_principal,p_lease_owner,'enqueue',
      jsonb_build_object('datasetId',CASE target_market WHEN 'TWSE' THEN 29082 ELSE 11396 END,'requestKey',session_day::text),NULL);planned:=planned+1;
    END IF;
   END LOOP;
  END IF;
  FOR target_market IN SELECT unnest(ARRAY['TWSE','TPEX']) LOOP$next$),
   ('vnext_launch_csv_command_v1',$prior$  -- At most one immutable capture generation$prior$,$next$  IF (profile->>'datasetId')::integer IN(29082,11396) AND
   ((profile->>'sessionDate')::date IS DISTINCT FROM (at AT TIME ZONE 'Asia/Taipei')::date
     OR at>=((profile->>'sessionDate')::date+time '21:30') AT TIME ZONE 'Asia/Taipei'
     OR public.vnext_launch_disposition_session_v1(profile->>'exchange',(profile->>'sessionDate')::date,statement_timestamp()) IS NULL)
  THEN RAISE EXCEPTION 'launch_disposition_current_session_required';END IF;
  -- At most one immutable capture generation$next$),
   ('vnext_launch_csv_command_v1',$prior$(b.dataset_id NOT IN(11764,11549) OR b.capture_generation=(at AT TIME ZONE 'Asia/Taipei')::date)$prior$,$next$(b.dataset_id NOT IN(11764,11549,29082,11396) OR b.capture_generation=(at AT TIME ZONE 'Asia/Taipei')::date)
    AND (b.dataset_id NOT IN(29082,11396) OR at<(b.capture_generation+time '21:30') AT TIME ZONE 'Asia/Taipei')$next$),
   ('vnext_launch_csv_command_v1',$prior$CASE WHEN b.dataset_id IN(11764,11549) AND b.request_key$prior$,$next$CASE WHEN b.dataset_id IN(11764,11549,29082,11396) AND b.request_key$next$),
   ('vnext_launch_csv_command_v1',$prior$binding.dataset_id IN(11764,11549) OR job.status$prior$,$next$binding.dataset_id IN(11764,11549,29082,11396) OR job.status$next$),
   ('vnext_launch_csv_command_v1',$prior$  IF binding.dataset_id=11549 AND ($prior$,$next$  IF binding.dataset_id IN(29082,11396) AND (
    binding.capture_generation IS DISTINCT FROM binding.request_key::date
    OR (observed AT TIME ZONE 'Asia/Taipei')::date IS DISTINCT FROM binding.capture_generation
    OR at>=(binding.capture_generation+time '21:30') AT TIME ZONE 'Asia/Taipei'
    OR public.vnext_launch_disposition_session_v1(profile->>'exchange',binding.capture_generation,observed) IS NULL
   ) THEN RAISE EXCEPTION 'launch_disposition_capture_proof_invalid';END IF;
  IF binding.dataset_id=11549 AND ($next$),
   ('vnext_launch_source_fact_v1',$prior$IF dataset NOT IN(11370,11371,11856,11391,11755,11549)$prior$,$next$IF dataset NOT IN(11370,11371,11856,11391,11755,11549,29082,11396)$next$),
   ('vnext_launch_source_fact_v1',$prior$AND (dataset<>11549 OR (binding.capture_generation=day AND binding.created_at<=cutoff AND target<>'INDEX'$prior$,$next$AND (dataset NOT IN(29082,11396) OR (binding.capture_generation=day AND binding.created_at<=cutoff AND target<>'INDEX'
       AND c.provider=CASE dataset WHEN 29082 THEN 'twse' ELSE 'tpex' END
       AND (c.observed_at AT TIME ZONE 'Asia/Taipei')::date=day AND c.pool_targets='[]'::jsonb))
   AND (dataset<>11549 OR (binding.capture_generation=day AND binding.created_at<=cutoff AND target<>'INDEX'$next$),
   ('vnext_launch_source_fact_v1',$prior$IF dataset<>11549 AND target<>'INDEX'$prior$,$next$IF dataset NOT IN(11549,29082,11396) AND target<>'INDEX'$next$),
   ('vnext_launch_rank_preflight_v1',$prior$ cash_dataset integer;cash_coverage$prior$,$next$ disposition jsonb;disposition_inventory jsonb:='[]'::jsonb;disposition_dataset integer;disposition_session uuid;
 cash_dataset integer;cash_coverage$next$),
   ('vnext_launch_rank_preflight_v1',$prior$ IF reason IS NULL AND cash_known$prior$,$next$ IF reason IS NULL AND identity_known AND venue IN('TWSE','TPEX')
  AND current_instrument->>'id'=frozen_instrument->>'id' AND (cutoff AT TIME ZONE 'Asia/Taipei')::date=signal_day THEN
  disposition_dataset:=CASE venue WHEN 'TWSE' THEN 29082 ELSE 11396 END;
  disposition_session:=public.vnext_launch_disposition_session_v1(venue,signal_day,cutoff);
  disposition:=public.vnext_launch_source_fact_v1(disposition_dataset,signal_day,target,input_digest,cutoff);
  IF disposition_session IS NOT NULL AND disposition IS NOT NULL
   AND public.vnext_launch_source_fact_v1(disposition_dataset,signal_day,target,input_digest,at) = disposition
   AND public.vnext_launch_disposition_session_v1(venue,signal_day,statement_timestamp()) = disposition_session
  THEN
   reason:='disposed';scope:='current_venue';
   known_at:=greatest((disposition->>'availableAt')::timestamptz,(frozen_instrument->>'recordedAt')::timestamptz,(frozen_instrument->>'sourceAt')::timestamptz);
   disposition_inventory:=jsonb_build_array(jsonb_build_object('source',disposition,'calendarId',disposition_session));
  END IF;
 END IF;
 IF reason IS NULL AND cash_known$next$),
   ('vnext_launch_rank_preflight_v1',$prior$ -- Checked/expiry clocks are intentionally OUTSIDE the stable state digest.$prior$,$next$ IF reason='disposed' THEN basis:=basis||jsonb_build_object('dispositionInventory',disposition_inventory);END IF;
 -- Checked/expiry clocks are intentionally OUTSIDE the stable state digest.$next$),
   ('vnext_launch_ranking_command_v1',$prior$  FROM jsonb_array_elements(preflight->'cashInventory') r;$prior$,$next$  FROM jsonb_array_elements(preflight->'cashInventory'||coalesce(preflight->'dispositionInventory','[]'::jsonb)) r;$next$),
   ('vnext_launch_twse_close_bound_v1',$prior$b.dataset_id IN(11764,11549)$prior$,$next$b.dataset_id IN(11764,11549,29082,11396)$next$)
  ) substitutions(routine,prior,next) WHERE change.signature LIKE 'public.'||routine||'(%' LOOP
   IF length(revised)-length(replace(revised,seam.prior,''))<>length(seam.prior) THEN
    RAISE EXCEPTION 'launch_disposition_seam_changed:%',change.signature;END IF;
   revised:=replace(revised,seam.prior,seam.next);
  END LOOP;
  IF encode(sha256(convert_to(revised,'UTF8')),'hex') IS DISTINCT FROM change.new_hash THEN
   RAISE EXCEPTION 'launch_disposition_successor_changed:%',change.signature;END IF;
  EXECUTE replace(definition,original,revised);
  IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE p.oid=target) IS DISTINCT FROM metadata THEN
   RAISE EXCEPTION 'launch_disposition_metadata_changed:%',change.signature;END IF;
 END LOOP;
END $disposition_bind$;
COMMIT;
