-- SOURCE CANDIDATE ONLY / NOT APPLIED. Typed source provenance, not financial
-- comparison/basis parity, current financial qualification or source permission.
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL statement_timeout='30s';SET LOCAL lock_timeout='2s';
SELECT pg_advisory_xact_lock(64221022);
DO $financial_provider_dependencies$
BEGIN
 IF EXISTS(SELECT FROM pg_roles WHERE rolname IN('stockinsider_vnext_owner','opportunity_v3_rpc_owner') AND (rolcanlogin OR rolsuper OR rolbypassrls))
 OR NOT EXISTS(SELECT FROM pg_proc WHERE oid=to_regprocedure('public.vnext_forecast_stock_id_internal_v1(text)') AND prosecdef AND proowner='stockinsider_vnext_owner'::regrole AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')='d1508916a64a8e9414dad908c730da4f7abaeb9b1e83920b7143ac6bf6283f26')
 OR NOT EXISTS(SELECT FROM pg_proc WHERE oid=to_regprocedure('public.read_financial_facts_for_stocks_as_of(timestamptz,uuid[])') AND NOT prosecdef AND proowner='opportunity_v3_rpc_owner'::regrole AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')='220620b91b5c0ffb41a8e33547b5fdc18642c477036dbdd8da8c619ba3b2d2f2')
 OR NOT EXISTS(SELECT FROM pg_class WHERE oid=to_regclass('public.candidate_financial_acquisition_jobs_v4') AND relrowsecurity AND relowner<>'opportunity_v3_rpc_owner'::regrole)
 OR has_any_column_privilege('opportunity_v3_rpc_owner','public.candidate_financial_acquisition_jobs_v4','SELECT')
 THEN RAISE EXCEPTION 'financial_provider_read_predecessor_changed';END IF;
END $financial_provider_dependencies$;
GRANT SELECT(job_id,stock_id,period_end,status,terminal_reason,response_sha256,source_url,collected_at,created_at,updated_at)
 ON public.candidate_financial_acquisition_jobs_v4 TO opportunity_v3_rpc_owner;
CREATE POLICY vnext_financial_completed_acquisition_read_v1 ON public.candidate_financial_acquisition_jobs_v4
 FOR SELECT TO opportunity_v3_rpc_owner USING (status='terminal' AND terminal_reason='complete');
CREATE TABLE public.vnext_financial_preparation_protocols_v1(
 job_id uuid PRIMARY KEY REFERENCES public.vnext_preparations_v1(job_id),
 input_hash text NOT NULL CHECK(input_hash ~ '^[a-f0-9]{64}$'),
 protocol text NOT NULL CHECK(protocol='vnext-financial-provider-input-v1'),
 frozen_packet jsonb NOT NULL,packet_digest text NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp());
ALTER TABLE public.vnext_financial_preparation_protocols_v1 OWNER TO stockinsider_vnext_owner;
ALTER TABLE public.vnext_financial_preparation_protocols_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vnext_financial_preparation_protocols_v1 FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER vnext_writer_fence BEFORE INSERT OR UPDATE OR DELETE ON public.vnext_financial_preparation_protocols_v1
 FOR EACH ROW EXECUTE FUNCTION public.enforce_production_writer_fence();

-- These closed keys have the SAME order under the original JS localeCompare
-- codec and C order. Unknown keys are refused, not silently hashed differently.
CREATE FUNCTION public.vnext_financial_wire_canonical_v1(value jsonb,depth integer DEFAULT 0) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $$
DECLARE result text;field record;n numeric;wire numeric;
BEGIN
 IF value IS NULL OR depth>12 THEN RETURN NULL;END IF;
 IF depth=0 AND octet_length(convert_to(value::text,'UTF8'))>1048576 THEN RETURN NULL;END IF;
 IF jsonb_typeof(value)='object' THEN
  result:='{';FOR field IN SELECT * FROM jsonb_each(value) ORDER BY key COLLATE "C" LOOP
   IF field.key NOT IN('acquisitionJobId','approvedAt','authorityTier','authority_tier','classification','collected_at','consistency_valid','corporateActionRevision','denominatorShares','durationKind','duration_kind','epsBasis','estimateHorizon','estimateKind','estimate_horizon','estimate_kind','extractedAt','factContentHash','factId','factRecordedAt','fact_id','fact_key','filingRevisionId','filing_published_at','filing_restatement_id','gaps','host','issuerApproval','issuerDocumentId','key','knownAt','manifestSha256','originalFact','parserEvidenceId','periodEnd','periodStart','periodType','period_end','period_start','point_in_time_valid','provenanceId','provider','receiptHash','receiptId','recorded_at','reportingFrequency','restatementBasis','schemaVersion','schema_valid','shareBasis','sourceKind','sourceRawSha256','sourceReceiptHash','sourceReceiptId','sourceRef','sourceSha256','sourceUrl','source_ref','source_timestamp','stockId','stock_id','storedDurationKind','unit','unit_valid','upstream_provider','validation_recorded_at','validation_status','value') THEN RETURN NULL;END IF;
   IF result<>'{' THEN result:=result||',';END IF;
   IF public.vnext_financial_wire_canonical_v1(field.value,depth+1) IS NULL THEN RETURN NULL;END IF;
   result:=result||to_jsonb(field.key)::text||':'||public.vnext_financial_wire_canonical_v1(field.value,depth+1);
  END LOOP;RETURN result||'}';
 ELSIF jsonb_typeof(value)='array' THEN
  IF jsonb_array_length(value)>2000 THEN RETURN NULL;END IF;result:='[';
  FOR field IN SELECT v FROM jsonb_array_elements(value) v LOOP
   IF public.vnext_financial_wire_canonical_v1(field.v,depth+1) IS NULL THEN RETURN NULL;END IF;
   IF result<>'[' THEN result:=result||',';END IF;result:=result||public.vnext_financial_wire_canonical_v1(field.v,depth+1);
  END LOOP;RETURN result||']';
 ELSIF jsonb_typeof(value)='number' THEN
  n:=(value::text)::numeric;
  IF n<>0 AND (abs(n)<0.000001 OR abs(n)>=1000000000000000000000) THEN RETURN NULL;END IF;
  -- Exact supported wire domain only; no epsilon/rounding to rescue a fact.
  wire:=(to_jsonb(n::double precision)::text)::numeric;
  IF wire IS DISTINCT FROM n THEN RETURN NULL;END IF;
  RETURN CASE WHEN n=0 THEN '0' ELSE trim_scale(wire)::text END;
 ELSE RETURN value::text;END IF;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN NULL;
END $$;
CREATE FUNCTION public.vnext_financial_wire_hash_v1(value jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
 SELECT encode(sha256(convert_to(public.vnext_financial_wire_canonical_v1(value),'UTF8')),'hex')
$$;
CREATE FUNCTION public.vnext_financial_wire_clock_v1(value text) RETURNS timestamptz
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog SET timezone='UTC' AS $$
DECLARE result timestamptz;
BEGIN
 IF value IS NULL OR value !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$' THEN RETURN NULL;END IF;
 result:=value::timestamptz;IF NOT isfinite(result) OR substring(value,12,2)::integer>23 OR substring(value,15,2)::integer>59 OR substring(value,18,2)::integer>59 THEN RETURN NULL;END IF;
 RETURN result;
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RETURN NULL;
END $$;

-- Narrow bounded owner-held read, no new table SELECT grants. No raw document
-- body, private content or provider configuration is returned by this getter.
CREATE FUNCTION public.vnext_financial_rows_internal_v1(stock uuid,cutoff timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC' SET statement_timeout='30s' SET lock_timeout='2s' AS $$
DECLARE original jsonb;current_rows jsonb;prov jsonb;links jsonb;jobs jsonb;receipts jsonb;documents jsonb;parsers jsonb;domains jsonb;prices jsonb;
BEGIN
 IF stock IS NULL OR cutoff IS NULL OR NOT isfinite(cutoff) OR cutoff>statement_timestamp() THEN RETURN NULL;END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(f)),'[]') INTO original FROM(SELECT * FROM public.read_financial_facts_for_stocks_as_of(cutoff,ARRAY[stock]) ORDER BY recorded_at,fact_id LIMIT 2001)f;
 SELECT coalesce(jsonb_agg(to_jsonb(f)),'[]') INTO current_rows FROM(SELECT * FROM public.read_financial_facts_for_stocks_as_of(statement_timestamp(),ARRAY[stock]) ORDER BY recorded_at,fact_id LIMIT 2001)f;
 IF jsonb_array_length(original)>2000 OR jsonb_array_length(current_rows)>2000 THEN RETURN NULL;END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(p)),'[]') INTO prov FROM(SELECT provenance_id,fact_id,acquisition_job_id,issuer_document_id,source_url,source_sha256,locator,extracted_at,recorded_at FROM public.candidate_financial_fact_provenance_v4 WHERE fact_id IN(SELECT (f->>'fact_id')::uuid FROM jsonb_array_elements(original)f) ORDER BY provenance_id LIMIT 2001)p;
 SELECT coalesce(jsonb_agg(to_jsonb(l)),'[]') INTO links FROM(SELECT receipt_id,fact_id,fact_recorded_at,evidence_id,created_at FROM public.candidate_financial_document_fact_links_v8 WHERE fact_id IN(SELECT (f->>'fact_id')::uuid FROM jsonb_array_elements(original)f) ORDER BY fact_id,evidence_id LIMIT 2001)l;
 SELECT coalesce(jsonb_agg(to_jsonb(j)),'[]') INTO jobs FROM(SELECT job_id,stock_id,period_end,status,terminal_reason,response_sha256,source_url,collected_at,created_at,updated_at FROM public.candidate_financial_acquisition_jobs_v4 WHERE stock_id=stock AND status='terminal' AND terminal_reason='complete' AND job_id IN(SELECT (p->>'acquisition_job_id')::uuid FROM jsonb_array_elements(prov)p WHERE p->>'acquisition_job_id' IS NOT NULL) ORDER BY job_id LIMIT 2001)j;
 SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]') INTO receipts FROM(SELECT receipt_id,stock_id,issuer_document_id,source_url,period_end,document_sha256,receipt_status,parser_status,published_at,accepted_at,completed_at,parser_evidence_id,financial_validation_status FROM public.candidate_financial_document_receipts_v6 WHERE receipt_id IN(SELECT (l->>'receipt_id')::uuid FROM jsonb_array_elements(links)l) ORDER BY receipt_id LIMIT 2001)r;
 SELECT coalesce(jsonb_agg(to_jsonb(d)),'[]') INTO documents FROM(SELECT document_id,stock_id,document_url,document_sha256,acquisition_status,collected_at,recorded_at FROM public.candidate_issuer_ir_document_queue_v4 WHERE document_id IN(SELECT (r->>'issuer_document_id')::uuid FROM jsonb_array_elements(receipts)r) ORDER BY document_id LIMIT 2001)d;
 SELECT coalesce(jsonb_agg(to_jsonb(p)),'[]') INTO parsers FROM(SELECT evidence_id,receipt_id,document_sha256,manifest_sha256,recorded_at FROM public.candidate_financial_parser_evidence_v8 WHERE receipt_id IN(SELECT (r->>'receipt_id')::uuid FROM jsonb_array_elements(receipts)r) ORDER BY evidence_id LIMIT 2001)p;
 SELECT coalesce(jsonb_agg(to_jsonb(d)),'[]') INTO domains FROM(SELECT stock_id,host,approved_at FROM public.candidate_issuer_document_domains_v6 WHERE stock_id=stock ORDER BY host LIMIT 2001)d;
 SELECT coalesce(jsonb_agg(to_jsonb(p)),'[]') INTO prices FROM(SELECT observation_id,stock_id,session_id,raw_close,source_timestamp,recorded_at,source_ref FROM public.opportunity_price_observations_v3 WHERE stock_id=stock AND source_timestamp<=cutoff AND recorded_at<=cutoff ORDER BY session_id DESC,observation_id LIMIT 2001)p;
 IF EXISTS(SELECT FROM unnest(ARRAY[prov,links,jobs,receipts,documents,parsers,domains,prices]) a WHERE jsonb_array_length(a)>2000) THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('facts',original,'current',current_rows,'provenance',prov,'links',links,'jobs',jobs,'receipts',receipts,'documents',documents,'parsers',parsers,'domains',domains,'prices',prices);
