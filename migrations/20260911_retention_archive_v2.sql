BEGIN;

-- Retention v2 adds a conservative, run-graph aware plan for the six large
-- legacy producer relations.  It deliberately does not expose a DELETE RPC.
-- A run is only eligible after the 7+28 day discovery window and when every
-- known relational or JSONB reference outside the archive closure is absent.
CREATE TABLE IF NOT EXISTS public.retention_archive_manifests_v2 (
  manifest_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  root_run_id UUID NOT NULL REFERENCES public.legacy_producer_runs_v3_11(run_id) ON DELETE RESTRICT,
  policy_version TEXT NOT NULL CHECK (policy_version='retention-v2'),
  planned_snapshot_at TIMESTAMPTZ NOT NULL,
  detail_cutoff_at TIMESTAMPTZ NOT NULL,
  summary_cutoff_at TIMESTAMPTZ NOT NULL,
  closure_hash TEXT NOT NULL CHECK (closure_hash ~ '^[0-9a-f]{64}$'),
  content_root_hash TEXT NOT NULL CHECK (content_root_hash ~ '^[0-9a-f]{64}$'),
  expected_row_count BIGINT NOT NULL CHECK (expected_row_count>0),
  expected_unique_content_count BIGINT NOT NULL CHECK (expected_unique_content_count>=0),
  expected_relation_counts JSONB NOT NULL CHECK (jsonb_typeof(expected_relation_counts)='object'),
  archive_locator TEXT,
  archive_sha256 TEXT CHECK (archive_sha256 IS NULL OR archive_sha256 ~ '^[0-9a-f]{64}$'),
  archive_bytes BIGINT CHECK (archive_bytes IS NULL OR archive_bytes>0),
  encrypted BOOLEAN NOT NULL DEFAULT FALSE,
  restore_verified_at TIMESTAMPTZ,
  restore_environment_id TEXT,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','exported','verified','failed','superseded')),
  created_by_principal TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(root_run_id,closure_hash),
  CHECK (archive_locator IS NULL OR (
    archive_locator ~ '^backup/retention/[A-Za-z0-9._/-]+[.]sira2$'
    AND archive_locator !~ '(^|/)[.][.]($|/)'
  )),
  CHECK ((status IN ('exported','verified'))=(archive_locator IS NOT NULL AND archive_sha256 IS NOT NULL
    AND archive_bytes IS NOT NULL AND encrypted)),
  CHECK ((status='verified')=(restore_verified_at IS NOT NULL AND restore_environment_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS public.retention_archive_rows_v2 (
  manifest_id UUID NOT NULL REFERENCES public.retention_archive_manifests_v2(manifest_id) ON DELETE RESTRICT,
  ordinal BIGINT NOT NULL CHECK (ordinal>=0),
  relation_name TEXT NOT NULL CHECK (relation_name IN (
    'public.legacy_producer_jobs_v3_11','public.legacy_producer_job_payloads_v3_11',
    'public.legacy_producer_job_results_v3_11','public.legacy_source_processing_outcomes_v3_13',
    'public.legacy_frozen_source_revisions_v3_11','public.legacy_producer_authority_pages_v3_11'
  )),
  row_key JSONB NOT NULL CHECK (jsonb_typeof(row_key)='object'),
  row_key_hash TEXT NOT NULL CHECK (row_key_hash ~ '^[0-9a-f]{64}$'),
  row_hash TEXT NOT NULL CHECK (row_hash ~ '^[0-9a-f]{64}$'),
  content_hash TEXT CHECK (content_hash IS NULL OR content_hash ~ '^[0-9a-f]{64}$'),
  PRIMARY KEY(manifest_id,ordinal),
  UNIQUE(manifest_id,relation_name,row_key_hash)
);

CREATE TABLE IF NOT EXISTS public.retention_archive_content_objects_v2 (
  manifest_id UUID NOT NULL REFERENCES public.retention_archive_manifests_v2(manifest_id) ON DELETE RESTRICT,
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  content_kind TEXT NOT NULL CHECK (content_kind IN ('payload','result','authority_page','frozen_revision')),
  plaintext_bytes BIGINT NOT NULL CHECK (plaintext_bytes>=0),
  occurrence_count BIGINT NOT NULL CHECK (occurrence_count>0),
  PRIMARY KEY(manifest_id,content_hash)
);

-- Online content-addressed representation used by an independently reviewed
-- compatibility cutover.  V2 only creates and reads it; it never removes the
-- legacy rows.  Canonical UTF-8 JSON is stored once and parsed on read, avoiding
-- the former canonical-byte + jsonb duplication on every execution row.
CREATE TABLE IF NOT EXISTS public.retention_legacy_content_objects_v2 (
  content_hash TEXT PRIMARY KEY CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  canonical_bytes BYTEA NOT NULL,
  plaintext_bytes BIGINT NOT NULL CHECK (plaintext_bytes=octet_length(canonical_bytes)),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CHECK (encode(extensions.digest(canonical_bytes,'sha256'),'hex')=content_hash),
  CHECK (convert_from(canonical_bytes,'UTF8')::jsonb IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS public.retention_legacy_job_payload_refs_v2 (
  job_id UUID PRIMARY KEY REFERENCES public.legacy_producer_jobs_v3_11(job_id) ON DELETE RESTRICT,
  content_hash TEXT NOT NULL REFERENCES public.retention_legacy_content_objects_v2(content_hash) ON DELETE RESTRICT,
  recorded_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS public.retention_legacy_job_result_refs_v2 (
  job_id UUID PRIMARY KEY REFERENCES public.legacy_producer_jobs_v3_11(job_id) ON DELETE RESTRICT,
  content_hash TEXT NOT NULL REFERENCES public.retention_legacy_content_objects_v2(content_hash) ON DELETE RESTRICT,
  recorded_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS public.retention_legacy_authority_page_refs_v2 (
  run_id UUID NOT NULL REFERENCES public.legacy_producer_runs_v3_11(run_id) ON DELETE RESTRICT,
  page_kind public.opportunity_legacy_authority_page_kind_v3_11 NOT NULL,
  page_ordinal INTEGER NOT NULL,first_row_ordinal INTEGER NOT NULL,row_count INTEGER NOT NULL,
  content_hash TEXT NOT NULL REFERENCES public.retention_legacy_content_objects_v2(content_hash) ON DELETE RESTRICT,
  recorded_at TIMESTAMPTZ NOT NULL,PRIMARY KEY(run_id,page_kind,page_ordinal)
);
CREATE TABLE IF NOT EXISTS public.retention_legacy_frozen_revision_refs_v2 (
  run_id UUID NOT NULL REFERENCES public.legacy_producer_runs_v3_11(run_id) ON DELETE RESTRICT,
  selection_ordinal INTEGER NOT NULL,source_key public.source_key_v3 NOT NULL,
  revision_id UUID NOT NULL REFERENCES public.source_document_revisions_v3(revision_id) ON DELETE RESTRICT,
  content_hash TEXT NOT NULL REFERENCES public.retention_legacy_content_objects_v2(content_hash) ON DELETE RESTRICT,
  raw_field_payload_algorithm_version TEXT NOT NULL,ingestion_content_revision_sha256 TEXT NOT NULL,
  canonical_content_algorithm_version TEXT NOT NULL,canonical_content_sha256 TEXT,recorded_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY(run_id,selection_ordinal),UNIQUE(run_id,revision_id)
);
CREATE TABLE IF NOT EXISTS public.retention_legacy_processing_outcome_refs_v2 (
  source_run_id UUID NOT NULL REFERENCES public.legacy_producer_runs_v3_11(run_id) ON DELETE RESTRICT,
  revision_id UUID NOT NULL REFERENCES public.source_document_revisions_v3(revision_id) ON DELETE RESTRICT,
  scope TEXT NOT NULL,outcome_id UUID NOT NULL,parent_outcome_id UUID,
  content_hash TEXT NOT NULL REFERENCES public.retention_legacy_content_objects_v2(content_hash) ON DELETE RESTRICT,
  recorded_at TIMESTAMPTZ NOT NULL,PRIMARY KEY(source_run_id,revision_id,scope,outcome_id)
);

-- The materializer is insert-only.  Once a canonical object or identity edge
-- exists it is evidence, so use the reviewed v1 guard to reject later UPDATE
-- or DELETE statements.  The compatibility readers therefore cannot be made
-- to return different historical bytes by mutating the normalized copy.
DROP TRIGGER IF EXISTS trg_retention_legacy_content_objects_guard_v2 ON public.retention_legacy_content_objects_v2;
CREATE TRIGGER trg_retention_legacy_content_objects_guard_v2 BEFORE UPDATE OR DELETE
  ON public.retention_legacy_content_objects_v2 FOR EACH ROW
  EXECUTE FUNCTION public.reject_retention_archive_direct_mutation_v1();
DROP TRIGGER IF EXISTS trg_retention_legacy_job_payload_refs_guard_v2 ON public.retention_legacy_job_payload_refs_v2;
CREATE TRIGGER trg_retention_legacy_job_payload_refs_guard_v2 BEFORE UPDATE OR DELETE
  ON public.retention_legacy_job_payload_refs_v2 FOR EACH ROW
  EXECUTE FUNCTION public.reject_retention_archive_direct_mutation_v1();
DROP TRIGGER IF EXISTS trg_retention_legacy_job_result_refs_guard_v2 ON public.retention_legacy_job_result_refs_v2;
CREATE TRIGGER trg_retention_legacy_job_result_refs_guard_v2 BEFORE UPDATE OR DELETE
  ON public.retention_legacy_job_result_refs_v2 FOR EACH ROW
  EXECUTE FUNCTION public.reject_retention_archive_direct_mutation_v1();
DROP TRIGGER IF EXISTS trg_retention_legacy_authority_page_refs_guard_v2 ON public.retention_legacy_authority_page_refs_v2;
CREATE TRIGGER trg_retention_legacy_authority_page_refs_guard_v2 BEFORE UPDATE OR DELETE
  ON public.retention_legacy_authority_page_refs_v2 FOR EACH ROW
  EXECUTE FUNCTION public.reject_retention_archive_direct_mutation_v1();
DROP TRIGGER IF EXISTS trg_retention_legacy_frozen_revision_refs_guard_v2 ON public.retention_legacy_frozen_revision_refs_v2;
CREATE TRIGGER trg_retention_legacy_frozen_revision_refs_guard_v2 BEFORE UPDATE OR DELETE
  ON public.retention_legacy_frozen_revision_refs_v2 FOR EACH ROW
  EXECUTE FUNCTION public.reject_retention_archive_direct_mutation_v1();
DROP TRIGGER IF EXISTS trg_retention_legacy_processing_outcome_refs_guard_v2 ON public.retention_legacy_processing_outcome_refs_v2;
CREATE TRIGGER trg_retention_legacy_processing_outcome_refs_guard_v2 BEFORE UPDATE OR DELETE
  ON public.retention_legacy_processing_outcome_refs_v2 FOR EACH ROW
  EXECUTE FUNCTION public.reject_retention_archive_direct_mutation_v1();

CREATE OR REPLACE FUNCTION public.read_legacy_job_payload_v2(p_job_id UUID)
RETURNS JSONB LANGUAGE SQL STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $function$
  SELECT coalesce(
    (SELECT to_jsonb(live) FROM public.legacy_producer_job_payloads_v3_11 live WHERE live.job_id=p_job_id),
    (SELECT jsonb_build_object('job_id',ref.job_id,'payload_canonical',E'\\x'||encode(object.canonical_bytes,'hex'),
      'payload_json',convert_from(object.canonical_bytes,'UTF8')::jsonb,'payload_hash',ref.content_hash,
      'recorded_at',ref.recorded_at)
      FROM public.retention_legacy_job_payload_refs_v2 ref
      JOIN public.retention_legacy_content_objects_v2 object USING(content_hash) WHERE ref.job_id=p_job_id));
$function$;
CREATE OR REPLACE FUNCTION public.read_legacy_job_result_v2(p_job_id UUID)
RETURNS JSONB LANGUAGE SQL STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $function$
  SELECT coalesce(
    (SELECT to_jsonb(live) FROM public.legacy_producer_job_results_v3_11 live WHERE live.job_id=p_job_id),
    (SELECT jsonb_build_object('job_id',ref.job_id,'result_canonical',E'\\x'||encode(object.canonical_bytes,'hex'),
      'result_json',convert_from(object.canonical_bytes,'UTF8')::jsonb,'result_hash',ref.content_hash,
      'recorded_at',ref.recorded_at)
      FROM public.retention_legacy_job_result_refs_v2 ref
      JOIN public.retention_legacy_content_objects_v2 object USING(content_hash) WHERE ref.job_id=p_job_id));
$function$;
CREATE OR REPLACE FUNCTION public.read_legacy_authority_pages_v2(p_run_id UUID)
RETURNS JSONB LANGUAGE SQL STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $function$
  SELECT coalesce(
    (SELECT jsonb_agg(to_jsonb(live) ORDER BY live.page_kind,live.page_ordinal)
      FROM public.legacy_producer_authority_pages_v3_11 live WHERE live.run_id=p_run_id),
    (SELECT jsonb_agg(jsonb_build_object('run_id',ref.run_id,'page_kind',ref.page_kind,
      'page_ordinal',ref.page_ordinal,'first_row_ordinal',ref.first_row_ordinal,'row_count',ref.row_count,
      'page_canonical',E'\\x'||encode(object.canonical_bytes,'hex'),
      'page_json',convert_from(object.canonical_bytes,'UTF8')::jsonb,'page_hash',ref.content_hash,
      'recorded_at',ref.recorded_at) ORDER BY ref.page_kind,ref.page_ordinal)
      FROM public.retention_legacy_authority_page_refs_v2 ref
      JOIN public.retention_legacy_content_objects_v2 object USING(content_hash) WHERE ref.run_id=p_run_id),
    '[]'::jsonb);
$function$;
CREATE OR REPLACE FUNCTION public.read_legacy_frozen_revisions_v2(p_run_id UUID)
RETURNS JSONB LANGUAGE SQL STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $function$
  SELECT coalesce(
    (SELECT jsonb_agg(to_jsonb(live) ORDER BY live.selection_ordinal)
      FROM public.legacy_frozen_source_revisions_v3_11 live WHERE live.run_id=p_run_id),
    (SELECT jsonb_agg(jsonb_build_object('run_id',ref.run_id,'selection_ordinal',ref.selection_ordinal,
      'source_key',ref.source_key,'revision_id',ref.revision_id,
      'selected_revision_row_canonical',E'\\x'||encode(object.canonical_bytes,'hex'),
      'selected_revision_row_json',convert_from(object.canonical_bytes,'UTF8')::jsonb,
      'selected_revision_row_hash',ref.content_hash,
      'raw_field_payload_algorithm_version',ref.raw_field_payload_algorithm_version,
      'ingestion_content_revision_sha256',ref.ingestion_content_revision_sha256,
      'canonical_content_algorithm_version',ref.canonical_content_algorithm_version,
      'canonical_content_sha256',ref.canonical_content_sha256,'recorded_at',ref.recorded_at)
      ORDER BY ref.selection_ordinal)
      FROM public.retention_legacy_frozen_revision_refs_v2 ref
      JOIN public.retention_legacy_content_objects_v2 object USING(content_hash) WHERE ref.run_id=p_run_id),
    '[]'::jsonb);
$function$;
CREATE OR REPLACE FUNCTION public.read_legacy_processing_outcomes_v2(p_run_id UUID)
RETURNS JSONB LANGUAGE SQL STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $function$
  SELECT coalesce(
    (SELECT jsonb_agg(to_jsonb(live) ORDER BY live.revision_id,live.scope,live.outcome_id)
      FROM public.legacy_source_processing_outcomes_v3_13 live WHERE live.source_run_id=p_run_id),
    (SELECT jsonb_agg(jsonb_build_object('source_run_id',ref.source_run_id,'revision_id',ref.revision_id,
      'scope',content.value->>0,'outcome_id',ref.outcome_id,'parent_outcome_id',ref.parent_outcome_id,
      'symbol',content.value->>3,'stock_id',nullif(content.value->>4,'')::UUID,
      'outcome',content.value->>1,'reason',content.value->>2,'recorded_at',ref.recorded_at)
      ORDER BY ref.revision_id,ref.scope,ref.outcome_id)
      FROM public.retention_legacy_processing_outcome_refs_v2 ref
      JOIN public.retention_legacy_content_objects_v2 object USING(content_hash)
      CROSS JOIN LATERAL (SELECT convert_from(object.canonical_bytes,'UTF8')::jsonb value) content
      WHERE ref.source_run_id=p_run_id),
    '[]'::jsonb);
$function$;
CREATE OR REPLACE FUNCTION public.read_legacy_run_compact_counts_v2(p_run_id UUID)
RETURNS JSONB LANGUAGE SQL STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $function$
  SELECT jsonb_build_object(
    'payloads',(SELECT count(*) FROM public.retention_legacy_job_payload_refs_v2 ref
      JOIN public.legacy_producer_jobs_v3_11 job USING(job_id) WHERE job.run_id=p_run_id),
    'results',(SELECT count(*) FROM public.retention_legacy_job_result_refs_v2 ref
      JOIN public.legacy_producer_jobs_v3_11 job USING(job_id) WHERE job.run_id=p_run_id),
    'authorityPages',(SELECT count(*) FROM public.retention_legacy_authority_page_refs_v2 WHERE run_id=p_run_id),
    'frozenRevisions',(SELECT count(*) FROM public.retention_legacy_frozen_revision_refs_v2 WHERE run_id=p_run_id),
    'processingOutcomes',(SELECT count(*) FROM public.retention_legacy_processing_outcome_refs_v2 WHERE source_run_id=p_run_id));
$function$;

CREATE OR REPLACE FUNCTION public.retention_legacy_jsonb_pins_v2(p_run_ids UUID[])
RETURNS TABLE(run_id UUID,pin_kind TEXT,source_relation TEXT,source_key TEXT)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp
AS $function$
DECLARE v_column RECORD; v_sql TEXT;
BEGIN
  IF coalesce(cardinality(p_run_ids),0)=0 THEN RETURN; END IF;
  FOR v_column IN
    SELECT col.table_schema,col.table_name,col.column_name
    FROM information_schema.columns col
    JOIN information_schema.tables relation
      ON relation.table_schema=col.table_schema AND relation.table_name=col.table_name
    WHERE col.table_schema='public' AND col.data_type='jsonb' AND relation.table_type='BASE TABLE'
      AND col.table_name NOT IN (
        'legacy_producer_jobs_v3_11','legacy_producer_job_payloads_v3_11','legacy_producer_job_results_v3_11',
        'legacy_source_processing_outcomes_v3_13','legacy_frozen_source_revisions_v3_11',
        'legacy_producer_authority_pages_v3_11','retention_archive_manifests_v1',
        'retention_archive_manifest_rows_v1','retention_archive_pin_events_v1',
        'retention_archive_manifests_v2','retention_archive_rows_v2','retention_archive_content_objects_v2'
      )
    ORDER BY col.table_name,col.ordinal_position
  LOOP
    v_sql:=format($sql$
      WITH wanted AS MATERIALIZED (
        SELECT run.run_id,run.run_id::TEXT object_id FROM public.legacy_producer_runs_v3_11 run
        WHERE run.run_id=ANY($1)
        UNION ALL
        SELECT job.run_id,job.job_id::TEXT FROM public.legacy_producer_jobs_v3_11 job
        WHERE job.run_id=ANY($1)
      ), extracted AS MATERIALIZED (
        SELECT DISTINCT lower(match[1]) object_id
        FROM %I.%I row_value
        CROSS JOIN LATERAL regexp_matches(
          row_value.%I::TEXT,
          '([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})','g'
        ) match
      )
      SELECT DISTINCT wanted.run_id,'jsonb_reference',%L,%L
      FROM wanted JOIN extracted USING(object_id)
    $sql$,v_column.table_schema,v_column.table_name,v_column.column_name,
      format('public.%I',v_column.table_name),v_column.column_name);
    RETURN QUERY EXECUTE v_sql USING p_run_ids;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.retention_legacy_direct_pins_v2(p_run_ids UUID[])
RETURNS TABLE(run_id UUID,pin_kind TEXT,source_relation TEXT,source_key TEXT)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $function$
  SELECT evaluation.producer_run_id,'public_revision','public.legacy_analysis_evaluations_v3_11',evaluation.revision_id::TEXT
  FROM public.legacy_analysis_evaluations_v3_11 evaluation WHERE evaluation.producer_run_id=ANY(p_run_ids)
  UNION ALL SELECT discovery.source_run_id,'public_revision','public.legacy_candidate_discovery_ledger_v3_11',discovery.discovery_id::TEXT
  FROM public.legacy_candidate_discovery_ledger_v3_11 discovery WHERE discovery.source_run_id=ANY(p_run_ids)
  UNION ALL SELECT authority.source_run_id,'public_revision','public.legacy_frozen_source_authorities_v3_13',authority.source_key::TEXT
  FROM public.legacy_frozen_source_authorities_v3_13 authority WHERE authority.source_run_id=ANY(p_run_ids)
  UNION ALL SELECT application.run_id,'official_fact','public.legacy_official_ingestion_applications_v3_15',application.job_id::TEXT
  FROM public.legacy_official_ingestion_applications_v3_15 application WHERE application.run_id=ANY(p_run_ids)
  UNION ALL SELECT chunk.run_id,'official_fact','public.legacy_official_ingestion_chunks_v3_14',chunk.job_id::TEXT
  FROM public.legacy_official_ingestion_chunks_v3_14 chunk WHERE chunk.run_id=ANY(p_run_ids)
  UNION ALL SELECT acquisition.run_id,'official_fact','public.legacy_provider_acquisition_revisions_v3_16_21',acquisition.acquisition_id::TEXT
  FROM public.legacy_provider_acquisition_revisions_v3_16_21 acquisition WHERE acquisition.run_id=ANY(p_run_ids)
  UNION ALL SELECT diagnostic.run_id,'unresolved','public.legacy_runtime_failure_diagnostics_v3_14',diagnostic.job_id::TEXT
  FROM public.legacy_runtime_failure_diagnostics_v3_14 diagnostic WHERE diagnostic.run_id=ANY(p_run_ids)
  UNION ALL SELECT outcome.source_run_id,'source_lineage','public.legacy_source_acquisition_outcomes_v3_13',outcome.profile_id::TEXT
  FROM public.legacy_source_acquisition_outcomes_v3_13 outcome WHERE outcome.source_run_id=ANY(p_run_ids)
  UNION ALL SELECT context.source_run_id,'source_lineage','public.legacy_source_append_context_v3_13',context.source_key::TEXT
  FROM public.legacy_source_append_context_v3_13 context WHERE context.source_run_id=ANY(p_run_ids)
  UNION ALL SELECT attempt.source_run_id,'source_lineage','public.legacy_source_connector_attempts_v3_13',attempt.source_key::TEXT
  FROM public.legacy_source_connector_attempts_v3_13 attempt WHERE attempt.source_run_id=ANY(p_run_ids)
  UNION ALL SELECT persisted.source_run_id,'source_lineage','public.legacy_source_document_persistence_v3_13',persisted.revision_id::TEXT
  FROM public.legacy_source_document_persistence_v3_13 persisted WHERE persisted.source_run_id=ANY(p_run_ids)
  UNION ALL SELECT item.source_run_id,'source_lineage','public.legacy_source_item_outcomes_v3_13',item.source_key::TEXT
  FROM public.legacy_source_item_outcomes_v3_13 item WHERE item.source_run_id=ANY(p_run_ids)
  UNION ALL SELECT cursor.source_run_id,'source_cursor','public.legacy_source_sync_cursors_v3_19',cursor.source_run_id::TEXT
  FROM public.legacy_source_sync_cursors_v3_19 cursor WHERE cursor.source_run_id=ANY(p_run_ids)
  UNION ALL
  SELECT run.run_id,pin.pin_kind,'public.retention_archive_pin_events_v1',coalesce(pin.source_key,run.run_id::TEXT)
  FROM public.legacy_producer_runs_v3_11 run
  JOIN public.retention_archive_active_pins_v1() pin
    ON pin.relation_name='public.legacy_producer_runs_v3_11' AND pin.row_key=run.run_id::TEXT
  WHERE run.run_id=ANY(p_run_ids)
  UNION ALL
  SELECT job.run_id,pin.pin_kind,'public.retention_archive_pin_events_v1',coalesce(pin.source_key,job.job_id::TEXT)
  FROM public.legacy_producer_jobs_v3_11 job
  JOIN public.retention_archive_active_pins_v1() pin
    ON pin.relation_name='public.legacy_producer_jobs_v3_11' AND pin.row_key=job.job_id::TEXT
  WHERE job.run_id=ANY(p_run_ids);
$function$;

CREATE OR REPLACE FUNCTION public.retention_legacy_run_plan_v2(
  p_now TIMESTAMPTZ DEFAULT clock_timestamp(),p_limit INTEGER DEFAULT 100
)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp
AS $function$
DECLARE v_result JSONB; v_run_ids UUID[];
BEGIN
  IF p_limit<1 OR p_limit>1000 THEN RAISE EXCEPTION 'retention_candidate_limit_invalid'; END IF;
  SELECT array_agg(candidate.run_id ORDER BY candidate.terminal_at,candidate.run_id) INTO v_run_ids
  FROM (
    SELECT run.run_id,run.terminal_at
    FROM public.legacy_producer_runs_v3_11 run
    WHERE run.status='success' AND run.terminal_at<p_now-interval '30 days'
      AND NOT EXISTS (SELECT 1 FROM public.legacy_producer_jobs_v3_11 job
        WHERE job.run_id=run.run_id AND job.status IS DISTINCT FROM 'succeeded')
    ORDER BY run.terminal_at,run.run_id LIMIT p_limit
  ) candidate;
  IF coalesce(cardinality(v_run_ids),0)=0 THEN RETURN '[]'::jsonb; END IF;
  WITH candidates AS MATERIALIZED (
    SELECT run.* FROM public.legacy_producer_runs_v3_11 run WHERE run.run_id=ANY(v_run_ids)
  ), pins AS MATERIALIZED (
    SELECT * FROM public.retention_legacy_direct_pins_v2(v_run_ids)
    UNION
    SELECT * FROM public.retention_legacy_jsonb_pins_v2(v_run_ids)
  ), counts AS (
    SELECT candidate.run_id,
      (SELECT count(*) FROM public.legacy_producer_jobs_v3_11 row_value WHERE row_value.run_id=candidate.run_id) jobs,
      (SELECT count(*) FROM public.legacy_producer_jobs_v3_11 job JOIN public.legacy_producer_job_payloads_v3_11 row_value USING(job_id) WHERE job.run_id=candidate.run_id) payloads,
      (SELECT count(*) FROM public.legacy_producer_jobs_v3_11 job JOIN public.legacy_producer_job_results_v3_11 row_value USING(job_id) WHERE job.run_id=candidate.run_id) results,
      (SELECT count(*) FROM public.legacy_source_processing_outcomes_v3_13 row_value WHERE row_value.source_run_id=candidate.run_id) processing,
      (SELECT count(*) FROM public.legacy_frozen_source_revisions_v3_11 row_value WHERE row_value.run_id=candidate.run_id) frozen,
      (SELECT count(*) FROM public.legacy_producer_authority_pages_v3_11 row_value WHERE row_value.run_id=candidate.run_id) pages
    FROM candidates candidate
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'rootKind','legacy_producer_run','rootId',candidate.run_id,'observedAt',candidate.terminal_at,
    'eligible',candidate.source_cutoff<p_now-interval '35 days' AND NOT EXISTS(SELECT 1 FROM pins WHERE pins.run_id=candidate.run_id),
    'policyVersion','retention-v2','detailCutoffAt',p_now-interval '30 days',
    'sourceBurstCutoffAt',p_now-interval '35 days','summaryCutoffAt',p_now-interval '90 days',
    'summaryRetained',candidate.terminal_at>=p_now-interval '90 days',
    'relationCounts',jsonb_build_object(
      'public.legacy_producer_jobs_v3_11',counts.jobs,
      'public.legacy_producer_job_payloads_v3_11',counts.payloads,
      'public.legacy_producer_job_results_v3_11',counts.results,
      'public.legacy_source_processing_outcomes_v3_13',counts.processing,
      'public.legacy_frozen_source_revisions_v3_11',counts.frozen,
      'public.legacy_producer_authority_pages_v3_11',counts.pages),
    'blockers',coalesce((SELECT jsonb_agg(jsonb_build_object('code',grouped.pin_kind,
      'sourceRelation',grouped.source_relation,'referenceCount',grouped.reference_count)
      ORDER BY grouped.pin_kind,grouped.source_relation)
      FROM (SELECT pin.pin_kind,pin.source_relation,count(*) reference_count
        FROM pins pin WHERE pin.run_id=candidate.run_id GROUP BY pin.pin_kind,pin.source_relation) grouped),'[]'::jsonb)
      || CASE WHEN candidate.source_cutoff>=p_now-interval '35 days'
        THEN '[{"code":"source_7_plus_28_window"}]'::jsonb ELSE '[]'::jsonb END
  ) ORDER BY candidate.terminal_at,candidate.run_id),'[]'::jsonb) INTO v_result
  FROM candidates candidate JOIN counts USING(run_id);
  RETURN v_result;
END;
$function$;

-- Connector candidates are evaluated in one set: active pins and audit state
-- are materialized once, avoiding v1's per-row active-pin graph rebuild.
CREATE OR REPLACE FUNCTION public.list_connector_retention_archive_candidates_v2(
  p_now TIMESTAMPTZ DEFAULT clock_timestamp(),p_limit INTEGER DEFAULT 100
)
RETURNS JSONB
LANGUAGE SQL VOLATILE SECURITY DEFINER SET search_path=public,pg_temp
AS $function$
  WITH candidates AS MATERIALIZED (
    SELECT run.id,run.finished_at
    FROM public.connector_runs run
    WHERE run.status IN ('success','skipped') AND run.finished_at<p_now-interval '90 days'
      AND NOT coalesce(run.metadata,'{}'::jsonb) @> '{"unresolved":true}'::jsonb
      AND NOT coalesce(run.metadata,'{}'::jsonb) @> '{"recovery_required":true}'::jsonb
    ORDER BY run.finished_at,run.id LIMIT greatest(0,least(p_limit,1000))
  ), pins AS MATERIALIZED (
    SELECT pin.relation_name,pin.row_key FROM public.retention_archive_active_pins_v1() pin
    WHERE pin.relation_name IN ('public.connector_runs','public.source_audits')
  ), audits AS MATERIALIZED (
    SELECT audit.connector_run_id,count(*) audit_count,
      bool_or(audit.status IS DISTINCT FROM 'success'
        OR coalesce(audit.metadata,'{}'::jsonb) @> '{"unresolved":true}'::jsonb
        OR coalesce(audit.metadata,'{}'::jsonb) @> '{"recovery_required":true}'::jsonb
        OR coalesce(audit.metadata,'{}'::jsonb) @> '{"security_event":true}'::jsonb) incident,
      bool_or(pin.row_key IS NOT NULL) pinned
    FROM public.source_audits audit JOIN candidates ON candidates.id=audit.connector_run_id
    LEFT JOIN pins pin ON pin.relation_name='public.source_audits' AND pin.row_key=audit.id::TEXT
    GROUP BY audit.connector_run_id
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'rootKind','connector_run','rootId',candidate.id,'observedAt',candidate.finished_at,
    'eligible',NOT coalesce(audits.incident,FALSE) AND NOT coalesce(audits.pinned,FALSE)
      AND run_pin.row_key IS NULL,
    'blockers',CASE WHEN coalesce(audits.incident,FALSE) THEN '[{"code":"incident"}]'::jsonb ELSE '[]'::jsonb END
      || CASE WHEN coalesce(audits.pinned,FALSE) OR run_pin.row_key IS NOT NULL THEN '[{"code":"active_pin"}]'::jsonb ELSE '[]'::jsonb END,
    'rowCount',1+coalesce(audits.audit_count,0)
  ) ORDER BY candidate.finished_at,candidate.id),'[]'::jsonb)
  FROM candidates candidate LEFT JOIN audits ON audits.connector_run_id=candidate.id
  LEFT JOIN pins run_pin ON run_pin.relation_name='public.connector_runs' AND run_pin.row_key=candidate.id::TEXT;
$function$;

CREATE INDEX IF NOT EXISTS idx_legacy_producer_runs_retention_v2
  ON public.legacy_producer_runs_v3_11(terminal_at,run_id) WHERE status='success';
CREATE INDEX IF NOT EXISTS idx_legacy_producer_jobs_retention_v2
  ON public.legacy_producer_jobs_v3_11(run_id,status,job_id);
CREATE INDEX IF NOT EXISTS idx_legacy_processing_retention_v2
  ON public.legacy_source_processing_outcomes_v3_13(source_run_id,recorded_at);

ALTER TABLE public.retention_archive_manifests_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retention_archive_rows_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retention_archive_content_objects_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retention_legacy_content_objects_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retention_legacy_job_payload_refs_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retention_legacy_job_result_refs_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retention_legacy_authority_page_refs_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retention_legacy_frozen_revision_refs_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retention_legacy_processing_outcome_refs_v2 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.retention_archive_manifests_v2,public.retention_archive_rows_v2,
  public.retention_archive_content_objects_v2,public.retention_legacy_content_objects_v2,
  public.retention_legacy_job_payload_refs_v2,public.retention_legacy_job_result_refs_v2,
  public.retention_legacy_authority_page_refs_v2,public.retention_legacy_frozen_revision_refs_v2,
  public.retention_legacy_processing_outcome_refs_v2 FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.retention_archive_manifests_v2,public.retention_archive_rows_v2,
  public.retention_archive_content_objects_v2,public.retention_legacy_content_objects_v2,
  public.retention_legacy_job_payload_refs_v2,public.retention_legacy_job_result_refs_v2,
  public.retention_legacy_authority_page_refs_v2,public.retention_legacy_frozen_revision_refs_v2,
  public.retention_legacy_processing_outcome_refs_v2 TO service_role;
REVOKE ALL ON FUNCTION public.retention_legacy_jsonb_pins_v2(UUID[]),
  public.retention_legacy_direct_pins_v2(UUID[]),
  public.retention_legacy_run_plan_v2(TIMESTAMPTZ,INTEGER),
  public.list_connector_retention_archive_candidates_v2(TIMESTAMPTZ,INTEGER),
  public.read_legacy_job_payload_v2(UUID),public.read_legacy_job_result_v2(UUID),
  public.read_legacy_authority_pages_v2(UUID),public.read_legacy_frozen_revisions_v2(UUID),
  public.read_legacy_processing_outcomes_v2(UUID),
  public.read_legacy_run_compact_counts_v2(UUID)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.retention_legacy_jsonb_pins_v2(UUID[]),
  public.retention_legacy_direct_pins_v2(UUID[]),
  public.retention_legacy_run_plan_v2(TIMESTAMPTZ,INTEGER),
  public.list_connector_retention_archive_candidates_v2(TIMESTAMPTZ,INTEGER),
  public.read_legacy_job_payload_v2(UUID),public.read_legacy_job_result_v2(UUID),
  public.read_legacy_authority_pages_v2(UUID),public.read_legacy_frozen_revisions_v2(UUID),
  public.read_legacy_processing_outcomes_v2(UUID),
  public.read_legacy_run_compact_counts_v2(UUID)
  TO service_role;

COMMIT;
