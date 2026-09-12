\set ON_ERROR_STOP on

-- This script is a local restore-only compaction rehearsal.  It preserves the
-- newest seven days of all legacy runtime detail and the newest successful
-- run.  Older terminal failures retain their run/job/diagnostic summaries while
-- their immutable payload bytes remain in
-- the authenticated source backup; content used by compatibility readers is
-- kept online once per hash.  High-cardinality processing outcomes are cold
-- archived and represented by this receipt instead of duplicated online.
DO $guard$
BEGIN
  IF inet_server_addr() IS NOT NULL
    OR current_user <> 'stockinsider_rehearsal'
    OR current_setting('data_directory') !~ '^/private/tmp/stockinsider-contabo-restore-[A-Za-z0-9]+/data$' THEN
    RAISE EXCEPTION 'legacy_compaction_requires_private_local_restore';
  END IF;
END;
$guard$;

BEGIN;
SET LOCAL synchronous_commit = off;

DO $receipt_contract$
BEGIN
  IF to_regclass('public.stockinsider_legacy_compaction_receipts_v1') IS NULL THEN
    RAISE EXCEPTION 'legacy_compaction_receipt_migration_missing';
  END IF;
END;
$receipt_contract$;

CREATE TEMP TABLE compaction_archived_runs ON COMMIT DROP AS
WITH high_water AS (
  SELECT max(coalesce(terminal_at, started_at)) AS observed_at
  FROM public.legacy_producer_runs_v3_11
), newest_success AS (
  SELECT run_id FROM public.legacy_producer_runs_v3_11
  WHERE status = 'success'
  ORDER BY terminal_at DESC NULLS LAST, run_id DESC LIMIT 1
)
SELECT run.run_id
FROM public.legacy_producer_runs_v3_11 run CROSS JOIN high_water
WHERE run.status IN ('success','failed','cancelled')
  AND run.terminal_at IS NOT NULL
  AND run.terminal_at < high_water.observed_at - interval '7 days'
  AND run.run_id NOT IN (SELECT run_id FROM newest_success);
CREATE UNIQUE INDEX ON compaction_archived_runs(run_id);

-- Foreign keys do not automatically index the referencing content hash.  The
-- orphan sweep below must stay linear even for millions of diagnostic rows.
CREATE INDEX IF NOT EXISTS retention_legacy_job_payload_refs_content_hash_v2
  ON public.retention_legacy_job_payload_refs_v2(content_hash);
CREATE INDEX IF NOT EXISTS retention_legacy_job_result_refs_content_hash_v2
  ON public.retention_legacy_job_result_refs_v2(content_hash);
CREATE INDEX IF NOT EXISTS retention_legacy_authority_page_refs_content_hash_v2
  ON public.retention_legacy_authority_page_refs_v2(content_hash);
CREATE INDEX IF NOT EXISTS retention_legacy_frozen_revision_refs_content_hash_v2
  ON public.retention_legacy_frozen_revision_refs_v2(content_hash);
CREATE INDEX IF NOT EXISTS retention_legacy_processing_outcome_refs_content_hash_v2
  ON public.retention_legacy_processing_outcome_refs_v2(content_hash);

CREATE TEMP TABLE compaction_before_counts ON COMMIT DROP AS
SELECT
  (SELECT count(*) FROM public.legacy_producer_job_payloads_v3_11 payload
    JOIN public.legacy_producer_jobs_v3_11 job USING(job_id)
    JOIN compaction_archived_runs archived USING(run_id)) AS payloads,
  (SELECT count(*) FROM public.legacy_producer_job_results_v3_11 result
    JOIN public.legacy_producer_jobs_v3_11 job USING(job_id)
    JOIN compaction_archived_runs archived USING(run_id)) AS results,
  (SELECT count(*) FROM public.legacy_producer_authority_pages_v3_11 page
    JOIN compaction_archived_runs archived USING(run_id)) AS authority_pages,
  (SELECT count(*) FROM public.legacy_frozen_source_revisions_v3_11 frozen
    JOIN compaction_archived_runs archived USING(run_id)) AS frozen_revisions,
  (SELECT count(*) FROM public.legacy_source_processing_outcomes_v3_13 outcome
    JOIN compaction_archived_runs archived ON archived.run_id=outcome.source_run_id) AS processing_outcomes;