END $$;

CREATE FUNCTION public.vnext_financial_grain_v1(f jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_array(f->'stock_id',f->'fact_key',coalesce(f->'period_start','null'),f->'period_end',coalesce(f->'duration_kind','null'),f->'estimate_kind',f->'estimate_horizon')
$$;
CREATE FUNCTION public.vnext_financial_heads_v1(rows_json jsonb,fact jsonb) RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 SELECT NOT EXISTS(SELECT FROM jsonb_array_elements(rows_json) f WHERE public.vnext_financial_grain_v1(f)=public.vnext_financial_grain_v1(fact)
  AND ((f->>'recorded_at')::timestamptz>(fact->>'recorded_at')::timestamptz OR (f->>'recorded_at')::timestamptz=(fact->>'recorded_at')::timestamptz AND f IS DISTINCT FROM fact))
 AND (fact->>'fact_key' NOT IN('quarterly_basic_eps','quarterly_diluted_eps') OR NOT EXISTS(SELECT FROM jsonb_array_elements(rows_json) f
  WHERE public.vnext_financial_grain_v1(f)=public.vnext_financial_grain_v1(fact) AND f->'filing_restatement_id' IS NOT DISTINCT FROM fact->'filing_restatement_id'
  AND jsonb_build_array(f->'value',f->'unit',f->'source_ref') IS DISTINCT FROM jsonb_build_array(fact->'value',fact->'unit',fact->'source_ref')))
$$;
CREATE FUNCTION public.vnext_financial_descriptor_v1(e jsonb,d jsonb,f jsonb,rows_json jsonb,cutoff timestamptz) RETURNS boolean
LANGUAGE plpgsql STABLE SET search_path=pg_catalog,public SET timezone='UTC' AS $$
DECLARE p jsonb;j jsonb;l jsonb;r jsonb;doc jsonb;parser jsonb;approval jsonb;classification jsonb;metadata jsonb;gaps jsonb;
 known_at timestamptz;available_at timestamptz;observation_at timestamptz;metadata_at timestamptz;period_type text;eps text;allowed text[];
BEGIN
 IF e->>'kind'<>'fact' OR e->>'sourceTier'<>'official' OR e->>'id' IS DISTINCT FROM f->>'fact_id' OR e->>'key' IS DISTINCT FROM f->>'fact_key'
  OR e->'value' IS DISTINCT FROM f->'value' OR e->>'unit' IS DISTINCT FROM f->>'unit' OR e->>'period' IS DISTINCT FROM f->>'period_end'
  OR d->>'stockId' IS DISTINCT FROM f->>'stock_id' OR d->>'factId' IS DISTINCT FROM f->>'fact_id'
  OR public.vnext_financial_wire_clock_v1(d->>'factRecordedAt') IS DISTINCT FROM (f->>'recorded_at')::timestamptz
  OR d->>'sourceRef' IS DISTINCT FROM f->>'source_ref' OR d->>'sourceUrl' IS DISTINCT FROM e->>'source'
  OR coalesce(d->>'sourceSha256','')!~'^[a-f0-9]{64}$' OR d->>'receiptHash' IS DISTINCT FROM public.vnext_financial_wire_hash_v1(d-'receiptHash')
  OR public.vnext_financial_wire_clock_v1(e->>'eventAt') IS DISTINCT FROM (f->>'source_timestamp')::timestamptz THEN RETURN false;END IF;
 classification:=jsonb_build_object('estimateKind',f->'estimate_kind','estimateHorizon',f->'estimate_horizon','periodStart',f->'period_start','periodEnd',f->'period_end','durationKind',f->'duration_kind','filingRevisionId',f->'filing_restatement_id','provider',f->'provider','authorityTier',f->'authority_tier');
 IF d->'classification' IS DISTINCT FROM classification THEN RETURN false;END IF;
 SELECT v INTO p FROM jsonb_array_elements(rows_json->'provenance')v WHERE v->>'provenance_id'=d->>'provenanceId' AND v->>'fact_id'=f->>'fact_id';
 IF p IS NULL OR p->>'source_url' IS DISTINCT FROM d->>'sourceUrl' OR p->>'source_sha256' IS DISTINCT FROM d->>'sourceSha256'
  OR (p->>'extracted_at')::timestamptz>cutoff OR (p->>'recorded_at')::timestamptz>cutoff THEN RETURN false;END IF;
 known_at:=greatest((p->>'extracted_at')::timestamptz,(p->>'recorded_at')::timestamptz);
 allowed:=ARRAY['stockId','factId','factRecordedAt','sourceRef','sourceUrl','sourceSha256','provenanceId','knownAt','classification','receiptHash'];
 IF f->>'source_ref' ~ '^(twse|tpex)-openapi:' THEN
  allowed:=array_append(allowed,'acquisitionJobId'::text);
  IF d->>'sourceUrl'!~'^https://([A-Za-z0-9-]+\.)?(twse\.com\.tw|tpex\.org\.tw)/[^#]*$' OR d->>'sourceUrl'~'[@#]' THEN RETURN false;END IF;
  SELECT v INTO j FROM jsonb_array_elements(rows_json->'jobs')v WHERE v->>'job_id'=p->>'acquisition_job_id' AND v->>'job_id'=d->>'acquisitionJobId';
  IF j IS NULL OR j->>'stock_id' IS DISTINCT FROM f->>'stock_id' OR j->>'period_end' IS DISTINCT FROM f->>'period_end' OR j->>'status'<>'terminal' OR j->>'terminal_reason'<>'complete'
   OR j->>'response_sha256' IS DISTINCT FROM d->>'sourceSha256' OR j->>'source_url' IS DISTINCT FROM d->>'sourceUrl'
   OR p->'locator'->>'source_ref' IS DISTINCT FROM f->>'source_ref' OR p->'locator'->>'period_end' IS DISTINCT FROM f->>'period_end' OR p->'locator'->>'fact_key' IS DISTINCT FROM f->>'fact_key'
   OR EXISTS(SELECT FROM unnest(ARRAY['created_at','updated_at','collected_at'])k WHERE (j->>k)::timestamptz>cutoff OR j->>k IS NULL) THEN RETURN false;END IF;
  known_at:=greatest(known_at,(j->>'created_at')::timestamptz,(j->>'updated_at')::timestamptz,(j->>'collected_at')::timestamptz);
 ELSIF f->>'source_ref' ~ ('^issuer-document:'||(d->>'sourceSha256')||':[a-f0-9]+$') THEN
  allowed:=allowed||ARRAY['receiptId','issuerDocumentId','parserEvidenceId','manifestSha256'];
  SELECT v INTO l FROM jsonb_array_elements(rows_json->'links')v WHERE v->>'fact_id'=f->>'fact_id' AND (v->>'fact_recorded_at')::timestamptz=(f->>'recorded_at')::timestamptz AND v->>'receipt_id'=d->>'receiptId' AND v->>'evidence_id'=d->>'parserEvidenceId';
  SELECT v INTO r FROM jsonb_array_elements(rows_json->'receipts')v WHERE v->>'receipt_id'=d->>'receiptId';
  SELECT v INTO doc FROM jsonb_array_elements(rows_json->'documents')v WHERE v->>'document_id'=d->>'issuerDocumentId';
  SELECT v INTO parser FROM jsonb_array_elements(rows_json->'parsers')v WHERE v->>'evidence_id'=d->>'parserEvidenceId';
  IF l IS NULL OR r IS NULL OR doc IS NULL OR parser IS NULL OR r->>'stock_id' IS DISTINCT FROM f->>'stock_id' OR doc->>'stock_id' IS DISTINCT FROM f->>'stock_id'
   OR r->>'period_end' IS DISTINCT FROM f->>'period_end' OR r->>'issuer_document_id' IS DISTINCT FROM doc->>'document_id' OR p->>'issuer_document_id' IS DISTINCT FROM doc->>'document_id'
   OR r->>'document_sha256' IS DISTINCT FROM d->>'sourceSha256' OR doc->>'document_sha256' IS DISTINCT FROM d->>'sourceSha256' OR parser->>'document_sha256' IS DISTINCT FROM d->>'sourceSha256'
   OR r->>'source_url' IS DISTINCT FROM d->>'sourceUrl' OR doc->>'document_url' IS DISTINCT FROM d->>'sourceUrl' OR doc->>'acquisition_status'<>'fetched'
   OR r->>'receipt_status'<>'accepted' OR r->>'parser_status'<>'complete' OR r->>'parser_evidence_id' IS DISTINCT FROM parser->>'evidence_id' OR parser->>'receipt_id' IS DISTINCT FROM r->>'receipt_id'
   OR p->'locator'->>'parser_evidence_id' IS DISTINCT FROM parser->>'evidence_id' OR p->'locator'->>'manifest_sha256' IS DISTINCT FROM d->>'manifestSha256' OR parser->>'manifest_sha256' IS DISTINCT FROM d->>'manifestSha256' OR p->'locator'->>'response_url' IS DISTINCT FROM d->>'sourceUrl'
   OR coalesce(d->>'manifestSha256','')!~'^[a-f0-9]{64}$' THEN RETURN false;END IF;
  known_at:=greatest(known_at,(l->>'created_at')::timestamptz,(r->>'accepted_at')::timestamptz,(r->>'completed_at')::timestamptz,(r->>'published_at')::timestamptz,(doc->>'collected_at')::timestamptz,(doc->>'recorded_at')::timestamptz,(parser->>'recorded_at')::timestamptz);
  IF d->>'sourceUrl'!~'^https://([A-Za-z0-9-]+\.)?(twse\.com\.tw|tpex\.org\.tw)/[^#]*$' THEN
   allowed:=allowed||ARRAY['sourceKind','issuerApproval','originalFact'];
   SELECT v INTO approval FROM jsonb_array_elements(rows_json->'domains')v WHERE v->>'stock_id'=f->>'stock_id' AND v->>'host'=substring(d->>'sourceUrl' FROM '^https://([^/]+)/') AND (v->>'approved_at')::timestamptz<=cutoff;
   IF approval IS NULL OR d->>'sourceKind'<>'approved_issuer_ir' OR d->>'sourceUrl'!~'^https://[a-z0-9][a-z0-9.-]+/[^#]+$' OR d->>'sourceUrl'~'[@#]'
    OR f->>'provider'<>'mops' OR f->>'authority_tier'<>'official_filing' OR r->>'financial_validation_status'<>'validated' OR f->>'filing_published_at' IS NULL
    OR d->'originalFact' IS NULL OR d->'issuerApproval'->>'stockId' IS DISTINCT FROM f->>'stock_id' OR d->'issuerApproval'->>'host' IS DISTINCT FROM approval->>'host'
    OR public.vnext_financial_wire_clock_v1(d->'issuerApproval'->>'approvedAt') IS DISTINCT FROM (approval->>'approved_at')::timestamptz THEN RETURN false;END IF;
   known_at:=greatest(known_at,(approval->>'approved_at')::timestamptz);
  END IF;
 ELSE RETURN false;END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(d))<>cardinality(allowed) OR NOT(d ?& allowed) OR known_at>cutoff
  OR public.vnext_financial_wire_clock_v1(d->>'knownAt') IS DISTINCT FROM known_at THEN RETURN false;END IF;
 observation_at:=(f->>'source_timestamp')::timestamptz;
 available_at:=greatest(observation_at,(f->>'collected_at')::timestamptz,(f->>'recorded_at')::timestamptz,(f->>'filing_published_at')::timestamptz,(f->>'validation_recorded_at')::timestamptz,known_at);
 IF available_at>cutoff OR public.vnext_financial_wire_clock_v1(e->>'availableAt') IS DISTINCT FROM available_at THEN RETURN false;END IF;
 period_type:=CASE WHEN f->>'period_end' IS NULL THEN NULL WHEN f->>'duration_kind'='instant' AND f->>'period_start' IS NULL THEN 'instant' WHEN f->>'duration_kind' IN('monthly','quarterly','ttm') AND f->>'period_start' IS NOT NULL AND f->>'period_start'<=f->>'period_end' THEN 'duration' ELSE NULL END;
 eps:=CASE f->>'fact_key' WHEN 'quarterly_basic_eps' THEN 'basic' WHEN 'quarterly_diluted_eps' THEN 'diluted' ELSE NULL END;
 gaps:='["missing_sql_financial_interval_basis_parity"]';
 IF period_type IS NULL THEN gaps:=gaps||'"financial_exact_period_metadata_unavailable"';END IF;
 IF f->>'duration_kind'<>'instant' OR f->>'duration_kind' IS NULL THEN gaps:=gaps||'"financial_reporting_frequency_not_typed"';END IF;
 IF f->>'unit' IN('TWD_per_share','TWD/share','share','thousand_shares') THEN gaps:=gaps||'"financial_share_basis_not_typed"';END IF;
 IF eps IS NOT NULL THEN gaps:=gaps||'["eps_share_basis_not_typed","corporate_action_restatement_bridge_missing"]';
  IF f->>'unit' NOT IN('TWD_per_share','TWD/share') THEN gaps:=gaps||'"eps_per_share_unit_unavailable"';END IF;END IF;
 IF f->>'validation_recorded_at' IS NOT NULL AND (f->>'recorded_at')::timestamptz<=(f->>'validation_recorded_at')::timestamptz THEN metadata_at:=available_at;
 ELSE gaps:=gaps||'"financial_fixed_source_receipt_unknown"';END IF;
 -- Preserve the original packet's clock spelling AFTER exact instant equality.
 metadata:=jsonb_build_object('schemaVersion','vnext-financial-observation-v1','factId',f->'fact_id','factContentHash',e->'contentHash','periodStart',f->'period_start','periodEnd',f->'period_end','storedDurationKind',f->'duration_kind','periodType',period_type,'reportingFrequency',NULL,'estimateKind',f->'estimate_kind','estimateHorizon',f->'estimate_horizon','epsBasis',eps,'filingRevisionId',f->'filing_restatement_id','shareBasis',NULL,'denominatorShares',NULL,'restatementBasis',NULL,'corporateActionRevision',NULL,
  'sourceReceiptHash',CASE WHEN metadata_at IS NOT NULL THEN d->'receiptHash' ELSE 'null'::jsonb END,'sourceRawSha256',CASE WHEN metadata_at IS NOT NULL THEN d->'sourceSha256' ELSE 'null'::jsonb END,'sourceReceiptId',CASE WHEN metadata_at IS NOT NULL THEN coalesce(d->'receiptId','null') ELSE 'null'::jsonb END,'acquisitionJobId',CASE WHEN metadata_at IS NOT NULL THEN coalesce(d->'acquisitionJobId','null') ELSE 'null'::jsonb END,'provenanceId',CASE WHEN metadata_at IS NOT NULL THEN d->'provenanceId' ELSE 'null'::jsonb END,'knownAt',CASE WHEN metadata_at IS NOT NULL THEN e->'financial'->'knownAt' ELSE 'null'::jsonb END,'gaps',gaps);
 IF metadata_at IS NOT NULL AND public.vnext_financial_wire_clock_v1(e->'financial'->>'knownAt') IS DISTINCT FROM metadata_at THEN RETURN false;END IF;
 RETURN e->'financial'=metadata;
