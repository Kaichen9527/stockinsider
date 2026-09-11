-- One immutable document may satisfy multiple acquisition attempts. A replay
-- records a new link; it never rewrites the original receipt or provenance.
-- Apply after financial fact manifest v8 and financial field work fairness.
BEGIN;
CREATE TABLE IF NOT EXISTS public.candidate_financial_document_job_links_v9 (
  receipt_id uuid NOT NULL REFERENCES public.candidate_financial_document_receipts_v6(receipt_id) ON DELETE RESTRICT,
  job_id uuid NOT NULL REFERENCES public.candidate_financial_acquisition_jobs_v4(job_id) ON DELETE RESTRICT,
  required_fact_keys_at_link jsonb NOT NULL CHECK(jsonb_typeof(required_fact_keys_at_link)='array'),
  linked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  linked_by uuid,
  PRIMARY KEY(receipt_id,job_id)
);
CREATE INDEX IF NOT EXISTS candidate_financial_document_job_links_v9_job_idx
  ON public.candidate_financial_document_job_links_v9(job_id,receipt_id);
ALTER TABLE public.candidate_financial_document_job_links_v9 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.candidate_financial_document_job_links_v9 FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.candidate_financial_document_job_links_v9 TO service_role;
INSERT INTO public.candidate_financial_document_job_links_v9(receipt_id,job_id,required_fact_keys_at_link)
  SELECT receipt.receipt_id,job.job_id,job.required_fact_keys
  FROM public.candidate_financial_document_receipts_v6 receipt
  JOIN public.candidate_financial_acquisition_jobs_v4 job ON job.job_id=receipt.acquisition_job_id
    AND job.stock_id=receipt.stock_id AND job.period_end=receipt.period_end
  ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.reject_financial_document_job_link_mutation_v9()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $function$
BEGIN RAISE EXCEPTION 'candidate_financial_document_job_link_immutable'; END; $function$;
DROP TRIGGER IF EXISTS candidate_financial_document_job_link_immutable_v9 ON public.candidate_financial_document_job_links_v9;
CREATE TRIGGER candidate_financial_document_job_link_immutable_v9
  BEFORE UPDATE OR DELETE ON public.candidate_financial_document_job_links_v9
  FOR EACH ROW EXECUTE FUNCTION public.reject_financial_document_job_link_mutation_v9();

CREATE OR REPLACE FUNCTION public.seed_financial_document_job_link_v9()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $function$
DECLARE v_required jsonb;
BEGIN
  IF NEW.acquisition_job_id IS NOT NULL THEN
    SELECT job.required_fact_keys INTO v_required FROM public.candidate_financial_acquisition_jobs_v4 job
      WHERE job.job_id=NEW.acquisition_job_id AND job.stock_id=NEW.stock_id AND job.period_end=NEW.period_end;
    IF NOT FOUND THEN RAISE EXCEPTION 'candidate_financial_document_job_mismatch'; END IF;
    INSERT INTO public.candidate_financial_document_job_links_v9(receipt_id,job_id,required_fact_keys_at_link)
      VALUES(NEW.receipt_id,NEW.acquisition_job_id,v_required) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $function$;
DROP TRIGGER IF EXISTS seed_financial_document_job_link_v9 ON public.candidate_financial_document_receipts_v6;
CREATE TRIGGER seed_financial_document_job_link_v9 AFTER INSERT ON public.candidate_financial_document_receipts_v6
  FOR EACH ROW EXECUTE FUNCTION public.seed_financial_document_job_link_v9();

