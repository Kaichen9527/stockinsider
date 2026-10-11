BEGIN;
-- A stale repeatable-read snapshot can outlive the capacity lock. Reject snapshot
-- isolation before any reads or writes; preserve the original RPC bodies/ACLs.
-- Exact predecessor-or-successor pins make retries safe and changed code fail closed.
DO $precondition$
DECLARE target record; routine oid; body_hash text; attributes jsonb; expected_attributes jsonb;
BEGIN
  FOR target IN SELECT * FROM (VALUES
    ('public.insider_snapshot_run_v1(uuid)','c7b02c9deadb8718b04ff61314488f2b88960d9b622247179224b36379e31617','92e1ad1c34de1383904c44f594159beb07103b5038b00de1d5ba734290d25bf7','search_path=pg_catalog,public'),
    ('public.admit_insider_snapshot_v1(uuid,integer,uuid,text,text,integer,timestamptz,timestamptz,text,text)','6deaef565627142dbac94aafacc6d2870025b8321433ec400a0286434bf2e5cf','944a0fe6c2ec29afac5c5555157177bae272ce4fef24a184375362a02b2d607e','search_path=pg_catalog,public,extensions'),
    ('public.commit_insider_snapshot_page_v1(uuid,integer,uuid,integer,integer,integer)','5aa6059088b8f0d2caa7640bd8c8e16a191ad399339271977c33a98652180761','6c9ac080f03ebe322944e05b6838ed34fe19defd2c845cf7605ba647512d99b6','search_path=pg_catalog,public')
  ) AS expected(signature,predecessor_hash,successor_hash,configuration) LOOP
    routine:=to_regprocedure(target.signature);
    IF routine IS NULL THEN RAISE EXCEPTION 'insider_write_predecessor_missing: %',target.signature; END IF;
    SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') INTO body_hash FROM pg_proc WHERE oid=routine;
    SELECT jsonb_build_object('language',l.lanname,'securityDefiner',p.prosecdef,
      'volatility',p.provolatile::text,'strict',p.proisstrict,'leakproof',p.proleakproof,
      'parallel',p.proparallel::text,'cost',p.procost,'rows',p.prorows,'kind',p.prokind::text,
      'returnsSet',p.proretset,'defaults',p.pronargdefaults,'variadic',p.provariadic::text,
      'support',p.prosupport::oid::text,'transforms',p.protrftypes::text,'binary',p.probin,
      'configuration',(SELECT jsonb_agg(regexp_replace(setting,'[[:space:]]','','g') ORDER BY setting)
        FROM unnest(p.proconfig) setting)) INTO attributes
      FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=routine;
    expected_attributes:=jsonb_build_object('language','plpgsql','securityDefiner',true,
      'volatility','v','strict',false,'leakproof',false,'parallel','u','cost',100,
      'rows',0,'kind','f','returnsSet',false,
      'defaults',0,'variadic','0','support','0','transforms',NULL,'binary',NULL,
      'configuration',jsonb_build_array(target.configuration));
    IF body_hash NOT IN (target.predecessor_hash,target.successor_hash)
      OR attributes IS DISTINCT FROM expected_attributes
      THEN RAISE EXCEPTION 'insider_write_predecessor_changed: %',target.signature; END IF;
  END LOOP;
END $precondition$;

