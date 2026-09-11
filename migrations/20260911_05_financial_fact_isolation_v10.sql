-- Fact-scoped structural evidence v10. Legacy v8 keeps its zero-error contract.
-- Apply after financial_fact_manifest_v8 and financial_document_job_links_v9.
BEGIN;

ALTER TABLE public.candidate_financial_parser_evidence_v8
  ADD COLUMN IF NOT EXISTS evidence_schema_version integer,
  ADD COLUMN IF NOT EXISTS document_status text,
  ADD COLUMN IF NOT EXISTS fact_acceptance jsonb,
  ADD COLUMN IF NOT EXISTS error_manifest_sha256 text;
ALTER TABLE public.candidate_financial_parser_evidence_v8
  DROP CONSTRAINT IF EXISTS candidate_financial_parser_evidence_v10_shape;
ALTER TABLE public.candidate_financial_parser_evidence_v8
  ADD CONSTRAINT candidate_financial_parser_evidence_v10_shape CHECK (
    (evidence_schema_version IS NULL AND document_status IS NULL AND fact_acceptance IS NULL AND error_manifest_sha256 IS NULL)
    OR (evidence_schema_version IS NOT NULL AND evidence_schema_version=10
      AND document_status IS NOT NULL AND fact_acceptance IS NOT NULL AND error_manifest_sha256 IS NOT NULL AND document_status IN ('complete','partial')
      AND jsonb_typeof(fact_acceptance)='object' AND error_manifest_sha256 ~ '^[0-9a-f]{64}$')
  );

-- The original primary key is receipt-first; PIT reads enter through fact ID.
CREATE INDEX IF NOT EXISTS candidate_financial_document_fact_links_v10_fact_recorded_idx
  ON public.candidate_financial_document_fact_links_v8(fact_id,fact_recorded_at)
  INCLUDE(receipt_id,evidence_id,created_at);

-- The digest contract is recursively key-sorted compact JSON, not jsonb::text
-- (which contains whitespace). Contract object keys are ASCII.
CREATE OR REPLACE FUNCTION public.candidate_financial_canonical_json_v10(p_value jsonb)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=public,pg_temp AS $function$
DECLARE v_text text;
BEGIN
  CASE jsonb_typeof(p_value)
    WHEN 'object' THEN
      SELECT '{'||COALESCE(string_agg(to_json(field.key)::text||':'||
        public.candidate_financial_canonical_json_v10(field.value),',' ORDER BY field.key COLLATE "C"),'')||'}'
        INTO v_text FROM jsonb_each(p_value) field;
    WHEN 'array' THEN
      SELECT '['||COALESCE(string_agg(public.candidate_financial_canonical_json_v10(item.value),','
        ORDER BY item.ordinality),'')||']' INTO v_text
        FROM jsonb_array_elements(p_value) WITH ORDINALITY item(value,ordinality);
    ELSE v_text:=p_value::text;
  END CASE;
  RETURN v_text;
END; $function$;

CREATE OR REPLACE FUNCTION public.reject_financial_parser_evidence_mutation_v10()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $function$
BEGIN
  IF TG_OP='DELETE' OR NEW IS DISTINCT FROM OLD
  THEN RAISE EXCEPTION 'candidate_financial_parser_evidence_immutable'; END IF;
  -- The strict v8 writer uses an identity-only ON CONFLICT update.
  RETURN NEW;
END; $function$;
DROP TRIGGER IF EXISTS candidate_financial_parser_evidence_immutable_v10 ON public.candidate_financial_parser_evidence_v8;
CREATE TRIGGER candidate_financial_parser_evidence_immutable_v10 BEFORE UPDATE OR DELETE
  ON public.candidate_financial_parser_evidence_v8 FOR EACH ROW
  EXECUTE FUNCTION public.reject_financial_parser_evidence_mutation_v10();

