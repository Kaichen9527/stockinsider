-- Candidate only. Reuses the existing vNext admitted post-close cycle and writer lease.
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';
SELECT pg_advisory_xact_lock(610091002);
SELECT pg_advisory_xact_lock(2409,6002);
SELECT pg_advisory_xact_lock(64221022);

CREATE FUNCTION public.vnext_launch_outcome_batch_v1(p_principal text,p_lease_owner uuid,p_as_of timestamptz,
 p_limit integer DEFAULT 16) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC' SET statement_timeout='20s' SET lock_timeout='2s' AS $$
DECLARE rights jsonb;backend jsonb;context jsonb;mode public.vnext_launch_ranking_mode_v1;
 signal_batch jsonb;calendars jsonb:='{}'::jsonb;calendar jsonb;floor_day date;cutoff_day date;
 market_name text;receipts jsonb;available timestamptz;due_count integer;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' OR p_as_of IS NULL
  OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 32 THEN RAISE EXCEPTION 'launch_outcome_batch_request';END IF;
 rights:=public.vnext_launch_csv_policy_v1(p_principal);
 backend:=public.vnext_launch_csv_backend_v1(p_lease_owner);
 SELECT * INTO mode FROM public.vnext_launch_ranking_mode_v1 WHERE singleton;
 IF mode.enabled IS DISTINCT FROM true OR mode.required_writer_release IS NULL
  OR mode.required_writer_release IS DISTINCT FROM backend->>'writerRelease'
  OR mode.required_writer_release IS DISTINCT FROM rights->>'requiredWriterRelease'
  THEN RAISE EXCEPTION 'launch_outcome_reviewed_writer_required';END IF;
 context:=public.vnext_launch_cycle_context_v1(p_principal);
 IF context->>'ready' IS DISTINCT FROM 'true' OR (context->>'cutoff')::timestamptz IS DISTINCT FROM p_as_of
  THEN RAISE EXCEPTION 'launch_outcome_cycle_cutoff_changed';END IF;
 cutoff_day:=(context->>'session')::date;

 WITH due AS MATERIALIZED(
  SELECT s.ranking_run_id,s.symbol,s.market,s.signal_session,latest.as_of
  FROM public.vnext_launch_outcome_signals_v1 s
  LEFT JOIN LATERAL(
   SELECT v.as_of,v.result FROM public.vnext_launch_outcome_versions_v1 v
   WHERE v.ranking_run_id=s.ranking_run_id AND v.symbol=s.symbol AND v.policy_version='launch-outcomes-v1'
   ORDER BY v.as_of DESC LIMIT 1
  ) latest ON true
  WHERE s.published_at<=p_as_of AND s.signal_session BETWEEN cutoff_day-370 AND cutoff_day
   AND (latest.as_of IS NULL OR latest.as_of<p_as_of)
   AND NOT coalesce(latest.result#>>'{research,horizons,2,state}'='ready' AND
    (latest.result#>>'{execution,status}'='unfillable' OR latest.result#>>'{execution,horizons,2,state}'='ready'),false)
 ), ring AS(
  SELECT due.*,count(*) OVER()::integer AS total,row_number() OVER(ORDER BY signal_session,ranking_run_id,symbol)-1 AS n
  FROM due
 ), rotated AS(
  -- Move the starting position daily. A permanently incomplete symbol cannot
  -- always occupy the first batch and block every other qualified signal.
  SELECT ring.*,(n+total-((cutoff_day-date '2000-01-01')::bigint*p_limit)%total)%total AS position FROM ring
 ), selected AS(
  SELECT * FROM rotated ORDER BY position LIMIT p_limit
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object('rankingRunId',ranking_run_id,'symbol',symbol,
  'market',market,'session',signal_session) ORDER BY position),'[]'::jsonb),
  coalesce(max(selected.total),0) INTO signal_batch,due_count FROM selected;

 FOR market_name IN SELECT DISTINCT value->>'market' FROM jsonb_array_elements(signal_batch) LOOP
  SELECT min((value->>'session')::date) INTO floor_day FROM jsonb_array_elements(signal_batch) WHERE value->>'market'=market_name;
  receipts:=public.vnext_launch_annual_rows_internal_v1(market_name,floor_day,cutoff_day+30,p_as_of);
  IF receipts IS NULL OR jsonb_array_length(receipts)=0 THEN
   calendars:=calendars||jsonb_build_object(market_name,NULL);CONTINUE;
  END IF;
  -- Pick all session heads by actual receipt availability. Ties with different
  -- content are ambiguous, regardless of job ordering.
  IF EXISTS(WITH ranked AS(
    SELECT receipt,dense_rank() OVER(PARTITION BY receipt#>>'{row,session}' ORDER BY (receipt->>'knownAt')::timestamptz DESC) priority
    FROM jsonb_array_elements(receipts) receipt
   ) SELECT FROM ranked WHERE priority=1 GROUP BY receipt#>>'{row,session}' HAVING count(DISTINCT receipt->'row')>1)
  THEN calendars:=calendars||jsonb_build_object(market_name,NULL);CONTINUE;END IF;
  SELECT jsonb_agg(row ORDER BY row->>'session'),max(known_at) INTO calendar,available FROM(
   SELECT DISTINCT ON(receipt#>>'{row,session}') (receipt->'row')||jsonb_build_object('appliedOfficialReceipt',receipt-'row') row,
    (receipt->>'knownAt')::timestamptz known_at
   FROM jsonb_array_elements(receipts) receipt
   ORDER BY receipt#>>'{row,session}',(receipt->>'knownAt')::timestamptz DESC,receipt->>'jobId',receipt->>'chunkHash'
  ) chosen;
  IF calendar IS NULL OR jsonb_array_length(calendar)>401 OR available IS NULL OR available>p_as_of
  THEN calendars:=calendars||jsonb_build_object(market_name,NULL);CONTINUE;END IF;
  calendars:=calendars||jsonb_build_object(market_name,jsonb_build_object('schema','official-calendar-acquisition-v3.14',
   'availableAt',available,'calendarSessions',calendar));
 END LOOP;
 RETURN jsonb_build_object('schemaVersion','vnext-launch-outcome-batch-v1','asOf',p_as_of,
  'available',due_count,'signals',signal_batch,'calendars',calendars);
END $$;
ALTER FUNCTION public.vnext_launch_outcome_batch_v1(text,uuid,timestamptz,integer) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_launch_outcome_batch_v1(text,uuid,timestamptz,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.vnext_launch_outcome_batch_v1(text,uuid,timestamptz,integer) TO service_role;
COMMIT;
