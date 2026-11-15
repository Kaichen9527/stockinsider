-- Price comparability within the original three supported exchange feeds.
-- Broader capital-event coverage is unresolved; the market gate stays closed.
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='2s';
SELECT pg_advisory_xact_lock(64221022);

-- Disambiguate the SELECT aliases from the existing PL/pgSQL iterators.
DO $action_aliases$
DECLARE target oid:=to_regprocedure('public.vnext_launch_action_day_v1(text,uuid,date,text,timestamptz)');
 original text; definition text; metadata jsonb; changed text;
BEGIN
 SELECT prosrc,pg_get_functiondef(oid),to_jsonb(p)-'prosrc' INTO original,definition,metadata FROM pg_proc p WHERE oid=target;
 IF encode(sha256(convert_to(original,'UTF8')),'hex') IS DISTINCT FROM 'c07bcd37733ac56bc19ceae90042e8def5c567324a41f8ae3d2cfab58e76179a'
  THEN RAISE EXCEPTION 'launch_supported_breadth_action_predecessor_changed';END IF;
 changed:=replace(replace(original,$old_feeds$ SELECT coalesce(jsonb_agg(to_jsonb(f) ORDER BY feed_ordinal),'[]'::jsonb) INTO feeds
 FROM public.opportunity_corporate_action_feed_evidence_v3 f WHERE snapshot_id=selected.snapshot_id;
 SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY event_ordinal),'[]'::jsonb) INTO events
 FROM public.opportunity_corporate_action_events_v3 e WHERE snapshot_id=selected.snapshot_id;
 IF jsonb_array_length(feeds)<>3 OR jsonb_array_length(events)<>selected.declared_event_count
  OR (SELECT sum((f->>'parsed_row_count')::integer) FROM jsonb_array_elements(feeds) f)<>selected.declared_event_count THEN RETURN NULL;END IF;$old_feeds$,$new_feeds$ SELECT coalesce(jsonb_agg(to_jsonb(feed_row) ORDER BY feed_row.feed_ordinal),'[]'::jsonb) INTO feeds
 FROM public.opportunity_corporate_action_feed_evidence_v3 feed_row WHERE feed_row.snapshot_id=selected.snapshot_id;
 SELECT coalesce(jsonb_agg(to_jsonb(event_row) ORDER BY event_row.event_ordinal),'[]'::jsonb) INTO events
 FROM public.opportunity_corporate_action_events_v3 event_row WHERE event_row.snapshot_id=selected.snapshot_id;
 IF jsonb_array_length(feeds)<>3 OR jsonb_array_length(events)<>selected.declared_event_count
  OR (SELECT sum((feed_row->>'parsed_row_count')::integer) FROM jsonb_array_elements(feeds) feed_row)<>selected.declared_event_count THEN RETURN NULL;END IF;$new_feeds$),
  $old_tuples$ SELECT jsonb_agg(jsonb_build_array(f->>'feed_identity',f->'response_byte_count',f->>'response_sha256',f->'parsed_row_count') ORDER BY (f->>'feed_ordinal')::integer)
 INTO feed_tuples FROM jsonb_array_elements(feeds) f;
 SELECT coalesce(jsonb_agg(jsonb_build_array(e->>'symbol',e->>'event_kind',e->'pre_action_reference_price',e->'post_action_reference_price',e->>'feed_identity',e->>'source_row_ref') ORDER BY (e->>'event_ordinal')::integer),'[]'::jsonb)
 INTO event_tuples FROM jsonb_array_elements(events) e;$old_tuples$,$new_tuples$ SELECT jsonb_agg(jsonb_build_array(feed_row->>'feed_identity',feed_row->'response_byte_count',feed_row->>'response_sha256',feed_row->'parsed_row_count') ORDER BY (feed_row->>'feed_ordinal')::integer)
 INTO feed_tuples FROM jsonb_array_elements(feeds) feed_row;
 SELECT coalesce(jsonb_agg(jsonb_build_array(event_row->>'symbol',event_row->>'event_kind',event_row->'pre_action_reference_price',event_row->'post_action_reference_price',event_row->>'feed_identity',event_row->>'source_row_ref') ORDER BY (event_row->>'event_ordinal')::integer),'[]'::jsonb)
 INTO event_tuples FROM jsonb_array_elements(events) event_row;$new_tuples$);
 IF encode(sha256(convert_to(changed,'UTF8')),'hex') IS DISTINCT FROM '0b5d1e53c7da5ca564ab3f56a818ce6d9358c677ae89f71b10619058e02b4775'
  THEN RAISE EXCEPTION 'launch_supported_breadth_action_successor_changed';END IF;
 EXECUTE replace(definition,original,changed);
 IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE oid=target) IS DISTINCT FROM metadata
  THEN RAISE EXCEPTION 'launch_supported_breadth_action_metadata_changed';END IF;