-- Every byte-bearing row must already have a verified normalized reference.
DO $references$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.legacy_producer_job_payloads_v3_11 source
    JOIN public.legacy_producer_jobs_v3_11 job USING(job_id)
    JOIN compaction_archived_runs archived USING(run_id)
    LEFT JOIN public.retention_legacy_job_payload_refs_v2 ref USING(job_id)
    LEFT JOIN public.retention_legacy_content_objects_v2 object USING(content_hash)
    WHERE ref.job_id IS NULL OR object.canonical_bytes IS DISTINCT FROM source.payload_canonical
  ) OR EXISTS (
    SELECT 1 FROM public.legacy_producer_job_results_v3_11 source
    JOIN public.legacy_producer_jobs_v3_11 job USING(job_id)
    JOIN compaction_archived_runs archived USING(run_id)
    LEFT JOIN public.retention_legacy_job_result_refs_v2 ref USING(job_id)
    LEFT JOIN public.retention_legacy_content_objects_v2 object USING(content_hash)
    WHERE ref.job_id IS NULL OR object.canonical_bytes IS DISTINCT FROM source.result_canonical
  ) OR EXISTS (
    SELECT 1 FROM public.legacy_producer_authority_pages_v3_11 source
    JOIN compaction_archived_runs archived USING(run_id)
    LEFT JOIN public.retention_legacy_authority_page_refs_v2 ref USING(run_id,page_kind,page_ordinal)
    LEFT JOIN public.retention_legacy_content_objects_v2 object USING(content_hash)
    WHERE ref.run_id IS NULL OR object.canonical_bytes IS DISTINCT FROM source.page_canonical
  ) OR EXISTS (
    SELECT 1 FROM public.legacy_frozen_source_revisions_v3_11 source
    JOIN compaction_archived_runs archived USING(run_id)
    LEFT JOIN public.retention_legacy_frozen_revision_refs_v2 ref USING(run_id,selection_ordinal)
    LEFT JOIN public.retention_legacy_content_objects_v2 object USING(content_hash)
    WHERE ref.run_id IS NULL OR object.canonical_bytes IS DISTINCT FROM source.selected_revision_row_canonical
  ) THEN
    RAISE EXCEPTION 'legacy_compaction_reference_verification_failed';
  END IF;
END;
$references$;

ALTER TABLE public.legacy_producer_job_payloads_v3_11 DISABLE TRIGGER USER;
ALTER TABLE public.legacy_producer_job_results_v3_11 DISABLE TRIGGER USER;
ALTER TABLE public.legacy_producer_authority_pages_v3_11 DISABLE TRIGGER USER;
ALTER TABLE public.legacy_frozen_source_revisions_v3_11 DISABLE TRIGGER USER;
ALTER TABLE public.legacy_source_processing_outcomes_v3_13 DISABLE TRIGGER USER;
ALTER TABLE public.retention_legacy_processing_outcome_refs_v2 DISABLE TRIGGER USER;
ALTER TABLE public.retention_legacy_content_objects_v2 DISABLE TRIGGER USER;

DELETE FROM public.legacy_producer_job_payloads_v3_11 payload
USING public.legacy_producer_jobs_v3_11 job,compaction_archived_runs archived
WHERE payload.job_id=job.job_id AND job.run_id=archived.run_id;
DELETE FROM public.legacy_producer_job_results_v3_11 result
USING public.legacy_producer_jobs_v3_11 job,compaction_archived_runs archived
WHERE result.job_id=job.job_id AND job.run_id=archived.run_id;
DELETE FROM public.legacy_producer_authority_pages_v3_11 page
USING compaction_archived_runs archived WHERE page.run_id=archived.run_id;
DELETE FROM public.legacy_frozen_source_revisions_v3_11 frozen
USING compaction_archived_runs archived WHERE frozen.run_id=archived.run_id;
DELETE FROM public.legacy_source_processing_outcomes_v3_13 outcome
USING compaction_archived_runs archived WHERE outcome.source_run_id=archived.run_id;