END $$;
CREATE FUNCTION public.vnext_financial_packet_v1(symbol_value text,packet jsonb) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC' SET statement_timeout='30s' SET lock_timeout='2s' AS $$
DECLARE stock uuid;cutoff timestamptz;rows_json jsonb;e jsonb;item jsonb;raw jsonb;f jsonb;current_f jsonb;d jsonb;key_name text;price jsonb;
 clock_keys text[]:=ARRAY['source_timestamp','collected_at','recorded_at','filing_published_at','validation_recorded_at'];
 fact_keys text[]:=ARRAY['fact_id','stock_id','fact_key','period_start','period_end','duration_kind','value','unit','provider','authority_tier','estimate_kind','estimate_horizon','filing_published_at','source_timestamp','collected_at','filing_restatement_id','source_ref','recorded_at','validation_status','schema_valid','unit_valid','point_in_time_valid','consistency_valid','upstream_provider','validation_recorded_at'];count_financial integer:=0;
BEGIN
 IF symbol_value!~'^[0-9]{4}$' OR jsonb_typeof(packet) IS DISTINCT FROM 'object' OR NOT public.vnext_provider_envelope_v1(packet)
  OR jsonb_typeof(packet->'evidence') IS DISTINCT FROM 'array' OR jsonb_array_length(packet->'evidence')>2000
  OR jsonb_typeof(packet->'financialSourceReceipts') IS DISTINCT FROM 'array' OR jsonb_array_length(packet->'financialSourceReceipts')>2000
  OR jsonb_typeof(packet->'financialProviderInput') IS DISTINCT FROM 'object' OR packet->'financialProviderInput'->>'schemaVersion' IS DISTINCT FROM 'vnext-financial-provider-input-v1'
  OR (SELECT count(*) FROM jsonb_object_keys(packet->'financialProviderInput'))<>2 OR jsonb_typeof(packet->'financialProviderInput'->'facts') IS DISTINCT FROM 'array'
  OR jsonb_array_length(packet->'financialProviderInput'->'facts')>2000 THEN RETURN false;END IF;
 cutoff:=public.vnext_financial_wire_clock_v1(packet->>'cutoff');IF cutoff IS NULL OR cutoff>statement_timestamp() THEN RETURN false;END IF;
 stock:=public.vnext_forecast_stock_id_internal_v1(symbol_value);IF stock IS NULL THEN RETURN false;END IF;
 rows_json:=public.vnext_financial_rows_internal_v1(stock,cutoff);IF rows_json IS NULL THEN RETURN false;END IF;
 IF (SELECT count(DISTINCT v->>'id') FROM jsonb_array_elements(packet->'evidence')v)<>jsonb_array_length(packet->'evidence')
  OR (SELECT count(DISTINCT v->>'factId') FROM jsonb_array_elements(packet->'financialProviderInput'->'facts')v)<>jsonb_array_length(packet->'financialProviderInput'->'facts') THEN RETURN false;END IF;
 FOR e IN SELECT v FROM jsonb_array_elements(packet->'evidence')v LOOP
  SELECT v INTO f FROM jsonb_array_elements(rows_json->'facts')v WHERE v->>'fact_id'=e->>'id';
  -- Actual catalog/ID identity decides financial coverage, not optional metadata.
  IF f IS NOT NULL OR e ? 'financial' OR e->>'key' IN('monthly_revenue','quarterly_revenue','quarterly_gross_profit','quarterly_operating_expense','quarterly_operating_income','quarterly_non_operating_income','quarterly_pretax_income','quarterly_income_tax_expense','quarterly_noncontrolling_interest','quarterly_net_income','quarterly_net_income_attributable_to_common','quarterly_diluted_eps','quarterly_basic_eps','quarterly_ebitda','depreciation_amortization','diluted_shares','diluted_weighted_average_shares','basic_weighted_average_shares','common_shares_outstanding','book_value_per_share','roe','cash_and_equivalents','total_debt','net_debt','total_equity','total_assets','invested_capital','net_asset_value','operating_cash_flow','operating_cashflow','capital_expenditure','interest_expense','shares_outstanding','pe_multiple','pb_multiple','ev_ebitda_multiple','ev_sales_multiple','broker_target_price') THEN
   count_financial:=count_financial+1;
   IF f IS NULL OR NOT(e ? 'financial') OR f->>'stock_id' IS DISTINCT FROM stock::text OR f->>'estimate_kind'<>'reported' OR f->>'estimate_horizon'<>'reported_period'
    OR f->>'validation_status'<>'validated' OR f->>'authority_tier' NOT IN('official_primary','official_filing') OR NOT(f @> '{"schema_valid":true,"unit_valid":true,"point_in_time_valid":true,"consistency_valid":true}')
    OR NOT public.vnext_financial_heads_v1(rows_json->'facts',f) THEN RETURN false;END IF;
   SELECT v INTO current_f FROM jsonb_array_elements(rows_json->'current')v WHERE v->>'fact_id'=f->>'fact_id';
   IF current_f IS NULL OR current_f->>'validation_status'<>'validated' OR NOT(current_f @> '{"schema_valid":true,"unit_valid":true,"point_in_time_valid":true,"consistency_valid":true}')
    OR NOT public.vnext_financial_heads_v1(rows_json->'current',current_f) THEN RETURN false;END IF;
   SELECT v INTO item FROM jsonb_array_elements(packet->'financialProviderInput'->'facts')v WHERE v->>'factId'=f->>'fact_id';
   IF item IS NULL OR (SELECT count(*) FROM jsonb_object_keys(item))<>4 OR NOT(item ?& ARRAY['factId','factRecordedAt','originalFact','receiptHash']) THEN RETURN false;END IF;
   raw:=item->'originalFact';
   IF jsonb_typeof(raw) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(raw))<>cardinality(fact_keys) OR NOT(raw ?& fact_keys)
    OR raw-clock_keys IS DISTINCT FROM f-clock_keys OR public.vnext_financial_wire_hash_v1(raw) IS DISTINCT FROM e->>'contentHash'
    OR public.vnext_financial_wire_hash_v1(raw) IS NULL OR public.vnext_financial_wire_clock_v1(item->>'factRecordedAt') IS DISTINCT FROM (f->>'recorded_at')::timestamptz THEN RETURN false;END IF;
   FOREACH key_name IN ARRAY clock_keys LOOP
    IF raw->>key_name IS NULL THEN IF f->>key_name IS NOT NULL THEN RETURN false;END IF;
    ELSIF public.vnext_financial_wire_clock_v1(raw->>key_name) IS NULL OR public.vnext_financial_wire_clock_v1(raw->>key_name) IS DISTINCT FROM (f->>key_name)::timestamptz OR (f->>key_name)::timestamptz>cutoff THEN RETURN false;END IF;
   END LOOP;
   IF f->>'source_timestamp' IS NULL OR f->>'collected_at' IS NULL OR f->>'recorded_at' IS NULL OR (f->>'source_timestamp')::timestamptz>(f->>'collected_at')::timestamptz OR (f->>'collected_at')::timestamptz>(f->>'recorded_at')::timestamptz THEN RETURN false;END IF;
   IF (SELECT count(*) FROM jsonb_array_elements(packet->'financialSourceReceipts')v WHERE v->>'factId'=f->>'fact_id')<>1 THEN RETURN false;END IF;
   SELECT v INTO d FROM jsonb_array_elements(packet->'financialSourceReceipts')v WHERE v->>'factId'=f->>'fact_id';
   IF item->>'receiptHash' IS DISTINCT FROM d->>'receiptHash' OR d ? 'originalFact' AND d->'originalFact' IS DISTINCT FROM raw
    OR NOT public.vnext_financial_descriptor_v1(e,d,f,rows_json,cutoff) THEN RETURN false;END IF;
  ELSIF e->>'sourceTier'='official' AND e->>'kind'='fact' AND jsonb_typeof(e->'value')='number' THEN
   -- Preserve genuine raw-price observations; no arbitrary official numeric alias.
   SELECT v INTO price FROM jsonb_array_elements(rows_json->'prices')v WHERE v->>'observation_id'=e->>'id';
   IF e->>'key'<>'current_price' OR price IS NULL OR e->>'period' IS DISTINCT FROM price->>'session_id' OR e->'value' IS DISTINCT FROM price->'raw_close'
    OR public.vnext_financial_wire_clock_v1(e->>'eventAt') IS DISTINCT FROM (price->>'source_timestamp')::timestamptz OR public.vnext_financial_wire_clock_v1(e->>'availableAt') IS DISTINCT FROM (price->>'recorded_at')::timestamptz THEN RETURN false;END IF;
  END IF;
 END LOOP;
 -- Extra descriptors, one-node stripping, mislabelling, or missing BOTH fields
 -- cannot select the old numeric/hostname shortcut for a new preparation.
 RETURN count_financial=jsonb_array_length(packet->'financialProviderInput'->'facts');
