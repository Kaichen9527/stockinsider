-- Minimal private PostgreSQL acceptance fixture, never an application migration.
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE TYPE public.financial_acquisition_terminal_reason_v4 AS ENUM (
  'complete','empty_official_response','http_not_found','http_rate_limited','http_server_error',
  'network_error','timeout','html_rejected','security_blocked','schema_unrecognized',
  'unsupported_issuer','invalid_cursor','write_failed');
CREATE TABLE public.stocks(id uuid PRIMARY KEY,symbol text NOT NULL);
CREATE TABLE public.candidate_issuer_document_domains_v6(stock_id uuid,host text,PRIMARY KEY(stock_id,host));
CREATE TABLE public.candidate_financial_acquisition_jobs_v4(
  job_id uuid PRIMARY KEY,stock_id uuid,period_end date DEFAULT '2026-06-30',
  endpoint_key text DEFAULT 'mops_inline',cursor_key text DEFAULT 'acceptance',
  status text,terminal_reason public.financial_acquisition_terminal_reason_v4,terminal_detail text,
  lease_owner text,lease_expires_at timestamptz,collected_at timestamptz,next_attempt_at timestamptz,
  created_at timestamptz DEFAULT clock_timestamp(),updated_at timestamptz DEFAULT clock_timestamp(),
  attempts integer DEFAULT 0,required_fact_keys jsonb NOT NULL DEFAULT '["quarterly_revenue"]',
  CHECK((status='terminal')=(terminal_reason IS NOT NULL)),
  CHECK(status<>'terminal' OR (collected_at IS NOT NULL AND lease_expires_at IS NULL)),
  CHECK(status='running' OR (lease_owner IS NULL AND lease_expires_at IS NULL)),
  CHECK(status<>'running' OR (lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL)));
CREATE TABLE public.candidate_financial_acquisition_cursors_v4(stock_id uuid,endpoint_key text,
  cursor_value jsonb,last_attempted_at timestamptz,updated_at timestamptz,PRIMARY KEY(stock_id,endpoint_key));
CREATE TABLE public.candidate_issuer_ir_document_queue_v4(document_id uuid PRIMARY KEY);
CREATE TABLE public.candidate_financial_document_receipts_v6(
  receipt_id uuid PRIMARY KEY,stock_id uuid NOT NULL REFERENCES public.stocks(id),
  acquisition_job_id uuid REFERENCES public.candidate_financial_acquisition_jobs_v4(job_id),
  issuer_document_id uuid NOT NULL REFERENCES public.candidate_issuer_ir_document_queue_v4(document_id),
  source_url text NOT NULL,exchange text NOT NULL,period_end date NOT NULL,document_sha256 text NOT NULL,
  content_type text NOT NULL DEFAULT 'application/xhtml+xml',
  receipt_status text NOT NULL CONSTRAINT candidate_financial_document_receipts_v6_receipt_status_check
    CHECK(receipt_status IN ('accepted','partial','rejected')),
  parser_status text NOT NULL,parser_owner text,parser_lease_expires_at timestamptz,
  parser_locators jsonb NOT NULL DEFAULT '[]',added_fact_count integer NOT NULL DEFAULT 0,
  duplicate_fact_count integer NOT NULL DEFAULT 0,missing_requirements jsonb NOT NULL DEFAULT '[]',
  rejection_reasons jsonb NOT NULL DEFAULT '[]',accepted_at timestamptz NOT NULL DEFAULT clock_timestamp(),completed_at timestamptz,
  published_at timestamptz);
CREATE TYPE public.financial_fact_input_v3 AS (stock_id uuid,fact_key text,period_start date,period_end date,
  duration_kind text,value numeric,unit text,provider text,authority_tier text,estimate_kind text,
  estimate_horizon text,filing_published_at timestamptz,source_timestamp timestamptz,collected_at timestamptz,
  filing_restatement_id text,source_ref text);
CREATE TABLE public.opportunity_financial_facts_v3(
  fact_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),stock_id uuid,fact_key text,period_start date,period_end date,
  duration_kind text,value numeric,unit text,provider text,authority_tier text,estimate_kind text,estimate_horizon text,
  filing_published_at timestamptz,source_timestamp timestamptz,collected_at timestamptz,filing_restatement_id text,source_ref text,
  recorded_at timestamptz DEFAULT clock_timestamp(),validation_status text DEFAULT 'pending',schema_valid boolean,
  unit_valid boolean,point_in_time_valid boolean,consistency_valid boolean,validation_recorded_at timestamptz);
CREATE TABLE public.candidate_financial_fact_provenance_v4(fact_id uuid,issuer_document_id uuid,
  source_url text,source_sha256 text,locator jsonb,extracted_at timestamptz,recorded_at timestamptz DEFAULT clock_timestamp());
CREATE TABLE public.official_financial_validation_receipts(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),fact_id uuid,validator_version text,input_hash text,
  source_sha256 text,validation jsonb,validated_at timestamptz DEFAULT clock_timestamp(),
  receipt_sequence bigint GENERATED ALWAYS AS IDENTITY,prior_validation jsonb,effective_validation jsonb,
  UNIQUE(fact_id,validator_version,input_hash));
CREATE FUNCTION public.internal_principal_role_is_exact_v3_internal(uuid,text,timestamptz) RETURNS boolean
  LANGUAGE sql AS 'SELECT $1=''55555555-5555-4555-8555-555555555555''::uuid AND $2=''opportunity_runner''';
CREATE FUNCTION public.append_financial_fact_v3(public.financial_fact_input_v3,uuid)
  RETURNS TABLE(fact_id uuid,recorded_at timestamptz) LANGUAGE plpgsql AS $$
  BEGIN RETURN QUERY INSERT INTO public.opportunity_financial_facts_v3(
    stock_id,fact_key,period_start,period_end,duration_kind,value,unit,provider,authority_tier,
    estimate_kind,estimate_horizon,filing_published_at,source_timestamp,collected_at,filing_restatement_id,source_ref)
    VALUES(($1).stock_id,($1).fact_key,($1).period_start,($1).period_end,($1).duration_kind,($1).value,
      ($1).unit,($1).provider,($1).authority_tier,($1).estimate_kind,($1).estimate_horizon,
      ($1).filing_published_at,($1).source_timestamp,($1).collected_at,($1).filing_restatement_id,($1).source_ref)
    RETURNING opportunity_financial_facts_v3.fact_id,opportunity_financial_facts_v3.recorded_at;
  END $$;
CREATE FUNCTION public.complete_candidate_financial_document_receipt_parser_v7(
  uuid,text,uuid,jsonb,jsonb,jsonb,jsonb,timestamptz)
  RETURNS TABLE(receipt_status text,added_fact_count integer,duplicate_fact_count integer)
  LANGUAGE sql AS 'SELECT ''partial''::text,0,0';
GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
