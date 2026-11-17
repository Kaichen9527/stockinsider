-- Resolve a full head at the evidence cutoff, without limiting older valid history.
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';
SELECT pg_advisory_xact_lock(610091002);
SELECT pg_advisory_xact_lock(2409,6002);
SELECT pg_advisory_xact_lock(64221022);

DO $roster_head$
DECLARE
 target_oid oid:=to_regprocedure('public.vnext_launch_instrument_v1(text,timestamptz)');
 prior_metadata jsonb;
BEGIN
 SELECT to_jsonb(p)-'prosrc' INTO prior_metadata FROM pg_proc p
 WHERE p.oid=target_oid AND p.prosecdef AND p.provolatile='s' AND p.proowner=to_regrole('opportunity_v3_rpc_owner')
 AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')='e76b2631192dbb8a6dc08ca7d90b01baff576d628c6f0c9549494b618365a833';
 IF prior_metadata IS NULL THEN RAISE EXCEPTION 'launch_instrument_reviewed_predecessor_required';END IF;
 EXECUTE $replace$
CREATE OR REPLACE FUNCTION public.vnext_launch_instrument_v1(target text,cutoff timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $instrument$
DECLARE head public.stock_instruments_v3;
BEGIN
 IF target IS NULL OR target!~'^[0-9]{4}$' OR cutoff IS NULL OR NOT isfinite(cutoff)
  OR cutoff>clock_timestamp() THEN RETURN NULL;END IF;
 SELECT i.* INTO head FROM public.stock_instruments_v3 i
 WHERE i.symbol=target AND i.recorded_at<=cutoff AND i.source_timestamp<=cutoff
 ORDER BY i.recorded_at DESC,i.instrument_authority_id LIMIT 1;
 IF NOT FOUND THEN RETURN NULL;END IF;
 -- Every row tied at the head clock must agree on the complete authority tuple.
 IF EXISTS(SELECT FROM public.stock_instruments_v3 i
 WHERE i.symbol=target AND i.recorded_at=head.recorded_at AND i.source_timestamp<=cutoff
 AND ROW(i.stock_id,i.exchange,i.instrument_type,i.listing_status,i.provider,i.roster_version,
   i.source_timestamp,i.valid_from,i.valid_to)
 IS DISTINCT FROM ROW(head.stock_id,head.exchange,head.instrument_type,head.listing_status,head.provider,head.roster_version,
   head.source_timestamp,head.valid_from,head.valid_to)) THEN RETURN NULL;END IF;
 -- Read the full head before checking its interval or provider. Status and
 -- instrument type remain visible so ranking can record a known exclusion.
 IF head.roster_version IS DISTINCT FROM 'tw-instrument-roster-v3.0'
  OR head.exchange IS NULL OR head.exchange NOT IN('TWSE','TPEX')
  OR head.provider::text IS DISTINCT FROM lower(head.exchange::text) OR NOT isfinite(head.source_timestamp)
  OR NOT isfinite(head.recorded_at) OR head.valid_from IS NULL OR NOT isfinite(head.valid_from)
  OR head.source_timestamp>head.recorded_at OR head.valid_from>cutoff
  OR (head.valid_to IS NOT NULL AND (NOT isfinite(head.valid_to) OR head.valid_to<=cutoff))
  THEN RETURN NULL;END IF;
 IF EXISTS(SELECT FROM public.stock_instruments_v3 other WHERE other.stock_id=head.stock_id AND other.symbol<>target
  AND other.recorded_at<=cutoff AND other.source_timestamp<=cutoff
  AND other.valid_from<=cutoff AND (other.valid_to IS NULL OR other.valid_to>cutoff))
 OR EXISTS(SELECT FROM public.stock_instruments_v3 other WHERE other.symbol=target AND other.stock_id<>head.stock_id
  AND other.recorded_at<=cutoff AND other.source_timestamp<=cutoff
  AND other.valid_from<=cutoff AND (other.valid_to IS NULL OR other.valid_to>cutoff))
 THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('id',head.instrument_authority_id,'stockId',head.stock_id,'symbol',head.symbol,
  'exchange',head.exchange,'instrumentType',head.instrument_type,'listingStatus',head.listing_status,
  'provider',head.provider,'rosterVersion',head.roster_version,'sourceAt',head.source_timestamp,
  'recordedAt',head.recorded_at,'validFrom',head.valid_from,'validTo',head.valid_to);
END $instrument$;
 $replace$;
 IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE p.oid=target_oid) IS DISTINCT FROM prior_metadata
 THEN RAISE EXCEPTION 'launch_instrument_predecessor_metadata_changed';END IF;
END $roster_head$;

-- A bounded server batch uses the identical head seen by ranking. No relation
-- grants are added, and the response contains only the existing cache fields.
CREATE FUNCTION public.vnext_screen_roster_heads_v1(p_symbols text[],p_cutoff timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public
SET statement_timeout='12s' SET lock_timeout='2s' AS $screen_roster$
DECLARE heads jsonb;
BEGIN
 IF p_symbols IS NULL OR cardinality(p_symbols)>220
  OR (cardinality(p_symbols)>0 AND array_ndims(p_symbols) IS DISTINCT FROM 1)
  OR p_cutoff IS NULL OR NOT isfinite(p_cutoff) OR p_cutoff>statement_timestamp()
  OR EXISTS(SELECT FROM unnest(p_symbols) symbol WHERE symbol IS NULL OR symbol!~'^[0-9]{4}$')
  OR cardinality(p_symbols)<>(SELECT count(DISTINCT symbol) FROM unnest(p_symbols) symbol)
 THEN RAISE EXCEPTION 'vnext_screen_roster_scope_invalid';END IF;
 WITH selected AS MATERIALIZED(
  SELECT symbol,public.vnext_launch_instrument_v1(symbol,p_cutoff) AS head
  FROM unnest(p_symbols) symbol
 )
 SELECT coalesce(jsonb_object_agg(symbol,CASE WHEN head IS NULL THEN NULL ELSE jsonb_build_object(
  'instrument_authority_id',head->'id','stock_id',head->'stockId','symbol',head->'symbol','exchange',head->'exchange',
  'instrument_type',head->'instrumentType','listing_status',head->'listingStatus','provider',head->'provider',
  'roster_version',head->'rosterVersion','source_timestamp',head->'sourceAt','recorded_at',head->'recordedAt',
  'valid_from',head->'validFrom','valid_to',head->'validTo') END),'{}'::jsonb) INTO heads FROM selected;
 RETURN heads;
END $screen_roster$;
ALTER FUNCTION public.vnext_screen_roster_heads_v1(text[],timestamptz) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_screen_roster_heads_v1(text[],timestamptz) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.vnext_screen_roster_heads_v1(text[],timestamptz) TO service_role;
COMMIT;
