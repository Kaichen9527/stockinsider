-- Prepare close-only TWSE 11764 facts for the existing licensed writer.
-- This migration adds private routines. It does not enqueue work or persist a
-- capture. A future append and its ready ACK must supply their actual clocks.
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='2s';
SELECT pg_advisory_xact_lock(64221022);

CREATE FUNCTION public.vnext_launch_twse_close_profile_v1(report_day date) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $profile$
 SELECT jsonb_build_object(
  'datasetId',11764,
  'provider','twse',
  'exchange','TWSE',
  'sessionDate',to_char(report_day,'YYYY-MM-DD'),
  'sourceUrl','https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU_d?response=open_data&date='||to_char(report_day,'YYYYMMDD'),
  'datasetUrl','https://data.gov.tw/dataset/11764',
  'datasetName','盤後資訊 > 個股日本益比、殖利率及股價淨值比（依日期查詢）',
  'owner','Securities and Futures Bureau, Financial Supervisory Commission / Taiwan Stock Exchange',
  'license','Taiwan Open Government Data License 1.0',
  'licenseUrl','https://data.gov.tw/license',
  'coverage','twse_11764_reported_close_only_v1',
  'publisherRevision',NULL,
  'catalogKnownAt','2026-11-15T03:05:42.583197Z',
  'catalogSha256','80d3912b7ddd2cb1c22f4653bb2329245ee9f7f07b7d0af3fdbb41b642b15638',
  'licenseSha256','6d4108d8150f744ebe55822cb8c94aad0098a6bebfce5898d67c6846142d3c29',
  'catalogEvidenceCommit','01196220c166cbac9009a5095a2cfb9659958218',
  'header',jsonb_build_array('日期','證券代號','證券名稱','收盤價','殖利率(%)','股利年度','本益比','股價淨值比','財報年/季')
 )
 WHERE report_day BETWEEN DATE '2000-01-01' AND DATE '2099-12-31'
$profile$;

CREATE FUNCTION public.vnext_launch_twse_close_rows_v1(report_day date,body bytea) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $rows$
DECLARE header jsonb:=public.vnext_launch_twse_close_profile_v1(report_day)->'header';
 reported jsonb;source_day text:=to_char(report_day,'YYYYMMDD');result jsonb;
BEGIN
 IF header IS NULL OR body IS NULL OR octet_length(body) NOT BETWEEN 2 AND 500000 THEN
  RAISE EXCEPTION 'launch_twse_close_byte_or_date_bound';
 END IF;
 SELECT jsonb_agg(to_jsonb(fields) ORDER BY ordinal) INTO reported
 FROM public.vnext_launch_csv_rows_v1(body,5001) WITH ORDINALITY parsed(fields,ordinal)
 WHERE ordinal=1 OR EXISTS(SELECT FROM unnest(fields) AS c(cell) WHERE cell<>'');
 IF jsonb_array_length(reported) NOT BETWEEN 2 AND 5001 OR reported->0 IS DISTINCT FROM header THEN
  RAISE EXCEPTION 'launch_twse_close_header_or_rows';
 END IF;
 IF EXISTS(SELECT FROM jsonb_array_elements(reported) WITH ORDINALITY r(row_item,ordinal) WHERE ordinal>1
  AND (jsonb_array_length(row_item)<>9 OR row_item->>0 IS DISTINCT FROM source_day
       OR row_item->>1 !~ '^[0-9A-Za-z]{2,12}$'))
 OR EXISTS(SELECT FROM jsonb_array_elements(reported) WITH ORDINALITY r(row_item,ordinal) WHERE ordinal>1
            GROUP BY row_item->>1 HAVING count(*)>1) THEN
  RAISE EXCEPTION 'launch_twse_close_payload_date_or_identity';
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_array(row_item->>1,
  CASE WHEN btrim(row_item->>3) IN('','-','--','---') THEN NULL
       ELSE public.vnext_launch_csv_decimal_v1(row_item->>3) END)
  ORDER BY (row_item->>1) COLLATE "C"),'[]'::jsonb) INTO result
 FROM jsonb_array_elements(reported) WITH ORDINALITY r(row_item,ordinal)
 WHERE ordinal>1 AND row_item->>1 ~ '^[0-9]{4}$';
 RETURN jsonb_build_object('reportedRows',jsonb_array_length(reported)-1,'quotes',result);
