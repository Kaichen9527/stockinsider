-- Candidate document parser v8: admit only individually Arelle-valid facts.
-- Document-level validation findings remain attached to the receipt; they are
-- never suppressed or converted into a blanket document success.
BEGIN;

CREATE OR REPLACE FUNCTION public.complete_candidate_financial_document_receipt_parser_v8(
  p_receipt_id uuid,p_owner text,p_caller_principal uuid,p_facts jsonb,p_parser_locators jsonb,
  p_missing_requirements jsonb,p_rejection_reasons jsonb,p_completed_at timestamptz
) RETURNS TABLE(receipt_status text,added_fact_count integer,duplicate_fact_count integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp AS $function$
DECLARE
  v_receipt public.candidate_financial_document_receipts_v6%ROWTYPE;
  v_fact jsonb; v_locator jsonb; v_fact_id uuid;
  v_added integer:=0; v_duplicate integer:=0; v_status text;
BEGIN
  IF NOT public.internal_principal_role_is_exact_v3_internal(p_caller_principal,'opportunity_runner',clock_timestamp())
  THEN RAISE EXCEPTION 'principal_role_unavailable'; END IF;
  IF jsonb_typeof(COALESCE(p_facts,'[]'::jsonb))<>'array' OR jsonb_array_length(COALESCE(p_facts,'[]'::jsonb))>128
    OR jsonb_typeof(COALESCE(p_parser_locators,'[]'::jsonb))<>'array' OR jsonb_array_length(COALESCE(p_parser_locators,'[]'::jsonb))>200
    OR jsonb_typeof(COALESCE(p_missing_requirements,'[]'::jsonb))<>'array'
    OR jsonb_typeof(COALESCE(p_rejection_reasons,'[]'::jsonb))<>'array'
    OR p_completed_at IS NULL OR p_completed_at>clock_timestamp()
  THEN RAISE EXCEPTION 'invalid_candidate_financial_document_completion'; END IF;

  SELECT * INTO v_receipt FROM public.candidate_financial_document_receipts_v6 receipt
  WHERE receipt.receipt_id=p_receipt_id AND receipt.parser_status='running' AND receipt.parser_owner=p_owner FOR UPDATE;
  IF NOT FOUND OR v_receipt.parser_lease_expires_at<clock_timestamp()
  THEN RAISE EXCEPTION 'candidate_financial_document_lease_lost'; END IF;

  FOR v_locator IN SELECT value FROM jsonb_array_elements(p_parser_locators) LOOP
    IF jsonb_typeof(v_locator)<>'object'
      OR NOT (v_locator ? 'xbrl_context' AND v_locator ? 'xbrl_concept')
      OR jsonb_typeof(v_locator->'xbrl_context')<>'string'
      OR jsonb_typeof(v_locator->'xbrl_concept')<>'string'
      OR char_length(v_locator->>'xbrl_context') NOT BETWEEN 1 AND 256
      OR char_length(v_locator->>'xbrl_concept') NOT BETWEEN 1 AND 256
    THEN RAISE EXCEPTION 'candidate_financial_document_locator_invalid'; END IF;
  END LOOP;

  FOR v_fact IN SELECT value FROM jsonb_array_elements(p_facts) LOOP
    IF (v_fact #>> '{input,stock_id}')::uuid IS DISTINCT FROM v_receipt.stock_id
      OR (v_fact #>> '{input,period_end}')::date IS DISTINCT FROM v_receipt.period_end
      OR (v_fact #>> '{input,provider}')<>'mops'
      OR (v_fact #>> '{input,authority_tier}')<>'official_filing'
      OR COALESCE(v_fact #>> '{input,source_ref}','') !~ ('^issuer-document:'||v_receipt.document_sha256||':')
      OR jsonb_typeof(COALESCE(v_fact->'locator','null'::jsonb))<>'object'
      OR NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_parser_locators) parsed(locator)
        WHERE parsed.locator->>'xbrl_context'=v_fact #>> '{locator,xbrl_context}'
          AND parsed.locator->>'xbrl_concept'=v_fact #>> '{locator,xbrl_concept}'
      )
    THEN RAISE EXCEPTION 'candidate_financial_document_fact_invalid'; END IF;

    SELECT fact.fact_id INTO v_fact_id
    FROM public.opportunity_financial_facts_v3 fact
    WHERE fact.stock_id=v_receipt.stock_id AND fact.source_ref=v_fact #>> '{input,source_ref}'
      AND fact.collected_at<=(v_fact #>> '{input,collected_at}')::timestamptz
    ORDER BY fact.recorded_at,fact.fact_id LIMIT 1;
    IF v_fact_id IS NULL THEN
      SELECT appended.fact_id INTO v_fact_id
      FROM public.append_financial_fact_v3(
        jsonb_populate_record(NULL::public.financial_fact_input_v3,v_fact->'input'),p_caller_principal
      ) appended LIMIT 1;
      v_added:=v_added+1;
    ELSE
      v_duplicate:=v_duplicate+1;
    END IF;
    IF v_fact_id IS NULL
    THEN RAISE EXCEPTION 'candidate_financial_document_fact_append_empty'; END IF;

    INSERT INTO public.candidate_financial_fact_provenance_v4(
      fact_id,issuer_document_id,source_url,source_sha256,locator,extracted_at
    ) VALUES(v_fact_id,v_receipt.issuer_document_id,v_receipt.source_url,v_receipt.document_sha256,
      v_fact->'locator',p_completed_at) ON CONFLICT DO NOTHING;

  END LOOP;

  v_status:=CASE WHEN jsonb_array_length(p_rejection_reasons)>0 THEN 'rejected'
                 WHEN jsonb_array_length(p_missing_requirements)>0 OR jsonb_array_length(p_facts)=0 THEN 'partial'
                 ELSE 'accepted' END;
  UPDATE public.candidate_financial_document_receipts_v6 SET
    receipt_status=v_status,parser_status='complete',parser_owner=NULL,parser_lease_expires_at=NULL,
    added_fact_count=v_added,duplicate_fact_count=v_duplicate,parser_locators=p_parser_locators,
    missing_requirements=p_missing_requirements,rejection_reasons=p_rejection_reasons,completed_at=p_completed_at
  WHERE receipt_id=p_receipt_id;
  IF v_status='accepted' AND v_receipt.acquisition_job_id IS NOT NULL THEN
    UPDATE public.candidate_financial_acquisition_jobs_v4 SET status='terminal',terminal_reason='complete',terminal_detail=NULL,
      lease_owner=NULL,lease_expires_at=NULL,collected_at=p_completed_at,next_attempt_at=NULL,updated_at=p_completed_at
    WHERE job_id=v_receipt.acquisition_job_id AND status IN ('queued','running');
  END IF;
  receipt_status:=v_status; added_fact_count:=v_added; duplicate_fact_count:=v_duplicate; RETURN NEXT;
END $function$;

REVOKE ALL ON FUNCTION public.complete_candidate_financial_document_receipt_parser_v8(uuid,text,uuid,jsonb,jsonb,jsonb,jsonb,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_candidate_financial_document_receipt_parser_v8(uuid,text,uuid,jsonb,jsonb,jsonb,jsonb,timestamptz) TO service_role;
REVOKE EXECUTE ON FUNCTION public.complete_candidate_financial_document_receipt_parser_v7(uuid,text,uuid,jsonb,jsonb,jsonb,jsonb,timestamptz) FROM service_role;

COMMIT;
