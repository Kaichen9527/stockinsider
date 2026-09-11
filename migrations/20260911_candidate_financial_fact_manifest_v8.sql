-- Candidate document parser v8: durable structural evidence followed by exact
-- fact-level accounting validation. No document or acquisition is complete
-- until every fact linked to that receipt reaches a terminal validation state.
BEGIN;

ALTER TABLE public.candidate_financial_document_receipts_v6
  DROP CONSTRAINT IF EXISTS candidate_financial_document_receipts_v6_receipt_status_check;
ALTER TABLE public.candidate_financial_document_receipts_v6
  ADD CONSTRAINT candidate_financial_document_receipts_v6_receipt_status_check
  CHECK(receipt_status IN ('accepted','partial','rejected','validation_pending'));
ALTER TABLE public.candidate_financial_document_receipts_v6
  ADD COLUMN IF NOT EXISTS financial_validation_status text NOT NULL DEFAULT 'not_applicable'
    CHECK(financial_validation_status IN ('not_applicable','pending','validated','rejected')),
  ADD COLUMN IF NOT EXISTS parser_evidence_id uuid,
  ADD COLUMN IF NOT EXISTS financial_validation_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS financial_validation_next_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS financial_validation_terminal_reason text;
ALTER TABLE public.candidate_financial_document_receipts_v6
  DROP CONSTRAINT IF EXISTS candidate_financial_document_receipts_v6_financial_validation_attempts_check;
ALTER TABLE public.candidate_financial_document_receipts_v6
  ADD CONSTRAINT candidate_financial_document_receipts_v6_financial_validation_attempts_check
  CHECK(financial_validation_attempts BETWEEN 0 AND 20);

