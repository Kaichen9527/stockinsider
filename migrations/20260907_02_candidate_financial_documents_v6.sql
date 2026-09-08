-- Candidate financial documents v6: private, immutable evidence receipts.
-- This migration is additive. It intentionally does not alter the financial
-- fact/valuation enum contract owned by the contract-finance migration. Apply
-- after 20260906_truth_research_v3.sql and
-- 20260907_evidence_valuation_contract_v6.sql.

BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'candidate-financial-documents-v6', 'candidate-financial-documents-v6', false,
  52428800,
  ARRAY['application/pdf','text/html','application/xhtml+xml','application/xml','text/xml']
)
ON CONFLICT (id) DO UPDATE SET public=false, file_size_limit=52428800,
  allowed_mime_types=EXCLUDED.allowed_mime_types;

CREATE TABLE IF NOT EXISTS public.candidate_issuer_document_domains_v6 (
  stock_id uuid NOT NULL REFERENCES public.stocks(id) ON DELETE RESTRICT,
  host text NOT NULL CHECK(host ~ '^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$'),
  approved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  approved_by uuid,
  note text,
  PRIMARY KEY(stock_id,host)
);

-- Curated issuer fallback already shipped by the runtime. This approval is
-- narrow to Nanya's own IR host and does not create a general URL allowlist.
INSERT INTO public.candidate_issuer_document_domains_v6(stock_id,host,note)
SELECT id,'www.nanya.com','reviewed issuer IR fallback for 2408'
FROM public.stocks WHERE symbol='2408'
ON CONFLICT (stock_id,host) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.candidate_financial_document_receipts_v6 (
  receipt_id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  stock_id uuid NOT NULL REFERENCES public.stocks(id) ON DELETE RESTRICT,
  acquisition_job_id uuid REFERENCES public.candidate_financial_acquisition_jobs_v4(job_id) ON DELETE RESTRICT,
  issuer_document_id uuid NOT NULL REFERENCES public.candidate_issuer_ir_document_queue_v4(document_id) ON DELETE RESTRICT,
  source_url text NOT NULL CHECK(source_url ~ '^https://'),
  exchange text NOT NULL CHECK(exchange IN ('TWSE','TPEX')),
  period_end date NOT NULL,
  published_at timestamptz,
  content_type text NOT NULL CHECK(content_type IN ('application/pdf','text/html','application/xhtml+xml','application/xml','text/xml')),
  document_sha256 text NOT NULL CHECK(document_sha256 ~ '^[0-9a-f]{64}$'),
  object_key text NOT NULL CHECK(object_key ~ '^issuer/[0-9a-f-]{36}/[0-9]{4}-[0-9]{2}-[0-9]{2}/[0-9a-f]{64}$'),
  byte_length integer NOT NULL CHECK(byte_length BETWEEN 1 AND 52428800),
  receipt_status text NOT NULL DEFAULT 'accepted' CHECK(receipt_status IN ('accepted','partial','rejected')),
  parser_status text NOT NULL DEFAULT 'queued' CHECK(parser_status IN ('queued','running','complete')),
  parser_owner text,
  parser_lease_expires_at timestamptz,
  added_fact_count integer NOT NULL DEFAULT 0 CHECK(added_fact_count>=0),
  duplicate_fact_count integer NOT NULL DEFAULT 0 CHECK(duplicate_fact_count>=0),
  missing_requirements jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(missing_requirements)='array'),
  rejection_reasons jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(rejection_reasons)='array'),
  accepted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  UNIQUE(stock_id,document_sha256),
  CHECK((parser_status='running') = (parser_owner IS NOT NULL AND parser_lease_expires_at IS NOT NULL)),
  CHECK(parser_status<>'complete' OR completed_at IS NOT NULL),
  CHECK(receipt_status='accepted' OR parser_status='complete')
);

CREATE INDEX IF NOT EXISTS candidate_financial_document_receipts_v6_claim_idx
  ON public.candidate_financial_document_receipts_v6(parser_status,accepted_at)
  WHERE parser_status IN ('queued','running');