CREATE OR REPLACE FUNCTION public.insider_snapshot_run_v1(p_run uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb; d integer; token uuid; tokens uuid[]:='{}'; bytes_used bigint; records_used bigint; pending bigint;
BEGIN
 IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed'
  THEN RAISE EXCEPTION 'insider_write_read_committed_required'; END IF;
 IF p_run IS NULL THEN RAISE EXCEPTION 'insider_run_required'; END IF;
 PERFORM pg_advisory_xact_lock(2410,8001);
 IF NOT EXISTS(SELECT 1 FROM public.insider_acquisition_runs_v1 WHERE id=p_run) THEN
  IF (SELECT count(*) FROM public.insider_acquisition_runs_v1)>=128 THEN RAISE EXCEPTION 'insider_run_capacity'; END IF;
  FOR d IN 0..4 LOOP
   PERFORM pg_advisory_xact_lock(2411,d);
   SELECT a.id INTO token FROM public.insider_acquisitions_v1 a JOIN public.insider_snapshot_progress_v1 p ON p.snapshot_id=a.snapshot_id WHERE a.dataset=d AND NOT p.complete;
   IF token IS NULL THEN SELECT a.id INTO token FROM public.insider_acquisitions_v1 a WHERE a.dataset=d AND a.snapshot_id IS NULL; END IF;
   IF token IS NULL THEN INSERT INTO public.insider_acquisitions_v1(dataset) VALUES(d) RETURNING id INTO token; END IF;
   tokens:=array_append(tokens,token);
  END LOOP;
  SELECT coalesce(sum(octet_length(raw)),0),count(*) INTO bytes_used,records_used FROM public.insider_snapshots_v1;
  SELECT count(*) INTO pending FROM public.insider_acquisitions_v1 WHERE snapshot_id IS NULL;
  IF bytes_used+pending*12582912>134217728 OR records_used+pending>32 THEN RAISE EXCEPTION 'insider_acquisition_reserved_capacity'; END IF;
  -- Exception above rolls back proposed tokens too. All five subscriptions precede fetch.
  INSERT INTO public.insider_acquisition_runs_v1(id) VALUES(p_run);
  INSERT INTO public.insider_run_members_v1(run_id,dataset,acquisition_token,snapshot_id)
   SELECT p_run,a.dataset,a.id,a.snapshot_id FROM public.insider_acquisitions_v1 a WHERE a.id=ANY(tokens);
  IF NOT EXISTS(SELECT 1 FROM public.insider_run_members_v1 WHERE run_id=p_run AND snapshot_id IS NULL) THEN
   UPDATE public.insider_acquisition_runs_v1 SET frozen_at=clock_timestamp() WHERE id=p_run;
  END IF;
 END IF;
 SELECT jsonb_build_object('runId',p_run,'frozen',r.frozen_at IS NOT NULL,'members',coalesce((
  SELECT jsonb_agg(CASE WHEN m.snapshot_id IS NULL THEN jsonb_build_object('dataset',m.dataset,'snapshotId',NULL,'acquisitionToken',m.acquisition_token,'complete',false)
   ELSE jsonb_build_object('dataset',m.dataset,'snapshotId',m.snapshot_id,'acquisitionToken',m.acquisition_token,'complete',p.complete,'offset',p.offset_rows,'generation',p.generation,'totalRows',s.row_count,'observedAt',s.observed_at,'attemptedAt',s.attempted_at,'hash',s.raw_sha256) END ORDER BY m.dataset)
  FROM public.insider_run_members_v1 m LEFT JOIN public.insider_snapshot_progress_v1 p ON p.snapshot_id=m.snapshot_id LEFT JOIN public.insider_snapshots_v1 s ON s.id=m.snapshot_id WHERE m.run_id=p_run),'[]'::jsonb)) INTO result FROM public.insider_acquisition_runs_v1 r WHERE r.id=p_run;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.admit_insider_snapshot_v1(p_run uuid,p_dataset integer,p_token uuid,p_raw_base64 text,p_hash text,p_rows integer,p_attempted timestamptz,p_observed timestamptz,p_parser text,p_rights text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions AS $$
DECLARE raw_bytes bytea; rows jsonb; row_value jsonb; binding public.insider_run_members_v1; acquisition public.insider_acquisitions_v1; v_snapshot_id uuid;
BEGIN
 IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed'
  THEN RAISE EXCEPTION 'insider_write_read_committed_required'; END IF;
 IF p_run IS NULL OR public.insider_dataset_v1(p_dataset) IS NULL THEN RAISE EXCEPTION 'insider_admission_identity'; END IF;
 PERFORM pg_advisory_xact_lock(2410,8001); PERFORM pg_advisory_xact_lock(2411,p_dataset);
 IF NOT EXISTS(SELECT 1 FROM public.insider_acquisition_runs_v1 WHERE id=p_run) THEN RAISE EXCEPTION 'insider_run_before_fetch_required'; END IF;
 SELECT * INTO binding FROM public.insider_run_members_v1 m WHERE m.run_id=p_run AND m.dataset=p_dataset;
 IF NOT FOUND OR p_token IS NULL OR binding.acquisition_token<>p_token THEN RAISE EXCEPTION 'insider_acquisition_token_mismatch'; END IF;
 SELECT * INTO STRICT acquisition FROM public.insider_acquisitions_v1 WHERE id=p_token;
 IF acquisition.dataset<>p_dataset THEN RAISE EXCEPTION 'insider_acquisition_token_mismatch'; END IF;
 IF binding.snapshot_id IS NOT NULL THEN
  IF binding.snapshot_id IS DISTINCT FROM acquisition.snapshot_id THEN RAISE EXCEPTION 'insider_acquisition_binding_corrupt'; END IF;
  RETURN public.insider_snapshot_run_v1(p_run);
 END IF;
 IF acquisition.snapshot_id IS NOT NULL THEN RAISE EXCEPTION 'insider_acquisition_binding_corrupt'; END IF;
 IF p_parser IS DISTINCT FROM 'insider-db-projection-v1' OR p_rights IS DISTINCT FROM 'official-insider-private-research-retain-v1' THEN RAISE EXCEPTION 'insider_admission_parser_or_rights'; END IF;
 IF p_raw_base64 IS NULL OR octet_length(p_raw_base64)>16777216 OR p_raw_base64 !~ '^[A-Za-z0-9+/]*={0,2}$' OR length(p_raw_base64)%4<>0 THEN RAISE EXCEPTION 'insider_raw_transport_bound'; END IF;
 IF p_attempted IS NULL OR p_observed IS NULL OR NOT isfinite(p_attempted) OR NOT isfinite(p_observed) OR p_attempted>p_observed OR p_observed>clock_timestamp() OR p_observed-p_attempted>interval '30 seconds' THEN RAISE EXCEPTION 'insider_source_clock_invalid'; END IF;
 raw_bytes:=decode(p_raw_base64,'base64');
 IF octet_length(raw_bytes) NOT BETWEEN 2 AND 12582912 OR p_hash IS NULL OR encode(extensions.digest(raw_bytes,'sha256'),'hex')<>p_hash THEN RAISE EXCEPTION 'insider_raw_identity'; END IF;
 rows:=convert_from(raw_bytes,'UTF8')::jsonb;
 IF jsonb_typeof(rows) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'insider_schema_not_array'; END IF;
 IF p_rows IS NULL OR jsonb_array_length(rows)<>p_rows OR p_rows NOT BETWEEN 0 AND 50000 THEN RAISE EXCEPTION 'insider_row_bound'; END IF;
 FOR row_value IN SELECT value FROM jsonb_array_elements(rows) LOOP PERFORM public.insider_row_v1(row_value,p_dataset); END LOOP;
 INSERT INTO public.insider_snapshots_v1(dataset,raw,raw_sha256,row_count,attempted_at,observed_at,parser_identity,rights_identity)
  VALUES(p_dataset,raw_bytes,p_hash,p_rows,p_attempted,p_observed,p_parser,p_rights) RETURNING id INTO v_snapshot_id;
 -- Provisional row is transaction-private. Reject oversized derived pages before
 -- creating active progress or binding any member; exception rolls back the raw.
 PERFORM public.insider_snapshot_projection_bound_v1(v_snapshot_id);
 -- Empty snapshots still require the frozen-run commit, ensuring a replay receipt.
 INSERT INTO public.insider_snapshot_progress_v1(snapshot_id,dataset) VALUES(v_snapshot_id,p_dataset);
 UPDATE public.insider_acquisitions_v1 SET snapshot_id=v_snapshot_id,resolved_at=clock_timestamp() WHERE id=p_token;
 UPDATE public.insider_run_members_v1 SET snapshot_id=v_snapshot_id WHERE acquisition_token=p_token AND insider_run_members_v1.snapshot_id IS NULL;
 UPDATE public.insider_acquisition_runs_v1 r SET frozen_at=clock_timestamp() WHERE r.frozen_at IS NULL
  AND EXISTS(SELECT 1 FROM public.insider_run_members_v1 m WHERE m.run_id=r.id AND m.acquisition_token=p_token)
  AND (SELECT count(*) FROM public.insider_run_members_v1 m WHERE m.run_id=r.id AND m.snapshot_id IS NOT NULL)=5;
 RETURN public.insider_snapshot_run_v1(p_run);
END $$;

CREATE OR REPLACE FUNCTION public.commit_insider_snapshot_page_v1(p_run uuid,p_dataset integer,p_snapshot uuid,p_offset integer,p_generation integer,p_next integer) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE s public.insider_snapshots_v1; p public.insider_snapshot_progress_v1; rows jsonb; doc jsonb; i integer;
BEGIN
 IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed'
  THEN RAISE EXCEPTION 'insider_write_read_committed_required'; END IF;
 IF p_run IS NULL OR p_dataset IS NULL OR p_snapshot IS NULL OR p_offset IS NULL OR p_generation IS NULL OR p_next IS NULL THEN RAISE EXCEPTION 'insider_commit_required'; END IF;
 PERFORM pg_advisory_xact_lock(2410,8001); PERFORM pg_advisory_xact_lock(2411,p_dataset);
 IF NOT EXISTS(SELECT 1 FROM public.insider_acquisition_runs_v1 r JOIN public.insider_run_members_v1 m ON m.run_id=r.id WHERE r.id=p_run AND r.frozen_at IS NOT NULL AND m.dataset=p_dataset AND m.snapshot_id=p_snapshot) THEN RAISE EXCEPTION 'insider_frozen_run_binding_required'; END IF;
 SELECT * INTO STRICT s FROM public.insider_snapshots_v1 WHERE id=p_snapshot AND dataset=p_dataset;
 SELECT * INTO STRICT p FROM public.insider_snapshot_progress_v1 WHERE snapshot_id=p_snapshot;
 rows:=public.insider_snapshot_assert_v1(p_snapshot);
 IF p_offset<0 OR p_offset%500<>0 OR p_generation<>p_offset/500 OR p_next<>least(p_offset+500,s.row_count) OR p_offset>s.row_count THEN RAISE EXCEPTION 'insider_page_span_invalid'; END IF;
 IF p.offset_rows=p_next AND p.generation=p_generation+1 THEN RETURN public.read_insider_snapshot_page_v1(p_run,p_dataset,p_snapshot); END IF;
 IF p.complete OR p.offset_rows<>p_offset OR p.generation<>p_generation THEN RAISE EXCEPTION 'insider_page_cas_conflict'; END IF;
 IF p_next>p_offset THEN FOR i IN p_offset..p_next-1 LOOP
  doc:=public.insider_expected_document_v1(p_snapshot,i,rows->i);
  IF doc IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.source_raw_documents d WHERE d.platform='twse_insider' AND d.document_url=doc->>'documentUrl' AND d.title=doc->>'title' AND d.summary=doc->>'summary' AND d.content_text=doc->>'contentText' AND d.published_at IS NULL AND d.sentiment_label='neutral' AND d.content_semantics='official_chip_evidence' AND d.stance_semantics='neutral' AND d.canonical_content_hash=encode(extensions.digest(convert_to(lower(doc->>'contentText'),'UTF8'),'sha256'),'hex') AND d.symbols=doc->'symbols' AND d.metadata @> (doc->'metadata') AND d.collected_at>=s.observed_at) THEN RAISE EXCEPTION 'insider_page_document_missing_or_mismatch'; END IF;
 END LOOP; END IF;
 UPDATE public.insider_snapshot_progress_v1 SET offset_rows=p_next,generation=generation+1,complete=p_next=s.row_count,completed_at=CASE WHEN p_next=s.row_count THEN clock_timestamp() ELSE NULL END WHERE snapshot_id=p_snapshot;
 RETURN public.read_insider_snapshot_page_v1(p_run,p_dataset,p_snapshot);
END $$;
COMMIT;
