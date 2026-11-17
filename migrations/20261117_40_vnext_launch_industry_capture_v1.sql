BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='2s';
SELECT pg_advisory_xact_lock(64221022);

-- The private history stores only the observed exchange codes and provenance.
-- The legacy scoring taxonomy and its assignments are independent.
CREATE TABLE public.vnext_launch_industry_capture_v1 (
 capture_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 stock_id uuid NOT NULL REFERENCES public.stocks(id) ON DELETE RESTRICT,
 market public.tw_market_v3 NOT NULL,
 industry_code text NOT NULL CHECK (industry_code IN(
    '01','02','03','04','05','06','08','09','10','11','12','14','15','16','17','18','20',
    '21','22','23','24','25','26','27','28','29','30','31','32','33','35','36','37','38')),
 report_date date NOT NULL CHECK (isfinite(report_date)),
 observed_at timestamptz NOT NULL CHECK (isfinite(observed_at)),
 recorded_at timestamptz NOT NULL CHECK (isfinite(recorded_at) AND recorded_at>=observed_at),
 twse_sha256 text NOT NULL CHECK (twse_sha256~'^[a-f0-9]{64}$'),
 tpex_sha256 text NOT NULL CHECK (tpex_sha256~'^[a-f0-9]{64}$'),
 CHECK (report_date<=(observed_at AT TIME ZONE 'Asia/Taipei')::date),
 UNIQUE(stock_id,market,report_date)
);
CREATE INDEX vnext_launch_industry_capture_asof_v1
 ON public.vnext_launch_industry_capture_v1(stock_id,market,recorded_at DESC);
ALTER TABLE public.vnext_launch_industry_capture_v1 OWNER TO stockinsider_vnext_owner;
ALTER TABLE public.vnext_launch_industry_capture_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vnext_launch_industry_capture_v1 FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER launch_industry_capture_writer_fence BEFORE INSERT ON public.vnext_launch_industry_capture_v1
 FOR EACH ROW EXECUTE FUNCTION public.enforce_production_writer_fence();
CREATE TRIGGER launch_industry_capture_immutable BEFORE UPDATE OR DELETE ON public.vnext_launch_industry_capture_v1
 FOR EACH ROW EXECUTE FUNCTION public.vnext_launch_csv_immutable_v1();
CREATE TRIGGER launch_industry_capture_no_truncate BEFORE TRUNCATE ON public.vnext_launch_industry_capture_v1
 FOR EACH STATEMENT EXECUTE FUNCTION public.vnext_launch_csv_immutable_v1();

