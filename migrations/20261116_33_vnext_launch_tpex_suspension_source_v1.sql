-- Positive TPEx stopped-trading snapshot through the original signed source path.
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='45s';
SELECT pg_advisory_xact_lock(610091002);
SELECT pg_advisory_xact_lock(2409,6002);
SELECT pg_advisory_xact_lock(64221022);

ALTER TABLE public.vnext_launch_csv_bindings_v1 DROP CONSTRAINT vnext_launch_csv_bindings_v1_dataset_id_check,
 ADD CONSTRAINT vnext_launch_csv_bindings_v1_dataset_id_check CHECK(dataset_id IN(11370,11371,11856,11391,11755,11743,11764,11549,29082,11396,11736));
ALTER TABLE public.vnext_launch_csv_captures_v1 DROP CONSTRAINT vnext_launch_csv_captures_v1_dataset_id_check,
 ADD CONSTRAINT vnext_launch_csv_captures_v1_dataset_id_check CHECK(dataset_id IN(11370,11371,11856,11391,11755,11743,11764,11549,29082,11396,11736));

CREATE FUNCTION public.vnext_launch_tpex_suspension_derive_v1(profile jsonb,body bytea) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $tpex_status$
DECLARE day date:=(profile->>'sessionDate')::date;item record;fields text[];symbol text;row_count int:=0;
 codes text[]:=ARRAY[]::text[];stopped text[]:=ARRAY[]::text[];facts jsonb;
BEGIN
 IF body IS NULL OR octet_length(body) NOT BETWEEN 2 AND 262144 THEN RAISE EXCEPTION 'launch_tpex_suspension_body_bound';END IF;
 FOR item IN SELECT value,position FROM public.vnext_launch_csv_rows_v1(body,4001) WITH ORDINALITY parsed(value,position) LOOP
  fields:=item.value;
  IF item.position=1 THEN
   IF to_jsonb(fields) IS DISTINCT FROM profile->'header' THEN RAISE EXCEPTION 'launch_tpex_suspension_header';END IF;
   CONTINUE;
  END IF;
  row_count:=row_count+1;
  symbol:=fields[2];
  IF cardinality(fields)<>9 OR fields[1]!~'^[0-9]{7}$' OR left(fields[1],3)='000'
   OR symbol!~'^[0-9A-Z]{4,6}$' OR symbol=ANY(codes) OR btrim(fields[3])=''
   OR EXISTS(SELECT FROM unnest(ARRAY[fields[4],fields[5],fields[6],fields[8],fields[9]]) part WHERE part NOT IN('','Ｙ'))
   OR fields[7]!~'^(|[0-9]{3})$'
  THEN RAISE EXCEPTION 'launch_tpex_suspension_row';END IF;
  IF public.vnext_launch_csv_date_v1(fields[1]) IS DISTINCT FROM day THEN RAISE EXCEPTION 'launch_tpex_suspension_wrong_day';END IF;
  codes:=array_append(codes,symbol);
  IF fields[8]='Ｙ' AND symbol~'^[0-9]{4}$' THEN stopped:=array_append(stopped,symbol);END IF;
 END LOOP;
 IF row_count=0 THEN RAISE EXCEPTION 'launch_tpex_suspension_no_declared_day';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('session',day,'symbol',code,'stoppedTrading','observed') ORDER BY code),'[]'::jsonb)
 INTO facts FROM unnest(stopped) code;
 RETURN jsonb_build_object('profile',profile,'headerHash',public.vnext_launch_csv_hash_v1(profile->'header'),
  'rowCount',row_count,'facts',facts,'pool',jsonb_build_object('targets','[]'::jsonb,'revision',
   public.vnext_launch_csv_hash_v1(jsonb_build_array('launch-tpex-stopped-trading-positive-only-v1',day))));
END $tpex_status$;

ALTER FUNCTION public.vnext_launch_tpex_suspension_derive_v1(jsonb,bytea) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_launch_tpex_suspension_derive_v1(jsonb,bytea) FROM PUBLIC,anon,authenticated,service_role;