-- Processing outcomes are high-cardinality diagnostics and already exist in
-- the verified cold backup.  Remove their normalized online copy for archived
-- runs, then remove only content objects that have no remaining reference.
DELETE FROM public.retention_legacy_processing_outcome_refs_v2 ref
USING compaction_archived_runs archived WHERE ref.source_run_id=archived.run_id;
DELETE FROM public.retention_legacy_content_objects_v2 object
WHERE NOT EXISTS (SELECT 1 FROM public.retention_legacy_job_payload_refs_v2 ref WHERE ref.content_hash=object.content_hash)
  AND NOT EXISTS (SELECT 1 FROM public.retention_legacy_job_result_refs_v2 ref WHERE ref.content_hash=object.content_hash)
  AND NOT EXISTS (SELECT 1 FROM public.retention_legacy_authority_page_refs_v2 ref WHERE ref.content_hash=object.content_hash)
  AND NOT EXISTS (SELECT 1 FROM public.retention_legacy_frozen_revision_refs_v2 ref WHERE ref.content_hash=object.content_hash)
  AND NOT EXISTS (SELECT 1 FROM public.retention_legacy_processing_outcome_refs_v2 ref WHERE ref.content_hash=object.content_hash);

ALTER TABLE public.legacy_producer_job_payloads_v3_11 ENABLE TRIGGER USER;
ALTER TABLE public.legacy_producer_job_results_v3_11 ENABLE TRIGGER USER;
ALTER TABLE public.legacy_producer_authority_pages_v3_11 ENABLE TRIGGER USER;
ALTER TABLE public.legacy_frozen_source_revisions_v3_11 ENABLE TRIGGER USER;
ALTER TABLE public.legacy_source_processing_outcomes_v3_13 ENABLE TRIGGER USER;
ALTER TABLE public.retention_legacy_processing_outcome_refs_v2 ENABLE TRIGGER USER;
ALTER TABLE public.retention_legacy_content_objects_v2 ENABLE TRIGGER USER;

DO $removed$
DECLARE before_row RECORD;
BEGIN
  SELECT * INTO before_row FROM compaction_before_counts;
  IF before_row.payloads <> (SELECT count(*) FROM public.retention_legacy_job_payload_refs_v2 ref
      JOIN public.legacy_producer_jobs_v3_11 job USING(job_id) JOIN compaction_archived_runs archived USING(run_id)) THEN
    RAISE EXCEPTION 'legacy_compaction_payload_reference_count_failed';
  END IF;
  IF before_row.results <> (SELECT count(*) FROM public.retention_legacy_job_result_refs_v2 ref
      JOIN public.legacy_producer_jobs_v3_11 job USING(job_id) JOIN compaction_archived_runs archived USING(run_id)) THEN
    RAISE EXCEPTION 'legacy_compaction_result_reference_count_failed';
  END IF;
  IF before_row.authority_pages <> (SELECT count(*) FROM public.retention_legacy_authority_page_refs_v2 ref
      JOIN compaction_archived_runs archived USING(run_id)) THEN
    RAISE EXCEPTION 'legacy_compaction_authority_reference_count_failed';
  END IF;
  IF before_row.frozen_revisions <> (SELECT count(*) FROM public.retention_legacy_frozen_revision_refs_v2 ref
      JOIN compaction_archived_runs archived USING(run_id)) THEN
    RAISE EXCEPTION 'legacy_compaction_frozen_reference_count_failed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.legacy_producer_job_payloads_v3_11 payload
      JOIN public.legacy_producer_jobs_v3_11 job USING(job_id) JOIN compaction_archived_runs archived USING(run_id))
    OR EXISTS (SELECT 1 FROM public.legacy_producer_job_results_v3_11 result
      JOIN public.legacy_producer_jobs_v3_11 job USING(job_id) JOIN compaction_archived_runs archived USING(run_id))
    OR EXISTS (SELECT 1 FROM public.legacy_producer_authority_pages_v3_11 page JOIN compaction_archived_runs archived USING(run_id))
    OR EXISTS (SELECT 1 FROM public.legacy_frozen_source_revisions_v3_11 frozen JOIN compaction_archived_runs archived USING(run_id))
    OR EXISTS (SELECT 1 FROM public.legacy_source_processing_outcomes_v3_13 outcome
      JOIN compaction_archived_runs archived ON archived.run_id=outcome.source_run_id) THEN
    RAISE EXCEPTION 'legacy_compaction_postcondition_failed';
  END IF;
