-- Expose committed close-only facts to the private breadth owner only.
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='2s';
SELECT pg_advisory_xact_lock(64221022);

CREATE FUNCTION public.vnext_launch_twse_breadth_close_rows_v1(receipts jsonb,p_stock uuid,p_symbol text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $private_rows$
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'session',f.session_date,'rawClose',f.raw_close,'basis',jsonb_build_array('twse-11764',
   f.capture_id,c.item->>'ackId',f.report_instrument_authority_id,f.fact_hash)
 ) ORDER BY f.session_date),'[]'::jsonb)
 FROM jsonb_array_elements(receipts) c(item)
 JOIN public.vnext_launch_twse_close_facts_v1 f
  ON f.capture_id=(c.item->>'captureId')::uuid AND f.session_date=(c.item->>'session')::date
 WHERE f.stock_id=p_stock AND f.symbol=p_symbol AND f.raw_close IS NOT NULL
$private_rows$;
ALTER FUNCTION public.vnext_launch_twse_breadth_close_rows_v1(jsonb,uuid,text) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_launch_twse_breadth_close_rows_v1(jsonb,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.vnext_launch_twse_breadth_close_rows_v1(jsonb,uuid,text),
 public.vnext_launch_twse_close_committed_v1(date,timestamptz,uuid,text) TO opportunity_v3_rpc_owner;

DO $apply$
DECLARE target oid:=to_regprocedure('public.vnext_launch_breadth_supported_v1(text,date,timestamptz,jsonb)');
 original text;definition text;metadata jsonb;changed text;seam record;
BEGIN
 SELECT prosrc,pg_get_functiondef(oid),to_jsonb(p)-'prosrc' INTO original,definition,metadata FROM pg_proc p WHERE oid=target;
 IF encode(sha256(convert_to(original,'UTF8')),'hex') IS DISTINCT FROM 'b595cc49a7c90d1632ec1a7b409d508b4e4054291fbd8a70fb6c2c5c9555346a'
  THEN RAISE EXCEPTION 'launch_twse_close_breadth_predecessor_changed';END IF;
 changed:=original;
 FOR seam IN SELECT * FROM(VALUES
  ($b0$issuer jsonb;stock uuid;symbol text;raw_rows jsonb;$b0$,$a0$issuer jsonb;stock uuid;symbol text;raw_rows jsonb;close_rows jsonb;close_inventory jsonb:='[]';$a0$),
  ($b1$ first_day:=(days->0->>'session_id')::date;
$b1$,$a1$ first_day:=(days->0->>'session_id')::date;
 IF market_name='TWSE' THEN
  SELECT coalesce(jsonb_agg(r.receipt ORDER BY r.ordinal) FILTER (WHERE r.receipt IS NOT NULL),'[]'::jsonb)
  INTO close_inventory FROM (
   SELECT ordinal,public.vnext_launch_twse_close_committed_v1((d->>'session_id')::date,cutoff,
    (d->>'session_authority_id')::uuid,NULL) receipt
   FROM jsonb_array_elements(days) WITH ORDINALITY q(d,ordinal)
  ) r;
 END IF;
$a1$),
  ($b2$  raw_rows:=public.vnext_launch_price_rows_internal_v1(stock,market_name,first_day,signal_day,cutoff);
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
$b2$,$a2$  raw_rows:=public.vnext_launch_price_rows_internal_v1(stock,market_name,first_day,signal_day,cutoff);
  close_rows:=CASE WHEN market_name='TWSE' THEN public.vnext_launch_twse_breadth_close_rows_v1(close_inventory,stock,symbol)
   ELSE '[]'::jsonb END;
  IF (raw_rows IS NULL AND jsonb_array_length(close_rows)=0) OR symbol!~'^[0-9]{4}$' THEN price_gaps:=price_gaps+1;CONTINUE;END IF;
  WITH candidates AS MATERIALIZED (
   SELECT p,ordinal::integer position,dense_rank() OVER(PARTITION BY ordinal ORDER BY (p->>'source_timestamp')::timestamptz DESC,
    (p->>'collected_at')::timestamptz DESC,(p->>'recorded_at')::timestamptz DESC) preference
   FROM jsonb_array_elements(days) WITH ORDINALITY grow(day,ordinal)
   JOIN jsonb_array_elements(raw_rows) source(p) ON p->>'session_id'=day->>'session_id'
  ), latest AS MATERIALIZED (
   SELECT DISTINCT ON(position) p,position FROM candidates WHERE preference=1 ORDER BY position,p->>'observation_id'
  ), chosen AS MATERIALIZED (
   SELECT l.p,r.day,r.ordinal::integer position,alt.q,
    CASE WHEN l.p IS NULL THEN (alt.q->>'rawClose')::double precision ELSE (l.p->>'raw_close')::double precision END raw_close,
    CASE WHEN l.p IS NULL THEN alt.q->'basis'
      WHEN alt.q IS NULL THEN to_jsonb(l.p->>'observation_id')
      ELSE jsonb_build_array(l.p->>'observation_id',alt.q->'basis') END price_basis
   FROM jsonb_array_elements(days) WITH ORDINALITY r(day,ordinal)
   LEFT JOIN latest l ON l.position=r.ordinal
   LEFT JOIN jsonb_array_elements(close_rows) alt(q) ON alt.q->>'session'=r.day->>'session_id'
   WHERE l.p IS NOT NULL OR alt.q IS NOT NULL ORDER BY r.ordinal DESC LIMIT 20
  )
  SELECT
   EXISTS(SELECT FROM candidates WHERE preference=1 AND position IN(SELECT position FROM chosen) GROUP BY position HAVING count(DISTINCT(p-'observation_id'))>1)
   OR EXISTS(SELECT FROM chosen WHERE p IS NOT NULL AND
    (p->>'stock_id' IS DISTINCT FROM stock::text OR p->>'exchange' IS DISTINCT FROM market_name
     OR p->>'session_authority_id' IS DISTINCT FROM day->>'session_authority_id' OR p->>'provider' IS DISTINCT FROM lower(market_name)
     OR coalesce(p->>'source_ref','') NOT LIKE lower(market_name)||'-%' OR (p->>'source_timestamp')::timestamptz<(day->>'close_at')::timestamptz
     OR (p->>'source_timestamp')::timestamptz>(p->>'collected_at')::timestamptz
     OR (p->>'collected_at')::timestamptz>(p->>'recorded_at')::timestamptz
     OR (q IS NOT NULL AND (p->>'raw_close')::numeric IS DISTINCT FROM (q->>'rawClose')::numeric)))
   OR EXISTS(SELECT FROM chosen WHERE raw_close IS NULL OR NOT public.vnext_launch_finite_v1(raw_close) OR raw_close<=0),
   array_agg(position ORDER BY position),array_agg(raw_close ORDER BY position),jsonb_agg(price_basis ORDER BY position)
  INTO invalid_head,positions,closes,selected_ids FROM chosen;
$a2$),
  ($b3$jsonb_build_array('launch-supported-breadth-v2',market_name,signal_day,cutoff,$b3$,$a3$jsonb_build_array(CASE WHEN market_name='TWSE' AND jsonb_array_length(close_inventory)>0 THEN 'launch-supported-breadth-v3'
   ELSE 'launch-supported-breadth-v2' END,market_name,signal_day,cutoff,$a3$)
 ) tokens(before_text,after_text) LOOP
  changed:=replace(changed,seam.before_text,seam.after_text);
 END LOOP;
 IF encode(sha256(convert_to(changed,'UTF8')),'hex') IS DISTINCT FROM 'f4c189136ea389c9c7da041b8fd613ebb5c8222f0cee2c8f7c6fa08d80c04a5d'
  THEN RAISE EXCEPTION 'launch_twse_close_breadth_successor_changed';END IF;
 EXECUTE replace(definition,original,changed);
 IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE oid=target) IS DISTINCT FROM metadata
  THEN RAISE EXCEPTION 'launch_twse_close_breadth_metadata_changed';END IF;
END $apply$;
-- A new manifest can cover the same TWSE members at a new time. Keep the
-- original capture scope for its receipt and check the new membership separately.
CREATE FUNCTION public.vnext_launch_twse_close_prior_roster_covers_v1(
 older_hash text,older_cutoff timestamptz,current_roster jsonb
) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $roster_check$
DECLARE reviewed public.opportunity_manifests_v3; matches integer;
BEGIN
 IF older_hash IS NULL OR older_hash!~'^[a-f0-9]{64}$' OR older_cutoff IS NULL OR older_cutoff>statement_timestamp()
  OR current_roster->>'schemaVersion' IS DISTINCT FROM 'launch-registered-breadth-roster-v1'
  OR jsonb_typeof(current_roster->'members') IS DISTINCT FROM 'array'
  OR jsonb_array_length(current_roster->'members') NOT BETWEEN 1 AND 20000 THEN RETURN false;END IF;
 SELECT * INTO reviewed FROM public.opportunity_manifests_v3 m
 WHERE m.manifest_hash=older_hash AND m.manifest_kind='instrument_roster' AND m.status='complete'
  AND m.contract_version='tw-instrument-roster-v3.0' AND m.terminal_at<=older_cutoff AND m.source_cutoff<=m.terminal_at
  AND m.row_count BETWEEN 1 AND 20000 AND encode(sha256(m.root_canonical),'hex')=older_hash
 ORDER BY m.terminal_at DESC,m.manifest_id LIMIT 1;
 IF reviewed.manifest_id IS NULL THEN RETURN false;END IF;
 SELECT count(*) INTO matches FROM public.opportunity_manifest_rows_v3 m
 WHERE m.manifest_id=reviewed.manifest_id AND m.recorded_at<=reviewed.terminal_at;
 IF matches IS DISTINCT FROM reviewed.row_count THEN RETURN false;END IF;
 RETURN EXISTS(SELECT FROM jsonb_array_elements(current_roster->'members') c(item) WHERE item->>2='TWSE')
  AND NOT EXISTS(
   SELECT FROM jsonb_array_elements(current_roster->'members') c(item) WHERE item->>2='TWSE'
    AND NOT EXISTS(SELECT FROM public.opportunity_manifest_rows_v3 r
     WHERE r.manifest_id=reviewed.manifest_id AND r.recorded_at<=reviewed.terminal_at AND r.section_key='rows'
      AND r.terminal_code='effective_active' AND r.payload_json->>1=c.item->>0 AND r.payload_json->>2=c.item->>1
      AND r.payload_json->>3='TWSE' AND r.payload_json->>4='common_stock' AND r.payload_json->>7='twse')
  );
END $roster_check$;
ALTER FUNCTION public.vnext_launch_twse_close_prior_roster_covers_v1(text,timestamptz,jsonb) OWNER TO opportunity_v3_rpc_owner;
REVOKE ALL ON FUNCTION public.vnext_launch_twse_close_prior_roster_covers_v1(text,timestamptz,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.vnext_launch_twse_close_prior_roster_covers_v1(text,timestamptz,jsonb) TO stockinsider_vnext_owner;

DO $retain_0$
DECLARE target oid:=to_regprocedure('public.vnext_launch_twse_close_committed_v1(date,timestamptz,uuid,text)');
 original text;definition text;metadata jsonb;changed text;seam record;
BEGIN
 SELECT prosrc,pg_get_functiondef(oid),to_jsonb(p)-'prosrc' INTO original,definition,metadata FROM pg_proc p WHERE oid=target;
 IF encode(sha256(convert_to(original,'UTF8')),'hex') IS DISTINCT FROM 'd7b3871ad2b9f2e79a6b7ef9597129f3f3454f174133f2059700f3364fb1f7b9'
  THEN RAISE EXCEPTION 'launch_twse_close_roster_predecessor_changed:vnext_launch_twse_close_committed_v1';END IF;
 changed:=original;
 FOR seam IN SELECT * FROM(VALUES
  ($b0$OR p_session_id IS NULL OR p_roster_hash IS NULL OR p_roster_hash!~'^[a-f0-9]{64}$'$b0$,$a0$OR p_session_id IS NULL OR (p_roster_hash IS NOT NULL AND p_roster_hash!~'^[a-f0-9]{64}$')$a0$),
  ($b1$'rosterCount',s.roster_count,'captureCalendarRevision',s.calendar_revision)$b1$,$a1$'rosterCount',s.roster_count,'rosterSelectionCutoff',s.selection_cutoff,'captureCalendarRevision',s.calendar_revision)$a1$),
  ($b2$AND s.roster_hash=p_roster_hash AND s.roster_hash=c.pool_revision$b2$,$a2$AND (p_roster_hash IS NULL OR s.roster_hash=p_roster_hash) AND s.roster_hash=c.pool_revision$a2$)
 ) tokens(before_text,after_text) LOOP
  changed:=replace(changed,seam.before_text,seam.after_text);
 END LOOP;
 IF encode(sha256(convert_to(changed,'UTF8')),'hex') IS DISTINCT FROM 'f4b7243c830d55d2666f522e4f0c9ff453456a184f0e7f5978e7b992844d0c30'
  THEN RAISE EXCEPTION 'launch_twse_close_roster_successor_changed:vnext_launch_twse_close_committed_v1';END IF;
 EXECUTE replace(definition,original,changed);
 IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE oid=target) IS DISTINCT FROM metadata
  THEN RAISE EXCEPTION 'launch_twse_close_roster_metadata_changed:vnext_launch_twse_close_committed_v1';END IF;
