-- Select the same immutable, native roster used by the original authority
-- pipeline. The result covers registered instruments, not an external census.
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='2s';
SELECT pg_advisory_xact_lock(64221022);

CREATE FUNCTION public.vnext_launch_breadth_roster_heads_v1(cutoff timestamptz)
RETURNS SETOF public.stock_instruments_v3
LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $heads$
 SELECT picked.*
 FROM (
   SELECT stream_key_canonical FROM public.opportunity_authority_stream_registry_v3
   WHERE family='instrument_roster' ORDER BY stream_key_hash,stream_key_canonical LIMIT 20000
 ) registered
 CROSS JOIN LATERAL (
   SELECT retained.* FROM public.stock_instruments_v3 retained
   WHERE retained.stock_id=(convert_from(registered.stream_key_canonical,'UTF8')::jsonb->>1)::uuid
    AND retained.recorded_at<=cutoff AND retained.source_timestamp<=cutoff AND retained.valid_from<=cutoff
   ORDER BY retained.recorded_at DESC,retained.instrument_authority_id LIMIT 1
 ) picked
$heads$;
ALTER FUNCTION public.vnext_launch_breadth_roster_heads_v1(timestamptz) OWNER TO opportunity_v3_rpc_owner;
REVOKE ALL ON FUNCTION public.vnext_launch_breadth_roster_heads_v1(timestamptz) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.vnext_launch_breadth_roster_v1(signal_day date,cutoff timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC' AS $roster$
DECLARE at timestamptz:=statement_timestamp(); venue text; current_rows jsonb; cutoff_rows jsonb; inputs jsonb; head jsonb; current_head jsonb;
 last_close timestamptz; clock_no integer; manifest public.opportunity_manifests_v3; registered_count bigint; usable jsonb; current_usable jsonb; roster_rows bigint; manifest_rows bigint; invalid_provider boolean;
BEGIN
 IF signal_day IS NULL OR cutoff IS NULL OR cutoff>at OR (cutoff AT TIME ZONE 'Asia/Taipei')::date<>signal_day THEN RETURN NULL;END IF;
 cutoff_rows:=public.vnext_launch_today_calendar_internal_v1(signal_day,cutoff);
 current_rows:=public.vnext_launch_today_calendar_internal_v1(signal_day,at);
 IF jsonb_typeof(current_rows) IS DISTINCT FROM 'array' OR jsonb_typeof(cutoff_rows) IS DISTINCT FROM 'array' THEN RETURN NULL;END IF;
 FOREACH venue IN ARRAY ARRAY['TWSE','TPEX'] LOOP
  FOR inputs,clock_no IN SELECT value,ordinal FROM jsonb_array_elements(jsonb_build_array(cutoff_rows,current_rows))
   WITH ORDINALITY clock(value,ordinal) LOOP
   SELECT value INTO head FROM jsonb_array_elements(inputs) WHERE value->>'market'=venue
    ORDER BY (value->>'recorded_at')::timestamptz DESC,value->>'session_authority_id' LIMIT 1;
   IF head IS NULL OR head->>'provider' IS DISTINCT FROM lower(venue) OR head->>'status' IS DISTINCT FROM 'completed'
    OR nullif(head->>'session_authority_id','') IS NULL
    OR nullif(head->>'close_at','') IS NULL OR NOT isfinite((head->>'close_at')::timestamptz)
    OR (head->>'close_at')::timestamptz>cutoff OR ((head->>'close_at')::timestamptz AT TIME ZONE 'Asia/Taipei')::date IS DISTINCT FROM signal_day
    OR (head->>'source_timestamp')::timestamptz>(head->>'collected_at')::timestamptz
    OR (head->>'collected_at')::timestamptz>(head->>'recorded_at')::timestamptz
    OR EXISTS(SELECT FROM jsonb_array_elements(inputs) candidate WHERE candidate->>'market'=venue AND candidate->>'recorded_at'=head->>'recorded_at'
     AND candidate-'session_authority_id' IS DISTINCT FROM head-'session_authority_id') THEN RETURN NULL;END IF;
   IF clock_no=1 THEN current_head:=head; END IF;
   IF head->>'session_authority_id' IS DISTINCT FROM current_head->>'session_authority_id' THEN RETURN NULL; END IF;
   last_close:=greatest(last_close,(head->>'close_at')::timestamptz);
  END LOOP;
 END LOOP;

 SELECT * INTO manifest FROM public.opportunity_manifests_v3 m
 WHERE m.manifest_kind='instrument_roster' AND m.status='complete'
  AND m.source_cutoff BETWEEN last_close AND cutoff AND m.terminal_at<=cutoff
 ORDER BY m.source_cutoff DESC,m.terminal_at DESC,m.manifest_id LIMIT 1;
 IF manifest.manifest_id IS NULL OR manifest.contract_version IS DISTINCT FROM 'tw-instrument-roster-v3.0'
  OR manifest.row_count NOT BETWEEN 1 AND 20000 OR manifest.recorded_at>manifest.terminal_at
  OR manifest.source_cutoff>manifest.terminal_at
  OR coalesce(encode(sha256(manifest.root_canonical),'hex'),'') IS DISTINCT FROM manifest.manifest_hash
  OR EXISTS(SELECT FROM public.opportunity_manifests_v3 other WHERE other.manifest_kind='instrument_roster'
   AND other.status='complete' AND other.source_cutoff=manifest.source_cutoff AND other.terminal_at<=cutoff
   AND other.manifest_hash IS DISTINCT FROM manifest.manifest_hash) THEN RETURN NULL;END IF;

 -- The established native validator enforces registry/stream bounds and rejects
 -- semantically different heads at tied knowledge clocks before selection.
 registered_count:=public.opportunity_authority_selected_stream_count_v3_internal('instrument_roster',cutoff);
 PERFORM public.opportunity_authority_selected_stream_count_v3_internal('instrument_roster',at);
 IF registered_count IS DISTINCT FROM manifest.row_count THEN RETURN NULL;END IF;

 WITH native AS MATERIALIZED (
  SELECT h.* FROM public.vnext_launch_breadth_roster_heads_v1(cutoff) h
 ), reviewed AS MATERIALIZED (
  SELECT * FROM public.opportunity_manifest_rows_v3 r WHERE r.manifest_id=manifest.manifest_id
 ), bound AS MATERIALIZED (
  SELECT h.* FROM native h JOIN reviewed r ON r.section_key='rows' AND r.payload_json->>0=h.instrument_authority_id::text
  WHERE r.recorded_at<=manifest.terminal_at AND jsonb_typeof(r.payload_json)='array' AND jsonb_array_length(r.payload_json)=12
   AND r.payload_json->>1=h.stock_id::text AND r.payload_json->>2=h.symbol AND r.payload_json->>3=h.exchange::text
   AND r.payload_json->>4=h.instrument_type::text AND r.payload_json->>5=h.listing_status::text AND r.payload_json->>7=h.provider::text
   AND r.terminal_code=CASE WHEN h.listing_status='active' AND (h.valid_to IS NULL OR h.valid_to>cutoff)
       THEN 'effective_active' ELSE 'revoked_or_expired' END
 ), eligible AS MATERIALIZED (
  SELECT * FROM bound h WHERE h.instrument_type='common_stock' AND h.listing_status='active' AND (h.valid_to IS NULL OR h.valid_to>cutoff)
 ), current_eligible AS MATERIALIZED (
  SELECT h.* FROM public.vnext_launch_breadth_roster_heads_v1(at) h
  WHERE h.instrument_type='common_stock' AND h.listing_status='active' AND (h.valid_to IS NULL OR h.valid_to>at)
 )
 SELECT (SELECT count(DISTINCT instrument_authority_id) FROM bound),(SELECT count(*) FROM reviewed),
  (SELECT jsonb_agg(jsonb_build_array(stock_id,symbol,exchange) ORDER BY stock_id) FROM eligible),
  (SELECT jsonb_agg(jsonb_build_array(stock_id,symbol,exchange) ORDER BY stock_id) FROM current_eligible),
  EXISTS(SELECT FROM (SELECT * FROM eligible UNION ALL SELECT * FROM current_eligible) h
   WHERE h.provider::text IS DISTINCT FROM lower(h.exchange::text) OR h.source_timestamp>h.recorded_at)
 INTO roster_rows,manifest_rows,usable,current_usable,invalid_provider;
 IF roster_rows IS DISTINCT FROM manifest.row_count OR manifest_rows IS DISTINCT FROM manifest.row_count OR usable IS NULL OR usable IS DISTINCT FROM current_usable
  OR (SELECT count(DISTINCT value->>1) FROM jsonb_array_elements(usable))<>jsonb_array_length(usable)
  OR invalid_provider
  OR EXISTS(SELECT FROM jsonb_array_elements(usable) WHERE value->>2 NOT IN('TWSE','TPEX') OR value->>1!~'^[0-9]{4}$')
  OR NOT EXISTS(SELECT FROM jsonb_array_elements(usable) WHERE value->>2='TWSE')
  OR NOT EXISTS(SELECT FROM jsonb_array_elements(usable) WHERE value->>2='TPEX') THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('schemaVersion','launch-registered-breadth-roster-v1','session',signal_day,
  'rosterManifestId',manifest.manifest_id,'rosterManifestHash',manifest.manifest_hash,'knownAt',manifest.terminal_at,
  'scope','registered_active_common','eligibleByVenue',jsonb_build_object(
   'TWSE',(SELECT count(*) FROM jsonb_array_elements(usable) WHERE value->>2='TWSE'),
   'TPEX',(SELECT count(*) FROM jsonb_array_elements(usable) WHERE value->>2='TPEX')),
  'members',usable);
EXCEPTION WHEN SQLSTATE 'PT409' THEN RETURN NULL;
END $roster$;
ALTER FUNCTION public.vnext_launch_breadth_roster_v1(date,timestamptz) OWNER TO opportunity_v3_rpc_owner;
REVOKE ALL ON FUNCTION public.vnext_launch_breadth_roster_v1(date,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.vnext_launch_breadth_roster_v1(date,timestamptz) TO stockinsider_vnext_owner;

DO $apply$
DECLARE target oid:=to_regprocedure('public.vnext_launch_market_context_v1(date,timestamptz)');
 original text; definition text; metadata jsonb; changed text; seam record;
BEGIN
 SELECT prosrc,pg_get_functiondef(oid),to_jsonb(p)-'prosrc' INTO original,definition,metadata FROM pg_proc p WHERE oid=target;
 IF encode(sha256(convert_to(original,'UTF8')),'hex') IS DISTINCT FROM '58754c89ecb3ae02dbe889aa939a232cc9b208ee4bf29a12f3c731e583647ba8'
  THEN RAISE EXCEPTION 'launch_breadth_roster_market_predecessor_changed';END IF;
 changed:=original;
 FOR seam IN SELECT * FROM(VALUES
  ($before0$known_at timestamptz;index_value double precision;tpex_cash jsonb;$before0$,$after0$known_at timestamptz;index_value double precision;tpex_cash jsonb;breadth_roster jsonb;$after0$),
  ($before1$ tpex_cash:=public.vnext_launch_tpex_cash_window_v1(signal_day,cutoff);$before1$,$after1$ tpex_cash:=public.vnext_launch_tpex_cash_window_v1(signal_day,cutoff);
 breadth_roster:=public.vnext_launch_breadth_roster_v1(signal_day,cutoff);$after1$),
  ($before2$  'tpexCashReady',tpex_cash IS NOT NULL,'tpexCashRevision',tpex_cash->>'revision',$before2$,$after2$  'tpexCashReady',tpex_cash IS NOT NULL,'tpexCashRevision',tpex_cash->>'revision',
  'registeredBreadthRosterReady',breadth_roster IS NOT NULL,'registeredBreadthRosterRevision',breadth_roster->>'rosterManifestHash',
  'registeredBreadthRosterCounts',breadth_roster->'eligibleByVenue',$after2$)
 )fragments(before_text,after_text) LOOP
  IF (length(changed)-length(replace(changed,seam.before_text,'')))<>length(seam.before_text)
   THEN RAISE EXCEPTION 'launch_breadth_roster_market_seam_changed';END IF;
  changed:=replace(changed,seam.before_text,seam.after_text);
 END LOOP;
 IF encode(sha256(convert_to(changed,'UTF8')),'hex') IS DISTINCT FROM 'e2607e8ac43ace294d02ace84fc48d09d790f675b850034d36621465fc7bc86f'
  THEN RAISE EXCEPTION 'launch_breadth_roster_market_successor_changed';END IF;
 EXECUTE replace(definition,original,changed);
 IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE oid=target) IS DISTINCT FROM metadata
  THEN RAISE EXCEPTION 'launch_breadth_roster_market_metadata_changed';END IF;
END $apply$;
COMMIT;