-- The old counter remains a backwards-compatible mirror of MOPS failures.
-- Provider counters prevent a verified FinMind result from erasing MOPS WAF
-- history or from making repeated mirror responses look like queue progress.
ALTER TABLE public.candidate_financial_acquisition_jobs_v4
  ADD COLUMN IF NOT EXISTS mops_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mops_consecutive_failures integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS finmind_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS finmind_consecutive_failures integer NOT NULL DEFAULT 0;
ALTER TABLE public.candidate_financial_acquisition_jobs_v4
  DROP CONSTRAINT IF EXISTS candidate_financial_acquisition_jobs_v4_mops_attempts_check,
  DROP CONSTRAINT IF EXISTS candidate_financial_acquisition_jobs_v4_mops_consecutive_failures_check,
  DROP CONSTRAINT IF EXISTS candidate_financial_acquisition_jobs_v4_finmind_attempts_check,
  DROP CONSTRAINT IF EXISTS candidate_financial_acquisition_jobs_v4_finmind_consecutive_failures_check;
ALTER TABLE public.candidate_financial_acquisition_jobs_v4
  ADD CONSTRAINT candidate_financial_acquisition_jobs_v4_mops_attempts_check CHECK(mops_attempts BETWEEN 0 AND 20),
  ADD CONSTRAINT candidate_financial_acquisition_jobs_v4_mops_consecutive_failures_check CHECK(mops_consecutive_failures BETWEEN 0 AND 5),
  ADD CONSTRAINT candidate_financial_acquisition_jobs_v4_finmind_attempts_check CHECK(finmind_attempts BETWEEN 0 AND 20),
  ADD CONSTRAINT candidate_financial_acquisition_jobs_v4_finmind_consecutive_failures_check CHECK(finmind_consecutive_failures BETWEEN 0 AND 5);

CREATE OR REPLACE FUNCTION public.record_candidate_financial_document_receipt_v6(
  p_stock_id uuid,
  p_acquisition_job_id uuid,
  p_source_url text,
  p_exchange text,
  p_period_end date,
  p_published_at timestamptz,
  p_content_type text,
  p_document_sha256 text,
  p_object_key text,
  p_byte_length integer,
  p_metadata jsonb
) RETURNS TABLE(receipt_id uuid, receipt_status text, idempotent_replay boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $function$
DECLARE v_host text; v_document_id uuid; v_receipt public.candidate_financial_document_receipts_v6%ROWTYPE;
BEGIN
  IF p_source_url !~ '^https://[^/@:]+/' OR p_document_sha256 !~ '^[0-9a-f]{64}$'
    OR p_object_key <> 'issuer/'||p_stock_id::text||'/'||p_period_end::text||'/'||p_document_sha256
    OR p_byte_length NOT BETWEEN 1 AND 52428800
    OR p_exchange NOT IN ('TWSE','TPEX') OR p_content_type NOT IN ('application/pdf','text/html','application/xhtml+xml','application/xml','text/xml')
    OR jsonb_typeof(COALESCE(p_metadata,'{}'::jsonb))<>'object'
  THEN RAISE EXCEPTION 'invalid_candidate_financial_document_receipt'; END IF;
  v_host:=lower(substring(p_source_url from '^https://([^/]+)'));
  IF v_host NOT IN ('mops.twse.com.tw','mopsov.twse.com.tw','www.twse.com.tw','www.tpex.org.tw')
    AND NOT EXISTS (SELECT 1 FROM public.candidate_issuer_document_domains_v6 domain WHERE domain.stock_id=p_stock_id AND domain.host=v_host)
  THEN RAISE EXCEPTION 'issuer_document_domain_not_approved'; END IF;
  IF p_acquisition_job_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.candidate_financial_acquisition_jobs_v4 job
    WHERE job.job_id=p_acquisition_job_id AND job.stock_id=p_stock_id
  ) THEN RAISE EXCEPTION 'candidate_financial_document_job_mismatch'; END IF;
  SELECT * INTO v_receipt FROM public.candidate_financial_document_receipts_v6
  WHERE stock_id=p_stock_id AND document_sha256=p_document_sha256 FOR UPDATE;
  IF FOUND THEN
    IF v_receipt.source_url<>p_source_url OR v_receipt.period_end<>p_period_end OR v_receipt.object_key<>p_object_key
    THEN RAISE EXCEPTION 'candidate_financial_document_hash_collision'; END IF;
    RETURN QUERY SELECT v_receipt.receipt_id,v_receipt.receipt_status,true; RETURN;
  END IF;
  INSERT INTO public.candidate_issuer_ir_document_queue_v4(
    stock_id,queue_key,listing_source_url,document_url,title,published_at,mime_type,document_sha256,
    acquisition_status,terminal_reason,metadata,collected_at
  ) VALUES (
    p_stock_id,encode(extensions.digest(convert_to(p_stock_id::text||':'||p_document_sha256,'utf8'),'sha256'),'hex'),
    p_source_url,p_source_url,'Uploaded verified issuer document',p_published_at,p_content_type,p_document_sha256,
    'fetched','complete',p_metadata,clock_timestamp()
  ) RETURNING document_id INTO v_document_id;
  INSERT INTO public.candidate_financial_document_receipts_v6(
    stock_id,acquisition_job_id,issuer_document_id,source_url,exchange,period_end,published_at,content_type,
    document_sha256,object_key,byte_length
  ) VALUES (p_stock_id,p_acquisition_job_id,v_document_id,p_source_url,p_exchange,p_period_end,p_published_at,
    p_content_type,p_document_sha256,p_object_key,p_byte_length)
  RETURNING candidate_financial_document_receipts_v6.receipt_id,candidate_financial_document_receipts_v6.receipt_status
  INTO receipt_id,receipt_status;
  idempotent_replay:=false; RETURN NEXT;
