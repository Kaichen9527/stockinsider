-- Read approved same-market index receipts without adding source or model work.
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';
SELECT pg_advisory_xact_lock(610091002);
SELECT pg_advisory_xact_lock(2409,6002);
SELECT pg_advisory_xact_lock(64221022);

CREATE FUNCTION public.vnext_launch_outcome_benchmark_point_v1(f jsonb,p_day date,p_dataset integer,p_cutoff timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path=pg_catalog,public SET timezone='UTC' AS $$
DECLARE opening text:=f#>>'{fact,raw_open}';closing text:=f#>>'{fact,raw_close}';
BEGIN
 IF f IS NULL OR f->>'datasetId' IS DISTINCT FROM p_dataset::text OR f#>>'{fact,symbol}' IS DISTINCT FROM 'INDEX'
  OR f#>>'{fact,session_date}' IS DISTINCT FROM p_day::text OR f#>>'{fact,capture_id}' IS DISTINCT FROM f->>'captureId'
  OR coalesce(f#>>'{fact,fact_hash}','')!~'^[a-f0-9]{64}$'
  OR coalesce(f->>'artifactHash','')!~'^[a-f0-9]{64}$'
  OR (f->>'observedAt')::timestamptz IS NULL OR (f->>'availableAt')::timestamptz IS NULL
  OR (f->>'observedAt')::timestamptz>(f->>'availableAt')::timestamptz OR (f->>'availableAt')::timestamptz>p_cutoff
  OR coalesce(closing,'')!~'^(0|[1-9][0-9]{0,11})([.][0-9]{1,8})?$'
  OR (opening IS NOT NULL AND opening!~'^(0|[1-9][0-9]{0,11})([.][0-9]{1,8})?$') THEN RETURN NULL;END IF;
 IF closing::numeric<=0 OR opening::numeric<=0 THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('session',p_day,'open',opening,'close',closing,'observedAt',f->>'observedAt',
  'availableAt',f->>'availableAt','revision',public.vnext_launch_csv_hash_v1(jsonb_build_array('launch-index-point-v1',
   p_dataset,p_day,f->>'captureId',f->>'ackId',f->>'artifactHash',f#>>'{fact,fact_hash}')));
END $$;
ALTER FUNCTION public.vnext_launch_outcome_benchmark_point_v1(jsonb,date,integer,timestamptz) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_launch_outcome_benchmark_point_v1(jsonb,date,integer,timestamptz) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.vnext_launch_outcome_benchmark_v1(p_principal text,p_lease_owner uuid,p_run_id uuid,
 p_symbol text,p_as_of timestamptz,p_days date[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC' SET statement_timeout='15s' SET lock_timeout='2s' AS $$
DECLARE rights jsonb;backend jsonb;mode public.vnext_launch_ranking_mode_v1;anchor public.vnext_launch_outcome_signals_v1;
 dataset integer;frozen jsonb;packet jsonb;point jsonb;points jsonb:='[]'::jsonb;day date;
BEGIN
 IF p_run_id IS NULL OR p_symbol IS NULL OR p_symbol!~'^[0-9]{4}$' OR p_as_of IS NULL OR p_as_of>statement_timestamp()
  OR p_days IS NULL OR cardinality(p_days) NOT BETWEEN 1 AND 4 OR array_ndims(p_days)<>1
  OR EXISTS(SELECT FROM unnest(p_days) d WHERE d IS NULL)
  OR (SELECT count(DISTINCT d) FROM unnest(p_days) d)<>cardinality(p_days) THEN RAISE EXCEPTION 'launch_outcome_benchmark_request';END IF;
 rights:=public.vnext_launch_csv_policy_v1(p_principal);
 backend:=public.vnext_launch_csv_backend_v1(p_lease_owner);
 SELECT * INTO mode FROM public.vnext_launch_ranking_mode_v1 WHERE singleton;
 IF mode.enabled IS DISTINCT FROM true OR mode.required_writer_release IS NULL
  OR mode.required_writer_release IS DISTINCT FROM backend->>'writerRelease'
  OR mode.required_writer_release IS DISTINCT FROM rights->>'requiredWriterRelease'
  THEN RAISE EXCEPTION 'launch_outcome_reviewed_writer_required';END IF;
 SELECT * INTO anchor FROM public.vnext_launch_outcome_signals_v1 WHERE ranking_run_id=p_run_id AND symbol=p_symbol;
 IF NOT FOUND OR p_as_of<anchor.published_at OR EXISTS(SELECT FROM unnest(p_days) d
  WHERE d<=anchor.signal_session OR d>anchor.signal_session+370 OR d>(p_as_of AT TIME ZONE 'Asia/Taipei')::date)
 THEN RAISE EXCEPTION 'launch_outcome_benchmark_signal_scope';END IF;
 dataset:=CASE anchor.market WHEN 'TWSE' THEN 11755 ELSE 11391 END;
 -- Select the exact signal-day index fact stored and FK-pinned by ranking,
 -- never a later correction of that day.
 SELECT CASE WHEN count(*)=1 THEN jsonb_agg(f.value)->0 END INTO frozen FROM public.vnext_launch_score_evidence_v1 e
 CROSS JOIN LATERAL jsonb_array_elements(e.source_inputs->'indexInventory') f(value)
 JOIN public.vnext_launch_score_source_pins_v1 pin ON pin.score_revision=e.score_revision
  AND pin.capture_id=(f.value->>'captureId')::uuid AND pin.session_date=anchor.signal_session AND pin.symbol='INDEX'
 WHERE e.score_revision=anchor.score_revision AND f.value#>>'{fact,session_date}'=anchor.signal_session::text
 ;
 frozen:=public.vnext_launch_outcome_benchmark_point_v1(frozen,anchor.signal_session,dataset,anchor.input_cutoff);
 FOR day IN SELECT requested FROM unnest(p_days) requested ORDER BY requested LOOP
  packet:=public.vnext_launch_source_fact_v1(dataset,day,'INDEX',NULL,p_as_of);
  point:=public.vnext_launch_outcome_benchmark_point_v1(packet,day,dataset,p_as_of);
  IF point IS NOT NULL THEN points:=points||jsonb_build_array(point);END IF;
 END LOOP;
 RETURN jsonb_build_object('market',anchor.market,'frozenClose',frozen,'points',points);
END $$;
ALTER FUNCTION public.vnext_launch_outcome_benchmark_v1(text,uuid,uuid,text,timestamptz,date[]) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_launch_outcome_benchmark_v1(text,uuid,uuid,text,timestamptz,date[]) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.vnext_launch_outcome_benchmark_v1(text,uuid,uuid,text,timestamptz,date[]) TO service_role;
COMMIT;