CREATE OR REPLACE FUNCTION public.validate_candidate_financial_fact_scope_v10(
  p_evidence jsonb,p_content_type text,p_has_facts boolean
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp AS $function$
DECLARE v_acceptance jsonb; v_manifest jsonb; v_validation jsonb; v_error jsonb;
  v_rejection jsonb; v_ref jsonb; v_fact jsonb; v_index jsonb;
  v_error_count integer; v_has_fatal boolean:=false; v_usable boolean; v_indexes integer[]; v_extracted_ready boolean;
BEGIN
  IF jsonb_typeof(p_evidence) IS DISTINCT FROM 'object'
    OR p_evidence->>'schema' IS DISTINCT FROM 'candidate-financial-parser-evidence-v10'
    OR octet_length(convert_to(public.candidate_financial_canonical_json_v10(p_evidence),'utf8'))>2097152
    OR p_evidence->>'documentStatus' IS NULL OR p_evidence->>'documentStatus' NOT IN ('complete','partial')
    OR p_evidence->>'parser' IS DISTINCT FROM 'arelle'
    OR p_evidence->>'parserVersion' IS DISTINCT FROM '2.44.7'
    OR p_evidence->>'taxonomySha256' IS DISTINCT FROM '4e44e67647b1a5a575d416ef44614d9c5651bb0d895621e12f6b6ca64a457869'
    OR COALESCE(p_evidence->>'documentSha256','') !~ '^[0-9a-f]{64}$'
    OR COALESCE(p_evidence->>'errorManifestSha256','') !~ '^[0-9a-f]{64}$'
  THEN RAISE EXCEPTION 'candidate_financial_fact_scope_shape_invalid'; END IF;
  v_acceptance:=p_evidence->'factAcceptance'; v_manifest:=p_evidence->'validatedFacts'; v_validation:=p_evidence->'validation';
  IF jsonb_typeof(v_acceptance) IS DISTINCT FROM 'object' OR jsonb_typeof(v_manifest) IS DISTINCT FROM 'array'
    OR jsonb_array_length(v_manifest)>200 OR jsonb_typeof(v_validation) IS DISTINCT FROM 'object'
    OR ((p_has_facts OR jsonb_array_length(v_manifest)>0 OR p_evidence->>'documentStatus'='complete')
      AND (p_content_type IS NULL OR p_content_type NOT IN ('application/xml','text/xml','text/html','application/xhtml+xml')))
    OR v_acceptance->>'policyVersion' IS DISTINCT FROM 'arelle-fact-scope-v1'
    OR v_acceptance->>'documentSha256' IS DISTINCT FROM p_evidence->>'documentSha256'
    OR v_acceptance->>'taxonomySha256' IS DISTINCT FROM p_evidence->>'taxonomySha256'
    OR NOT (v_acceptance ? 'extractedInstanceSha256')
    OR (jsonb_typeof(v_acceptance->'extractedInstanceSha256') IS DISTINCT FROM 'null'
      AND COALESCE(v_acceptance->>'extractedInstanceSha256','') !~ '^[0-9a-f]{64}$')
    OR (p_content_type IN ('text/html','application/xhtml+xml')
      AND (p_has_facts OR jsonb_array_length(v_manifest)>0 OR p_evidence->>'documentStatus'='complete')
      AND COALESCE(v_acceptance->>'extractedInstanceSha256','') !~ '^[0-9a-f]{64}$')
    OR jsonb_typeof(v_acceptance->'sourceValidationCompleted') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(v_acceptance->'extractedValidationCompleted') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(v_acceptance->'manifestComplete') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(v_acceptance->'documentFatal') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(v_acceptance->'errors') IS DISTINCT FROM 'array'
    OR jsonb_array_length(v_acceptance->'errors')>16384
    OR jsonb_typeof(v_acceptance->'rejections') IS DISTINCT FROM 'array'
    OR jsonb_array_length(v_acceptance->'rejections')>20000
  THEN RAISE EXCEPTION 'candidate_financial_fact_scope_acceptance_invalid'; END IF;
  IF encode(digest(convert_to(public.candidate_financial_canonical_json_v10(v_acceptance),'utf8'),'sha256'),'hex')
    IS DISTINCT FROM p_evidence->>'errorManifestSha256'
  THEN RAISE EXCEPTION 'candidate_financial_error_manifest_hash_mismatch'; END IF;
  v_extracted_ready:=CASE WHEN v_acceptance->'extractedInstanceSha256'='null'::jsonb
    THEN v_acceptance->'extractedValidationCompleted'='false'::jsonb
    ELSE v_acceptance->'extractedValidationCompleted'='true'::jsonb END;
  v_error_count:=jsonb_array_length(v_acceptance->'errors');
  IF jsonb_typeof(v_validation->'errorCount') IS DISTINCT FROM 'number'
    OR (v_validation->>'errorCount')::numeric<0
    OR (v_validation->>'errorCount')::numeric>9007199254740991
    OR (v_validation->>'errorCount')::numeric<>trunc((v_validation->>'errorCount')::numeric)
    OR jsonb_typeof(v_validation->'validFactCount') IS DISTINCT FROM 'number'
    OR (v_validation->>'validFactCount')::numeric<>jsonb_array_length(v_manifest)
    OR jsonb_typeof(v_validation->'errorsTruncated') IS DISTINCT FROM 'boolean'
    OR NOT ((v_validation->'errorsTruncated'='false'::jsonb AND (v_validation->>'errorCount')::numeric=v_error_count)
      OR (NOT p_has_facts AND jsonb_array_length(v_manifest)=0
        AND v_acceptance->'manifestComplete'='false'::jsonb AND v_validation->'errorsTruncated'='true'::jsonb
        AND (v_validation->>'errorCount')::numeric>=v_error_count AND p_evidence->>'documentStatus'='partial'))
    OR ((v_validation->>'errorCount')::numeric>0 AND p_evidence->>'documentStatus'<>'partial')
  THEN RAISE EXCEPTION 'candidate_financial_fact_scope_summary_invalid'; END IF;
  FOR v_error IN SELECT value FROM jsonb_array_elements(v_acceptance->'errors') LOOP
    IF jsonb_typeof(v_error) IS DISTINCT FROM 'object'
      OR v_error->>'phase' IS NULL OR v_error->>'phase' NOT IN ('source','extracted')
      OR jsonb_typeof(v_error->'code') IS DISTINCT FROM 'string' OR char_length(v_error->>'code') NOT BETWEEN 1 AND 256
      OR jsonb_typeof(v_error->'fatal') IS DISTINCT FROM 'boolean'
      OR jsonb_typeof(v_error->'refs') IS DISTINCT FROM 'array' OR jsonb_array_length(v_error->'refs')>4096
    THEN RAISE EXCEPTION 'candidate_financial_fact_scope_error_invalid'; END IF;
    v_usable:=false;
    FOR v_ref IN SELECT value FROM jsonb_array_elements(v_error->'refs') LOOP
      IF jsonb_typeof(v_ref) IS DISTINCT FROM 'object' OR jsonb_typeof(v_ref->'href') IS DISTINCT FROM 'string'
        OR char_length(v_ref->>'href') NOT BETWEEN 1 AND 2048
        OR (v_ref ? 'objectId' AND (jsonb_typeof(v_ref->'objectId') IS DISTINCT FROM 'string'
          OR char_length(v_ref->>'objectId') NOT BETWEEN 1 AND 256))
        OR (v_ref ? 'xpath' AND (jsonb_typeof(v_ref->'xpath') IS DISTINCT FROM 'string'
          OR char_length(v_ref->>'xpath') NOT BETWEEN 1 AND 4096 OR COALESCE(v_ref->>'objectId','')=''))
        OR (v_ref ? 'sourceLine' AND (jsonb_typeof(v_ref->'sourceLine') IS DISTINCT FROM 'number'
          OR (v_ref->>'sourceLine')::numeric<1 OR (v_ref->>'sourceLine')::numeric>9007199254740991
          OR (v_ref->>'sourceLine')::numeric<>trunc((v_ref->>'sourceLine')::numeric)))
      THEN RAISE EXCEPTION 'candidate_financial_fact_scope_ref_invalid'; END IF;
      IF COALESCE(v_ref->>'objectId','')<>'' THEN v_usable:=true; END IF;
    END LOOP;
    IF (NOT v_usable OR v_error->>'code' NOT IN (
      'lxml.SCHEMAV_ELEMENT_CONTENT','xmlSchema:elementOccurrencesError','xmlSchema:valueError',
      'ix11.15.1.2:tupleMemberOrderMissing','ix11.11.1.2:tupleMemberOrderMissing','ix11.10.1.2:tupleMemberOrderMissing',
      'ix:tupleContent','xbrldie:PrimaryItemDimensionallyInvalidError','xbrl.5.2.5.2:calcInconsistency',
      'stockinsider:conflictingFactDuplicates'))
      AND v_error->'fatal' IS DISTINCT FROM 'true'::jsonb
    THEN RAISE EXCEPTION 'candidate_financial_unscoped_error_must_be_fatal'; END IF;
    v_has_fatal:=v_has_fatal OR (v_error->>'fatal')::boolean;
  END LOOP;
  IF (v_acceptance->>'documentFatal')::boolean IS DISTINCT FROM v_has_fatal
  THEN RAISE EXCEPTION 'candidate_financial_document_fatal_mismatch'; END IF;
  FOR v_rejection IN SELECT value FROM jsonb_array_elements(v_acceptance->'rejections') LOOP
    IF jsonb_typeof(v_rejection) IS DISTINCT FROM 'object' OR COALESCE(v_rejection->>'factKey','') !~ '^[0-9a-f]{64}$'
      OR jsonb_typeof(v_rejection->'errorIndexes') IS DISTINCT FROM 'array'
      OR jsonb_array_length(v_rejection->'errorIndexes')=0 OR jsonb_array_length(v_rejection->'errorIndexes')>v_error_count
    THEN RAISE EXCEPTION 'candidate_financial_fact_rejection_invalid'; END IF;
    v_indexes:='{}'::integer[];
    FOR v_index IN SELECT value FROM jsonb_array_elements(v_rejection->'errorIndexes') LOOP
      IF jsonb_typeof(v_index) IS DISTINCT FROM 'number' OR (v_index #>> '{}')::numeric<>trunc((v_index #>> '{}')::numeric)
        OR (v_index #>> '{}')::numeric<0 OR (v_index #>> '{}')::numeric>=v_error_count
        OR (v_index #>> '{}')::integer=ANY(v_indexes)
      THEN RAISE EXCEPTION 'candidate_financial_fact_rejection_index_invalid'; END IF;
      v_indexes:=array_append(v_indexes,(v_index #>> '{}')::integer);
    END LOOP;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_manifest) manifest(row) WHERE manifest.row->>'factKey'=v_rejection->>'factKey')
    THEN RAISE EXCEPTION 'candidate_financial_rejected_fact_emitted'; END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_acceptance->'rejections') rejection(row)
    GROUP BY rejection.row->>'factKey' HAVING count(*)>1)
  THEN RAISE EXCEPTION 'candidate_financial_fact_rejection_duplicate'; END IF;
  FOR v_fact IN SELECT value FROM jsonb_array_elements(v_manifest) LOOP
    IF jsonb_typeof(v_fact) IS DISTINCT FROM 'object'
      OR jsonb_typeof(v_fact->'xbrl_context') IS DISTINCT FROM 'string' OR char_length(v_fact->>'xbrl_context') NOT BETWEEN 1 AND 256
      OR jsonb_typeof(v_fact->'xbrl_concept') IS DISTINCT FROM 'string' OR char_length(v_fact->>'xbrl_concept') NOT BETWEEN 1 AND 256
      OR jsonb_typeof(v_fact->'value') IS DISTINCT FROM 'string' OR char_length(v_fact->>'value') NOT BETWEEN 1 AND 128
      OR v_fact->>'value' !~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]+)?$'
      OR v_fact->>'unit' IS NULL OR v_fact->>'unit' NOT IN ('TWD','TWD_per_share','share')
      OR jsonb_typeof(v_fact->'entity_identifier') IS DISTINCT FROM 'string'
      OR v_fact->>'entity_identifier' !~ '^[0-9]{4,6}$'
      OR jsonb_typeof(v_fact->'period_end') IS DISTINCT FROM 'string' OR v_fact->>'period_end' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      OR NOT (v_fact ? 'period_start')
      OR v_fact->>'duration_kind' IS NULL OR v_fact->>'duration_kind' NOT IN ('quarterly','instant')
      OR (v_fact->>'duration_kind'='instant' AND v_fact->'period_start' IS DISTINCT FROM 'null'::jsonb)
      OR (v_fact->>'duration_kind'='quarterly' AND (jsonb_typeof(v_fact->'period_start') IS DISTINCT FROM 'string'
        OR v_fact->>'period_start' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        OR (v_fact->>'period_start')::date>(v_fact->>'period_end')::date))
      OR COALESCE(v_fact->>'factKey','') !~ '^[0-9a-f]{64}$'
      OR v_fact->>'xValid' IS DISTINCT FROM 'VALID'
      OR v_fact->>'structuralStatus' IS DISTINCT FROM 'structurally_validated'
      OR jsonb_typeof(v_fact->'sourceFactId') IS DISTINCT FROM 'string' OR char_length(v_fact->>'sourceFactId') NOT BETWEEN 1 AND 256
      OR v_fact->>'sourceFactId' !~ '^source:[0-9]+$'
      OR jsonb_typeof(v_fact->'extractedFactId') IS DISTINCT FROM 'string' OR char_length(v_fact->>'extractedFactId') NOT BETWEEN 1 AND 256
      OR (v_acceptance->'extractedInstanceSha256'='null'::jsonb AND v_fact->>'extractedFactId' IS DISTINCT FROM v_fact->>'sourceFactId')
      OR (v_acceptance->'extractedInstanceSha256'<>'null'::jsonb AND v_fact->>'extractedFactId' !~ '^extracted:[0-9]+$')
      OR jsonb_typeof(v_fact->'concept_namespace') IS DISTINCT FROM 'string' OR char_length(v_fact->>'concept_namespace') NOT BETWEEN 1 AND 512
      OR v_fact->>'concept_namespace' !~ '^[A-Za-z][A-Za-z0-9+.-]*:'
      OR jsonb_typeof(v_fact->'dimension_count') IS DISTINCT FROM 'number' OR (v_fact->>'dimension_count')::numeric<>0
    THEN RAISE EXCEPTION 'candidate_financial_structural_fact_invalid'; END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_manifest) manifest(row) GROUP BY manifest.row->>'factKey' HAVING count(*)>1)
  THEN RAISE EXCEPTION 'candidate_financial_structural_fact_duplicate'; END IF;
  IF (p_has_facts OR jsonb_array_length(v_manifest)>0) AND (
    v_has_fatal OR v_acceptance->'sourceValidationCompleted' IS DISTINCT FROM 'true'::jsonb
      OR NOT v_extracted_ready
      OR v_acceptance->'manifestComplete' IS DISTINCT FROM 'true'::jsonb)
  THEN RAISE EXCEPTION 'candidate_financial_fact_scope_not_ready'; END IF;
  IF p_evidence->>'documentStatus'='complete' AND (
    v_has_fatal OR v_error_count<>0 OR v_acceptance->'sourceValidationCompleted' IS DISTINCT FROM 'true'::jsonb
    OR NOT v_extracted_ready
    OR v_acceptance->'manifestComplete' IS DISTINCT FROM 'true'::jsonb)
  THEN RAISE EXCEPTION 'candidate_financial_document_complete_invalid'; END IF;
  RETURN true;