CREATE OR REPLACE FUNCTION public.candidate_financial_document_job_evidence_v9(
  p_receipt_id uuid,p_stock_id uuid,p_period_end date,p_required_fact_keys jsonb
) RETURNS TABLE(is_complete boolean,missing_fact_keys jsonb,receipt_validation_status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $function$
DECLARE v_receipt public.candidate_financial_document_receipts_v6%ROWTYPE;
  v_total integer; v_valid integer; v_keys jsonb;
BEGIN
  IF jsonb_typeof(COALESCE(p_required_fact_keys,'null'::jsonb))<>'array'
    OR jsonb_array_length(p_required_fact_keys)>128
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_required_fact_keys) field(value)
      WHERE jsonb_typeof(field.value)<>'string' OR field.value #>> '{}' !~ '^[a-z][a-z0-9_]{0,99}$')
  THEN RAISE EXCEPTION 'candidate_financial_document_requirements_invalid'; END IF;
  SELECT * INTO v_receipt FROM public.candidate_financial_document_receipts_v6 receipt
    WHERE receipt.receipt_id=p_receipt_id AND receipt.stock_id=p_stock_id AND receipt.period_end=p_period_end;
  IF NOT FOUND THEN RAISE EXCEPTION 'candidate_financial_document_job_mismatch'; END IF;
  WITH checked AS (
    SELECT fact.fact_key::text AS fact_key,
      fact.stock_id=p_stock_id AND fact.period_end=p_period_end
      AND fact.provider='mops' AND fact.authority_tier='official_filing'
      AND fact.validation_status='validated' AND fact.schema_valid IS TRUE AND fact.unit_valid IS TRUE
      AND fact.point_in_time_valid IS TRUE AND fact.consistency_valid IS TRUE
      AND fact.collected_at<=clock_timestamp() AND fact.recorded_at<=clock_timestamp()
      AND EXISTS(SELECT 1 FROM public.official_financial_validation_receipts validation
        JOIN public.candidate_financial_fact_provenance_v4 provenance ON provenance.fact_id=fact.fact_id
          AND provenance.source_sha256=v_receipt.document_sha256
        WHERE validation.fact_id=fact.fact_id AND validation.source_sha256=v_receipt.document_sha256
          AND validation.validated_at<=clock_timestamp()
          AND validation.effective_validation->>'validation_status'='validated'
          AND (validation.effective_validation->>'schema_valid')::boolean IS TRUE
          AND (validation.effective_validation->>'unit_valid')::boolean IS TRUE
          AND (validation.effective_validation->>'point_in_time_valid')::boolean IS TRUE
          AND (validation.effective_validation->>'consistency_valid')::boolean IS TRUE) AS valid
    FROM public.candidate_financial_document_fact_links_v8 link
    JOIN public.opportunity_financial_facts_v3 fact ON fact.fact_id=link.fact_id AND fact.recorded_at=link.fact_recorded_at
    WHERE link.receipt_id=p_receipt_id
  ) SELECT count(*),count(*) FILTER(WHERE checked.valid),
    COALESCE(jsonb_agg(DISTINCT checked.fact_key) FILTER(WHERE checked.valid),'[]'::jsonb)
    INTO v_total,v_valid,v_keys FROM checked;
  SELECT COALESCE(jsonb_agg(DISTINCT field.value ORDER BY field.value),'[]'::jsonb) INTO missing_fact_keys
    FROM jsonb_array_elements(p_required_fact_keys) field(value) WHERE NOT (v_keys ? (field.value #>> '{}'));
  receipt_validation_status:=v_receipt.financial_validation_status;
  is_complete:=v_receipt.parser_status='complete' AND v_receipt.receipt_status='accepted'
    AND v_receipt.financial_validation_status='validated' AND v_total>0 AND v_total=v_valid
    AND jsonb_array_length(v_receipt.missing_requirements)=0 AND jsonb_array_length(v_receipt.rejection_reasons)=0
    AND jsonb_array_length(missing_fact_keys)=0;
  RETURN NEXT;
END; $function$;

CREATE OR REPLACE FUNCTION public.candidate_financial_document_job_requirements_v9(p_job_id uuid,p_current jsonb)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $function$
  SELECT COALESCE(jsonb_agg(DISTINCT requirement.value ORDER BY requirement.value),'[]'::jsonb)
  FROM (
    SELECT value FROM jsonb_array_elements(p_current)
    UNION ALL
    SELECT field.value FROM public.candidate_financial_document_job_links_v9 link
      CROSS JOIN LATERAL jsonb_array_elements(link.required_fact_keys_at_link) field(value)
      WHERE link.job_id=p_job_id
  ) requirement;
$function$;

-- Older finalizers also update the original acquisition job. Enforce the same
-- current field check atomically there, not only in the new replay RPC.
CREATE OR REPLACE FUNCTION public.guard_financial_document_job_completion_v9()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $function$
BEGIN
  IF NEW.status='terminal' AND NEW.terminal_reason='complete'
    AND EXISTS(SELECT 1 FROM public.candidate_financial_document_job_links_v9 link WHERE link.job_id=NEW.job_id)
    AND NOT EXISTS(SELECT 1 FROM public.candidate_financial_document_job_links_v9 link
      CROSS JOIN LATERAL public.candidate_financial_document_job_evidence_v9(
        link.receipt_id,NEW.stock_id,NEW.period_end,
        public.candidate_financial_document_job_requirements_v9(NEW.job_id,NEW.required_fact_keys)) evidence
      WHERE link.job_id=NEW.job_id AND evidence.is_complete)
  THEN
    NEW.status:='queued'; NEW.terminal_reason:=NULL;
    NEW.terminal_detail:='document_required_fields_or_validation_incomplete';
    NEW.lease_owner:=NULL; NEW.lease_expires_at:=NULL; NEW.next_attempt_at:=clock_timestamp()+interval '6 hours';
  END IF;
  RETURN NEW;
END; $function$;
DROP TRIGGER IF EXISTS guard_financial_document_job_completion_v9 ON public.candidate_financial_acquisition_jobs_v4;
CREATE TRIGGER guard_financial_document_job_completion_v9 BEFORE UPDATE ON public.candidate_financial_acquisition_jobs_v4
  FOR EACH ROW EXECUTE FUNCTION public.guard_financial_document_job_completion_v9();

CREATE OR REPLACE FUNCTION public.reconcile_candidate_financial_document_job_v9(
  p_receipt_id uuid,p_job_id uuid,p_caller_principal uuid
) RETURNS TABLE(job_status text,terminal_reason text,missing_fact_keys jsonb,receipt_validation_status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $function$
DECLARE v_job public.candidate_financial_acquisition_jobs_v4%ROWTYPE; v_evidence record; v_required jsonb;
BEGIN
  IF NOT public.internal_principal_role_is_exact_v3_internal(p_caller_principal,'opportunity_runner',clock_timestamp())
  THEN RAISE EXCEPTION 'principal_role_unavailable'; END IF;
  -- Match the v8 finalizer's global lock order: receipt, then acquisition job.
  -- FK checks during link insertion must not acquire a receipt after job lock.
  PERFORM 1 FROM public.candidate_financial_document_receipts_v6 receipt WHERE receipt.receipt_id=p_receipt_id FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'candidate_financial_document_job_mismatch'; END IF;
  SELECT * INTO v_job FROM public.candidate_financial_acquisition_jobs_v4 job WHERE job.job_id=p_job_id FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.candidate_financial_document_receipts_v6 receipt
    WHERE receipt.receipt_id=p_receipt_id AND receipt.stock_id=v_job.stock_id AND receipt.period_end=v_job.period_end)
  THEN RAISE EXCEPTION 'candidate_financial_document_job_mismatch'; END IF;
  INSERT INTO public.candidate_financial_document_job_links_v9(receipt_id,job_id,required_fact_keys_at_link,linked_by)
    VALUES(p_receipt_id,p_job_id,v_job.required_fact_keys,p_caller_principal) ON CONFLICT DO NOTHING;
  v_required:=public.candidate_financial_document_job_requirements_v9(p_job_id,v_job.required_fact_keys);
  -- Do not let a later partial document erase a complete result supported by
  -- another still-valid receipt for the exact same job. Never combine inputs
  -- from separate filings into a synthetic complete document.
  SELECT evidence.* INTO v_evidence FROM public.candidate_financial_document_job_links_v9 link
    CROSS JOIN LATERAL public.candidate_financial_document_job_evidence_v9(
      link.receipt_id,v_job.stock_id,v_job.period_end,v_required) evidence
    WHERE link.job_id=p_job_id
    ORDER BY evidence.is_complete DESC,jsonb_array_length(evidence.missing_fact_keys),link.linked_at DESC LIMIT 1;
  UPDATE public.candidate_financial_acquisition_jobs_v4 job SET
    status=CASE WHEN v_evidence.is_complete THEN 'terminal' ELSE 'queued' END,
    terminal_reason=CASE WHEN v_evidence.is_complete THEN 'complete'::public.financial_acquisition_terminal_reason_v4 ELSE NULL END,
    terminal_detail=CASE WHEN v_evidence.is_complete THEN NULL
      WHEN jsonb_array_length(v_evidence.missing_fact_keys)>0 THEN 'document_required_fields_missing:'||v_evidence.missing_fact_keys::text
      ELSE 'document_validation_pending_or_incomplete' END,
    lease_owner=NULL,lease_expires_at=NULL,collected_at=COALESCE(job.collected_at,clock_timestamp()),
    next_attempt_at=CASE WHEN v_evidence.is_complete THEN NULL ELSE clock_timestamp()+interval '6 hours' END,
    updated_at=clock_timestamp() WHERE job.job_id=p_job_id
    RETURNING job.status,job.terminal_reason::text INTO job_status,terminal_reason;
  missing_fact_keys:=v_evidence.missing_fact_keys; receipt_validation_status:=v_evidence.receipt_validation_status;
  RETURN NEXT;
END; $function$;

CREATE OR REPLACE FUNCTION public.reconcile_pending_financial_document_jobs_v9(
  p_caller_principal uuid,p_limit integer DEFAULT 40,p_receipt_id uuid DEFAULT NULL
) RETURNS TABLE(receipt_id uuid,job_id uuid,job_status text,terminal_reason text,missing_fact_keys jsonb,receipt_validation_status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $function$
DECLARE v_link record; v_result record;
BEGIN
  IF NOT public.internal_principal_role_is_exact_v3_internal(p_caller_principal,'opportunity_runner',clock_timestamp())
  THEN RAISE EXCEPTION 'principal_role_unavailable'; END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'invalid_financial_document_reconcile_limit'; END IF;
  FOR v_link IN SELECT link.receipt_id,link.job_id FROM public.candidate_financial_document_job_links_v9 link
    JOIN public.candidate_financial_acquisition_jobs_v4 job ON job.job_id=link.job_id
    JOIN public.candidate_financial_document_receipts_v6 receipt ON receipt.receipt_id=link.receipt_id
    WHERE (p_receipt_id IS NULL OR link.receipt_id=p_receipt_id) AND receipt.parser_status='complete'
      AND job.status IN ('queued','running')
      AND (p_receipt_id IS NOT NULL OR job.next_attempt_at IS NULL OR job.next_attempt_at<=clock_timestamp())
    ORDER BY job.updated_at,link.linked_at,link.receipt_id,link.job_id
    -- Do not pre-lock jobs before the receipt lock taken by the direct RPC.
    FOR KEY SHARE OF receipt SKIP LOCKED LIMIT p_limit
  LOOP
    SELECT * INTO v_result FROM public.reconcile_candidate_financial_document_job_v9(v_link.receipt_id,v_link.job_id,p_caller_principal);
    receipt_id:=v_link.receipt_id; job_id:=v_link.job_id; job_status:=v_result.job_status;
    terminal_reason:=v_result.terminal_reason; missing_fact_keys:=v_result.missing_fact_keys;
    receipt_validation_status:=v_result.receipt_validation_status; RETURN NEXT;
  END LOOP;
END; $function$;

CREATE OR REPLACE FUNCTION public.claim_candidate_financial_acquisition_jobs_v4(
  p_stock_ids uuid[],p_endpoint_key text,p_limit integer,p_owner text,
  p_claimed_at timestamptz,p_lease_expires_at timestamptz
) RETURNS TABLE(job_id uuid,stock_id uuid,period_end date,cursor_key text,attempts integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $function$
#variable_conflict use_column
BEGIN
  IF p_endpoint_key NOT IN ('mops_inline','tpex_general_income','tpex_broker_income','tpex_general_balance','tpex_broker_balance','issuer_ir_document')
    OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 240 OR char_length(COALESCE(p_owner,'')) NOT BETWEEN 1 AND 200
    OR p_claimed_at IS NULL OR p_lease_expires_at IS NULL OR p_lease_expires_at<=p_claimed_at
  THEN RAISE EXCEPTION 'invalid_candidate_financial_claim'; END IF;
  RETURN QUERY WITH ranked AS (
    SELECT candidate.job_id,row_number() OVER(PARTITION BY candidate.stock_id
      ORDER BY candidate.attempts,candidate.period_end DESC,candidate.created_at,candidate.job_id) AS issuer_rank
    FROM public.candidate_financial_acquisition_jobs_v4 candidate
    WHERE candidate.stock_id=ANY(p_stock_ids) AND candidate.endpoint_key=p_endpoint_key
      AND ((candidate.status='queued' AND (candidate.next_attempt_at IS NULL OR candidate.next_attempt_at<=p_claimed_at))
        OR (candidate.status='running' AND candidate.lease_expires_at<p_claimed_at))
      AND NOT EXISTS(SELECT 1 FROM public.candidate_financial_document_receipts_v6 receipt
        WHERE receipt.acquisition_job_id=candidate.job_id AND receipt.parser_status IN ('queued','running'))
      AND NOT EXISTS(SELECT 1 FROM public.candidate_financial_document_job_links_v9 link
        JOIN public.candidate_financial_document_receipts_v6 receipt ON receipt.receipt_id=link.receipt_id
        WHERE link.job_id=candidate.job_id AND (receipt.parser_status IN ('queued','running') OR receipt.financial_validation_status='pending'))
  ), selected AS (
    SELECT candidate.job_id FROM public.candidate_financial_acquisition_jobs_v4 candidate JOIN ranked ON ranked.job_id=candidate.job_id
    WHERE candidate.stock_id=ANY(p_stock_ids) AND candidate.endpoint_key=p_endpoint_key
      AND ((candidate.status='queued' AND (candidate.next_attempt_at IS NULL OR candidate.next_attempt_at<=p_claimed_at))
        OR (candidate.status='running' AND candidate.lease_expires_at<p_claimed_at))
      AND NOT EXISTS(SELECT 1 FROM public.candidate_financial_document_receipts_v6 receipt
        WHERE receipt.acquisition_job_id=candidate.job_id AND receipt.parser_status IN ('queued','running'))
      AND NOT EXISTS(SELECT 1 FROM public.candidate_financial_document_job_links_v9 link
        JOIN public.candidate_financial_document_receipts_v6 receipt ON receipt.receipt_id=link.receipt_id
        WHERE link.job_id=candidate.job_id AND (receipt.parser_status IN ('queued','running') OR receipt.financial_validation_status='pending'))
    ORDER BY ranked.issuer_rank,candidate.attempts,candidate.period_end DESC,candidate.created_at,candidate.job_id
    FOR UPDATE OF candidate SKIP LOCKED LIMIT p_limit
  ), claimed_jobs AS (UPDATE public.candidate_financial_acquisition_jobs_v4 claimed
    SET status='running',lease_owner=p_owner,lease_expires_at=p_lease_expires_at,next_attempt_at=NULL,updated_at=p_claimed_at
    FROM selected WHERE claimed.job_id=selected.job_id
      AND ((claimed.status='queued' AND (claimed.next_attempt_at IS NULL OR claimed.next_attempt_at<=p_claimed_at))
        OR (claimed.status='running' AND claimed.lease_expires_at<p_claimed_at))
    RETURNING claimed.job_id,claimed.stock_id,claimed.period_end,claimed.cursor_key,claimed.attempts
  ), touched AS (
    INSERT INTO public.candidate_financial_acquisition_cursors_v4(stock_id,endpoint_key,cursor_value,last_attempted_at,updated_at)
      SELECT DISTINCT claimed_jobs.stock_id,p_endpoint_key,'{}'::jsonb,p_claimed_at,p_claimed_at FROM claimed_jobs
      ON CONFLICT(stock_id,endpoint_key) DO UPDATE SET
        last_attempted_at=GREATEST(public.candidate_financial_acquisition_cursors_v4.last_attempted_at,EXCLUDED.last_attempted_at),
        updated_at=GREATEST(public.candidate_financial_acquisition_cursors_v4.updated_at,EXCLUDED.updated_at) RETURNING 1
  ) SELECT claimed_jobs.job_id,claimed_jobs.stock_id,claimed_jobs.period_end,claimed_jobs.cursor_key,claimed_jobs.attempts FROM claimed_jobs;
END; $function$;

REVOKE ALL ON FUNCTION public.reject_financial_document_job_link_mutation_v9(),
  public.seed_financial_document_job_link_v9(),
  public.candidate_financial_document_job_evidence_v9(uuid,uuid,date,jsonb),
  public.candidate_financial_document_job_requirements_v9(uuid,jsonb),
  public.guard_financial_document_job_completion_v9() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.reconcile_candidate_financial_document_job_v9(uuid,uuid,uuid),
  public.reconcile_pending_financial_document_jobs_v9(uuid,integer,uuid),
  public.claim_candidate_financial_acquisition_jobs_v4(uuid[],text,integer,text,timestamptz,timestamptz)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_candidate_financial_document_job_v9(uuid,uuid,uuid),
  public.reconcile_pending_financial_document_jobs_v9(uuid,integer,uuid),
  public.claim_candidate_financial_acquisition_jobs_v4(uuid[],text,integer,text,timestamptz,timestamptz) TO service_role;
COMMIT;
