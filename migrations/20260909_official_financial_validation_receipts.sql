-- Additive, explicit validation receipts. No blanket upgrade of historical facts.
BEGIN;
ALTER TABLE public.opportunity_financial_facts_v3 ADD COLUMN IF NOT EXISTS validation_recorded_at timestamptz;
CREATE TABLE IF NOT EXISTS public.official_financial_validation_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fact_id uuid NOT NULL REFERENCES public.opportunity_financial_facts_v3(fact_id),
  validator_version text NOT NULL,
  input_hash text NOT NULL CHECK (input_hash ~ '^[0-9a-f]{64}$'),
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  validation jsonb NOT NULL,
  validated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(fact_id,validator_version,input_hash)
);
ALTER TABLE public.official_financial_validation_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.official_financial_validation_receipts FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.official_financial_validation_receipts FROM service_role;
GRANT SELECT,INSERT ON public.official_financial_validation_receipts TO service_role;

CREATE OR REPLACE FUNCTION public.record_official_financial_validation(
  p_fact_id uuid, p_recorded_at timestamptz, p_source_sha256 text,
  p_input_hash text, p_validation jsonb
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $function$
DECLARE v_fact public.opportunity_financial_facts_v3%ROWTYPE; v_valid boolean; v_inserted integer;
BEGIN
  IF p_validation->>'version' IS DISTINCT FROM 'official-financial-v1'
    OR COALESCE(p_input_hash,'') !~ '^[0-9a-f]{64}$'
    OR COALESCE(p_source_sha256,'') !~ '^[0-9a-f]{64}$'
    OR jsonb_typeof(p_validation->'reasons') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_validation->'checks') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_validation->'schemaValid') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(p_validation->'unitValid') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(p_validation->'pointInTimeValid') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(p_validation->'consistencyValid') IS DISTINCT FROM 'boolean'
  THEN RAISE EXCEPTION 'invalid_official_validation_receipt'; END IF;
  SELECT * INTO v_fact FROM public.opportunity_financial_facts_v3
    WHERE fact_id=p_fact_id AND recorded_at=p_recorded_at AND authority_tier::text='official_filing'
      AND provider::text IN ('mops','twse','tpex') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'official_validation_subject_mismatch'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.candidate_financial_fact_provenance_v4
    WHERE fact_id=p_fact_id AND source_sha256=p_source_sha256
      AND source_url ~ '^https://([A-Za-z0-9-]+\.)*(twse\.com\.tw|tpex\.org\.tw)/')
  THEN RAISE EXCEPTION 'official_validation_provenance_missing'; END IF;
  v_valid := (p_validation->>'schemaValid')::boolean AND (p_validation->>'unitValid')::boolean
    AND (p_validation->>'pointInTimeValid')::boolean AND (p_validation->>'consistencyValid')::boolean
    AND jsonb_array_length(p_validation->'reasons')=0;
  INSERT INTO public.official_financial_validation_receipts(fact_id,validator_version,input_hash,source_sha256,validation)
    VALUES(p_fact_id,'official-financial-v1',p_input_hash,p_source_sha256,p_validation) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted=0 THEN RETURN v_valid AND v_fact.validation_status='validated'; END IF;
  -- A recorded conflict/rejection is not erased by an automatic retry.
  IF v_fact.validation_status IN ('rejected','conflict','stale') THEN RETURN FALSE; END IF;
  UPDATE public.opportunity_financial_facts_v3 SET
    validation_status=CASE WHEN v_valid THEN 'validated' ELSE 'rejected' END,
    schema_valid=(p_validation->>'schemaValid')::boolean,
    unit_valid=(p_validation->>'unitValid')::boolean,
    point_in_time_valid=(p_validation->>'pointInTimeValid')::boolean,
    consistency_valid=(p_validation->>'consistencyValid')::boolean,
    validation_recorded_at=clock_timestamp()
    WHERE fact_id=p_fact_id;
  RETURN v_valid;
END; $function$;
REVOKE ALL ON FUNCTION public.record_official_financial_validation(uuid,timestamptz,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_official_financial_validation(uuid,timestamptz,text,text,jsonb) TO service_role;

-- A runtime outage can be retried without erasing its completed evidence.
CREATE TABLE IF NOT EXISTS public.candidate_financial_document_retry_audit (
  request_id uuid PRIMARY KEY,
  receipt_id uuid NOT NULL REFERENCES public.candidate_financial_document_receipts_v6(receipt_id),
  prior_receipt jsonb NOT NULL,
  caller_principal uuid NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.candidate_financial_document_retry_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.candidate_financial_document_retry_audit FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.candidate_financial_document_retry_audit TO service_role;
CREATE OR REPLACE FUNCTION public.retry_candidate_financial_document_runtime(
  p_receipt_id uuid,p_request_id uuid,p_caller_principal uuid
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $retry$
DECLARE v_receipt public.candidate_financial_document_receipts_v6%ROWTYPE; v_reasons jsonb;
BEGIN
  IF NOT public.internal_principal_role_is_exact_v3_internal(p_caller_principal,'opportunity_runner',clock_timestamp())
    THEN RAISE EXCEPTION 'principal_role_unavailable'; END IF;
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'retry_request_id_required'; END IF;
  SELECT * INTO v_receipt FROM public.candidate_financial_document_receipts_v6 WHERE receipt_id=p_receipt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retry_receipt_missing'; END IF;
  IF EXISTS(SELECT 1 FROM public.candidate_financial_document_retry_audit WHERE request_id=p_request_id AND receipt_id=p_receipt_id)
    THEN RETURN FALSE; END IF;
  v_reasons := v_receipt.missing_requirements || v_receipt.rejection_reasons;
  IF v_receipt.parser_status<>'complete' OR v_receipt.added_fact_count<>0 OR v_receipt.duplicate_fact_count<>0
    OR jsonb_array_length(v_reasons)=0
    OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(v_reasons) reason
      WHERE reason ~ '^candidate_financial_local_parser_(socket_unavailable|not_configured|timeout|spawn_failed|failed)(:|$)')
    OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(v_reasons) reason
      WHERE reason !~ '^candidate_financial_local_parser_(socket_unavailable|not_configured|timeout|spawn_failed|failed)(:|$)'
        AND reason<>'no_verified_financial_facts_extracted')
    THEN RAISE EXCEPTION 'receipt_not_runtime_retryable'; END IF;
  IF (SELECT count(*) FROM public.candidate_financial_document_retry_audit WHERE receipt_id=p_receipt_id)>=3
    THEN RAISE EXCEPTION 'receipt_runtime_retry_limit'; END IF;
  INSERT INTO public.candidate_financial_document_retry_audit(request_id,receipt_id,prior_receipt,caller_principal)
    VALUES(p_request_id,p_receipt_id,to_jsonb(v_receipt),p_caller_principal);
  UPDATE public.candidate_financial_document_receipts_v6 SET receipt_status='accepted',parser_status='queued',
    parser_owner=NULL,parser_lease_expires_at=NULL,completed_at=NULL,missing_requirements='[]'::jsonb,rejection_reasons='[]'::jsonb
    WHERE receipt_id=p_receipt_id;
  RETURN TRUE;
END; $retry$;
REVOKE ALL ON FUNCTION public.retry_candidate_financial_document_runtime(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.retry_candidate_financial_document_runtime(uuid,uuid,uuid) TO service_role;
COMMIT;
