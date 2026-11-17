-- Use reconciled issuer terms and official reference prices for technical
-- breadth only. No target, return simulation, or full market gate is changed.
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='2s';
SELECT pg_advisory_xact_lock(64221022);

CREATE FUNCTION public.vnext_launch_breadth_action_factor_v1(
 action jsonb,receipt jsonb,preceding_close double precision,has_adjacent_close boolean
) RETURNS double precision
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $factor$
DECLARE kind text:=action->>'kind';terms jsonb:=receipt->'terms';
 before_ref numeric;after_ref numeric;old_shares numeric;new_shares numeric;dividend numeric;cash_return numeric;subscription numeric;
 result double precision;
BEGIN
 IF kind IS NULL OR kind NOT IN('par_value_change','ex_right_dividend','capital_reduction')
  OR receipt->'event'->>'kind' IS DISTINCT FROM kind OR receipt->'event'->>'session' IS DISTINCT FROM action->>'session'
  OR action->>'session' IS NULL OR action->>'sourceRowRef' IS NULL
  OR action->>'snapshotId' IS NULL OR action->>'ordinal' IS NULL
  OR receipt->'event'->>'snapshotId' IS DISTINCT FROM action->>'snapshotId'
  OR receipt->'event'->>'ordinal' IS DISTINCT FROM action->>'ordinal'
  OR receipt->'event'->>'sourceRowRef' IS DISTINCT FROM action->>'sourceRowRef'
  OR coalesce(receipt->>'receiptHash','') !~ '^[a-f0-9]{64}$'
  OR terms->>'currency' IS DISTINCT FROM 'TWD' OR preceding_close IS NULL
  OR NOT public.vnext_launch_finite_v1(preceding_close) OR preceding_close<=0 THEN RETURN NULL;END IF;

 -- These are independently verified issuer fields. A raw reference ratio is
 -- never used to infer shares, dividend, cash return or subscription terms.
 old_shares:=(terms->>'oldShares')::numeric;new_shares:=(terms->>'newShares')::numeric;
 dividend:=(terms->>'cashDividendPerOldShare')::numeric;
 cash_return:=(terms->>'cashReturnPerOldShare')::numeric;
 subscription:=(terms->>'subscriptionCashPerOldShare')::numeric;
 before_ref:=(action->>'beforeReference')::numeric;after_ref:=(action->>'afterReference')::numeric;
 IF old_shares IS NULL OR new_shares IS NULL OR dividend IS NULL OR cash_return IS NULL
  OR before_ref IS NULL OR after_ref IS NULL OR subscription IS DISTINCT FROM 0
  OR old_shares NOT BETWEEN 1 AND 9007199254740991 OR old_shares<>trunc(old_shares)
  OR new_shares NOT BETWEEN 1 AND 9007199254740991 OR new_shares<>trunc(new_shares)
  OR dividend NOT BETWEEN 0 AND 9007199254740991 OR cash_return NOT BETWEEN 0 AND 9007199254740991
  OR before_ref NOT BETWEEN 0 AND 9007199254740991 OR before_ref=0
  OR after_ref NOT BETWEEN 0 AND 9007199254740991 OR after_ref=0
  OR preceding_close IS DISTINCT FROM before_ref::double precision THEN RETURN NULL;END IF;

 IF kind='par_value_change' THEN
  IF dividend<>0 OR cash_return<>0 OR old_shares=new_shares THEN RETURN NULL;END IF;
 ELSIF kind='ex_right_dividend' THEN
  IF has_adjacent_close IS DISTINCT FROM true OR dividend<=0 OR cash_return<>0 OR old_shares<>new_shares THEN RETURN NULL;END IF;
 ELSE
  IF dividend<>0 OR new_shares>=old_shares THEN RETURN NULL;END IF;
 END IF;
 IF before_ref<=dividend+cash_return OR after_ref*new_shares<>(before_ref-dividend-cash_return)*old_shares THEN RETURN NULL;END IF;
 result:=(after_ref::double precision)/(before_ref::double precision);
 IF NOT public.vnext_launch_finite_v1(result) OR result<=0 THEN RETURN NULL;END IF;
 RETURN result;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR division_by_zero THEN RETURN NULL;
END $factor$;
ALTER FUNCTION public.vnext_launch_breadth_action_factor_v1(jsonb,jsonb,double precision,boolean) OWNER TO opportunity_v3_rpc_owner;
REVOKE ALL ON FUNCTION public.vnext_launch_breadth_action_factor_v1(jsonb,jsonb,double precision,boolean) FROM PUBLIC,anon,authenticated,service_role;

DO $apply$
DECLARE target oid:=to_regprocedure('public.vnext_launch_breadth_supported_v1(text,date,timestamptz,jsonb)');
 original text;definition text;metadata jsonb;changed text;seam record;
