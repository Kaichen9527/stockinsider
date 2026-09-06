-- Financial acquisition v4: durable, fail-closed acquisition state. This is
-- intentionally additive; it does not reinterpret or mutate prior filings.

BEGIN;

ALTER TYPE public.financial_fact_key_v3 ADD VALUE IF NOT EXISTS 'quarterly_basic_eps';
ALTER TYPE public.financial_fact_key_v3 ADD VALUE IF NOT EXISTS 'basic_weighted_average_shares';

DO $types$
BEGIN
  CREATE TYPE public.financial_acquisition_terminal_reason_v4 AS ENUM (
    'complete','empty_official_response','http_not_found','http_rate_limited',
    'http_server_error','network_error','timeout','html_rejected','security_blocked',
    'schema_unrecognized','unsupported_issuer','invalid_cursor','write_failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $types$;

CREATE TABLE IF NOT EXISTS public.candidate_financial_acquisition_jobs_v4 (
  job_id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  stock_id uuid NOT NULL REFERENCES public.stocks(id) ON DELETE RESTRICT,
  exchange text NOT NULL CHECK(exchange IN ('TWSE','TPEX')),
  endpoint_key text NOT NULL CHECK(endpoint_key IN ('mops_inline','tpex_general_income','tpex_broker_income','tpex_general_balance','tpex_broker_balance','issuer_ir_document')),
  period_end date,
  cursor_key text NOT NULL CHECK(char_length(cursor_key) BETWEEN 1 AND 512),
  status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','terminal')),
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 20),
  next_attempt_at timestamptz,
  lease_owner text,
  lease_expires_at timestamptz,
  terminal_reason public.financial_acquisition_terminal_reason_v4,
  terminal_detail text,
  response_sha256 text CHECK(response_sha256 IS NULL OR response_sha256 ~ '^[0-9a-f]{64}$'),
  response_bytes integer CHECK(response_bytes IS NULL OR response_bytes BETWEEN 0 AND 67108864),
  source_url text NOT NULL CHECK(source_url ~ '^https://'),
  collected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(stock_id,endpoint_key,period_end,cursor_key),
  CHECK((status='terminal') = (terminal_reason IS NOT NULL)),
  CHECK(status<>'terminal' OR (collected_at IS NOT NULL AND lease_expires_at IS NULL)),
  CHECK(status='running' OR (lease_owner IS NULL AND lease_expires_at IS NULL)),
  CHECK(status<>'running' OR (lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL))
);

ALTER TABLE public.candidate_financial_acquisition_jobs_v4
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS lease_owner text;