END $action_aliases$;

CREATE FUNCTION public.vnext_launch_breadth_above_ma20_v1(
 closes double precision[],positions integer[],factors jsonb
) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $compare$
DECLARE i integer;event jsonb;factor double precision;product double precision;total double precision:=0;
BEGIN
 IF cardinality(closes) IS DISTINCT FROM 20 OR cardinality(positions) IS DISTINCT FROM 20
  OR array_lower(closes,1) IS DISTINCT FROM 1 OR array_lower(positions,1) IS DISTINCT FROM 1
  OR positions[20] IS DISTINCT FROM 30 OR jsonb_typeof(factors) IS DISTINCT FROM 'array' THEN RETURN NULL;END IF;
 FOR i IN 1..20 LOOP
  IF positions[i] IS NULL OR closes[i] IS NULL OR positions[i] NOT BETWEEN 1 AND 30 OR (i>1 AND positions[i]<=positions[i-1])
   OR NOT public.vnext_launch_finite_v1(closes[i]) OR closes[i]<=0 THEN RETURN NULL;END IF;
  product:=1;
  FOR event IN SELECT value FROM jsonb_array_elements(factors) ORDER BY (value->>'position')::integer LOOP
   IF (event->>'position')::integer>positions[i] THEN
    factor:=(event->>'factor')::double precision;
    IF NOT public.vnext_launch_finite_v1(factor) OR factor<=0 THEN RETURN NULL;END IF;
    product:=product*factor;
   END IF;
  END LOOP;
  IF NOT public.vnext_launch_finite_v1(product) OR product<=0 THEN RETURN NULL;END IF;
  total:=total+closes[i]*product;
 END LOOP;
 IF NOT public.vnext_launch_finite_v1(total) THEN RETURN NULL;END IF;
 RETURN closes[20] > total/20.0::double precision;