EXCEPTION WHEN others THEN RETURN false;
END $$;

CREATE FUNCTION public.vnext_financial_bound_current_v1(target_job uuid,target_input text,packet jsonb) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC' AS $$
DECLARE binding public.vnext_financial_preparation_protocols_v1;work public.vnext_jobs_v1;prep public.vnext_preparations_v1;
BEGIN
 SELECT * INTO work FROM public.vnext_jobs_v1 WHERE job_id=target_job;
 SELECT * INTO prep FROM public.vnext_preparations_v1 WHERE job_id=target_job;
 IF work.job_id IS NULL OR prep.job_id IS NULL OR work.input_hash IS DISTINCT FROM target_input OR prep.input_hash IS DISTINCT FROM target_input OR prep.evidence IS DISTINCT FROM packet THEN RETURN false;END IF;
 SELECT * INTO binding FROM public.vnext_financial_preparation_protocols_v1 WHERE job_id=target_job;
 -- Only genuinely preexisting preparation rows can have no binding: the new
 -- INSERT trigger is unconditional. No protocol selector comes from JSON.
 IF binding.job_id IS NULL THEN RETURN true;END IF;
 RETURN binding.input_hash=target_input AND binding.frozen_packet=packet AND binding.protocol='vnext-financial-provider-input-v1'
  AND public.vnext_financial_packet_v1(work.symbol,packet);
