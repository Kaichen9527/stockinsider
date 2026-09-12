\set ON_ERROR_STOP on

-- Compact-cutover materializer.  Unlike the general lossless materializer,
-- processing outcomes are intentionally kept only in the verified cold backup
-- plus run/job/diagnostic summaries.  The four byte-bearing relations required
-- by compatibility readers are deduplicated online.
DO $guard$
BEGIN
  IF inet_server_addr() IS NOT NULL
    OR current_user <> 'stockinsider_rehearsal'
    OR current_setting('data_directory') !~ '^/private/tmp/stockinsider-contabo-restore-[A-Za-z0-9]+/data$' THEN
    RAISE EXCEPTION 'compact_materialization_requires_private_local_restore';
  END IF;
END;
$guard$;

BEGIN;
SET LOCAL synchronous_commit=off;

INSERT INTO public.retention_legacy_content_objects_v2(content_hash,canonical_bytes,plaintext_bytes,recorded_at)
SELECT content_hash,canonical_bytes,octet_length(canonical_bytes),min(recorded_at) FROM (
  SELECT payload_hash content_hash,payload_canonical canonical_bytes,recorded_at
    FROM public.legacy_producer_job_payloads_v3_11
  UNION ALL SELECT result_hash,result_canonical,recorded_at FROM public.legacy_producer_job_results_v3_11
  UNION ALL SELECT page_hash,page_canonical,recorded_at FROM public.legacy_producer_authority_pages_v3_11
  UNION ALL SELECT selected_revision_row_hash,selected_revision_row_canonical,recorded_at
    FROM public.legacy_frozen_source_revisions_v3_11
) content GROUP BY content_hash,canonical_bytes
ON CONFLICT(content_hash) DO NOTHING;

DO $collision$
BEGIN
  IF EXISTS (
    SELECT 1 FROM (
      SELECT payload_hash content_hash,payload_canonical canonical_bytes FROM public.legacy_producer_job_payloads_v3_11
      UNION ALL SELECT result_hash,result_canonical FROM public.legacy_producer_job_results_v3_11
      UNION ALL SELECT page_hash,page_canonical FROM public.legacy_producer_authority_pages_v3_11
      UNION ALL SELECT selected_revision_row_hash,selected_revision_row_canonical FROM public.legacy_frozen_source_revisions_v3_11
    ) source JOIN public.retention_legacy_content_objects_v2 object USING(content_hash)
    WHERE source.canonical_bytes IS DISTINCT FROM object.canonical_bytes
  ) THEN RAISE EXCEPTION 'compact_materialization_hash_collision'; END IF;
END;
$collision$;

INSERT INTO public.retention_legacy_job_payload_refs_v2(job_id,content_hash,recorded_at)
SELECT job_id,payload_hash,recorded_at FROM public.legacy_producer_job_payloads_v3_11 ON CONFLICT DO NOTHING;
INSERT INTO public.retention_legacy_job_result_refs_v2(job_id,content_hash,recorded_at)
SELECT job_id,result_hash,recorded_at FROM public.legacy_producer_job_results_v3_11 ON CONFLICT DO NOTHING;
INSERT INTO public.retention_legacy_authority_page_refs_v2
SELECT run_id,page_kind,page_ordinal,first_row_ordinal,row_count,page_hash,recorded_at
FROM public.legacy_producer_authority_pages_v3_11 ON CONFLICT DO NOTHING;
INSERT INTO public.retention_legacy_frozen_revision_refs_v2
SELECT run_id,selection_ordinal,source_key,revision_id,selected_revision_row_hash,
  raw_field_payload_algorithm_version,ingestion_content_revision_sha256,
  canonical_content_algorithm_version,canonical_content_sha256,recorded_at
FROM public.legacy_frozen_source_revisions_v3_11 ON CONFLICT DO NOTHING;

DO $verify$
BEGIN
  IF (SELECT count(*) FROM public.retention_legacy_job_payload_refs_v2)
      IS DISTINCT FROM (SELECT count(*) FROM public.legacy_producer_job_payloads_v3_11)
    OR (SELECT count(*) FROM public.retention_legacy_job_result_refs_v2)
      IS DISTINCT FROM (SELECT count(*) FROM public.legacy_producer_job_results_v3_11)
    OR (SELECT count(*) FROM public.retention_legacy_authority_page_refs_v2)
      IS DISTINCT FROM (SELECT count(*) FROM public.legacy_producer_authority_pages_v3_11)
    OR (SELECT count(*) FROM public.retention_legacy_frozen_revision_refs_v2)
      IS DISTINCT FROM (SELECT count(*) FROM public.legacy_frozen_source_revisions_v3_11) THEN
    RAISE EXCEPTION 'compact_materialization_reference_count_mismatch';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.retention_legacy_job_payload_refs_v2 ref
    JOIN public.retention_legacy_content_objects_v2 object USING(content_hash)
    JOIN public.legacy_producer_job_payloads_v3_11 source USING(job_id)
    WHERE object.canonical_bytes IS DISTINCT FROM source.payload_canonical
  ) OR EXISTS (
    SELECT 1 FROM public.retention_legacy_job_result_refs_v2 ref
    JOIN public.retention_legacy_content_objects_v2 object USING(content_hash)
    JOIN public.legacy_producer_job_results_v3_11 source USING(job_id)
    WHERE object.canonical_bytes IS DISTINCT FROM source.result_canonical
  ) OR EXISTS (
    SELECT 1 FROM public.retention_legacy_authority_page_refs_v2 ref
    JOIN public.retention_legacy_content_objects_v2 object USING(content_hash)
    JOIN public.legacy_producer_authority_pages_v3_11 source USING(run_id,page_kind,page_ordinal)
    WHERE object.canonical_bytes IS DISTINCT FROM source.page_canonical
  ) OR EXISTS (
    SELECT 1 FROM public.retention_legacy_frozen_revision_refs_v2 ref
    JOIN public.retention_legacy_content_objects_v2 object USING(content_hash)
    JOIN public.legacy_frozen_source_revisions_v3_11 source USING(run_id,selection_ordinal)
    WHERE object.canonical_bytes IS DISTINCT FROM source.selected_revision_row_canonical
  ) THEN RAISE EXCEPTION 'compact_materialization_round_trip_mismatch'; END IF;
END;
$verify$;

COMMIT;

SELECT json_build_object(
  'contentObjects',(SELECT count(*) FROM public.retention_legacy_content_objects_v2),
  'contentBytes',(SELECT coalesce(sum(plaintext_bytes),0) FROM public.retention_legacy_content_objects_v2),
  'payloadRefs',(SELECT count(*) FROM public.retention_legacy_job_payload_refs_v2),
  'resultRefs',(SELECT count(*) FROM public.retention_legacy_job_result_refs_v2),
  'authorityPageRefs',(SELECT count(*) FROM public.retention_legacy_authority_page_refs_v2),
  'frozenRevisionRefs',(SELECT count(*) FROM public.retention_legacy_frozen_revision_refs_v2),
  'processingOutcomeRefs',0,
  'processingOutcomesColdOnly',TRUE
);