CREATE TABLE IF NOT EXISTS public.candidate_financial_acquisition_cursors_v4 (
  cursor_id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  stock_id uuid NOT NULL REFERENCES public.stocks(id) ON DELETE RESTRICT,
  endpoint_key text NOT NULL CHECK(endpoint_key IN ('mops_inline','tpex_general_income','tpex_broker_income','tpex_general_balance','tpex_broker_balance','issuer_ir_document')),
  cursor_value jsonb NOT NULL CHECK(jsonb_typeof(cursor_value)='object'),
  last_successful_period_end date,
  last_terminal_reason public.financial_acquisition_terminal_reason_v4,
  last_collected_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(stock_id,endpoint_key),
  CHECK(last_terminal_reason IS NULL OR last_collected_at IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.candidate_issuer_ir_document_queue_v4 (
  document_id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  stock_id uuid NOT NULL REFERENCES public.stocks(id) ON DELETE RESTRICT,
  queue_key text NOT NULL CHECK(queue_key ~ '^[0-9a-f]{64}$'),
  listing_source_url text NOT NULL CHECK(listing_source_url ~ '^https://'),
  document_url text NOT NULL CHECK(document_url ~ '^https://'),
  title text NOT NULL CHECK(char_length(title) BETWEEN 1 AND 500),
  published_at timestamptz,
  mime_type text,
  document_sha256 text CHECK(document_sha256 IS NULL OR document_sha256 ~ '^[0-9a-f]{64}$'),
  acquisition_status text NOT NULL DEFAULT 'queued' CHECK(acquisition_status IN ('queued','fetched','rejected','deferred')),
  terminal_reason public.financial_acquisition_terminal_reason_v4,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(metadata)='object'),
  collected_at timestamptz,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(stock_id,queue_key),
  CHECK((acquisition_status IN ('fetched','rejected','deferred')) = (terminal_reason IS NOT NULL)),
  CHECK(acquisition_status<>'fetched' OR document_sha256 IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.candidate_financial_fact_provenance_v4 (
  provenance_id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  fact_id uuid NOT NULL REFERENCES public.opportunity_financial_facts_v3(fact_id) ON DELETE RESTRICT,
  acquisition_job_id uuid REFERENCES public.candidate_financial_acquisition_jobs_v4(job_id) ON DELETE RESTRICT,
  issuer_document_id uuid REFERENCES public.candidate_issuer_ir_document_queue_v4(document_id) ON DELETE RESTRICT,
  source_url text NOT NULL CHECK(source_url ~ '^https://'),
  source_sha256 text CHECK(source_sha256 IS NULL OR source_sha256 ~ '^[0-9a-f]{64}$'),
  locator jsonb NOT NULL CHECK(jsonb_typeof(locator)='object'),
  extracted_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK(acquisition_job_id IS NOT NULL OR issuer_document_id IS NOT NULL),
  CHECK(issuer_document_id IS NULL OR source_sha256 IS NOT NULL),
  UNIQUE(fact_id,acquisition_job_id,issuer_document_id,source_url)
);

CREATE INDEX IF NOT EXISTS candidate_financial_acquisition_jobs_v4_claim_idx
  ON public.candidate_financial_acquisition_jobs_v4(status,endpoint_key,next_attempt_at,created_at)
  WHERE status IN ('queued','running');
CREATE INDEX IF NOT EXISTS candidate_financial_acquisition_cursors_v4_lookup_idx
  ON public.candidate_financial_acquisition_cursors_v4(stock_id,endpoint_key);
CREATE INDEX IF NOT EXISTS candidate_issuer_ir_document_queue_v4_pending_idx
  ON public.candidate_issuer_ir_document_queue_v4(acquisition_status,recorded_at)
  WHERE acquisition_status='queued';
CREATE INDEX IF NOT EXISTS candidate_financial_fact_provenance_v4_fact_idx
  ON public.candidate_financial_fact_provenance_v4(fact_id,recorded_at);

CREATE OR REPLACE FUNCTION public.claim_candidate_financial_acquisition_jobs_v4(
  p_stock_ids uuid[],
  p_endpoint_key text,
  p_limit integer,
  p_owner text,
  p_claimed_at timestamptz,
  p_lease_expires_at timestamptz
)
RETURNS TABLE(job_id uuid, stock_id uuid, period_end date, cursor_key text, attempts integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF p_endpoint_key NOT IN ('mops_inline','tpex_general_income','tpex_broker_income','tpex_general_balance','tpex_broker_balance','issuer_ir_document')
    OR p_limit < 1 OR p_limit > 240 OR char_length(COALESCE(p_owner,'')) NOT BETWEEN 1 AND 200
    OR p_lease_expires_at <= p_claimed_at THEN
    RAISE EXCEPTION 'invalid_candidate_financial_claim';
  END IF;
  RETURN QUERY
  WITH selected AS (
    SELECT candidate.job_id
    FROM public.candidate_financial_acquisition_jobs_v4 candidate
    WHERE candidate.stock_id = ANY(p_stock_ids)
      AND candidate.endpoint_key = p_endpoint_key
      AND (
        (candidate.status = 'queued' AND (candidate.next_attempt_at IS NULL OR candidate.next_attempt_at <= p_claimed_at))
        OR (candidate.status = 'running' AND candidate.lease_expires_at < p_claimed_at)
      )
    ORDER BY candidate.created_at, candidate.job_id
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  )
  UPDATE public.candidate_financial_acquisition_jobs_v4 claimed
  SET status = 'running', lease_owner = p_owner, lease_expires_at = p_lease_expires_at,
      next_attempt_at = NULL, updated_at = p_claimed_at
  FROM selected
  WHERE claimed.job_id = selected.job_id
  RETURNING claimed.job_id, claimed.stock_id, claimed.period_end, claimed.cursor_key, claimed.attempts;
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_candidate_financial_acquisition_job_v4(
  p_job_id uuid,
  p_owner text,
  p_caller_principal uuid,
  p_facts jsonb,
  p_source_sha256 text,
  p_response_bytes integer,
  p_collected_at timestamptz
)
RETURNS TABLE(written_facts integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_job public.candidate_financial_acquisition_jobs_v4%ROWTYPE;
  v_fact jsonb;
  v_fact_id uuid;
  v_written integer := 0;
BEGIN
  IF jsonb_typeof(p_facts) <> 'array'
    OR p_source_sha256 !~ '^[0-9a-f]{64}$'
    OR p_response_bytes < 0 OR p_response_bytes > 67108864
    OR p_collected_at > clock_timestamp() THEN
    RAISE EXCEPTION 'invalid_candidate_financial_completion';
  END IF;
  SELECT * INTO v_job
  FROM public.candidate_financial_acquisition_jobs_v4
  WHERE job_id = p_job_id AND status = 'running' AND lease_owner = p_owner
  FOR UPDATE;
  IF NOT FOUND OR v_job.lease_expires_at < clock_timestamp() THEN
    RAISE EXCEPTION 'candidate_financial_job_lease_lost';
  END IF;

  FOR v_fact IN SELECT value FROM jsonb_array_elements(p_facts)
  LOOP
    SELECT appended.fact_id INTO v_fact_id
    FROM public.append_financial_fact_v3(
      jsonb_populate_record(NULL::public.financial_fact_input_v3, v_fact->'input'),
      p_caller_principal
    ) appended
    LIMIT 1;
    IF v_fact_id IS NULL THEN RAISE EXCEPTION 'candidate_financial_fact_append_empty'; END IF;
    INSERT INTO public.candidate_financial_fact_provenance_v4(
      fact_id,acquisition_job_id,source_url,source_sha256,locator,extracted_at
    ) VALUES(
      v_fact_id,p_job_id,v_job.source_url,p_source_sha256,
      COALESCE(v_fact->'locator','{}'::jsonb),p_collected_at
    ) ON CONFLICT DO NOTHING;
    v_written := v_written + 1;
  END LOOP;

  UPDATE public.candidate_financial_acquisition_jobs_v4
  SET status='terminal',attempts=attempts+1,lease_owner=NULL,lease_expires_at=NULL,
      terminal_reason='complete',terminal_detail=NULL,response_sha256=p_source_sha256,
      response_bytes=p_response_bytes,collected_at=p_collected_at,next_attempt_at=NULL,
      updated_at=p_collected_at
  WHERE job_id=p_job_id;

  INSERT INTO public.candidate_financial_acquisition_cursors_v4(
    stock_id,endpoint_key,cursor_value,last_successful_period_end,last_terminal_reason,
    last_collected_at,updated_at
  ) VALUES(
    v_job.stock_id,v_job.endpoint_key,
    jsonb_build_object('cursor_key',v_job.cursor_key,'job_id',p_job_id,'source_sha256',p_source_sha256),
    v_job.period_end,'complete',p_collected_at,p_collected_at
  ) ON CONFLICT(stock_id,endpoint_key) DO UPDATE SET
    cursor_value=EXCLUDED.cursor_value,
    last_successful_period_end=GREATEST(public.candidate_financial_acquisition_cursors_v4.last_successful_period_end,EXCLUDED.last_successful_period_end),
    last_terminal_reason=EXCLUDED.last_terminal_reason,
    last_collected_at=EXCLUDED.last_collected_at,
    updated_at=EXCLUDED.updated_at;

  RETURN QUERY SELECT v_written;
END;
$function$;

ALTER TABLE public.candidate_financial_acquisition_jobs_v4 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_financial_acquisition_cursors_v4 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_issuer_ir_document_queue_v4 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_financial_fact_provenance_v4 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.candidate_financial_acquisition_jobs_v4,
  public.candidate_financial_acquisition_cursors_v4,public.candidate_issuer_ir_document_queue_v4,
  public.candidate_financial_fact_provenance_v4 FROM PUBLIC,anon,authenticated;
GRANT ALL ON TABLE public.candidate_financial_acquisition_jobs_v4,
  public.candidate_financial_acquisition_cursors_v4,public.candidate_issuer_ir_document_queue_v4,
  public.candidate_financial_fact_provenance_v4 TO service_role;
REVOKE ALL ON FUNCTION public.claim_candidate_financial_acquisition_jobs_v4(uuid[],text,integer,text,timestamptz,timestamptz)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_candidate_financial_acquisition_jobs_v4(uuid[],text,integer,text,timestamptz,timestamptz)
  TO service_role;
REVOKE ALL ON FUNCTION public.complete_candidate_financial_acquisition_job_v4(uuid,text,uuid,jsonb,text,integer,timestamptz)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_candidate_financial_acquisition_job_v4(uuid,text,uuid,jsonb,text,integer,timestamptz)
  TO service_role;

COMMIT;