END $$;
CREATE FUNCTION public.vnext_financial_prepare_bind_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE work public.vnext_jobs_v1;member public.vnext_members_v1;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'vnext_financial_protocol_immutable';END IF;
 PERFORM pg_advisory_xact_lock(64221022);
 SELECT * INTO work FROM public.vnext_jobs_v1 WHERE job_id=NEW.job_id FOR UPDATE;
 SELECT * INTO member FROM public.vnext_members_v1 WHERE symbol=work.symbol FOR UPDATE;
 -- Existing core inserts preparation BEFORE updating job/member input_hash.
 IF work.job_id IS NULL OR work.state<>'running' OR work.execution_id IS NULL OR work.author_principal IS NULL OR work.deadline_at<=clock_timestamp()
  OR work.admission_hash IS DISTINCT FROM NEW.admission_hash OR member.input_hash IS DISTINCT FROM work.input_hash OR member.state='exited' OR member.contraindication
  OR NOT EXISTS(SELECT FROM public.vnext_principals_v1 WHERE principal=work.author_principal AND role='author' AND enabled)
  OR NOT public.vnext_financial_packet_v1(work.symbol,NEW.evidence) THEN RAISE EXCEPTION 'vnext_financial_provider_preparation_invalid';END IF;
 INSERT INTO public.vnext_financial_preparation_protocols_v1(job_id,input_hash,protocol,frozen_packet,packet_digest)
  VALUES(NEW.job_id,NEW.input_hash,'vnext-financial-provider-input-v1',NEW.evidence,encode(sha256(convert_to(NEW.evidence::text,'UTF8')),'hex'));
 RETURN NEW;