CREATE FUNCTION public.vnext_launch_industry_capture_command_v1(
 p_principal text,p_lease_owner uuid,p_session date,p_capture jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC'
 SET statement_timeout='15s' SET lock_timeout='2s' AS $$
DECLARE
 backend jsonb; pool jsonb; target_symbols jsonb; item jsonb; head jsonb; reported_head jsonb;
 clock_now timestamptz; observed timestamptz; report date;
 symbol text; market_text text; code text; stock uuid;
 prior public.vnext_launch_industry_capture_v1; written integer:=0; replayed integer:=0;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'launch_industry_read_committed_required';END IF;
 PERFORM pg_advisory_xact_lock(64221022);
 backend:=public.vnext_launch_csv_backend_v1(p_lease_owner);
 clock_now:=clock_timestamp();
 IF p_session IS DISTINCT FROM (clock_now AT TIME ZONE 'Asia/Taipei')::date
  OR NOT EXISTS(SELECT FROM public.vnext_mode_v1 WHERE enabled AND legacy_fenced)
  OR NOT EXISTS(SELECT FROM public.vnext_principals_v1 WHERE principal=p_principal AND role='operator' AND enabled)
  OR NOT EXISTS(SELECT FROM public.vnext_launch_ranking_mode_v1 WHERE enabled AND required_writer_release=backend->>'writerRelease')
  OR NOT EXISTS(SELECT FROM public.vnext_source_policies_v1
   WHERE source='official' AND scope='official_original' AND enabled AND valid_until>clock_now)
 THEN RAISE EXCEPTION 'launch_industry_writer_or_scope_unavailable';END IF;
 pool:=public.vnext_launch_csv_pool_v1();
 SELECT coalesce(jsonb_agg(target->'symbol' ORDER BY target->>'symbol'),'[]'::jsonb)
 INTO target_symbols FROM jsonb_array_elements(pool->'targets') AS scope(target);
 IF p_capture IS NULL THEN RETURN jsonb_build_object('poolRevision',pool->>'revision','symbols',target_symbols);END IF;
 IF jsonb_typeof(p_capture) IS DISTINCT FROM 'object' OR octet_length(p_capture::text)>8192
  OR NOT p_capture ?& ARRAY['poolRevision','reportDate','observedAt','twseSha256','tpexSha256','rows']
  OR p_capture-ARRAY['poolRevision','reportDate','observedAt','twseSha256','tpexSha256','rows']<>'{}'::jsonb
  OR p_capture->>'poolRevision' IS DISTINCT FROM pool->>'revision'
  OR coalesce(p_capture->>'reportDate','')!~'^20[0-9]{2}-[0-9]{2}-[0-9]{2}$'
  OR coalesce(p_capture->>'twseSha256','')!~'^[a-f0-9]{64}$'
  OR coalesce(p_capture->>'tpexSha256','')!~'^[a-f0-9]{64}$'
  OR jsonb_typeof(p_capture->'rows') IS DISTINCT FROM 'array'
 THEN RAISE EXCEPTION 'launch_industry_capture_invalid';END IF;
 IF jsonb_array_length(p_capture->'rows')>jsonb_array_length(target_symbols)
  OR EXISTS(SELECT FROM jsonb_array_elements(p_capture->'rows') AS capture_row(entry)
            GROUP BY capture_row.entry->>'symbol' HAVING count(*)>1)
 THEN RAISE EXCEPTION 'launch_industry_capture_invalid';END IF;
 observed:=(p_capture->>'observedAt')::timestamptz;
 report:=(p_capture->>'reportDate')::date;
 IF observed IS NULL OR NOT isfinite(observed) OR observed>clock_now OR observed<clock_now-interval '90 seconds'
  OR p_session IS DISTINCT FROM (observed AT TIME ZONE 'Asia/Taipei')::date
  OR report>(observed AT TIME ZONE 'Asia/Taipei')::date
 THEN RAISE EXCEPTION 'launch_industry_capture_clock_invalid';END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_capture->'rows') ORDER BY value->>'symbol' LOOP
  symbol:=item->>'symbol'; market_text:=item->>'market'; code:=item->>'code';
  IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR NOT item ?& ARRAY['symbol','market','code']
   OR item-ARRAY['symbol','market','code']<>'{}'::jsonb
   OR symbol IS NULL OR NOT target_symbols ? symbol OR market_text IS NULL OR market_text NOT IN('TWSE','TPEX')
   OR jsonb_typeof(item->'code') IS DISTINCT FROM 'string' OR coalesce(code,'')!~'^[0-9]{2}$' THEN RAISE EXCEPTION 'launch_industry_row_invalid';END IF;
  head:=public.vnext_launch_instrument_v1(symbol,observed);
  IF head->>'exchange' IS DISTINCT FROM market_text OR head->>'instrumentType' IS DISTINCT FROM 'common_stock'
   OR head->>'listingStatus' IS DISTINCT FROM 'active' THEN CONTINUE;END IF;
  reported_head:=public.vnext_launch_instrument_v1(symbol,least(observed,
   ((report+1)::timestamp AT TIME ZONE 'Asia/Taipei')-interval '1 microsecond'));
  IF reported_head->>'stockId' IS DISTINCT FROM head->>'stockId'
   OR reported_head->>'exchange' IS DISTINCT FROM market_text
   OR reported_head->>'instrumentType' IS DISTINCT FROM 'common_stock'
   OR reported_head->>'listingStatus' IS DISTINCT FROM 'active' THEN CONTINUE;END IF;
  stock:=(head->>'stockId')::uuid;
  SELECT * INTO prior FROM public.vnext_launch_industry_capture_v1
   WHERE stock_id=stock AND market=market_text::public.tw_market_v3 ORDER BY report_date DESC LIMIT 1;
  IF FOUND AND prior.report_date>=report THEN
   IF prior.report_date=report AND prior.industry_code=code THEN replayed:=replayed+1;END IF;
   CONTINUE;
  END IF;
  INSERT INTO public.vnext_launch_industry_capture_v1(stock_id,market,industry_code,report_date,observed_at,recorded_at,twse_sha256,tpex_sha256)
   VALUES(stock,market_text::public.tw_market_v3,code,report,observed,clock_now,p_capture->>'twseSha256',p_capture->>'tpexSha256');
  written:=written+1;
 END LOOP;
 RETURN jsonb_build_object('written',written,'replayed',replayed,'deferred',jsonb_array_length(target_symbols)-written-replayed);