EXCEPTION WHEN numeric_value_out_of_range OR division_by_zero THEN RETURN NULL;
END $compare$;
ALTER FUNCTION public.vnext_launch_breadth_above_ma20_v1(double precision[],integer[],jsonb) OWNER TO opportunity_v3_rpc_owner;
REVOKE ALL ON FUNCTION public.vnext_launch_breadth_above_ma20_v1(double precision[],integer[],jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.vnext_launch_breadth_supported_v1(market_name text,signal_day date,cutoff timestamptz,roster jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC' SET extra_float_digits=3 AS $supported$
DECLARE calendar jsonb;days jsonb;entry jsonb;candidate_day date;first_day date;at timestamptz:=statement_timestamp();i integer;
 accepted jsonb;fresh jsonb;action_inventory jsonb:='[]';missing_action_days integer[]:='{}';events_by_symbol jsonb;
 issuer jsonb;stock uuid;symbol text;raw_rows jsonb;selected_ids jsonb;closes double precision[];positions integer[];first_position integer;
 invalid_head boolean;event jsonb;terms jsonb;term_receipt jsonb;term_matches integer;factors jsonb;comparable boolean;above_ma boolean;
 issuer_digests text[]:='{}';total_eligible integer:=0;observed integer:=0;numerator integer:=0;price_gaps integer:=0;action_gaps integer:=0;
BEGIN
 IF market_name NOT IN('TWSE','TPEX') OR signal_day IS NULL OR cutoff IS NULL OR cutoff>at
  OR roster->>'schemaVersion' IS DISTINCT FROM 'launch-registered-breadth-roster-v1'
  OR roster->>'session' IS DISTINCT FROM signal_day::text OR jsonb_typeof(roster->'members') IS DISTINCT FROM 'array'
  OR jsonb_array_length(roster->'members') NOT BETWEEN 1 AND 20000 THEN RETURN NULL;END IF;
 calendar:=public.vnext_launch_calendar_v1(market_name,signal_day,cutoff,240);
 IF calendar IS NULL THEN RETURN NULL;END IF;
 SELECT jsonb_agg(value ORDER BY ordinal) INTO days FROM jsonb_array_elements(calendar->'sessions') WITH ORDINALITY rows(value,ordinal) WHERE ordinal>210;
 IF jsonb_array_length(days) IS DISTINCT FROM 30 OR days->-1->>'session_id' IS DISTINCT FROM signal_day::text THEN RETURN NULL;END IF;
 first_day:=(days->0->>'session_id')::date;
 FOR i IN 2..30 LOOP
  entry:=days->(i-1);candidate_day:=(entry->>'session_id')::date;
  accepted:=public.vnext_launch_action_day_v1(market_name,(entry->>'session_authority_id')::uuid,candidate_day,'',cutoff);
  IF accepted->>'coverage' IS DISTINCT FROM 'supported_feeds_only' OR accepted->>'snapshotId' IS NULL
   OR accepted->>'knownAt' IS NULL OR (accepted->>'knownAt')::timestamptz>cutoff THEN
   missing_action_days:=array_append(missing_action_days,i);CONTINUE;
  END IF;
  fresh:=public.vnext_launch_action_day_v1(market_name,(entry->>'session_authority_id')::uuid,candidate_day,'',at);
  IF fresh->>'snapshotId' IS DISTINCT FROM accepted->>'snapshotId' OR fresh->>'hash' IS DISTINCT FROM accepted->>'hash' THEN
   missing_action_days:=array_append(missing_action_days,i);CONTINUE;
  END IF;
  action_inventory:=action_inventory||jsonb_build_array(jsonb_build_object('position',i,'session',candidate_day,
   'snapshotId',accepted->>'snapshotId','hash',accepted->>'hash'));
 END LOOP;

 SELECT coalesce(jsonb_object_agg(by_symbol.symbol,by_symbol.events),'{}') INTO events_by_symbol FROM (
  SELECT action_event.symbol,jsonb_agg(jsonb_build_object('position',action_day->'position','snapshotId',action_event.snapshot_id,
   'ordinal',action_event.event_ordinal,'kind',action_event.event_kind,'factor',action_event.daily_adjustment_factor)
   ORDER BY (action_day->>'position')::integer) events
  FROM jsonb_array_elements(action_inventory) action_day JOIN public.opportunity_corporate_action_events_v3 action_event
   ON action_event.snapshot_id=(action_day->>'snapshotId')::uuid
  WHERE EXISTS(SELECT FROM jsonb_array_elements(roster->'members') m
   WHERE m->>2=market_name AND m->>1=action_event.symbol)
  GROUP BY action_event.symbol
 ) by_symbol;

 FOR issuer IN SELECT value FROM jsonb_array_elements(roster->'members') WITH ORDINALITY member(value,ordinal)
  WHERE value->>2=market_name ORDER BY ordinal LOOP
  total_eligible:=total_eligible+1;stock:=(issuer->>0)::uuid;symbol:=issuer->>1;
  raw_rows:=public.vnext_launch_price_rows_internal_v1(stock,market_name,first_day,signal_day,cutoff);
  IF raw_rows IS NULL OR symbol!~'^[0-9]{4}$' THEN price_gaps:=price_gaps+1;CONTINUE;END IF;
  WITH candidates AS MATERIALIZED (
   SELECT p,day,ordinal::integer position,dense_rank() OVER(PARTITION BY ordinal ORDER BY (p->>'source_timestamp')::timestamptz DESC,
    (p->>'collected_at')::timestamptz DESC,(p->>'recorded_at')::timestamptz DESC) preference
   FROM jsonb_array_elements(days) WITH ORDINALITY grow(day,ordinal)
   JOIN jsonb_array_elements(raw_rows) source(p) ON p->>'session_id'=day->>'session_id'
  ), latest AS MATERIALIZED (
   SELECT DISTINCT ON(position) p,day,position FROM candidates WHERE preference=1 ORDER BY position,p->>'observation_id'
  ), chosen AS MATERIALIZED (
   SELECT * FROM latest ORDER BY position DESC LIMIT 20
  )
  SELECT
   EXISTS(SELECT FROM candidates WHERE preference=1 AND position IN(SELECT position FROM chosen) GROUP BY position HAVING count(DISTINCT(p-'observation_id'))>1)
   OR EXISTS(SELECT FROM chosen WHERE p->>'stock_id' IS DISTINCT FROM stock::text OR p->>'exchange' IS DISTINCT FROM market_name
    OR p->>'session_authority_id' IS DISTINCT FROM day->>'session_authority_id' OR p->>'provider' IS DISTINCT FROM lower(market_name)
    OR coalesce(p->>'source_ref','') NOT LIKE lower(market_name)||'-%' OR (p->>'source_timestamp')::timestamptz<(day->>'close_at')::timestamptz
    OR (p->>'source_timestamp')::timestamptz>(p->>'collected_at')::timestamptz
    OR (p->>'collected_at')::timestamptz>(p->>'recorded_at')::timestamptz
    OR NOT public.vnext_launch_finite_v1((p->>'raw_close')::double precision) OR (p->>'raw_close')::double precision<=0),
   array_agg(position ORDER BY position),array_agg((p->>'raw_close')::double precision ORDER BY position),
   jsonb_agg(p->>'observation_id' ORDER BY position)
  INTO invalid_head,positions,closes,selected_ids FROM chosen;
  IF invalid_head OR cardinality(positions) IS DISTINCT FROM 20 OR positions[20] IS DISTINCT FROM 30 THEN price_gaps:=price_gaps+1;CONTINUE;END IF;
  first_position:=positions[1];
  IF EXISTS(SELECT FROM unnest(missing_action_days) d WHERE d>first_position) THEN action_gaps:=action_gaps+1;CONTINUE;END IF;

  terms:=NULL;factors:='[]';comparable:=true;
  FOR event IN SELECT value FROM jsonb_array_elements(coalesce(events_by_symbol->symbol,'[]'))
   WHERE (value->>'position')::integer>first_position LOOP
   IF event->>'kind' IS DISTINCT FROM 'par_value_change' THEN comparable:=false;EXIT;END IF;
   IF terms IS NULL THEN terms:=public.vnext_action_terms_current_internal_v1(stock,symbol,cutoff);END IF;
   SELECT jsonb_agg(value)->0,count(*) INTO term_receipt,term_matches FROM jsonb_array_elements(terms->'receipts')
    WHERE value->'event'->>'snapshotId'=event->>'snapshotId' AND value->'event'->>'ordinal'=event->>'ordinal';
   IF term_matches<>1 OR term_receipt->'event'->>'kind' IS DISTINCT FROM 'par_value_change'
    OR coalesce(term_receipt->>'receiptHash','') !~ '^[a-f0-9]{64}$'
    OR (term_receipt->'terms'->>'cashDividendPerOldShare')::numeric IS DISTINCT FROM 0
    OR (term_receipt->'terms'->>'cashReturnPerOldShare')::numeric IS DISTINCT FROM 0
    OR (term_receipt->'terms'->>'subscriptionCashPerOldShare')::numeric IS DISTINCT FROM 0 THEN comparable:=false;EXIT;END IF;
   factors:=factors||jsonb_build_array(event||jsonb_build_object('termsReceiptHash',term_receipt->>'receiptHash'));
  END LOOP;
  IF NOT comparable THEN action_gaps:=action_gaps+1;CONTINUE;END IF;
  above_ma:=public.vnext_launch_breadth_above_ma20_v1(closes,positions,factors);
  IF above_ma IS NULL THEN action_gaps:=action_gaps+1;CONTINUE;END IF;
  issuer_digests:=array_append(issuer_digests,public.vnext_launch_csv_hash_v1(jsonb_build_array(stock,symbol,selected_ids,factors,above_ma)));
  observed:=observed+1;
  IF above_ma THEN numerator:=numerator+1;END IF;
 END LOOP;

 IF total_eligible=0 THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('market',market_name,'signalSession',signal_day,'rosterRevision',roster->>'rosterManifestHash',
  'calendarRevision',calendar->>'calendarRevision','actionRevision',public.vnext_launch_csv_hash_v1(action_inventory),
  'revision',public.vnext_launch_csv_hash_v1(jsonb_build_array('launch-supported-breadth-v1',market_name,signal_day,cutoff,
   roster->>'rosterManifestHash',calendar->>'calendarRevision',action_inventory,issuer_digests,total_eligible,price_gaps,action_gaps)),
  'scope','supported_feeds_only','completeCapitalCoverage',false,'qualified',false,'eligible',total_eligible,'observed',observed,
  'aboveMa20',numerator,'priceGaps',price_gaps,'actionGaps',action_gaps);
END $supported$;
ALTER FUNCTION public.vnext_launch_breadth_supported_v1(text,date,timestamptz,jsonb) OWNER TO opportunity_v3_rpc_owner;
REVOKE ALL ON FUNCTION public.vnext_launch_breadth_supported_v1(text,date,timestamptz,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.vnext_launch_breadth_supported_v1(text,date,timestamptz,jsonb) TO stockinsider_vnext_owner;

DO $apply$
DECLARE target oid:=to_regprocedure('public.vnext_launch_market_context_v1(date,timestamptz)');
 original text; definition text; metadata jsonb; changed text; seam record;
BEGIN
 SELECT prosrc,pg_get_functiondef(oid),to_jsonb(p)-'prosrc' INTO original,definition,metadata FROM pg_proc p WHERE oid=target;
 IF encode(sha256(convert_to(original,'UTF8')),'hex') IS DISTINCT FROM 'e2607e8ac43ace294d02ace84fc48d09d790f675b850034d36621465fc7bc86f'
  THEN RAISE EXCEPTION 'launch_supported_breadth_market_predecessor_changed';END IF;
 changed:=original;
 FOR seam IN SELECT * FROM(VALUES
  ($b0$tpex_cash jsonb;breadth_roster jsonb;$b0$,$a0$tpex_cash jsonb;breadth_roster jsonb;supported_breadth jsonb;$a0$),
  ($b1$ breadth_roster:=public.vnext_launch_breadth_roster_v1(signal_day,cutoff);$b1$,$a1$ breadth_roster:=public.vnext_launch_breadth_roster_v1(signal_day,cutoff);
 IF breadth_roster IS NOT NULL THEN supported_breadth:=jsonb_build_object(
  'TWSE',public.vnext_launch_breadth_supported_v1('TWSE',signal_day,cutoff,breadth_roster),
  'TPEX',public.vnext_launch_breadth_supported_v1('TPEX',signal_day,cutoff,breadth_roster));END IF;$a1$),
  ($b2$  'registeredBreadthRosterCounts',breadth_roster->'eligibleByVenue',$b2$,$a2$  'registeredBreadthRosterCounts',breadth_roster->'eligibleByVenue','supportedBreadthInputs',supported_breadth,$a2$)
 )fragments(before_text,after_text) LOOP
  IF (length(changed)-length(replace(changed,seam.before_text,'')))<>length(seam.before_text)
   THEN RAISE EXCEPTION 'launch_supported_breadth_market_seam_changed';END IF;
  changed:=replace(changed,seam.before_text,seam.after_text);
 END LOOP;
 IF encode(sha256(convert_to(changed,'UTF8')),'hex') IS DISTINCT FROM 'db977dc2be3e72ee9ab8ac365290c457cb246dafcd075c88ceeb2f24b430a349'
  THEN RAISE EXCEPTION 'launch_supported_breadth_market_successor_changed';END IF;
 EXECUTE replace(definition,original,changed);
 IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE oid=target) IS DISTINCT FROM metadata
  THEN RAISE EXCEPTION 'launch_supported_breadth_market_metadata_changed';END IF;
END $apply$;
COMMIT;