END $$;
-- AFTER INSERT keeps the binding FK genuine, while any refusal rolls back BOTH.
CREATE TRIGGER vnext_financial_prepare_bind AFTER INSERT ON public.vnext_preparations_v1 FOR EACH ROW EXECUTE FUNCTION public.vnext_financial_prepare_bind_v1();
CREATE FUNCTION public.vnext_financial_protocol_immutable_v1() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'vnext_financial_protocol_immutable';END $$;
CREATE TRIGGER vnext_financial_protocol_immutable BEFORE UPDATE OR DELETE ON public.vnext_financial_preparation_protocols_v1 FOR EACH ROW EXECUTE FUNCTION public.vnext_financial_protocol_immutable_v1();
ALTER FUNCTION public.vnext_financial_wire_canonical_v1(jsonb,integer) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_financial_wire_canonical_v1(jsonb,integer) FROM PUBLIC, anon, authenticated, service_role;
ALTER FUNCTION public.vnext_financial_wire_hash_v1(jsonb) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_financial_wire_hash_v1(jsonb) FROM PUBLIC, anon, authenticated, service_role;
ALTER FUNCTION public.vnext_financial_wire_clock_v1(text) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_financial_wire_clock_v1(text) FROM PUBLIC, anon, authenticated, service_role;
ALTER FUNCTION public.vnext_financial_rows_internal_v1(uuid,timestamptz) OWNER TO opportunity_v3_rpc_owner;
REVOKE ALL ON FUNCTION public.vnext_financial_rows_internal_v1(uuid,timestamptz) FROM PUBLIC, anon, authenticated, service_role;
ALTER FUNCTION public.vnext_financial_grain_v1(jsonb) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_financial_grain_v1(jsonb) FROM PUBLIC, anon, authenticated, service_role;
ALTER FUNCTION public.vnext_financial_heads_v1(jsonb,jsonb) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_financial_heads_v1(jsonb,jsonb) FROM PUBLIC, anon, authenticated, service_role;
ALTER FUNCTION public.vnext_financial_descriptor_v1(jsonb,jsonb,jsonb,jsonb,timestamptz) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_financial_descriptor_v1(jsonb,jsonb,jsonb,jsonb,timestamptz) FROM PUBLIC, anon, authenticated, service_role;
ALTER FUNCTION public.vnext_financial_packet_v1(text,jsonb) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_financial_packet_v1(text,jsonb) FROM PUBLIC, anon, authenticated, service_role;
ALTER FUNCTION public.vnext_financial_bound_current_v1(uuid,text,jsonb) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_financial_bound_current_v1(uuid,text,jsonb) FROM PUBLIC, anon, authenticated, service_role;
ALTER FUNCTION public.vnext_financial_prepare_bind_v1() OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_financial_prepare_bind_v1() FROM PUBLIC, anon, authenticated, service_role;
ALTER FUNCTION public.vnext_financial_protocol_immutable_v1() OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_financial_protocol_immutable_v1() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vnext_financial_rows_internal_v1(uuid,timestamptz) TO stockinsider_vnext_owner;

