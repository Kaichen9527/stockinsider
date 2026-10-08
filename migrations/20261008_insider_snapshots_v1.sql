-- Private bounded official-insider evidence. Candidate only: reviewed apply required.
BEGIN;
CREATE TABLE IF NOT EXISTS public.insider_snapshots_v1 (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), dataset integer NOT NULL CHECK(dataset BETWEEN 0 AND 4),
 raw bytea NOT NULL CHECK(octet_length(raw) BETWEEN 2 AND 12582912),
 raw_sha256 text NOT NULL CHECK(raw_sha256 ~ '^[0-9a-f]{64}$'), row_count integer NOT NULL CHECK(row_count BETWEEN 0 AND 50000),
 attempted_at timestamptz NOT NULL, observed_at timestamptz NOT NULL CHECK(observed_at>=attempted_at),
 parser_identity text NOT NULL, rights_identity text NOT NULL, admitted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS public.insider_snapshot_progress_v1 (
 snapshot_id uuid PRIMARY KEY REFERENCES public.insider_snapshots_v1(id), dataset integer NOT NULL CHECK(dataset BETWEEN 0 AND 4),
 offset_rows integer NOT NULL DEFAULT 0 CHECK(offset_rows BETWEEN 0 AND 50000), generation integer NOT NULL DEFAULT 0 CHECK(generation BETWEEN 0 AND 100),
 complete boolean NOT NULL DEFAULT false, completed_at timestamptz,
 CHECK(complete=(completed_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS insider_one_active_snapshot_v1 ON public.insider_snapshot_progress_v1(dataset) WHERE NOT complete;
CREATE TABLE IF NOT EXISTS public.insider_acquisition_runs_v1 (
 id uuid PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), frozen_at timestamptz
);
CREATE TABLE IF NOT EXISTS public.insider_run_members_v1 (
 run_id uuid NOT NULL REFERENCES public.insider_acquisition_runs_v1(id), dataset integer NOT NULL CHECK(dataset BETWEEN 0 AND 4),
 snapshot_id uuid NOT NULL REFERENCES public.insider_snapshots_v1(id), PRIMARY KEY(run_id,dataset)
);
-- No caller-controlled document IDs or projection hashes are trusted at commit.
CREATE OR REPLACE FUNCTION public.insider_snapshot_immutable_v1() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$ BEGIN RAISE EXCEPTION 'insider_snapshot_immutable'; END $$;
CREATE OR REPLACE TRIGGER insider_snapshot_immutable_v1 BEFORE UPDATE OR DELETE ON public.insider_snapshots_v1 FOR EACH ROW EXECUTE FUNCTION public.insider_snapshot_immutable_v1();
CREATE OR REPLACE TRIGGER insider_member_immutable_v1 BEFORE UPDATE OR DELETE ON public.insider_run_members_v1 FOR EACH ROW EXECUTE FUNCTION public.insider_snapshot_immutable_v1();
ALTER TABLE public.insider_snapshots_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insider_snapshot_progress_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insider_acquisition_runs_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insider_run_members_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.insider_snapshots_v1, public.insider_snapshot_progress_v1, public.insider_acquisition_runs_v1, public.insider_run_members_v1 FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.insider_dataset_v1(p_dataset integer) RETURNS jsonb
 LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT ('[
 {"url":"https://openapi.twse.com.tw/v1/opendata/t187ap11_L","kind":"holding","market":"TWSE"},
 {"url":"https://openapi.twse.com.tw/v1/opendata/t187ap11_P","kind":"holding","market":"PUBLIC"},
 {"url":"https://openapi.twse.com.tw/v1/opendata/t187ap12_L","kind":"transfer","market":"TWSE"},
 {"url":"https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap11_O","kind":"holding","market":"TPEX"},
 {"url":"https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap12_O","kind":"transfer","market":"TPEX"}
 ]'::jsonb)->p_dataset WHERE p_dataset BETWEEN 0 AND 4
$$;
CREATE OR REPLACE FUNCTION public.insider_trim_v1(p_text text) RETURNS text
 LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT btrim(p_text, chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(32)||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279))
$$;
-- A bounded projection, not truncated raw: full original bytes remain private.
-- Required fields are validated even for excluded identities/placeholders.
CREATE OR REPLACE FUNCTION public.insider_row_v1(p_row jsonb,p_dataset integer) RETURNS jsonb
 LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $$
DECLARE d jsonb:=public.insider_dataset_v1(p_dataset); holding boolean; otc boolean;
 sk text; nk text; rk text; dk text; required text[]; k text; v text; nums jsonb:='{}';
 output_date text; source_period text; report_period text; symbol text; person text; company text; role_text text; dt date;
BEGIN
 IF d IS NULL OR jsonb_typeof(p_row) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'insider_schema_invalid_row'; END IF;
 holding:=d->>'kind'='holding'; otc:=d->>'market'='TPEX' AND NOT holding;
 sk:=CASE WHEN otc THEN 'SecuritiesCompanyCode' ELSE '公司代號' END;
 nk:=CASE WHEN otc THEN 'CompanyName' ELSE '公司名稱' END;
 rk:=CASE WHEN holding THEN '職稱' WHEN otc THEN '申請人身分' ELSE '申報人身分' END;
 dk:=CASE WHEN otc THEN 'Date' ELSE '出表日期' END;
 required:=ARRAY[sk,nk,rk,'姓名',dk] || CASE WHEN holding THEN ARRAY['資料年月','目前持股'] ELSE ARRAY['預定轉讓方式及股數-轉讓股數','目前持有股數-自有持股','目前持有股數-保留運用決定權信託股數','預定轉讓方式及股數-轉讓方式','有效轉讓期間'] END;
 FOREACH k IN ARRAY required LOOP
  IF jsonb_typeof(p_row->k) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'insider_schema_required_field'; END IF;
  IF octet_length(p_row->>k)>512 THEN RAISE EXCEPTION 'insider_projection_field_unsupported'; END IF;
 END LOOP;
 v:=public.insider_trim_v1(p_row->>dk);
 IF v<>'' THEN
  IF v !~ '^[0-9]{7}$' THEN RAISE EXCEPTION 'insider_schema_invalid_date'; END IF;
  dt:=make_date(substring(v,1,3)::integer+1911,substring(v,4,2)::integer,substring(v,6,2)::integer);
  output_date:=to_char(dt,'YYYY-MM-DD');
 END IF;
 FOREACH k IN ARRAY CASE WHEN holding THEN ARRAY['目前持股'] ELSE ARRAY['目前持有股數-自有持股','目前持有股數-保留運用決定權信託股數','預定轉讓方式及股數-轉讓股數'] END LOOP
  v:=replace(public.insider_trim_v1(p_row->>k),',','');
  IF v<>'' AND (v !~ '^[0-9]+$') THEN RAISE EXCEPTION 'insider_schema_invalid_shares'; END IF;
  IF v<>'' AND v::numeric>9007199254740991 THEN RAISE EXCEPTION 'insider_schema_invalid_shares'; END IF;
  nums:=nums || jsonb_build_object(k,CASE WHEN v='' THEN NULL ELSE v::bigint END);
 END LOOP;
 source_period:=public.insider_trim_v1(p_row->>'資料年月');
 IF holding THEN
  IF source_period IS NULL OR source_period !~ '^[0-9]{5}$' OR substring(source_period,4,2)::integer NOT BETWEEN 1 AND 12 THEN RAISE EXCEPTION 'insider_schema_invalid_period'; END IF;
  report_period:=(substring(source_period,1,3)::integer+1911)::text || '-' || substring(source_period,4,2);
 ELSE report_period:=coalesce(nullif(public.insider_trim_v1(p_row->>'有效轉讓期間'),''),output_date,'unknown_period'); END IF;
 symbol:=public.insider_trim_v1(p_row->>sk); person:=public.insider_trim_v1(p_row->>'姓名'); company:=public.insider_trim_v1(p_row->>nk); role_text:=public.insider_trim_v1(p_row->>rk);
 IF symbol !~ '^[1-9][0-9]{3}$' OR person='' OR company='' OR role_text='' THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('symbol',symbol,'person',person,'companyName',company,'role',role_text,
  'reportPeriod',report_period,'sourcePeriod',nullif(source_period,''),'outputDate',output_date,
  'currentShares',nums->CASE WHEN holding THEN '目前持股' ELSE '目前持有股數-自有持股' END,
  'trustShares',nums->'目前持有股數-保留運用決定權信託股數','declaredShares',nums->'預定轉讓方式及股數-轉讓股數',
  'transferMethod',CASE WHEN holding THEN NULL ELSE nullif(public.insider_trim_v1(p_row->>'預定轉讓方式及股數-轉讓方式'),'') END,
  'confirmedShares',NULL,'publishedAt',NULL,'publicationPrecision',CASE WHEN output_date IS NULL THEN 'unknown' ELSE 'date' END);
END $$;

CREATE OR REPLACE FUNCTION public.insider_snapshot_assert_v1(p_id uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions AS $$
DECLARE s public.insider_snapshots_v1; rows jsonb;
BEGIN
 SELECT * INTO s FROM public.insider_snapshots_v1 WHERE id=p_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'insider_snapshot_missing'; END IF;
 IF s.parser_identity<>'insider-db-projection-v1' OR s.rights_identity<>'official-insider-private-research-retain-v1' THEN RAISE EXCEPTION 'insider_snapshot_parser_or_rights_changed'; END IF;
 IF encode(extensions.digest(s.raw,'sha256'),'hex')<>s.raw_sha256 THEN RAISE EXCEPTION 'insider_snapshot_corrupt'; END IF;
 rows:=convert_from(s.raw,'UTF8')::jsonb;
 IF jsonb_typeof(rows) IS DISTINCT FROM 'array' OR jsonb_array_length(rows)<>s.row_count THEN RAISE EXCEPTION 'insider_snapshot_corrupt'; END IF;
 RETURN rows;
END $$;
CREATE OR REPLACE FUNCTION public.insider_snapshot_run_v1(p_run uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb;
BEGIN
 IF p_run IS NULL THEN RAISE EXCEPTION 'insider_run_required'; END IF;
 PERFORM pg_advisory_xact_lock(2410,8001);
 IF NOT EXISTS(SELECT 1 FROM public.insider_acquisition_runs_v1 WHERE id=p_run) THEN
  IF (SELECT count(*) FROM public.insider_acquisition_runs_v1)>=128 THEN RAISE EXCEPTION 'insider_run_capacity'; END IF;
  INSERT INTO public.insider_acquisition_runs_v1(id) VALUES(p_run);
 END IF;
 -- Reuse active snapshots before any caller fetch. Completed pinned members are immutable.
 INSERT INTO public.insider_run_members_v1(run_id,dataset,snapshot_id)
  SELECT p_run,p.dataset,p.snapshot_id FROM public.insider_snapshot_progress_v1 p WHERE NOT p.complete
  ON CONFLICT(run_id,dataset) DO NOTHING;
 IF (SELECT count(*) FROM public.insider_run_members_v1 WHERE run_id=p_run)=5 THEN
  UPDATE public.insider_acquisition_runs_v1 SET frozen_at=coalesce(frozen_at,clock_timestamp()) WHERE id=p_run;
 END IF;
 SELECT jsonb_build_object('runId',p_run,'frozen',r.frozen_at IS NOT NULL,'members',coalesce((
  SELECT jsonb_agg(jsonb_build_object('dataset',m.dataset,'snapshotId',m.snapshot_id,'complete',p.complete,'offset',p.offset_rows,'generation',p.generation,'totalRows',s.row_count,'observedAt',s.observed_at,'attemptedAt',s.attempted_at,'hash',s.raw_sha256) ORDER BY m.dataset)
  FROM public.insider_run_members_v1 m JOIN public.insider_snapshot_progress_v1 p ON p.snapshot_id=m.snapshot_id JOIN public.insider_snapshots_v1 s ON s.id=m.snapshot_id WHERE m.run_id=p_run),'[]'::jsonb)) INTO result FROM public.insider_acquisition_runs_v1 r WHERE r.id=p_run;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.admit_insider_snapshot_v1(p_run uuid,p_dataset integer,p_raw_base64 text,p_hash text,p_rows integer,p_attempted timestamptz,p_observed timestamptz,p_parser text,p_rights text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions AS $$
DECLARE raw_bytes bytea; rows jsonb; row_value jsonb; existing uuid; snapshot_id uuid; count_snap bigint; total_bytes bigint;
BEGIN
 IF p_run IS NULL OR public.insider_dataset_v1(p_dataset) IS NULL THEN RAISE EXCEPTION 'insider_admission_identity'; END IF;
 PERFORM pg_advisory_xact_lock(2410,8001); PERFORM pg_advisory_xact_lock(2411,p_dataset);
 IF NOT EXISTS(SELECT 1 FROM public.insider_acquisition_runs_v1 WHERE id=p_run) THEN RAISE EXCEPTION 'insider_run_before_fetch_required'; END IF;
 SELECT m.snapshot_id INTO existing FROM public.insider_run_members_v1 m WHERE m.run_id=p_run AND m.dataset=p_dataset;
 IF existing IS NOT NULL THEN RETURN public.insider_snapshot_run_v1(p_run); END IF;
 SELECT p.snapshot_id INTO existing FROM public.insider_snapshot_progress_v1 p WHERE p.dataset=p_dataset AND NOT p.complete;
 IF existing IS NOT NULL THEN
  INSERT INTO public.insider_run_members_v1 VALUES(p_run,p_dataset,existing);
  RETURN public.insider_snapshot_run_v1(p_run);
 END IF;
 IF p_parser IS DISTINCT FROM 'insider-db-projection-v1' OR p_rights IS DISTINCT FROM 'official-insider-private-research-retain-v1' THEN RAISE EXCEPTION 'insider_admission_parser_or_rights'; END IF;
 IF p_raw_base64 IS NULL OR octet_length(p_raw_base64)>16777216 OR p_raw_base64 !~ '^[A-Za-z0-9+/]*={0,2}$' OR length(p_raw_base64)%4<>0 THEN RAISE EXCEPTION 'insider_raw_transport_bound'; END IF;
 IF p_attempted IS NULL OR p_observed IS NULL OR NOT isfinite(p_attempted) OR NOT isfinite(p_observed) OR p_attempted>p_observed OR p_observed>clock_timestamp() OR p_observed-p_attempted>interval '30 seconds' THEN RAISE EXCEPTION 'insider_source_clock_invalid'; END IF;
 raw_bytes:=decode(p_raw_base64,'base64');
 IF octet_length(raw_bytes) NOT BETWEEN 2 AND 12582912 OR p_hash IS NULL OR encode(extensions.digest(raw_bytes,'sha256'),'hex')<>p_hash THEN RAISE EXCEPTION 'insider_raw_identity'; END IF;
 rows:=convert_from(raw_bytes,'UTF8')::jsonb;
 IF jsonb_typeof(rows) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'insider_schema_not_array'; END IF;
 IF p_rows IS NULL OR jsonb_array_length(rows)<>p_rows OR p_rows NOT BETWEEN 0 AND 50000 THEN RAISE EXCEPTION 'insider_row_bound'; END IF;
 FOR row_value IN SELECT value FROM jsonb_array_elements(rows) LOOP PERFORM public.insider_row_v1(row_value,p_dataset); END LOOP;
 SELECT count(*),coalesce(sum(octet_length(raw)),0) INTO count_snap,total_bytes FROM public.insider_snapshots_v1;
 IF count_snap>=32 OR total_bytes+octet_length(raw_bytes)>134217728 THEN RAISE EXCEPTION 'insider_snapshot_capacity'; END IF;
 INSERT INTO public.insider_snapshots_v1(dataset,raw,raw_sha256,row_count,attempted_at,observed_at,parser_identity,rights_identity)
  VALUES(p_dataset,raw_bytes,p_hash,p_rows,p_attempted,p_observed,p_parser,p_rights) RETURNING id INTO snapshot_id;
 -- Empty snapshots still require the frozen-run commit, ensuring a replay receipt.
 INSERT INTO public.insider_snapshot_progress_v1(snapshot_id,dataset) VALUES(snapshot_id,p_dataset);
 INSERT INTO public.insider_run_members_v1 VALUES(p_run,p_dataset,snapshot_id);
 RETURN public.insider_snapshot_run_v1(p_run);
END $$;
CREATE OR REPLACE FUNCTION public.insider_expected_document_v1(p_id uuid,p_index integer,p_row jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions AS $$
DECLARE s public.insider_snapshots_v1; parsed jsonb; d jsonb; row_hash text; body text; metadata jsonb;
BEGIN
 SELECT * INTO STRICT s FROM public.insider_snapshots_v1 WHERE id=p_id;
 parsed:=public.insider_row_v1(p_row,s.dataset); IF parsed IS NULL THEN RETURN NULL; END IF;
 d:=public.insider_dataset_v1(s.dataset); row_hash:=encode(extensions.digest(convert_to(p_row::text,'UTF8'),'sha256'),'hex');
 body:='Official insider disclosure; symbol='||(parsed->>'symbol')||'; kind='||(d->>'kind')||'; current_shares='||coalesce(parsed->>'currentShares','unknown')||'; trust_shares='||coalesce(parsed->>'trustShares','unknown')||'; declared_shares='||coalesce(parsed->>'declaredShares','unknown')||'; confirmed_shares=unknown; snapshot='||s.id||'; raw_index='||p_index||'; row_sha256='||row_hash||'. Full private raw retained; not confirmed trading.';
 IF octet_length(body)>500 THEN RAISE EXCEPTION 'insider_projection_content_bound'; END IF;
 metadata:=jsonb_build_object('connector','official_insider_snapshot_v1','dataset',d->>'url','market',d->>'market','snapshot_id',s.id,'raw_index',p_index,'row_sha256',row_hash,'response_sha256',s.raw_sha256,'observed_at',s.observed_at,'attempted_at',s.attempted_at,'parser_identity',s.parser_identity,'rights_identity',s.rights_identity,'issue_date',parsed->'outputDate','publication_precision',parsed->'publicationPrecision','source_report_period',parsed->'sourcePeriod','insider_evidence',parsed||jsonb_build_object('kind',CASE WHEN d->>'kind'='holding' THEN 'holding_snapshot' ELSE 'transfer_declaration' END),'delta_holding',NULL,'transfer_shares',NULL,'raw_retention','private_snapshot','content_representation','bounded_summary_linked_full_private_raw');
 RETURN jsonb_build_object('documentUrl',(d->>'url')||'#si-insider-snapshot-'||s.id||'-'||p_index||'-'||row_hash,'title','Official insider disclosure '||(parsed->>'symbol'),'summary',body,'contentText',body,'publishedAt',NULL,'symbols',jsonb_build_array(parsed->>'symbol'),'metadata',metadata);
END $$;
CREATE OR REPLACE FUNCTION public.read_insider_snapshot_page_v1(p_run uuid,p_dataset integer,p_snapshot uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE s public.insider_snapshots_v1; p public.insider_snapshot_progress_v1; rows jsonb; docs jsonb:='[]'; doc jsonb; i integer; stop_at integer;
BEGIN
 IF p_run IS NULL OR p_dataset IS NULL OR p_snapshot IS NULL OR NOT EXISTS(SELECT 1 FROM public.insider_acquisition_runs_v1 r JOIN public.insider_run_members_v1 m ON m.run_id=r.id WHERE r.id=p_run AND r.frozen_at IS NOT NULL AND m.dataset=p_dataset AND m.snapshot_id=p_snapshot) THEN RAISE EXCEPTION 'insider_frozen_run_binding_required'; END IF;
 SELECT * INTO STRICT s FROM public.insider_snapshots_v1 WHERE id=p_snapshot AND dataset=p_dataset;
 SELECT * INTO STRICT p FROM public.insider_snapshot_progress_v1 WHERE snapshot_id=p_snapshot;
 rows:=public.insider_snapshot_assert_v1(p_snapshot); stop_at:=least(p.offset_rows+500,s.row_count);
 IF NOT p.complete AND stop_at>p.offset_rows THEN FOR i IN p.offset_rows..stop_at-1 LOOP
  doc:=public.insider_expected_document_v1(p_snapshot,i,rows->i); IF doc IS NOT NULL THEN docs:=docs||jsonb_build_array(doc); END IF;
 END LOOP; END IF;
 RETURN jsonb_build_object('runId',p_run,'dataset',p_dataset,'snapshotId',p_snapshot,'offset',p.offset_rows,'generation',p.generation,'nextOffset',stop_at,'totalRows',s.row_count,'complete',p.complete,'documents',docs,'excludedRows',stop_at-p.offset_rows-jsonb_array_length(docs),'observedAt',s.observed_at,'attemptedAt',s.attempted_at,'hash',s.raw_sha256);
END $$;
CREATE OR REPLACE FUNCTION public.commit_insider_snapshot_page_v1(p_run uuid,p_dataset integer,p_snapshot uuid,p_offset integer,p_generation integer,p_next integer) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE s public.insider_snapshots_v1; p public.insider_snapshot_progress_v1; rows jsonb; doc jsonb; i integer;
BEGIN
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
  IF doc IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.source_raw_documents d WHERE d.platform='twse_insider' AND d.document_url=doc->>'documentUrl' AND d.title=doc->>'title' AND d.summary=doc->>'summary' AND d.content_text=doc->>'contentText' AND d.published_at IS NULL AND d.sentiment_label='neutral' AND d.content_semantics='official_chip_evidence' AND d.stance_semantics='neutral' AND d.canonical_content_hash=encode(extensions.digest(convert_to(lower(doc->>'contentText'),'UTF8'),'sha256'),'hex') AND d.symbols=doc->'symbols' AND d.metadata @> doc->'metadata' AND d.collected_at>=s.observed_at) THEN RAISE EXCEPTION 'insider_page_document_missing_or_mismatch'; END IF;
 END LOOP; END IF;
 UPDATE public.insider_snapshot_progress_v1 SET offset_rows=p_next,generation=generation+1,complete=p_next=s.row_count,completed_at=CASE WHEN p_next=s.row_count THEN clock_timestamp() ELSE NULL END WHERE snapshot_id=p_snapshot;
 RETURN public.read_insider_snapshot_page_v1(p_run,p_dataset,p_snapshot);
END $$;
-- All helper routines are private. Service callers receive only four narrow RPCs.
REVOKE ALL ON FUNCTION public.insider_trim_v1(text),public.insider_snapshot_immutable_v1(),public.insider_dataset_v1(integer),public.insider_row_v1(jsonb,integer),public.insider_snapshot_assert_v1(uuid),public.insider_expected_document_v1(uuid,integer,jsonb),public.insider_snapshot_run_v1(uuid),public.admit_insider_snapshot_v1(uuid,integer,text,text,integer,timestamptz,timestamptz,text,text),public.read_insider_snapshot_page_v1(uuid,integer,uuid),public.commit_insider_snapshot_page_v1(uuid,integer,uuid,integer,integer,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.insider_snapshot_run_v1(uuid),public.admit_insider_snapshot_v1(uuid,integer,text,text,integer,timestamptz,timestamptz,text,text),public.read_insider_snapshot_page_v1(uuid,integer,uuid),public.commit_insider_snapshot_page_v1(uuid,integer,uuid,integer,integer,integer) TO service_role;
COMMIT;
