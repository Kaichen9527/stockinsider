-- The completed-calendar reader is bound to the PostgreSQL statement snapshot.
-- Keep capture, lease and ready timestamps on their real observation clocks.
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='2s';
SELECT pg_advisory_xact_lock(64221022);

DO $turnover_plan_clock$
DECLARE target oid:=to_regprocedure('public.vnext_launch_csv_command_v1(text,uuid,text,jsonb,bytea)');
 original text;definition text;metadata jsonb;revised text;seam record;
BEGIN
 SELECT p.prosrc,pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc'
 INTO original,definition,metadata FROM pg_proc p WHERE p.oid=target;
 IF encode(sha256(convert_to(original,'UTF8')),'hex') IS DISTINCT FROM '83463af621c47a2fe07317f99cf44005dcb554c045449ae4d032533ff36f743c'
 THEN RAISE EXCEPTION 'launch_twse_turnover_plan_clock_predecessor_changed';END IF;
 revised:=original;
 FOR seam IN SELECT * FROM(VALUES
  ($prior$public.vnext_launch_twse_turnover_close_v1(session_day,at)$prior$,$next$public.vnext_launch_twse_turnover_close_v1(session_day,statement_timestamp())$next$),
  ($prior$public.vnext_launch_twse_turnover_close_v1((profile->>'sessionDate')::date,at)$prior$,$next$public.vnext_launch_twse_turnover_close_v1((profile->>'sessionDate')::date,statement_timestamp())$next$)
 ) replacements(prior,next) LOOP
  IF length(revised)-length(replace(revised,seam.prior,''))<>length(seam.prior)
  THEN RAISE EXCEPTION 'launch_twse_turnover_plan_clock_seam_changed';END IF;
  revised:=replace(revised,seam.prior,seam.next);
 END LOOP;
 IF encode(sha256(convert_to(revised,'UTF8')),'hex') IS DISTINCT FROM 'c168a3054ae972f3c988f187a896b101299ed6fbe181b78526b45dfa2157b417'
 THEN RAISE EXCEPTION 'launch_twse_turnover_plan_clock_successor_changed';END IF;
 EXECUTE replace(definition,original,revised);
 IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE p.oid=target) IS DISTINCT FROM metadata
 THEN RAISE EXCEPTION 'launch_twse_turnover_plan_clock_metadata_changed';END IF;
END $turnover_plan_clock$;
COMMIT;
