-- Construct the adjusted part of a chart from the private ranked basis.
-- This selector has no public grant. Persist and license a full chart separately.
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='2s';

CREATE FUNCTION public.vnext_launch_chart_adjusted_internal_v1(p_ranking_run_id uuid,p_symbol text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC' SET extra_float_digits=3 AS $$
DECLARE
 basis jsonb;
 stored_price jsonb;
 raw_rows jsonb;
 sessions jsonb;
 raw_bar jsonb;
 day_row jsonb;
 action jsonb;
 target_event jsonb;
 terms jsonb;
 receipt jsonb;
 actions jsonb[]:='{}';
 adjusted jsonb[]:='{}';
 event_positions integer[]:='{}';
 event_factors double precision[]:='{}';
 factor double precision;
 adjusted_open double precision;
 adjusted_high double precision;
 adjusted_low double precision;
 adjusted_close double precision;
 cutoff timestamptz;
 known_at timestamptz;
 day date;
 stock uuid;
 venue text;
 size integer;
 i integer;
 j integer;
BEGIN
 basis:=public.vnext_launch_chart_basis_internal_v1(p_ranking_run_id,p_symbol);
 IF basis IS NULL THEN RETURN NULL;END IF;
 cutoff:=(basis->>'cutoff')::timestamptz;
 known_at:=(basis->>'knownAt')::timestamptz;
 raw_rows:=basis->'rawRows';
 sessions:=basis->'calendar'->'sessions';
 size:=jsonb_array_length(raw_rows);
 stock:=(raw_rows->0->>'stock_id')::uuid;
 venue:=raw_rows->0->>'exchange';
 SELECT source_inputs->'price' INTO stored_price FROM public.vnext_launch_score_evidence_v1
 WHERE score_revision=(basis->>'scoreRevision')::uuid AND symbol=p_symbol AND input_cutoff=cutoff;
 IF NOT FOUND OR jsonb_typeof(stored_price->'bars') IS DISTINCT FROM 'array'
  OR jsonb_typeof(stored_price->'actions') IS DISTINCT FROM 'array' THEN RETURN NULL;END IF;
 IF jsonb_array_length(stored_price->'bars')<>240 OR jsonb_array_length(stored_price->'actions')<>239
  OR stored_price->>'actionsRevision' IS DISTINCT FROM public.vnext_launch_csv_hash_v1(stored_price->'actions') THEN RETURN NULL;END IF;

 -- Adjustment applies to dates strictly before the action. The first bar
 -- needs no preceding transition. Missing snapshots cannot imply identity.
 FOR i IN 1..size-1 LOOP
  day_row:=sessions->i;
  day:=(day_row->>'session_id')::date;
  action:=public.vnext_launch_action_day_v1(venue,(day_row->>'session_authority_id')::uuid,day,p_symbol,cutoff);
  IF action IS NULL OR action ? 'gap' OR NOT action ? 'targetEvent' THEN RETURN NULL;END IF;
  known_at:=greatest(known_at,(action->>'knownAt')::timestamptz);
  target_event:=action->'targetEvent';
  IF target_event<>'null'::jsonb THEN
   IF terms IS NULL THEN
    terms:=coalesce(public.vnext_action_terms_current_internal_v1(stock,p_symbol,cutoff),'{}'::jsonb);
   END IF;
   SELECT value INTO receipt FROM jsonb_array_elements(terms->'receipts') r
   WHERE r->'event'->>'snapshotId'=action->>'snapshotId' AND r->'event'->'ordinal'=target_event->'event_ordinal';
   -- Apply the existing CA-D1 decision to the whole chart window.
   IF receipt IS NULL OR target_event->>'event_kind' IS DISTINCT FROM 'par_value_change'
    OR receipt->'event'->>'kind' IS DISTINCT FROM 'par_value_change'
    OR (receipt->'terms'->>'cashDividendPerOldShare')::numeric IS DISTINCT FROM 0::numeric
    OR (receipt->'terms'->>'cashReturnPerOldShare')::numeric IS DISTINCT FROM 0::numeric
    OR (receipt->'terms'->>'subscriptionCashPerOldShare')::numeric IS DISTINCT FROM 0::numeric
    OR coalesce(receipt->>'receiptHash','')!~'^[a-f0-9]{64}$' THEN RETURN NULL;END IF;
   known_at:=greatest(known_at,(receipt->'source'->>'knownAt')::timestamptz);
   action:=action||jsonb_build_object('typedTermsReceipt',receipt->>'receiptHash');
   event_positions:=array_append(event_positions,i);
   event_factors:=array_append(event_factors,(target_event->>'daily_adjustment_factor')::double precision);
  END IF;
  actions:=array_append(actions,action);
 END LOOP;
 IF known_at IS NULL OR known_at>cutoff
  OR to_jsonb(actions[(size-239):(size-1)]) IS DISTINCT FROM stored_price->'actions' THEN RETURN NULL;END IF;

 -- Multiply only the applicable event factors, in the same ascending
 -- binary64 order used for the ranking score. A reverse suffix product can
 -- round differently and would break the exact overlap check.
 FOR i IN 0..size-1 LOOP
  factor:=1::double precision;
  FOR j IN 1..cardinality(event_positions) LOOP
   IF event_positions[j]>i THEN factor:=factor*event_factors[j];END IF;
  END LOOP;
  raw_bar:=raw_rows->i;
  adjusted_open:=(raw_bar->>'raw_open')::double precision*factor;
  adjusted_high:=(raw_bar->>'raw_high')::double precision*factor;
  adjusted_low:=(raw_bar->>'raw_low')::double precision*factor;
  adjusted_close:=(raw_bar->>'raw_close')::double precision*factor;
  IF NOT public.vnext_launch_finite_v1(factor) OR factor<=0
   OR NOT public.vnext_launch_finite_v1(adjusted_open) OR NOT public.vnext_launch_finite_v1(adjusted_high)
   OR NOT public.vnext_launch_finite_v1(adjusted_low) OR NOT public.vnext_launch_finite_v1(adjusted_close)
   OR adjusted_low<=0 THEN RETURN NULL;END IF;
  adjusted:=array_append(adjusted,jsonb_build_object(
   'session',raw_bar->'session_id','observationId',raw_bar->'observation_id','calendarId',raw_bar->'session_authority_id',
   'rawOpen',raw_bar->'raw_open','rawHigh',raw_bar->'raw_high','rawLow',raw_bar->'raw_low','rawClose',raw_bar->'raw_close',
   'factor',factor,'open',adjusted_open,'high',adjusted_high,'low',adjusted_low,'close',adjusted_close));
 END LOOP;
 IF to_jsonb(adjusted[(size-239):size]) IS DISTINCT FROM stored_price->'bars' THEN RETURN NULL;END IF;

 RETURN jsonb_build_object('schemaVersion','launch-chart-private-adjusted-v1','rankingRunId',p_ranking_run_id,
  'scoreRevision',basis->'scoreRevision','cutoff',cutoff,'knownAt',known_at,'symbol',p_symbol,
  'displayFrom',basis->'calendar'->'displayFrom','throughSession',basis->'calendar'->'throughSession','warmupSessions',239,
  'priceRevision',basis->'scorePriceRevision','calendarRevision',stored_price->'calendarRevision',
  'actionsRevision',stored_price->'actionsRevision','chartCalendarRevision',basis->'calendar'->'calendarRevision',
  'chartActionRevision',public.vnext_launch_csv_hash_v1(to_jsonb(actions)),'actionPins',to_jsonb(actions),'bars',to_jsonb(adjusted),
  'adjustedSeriesRevision',public.vnext_launch_csv_hash_v1(jsonb_build_array('launch-chart-private-adjusted-v1',
   basis->>'rawSeriesRevision',stored_price->>'priceRevision',stored_price->>'actionsRevision',to_jsonb(actions),to_jsonb(adjusted))));
EXCEPTION WHEN numeric_value_out_of_range THEN RETURN NULL;
END $$;
ALTER FUNCTION public.vnext_launch_chart_adjusted_internal_v1(uuid,text) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_launch_chart_adjusted_internal_v1(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