END $rows$;

-- Use effective report-session identities before matching symbols. The
-- signal roster alone cannot substitute for an identity at an older close.
CREATE FUNCTION public.vnext_launch_twse_close_report_identities_v1(report_close timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $identity$
DECLARE selected jsonb; has_conflict boolean;
BEGIN
 IF report_close IS NULL OR NOT isfinite(report_close) OR report_close>statement_timestamp() THEN RETURN NULL;END IF;
 PERFORM public.opportunity_authority_selected_stream_count_v3_internal('instrument_roster',report_close);
 WITH active AS MATERIALIZED (
  SELECT h.* FROM public.vnext_launch_breadth_roster_heads_v1(report_close) h
  WHERE h.listing_status='active' AND (h.valid_to IS NULL OR h.valid_to>report_close)
 ), usable AS MATERIALIZED (
  SELECT h.* FROM active h WHERE h.instrument_type='common_stock' AND h.exchange='TWSE' AND h.symbol~'^[0-9]{4}$'
 )
 SELECT jsonb_agg(jsonb_build_array(stock_id,symbol,instrument_authority_id) ORDER BY stock_id),
  EXISTS(SELECT FROM usable u JOIN active a ON a.symbol=u.symbol AND a.stock_id<>u.stock_id)
   OR EXISTS(SELECT FROM usable u WHERE u.provider::text IS DISTINCT FROM 'twse' OR u.source_timestamp>u.recorded_at)
 INTO selected,has_conflict FROM usable;
 RETURN CASE WHEN has_conflict THEN NULL ELSE selected END;
EXCEPTION WHEN SQLSTATE 'PT409' THEN RETURN NULL;
END $identity$;
ALTER FUNCTION public.vnext_launch_twse_close_report_identities_v1(timestamptz) OWNER TO opportunity_v3_rpc_owner;
REVOKE ALL ON FUNCTION public.vnext_launch_twse_close_report_identities_v1(timestamptz) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.vnext_launch_twse_close_report_identities_v1(timestamptz) TO stockinsider_vnext_owner;

-- The evidence lock here means only that the input can be prepared. It can
-- never substitute for append, commit witness, or future revocation checks.
CREATE FUNCTION public.vnext_launch_twse_close_prepare_v1(
 report_day date,signal_day date,selection_cutoff timestamptz,observed_at timestamptz,raw_sha text,body bytea
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC' AS $prepare$
DECLARE at timestamptz:=statement_timestamp(); source_profile jsonb;
 policy public.vnext_source_policies_v1; roster jsonb; calendar jsonb; session_row jsonb; fresh_rows jsonb; head jsonb;
 parsed jsonb;facts jsonb;report_identities jsonb;rights_hash text;known_at timestamptz;
BEGIN
 source_profile:=public.vnext_launch_twse_close_profile_v1(report_day);
 IF source_profile IS NULL OR signal_day IS NULL OR selection_cutoff IS NULL OR NOT isfinite(selection_cutoff) OR selection_cutoff>at
  OR (selection_cutoff AT TIME ZONE 'Asia/Taipei')::date IS DISTINCT FROM signal_day
  OR observed_at IS NULL OR NOT isfinite(observed_at) OR observed_at>selection_cutoff
  OR selection_cutoff<(source_profile->>'catalogKnownAt')::timestamptz
  OR raw_sha IS NULL OR raw_sha !~ '^[a-f0-9]{64}$' OR body IS NULL
  OR octet_length(body) NOT BETWEEN 2 AND 500000 OR encode(sha256(body),'hex') IS DISTINCT FROM raw_sha THEN RETURN NULL;END IF;
 SELECT * INTO policy FROM public.vnext_source_policies_v1 p
 WHERE p.source='official' AND p.scope='official_original' AND p.enabled AND p.valid_until>at;
 IF policy.source IS NULL THEN RETURN NULL;END IF;
 rights_hash:=public.vnext_launch_csv_hash_v1(jsonb_build_array('twse-11764-private-close-purpose-v1',source_profile,to_jsonb(policy)));

 calendar:=public.vnext_launch_calendar_v1('TWSE',signal_day,selection_cutoff,240);
 SELECT value INTO session_row FROM jsonb_array_elements(calendar->'sessions') WITH ORDINALITY r(value,ordinal)
 WHERE ordinal>210 AND value->>'session_id'=report_day::text;
 IF session_row->>'session_authority_id' IS NULL OR (session_row->>'close_at')::timestamptz IS NULL
  OR (session_row->>'close_at')::timestamptz>observed_at THEN RETURN NULL; END IF;
 fresh_rows:=public.vnext_launch_today_calendar_internal_v1(report_day,at);
 SELECT value INTO head FROM jsonb_array_elements(fresh_rows) WHERE value->>'market'='TWSE'
 ORDER BY (value->>'recorded_at')::timestamptz DESC,value->>'session_authority_id' LIMIT 1;
 IF head->>'status' IS DISTINCT FROM 'completed' OR head->>'provider' IS DISTINCT FROM 'twse'
  OR head->>'session_authority_id' IS DISTINCT FROM session_row->>'session_authority_id'
  OR head->>'close_at' IS DISTINCT FROM session_row->>'close_at'
  OR EXISTS(SELECT FROM jsonb_array_elements(fresh_rows) WHERE value->>'market'='TWSE' AND value->>'recorded_at'=head->>'recorded_at'
   AND value-'session_authority_id' IS DISTINCT FROM head-'session_authority_id') THEN RETURN NULL;END IF;
 roster:=public.vnext_launch_breadth_roster_v1(signal_day,selection_cutoff);
 IF roster IS NULL THEN RETURN NULL; END IF;
 report_identities:=public.vnext_launch_twse_close_report_identities_v1((session_row->>'close_at')::timestamptz);
 IF report_identities IS NULL THEN RETURN NULL;END IF;
 parsed:=public.vnext_launch_twse_close_rows_v1(report_day,body);
 SELECT coalesce(jsonb_agg(jsonb_build_object('stockId',member->>0,'symbol',member->>1,'rawClose',item->1,
    'reportInstrumentAuthorityId',report_identity->>2)
  ORDER BY (member->>1) COLLATE "C"),'[]'::jsonb) INTO facts
 FROM jsonb_array_elements(roster->'members') AS m(member)
 JOIN jsonb_array_elements(report_identities) AS i(report_identity)
  ON report_identity->>0=member->>0 AND report_identity->>1=member->>1
 JOIN jsonb_array_elements(parsed->'quotes') AS q(item) ON item->>0=member->>1
 WHERE member->>2='TWSE';
 IF jsonb_array_length(facts)=0 THEN RETURN NULL;END IF;
 known_at:=greatest(at,observed_at,(roster->>'knownAt')::timestamptz,(source_profile->>'catalogKnownAt')::timestamptz);
 RETURN jsonb_build_object('preparedAt',known_at,'selectionCutoff',selection_cutoff,'observedAt',observed_at,'rawSha256',raw_sha,
  'profile',source_profile,'rightsBindingHash',rights_hash,'registeredRosterManifestHash',roster->>'rosterManifestHash',
  'registeredRosterCount',roster->'eligibleByVenue'->'TWSE','calendarRevision',calendar->>'calendarRevision',
  'sessionAuthorityId',session_row->>'session_authority_id','sessionCloseAt',session_row->>'close_at',
  'reportedRows',parsed->'reportedRows','facts',facts);
END $prepare$;

DO $owners$
DECLARE signature text;
BEGIN
 FOREACH signature IN ARRAY ARRAY[
  'vnext_launch_twse_close_profile_v1(date)','vnext_launch_twse_close_rows_v1(date,bytea)',
  'vnext_launch_twse_close_prepare_v1(date,date,timestamptz,timestamptz,text,bytea)'
 ] LOOP
  EXECUTE 'ALTER FUNCTION public.'||signature||' OWNER TO stockinsider_vnext_owner';
  EXECUTE 'REVOKE ALL ON FUNCTION public.'||signature||' FROM PUBLIC,anon,authenticated,service_role';
 END LOOP;
END $owners$;
COMMIT;