END; $function$;

CREATE OR REPLACE FUNCTION public.candidate_financial_parser_document_ready_v10(
  p_evidence_id uuid,p_receipt_id uuid,p_document_sha256 text
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $function$
  SELECT COALESCE((SELECT evidence.parser='arelle' AND evidence.parser_version='2.44.7'
    AND evidence.taxonomy_sha256='4e44e67647b1a5a575d416ef44614d9c5651bb0d895621e12f6b6ca64a457869'
    AND evidence.validation_summary->'errorCount'='0'::jsonb
    AND evidence.validation_summary->'errorsTruncated'='false'::jsonb
    AND evidence.validation_summary->'validFactCount'=to_jsonb(jsonb_array_length(evidence.validated_fact_manifest))
    AND (evidence.evidence_schema_version IS NULL OR (
      evidence.evidence_schema_version=10 AND evidence.document_status='complete'
      AND evidence.fact_acceptance->'sourceValidationCompleted'='true'::jsonb
      AND CASE WHEN evidence.fact_acceptance->'extractedInstanceSha256'='null'::jsonb
        THEN evidence.fact_acceptance->'extractedValidationCompleted'='false'::jsonb
        ELSE evidence.fact_acceptance->'extractedValidationCompleted'='true'::jsonb END
      AND evidence.fact_acceptance->'manifestComplete'='true'::jsonb
      AND evidence.fact_acceptance->'documentFatal'='false'::jsonb
      AND evidence.fact_acceptance->'errors'='[]'::jsonb))
    FROM public.candidate_financial_parser_evidence_v8 evidence
    WHERE evidence.evidence_id=p_evidence_id AND evidence.receipt_id=p_receipt_id
      AND evidence.document_sha256=p_document_sha256),false);
$function$;

-- This also covers the unchanged v8 accounting finalizer and direct service
-- writes: accounting-valid facts are not proof of a structurally valid document.
CREATE OR REPLACE FUNCTION public.guard_financial_document_full_readiness_v10()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $function$
BEGIN
  IF NEW.parser_status='complete' AND NEW.receipt_status='accepted'
    AND NOT public.candidate_financial_parser_document_ready_v10(NEW.parser_evidence_id,NEW.receipt_id,NEW.document_sha256)
  THEN
    NEW.receipt_status:='partial';
    IF NOT (NEW.missing_requirements ? 'document_structural_validation_incomplete') THEN
      NEW.missing_requirements:=NEW.missing_requirements||jsonb_build_array('document_structural_validation_incomplete');
    END IF;
  END IF;
  RETURN NEW;
END; $function$;
DROP TRIGGER IF EXISTS guard_financial_document_full_readiness_v10 ON public.candidate_financial_document_receipts_v6;
CREATE TRIGGER guard_financial_document_full_readiness_v10 BEFORE INSERT OR UPDATE
  ON public.candidate_financial_document_receipts_v6 FOR EACH ROW
  EXECUTE FUNCTION public.guard_financial_document_full_readiness_v10();

CREATE OR REPLACE FUNCTION public.candidate_financial_fact_has_structural_proof_v10(
  p_fact_id uuid,p_recorded_at timestamptz,p_source_sha256 text
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.opportunity_financial_facts_v3 fact
    JOIN public.stocks stock ON stock.id=fact.stock_id
    JOIN public.candidate_financial_document_fact_links_v8 link ON link.fact_id=fact.fact_id AND link.fact_recorded_at=fact.recorded_at
    JOIN public.candidate_financial_document_receipts_v6 receipt ON receipt.receipt_id=link.receipt_id
      AND receipt.stock_id=fact.stock_id AND receipt.period_end=fact.period_end AND receipt.document_sha256=p_source_sha256
    JOIN public.candidate_financial_parser_evidence_v8 evidence ON evidence.evidence_id=link.evidence_id
      AND evidence.receipt_id=receipt.receipt_id AND evidence.document_sha256=p_source_sha256
    JOIN public.candidate_financial_fact_provenance_v4 provenance ON provenance.fact_id=fact.fact_id
      AND provenance.source_sha256=p_source_sha256
      AND provenance.locator->>'parser_evidence_id'=evidence.evidence_id::text
      AND provenance.locator->>'manifest_sha256'=evidence.manifest_sha256
    CROSS JOIN LATERAL jsonb_array_elements(evidence.validated_fact_manifest) manifest(row)
    WHERE fact.fact_id=p_fact_id AND fact.recorded_at=p_recorded_at
      AND fact.provider='mops' AND fact.authority_tier='official_filing'
      AND fact.source_ref LIKE 'issuer-document:'||p_source_sha256||':%'
      AND evidence.parser='arelle' AND evidence.parser_version='2.44.7'
      AND evidence.taxonomy_sha256='4e44e67647b1a5a575d416ef44614d9c5651bb0d895621e12f6b6ca64a457869'
      AND manifest.row->>'xbrl_context'=provenance.locator->>'xbrl_context'
      AND manifest.row->>'xbrl_concept'=provenance.locator->>'xbrl_concept'
      AND manifest.row->>'unit'=fact.unit::text AND (manifest.row->>'value')::numeric=fact.value
      AND manifest.row->>'entity_identifier'=stock.symbol
      AND (manifest.row->>'period_start')::date IS NOT DISTINCT FROM fact.period_start
      AND (manifest.row->>'period_end')::date=fact.period_end
      AND manifest.row->>'duration_kind'=fact.duration_kind::text
      AND manifest.row->'dimension_count'='0'::jsonb
      AND ((evidence.evidence_schema_version IS NULL
        AND public.candidate_financial_parser_document_ready_v10(evidence.evidence_id,receipt.receipt_id,p_source_sha256))
        OR (evidence.evidence_schema_version=10
          AND evidence.fact_acceptance->'sourceValidationCompleted'='true'::jsonb
          AND CASE WHEN evidence.fact_acceptance->'extractedInstanceSha256'='null'::jsonb
            THEN evidence.fact_acceptance->'extractedValidationCompleted'='false'::jsonb
            ELSE evidence.fact_acceptance->'extractedValidationCompleted'='true'::jsonb END
          AND evidence.fact_acceptance->'manifestComplete'='true'::jsonb
          AND evidence.fact_acceptance->'documentFatal'='false'::jsonb
          AND manifest.row->>'xValid'='VALID' AND manifest.row->>'structuralStatus'='structurally_validated'
          AND manifest.row->>'factKey'=provenance.locator->>'structural_fact_key'
          AND manifest.row->>'concept_namespace'=provenance.locator->>'concept_namespace'
          AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(evidence.fact_acceptance->'rejections') rejected(row)
            WHERE rejected.row->>'factKey'=manifest.row->>'factKey')))
  );