END $retain_0$;

DO $retain_1$
DECLARE target oid:=to_regprocedure('public.vnext_launch_twse_close_plan_v1(text,uuid,date,integer)');
 original text;definition text;metadata jsonb;changed text;seam record;
BEGIN
 SELECT prosrc,pg_get_functiondef(oid),to_jsonb(p)-'prosrc' INTO original,definition,metadata FROM pg_proc p WHERE oid=target;
 IF encode(sha256(convert_to(original,'UTF8')),'hex') IS DISTINCT FROM '5cd5f24ea884df436fc3af0014041437c906fd2aef1cd51fa128d349c74c1920'
  THEN RAISE EXCEPTION 'launch_twse_close_roster_predecessor_changed:vnext_launch_twse_close_plan_v1';END IF;
 changed:=original;
 FOR seam IN SELECT * FROM(VALUES
  ($b0$available integer; added integer:=0; result jsonb;$b0$,$a0$available integer; added integer:=0; result jsonb; close_receipt jsonb;$a0$),
  ($b1$  IF public.vnext_launch_twse_close_committed_v1(report_day,at,report_session_id,roster->>'rosterManifestHash') IS NOT NULL THEN CONTINUE;END IF;$b1$,$a1$  close_receipt:=public.vnext_launch_twse_close_committed_v1(report_day,at,report_session_id,NULL);
  IF close_receipt IS NOT NULL AND (close_receipt->>'rosterHash'=roster->>'rosterManifestHash'
   OR public.vnext_launch_twse_close_prior_roster_covers_v1(close_receipt->>'rosterHash',
    (close_receipt->>'rosterSelectionCutoff')::timestamptz,roster)) THEN CONTINUE;END IF;$a1$)
 ) tokens(before_text,after_text) LOOP
  changed:=replace(changed,seam.before_text,seam.after_text);
 END LOOP;
 IF encode(sha256(convert_to(changed,'UTF8')),'hex') IS DISTINCT FROM '0fbbbb38e75f52a0a46529739a1a796b273c496ea6ed46807699902b09276610'
  THEN RAISE EXCEPTION 'launch_twse_close_roster_successor_changed:vnext_launch_twse_close_plan_v1';END IF;
 EXECUTE replace(definition,original,changed);
 IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE oid=target) IS DISTINCT FROM metadata
  THEN RAISE EXCEPTION 'launch_twse_close_roster_metadata_changed:vnext_launch_twse_close_plan_v1';END IF;
END $retain_1$;

COMMIT;