END $function$;

CREATE OR REPLACE FUNCTION public.claim_candidate_financial_document_receipts_v6(
  p_limit integer,p_owner text,p_claimed_at timestamptz,p_lease_expires_at timestamptz
) RETURNS TABLE(receipt_id uuid,stock_id uuid,acquisition_job_id uuid,source_url text,exchange text,period_end date,content_type text,document_sha256 text,object_key text,byte_length integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $function$
BEGIN
  IF p_limit NOT BETWEEN 1 AND 20 OR char_length(COALESCE(p_owner,'')) NOT BETWEEN 1 AND 200 OR p_lease_expires_at<=p_claimed_at
  THEN RAISE EXCEPTION 'invalid_candidate_financial_document_claim'; END IF;
  RETURN QUERY WITH selected AS (
    SELECT receipt.receipt_id FROM public.candidate_financial_document_receipts_v6 receipt
    WHERE receipt.parser_status='queued' OR (receipt.parser_status='running' AND receipt.parser_lease_expires_at<p_claimed_at)
    ORDER BY receipt.accepted_at,receipt.receipt_id FOR UPDATE SKIP LOCKED LIMIT p_limit
  ) UPDATE public.candidate_financial_document_receipts_v6 receipt
    SET parser_status='running',parser_owner=p_owner,parser_lease_expires_at=p_lease_expires_at
    FROM selected WHERE receipt.receipt_id=selected.receipt_id
    RETURNING receipt.receipt_id,receipt.stock_id,receipt.acquisition_job_id,receipt.source_url,receipt.exchange,receipt.period_end,
      receipt.content_type,receipt.document_sha256,receipt.object_key,receipt.byte_length;
END $function$;

CREATE OR REPLACE FUNCTION public.complete_candidate_financial_document_receipt_v6(
  p_receipt_id uuid,p_owner text,p_caller_principal uuid,p_facts jsonb,p_missing_requirements jsonb,p_rejection_reasons jsonb,p_completed_at timestamptz
) RETURNS TABLE(receipt_status text,added_fact_count integer,duplicate_fact_count integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $function$
DECLARE v_receipt public.candidate_financial_document_receipts_v6%ROWTYPE; v_fact jsonb; v_fact_id uuid;
  v_added integer:=0; v_duplicate integer:=0; v_status text;
BEGIN
  IF NOT public.internal_principal_role_is_exact_v3_internal(p_caller_principal,'opportunity_runner',clock_timestamp())
  THEN RAISE EXCEPTION 'principal_role_unavailable'; END IF;
  IF jsonb_typeof(COALESCE(p_facts,'[]'::jsonb))<>'array' OR jsonb_array_length(COALESCE(p_facts,'[]'::jsonb))>128
    OR jsonb_typeof(COALESCE(p_missing_requirements,'[]'::jsonb))<>'array'
    OR jsonb_typeof(COALESCE(p_rejection_reasons,'[]'::jsonb))<>'array'
    OR p_completed_at IS NULL OR p_completed_at>clock_timestamp()
  THEN RAISE EXCEPTION 'invalid_candidate_financial_document_completion'; END IF;
  SELECT * INTO v_receipt FROM public.candidate_financial_document_receipts_v6 receipt
  WHERE receipt.receipt_id=p_receipt_id AND receipt.parser_status='running' AND receipt.parser_owner=p_owner FOR UPDATE;
  IF NOT FOUND OR v_receipt.parser_lease_expires_at<clock_timestamp() THEN RAISE EXCEPTION 'candidate_financial_document_lease_lost'; END IF;
  FOR v_fact IN SELECT value FROM jsonb_array_elements(p_facts) LOOP
    IF (v_fact #>> '{input,stock_id}')::uuid IS DISTINCT FROM v_receipt.stock_id
      OR (v_fact #>> '{input,period_end}')::date IS DISTINCT FROM v_receipt.period_end
      OR (v_fact #>> '{input,provider}')<>'mops'
      OR (v_fact #>> '{input,authority_tier}')<>'official_filing'
      OR COALESCE(v_fact #>> '{input,source_ref}','') !~ ('^issuer-document:'||v_receipt.document_sha256||':')
      OR jsonb_typeof(COALESCE(v_fact->'locator','null'::jsonb))<>'object'
      OR NOT (v_fact->'locator' ? 'xbrl_context' OR v_fact->'locator' ? 'page' OR v_fact->'locator' ? 'table')
    THEN RAISE EXCEPTION 'candidate_financial_document_fact_invalid'; END IF;
    SELECT fact.fact_id INTO v_fact_id FROM public.opportunity_financial_facts_v3 fact
    WHERE fact.stock_id=v_receipt.stock_id AND fact.source_ref=v_fact #>> '{input,source_ref}'
      AND fact.collected_at<=(v_fact #>> '{input,collected_at}')::timestamptz ORDER BY fact.recorded_at,fact.fact_id LIMIT 1;
    IF v_fact_id IS NULL THEN
      SELECT appended.fact_id INTO v_fact_id FROM public.append_financial_fact_v3(
        jsonb_populate_record(NULL::public.financial_fact_input_v3,v_fact->'input'),p_caller_principal
      ) appended LIMIT 1;
      v_added:=v_added+1;
    ELSE v_duplicate:=v_duplicate+1; END IF;
    INSERT INTO public.candidate_financial_fact_provenance_v4(
      fact_id,issuer_document_id,source_url,source_sha256,locator,extracted_at
    ) VALUES(v_fact_id,v_receipt.issuer_document_id,v_receipt.source_url,v_receipt.document_sha256,
      v_fact->'locator',p_completed_at) ON CONFLICT DO NOTHING;
  END LOOP;
  v_status:=CASE WHEN jsonb_array_length(p_rejection_reasons)>0 THEN 'rejected'
                 WHEN jsonb_array_length(p_missing_requirements)>0 OR jsonb_array_length(p_facts)=0 THEN 'partial'
                 ELSE 'accepted' END;
  UPDATE public.candidate_financial_document_receipts_v6 SET receipt_status=v_status,parser_status='complete',parser_owner=NULL,
    parser_lease_expires_at=NULL,added_fact_count=v_added,duplicate_fact_count=v_duplicate,
    missing_requirements=p_missing_requirements,rejection_reasons=p_rejection_reasons,completed_at=p_completed_at
  WHERE receipt_id=p_receipt_id;
  -- A complete structured document can close its linked work in the same
  -- transaction. A partial document deliberately leaves the original gap
  -- open; it cannot become artificial queue progress.
  IF v_status='accepted' AND v_receipt.acquisition_job_id IS NOT NULL THEN
    UPDATE public.candidate_financial_acquisition_jobs_v4 SET status='terminal',terminal_reason='complete',terminal_detail=NULL,
      lease_owner=NULL,lease_expires_at=NULL,collected_at=p_completed_at,next_attempt_at=NULL,updated_at=p_completed_at
    WHERE job_id=v_receipt.acquisition_job_id AND status IN ('queued','running');
  END IF;
  receipt_status:=v_status;added_fact_count:=v_added;duplicate_fact_count:=v_duplicate;RETURN NEXT;
END $function$;

-- Service-only Vault read. The bootstrap that writes this named secret is an
-- operational action and intentionally not part of this migration or Git.
CREATE OR REPLACE FUNCTION public.read_stockinsider_finmind_api_token_v6()
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path=vault,public,pg_temp AS $function$
  SELECT decrypted_secret FROM vault.decrypted_secrets
  WHERE name='stockinsider_finmind_api_token' ORDER BY created_at DESC LIMIT 1
$function$;

-- Operational bootstrap boundary. The token is accepted only by an authenticated
-- active VPS writer after an API canary; this function itself is callable only
-- through the service-role client and never returns the secret.
CREATE OR REPLACE FUNCTION public.bootstrap_stockinsider_finmind_api_token_v6(
  p_secret text,p_token_hash text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_secret_id uuid; v_name constant text:='stockinsider_finmind_api_token';
BEGIN
  IF p_secret IS NULL OR char_length(p_secret) NOT BETWEEN 16 AND 4096
    OR p_secret ~ '[[:space:]]' OR COALESCE(p_token_hash,'') !~ '^[0-9a-f]{64}$'
  THEN RAISE EXCEPTION 'invalid_finmind_token_bootstrap' USING ERRCODE='22023'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_name,0));
  SELECT id INTO v_secret_id FROM vault.decrypted_secrets
  WHERE name=v_name ORDER BY updated_at DESC LIMIT 1;
  IF v_secret_id IS NULL THEN
    SELECT vault.create_secret(p_secret,v_name,'StockInsider FinMind API fallback token') INTO v_secret_id;
  ELSE
    PERFORM vault.update_secret(v_secret_id,p_secret,v_name,'StockInsider FinMind API fallback token');
  END IF;
  RETURN v_secret_id;
END $function$;

CREATE OR REPLACE FUNCTION public.record_candidate_financial_fallback_v6(
  p_job_id uuid,p_owner text,p_caller_principal uuid,p_facts jsonb,p_source_sha256 text,
  p_response_bytes integer,p_collected_at timestamptz,p_primary_reason public.financial_acquisition_terminal_reason_v4,p_primary_error text
) RETURNS TABLE(written_facts integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $function$
DECLARE v_job public.candidate_financial_acquisition_jobs_v4%ROWTYPE; v_fact jsonb; v_fact_id uuid; v_written integer:=0;
BEGIN
  IF NOT public.internal_principal_role_is_exact_v3_internal(p_caller_principal,'opportunity_runner',clock_timestamp())
  THEN RAISE EXCEPTION 'principal_role_unavailable'; END IF;
  IF jsonb_typeof(COALESCE(p_facts,'null'::jsonb))<>'array' OR jsonb_array_length(p_facts)<1
    OR COALESCE(p_source_sha256,'') !~ '^[0-9a-f]{64}$' OR p_response_bytes NOT BETWEEN 0 AND 67108864
    OR p_collected_at IS NULL OR p_collected_at>clock_timestamp() OR p_primary_reason IS NULL
    OR p_primary_reason IN ('complete','empty_official_response') OR char_length(COALESCE(p_primary_error,'')) NOT BETWEEN 1 AND 500
  THEN RAISE EXCEPTION 'invalid_candidate_financial_fallback'; END IF;
  SELECT * INTO v_job FROM public.candidate_financial_acquisition_jobs_v4
  WHERE job_id=p_job_id AND endpoint_key IN ('mops_inline','tpex_general_income','tpex_broker_income','tpex_general_balance','tpex_broker_balance')
    AND status='running' AND lease_owner=p_owner FOR UPDATE;
  IF NOT FOUND OR v_job.lease_expires_at<clock_timestamp() THEN RAISE EXCEPTION 'candidate_financial_job_lease_lost'; END IF;
  FOR v_fact IN SELECT value FROM jsonb_array_elements(p_facts) LOOP
    IF (v_fact #>> '{input,provider}')<>'finmind' OR (v_fact #>> '{input,authority_tier}')<>'finmind_mirror'
      OR (v_fact #>> '{input,stock_id}')::uuid IS DISTINCT FROM v_job.stock_id
      OR (v_fact #>> '{input,period_end}')::date IS DISTINCT FROM v_job.period_end
      OR (v_fact #>> '{input,collected_at}')::timestamptz IS DISTINCT FROM p_collected_at
      OR COALESCE(v_fact #>> '{input,source_ref}','') !~ '^finmind:'
    THEN RAISE EXCEPTION 'candidate_financial_fallback_provenance_invalid'; END IF;
    SELECT fact.fact_id INTO v_fact_id FROM public.opportunity_financial_facts_v3 fact
    WHERE fact.stock_id=v_job.stock_id AND fact.source_ref=v_fact #>> '{input,source_ref}'
      AND fact.collected_at<=(v_fact #>> '{input,collected_at}')::timestamptz
    ORDER BY fact.recorded_at,fact.fact_id LIMIT 1;
    IF v_fact_id IS NULL THEN
      SELECT appended.fact_id INTO v_fact_id FROM public.append_financial_fact_v3(
        jsonb_populate_record(NULL::public.financial_fact_input_v3,v_fact->'input'),p_caller_principal
      ) appended LIMIT 1;
    END IF;
    IF v_fact_id IS NULL THEN RAISE EXCEPTION 'candidate_financial_fact_append_empty'; END IF;
    IF COALESCE((v_fact #>> '{validation,schema_valid}')::boolean,FALSE) IS NOT TRUE
      OR COALESCE((v_fact #>> '{validation,unit_valid}')::boolean,FALSE) IS NOT TRUE
      OR COALESCE((v_fact #>> '{validation,point_in_time_valid}')::boolean,FALSE) IS NOT TRUE
      OR COALESCE((v_fact #>> '{validation,consistency_valid}')::boolean,FALSE) IS NOT TRUE
      OR COALESCE(v_fact #>> '{validation,upstream_provider}','') !~ '^[A-Za-z0-9_.:-]{1,120}$'
    THEN RAISE EXCEPTION 'candidate_financial_fallback_validation_missing'; END IF;
    IF NOT public.validate_finmind_financial_fact_v6(
      v_fact_id,TRUE,TRUE,TRUE,TRUE,v_fact #>> '{validation,upstream_provider}'
    ) THEN RAISE EXCEPTION 'candidate_financial_fallback_validation_failed'; END IF;
    INSERT INTO public.candidate_financial_fact_provenance_v4(
      fact_id,acquisition_job_id,source_url,source_sha256,locator,extracted_at
    ) VALUES(v_fact_id,p_job_id,'https://api.finmindtrade.com/api/v4/data',p_source_sha256,
      COALESCE(v_fact->'locator','{}'::jsonb),p_collected_at) ON CONFLICT DO NOTHING;
    v_written:=v_written+1;
  END LOOP;
  -- The mirror satisfied this company/period/method work item. Retain MOPS
  -- failure history and close it instead of repeatedly paying FinMind to
  -- produce identical facts on every retry.
  UPDATE public.candidate_financial_acquisition_jobs_v4 SET
    status='terminal',attempts=LEAST(attempts+1,20),consecutive_failures=LEAST(mops_consecutive_failures+1,5),
    mops_attempts=LEAST(mops_attempts+1,20),mops_consecutive_failures=LEAST(mops_consecutive_failures+1,5),
    finmind_attempts=LEAST(finmind_attempts+1,20),finmind_consecutive_failures=0,
    lease_owner=NULL,lease_expires_at=NULL,terminal_reason='complete',terminal_detail='primary:'||p_primary_error,
    response_sha256=p_source_sha256,response_bytes=p_response_bytes,collected_at=p_collected_at,next_attempt_at=NULL,updated_at=p_collected_at
  WHERE job_id=p_job_id;
  INSERT INTO public.candidate_financial_acquisition_cursors_v4(
    stock_id,endpoint_key,cursor_value,last_successful_period_end,last_terminal_reason,last_collected_at,updated_at
  ) VALUES(v_job.stock_id,v_job.endpoint_key,jsonb_build_object(
      'cursor_key',v_job.cursor_key,'job_id',p_job_id,'provider','finmind','mops_terminal_reason',p_primary_reason::text,
      'mops_consecutive_failures',LEAST(v_job.mops_consecutive_failures+1,5)
    ),v_job.period_end,'complete',p_collected_at,p_collected_at)
  ON CONFLICT(stock_id,endpoint_key) DO UPDATE SET cursor_value=EXCLUDED.cursor_value,last_successful_period_end=GREATEST(
      public.candidate_financial_acquisition_cursors_v4.last_successful_period_end,EXCLUDED.last_successful_period_end),
    last_terminal_reason=EXCLUDED.last_terminal_reason,last_collected_at=EXCLUDED.last_collected_at,updated_at=EXCLUDED.updated_at;
  RETURN QUERY SELECT v_written;
END $function$;

CREATE OR REPLACE FUNCTION public.fail_candidate_financial_acquisition_job_v6(
  p_job_id uuid,p_owner text,p_error text,p_collected_at timestamptz,p_mops_failed boolean,p_finmind_failed boolean
) RETURNS TABLE(status text,terminal_reason public.financial_acquisition_terminal_reason_v4)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $function$
DECLARE v_job public.candidate_financial_acquisition_jobs_v4%ROWTYPE; v_reason public.financial_acquisition_terminal_reason_v4;
  v_mops_failures integer; v_finmind_failures integer; v_terminal boolean;
BEGIN
  IF char_length(COALESCE(p_error,'')) NOT BETWEEN 1 AND 500 OR p_collected_at IS NULL OR p_collected_at>clock_timestamp()
  THEN RAISE EXCEPTION 'invalid_candidate_financial_failure'; END IF;
  SELECT * INTO v_job FROM public.candidate_financial_acquisition_jobs_v4
  WHERE job_id=p_job_id AND status='running' AND lease_owner=p_owner FOR UPDATE;
  IF NOT FOUND OR v_job.lease_expires_at<clock_timestamp() THEN RAISE EXCEPTION 'candidate_financial_job_lease_lost'; END IF;
  v_reason:=CASE WHEN p_error~*'write_failed|completion_failed' THEN 'write_failed'::public.financial_acquisition_terminal_reason_v4
    WHEN p_error~*'timeout' THEN 'timeout'::public.financial_acquisition_terminal_reason_v4
    WHEN p_error~*'security|captcha|forbidden|waf' THEN 'security_blocked'::public.financial_acquisition_terminal_reason_v4
    WHEN p_error~*'html' THEN 'html_rejected'::public.financial_acquisition_terminal_reason_v4
    WHEN p_error~*'schema|empty' THEN 'schema_unrecognized'::public.financial_acquisition_terminal_reason_v4
    WHEN p_error~*'404|not_found' THEN 'http_not_found'::public.financial_acquisition_terminal_reason_v4
    WHEN p_error~*'429|rate' THEN 'http_rate_limited'::public.financial_acquisition_terminal_reason_v4
    WHEN p_error~*'5[0-9]{2}|server' THEN 'http_server_error'::public.financial_acquisition_terminal_reason_v4
    ELSE 'network_error'::public.financial_acquisition_terminal_reason_v4 END;
  v_mops_failures:=CASE WHEN p_mops_failed THEN LEAST(v_job.mops_consecutive_failures+1,5) ELSE v_job.mops_consecutive_failures END;
  v_finmind_failures:=CASE WHEN p_finmind_failed THEN LEAST(v_job.finmind_consecutive_failures+1,5) ELSE v_job.finmind_consecutive_failures END;
  v_terminal:=v_mops_failures>=5 OR v_finmind_failures>=5;
  UPDATE public.candidate_financial_acquisition_jobs_v4 SET
    status=CASE WHEN v_terminal THEN 'terminal' ELSE 'queued' END,
    attempts=LEAST(attempts+1,20),consecutive_failures=v_mops_failures,
    mops_attempts=LEAST(mops_attempts+CASE WHEN p_mops_failed THEN 1 ELSE 0 END,20),mops_consecutive_failures=v_mops_failures,
    finmind_attempts=LEAST(finmind_attempts+CASE WHEN p_finmind_failed THEN 1 ELSE 0 END,20),finmind_consecutive_failures=v_finmind_failures,
    lease_owner=NULL,lease_expires_at=NULL,terminal_reason=CASE WHEN v_terminal THEN v_reason ELSE NULL END,
    terminal_detail=p_error,collected_at=CASE WHEN v_terminal THEN p_collected_at ELSE collected_at END,
    next_attempt_at=CASE WHEN v_terminal THEN NULL ELSE p_collected_at + make_interval(hours => (2 ^ GREATEST(v_mops_failures,v_finmind_failures,1))::integer) END,
    updated_at=p_collected_at WHERE job_id=p_job_id;
  status:=CASE WHEN v_terminal THEN 'terminal' ELSE 'queued' END;terminal_reason:=v_reason;RETURN NEXT;
END $function$;

ALTER TABLE public.candidate_issuer_document_domains_v6 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_financial_document_receipts_v6 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.candidate_issuer_document_domains_v6,public.candidate_financial_document_receipts_v6 FROM PUBLIC,anon,authenticated;
GRANT ALL ON TABLE public.candidate_issuer_document_domains_v6,public.candidate_financial_document_receipts_v6 TO service_role;
REVOKE ALL ON FUNCTION public.record_candidate_financial_document_receipt_v6(uuid,uuid,text,text,date,timestamptz,text,text,text,integer,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.claim_candidate_financial_document_receipts_v6(integer,text,timestamptz,timestamptz) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.complete_candidate_financial_document_receipt_v6(uuid,text,uuid,jsonb,jsonb,jsonb,timestamptz) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.read_stockinsider_finmind_api_token_v6() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.bootstrap_stockinsider_finmind_api_token_v6(text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.record_candidate_financial_fallback_v6(uuid,text,uuid,jsonb,text,integer,timestamptz,public.financial_acquisition_terminal_reason_v4,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.fail_candidate_financial_acquisition_job_v6(uuid,text,text,timestamptz,boolean,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_candidate_financial_document_receipt_v6(uuid,uuid,text,text,date,timestamptz,text,text,text,integer,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_candidate_financial_document_receipts_v6(integer,text,timestamptz,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_candidate_financial_document_receipt_v6(uuid,text,uuid,jsonb,jsonb,jsonb,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_stockinsider_finmind_api_token_v6() TO service_role;
GRANT EXECUTE ON FUNCTION public.bootstrap_stockinsider_finmind_api_token_v6(text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_candidate_financial_fallback_v6(uuid,text,uuid,jsonb,text,integer,timestamptz,public.financial_acquisition_terminal_reason_v4,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_candidate_financial_acquisition_job_v6(uuid,text,text,timestamptz,boolean,boolean) TO service_role;

COMMIT;