$function$;

-- An unchanged accounting hash must not grandfather an unproven issuer row.
-- Keep every structural join at the evaluation cutoff: an unrelated old link
-- must never borrow a newly available proof for the same fact/document hash.
CREATE OR REPLACE FUNCTION public.candidate_financial_fact_has_structural_proof_as_of_v10(
  p_fact_id uuid,p_recorded_at timestamptz,p_source_sha256 text,p_cutoff timestamptz
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.opportunity_financial_facts_v3 fact
    JOIN public.stocks stock ON stock.id=fact.stock_id
    JOIN public.candidate_financial_document_fact_links_v8 link ON link.fact_id=fact.fact_id AND link.fact_recorded_at=fact.recorded_at
    JOIN public.candidate_financial_document_receipts_v6 receipt ON receipt.receipt_id=link.receipt_id
      AND receipt.stock_id=fact.stock_id AND receipt.period_end=fact.period_end AND receipt.document_sha256=p_source_sha256
    JOIN public.candidate_financial_parser_evidence_v8 evidence ON evidence.evidence_id=link.evidence_id
      AND evidence.receipt_id=receipt.receipt_id AND evidence.document_sha256=p_source_sha256
    JOIN public.candidate_financial_fact_provenance_v4 provenance ON provenance.fact_id=fact.fact_id
      AND provenance.source_sha256=p_source_sha256
      AND provenance.locator->>'parser_evidence_id'=evidence.evidence_id::text
      AND provenance.locator->>'manifest_sha256'=evidence.manifest_sha256
    CROSS JOIN LATERAL jsonb_array_elements(evidence.validated_fact_manifest) manifest(row)
    WHERE fact.fact_id=p_fact_id AND fact.recorded_at=p_recorded_at
      AND fact.filing_published_at<=p_cutoff AND fact.source_timestamp<=p_cutoff
      AND fact.collected_at<=p_cutoff AND fact.recorded_at<=p_cutoff
      AND evidence.recorded_at<=p_cutoff AND link.created_at<=p_cutoff
      AND provenance.extracted_at<=p_cutoff AND provenance.recorded_at<=p_cutoff
      AND receipt.accepted_at<=p_cutoff AND receipt.completed_at<=p_cutoff
      AND (receipt.published_at IS NULL OR receipt.published_at<=p_cutoff)
      AND fact.provider='mops' AND fact.authority_tier='official_filing'
      AND fact.source_ref LIKE 'issuer-document:'||p_source_sha256||':%'
      AND evidence.parser='arelle' AND evidence.parser_version='2.44.7'
      AND evidence.taxonomy_sha256='4e44e67647b1a5a575d416ef44614d9c5651bb0d895621e12f6b6ca64a457869'
      AND manifest.row->>'xbrl_context'=provenance.locator->>'xbrl_context'
      AND manifest.row->>'xbrl_concept'=provenance.locator->>'xbrl_concept'
      AND manifest.row->>'unit'=fact.unit::text AND (manifest.row->>'value')::numeric=fact.value
      AND manifest.row->>'entity_identifier'=stock.symbol
      AND (manifest.row->>'period_start')::date IS NOT DISTINCT FROM fact.period_start
      AND (manifest.row->>'period_end')::date=fact.period_end
      AND manifest.row->>'duration_kind'=fact.duration_kind::text
      AND manifest.row->'dimension_count'='0'::jsonb
      AND ((evidence.evidence_schema_version IS NULL
        AND public.candidate_financial_parser_document_ready_v10(evidence.evidence_id,receipt.receipt_id,p_source_sha256))
        OR (evidence.evidence_schema_version=10
          AND evidence.fact_acceptance->'sourceValidationCompleted'='true'::jsonb
          AND CASE WHEN evidence.fact_acceptance->'extractedInstanceSha256'='null'::jsonb
            THEN evidence.fact_acceptance->'extractedValidationCompleted'='false'::jsonb
            ELSE evidence.fact_acceptance->'extractedValidationCompleted'='true'::jsonb END
          AND evidence.fact_acceptance->'manifestComplete'='true'::jsonb
          AND evidence.fact_acceptance->'documentFatal'='false'::jsonb
          AND manifest.row->>'xValid'='VALID' AND manifest.row->>'structuralStatus'='structurally_validated'
          AND manifest.row->>'factKey'=provenance.locator->>'structural_fact_key'
          AND manifest.row->>'concept_namespace'=provenance.locator->>'concept_namespace'
          AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(evidence.fact_acceptance->'rejections') rejected(row)
            WHERE rejected.row->>'factKey'=manifest.row->>'factKey')))
  );