DO $suspension_bind$
DECLARE change record;seam record;target oid;original text;definition text;metadata jsonb;revised text;
BEGIN
 FOR change IN SELECT * FROM(VALUES
  ('public.vnext_launch_disposition_profile_v1(integer,text)','4c984a69e94dab70006d8b829841affad477eff2c1d3e67b94abffa53416d47e','b1fcc28ebe14324551d3cc3e3ee17a36f549dcd63f6f78c99d3fe8141d441bba'),
  ('public.vnext_launch_csv_profile_v1(integer,text)','bb10623cdfe108df43b8c49b195f1112f2c7dfc80ae8254f2b019dcf0bd3a946','33afde9076a0f4e46faceb623c93f89aefe7a636b63bc44c74b0826052024f81'),
  ('public.vnext_launch_csv_derive_v1(integer,text,bytea)','f2d73eebe8fc3f56952ad12c40ce72ee4e035e40e53bf285f81f9f9c5ac24a3c','72b0233b5bc180da636e606a6488798d2bf4760e163069f88e29ba105458c83c'),
  ('public.vnext_launch_csv_command_v1(text,uuid,text,jsonb,bytea)','902d7183e780d7bb48100480914b9aa5fb04b575544ae47b22f94b617ac37956','ca443a5fc6235bdb63a0f24a8fcb75a8d3af9b3f7a82227443866d2dbbbc099a'),
  ('public.vnext_launch_source_fact_v1(integer,date,text,text,timestamptz)','256054881e223b8b61ca6912108f290a18e175c9b224f2334b74653b06c5c48c','f933a132883c934584f78772206b167e9809589bb8e1691aa54c439c509b30ae'),
  ('public.vnext_launch_rank_preflight_v1(text,text,date,timestamptz)','28eec3557a9c23dde92cec941fd95ec364f1146241829a111bb13a7e8ad2d068','a94d1a77e6aaf7de8bad10a46de12cee29c2d4537504c5ba45cb74f47e57fe58'),
  ('public.vnext_launch_ranking_command_v1(text,uuid,jsonb)','740377cd90fa2cf08c44a524d6fa7051178412df1181aa5947027d9dfe08616d','1ccbb569748e234d41ad744b6f6beb3048a1f1f0af6c8078749f275b163a924d'),
  ('public.vnext_launch_twse_close_bound_v1(uuid)','4cb9f23dcffad44dc90cb35b33376220e836d087c1e6e4269465e775fcd088ce','eda16848c4e75a129ab60126f9feb6dfda51a06c75239e5a189ee0beefb1412e')
 ) revisions(signature,old_hash,new_hash) LOOP
  target:=to_regprocedure(change.signature);
  SELECT p.prosrc,pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO original,definition,metadata FROM pg_proc p WHERE p.oid=target;
  IF encode(sha256(convert_to(original,'UTF8')),'hex') IS DISTINCT FROM change.old_hash THEN
   RAISE EXCEPTION 'launch_tpex_suspension_predecessor_changed:%',change.signature;END IF;
  revised:=original;
  FOR seam IN SELECT * FROM(VALUES
   ('vnext_launch_disposition_profile_v1',$prior$dataset NOT IN(29082,11396)$prior$,$next$dataset NOT IN(29082,11396,11736)$next$),
   ('vnext_launch_disposition_profile_v1',$prior$ ELSE
  market:='TPEX';
  header:=ARRAY['公布日期'$prior$,$next$ ELSIF dataset=11736 THEN
  market:='TPEX';
  header:=ARRAY['資料日期','證券代號','證券名稱','變更交易','分盤交易','管理股票',
   '分盤或管理股票撮合循環時間','停止交易','財務重點專區'];
  url:='https://www.tpex.org.tw/web/stock/aftertrading/cmode/chtm_result.php?l=zh-tw&o=data';
 ELSE
  market:='TPEX';
  header:=ARRAY['公布日期'$next$),
   ('vnext_launch_disposition_profile_v1',$prior$'coverage','announced_disposition_positive_only_v1'$prior$,$next$'coverage',CASE WHEN dataset=11736 THEN 'tpex_stopped_trading_positive_only_v1' ELSE 'announced_disposition_positive_only_v1' END$next$),
   ('vnext_launch_disposition_profile_v1',$prior$'resourceMappingVersion','licensed-disposition-notices-v1');$prior$,$next$'resourceMappingVersion',CASE WHEN dataset=11736 THEN 'licensed-tpex-daily-status-v1' ELSE 'licensed-disposition-notices-v1' END);$next$),
   ('vnext_launch_csv_profile_v1',$prior$dataset IN(29082,11396)$prior$,$next$dataset IN(29082,11396,11736)$next$),
   ('vnext_launch_csv_derive_v1',$prior$ IF dataset IN(29082,11396) THEN$prior$,$next$ IF dataset=11736 THEN RETURN public.vnext_launch_tpex_suspension_derive_v1(profile,body);END IF;
 IF dataset IN(29082,11396) THEN$next$),
   ('vnext_launch_csv_command_v1',$prior$jsonb_build_object('datasetId',CASE target_market WHEN 'TWSE' THEN 29082 ELSE 11396 END,'requestKey',session_day::text),NULL);planned:=planned+1;$prior$,$next$jsonb_build_object('datasetId',CASE target_market WHEN 'TWSE' THEN 29082 ELSE 11396 END,'requestKey',session_day::text),NULL);planned:=planned+1;
     IF target_market='TPEX' THEN
      PERFORM public.vnext_launch_csv_command_v1(p_principal,p_lease_owner,'enqueue',
       jsonb_build_object('datasetId',11736,'requestKey',session_day::text),NULL);planned:=planned+1;
     END IF;$next$),
   ('vnext_launch_csv_command_v1',$prior$(profile->>'datasetId')::integer IN(29082,11396)$prior$,$next$(profile->>'datasetId')::integer IN(29082,11396,11736)$next$),
   ('vnext_launch_csv_command_v1',$prior$(b.dataset_id NOT IN(11764,11549,29082,11396)$prior$,$next$(b.dataset_id NOT IN(11764,11549,29082,11396,11736)$next$),
   ('vnext_launch_csv_command_v1',$prior$(b.dataset_id NOT IN(29082,11396)$prior$,$next$(b.dataset_id NOT IN(29082,11396,11736)$next$),
   ('vnext_launch_csv_command_v1',$prior$CASE WHEN b.dataset_id IN(11764,11549,29082,11396)$prior$,$next$CASE WHEN b.dataset_id IN(11764,11549,29082,11396,11736)$next$),
   ('vnext_launch_csv_command_v1',$prior$binding.dataset_id IN(11764,11549,29082,11396) OR job.status$prior$,$next$binding.dataset_id IN(11764,11549,29082,11396,11736) OR job.status$next$),
   ('vnext_launch_csv_command_v1',$prior$IF binding.dataset_id IN(29082,11396) AND$prior$,$next$IF binding.dataset_id IN(29082,11396,11736) AND$next$),
   ('vnext_launch_source_fact_v1',$prior$dataset NOT IN(11370,11371,11856,11391,11755,11549,29082,11396)$prior$,$next$dataset NOT IN(11370,11371,11856,11391,11755,11549,29082,11396,11736)$next$),
   ('vnext_launch_source_fact_v1',$prior$dataset NOT IN(29082,11396) OR (binding.capture_generation$prior$,$next$dataset NOT IN(29082,11396,11736) OR (binding.capture_generation$next$),
   ('vnext_launch_source_fact_v1',$prior$dataset NOT IN(11549,29082,11396) AND target$prior$,$next$dataset NOT IN(11549,29082,11396,11736) AND target$next$),
   ('vnext_launch_rank_preflight_v1',$prior$disposition_inventory jsonb:='[]'::jsonb;$prior$,$next$disposition_inventory jsonb:='[]'::jsonb;suspension jsonb;suspension_inventory jsonb:='[]'::jsonb;$next$),
   ('vnext_launch_rank_preflight_v1',$prior$  disposition:=public.vnext_launch_source_fact_v1(disposition_dataset$prior$,$next$  IF venue='TPEX' AND disposition_session IS NOT NULL THEN
   suspension:=public.vnext_launch_source_fact_v1(11736,signal_day,target,input_digest,cutoff);
   IF suspension IS NOT NULL AND public.vnext_launch_source_fact_v1(11736,signal_day,target,input_digest,at)=suspension
    AND public.vnext_launch_disposition_session_v1(venue,signal_day,statement_timestamp())=disposition_session THEN
    reason:='suspended';scope:='current_venue';
    known_at:=greatest((suspension->>'availableAt')::timestamptz,(frozen_instrument->>'recordedAt')::timestamptz,
      (frozen_instrument->>'sourceAt')::timestamptz);
    suspension_inventory:=jsonb_build_array(jsonb_build_object('source',suspension,'calendarId',disposition_session));
   END IF;
  END IF;
  disposition:=public.vnext_launch_source_fact_v1(disposition_dataset$next$),
   ('vnext_launch_rank_preflight_v1',$prior$  IF disposition_session IS NOT NULL AND disposition IS NOT NULL$prior$,$next$  IF reason IS NULL AND disposition_session IS NOT NULL AND disposition IS NOT NULL$next$),
   ('vnext_launch_rank_preflight_v1',$prior$ IF reason='disposed' THEN basis:=basis||jsonb_build_object('dispositionInventory',disposition_inventory);END IF;$prior$,$next$ IF reason='disposed' THEN basis:=basis||jsonb_build_object('dispositionInventory',disposition_inventory);END IF;
 IF jsonb_array_length(suspension_inventory)>0 THEN basis:=basis||jsonb_build_object('suspensionInventory',suspension_inventory);END IF;$next$),
   ('vnext_launch_ranking_command_v1',$prior$preflight->'cashInventory'||coalesce(preflight->'dispositionInventory','[]'::jsonb)$prior$,$next$preflight->'cashInventory'||coalesce(preflight->'dispositionInventory','[]'::jsonb)
   ||coalesce(preflight->'suspensionInventory','[]'::jsonb)$next$),
   ('vnext_launch_twse_close_bound_v1',$prior$b.dataset_id IN(11764,11549,29082,11396)$prior$,$next$b.dataset_id IN(11764,11549,29082,11396,11736)$next$)
  ) substitutions(routine,prior,next) WHERE change.signature LIKE 'public.'||routine||'(%' LOOP
   IF length(revised)-length(replace(revised,seam.prior,''))<>length(seam.prior) THEN
    RAISE EXCEPTION 'launch_tpex_suspension_seam_changed:%',change.signature;END IF;
   revised:=replace(revised,seam.prior,seam.next);
  END LOOP;
  IF encode(sha256(convert_to(revised,'UTF8')),'hex') IS DISTINCT FROM change.new_hash THEN
   RAISE EXCEPTION 'launch_tpex_suspension_successor_changed:%',change.signature;END IF;
  EXECUTE replace(definition,original,revised);
  IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE p.oid=target) IS DISTINCT FROM metadata THEN
   RAISE EXCEPTION 'launch_tpex_suspension_metadata_changed:%',change.signature;END IF;
 END LOOP;
END $suspension_bind$;
COMMIT;
