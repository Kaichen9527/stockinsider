-- StockInsider v5.29: Supabase Disk I/O budget guard indexes.
-- Apply during a quiet window. These indexes reduce repeated source/radar/deep-dive scans.

CREATE INDEX IF NOT EXISTS idx_source_raw_documents_symbols_gin
  ON public.source_raw_documents
  USING gin (symbols);

CREATE INDEX IF NOT EXISTS idx_source_raw_documents_platform_collected_id
  ON public.source_raw_documents (platform, collected_at DESC, id);

CREATE INDEX IF NOT EXISTS idx_source_raw_documents_entity_collected_id
  ON public.source_raw_documents (source_entity_id, collected_at DESC, id)
  WHERE source_entity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_connector_runs_platform_started_id
  ON public.connector_runs (platform, started_at DESC, id);

CREATE INDEX IF NOT EXISTS idx_worker_job_runs_job_started_id
  ON public.worker_job_runs (job_id, started_at DESC, id);

CREATE INDEX IF NOT EXISTS idx_runtime_artifacts_type_created_id
  ON public.runtime_artifacts (artifact_type, created_at DESC, id);

CREATE INDEX IF NOT EXISTS idx_source_audits_platform_created_id
  ON public.source_audits (platform, created_at DESC, id);
