-- Preserve the reviewed batch RPC and advance the work ring only on completed sessions.
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';
SELECT pg_advisory_xact_lock(610091002);
SELECT pg_advisory_xact_lock(2409,6002);
SELECT pg_advisory_xact_lock(64221022);

DO $rotation$
DECLARE
 target oid:=to_regprocedure('public.vnext_launch_outcome_batch_v1(text,uuid,timestamptz,integer)');
 definition text;
 declaration constant text:='due_count integer;';
 cutoff_anchor constant text:=$anchor$cutoff_day:=(context->>'session')::date;$anchor$;
 offset_anchor constant text:=$anchor$(cutoff_day-date '2000-01-01')::bigint*p_limit$anchor$;
BEGIN
 IF target IS NULL THEN RAISE EXCEPTION 'launch_outcome_batch_reviewed_predecessor_required';END IF;
 definition:=pg_get_functiondef(target);
 IF encode(sha256(convert_to(definition,'UTF8')),'hex')<>'2baa580e8d97ef8af185d7ece4f53e01a2eb3df85363f63a1702959ecf889656'
 OR NOT EXISTS(SELECT FROM pg_proc WHERE oid=target AND prosecdef
     AND proowner=to_regrole('stockinsider_vnext_owner'))
 THEN RAISE EXCEPTION 'launch_outcome_batch_reviewed_predecessor_required';END IF;
 definition:=replace(definition,declaration,declaration||' session_number bigint;');
 definition:=replace(definition,cutoff_anchor,cutoff_anchor||$insert$
 SELECT count(*) INTO session_number FROM public.vnext_sessions_v1
 WHERE completed AND session_date<=cutoff_day AND close_at<=p_as_of;
 IF session_number=0 THEN RAISE EXCEPTION 'launch_outcome_completed_sessions_missing';END IF;
$insert$);
 definition:=replace(definition,offset_anchor,'(session_number-1)*p_limit');
 EXECUTE definition;
END $rotation$;
COMMIT;