CREATE TABLE IF NOT EXISTS public.candidate_financial_parser_evidence_v8 (
  evidence_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL REFERENCES public.candidate_financial_document_receipts_v6(receipt_id) ON DELETE RESTRICT,
  document_sha256 text NOT NULL CHECK(document_sha256 ~ '^[0-9a-f]{64}$'),
  parser text CHECK(parser IN ('arelle','pdfplumber','docling')),
  parser_version text,
  taxonomy_sha256 text CHECK(taxonomy_sha256 IS NULL OR taxonomy_sha256 ~ '^[0-9a-f]{64}$'),
  validation_summary jsonb,
  validated_fact_manifest jsonb NOT NULL CHECK(jsonb_typeof(validated_fact_manifest)='array'),
  manifest_sha256 text NOT NULL CHECK(manifest_sha256 ~ '^[0-9a-f]{64}$'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(receipt_id,manifest_sha256)
);
ALTER TABLE public.candidate_financial_document_receipts_v6
  DROP CONSTRAINT IF EXISTS candidate_financial_document_receipts_v6_parser_evidence_fk;
ALTER TABLE public.candidate_financial_document_receipts_v6
  ADD CONSTRAINT candidate_financial_document_receipts_v6_parser_evidence_fk
  FOREIGN KEY(parser_evidence_id) REFERENCES public.candidate_financial_parser_evidence_v8(evidence_id) ON DELETE RESTRICT;
ALTER TABLE public.candidate_financial_parser_evidence_v8 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.candidate_financial_parser_evidence_v8 FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.candidate_financial_parser_evidence_v8 TO service_role;

CREATE TABLE IF NOT EXISTS public.candidate_financial_document_fact_links_v8 (
  receipt_id uuid NOT NULL REFERENCES public.candidate_financial_document_receipts_v6(receipt_id) ON DELETE RESTRICT,
  fact_id uuid NOT NULL REFERENCES public.opportunity_financial_facts_v3(fact_id) ON DELETE RESTRICT,
  fact_recorded_at timestamptz NOT NULL,
  evidence_id uuid NOT NULL REFERENCES public.candidate_financial_parser_evidence_v8(evidence_id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(receipt_id,fact_id)
);
ALTER TABLE public.candidate_financial_document_fact_links_v8 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.candidate_financial_document_fact_links_v8 FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.candidate_financial_document_fact_links_v8 TO service_role;

CREATE OR REPLACE FUNCTION public.complete_candidate_financial_document_receipt_parser_v8(
  p_receipt_id uuid,p_owner text,p_caller_principal uuid,p_facts jsonb,p_parser_locators jsonb,
  p_parser_evidence jsonb,p_missing_requirements jsonb,p_rejection_reasons jsonb,p_completed_at timestamptz
) RETURNS TABLE(receipt_status text,added_fact_count integer,duplicate_fact_count integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp AS $function$
DECLARE
  v_receipt public.candidate_financial_document_receipts_v6%ROWTYPE;
  v_fact jsonb; v_locator jsonb; v_fact_id uuid; v_recorded_at timestamptz;
  v_added integer:=0; v_duplicate integer:=0; v_status text; v_evidence_id uuid;
  v_manifest_sha text; v_parser text; v_validation jsonb; v_manifest jsonb;
BEGIN
  IF NOT public.internal_principal_role_is_exact_v3_internal(p_caller_principal,'opportunity_runner',clock_timestamp())
  THEN RAISE EXCEPTION 'principal_role_unavailable'; END IF;
  IF jsonb_typeof(COALESCE(p_facts,'[]'::jsonb))<>'array' OR jsonb_array_length(COALESCE(p_facts,'[]'::jsonb))>128
    OR jsonb_typeof(COALESCE(p_parser_locators,'[]'::jsonb))<>'array' OR jsonb_array_length(COALESCE(p_parser_locators,'[]'::jsonb))>200
    OR jsonb_typeof(COALESCE(p_parser_evidence,'null'::jsonb))<>'object'
    OR p_parser_evidence->>'schema' IS DISTINCT FROM 'candidate-financial-parser-evidence-v8'
    OR jsonb_typeof(COALESCE(p_parser_evidence->'validatedFacts','null'::jsonb))<>'array'
    OR jsonb_array_length(p_parser_evidence->'validatedFacts')>200
    OR jsonb_typeof(COALESCE(p_missing_requirements,'[]'::jsonb))<>'array'
    OR jsonb_typeof(COALESCE(p_rejection_reasons,'[]'::jsonb))<>'array'
    OR p_completed_at IS NULL OR p_completed_at>clock_timestamp()
  THEN RAISE EXCEPTION 'invalid_candidate_financial_document_completion'; END IF;

  SELECT * INTO v_receipt FROM public.candidate_financial_document_receipts_v6 receipt
  WHERE receipt.receipt_id=p_receipt_id AND receipt.parser_status='running' AND receipt.parser_owner=p_owner FOR UPDATE;
  IF NOT FOUND OR v_receipt.parser_lease_expires_at<clock_timestamp()
  THEN RAISE EXCEPTION 'candidate_financial_document_lease_lost'; END IF;
  IF p_parser_evidence->>'documentSha256' IS DISTINCT FROM v_receipt.document_sha256
  THEN RAISE EXCEPTION 'candidate_financial_parser_evidence_document_mismatch'; END IF;

  v_parser:=NULLIF(p_parser_evidence->>'parser','');
  v_validation:=p_parser_evidence->'validation';
  v_manifest:=p_parser_evidence->'validatedFacts';
  IF v_parser IS NOT NULL AND v_parser NOT IN ('arelle','pdfplumber','docling')
    OR (v_parser='arelle' AND (
      p_parser_evidence->>'parserVersion' IS DISTINCT FROM '2.44.7'
      OR p_parser_evidence->>'taxonomySha256' IS DISTINCT FROM '4e44e67647b1a5a575d416ef44614d9c5651bb0d895621e12f6b6ca64a457869'
      OR jsonb_typeof(COALESCE(v_validation,'null'::jsonb))<>'object'
    ))
    OR (jsonb_array_length(p_facts)>0 AND (
      COALESCE((v_validation->>'errorCount')::integer,-1)<>0
      OR COALESCE((v_validation->>'validFactCount')::integer,-1)<>jsonb_array_length(v_manifest)
    ))
    OR (v_parser IS DISTINCT FROM 'arelle' AND jsonb_array_length(v_manifest)<>0)
    OR (jsonb_array_length(p_facts)>0 AND v_parser IS DISTINCT FROM 'arelle')
  THEN RAISE EXCEPTION 'candidate_financial_parser_evidence_invalid'; END IF;

  FOR v_locator IN SELECT value FROM jsonb_array_elements(p_parser_locators) LOOP
    IF jsonb_typeof(v_locator)<>'object' OR NOT (
      (v_locator ? 'xbrl_context' AND v_locator ? 'xbrl_concept'
        AND jsonb_typeof(v_locator->'xbrl_context')='string' AND jsonb_typeof(v_locator->'xbrl_concept')='string'
        AND char_length(v_locator->>'xbrl_context') BETWEEN 1 AND 256
        AND char_length(v_locator->>'xbrl_concept') BETWEEN 1 AND 256)
      OR (v_locator ? 'page' AND jsonb_typeof(v_locator->'page')='number'
        AND (v_locator->>'page')::integer BETWEEN 1 AND 200
        AND (NOT (v_locator ? 'table') OR (jsonb_typeof(v_locator->'table')='number'
          AND (v_locator->>'table')::integer BETWEEN 1 AND 20)))
    ) THEN RAISE EXCEPTION 'candidate_financial_document_locator_invalid'; END IF;
  END LOOP;

  -- Hash the complete canonical evidence, not only its fact manifest. Two
  -- empty-manifest attempts with different runtime diagnostics must remain
  -- independently auditable.
  v_manifest_sha:=encode(digest(convert_to(p_parser_evidence::text,'utf8'),'sha256'),'hex');
  INSERT INTO public.candidate_financial_parser_evidence_v8(
    receipt_id,document_sha256,parser,parser_version,taxonomy_sha256,validation_summary,
    validated_fact_manifest,manifest_sha256,recorded_at
  ) VALUES(p_receipt_id,v_receipt.document_sha256,v_parser,NULLIF(p_parser_evidence->>'parserVersion',''),
    NULLIF(p_parser_evidence->>'taxonomySha256',''),v_validation,v_manifest,v_manifest_sha,p_completed_at)
  ON CONFLICT(receipt_id,manifest_sha256) DO UPDATE SET receipt_id=EXCLUDED.receipt_id
  RETURNING evidence_id INTO v_evidence_id;

  FOR v_fact IN SELECT value FROM jsonb_array_elements(p_facts) LOOP
    IF (v_fact #>> '{input,stock_id}')::uuid IS DISTINCT FROM v_receipt.stock_id
      OR (v_fact #>> '{input,period_end}')::date IS DISTINCT FROM v_receipt.period_end
      OR (v_fact #>> '{input,provider}')<>'mops'
      OR (v_fact #>> '{input,authority_tier}')<>'official_filing'
      OR COALESCE(v_fact #>> '{input,source_ref}','') !~ ('^issuer-document:'||v_receipt.document_sha256||':')
      OR jsonb_typeof(COALESCE(v_fact->'locator','null'::jsonb))<>'object'
      OR NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_manifest) manifest(row)
        JOIN public.stocks stock ON stock.id=v_receipt.stock_id
        WHERE manifest.row->>'xbrl_context'=v_fact #>> '{locator,xbrl_context}'
          AND manifest.row->>'xbrl_concept'=v_fact #>> '{locator,xbrl_concept}'
          AND manifest.row->>'unit'=v_fact #>> '{input,unit}'
          AND (manifest.row->>'value')::numeric=(v_fact #>> '{input,value}')::numeric
          AND manifest.row->>'entity_identifier'=stock.symbol
          AND (manifest.row->>'period_start')::date IS NOT DISTINCT FROM (v_fact #>> '{input,period_start}')::date
          AND (manifest.row->>'period_end')::date=(v_fact #>> '{input,period_end}')::date
          AND manifest.row->>'duration_kind'=v_fact #>> '{input,duration_kind}'
          AND (manifest.row->>'dimension_count')::integer=0
      )
    THEN RAISE EXCEPTION 'candidate_financial_document_fact_invalid'; END IF;

    SELECT fact.fact_id,fact.recorded_at INTO v_fact_id,v_recorded_at
    FROM public.opportunity_financial_facts_v3 fact
    WHERE fact.stock_id=v_receipt.stock_id AND fact.source_ref=v_fact #>> '{input,source_ref}'
      AND fact.collected_at<=(v_fact #>> '{input,collected_at}')::timestamptz
    ORDER BY fact.recorded_at,fact.fact_id LIMIT 1;
    IF v_fact_id IS NULL THEN
      SELECT appended.fact_id,appended.recorded_at INTO v_fact_id,v_recorded_at
      FROM public.append_financial_fact_v3(
        jsonb_populate_record(NULL::public.financial_fact_input_v3,v_fact->'input'),p_caller_principal
      ) appended LIMIT 1;
      v_added:=v_added+1;
    ELSE v_duplicate:=v_duplicate+1; END IF;
    IF v_fact_id IS NULL OR v_recorded_at IS NULL
    THEN RAISE EXCEPTION 'candidate_financial_document_fact_append_empty'; END IF;
    INSERT INTO public.candidate_financial_fact_provenance_v4(
      fact_id,issuer_document_id,source_url,source_sha256,locator,extracted_at
    ) VALUES(v_fact_id,v_receipt.issuer_document_id,v_receipt.source_url,v_receipt.document_sha256,
      (v_fact->'locator')||jsonb_build_object('parser_evidence_id',v_evidence_id,'manifest_sha256',v_manifest_sha),p_completed_at)
    ON CONFLICT DO NOTHING;
    INSERT INTO public.candidate_financial_document_fact_links_v8(receipt_id,fact_id,fact_recorded_at,evidence_id,created_at)
    VALUES(p_receipt_id,v_fact_id,v_recorded_at,v_evidence_id,p_completed_at) ON CONFLICT DO NOTHING;
  END LOOP;

  v_status:=CASE WHEN jsonb_array_length(p_rejection_reasons)>0 THEN 'rejected'
    WHEN jsonb_array_length(p_facts)>0 THEN 'validation_pending' ELSE 'partial' END;
  UPDATE public.candidate_financial_document_receipts_v6 SET
    receipt_status=v_status,parser_status='complete',parser_owner=NULL,parser_lease_expires_at=NULL,
    added_fact_count=v_added,duplicate_fact_count=v_duplicate,parser_locators=p_parser_locators,
    parser_evidence_id=v_evidence_id,
    financial_validation_status=CASE WHEN jsonb_array_length(p_facts)>0 THEN 'pending' ELSE 'not_applicable' END,
    financial_validation_attempts=0,
    financial_validation_next_attempt_at=CASE WHEN jsonb_array_length(p_facts)>0 THEN p_completed_at ELSE NULL END,
    financial_validation_terminal_reason=NULL,
    missing_requirements=p_missing_requirements,rejection_reasons=p_rejection_reasons,completed_at=p_completed_at
  WHERE receipt_id=p_receipt_id;
  receipt_status:=v_status; added_fact_count:=v_added; duplicate_fact_count:=v_duplicate; RETURN NEXT;
END $function$;

CREATE OR REPLACE FUNCTION public.finalize_candidate_financial_document_validation_v8(
  p_receipt_id uuid,p_caller_principal uuid,p_completed_at timestamptz
) RETURNS TABLE(validation_status text,validated_fact_count integer,rejected_fact_count integer,pending_fact_count integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $function$
DECLARE v_receipt public.candidate_financial_document_receipts_v6%ROWTYPE;
  v_total integer; v_validated integer; v_rejected integer; v_pending integer; v_status text; v_receipt_status text;
BEGIN
  IF NOT public.internal_principal_role_is_exact_v3_internal(p_caller_principal,'opportunity_runner',clock_timestamp())
  THEN RAISE EXCEPTION 'principal_role_unavailable'; END IF;
  IF p_completed_at IS NULL OR p_completed_at>clock_timestamp()
  THEN RAISE EXCEPTION 'candidate_financial_validation_time_invalid'; END IF;
  SELECT * INTO v_receipt FROM public.candidate_financial_document_receipts_v6
    WHERE receipt_id=p_receipt_id FOR UPDATE;
  IF NOT FOUND OR v_receipt.parser_status<>'complete'
  THEN RAISE EXCEPTION 'candidate_financial_validation_receipt_unavailable'; END IF;
  -- Mutable fact columns and unbound V1 receipts are predecessor state. Only
  -- the latest principal-bound V2 transition for this exact document counts.
  SELECT count(*),count(*) FILTER(WHERE latest.effective_validation->>'validation_status'='validated'
      AND (latest.effective_validation->>'schema_valid')::boolean IS TRUE
      AND (latest.effective_validation->>'unit_valid')::boolean IS TRUE
      AND (latest.effective_validation->>'point_in_time_valid')::boolean IS TRUE
      AND (latest.effective_validation->>'consistency_valid')::boolean IS TRUE),
    count(*) FILTER(WHERE latest.effective_validation->>'validation_status' IN ('rejected','conflict','stale'))
  INTO v_total,v_validated,v_rejected
  FROM public.candidate_financial_document_fact_links_v8 link
  JOIN public.opportunity_financial_facts_v3 fact
    ON fact.fact_id=link.fact_id AND fact.recorded_at=link.fact_recorded_at
  LEFT JOIN LATERAL (
    SELECT validation_receipt.effective_validation
    FROM public.official_financial_validation_receipts validation_receipt
    WHERE validation_receipt.fact_id=fact.fact_id
      AND validation_receipt.source_sha256=v_receipt.document_sha256
      AND validation_receipt.validator_version='official-financial-v2'
      AND validation_receipt.validator_principal IS NOT NULL
      AND validation_receipt.validated_at<=p_completed_at
    ORDER BY validation_receipt.validated_at DESC,validation_receipt.receipt_sequence DESC
    LIMIT 1
  ) latest ON true
  WHERE link.receipt_id=p_receipt_id;
  v_pending:=v_total-v_validated-v_rejected;
  IF v_total=0 THEN RAISE EXCEPTION 'candidate_financial_validation_fact_set_empty'; END IF;
  -- Terminal validation is immutable. A repeated scheduler call is an
  -- idempotent observation, not a new attempt and cannot resurrect a receipt.
  IF v_receipt.financial_validation_status IN ('validated','rejected') THEN
    validation_status:=v_receipt.financial_validation_status;
    validated_fact_count:=v_validated;
    rejected_fact_count:=CASE WHEN v_receipt.financial_validation_status='rejected'
      THEN GREATEST(v_rejected,v_total-v_validated) ELSE v_rejected END;
    pending_fact_count:=CASE WHEN v_receipt.financial_validation_status='validated' THEN v_pending ELSE 0 END;
    RETURN NEXT; RETURN;
  END IF;
  IF v_pending>0 AND v_receipt.financial_validation_attempts>=19 THEN
    UPDATE public.candidate_financial_document_receipts_v6 SET
      financial_validation_status='rejected',receipt_status='partial',
      financial_validation_attempts=financial_validation_attempts+1,
      financial_validation_next_attempt_at=NULL,
      financial_validation_terminal_reason='validation_retry_exhausted',
      missing_requirements=CASE WHEN missing_requirements ? 'official_fact_validation_retry_exhausted'
        THEN missing_requirements ELSE missing_requirements||jsonb_build_array('official_fact_validation_retry_exhausted') END
    WHERE receipt_id=p_receipt_id;
    IF v_receipt.acquisition_job_id IS NOT NULL THEN
      UPDATE public.candidate_financial_acquisition_jobs_v4 SET status='terminal',
        terminal_reason='schema_unrecognized'::public.financial_acquisition_terminal_reason_v4,
        terminal_detail='official_fact_validation_retry_exhausted',lease_owner=NULL,lease_expires_at=NULL,
        collected_at=p_completed_at,next_attempt_at=NULL,updated_at=p_completed_at
      WHERE job_id=v_receipt.acquisition_job_id AND status IN ('queued','running');
    END IF;
    validation_status:='rejected'; validated_fact_count:=v_validated;
    rejected_fact_count:=v_rejected+v_pending; pending_fact_count:=0; RETURN NEXT; RETURN;
  ELSIF v_pending>0 THEN
    UPDATE public.candidate_financial_document_receipts_v6 SET
      financial_validation_attempts=financial_validation_attempts+1,
      financial_validation_next_attempt_at=p_completed_at+LEAST(interval '6 hours',
        interval '5 minutes' * power(2,LEAST(financial_validation_attempts,6)))
    WHERE receipt_id=p_receipt_id;
    validation_status:='pending'; validated_fact_count:=v_validated;
    rejected_fact_count:=v_rejected; pending_fact_count:=v_pending; RETURN NEXT; RETURN;
  END IF;
  v_status:=CASE WHEN v_rejected=0 THEN 'validated' ELSE 'rejected' END;
  v_receipt_status:=CASE WHEN v_status='validated'
    AND jsonb_array_length(v_receipt.missing_requirements)=0
    AND jsonb_array_length(v_receipt.rejection_reasons)=0 THEN 'accepted' ELSE 'partial' END;
  UPDATE public.candidate_financial_document_receipts_v6 SET
    financial_validation_status=v_status,
    financial_validation_next_attempt_at=NULL,
    financial_validation_terminal_reason=CASE WHEN v_status='validated' THEN NULL ELSE 'official_fact_validation_rejected' END,
    receipt_status=v_receipt_status,
    missing_requirements=CASE WHEN v_status='rejected' AND NOT (missing_requirements ? 'official_fact_validation_rejected')
      THEN missing_requirements||jsonb_build_array('official_fact_validation_rejected') ELSE missing_requirements END
  WHERE receipt_id=p_receipt_id;
  IF v_receipt.acquisition_job_id IS NOT NULL THEN
    UPDATE public.candidate_financial_acquisition_jobs_v4 SET status='terminal',
      terminal_reason=CASE WHEN v_receipt_status='accepted'
        THEN 'complete'::public.financial_acquisition_terminal_reason_v4
        ELSE 'schema_unrecognized'::public.financial_acquisition_terminal_reason_v4 END,
      terminal_detail=CASE WHEN v_receipt_status='accepted' THEN NULL
        WHEN v_status='validated' THEN 'document_requirements_incomplete'
        ELSE 'official_fact_validation_rejected' END,
      lease_owner=NULL,lease_expires_at=NULL,collected_at=p_completed_at,
      next_attempt_at=NULL,updated_at=p_completed_at
    WHERE job_id=v_receipt.acquisition_job_id AND status IN ('queued','running');
  END IF;
  validation_status:=v_status; validated_fact_count:=v_validated;
  rejected_fact_count:=v_rejected; pending_fact_count:=v_pending; RETURN NEXT;
END $function$;

-- Supersede the v1 writer with the same append-only validation semantics while
-- admitting an issuer URL only when its exact host was already approved for
-- this stock by the document-ingress allowlist.
CREATE OR REPLACE FUNCTION public.record_official_financial_validation(
  p_fact_id uuid,p_recorded_at timestamptz,p_source_sha256 text,p_input_hash text,p_validation jsonb
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $function$
DECLARE v_fact public.opportunity_financial_facts_v3%ROWTYPE; v_valid boolean; v_inserted integer;
  v_prior jsonb; v_effective jsonb; v_at timestamptz;
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
  IF NOT EXISTS (
    SELECT 1 FROM public.candidate_financial_fact_provenance_v4 provenance
    WHERE provenance.fact_id=p_fact_id AND provenance.source_sha256=p_source_sha256
      AND (
        provenance.source_url ~ '^https://([A-Za-z0-9-]+\.)*(twse\.com\.tw|tpex\.org\.tw)/'
        OR EXISTS (
          SELECT 1 FROM public.candidate_issuer_document_domains_v6 domain
          WHERE domain.stock_id=v_fact.stock_id
            AND domain.host=lower(substring(provenance.source_url from '^https://([^/]+)'))
        )
      )
  ) THEN RAISE EXCEPTION 'official_validation_provenance_missing'; END IF;
  v_valid := (p_validation->>'schemaValid')::boolean AND (p_validation->>'unitValid')::boolean
    AND (p_validation->>'pointInTimeValid')::boolean AND (p_validation->>'consistencyValid')::boolean
    AND jsonb_array_length(p_validation->'reasons')=0
    AND COALESCE(to_jsonb(v_fact)->>'source_ref','') !~ '^(twse|tpex)-mops-inline:';
  v_at:=clock_timestamp();
  v_prior:=jsonb_build_object('validation_status',v_fact.validation_status,'schema_valid',v_fact.schema_valid,
    'unit_valid',v_fact.unit_valid,'point_in_time_valid',v_fact.point_in_time_valid,
    'consistency_valid',v_fact.consistency_valid,'validation_recorded_at',v_fact.validation_recorded_at);
  v_effective:=CASE WHEN v_fact.validation_status IN ('rejected','conflict','stale') THEN v_prior ELSE
    jsonb_build_object('validation_status',CASE WHEN v_valid THEN 'validated' ELSE 'rejected' END,
      'schema_valid',(p_validation->>'schemaValid')::boolean,'unit_valid',(p_validation->>'unitValid')::boolean,
      'point_in_time_valid',(p_validation->>'pointInTimeValid')::boolean,
      'consistency_valid',(p_validation->>'consistencyValid')::boolean,'validation_recorded_at',v_at) END;
  INSERT INTO public.official_financial_validation_receipts(
    fact_id,validator_version,input_hash,source_sha256,validation,validated_at,prior_validation,effective_validation
  ) VALUES(p_fact_id,'official-financial-v1',p_input_hash,p_source_sha256,p_validation,v_at,v_prior,v_effective)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_inserted=ROW_COUNT;
  IF v_inserted=0 THEN RETURN v_valid AND v_fact.validation_status='validated'; END IF;
  IF v_fact.validation_status IN ('rejected','conflict','stale') THEN RETURN FALSE; END IF;
  UPDATE public.opportunity_financial_facts_v3 SET
    validation_status=CASE WHEN v_valid THEN 'validated' ELSE 'rejected' END,
    schema_valid=(p_validation->>'schemaValid')::boolean,
    unit_valid=(p_validation->>'unitValid')::boolean,
    point_in_time_valid=(p_validation->>'pointInTimeValid')::boolean,
    consistency_valid=(p_validation->>'consistencyValid')::boolean,
    validation_recorded_at=v_at WHERE fact_id=p_fact_id;
  RETURN v_valid;
END $function$;

REVOKE ALL ON FUNCTION public.complete_candidate_financial_document_receipt_parser_v8(uuid,text,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_candidate_financial_document_receipt_parser_v8(uuid,text,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,timestamptz) TO service_role;
REVOKE ALL ON FUNCTION public.finalize_candidate_financial_document_validation_v8(uuid,uuid,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_candidate_financial_document_validation_v8(uuid,uuid,timestamptz) TO service_role;
REVOKE ALL ON FUNCTION public.record_official_financial_validation(uuid,timestamptz,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_official_financial_validation(uuid,timestamptz,text,text,jsonb) TO service_role;
REVOKE EXECUTE ON FUNCTION public.complete_candidate_financial_document_receipt_parser_v7(uuid,text,uuid,jsonb,jsonb,jsonb,jsonb,timestamptz) FROM service_role;

COMMIT;