END;
$removed$;

INSERT INTO public.stockinsider_legacy_compaction_receipts_v1(
  policy_version,source_high_water_at,live_detail_cutoff_at,archived_run_count,
  archived_run_root_hash,removed_relation_counts,retained_relation_counts,
  cold_backup_id,cold_backup_plaintext_sha256,cold_restore_verified
)
SELECT 'legacy-runtime-v1',high_water.observed_at,high_water.observed_at-interval '7 days',
  (SELECT count(*) FROM compaction_archived_runs),
  encode(extensions.digest(convert_to(coalesce((SELECT string_agg(run_id::text,',' ORDER BY run_id)
    FROM compaction_archived_runs),''),'UTF8'),'sha256'),'hex'),
  jsonb_build_object('payloads',before_row.payloads,'results',before_row.results,
    'authorityPages',before_row.authority_pages,'frozenRevisions',before_row.frozen_revisions,
    'processingOutcomes',before_row.processing_outcomes),
  jsonb_build_object(
    'payloads',(SELECT count(*) FROM public.legacy_producer_job_payloads_v3_11),
    'results',(SELECT count(*) FROM public.legacy_producer_job_results_v3_11),
    'authorityPages',(SELECT count(*) FROM public.legacy_producer_authority_pages_v3_11),
    'frozenRevisions',(SELECT count(*) FROM public.legacy_frozen_source_revisions_v3_11),
    'processingOutcomes',(SELECT count(*) FROM public.legacy_source_processing_outcomes_v3_13)),
  :'cold_backup_id',:'cold_backup_plaintext_sha256',TRUE
FROM (SELECT max(coalesce(terminal_at,started_at)) observed_at FROM public.legacy_producer_runs_v3_11) high_water
CROSS JOIN compaction_before_counts before_row;

COMMIT;

VACUUM (FULL, ANALYZE) public.legacy_producer_job_payloads_v3_11;
VACUUM (FULL, ANALYZE) public.legacy_producer_job_results_v3_11;
VACUUM (FULL, ANALYZE) public.legacy_producer_authority_pages_v3_11;
VACUUM (FULL, ANALYZE) public.legacy_frozen_source_revisions_v3_11;
VACUUM (FULL, ANALYZE) public.legacy_source_processing_outcomes_v3_13;
VACUUM (FULL, ANALYZE) public.retention_legacy_content_objects_v2;
VACUUM (FULL, ANALYZE) public.retention_legacy_job_payload_refs_v2;
VACUUM (FULL, ANALYZE) public.retention_legacy_job_result_refs_v2;
VACUUM (FULL, ANALYZE) public.retention_legacy_authority_page_refs_v2;
VACUUM (FULL, ANALYZE) public.retention_legacy_frozen_revision_refs_v2;
VACUUM (FULL, ANALYZE) public.retention_legacy_processing_outcome_refs_v2;

SELECT json_build_object(
  'receiptId',receipt_id,
  'policyVersion',policy_version,
  'archivedRunCount',archived_run_count,
  'removedRelationCounts',removed_relation_counts,
  'retainedRelationCounts',retained_relation_counts,
  'databaseBytes',pg_database_size(current_database())
) FROM public.stockinsider_legacy_compaction_receipts_v1
ORDER BY created_at DESC,receipt_id DESC LIMIT 1;