END $$;
ALTER FUNCTION public.vnext_launch_industry_capture_command_v1(text,uuid,date,jsonb) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_launch_industry_capture_command_v1(text,uuid,date,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.vnext_launch_industry_capture_command_v1(text,uuid,date,jsonb) TO service_role;

CREATE FUNCTION public.vnext_launch_candidate_industry_resolved_v1(p_symbol text,p_cutoff timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path=pg_catalog,public SET timezone='UTC' AS $$
DECLARE head jsonb; capture public.vnext_launch_industry_capture_v1; legacy jsonb;
BEGIN
 legacy:=public.vnext_launch_candidate_industry_v1(p_symbol,p_cutoff);
 head:=public.vnext_launch_instrument_v1(p_symbol,p_cutoff);
 IF head->>'instrumentType' IS DISTINCT FROM 'common_stock' THEN RETURN legacy;END IF;
 SELECT * INTO capture FROM public.vnext_launch_industry_capture_v1
 WHERE stock_id=(head->>'stockId')::uuid AND market=(head->>'exchange')::public.tw_market_v3
   AND recorded_at<=p_cutoff AND observed_at<=p_cutoff
 ORDER BY recorded_at DESC LIMIT 1;
 IF NOT FOUND OR (legacy IS NOT NULL AND (legacy->>'knownAt')::timestamptz>capture.recorded_at) THEN RETURN legacy;END IF;
 RETURN jsonb_build_object('revisionId',capture.capture_id,'code',capture.industry_code,'knownAt',capture.recorded_at);
END $$;
ALTER FUNCTION public.vnext_launch_candidate_industry_resolved_v1(text,timestamptz) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_launch_candidate_industry_resolved_v1(text,timestamptz) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.vnext_launch_candidate_pool_history_v2(p_catalog_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC' SET statement_timeout='10s' AS $$
DECLARE packet jsonb; scope_name text; scope jsonb; enriched jsonb;
BEGIN
 packet:=public.vnext_launch_candidate_pool_history_v1(p_catalog_id);
 IF packet IS NULL THEN RETURN NULL;END IF;
 FOREACH scope_name IN ARRAY ARRAY['current','previous'] LOOP
  scope:=packet->scope_name;
  IF jsonb_typeof(scope)<>'object' THEN CONTINUE;END IF;
  SELECT coalesce(jsonb_agg(row_item||jsonb_build_object('industrySnapshot',
   public.vnext_launch_candidate_industry_resolved_v1(row_item->>'symbol',(scope->>'cutoff')::timestamptz)) ORDER BY ordinal),'[]'::jsonb)
  INTO enriched FROM jsonb_array_elements(scope->'rows') WITH ORDINALITY AS rows(row_item,ordinal);
  packet:=jsonb_set(packet,ARRAY[scope_name,'rows'],enriched,false);
 END LOOP;
 RETURN packet||jsonb_build_object('schemaVersion','launch-candidate-pool-history-v2');
END $$;
COMMIT;
