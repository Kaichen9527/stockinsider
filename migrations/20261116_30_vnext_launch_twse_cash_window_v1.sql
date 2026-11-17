-- Admit reported TWSE turnover into the existing point-in-time qualification.
-- Existing score, disposition, research and publication gates still apply.
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='2s';
SELECT pg_advisory_xact_lock(64221022);

DO $cash_window$
DECLARE change record; seam record; target oid;
 original text; definition text; metadata jsonb; revised text;
BEGIN
 IF to_regprocedure('public.vnext_launch_twse_turnover_derive_v1(jsonb,bytea)') IS NULL THEN
  RAISE EXCEPTION 'launch_twse_cash_window_requires_turnover_source';END IF;
 FOR change IN SELECT * FROM(VALUES
  ('public.vnext_launch_cash_calendar_internal_v1(text,uuid,text,date,timestamptz,timestamptz)','7e05007d2e8996e958e946e56d687d3a1332037e3b12e82dabc7b5323320d6e0','43c05496d31f90c464c0bfe67a33c3a238d57e79f4883432381d38d166489ec4'),
  ('public.vnext_launch_rank_preflight_v1(text,text,date,timestamptz)','2103b9f80c5448a4e0b64a57fe308c5caa0e5af496dd919f2802522d5c51a3f8','9b7f095a4a2a0aed5dc6c61ebee6fee9bbc38cd07759c3def8480ff251d7267e'),
  ('public.vnext_launch_qualification_checks_v1(text,uuid,text,jsonb,timestamptz)','5fc7333c3bccbfd19c2594757e0c0e68b88815eaac5af8766dfd5b7d57876a14','a2f1af06f96c0021d4d9ca6d29ca50bf23d8aa050a3810408ffbbbeb207c7e24'),
  ('public.vnext_launch_ranking_command_v1(text,uuid,jsonb)','5731bb3ea67e59373cc764bac2d8126527c9f56cf8e7a5886dd364267bfb3a96','1b0243ea4da21ae1ad84ac55b36cc8475f7b799bc94ced4749ef0431347ffdd3'),
  ('public.vnext_launch_live_v1(uuid,uuid,jsonb)','50dfa600cb93e04617c5ad114dd43ba4164bea10952af57a6b59fab3e3769432','5ae26c7d2036552e997dbbb1001bcc9c65cde7500e686c3c007ee25b47f4f516')
 ) AS updates(signature,predecessor,successor) LOOP
  target:=to_regprocedure(change.signature);
  SELECT p.prosrc,pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO original,definition,metadata FROM pg_proc p WHERE p.oid=target;
  IF encode(sha256(convert_to(original,'UTF8')),'hex') IS DISTINCT FROM change.predecessor THEN
   RAISE EXCEPTION 'launch_twse_cash_window_predecessor_changed:%',change.signature;END IF;
  revised:=original;
  FOR seam IN SELECT * FROM(VALUES
   ('vnext_launch_cash_calendar_internal_v1',$prior$(SELECT max((a->>'knownAt')::timestamptz) FROM jsonb_array_elements(annual) a)$prior$,$next$(SELECT max((annual_receipt.value->>'knownAt')::timestamptz) FROM jsonb_array_elements(annual) annual_receipt(value))$next$),
   ('vnext_launch_rank_preflight_v1',$prior$scope text;known_at timestamptz;cash_known_at timestamptz;identity_known_at timestamptz;venue text;reasons$prior$,$next$scope text;known_at timestamptz;cash_known_at timestamptz;identity_known_at timestamptz;venue text;
 cash_dataset integer;cash_coverage text:='tpex_11370_all_sessions_v1';reasons$next$),
   ('vnext_launch_rank_preflight_v1',$prior$ IF venue='TPEX' THEN
  calendar:=$prior$,$next$ IF venue IN('TWSE','TPEX') THEN
  cash_dataset:=CASE venue WHEN 'TWSE' THEN 11549 ELSE 11370 END;
  IF venue='TWSE' THEN cash_coverage:='twse_11549_reported_turnover_v1';END IF;
  calendar:=$next$),
   ('vnext_launch_rank_preflight_v1',$prior$f:=public.vnext_launch_source_fact_v1(11370,(c->>'session_id')::date,target,input_digest,cutoff);
    IF f IS NULL OR f->>'datasetId' IS DISTINCT FROM '11370' OR f->>'coverage' IS DISTINCT FROM 'tpex_11370_all_sessions_v1'$prior$,$next$f:=public.vnext_launch_source_fact_v1(cash_dataset,(c->>'session_id')::date,target,input_digest,cutoff);
    IF f IS NULL OR f->>'datasetId' IS DISTINCT FROM cash_dataset::text OR f->>'coverage' IS DISTINCT FROM cash_coverage$next$),
   ('vnext_launch_rank_preflight_v1',$prior$current_fact:=public.vnext_launch_source_fact_v1(11370,(c->>'session_id')::date,target,input_digest,at);$prior$,$next$current_fact:=public.vnext_launch_source_fact_v1(cash_dataset,(c->>'session_id')::date,target,input_digest,at);$next$),
   ('vnext_launch_rank_preflight_v1',$prior$'cashCurrency','TWD','cashCoverage','tpex_11370_all_sessions_v1'$prior$,$next$'cashCurrency','TWD','cashCoverage',cash_coverage$next$),
   ('vnext_launch_rank_preflight_v1',$prior$ -- Checked/expiry clocks are intentionally OUTSIDE the stable state digest.$prior$,$next$ IF venue='TWSE' AND cash_known THEN
  basis:=basis||jsonb_build_object('cashWindow',jsonb_build_object('schemaVersion','launch-twse-cash-window-v1',
   'symbol',target,'inputHash',input_digest,'stockId',current_instrument->>'stockId','signalSession',signal_day,'inputCutoff',cutoff,
   'coverage',cash_coverage,'totalNtd',sum_ntd,'inventory',inventory,'calendarRevision',calendar->>'calendarRevision'));
 END IF;
 -- Checked/expiry clocks are intentionally OUTSIDE the stable state digest.$next$),
   ('vnext_launch_qualification_checks_v1',$prior$total_ntd numeric:=0;row_item jsonb;checks$prior$,$next$total_ntd numeric:=0;row_item jsonb;cash_window jsonb;checks$next$),
   ('vnext_launch_qualification_checks_v1',$prior$ IF jsonb_array_length(selected->'institutionalInventory')=20 THEN$prior$,$next$ IF instrument->>'exchange'='TWSE' THEN
  cash_window:=selected->'cashWindow';
  -- The private ranking command freezes the exact cash window from preflight.
  -- Require the same 20 official sessions used by the selected score.
  IF cash_window->>'schemaVersion'='launch-twse-cash-window-v1'
   AND cash_window->>'coverage'='twse_11549_reported_turnover_v1'
   AND cash_window->>'symbol'=target AND cash_window->>'inputHash'=input_digest
   AND cash_window->>'stockId'=instrument->>'stockId'
   AND (cash_window->>'inputCutoff')::timestamptz=cutoff
   AND cash_window->>'signalSession'=selected->'calendar'->'sessions'->-1->>'session_id'
   AND jsonb_array_length(cash_window->'inventory')=20
   AND (SELECT jsonb_agg(value->>'calendarId' ORDER BY ord)
         FROM jsonb_array_elements(cash_window->'inventory') WITH ORDINALITY q(value,ord))
       = (SELECT jsonb_agg(value->>'session_authority_id' ORDER BY ord)
         FROM jsonb_array_elements(selected->'calendar'->'sessions') WITH ORDINALITY q(value,ord)
         WHERE ord>jsonb_array_length(selected->'calendar'->'sessions')-20)
  THEN liquidity_ok:=(cash_window->>'totalNtd')::numeric>=1000000000::numeric;END IF;
  IF liquidity_ok IS NULL THEN reasons:=reasons||'"launch_qualification_cash20_unknown"'::jsonb;END IF;
 ELSIF jsonb_array_length(selected->'institutionalInventory')=20 THEN$next$),
   ('vnext_launch_ranking_command_v1',$prior$  selected:=selected||jsonb_build_object('marketContext520',market);$prior$,$next$  selected:=selected||jsonb_build_object('marketContext520',market);
  IF preflight ? 'cashWindow' THEN selected:=selected||jsonb_build_object('cashWindow',preflight->'cashWindow');END IF;$next$),
   ('vnext_launch_ranking_command_v1',$prior$  FROM jsonb_array_elements(selected->'technicalInventory'||selected->'institutionalInventory'||selected->'flowInventory'||selected->'indexInventory') f;$prior$,$next$  FROM jsonb_array_elements(selected->'technicalInventory'||selected->'institutionalInventory'||selected->'flowInventory'||selected->'indexInventory'
   ||coalesce((SELECT jsonb_agg(cash_entry.value->'source')
               FROM jsonb_array_elements(selected->'cashWindow'->'inventory') cash_entry(value)),'[]'::jsonb)) f;$next$),
   ('vnext_launch_live_v1',$prior$ IF public.vnext_launch_csv_hash_v1(selected)<>score_row.source_hash$prior$,$next$ IF market_name='TWSE' AND selected->'cashWindow' IS DISTINCT FROM preflight->'cashWindow'
  AND checks->>'liquidity' IS DISTINCT FROM 'false' THEN
  checks:=checks||jsonb_build_object('liquidity',NULL);
  reasons:=reasons||'"launch_current_cash20_lineage_changed"'::jsonb;
 END IF;
 IF public.vnext_launch_csv_hash_v1(selected)<>score_row.source_hash$next$)
  ) AS substitutions(routine,previous_text,next_text)
  WHERE change.signature LIKE 'public.'||routine||'(%' LOOP
   IF length(revised)-length(replace(revised,seam.previous_text,''))<>length(seam.previous_text) THEN
    RAISE EXCEPTION 'launch_twse_cash_window_seam_changed:%',change.signature;END IF;
   revised:=replace(revised,seam.previous_text,seam.next_text);
  END LOOP;
  IF encode(sha256(convert_to(revised,'UTF8')),'hex') IS DISTINCT FROM change.successor THEN
   RAISE EXCEPTION 'launch_twse_cash_window_successor_changed:%',change.signature;END IF;
  EXECUTE replace(definition,original,revised);
  IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE p.oid=target) IS DISTINCT FROM metadata THEN
   RAISE EXCEPTION 'launch_twse_cash_window_metadata_changed:%',change.signature;END IF;
 END LOOP;
END $cash_window$;
COMMIT;