-- Finite exact-preimage body additions; original arguments, owner, ACL and
-- catalog metadata stay unchanged. Body hashes are source reconstruction only.
DO $patch$
DECLARE item jsonb;fragment jsonb;target oid;original text;changed text;definition text;metadata jsonb;
BEGIN
 FOR item IN SELECT v FROM jsonb_array_elements($profile$[{"signature":"public.vnext_command_v1(text,text,jsonb)","predecessorBodySha256":"130fa80b87ece7cc9bfb59b5998078cfd76ebb852a12632706e3fc5cf7eefafb","successorBodySha256":"5c00756cd3d9c99f11db2e8eb5529f57a0fe161814e776d4450396e79afeb7d6","predecessorBytes":45249,"successorBytes":45834,"fragments":[["  SELECT * INTO m FROM public.vnext_members_v1 WHERE symbol=j.symbol;\n  IF p_command IN('publish','qualification-context') AND j.state='published' THEN","  SELECT * INTO m FROM public.vnext_members_v1 WHERE symbol=j.symbol;\n  IF p_command IN('work-context','author-context','author','review-claim','review-context','review-sources','review','qualification-context','record-qualification','publish') AND EXISTS(SELECT FROM public.vnext_financial_preparation_protocols_v1 WHERE job_id=j.job_id) AND NOT public.vnext_financial_bound_current_v1(j.job_id,j.input_hash,(SELECT evidence FROM public.vnext_preparations_v1 WHERE job_id=j.job_id)) THEN RAISE EXCEPTION 'vnext_financial_provider_current_source_invalid';END IF;\n  IF p_command IN('publish','qualification-context') AND j.state='published' THEN"],["   IF p_command='work-context' THEN RETURN answer; END IF;","   IF p_command='work-context' THEN\n    RETURN answer||jsonb_build_object('financialProviderProtocol','vnext-financial-provider-input-v1');\n   END IF;"]]},{"signature":"public.vnext_provider_command_v1(text,text,jsonb)","predecessorBodySha256":"b541f6c8b7441a1165f6bd537a854b0ba3a849cefa6a45107da33e8f94efdff3","successorBodySha256":"68dc31b9e67c22e3111e3da92ef5c2bfc909eda35ae8cadd1af544ed41fbd622","predecessorBytes":15382,"successorBytes":15893,"fragments":[["  IF invocation.invocation_id IS NOT NULL THEN RETURN to_jsonb(invocation)||jsonb_build_object('dispatch',false); END IF;","  IF invocation.invocation_id IS NOT NULL THEN RETURN to_jsonb(invocation)||jsonb_build_object('dispatch',false); END IF;\n  IF EXISTS(SELECT FROM public.vnext_financial_preparation_protocols_v1 WHERE job_id=j.job_id) AND NOT public.vnext_financial_bound_current_v1(j.job_id,j.input_hash,member.evidence) THEN RAISE EXCEPTION 'vnext_financial_provider_current_source_invalid';END IF;"],[") AND NOT public.vnext_source_evidence_current_v1(fact,j.symbol)",") AND NOT public.vnext_source_evidence_current_v1(fact,j.symbol)\n AND NOT(EXISTS(SELECT FROM public.vnext_financial_preparation_protocols_v1 WHERE job_id=j.job_id) AND EXISTS(SELECT FROM jsonb_array_elements(member.evidence->'financialProviderInput'->'facts') description WHERE description->>'factId'=fact->>'id'))"]]},{"signature":"public.vnext_input_sources_current_v1(jsonb,text)","predecessorBodySha256":"912b039211f3624f82fa1940740b9cb47a8f0ed46817e108504b29d5a528b8e4","successorBodySha256":"e0ab34d30cde50709c2cc25b5ba19f7879808eeee722302f1be47de9597c270a","predecessorBytes":1294,"successorBytes":1676,"fragments":[["SELECT public.vnext_action_terms_input_current_v1(input,p_symbol) AND (SELECT public.vnext_forecast_input_current_internal_v1(input,p_symbol) AND (\n SELECT coalesce(jsonb_typeof(input->'evidence')='array' AND NOT EXISTS(SELECT FROM jsonb_array_elements(input->'evidence') source_item WHERE\n  CASE WHEN source_item->>'sourceTier'='official' THEN\n   coalesce(source_item->>'source','') !~ '^https://([A-Za-z0-9-]+\\.)?(twse\\.com\\.tw|tpex\\.org\\.tw)(/|$)' AND NOT EXISTS(\n    SELECT FROM jsonb_array_elements(coalesce(input->'financialSourceReceipts','[]'::jsonb)) descriptor WHERE descriptor->>'sourceKind'='approved_issuer_ir' AND descriptor->>'factId'=source_item->>'id'\n     AND public.vnext_provider_json_codec_v1(jsonb_path_query_array(descriptor->'originalFact','$.*')) AND source_item->>'contentHash'=encode(sha256(convert_to(public.vnext_catalog_canonical_v1(descriptor->'originalFact'),'UTF8')),'hex')\n     AND public.vnext_issuer_financial_evidence_current_v1(source_item,input,p_symbol))\n  ELSE NOT public.vnext_source_evidence_current_v1(source_item,p_symbol) END),false)\n AND NOT EXISTS(SELECT FROM public.vnext_members_v1 current_member WHERE current_member.symbol=p_symbol AND public.vnext_trading_invalid_current_v1(current_member.symbol,current_member.input_hash) ? 'proofHash')\n))","SELECT public.vnext_action_terms_input_current_v1(input,p_symbol) AND (SELECT public.vnext_forecast_input_current_internal_v1(input,p_symbol) AND (\n SELECT coalesce(jsonb_typeof(input->'evidence')='array' AND NOT EXISTS(SELECT FROM jsonb_array_elements(input->'evidence') source_item WHERE\n  CASE WHEN source_item->>'sourceTier'='official' THEN\n   coalesce(source_item->>'source','') !~ '^https://([A-Za-z0-9-]+\\.)?(twse\\.com\\.tw|tpex\\.org\\.tw)(/|$)' AND NOT EXISTS(\n    SELECT FROM jsonb_array_elements(coalesce(input->'financialSourceReceipts','[]'::jsonb)) descriptor WHERE descriptor->>'sourceKind'='approved_issuer_ir' AND descriptor->>'factId'=source_item->>'id'\n     AND public.vnext_provider_json_codec_v1(jsonb_path_query_array(descriptor->'originalFact','$.*')) AND source_item->>'contentHash'=encode(sha256(convert_to(public.vnext_catalog_canonical_v1(descriptor->'originalFact'),'UTF8')),'hex')\n     AND public.vnext_issuer_financial_evidence_current_v1(source_item,input,p_symbol))\n  ELSE NOT public.vnext_source_evidence_current_v1(source_item,p_symbol) END),false)\n AND NOT EXISTS(SELECT FROM public.vnext_members_v1 current_member WHERE current_member.symbol=p_symbol AND public.vnext_trading_invalid_current_v1(current_member.symbol,current_member.input_hash) ? 'proofHash')\n))\n AND NOT EXISTS(SELECT FROM public.vnext_financial_preparation_protocols_v1 binding JOIN public.vnext_jobs_v1 bound_job ON bound_job.job_id=binding.job_id JOIN public.vnext_preparations_v1 prep ON prep.job_id=binding.job_id WHERE bound_job.symbol=p_symbol AND prep.evidence=input AND NOT public.vnext_financial_bound_current_v1(bound_job.job_id,bound_job.input_hash,prep.evidence))"]]},{"signature":"public.vnext_business_criteria_current_v1(uuid,text)","predecessorBodySha256":"b9e54d8adb331246d92d59336ea79f65929fd011591361aa35adf74f9cb7337a","successorBodySha256":"e774b54f1d0841348078ca5f87800cc10d95407b48aa4800147865f441ddabbc","predecessorBytes":12114,"successorBytes":12317,"fragments":[[" SELECT preparation.evidence INTO frozen FROM public.vnext_preparations_v1 preparation WHERE preparation.job_id=pub.job_id;"," SELECT preparation.evidence INTO frozen FROM public.vnext_preparations_v1 preparation WHERE preparation.job_id=pub.job_id;\n IF EXISTS(SELECT FROM public.vnext_financial_preparation_protocols_v1 WHERE job_id=pub.job_id) AND NOT public.vnext_financial_bound_current_v1(pub.job_id,pub.input_hash,frozen) THEN RETURN NULL;END IF;"]]},{"signature":"public.vnext_thesis_publication_guard_v1()","predecessorBodySha256":"ea1f2e137320efb230a89d88d59fde65743425ffc97f8214764d8643cb2f9ee3","successorBodySha256":"bd56ab1e0b5f812236d4456fe9d6ae531f1a51a5ce676685ede62c2573ba964b","predecessorBytes":465,"successorBytes":722,"fragments":[[" SELECT evidence INTO frozen FROM public.vnext_preparations_v1 WHERE job_id=NEW.job_id;"," SELECT evidence INTO frozen FROM public.vnext_preparations_v1 WHERE job_id=NEW.job_id;\n IF EXISTS(SELECT FROM public.vnext_financial_preparation_protocols_v1 WHERE job_id=NEW.job_id) AND NOT public.vnext_financial_bound_current_v1(NEW.job_id,NEW.input_hash,frozen) THEN RAISE EXCEPTION 'vnext_financial_provider_current_source_invalid';END IF;"]]}]$profile$::jsonb)v LOOP
  target:=to_regprocedure(item->>'signature');
  SELECT prosrc,pg_get_functiondef(oid),to_jsonb(p)-'prosrc' INTO original,definition,metadata FROM pg_proc p WHERE oid=target;
  IF target IS NULL OR encode(sha256(convert_to(original,'UTF8')),'hex') IS DISTINCT FROM item->>'predecessorBodySha256' OR octet_length(convert_to(original,'UTF8'))<>(item->>'predecessorBytes')::integer
   OR NOT EXISTS(SELECT FROM pg_proc WHERE oid=target AND proowner='stockinsider_vnext_owner'::regrole AND prosecdef AND prokind='f' AND prolang=(SELECT oid FROM pg_language WHERE lanname=CASE WHEN item->>'signature'='public.vnext_input_sources_current_v1(jsonb,text)' THEN 'sql' ELSE 'plpgsql' END)) THEN RAISE EXCEPTION 'financial_provider_predecessor_changed';END IF;
  IF EXISTS(SELECT FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=target AND (a.grantor<>p.proowner OR a.privilege_type<>'EXECUTE' OR a.is_grantable OR a.grantee NOT IN(p.proowner,'service_role'::regrole::oid))) THEN RAISE EXCEPTION 'financial_provider_acl_changed';END IF;
  changed:=original;
  FOR fragment IN SELECT v FROM jsonb_array_elements(item->'fragments')v LOOP
   IF (length(changed)-length(replace(changed,fragment->>0,'')))<>length(fragment->>0) THEN RAISE EXCEPTION 'financial_provider_single_seam_required';END IF;
   changed:=replace(changed,fragment->>0,fragment->>1);
  END LOOP;
  IF encode(sha256(convert_to(changed,'UTF8')),'hex') IS DISTINCT FROM item->>'successorBodySha256' OR octet_length(convert_to(changed,'UTF8'))<>(item->>'successorBytes')::integer THEN RAISE EXCEPTION 'financial_provider_successor_changed';END IF;
  FOR fragment IN SELECT v FROM jsonb_array_elements(item->'fragments') WITH ORDINALITY x(v,ord) ORDER BY ord DESC LOOP changed:=replace(changed,fragment->>1,fragment->>0);END LOOP;
  IF changed IS DISTINCT FROM original THEN RAISE EXCEPTION 'financial_provider_inverse_changed';END IF;
  changed:=original;FOR fragment IN SELECT v FROM jsonb_array_elements(item->'fragments')v LOOP changed:=replace(changed,fragment->>0,fragment->>1);END LOOP;
  EXECUTE replace(definition,original,changed);
  IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE oid=target) IS DISTINCT FROM metadata OR (SELECT prosrc FROM pg_proc WHERE oid=target) IS DISTINCT FROM changed THEN RAISE EXCEPTION 'financial_provider_catalog_changed';END IF;
 END LOOP;
END $patch$;
COMMIT;
