-- Bind a public-shaped chart candidate exclusively to proven public-source facts.
-- Only the existing approved 11371 chart coverage is wired by this migration.
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='2s';

CREATE INDEX vnext_launch_csv_chart_resource_head_v1 ON public.vnext_launch_csv_captures_v1(dataset_id,request_key,available_at DESC);

CREATE FUNCTION public.vnext_launch_chart_volume_internal_v1(p_ranking_run_id uuid,p_symbol text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC' SET extra_float_digits=3 AS $$
DECLARE
 score_row public.vnext_launch_score_evidence_v1;
 basis jsonb;
 adjusted jsonb;
 raw_rows jsonb;
 sessions jsonb;
 raw_bar jsonb;
 adjusted_bar jsonb;
 source_packet jsonb;
 fact jsonb;
 share_count numeric;
 shares bigint[]:='{}';
 source_pins jsonb[]:='{}';
 chart_bars jsonb[]:='{}';
 public_chart jsonb;
 cutoff_text text;
 day date;
 i integer;
 size integer;
 rights_hash text;
 known_at timestamptz;
BEGIN
 IF p_ranking_run_id IS NULL OR p_symbol IS NULL OR p_symbol!~'^[0-9]{4}$' THEN RETURN NULL;END IF;
 SELECT score.* INTO score_row FROM public.vnext_launch_ranking_members_v1 member
 JOIN public.vnext_launch_ranking_snapshots_v1 snapshot USING(ranking_run_id)
 JOIN public.vnext_launch_score_evidence_v1 score ON score.score_revision=member.score_revision
  AND score.research_revision=member.research_revision AND score.symbol=member.symbol AND score.input_hash=member.input_hash
  AND score.signal_session=snapshot.session_date AND score.input_cutoff=snapshot.input_cutoff
 WHERE member.ranking_run_id=p_ranking_run_id AND member.symbol=p_symbol AND member.rank IS NOT NULL;
 IF NOT FOUND OR score_row.source_inputs#>>'{price,rawRows,0,exchange}' IS DISTINCT FROM 'TPEX' THEN RETURN NULL;END IF;

 SELECT snapshot->>'cutoff' INTO cutoff_text FROM public.vnext_launch_ranking_snapshots_v1 WHERE ranking_run_id=p_ranking_run_id;
 IF cutoff_text IS NULL OR cutoff_text::timestamptz IS DISTINCT FROM score_row.input_cutoff THEN RETURN NULL;END IF;
 basis:=public.vnext_launch_chart_basis_internal_v1(p_ranking_run_id,p_symbol);
 IF basis IS NULL THEN RETURN NULL;END IF;
 raw_rows:=basis->'rawRows';
 sessions:=basis->'calendar'->'sessions';
 size:=jsonb_array_length(raw_rows);
 known_at:=(basis->>'knownAt')::timestamptz;

 -- Every public price, including warm-up data, requires the matching dated
 -- source. A close-only dataset, later receipt, wrong coverage or mismatched
 -- candle cannot license the chart. Share count is raw and never adjusted.
 FOR i IN 0..size-1 LOOP
  raw_bar:=raw_rows->i;
  day:=(raw_bar->>'session_id')::date;
  source_packet:=public.vnext_launch_source_fact_v1(11371,day,p_symbol,score_row.input_hash,score_row.input_cutoff);
  IF source_packet IS NULL OR source_packet->>'datasetId' IS DISTINCT FROM '11371'
   OR source_packet->>'coverage' IS DISTINCT FROM 'tpex_11371_report_excluding_fixed_price_v1'
   OR coalesce(source_packet->>'rightsRevision','')!~'^[a-f0-9]{64}$'
   OR (source_packet->>'observedAt')::timestamptz<(sessions->i->>'close_at')::timestamptz
   OR (source_packet->>'availableAt')::timestamptz>score_row.input_cutoff THEN RETURN NULL;END IF;
  IF rights_hash IS NULL THEN rights_hash:=source_packet->>'rightsRevision';END IF;
  IF rights_hash IS DISTINCT FROM source_packet->>'rightsRevision' THEN RETURN NULL;END IF;
  fact:=source_packet->'fact';
  IF fact->>'symbol' IS DISTINCT FROM p_symbol OR fact->>'session_date' IS DISTINCT FROM day::text
   OR fact->'raw_open' IS DISTINCT FROM raw_bar->'raw_open' OR fact->'raw_high' IS DISTINCT FROM raw_bar->'raw_high'
   OR fact->'raw_low' IS DISTINCT FROM raw_bar->'raw_low' OR fact->'raw_close' IS DISTINCT FROM raw_bar->'raw_close'
   OR coalesce(fact->>'fact_hash','')!~'^[a-f0-9]{64}$' THEN RETURN NULL;END IF;
  share_count:=(fact->>'shares')::numeric;
  IF share_count IS NOT NULL AND (share_count<>trunc(share_count) OR share_count NOT BETWEEN 0 AND 290554814669064)
   THEN RETURN NULL;END IF;
  shares:=array_append(shares,share_count::bigint);
  known_at:=greatest(known_at,(source_packet->>'availableAt')::timestamptz);
  source_pins:=array_append(source_pins,jsonb_build_object('session',day,'captureId',source_packet->'captureId',
   'ackId',source_packet->'ackId','factHash',fact->'fact_hash','observationId',raw_bar->'observation_id',
   'calendarId',raw_bar->'session_authority_id'));
 END LOOP;

 adjusted:=public.vnext_launch_chart_adjusted_internal_v1(p_ranking_run_id,p_symbol);
 IF adjusted IS NULL OR adjusted->>'chartCalendarRevision' IS DISTINCT FROM basis->'calendar'->>'calendarRevision'
  OR jsonb_array_length(adjusted->'bars')<>size THEN RETURN NULL;END IF;
 FOR i IN 0..size-1 LOOP
  adjusted_bar:=adjusted->'bars'->i;
  IF adjusted_bar->'observationId' IS DISTINCT FROM source_pins[i+1]->'observationId'
   OR adjusted_bar->'calendarId' IS DISTINCT FROM source_pins[i+1]->'calendarId'
   OR adjusted_bar->'session' IS DISTINCT FROM source_pins[i+1]->'session' THEN RETURN NULL;END IF;
  chart_bars:=array_append(chart_bars,jsonb_build_object('time',adjusted_bar->'session','open',adjusted_bar->'open',
   'high',adjusted_bar->'high','low',adjusted_bar->'low','close',adjusted_bar->'close','volume',shares[i+1]));
 END LOOP;

 public_chart:=jsonb_build_object('schemaVersion','launch-frozen-chart-v1','priceBasis','adjusted_to_signal_session',
  'priceRevision',adjusted->'priceRevision','calendarRevision',adjusted->'calendarRevision','actionsRevision',adjusted->'actionsRevision',
  'cutoff',cutoff_text,'throughSession',adjusted->'throughSession','displayFrom',adjusted->'displayFrom','warmupSessions',239,
  'candles',to_jsonb(chart_bars));
 RETURN jsonb_build_object('schemaVersion','launch-chart-private-publication-input-v1','rankingRunId',p_ranking_run_id,'symbol',p_symbol,
  'scoreRevision',score_row.score_revision,'knownAt',greatest(known_at,(adjusted->>'knownAt')::timestamptz),
  'datasetId',11371,'rightsRevision',rights_hash,'volumeBasis','tpex_11371_report_excluding_fixed_price_v1',
  'sourcePins',to_jsonb(source_pins),'actionPins',adjusted->'actionPins',
  'chart',public_chart||jsonb_build_object('seriesRevision',public.vnext_launch_csv_hash_v1(jsonb_build_array(
   'launch-frozen-chart-v1',adjusted->>'adjustedSeriesRevision',rights_hash,to_jsonb(source_pins),public_chart))));
END $$;
ALTER FUNCTION public.vnext_launch_chart_volume_internal_v1(uuid,text) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_launch_chart_volume_internal_v1(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
