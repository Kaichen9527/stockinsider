-- StockInsider V3.16.21 production-cardinality repair.
--
-- A frozen official-market envelope contains one acquisition timestamp.  The
-- V3.16.9 chunk applier nevertheless called the public symbol resolver once
-- per row; that resolver validates every registered instrument stream before
-- delegating to the indexed symbol resolver.  A 20-row chunk therefore ran the
-- same ~2,000-stream integrity check twenty times, making the 22,448-row
-- valuation history unable to finish inside the reviewed activation window.
--
-- Keep the deliberately small pooler-safe chunks.  Validate the complete
-- roster once at the chunk's single frozen acquisition timestamp, then use the
-- already bounded/indexed internal resolver for each row.  This changes no
-- point-in-time cutoff, conflict rule, append authority, or external grant.

BEGIN;

GRANT CREATE ON SCHEMA public TO opportunity_v3_rpc_owner;

DO $install_instrument_roster_chunk_snapshot_v3_16_21$
DECLARE
  v_definition text;
  v_rewritten text;
  v_public_call text := 'public.resolve_legacy_instrument_symbol_authority_v3_13(';
  v_internal_call text := 'public.resolve_legacy_instrument_symbol_authority_v3_13_internal(';
  v_dispatch_marker text := '  IF p_kind=''trading_sessions'' THEN';
  v_public_occurrences integer;
BEGIN
  SELECT pg_get_functiondef(
    'public.apply_legacy_official_ingestion_chunk_base_v3_15(uuid,uuid,uuid,text,integer,jsonb,text,text,timestamptz)'
      ::regprocedure
  ) INTO v_definition;

  IF position('instrument_roster_chunk_snapshot_v3_16_21' IN v_definition)>0 THEN
    RETURN;
  END IF;
  IF position('append_exchange_reported_valuation_transaction_v3_16_9' IN v_definition)=0
    OR position(v_dispatch_marker IN v_definition)=0
  THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='roster_chunk_snapshot_predecessor_shape';
  END IF;

  v_public_occurrences := (length(v_definition)-length(replace(v_definition,v_public_call,'')))
    / length(v_public_call);
  IF v_public_occurrences<>3 THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='roster_chunk_snapshot_resolver_shape';
  END IF;

  v_rewritten := replace(v_definition,v_public_call,v_internal_call);
  v_rewritten := replace(v_rewritten,v_dispatch_marker,
    $rewrite$
  -- instrument_roster_chunk_snapshot_v3_16_21: the frozen acquisition has one
  -- truthful fetchedAt, so one complete registry validation authorizes all
  -- bounded indexed symbol lookups in this transaction.
  IF p_kind IN('financial_facts','price_observations','reported_valuations') THEN
    IF (SELECT count(DISTINCT (item.value->>'collectedAt')::timestamptz)
        FROM jsonb_array_elements(p_items) item(value))<>1
    THEN
      RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='official_ingestion_mixed_acquisition_time';
    END IF;
    PERFORM public.opportunity_authority_selected_stream_count_v3_internal(
      'instrument_roster',
      (SELECT min((item.value->>'collectedAt')::timestamptz)
       FROM jsonb_array_elements(p_items) item(value))
    );
  END IF;
  IF p_kind='trading_sessions' THEN$rewrite$);

  IF v_rewritten=v_definition
    OR position('instrument_roster_chunk_snapshot_v3_16_21' IN v_rewritten)=0
    OR position(v_public_call IN v_rewritten)>0
    OR (length(v_rewritten)-length(replace(v_rewritten,v_internal_call,'')))
      / length(v_internal_call)<>3
  THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='roster_chunk_snapshot_rewrite_failed';
  END IF;
  EXECUTE v_rewritten;
END $install_instrument_roster_chunk_snapshot_v3_16_21$;

ALTER FUNCTION public.apply_legacy_official_ingestion_chunk_base_v3_15(
  uuid,uuid,uuid,text,integer,jsonb,text,text,timestamptz)
  OWNER TO opportunity_v3_rpc_owner;
REVOKE ALL ON FUNCTION public.apply_legacy_official_ingestion_chunk_base_v3_15(
  uuid,uuid,uuid,text,integer,jsonb,text,text,timestamptz)
  FROM PUBLIC,anon,authenticated,service_role;

REVOKE CREATE ON SCHEMA public FROM opportunity_v3_rpc_owner;

COMMIT;