BEGIN
 SELECT prosrc,pg_get_functiondef(oid),to_jsonb(p)-'prosrc' INTO original,definition,metadata FROM pg_proc p WHERE oid=target;
 IF encode(sha256(convert_to(original,'UTF8')),'hex') IS DISTINCT FROM 'cf4f90eed5f3521100ffe18c8280d664f0fd7eabd7ffa07976adae73daeec0fe'
  THEN RAISE EXCEPTION 'launch_breadth_cash_action_predecessor_changed';END IF;
 changed:=original;
 FOR seam IN SELECT * FROM(VALUES
  ($b0$ invalid_head boolean;event jsonb;terms jsonb;term_receipt jsonb;term_matches integer;factors jsonb;comparable boolean;above_ma boolean;$b0$,$a0$ invalid_head boolean;event jsonb;terms jsonb;term_receipt jsonb;term_matches integer;factors jsonb;comparable boolean;above_ma boolean;
 previous_index integer;event_position integer;factor double precision;$a0$),
  ($b1$  SELECT action_event.symbol,jsonb_agg(jsonb_build_object('position',action_day->'position','snapshotId',action_event.snapshot_id,
   'ordinal',action_event.event_ordinal,'kind',action_event.event_kind,'factor',action_event.daily_adjustment_factor)
   ORDER BY (action_day->>'position')::integer) events
$b1$,$a1$  SELECT action_event.symbol,jsonb_agg(jsonb_build_object('position',action_day->'position','session',action_day->'session',
   'snapshotId',action_event.snapshot_id,'ordinal',action_event.event_ordinal,'kind',action_event.event_kind,
   'sourceRowRef',action_event.source_row_ref,'beforeReference',action_event.pre_action_reference_price,
   'afterReference',action_event.post_action_reference_price)
   ORDER BY (action_day->>'position')::integer) events
$a1$),
  ($b2$   IF event->>'kind' IS DISTINCT FROM 'par_value_change' THEN comparable:=false;EXIT;END IF;
   IF terms IS NULL THEN terms:=public.vnext_action_terms_current_internal_v1(stock,symbol,cutoff);END IF;
   SELECT jsonb_agg(value)->0,count(*) INTO term_receipt,term_matches FROM jsonb_array_elements(terms->'receipts')
    WHERE value->'event'->>'snapshotId'=event->>'snapshotId' AND value->'event'->>'ordinal'=event->>'ordinal';
   IF term_matches<>1 OR term_receipt->'event'->>'kind' IS DISTINCT FROM 'par_value_change'
    OR coalesce(term_receipt->>'receiptHash','') !~ '^[a-f0-9]{64}$'
    OR (term_receipt->'terms'->>'cashDividendPerOldShare')::numeric IS DISTINCT FROM 0
    OR (term_receipt->'terms'->>'cashReturnPerOldShare')::numeric IS DISTINCT FROM 0
    OR (term_receipt->'terms'->>'subscriptionCashPerOldShare')::numeric IS DISTINCT FROM 0 THEN comparable:=false;EXIT;END IF;
   factors:=factors||jsonb_build_array(event||jsonb_build_object('termsReceiptHash',term_receipt->>'receiptHash'));
$b2$,$a2$   IF terms IS NULL THEN terms:=public.vnext_action_terms_current_internal_v1(stock,symbol,cutoff);END IF;
   SELECT jsonb_agg(value)->0,count(*) INTO term_receipt,term_matches FROM jsonb_array_elements(terms->'receipts')
    WHERE value->'event'->>'snapshotId'=event->>'snapshotId' AND value->'event'->>'ordinal'=event->>'ordinal';
   IF term_matches<>1 THEN comparable:=false;EXIT;END IF;
   event_position:=(event->>'position')::integer;
   SELECT max(position_index) INTO previous_index FROM generate_subscripts(positions,1) AS indices(position_index)
    WHERE positions[position_index]<event_position;
   factor:=public.vnext_launch_breadth_action_factor_v1(event,term_receipt,closes[previous_index],positions[previous_index]=event_position-1);
   IF factor IS NULL THEN comparable:=false;EXIT;END IF;
   factors:=factors||jsonb_build_array(event||jsonb_build_object('factor',factor,'termsReceiptHash',term_receipt->>'receiptHash'));
$a2$),
  ($b3$'launch-supported-breadth-v1'$b3$,$a3$'launch-supported-breadth-v2'$a3$)
 ) tokens(before_text,after_text) LOOP
  changed:=replace(changed,seam.before_text,seam.after_text);
 END LOOP;
 IF encode(sha256(convert_to(changed,'UTF8')),'hex') IS DISTINCT FROM 'b595cc49a7c90d1632ec1a7b409d508b4e4054291fbd8a70fb6c2c5c9555346a'
  THEN RAISE EXCEPTION 'launch_breadth_cash_action_successor_changed';END IF;
 EXECUTE replace(definition,original,changed);
 IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE oid=target) IS DISTINCT FROM metadata
  THEN RAISE EXCEPTION 'launch_breadth_cash_action_metadata_changed';END IF;
END $apply$;
COMMIT;