$function$;

CREATE OR REPLACE FUNCTION public.complete_candidate_financial_document_receipt_parser_v10(
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
  IF jsonb_typeof(p_facts) IS DISTINCT FROM 'array' OR jsonb_array_length(COALESCE(p_facts,'[]'::jsonb))>128
    OR jsonb_typeof(p_parser_locators) IS DISTINCT FROM 'array' OR jsonb_array_length(COALESCE(p_parser_locators,'[]'::jsonb))>200
    OR jsonb_typeof(COALESCE(p_parser_evidence,'null'::jsonb))<>'object'
    OR p_parser_evidence->>'schema' IS DISTINCT FROM 'candidate-financial-parser-evidence-v10'
    OR jsonb_typeof(COALESCE(p_parser_evidence->'validatedFacts','null'::jsonb))<>'array'
    OR jsonb_array_length(p_parser_evidence->'validatedFacts')>200
    OR jsonb_typeof(p_missing_requirements) IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_rejection_reasons) IS DISTINCT FROM 'array'
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
  PERFORM public.validate_candidate_financial_fact_scope_v10(p_parser_evidence,v_receipt.content_type,jsonb_array_length(p_facts)>0);

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
    validated_fact_manifest,manifest_sha256,recorded_at,evidence_schema_version,document_status,fact_acceptance,error_manifest_sha256
  ) VALUES(p_receipt_id,v_receipt.document_sha256,v_parser,NULLIF(p_parser_evidence->>'parserVersion',''),
    NULLIF(p_parser_evidence->>'taxonomySha256',''),v_validation,v_manifest,v_manifest_sha,p_completed_at,10,p_parser_evidence->>'documentStatus',
    p_parser_evidence->'factAcceptance',p_parser_evidence->>'errorManifestSha256')
  ON CONFLICT(receipt_id,manifest_sha256) DO NOTHING RETURNING evidence_id INTO v_evidence_id;
  IF v_evidence_id IS NULL THEN
    SELECT evidence_id INTO v_evidence_id FROM public.candidate_financial_parser_evidence_v8
      WHERE receipt_id=p_receipt_id AND manifest_sha256=v_manifest_sha;
  END IF;

  FOR v_fact IN SELECT value FROM jsonb_array_elements(p_facts) LOOP
    IF (v_fact #>> '{input,stock_id}')::uuid IS DISTINCT FROM v_receipt.stock_id
      OR (v_fact #>> '{input,period_end}')::date IS DISTINCT FROM v_receipt.period_end
      OR (v_fact #>> '{input,provider}') IS DISTINCT FROM 'mops'
      OR (v_fact #>> '{input,authority_tier}') IS DISTINCT FROM 'official_filing'
      OR COALESCE(v_fact #>> '{input,source_ref}','') !~ ('^issuer-document:'||v_receipt.document_sha256||':')
      OR jsonb_typeof(COALESCE(v_fact->'locator','null'::jsonb))<>'object'
      OR NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_manifest) manifest(row)
        JOIN public.stocks stock ON stock.id=v_receipt.stock_id
        WHERE manifest.row->>'factKey'=v_fact #>> '{locator,structural_fact_key}'
          AND manifest.row->>'concept_namespace'=v_fact #>> '{locator,concept_namespace}'
          AND manifest.row->>'xbrl_context'=v_fact #>> '{locator,xbrl_context}'
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

  IF p_parser_evidence->>'documentStatus'='partial' AND NOT (p_missing_requirements ? 'document_structural_validation_incomplete') THEN
    p_missing_requirements:=COALESCE(p_missing_requirements,'[]'::jsonb)||jsonb_build_array('document_structural_validation_incomplete');
  END IF;
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
    AND jsonb_array_length(missing_fact_keys)=0
    AND public.candidate_financial_parser_document_ready_v10(v_receipt.parser_evidence_id,v_receipt.receipt_id,v_receipt.document_sha256);
  RETURN NEXT;
END; $function$;

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
  IF v_fact.source_ref LIKE 'issuer-document:%'
    AND NOT public.candidate_financial_fact_has_structural_proof_v10(p_fact_id,p_recorded_at,p_source_sha256)
  THEN RAISE EXCEPTION 'official_validation_structural_proof_missing'; END IF;
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

CREATE OR REPLACE FUNCTION public.read_financial_facts_as_of(p_cutoff timestamptz)
RETURNS SETOF public.opportunity_financial_facts_v3 LANGUAGE sql STABLE SECURITY INVOKER
SET search_path=public,pg_temp AS $asof$
  SELECT (jsonb_populate_record(NULL::public.opportunity_financial_facts_v3,
    to_jsonb(f) || CASE
      WHEN latest.id IS NOT NULL THEN COALESCE(latest.effective_validation,
        '{"validation_status":"pending","schema_valid":false,"unit_valid":false,"point_in_time_valid":false,"consistency_valid":false}'::jsonb)
      WHEN first_receipt.id IS NOT NULL THEN COALESCE(first_receipt.prior_validation,
        '{"validation_status":"pending","schema_valid":false,"unit_valid":false,"point_in_time_valid":false,"consistency_valid":false}'::jsonb)
      ELSE '{}'::jsonb END)).*
  FROM public.opportunity_financial_facts_v3 f
  LEFT JOIN LATERAL (SELECT r.id,r.effective_validation FROM public.official_financial_validation_receipts r
    WHERE r.fact_id=f.fact_id AND r.validated_at<=p_cutoff
    ORDER BY r.validated_at DESC,r.receipt_sequence DESC LIMIT 1) latest ON true
  LEFT JOIN LATERAL (SELECT r.id,r.prior_validation FROM public.official_financial_validation_receipts r
    WHERE r.fact_id=f.fact_id ORDER BY r.validated_at,r.receipt_sequence LIMIT 1) first_receipt ON true
  WHERE f.recorded_at<=p_cutoff
    AND (COALESCE(f.source_ref,'') NOT LIKE 'issuer-document:%'
      OR public.candidate_financial_fact_has_structural_proof_as_of_v10(f.fact_id,f.recorded_at,
        substring(f.source_ref from '^issuer-document:([0-9a-f]{64}):'),p_cutoff))
$asof$;

REVOKE ALL ON FUNCTION public.candidate_financial_fact_has_structural_proof_as_of_v10(uuid,timestamptz,text,timestamptz),
  public.read_financial_facts_as_of(timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.candidate_financial_fact_has_structural_proof_as_of_v10(uuid,timestamptz,text,timestamptz),
  public.read_financial_facts_as_of(timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.candidate_financial_canonical_json_v10(jsonb),
  public.reject_financial_parser_evidence_mutation_v10(),
  public.validate_candidate_financial_fact_scope_v10(jsonb,text,boolean),
  public.candidate_financial_parser_document_ready_v10(uuid,uuid,text),
  public.guard_financial_document_full_readiness_v10(),
  public.candidate_financial_fact_has_structural_proof_v10(uuid,timestamptz,text),
  public.candidate_financial_document_job_evidence_v9(uuid,uuid,date,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.complete_candidate_financial_document_receipt_parser_v10(
  uuid,text,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,timestamptz),
  public.record_official_financial_validation(uuid,timestamptz,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_candidate_financial_document_receipt_parser_v10(
  uuid,text,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,timestamptz),
  public.record_official_financial_validation(uuid,timestamptz,text,text,jsonb) TO service_role;
COMMIT;
