BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Retention v1 is an additive control plane.  It can prove that a terminal
-- closure was exported and restored, but deliberately contains no DELETE RPC.
-- Destructive removal remains a separate, reviewed operation after a fresh
-- deletion-readiness check.
CREATE TABLE IF NOT EXISTS public.retention_archive_policies_v1 (
  root_kind TEXT PRIMARY KEY CHECK (root_kind IN (
    'candidate_research_run','connector_run','source_run_ledger','worker_job_run',
    'source_audit','worker_log','runtime_artifact'
  )),
  retention_days INTEGER NOT NULL CHECK (retention_days BETWEEN 1 AND 3650),
  policy_version TEXT NOT NULL,
  description TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

INSERT INTO public.retention_archive_policies_v1
  (root_kind,retention_days,policy_version,description)
VALUES
  ('candidate_research_run',90,'retention-v1','Terminal successful run summary and its run-item closure.'),
  ('connector_run',90,'retention-v1','Terminal successful connector summary and its audit closure.'),
  ('source_run_ledger',30,'retention-v1','Unreferenced successful-empty or duplicate-only source run.'),
  ('worker_job_run',90,'retention-v1','Terminal successful worker summary.'),
  ('source_audit',30,'retention-v1','Successful connector detail with no unresolved incident.'),
  ('worker_log',30,'retention-v1','Non-warning operational detail without security/recovery state.'),
  ('runtime_artifact',90,'retention-v1','Non-latest, non-release, non-recovery diagnostic artifact.')
ON CONFLICT (root_kind) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.retention_archive_pin_events_v1 (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  relation_name TEXT NOT NULL CHECK (relation_name ~ '^public[.][a-z][a-z0-9_]*$'),
  row_key TEXT NOT NULL CHECK (length(row_key) BETWEEN 1 AND 256),
  pin_kind TEXT NOT NULL CHECK (pin_kind IN (
    'latest','prior','recovery','release','decision','fact_reference','revision_reference',
    'security','unresolved','manual'
  )),
  state TEXT NOT NULL CHECK (state IN ('active','released')),
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 1000),
  source_relation TEXT,
  source_key TEXT,
  actor_principal TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CHECK (source_relation IS NULL OR source_relation ~ '^public[.][a-z][a-z0-9_]*$')
);
CREATE INDEX IF NOT EXISTS idx_retention_archive_pin_stream_v1
  ON public.retention_archive_pin_events_v1
  (relation_name,row_key,pin_kind,recorded_at DESC,event_id DESC);

CREATE TABLE IF NOT EXISTS public.retention_archive_manifests_v1 (
  manifest_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  root_kind TEXT NOT NULL REFERENCES public.retention_archive_policies_v1(root_kind) ON DELETE RESTRICT,
  root_id UUID NOT NULL,
  policy_version TEXT NOT NULL,
  cutoff_at TIMESTAMPTZ NOT NULL,
  planned_snapshot_at TIMESTAMPTZ NOT NULL,
  schema_hash TEXT NOT NULL CHECK (schema_hash ~ '^[0-9a-f]{64}$'),
  closure_hash TEXT NOT NULL CHECK (closure_hash ~ '^[0-9a-f]{64}$'),
  expected_row_count INTEGER NOT NULL CHECK (expected_row_count > 0),
  expected_relation_counts JSONB NOT NULL CHECK (jsonb_typeof(expected_relation_counts) = 'object'),
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','exported','verified','superseded','failed')),
  archive_locator TEXT,
  archive_sha256 TEXT CHECK (archive_sha256 IS NULL OR archive_sha256 ~ '^[0-9a-f]{64}$'),
  archive_bytes BIGINT CHECK (archive_bytes IS NULL OR archive_bytes > 0),
  encrypted BOOLEAN NOT NULL DEFAULT FALSE,
  exported_at TIMESTAMPTZ,
  restore_environment_id TEXT,
  restored_row_count INTEGER,
  restored_closure_hash TEXT CHECK (restored_closure_hash IS NULL OR restored_closure_hash ~ '^[0-9a-f]{64}$'),
  restored_schema_hash TEXT CHECK (restored_schema_hash IS NULL OR restored_schema_hash ~ '^[0-9a-f]{64}$'),
  restore_verified_at TIMESTAMPTZ,
  failure_reason TEXT,
  created_by_principal TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (root_kind,root_id,closure_hash),
  CHECK (archive_locator IS NULL OR (
    archive_locator ~ '^backup/retention/[A-Za-z0-9._/-]+[.]sira$'
    AND archive_locator !~ '(^|/)[.][.]($|/)'
  )),
  CHECK ((status IN ('exported','verified')) =
    (archive_locator IS NOT NULL AND archive_sha256 IS NOT NULL AND archive_bytes IS NOT NULL AND encrypted)),
  CHECK ((status = 'verified') =
    (restore_environment_id IS NOT NULL AND restored_row_count IS NOT NULL
      AND restored_closure_hash IS NOT NULL AND restored_schema_hash IS NOT NULL
      AND restore_verified_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_retention_archive_manifest_root_v1
  ON public.retention_archive_manifests_v1(root_kind,root_id,created_at DESC);

CREATE TABLE IF NOT EXISTS public.retention_archive_manifest_rows_v1 (
  manifest_id UUID NOT NULL REFERENCES public.retention_archive_manifests_v1(manifest_id) ON DELETE RESTRICT,
  relation_name TEXT NOT NULL CHECK (relation_name ~ '^public[.][a-z][a-z0-9_]*$'),
  row_key TEXT NOT NULL CHECK (length(row_key) BETWEEN 1 AND 256),
  row_hash TEXT NOT NULL CHECK (row_hash ~ '^[0-9a-f]{64}$'),
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  PRIMARY KEY (manifest_id,relation_name,row_key),
  UNIQUE (manifest_id,ordinal)
);

CREATE OR REPLACE FUNCTION public.retention_archive_active_pins_v1()
RETURNS TABLE(relation_name TEXT,row_key TEXT,pin_kind TEXT,source_relation TEXT,source_key TEXT)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
  WITH explicit_event AS (
    SELECT DISTINCT ON (event.relation_name,event.row_key,event.pin_kind)
      event.relation_name,event.row_key,event.pin_kind,event.state,event.source_relation,event.source_key
    FROM public.retention_archive_pin_events_v1 event
    ORDER BY event.relation_name,event.row_key,event.pin_kind,event.recorded_at DESC,event.event_id DESC
  ), ranked_detail AS (
    SELECT detail.id,detail.research_run_id,
      row_number() OVER (PARTITION BY detail.stock_id ORDER BY detail.available_at DESC,detail.created_at DESC,detail.id DESC) AS revision_rank
    FROM public.candidate_detail_snapshots detail
  ), ranked_recovery_snapshot AS (
    SELECT snapshot.id,state.window_key,
      row_number() OVER (
        PARTITION BY state.window_key
        ORDER BY snapshot.published_at DESC,snapshot.id DESC
      ) AS recovery_rank
    FROM public.radar_publication_state state
    JOIN public.radar_public_snapshots snapshot
      ON snapshot.window_key=state.window_key
     AND snapshot.status='valid'
     AND snapshot.id IS DISTINCT FROM state.last_success_snapshot_id
  )
  SELECT event.relation_name,event.row_key,event.pin_kind,event.source_relation,event.source_key
  FROM explicit_event event WHERE event.state='active'
  UNION ALL
  SELECT 'public.candidate_detail_snapshots',ranked.id::TEXT,
    CASE WHEN ranked.revision_rank=1 THEN 'latest' ELSE 'prior' END,
    'public.candidate_detail_snapshots',ranked.id::TEXT
  FROM ranked_detail ranked WHERE ranked.revision_rank<=2
  UNION ALL
  SELECT 'public.candidate_research_runs',ranked.research_run_id::TEXT,
    CASE WHEN ranked.revision_rank=1 THEN 'latest' ELSE 'prior' END,
    'public.candidate_detail_snapshots',ranked.id::TEXT
  FROM ranked_detail ranked WHERE ranked.revision_rank<=2 AND ranked.research_run_id IS NOT NULL
  UNION ALL
  SELECT 'public.candidate_detail_snapshots',stage.detail_revision_id::TEXT,'decision',
    'public.candidate_daily_stage_snapshots',stage.id::TEXT
  FROM public.candidate_daily_stage_snapshots stage WHERE stage.detail_revision_id IS NOT NULL
  UNION ALL
  SELECT 'public.candidate_research_runs',detail.research_run_id::TEXT,'decision',
    'public.candidate_daily_stage_snapshots',stage.id::TEXT
  FROM public.candidate_daily_stage_snapshots stage
  JOIN public.candidate_detail_snapshots detail ON detail.id=stage.detail_revision_id
  WHERE detail.research_run_id IS NOT NULL
  UNION ALL
  SELECT 'public.candidate_official_facts',fact.value,'fact_reference',
    'public.candidate_detail_snapshots',detail.id::TEXT
  FROM public.candidate_detail_snapshots detail
  CROSS JOIN LATERAL jsonb_array_elements_text(
    CASE WHEN jsonb_typeof(detail.fact_ids)='array' THEN detail.fact_ids ELSE '[]'::jsonb END
  ) fact
  UNION ALL
  SELECT 'public.candidate_detail_snapshots',bundle.revision_id::TEXT,'revision_reference',
    'public.candidate_dossier_bundles',bundle.bundle_id::TEXT
  FROM public.candidate_dossier_bundles bundle
  UNION ALL
  SELECT 'public.radar_public_snapshots',state.last_success_snapshot_id::TEXT,'release',
    'public.radar_publication_state',state.window_key
  FROM public.radar_publication_state state WHERE state.last_success_snapshot_id IS NOT NULL
  UNION ALL
  SELECT 'public.radar_public_snapshots',snapshot.id::TEXT,'recovery',
    'public.radar_publication_state',snapshot.window_key
  FROM ranked_recovery_snapshot snapshot WHERE snapshot.recovery_rank=1
  UNION ALL
  SELECT 'public.source_run_ledger',mention.source_run_ledger_id::TEXT,'decision',
    'public.candidate_source_mentions',mention.id::TEXT
  FROM public.candidate_source_mentions mention WHERE mention.source_run_ledger_id IS NOT NULL;
$function$;

CREATE OR REPLACE FUNCTION public.retention_archive_eligibility_v1(
  p_root_kind TEXT,p_root_id UUID,p_now TIMESTAMPTZ DEFAULT clock_timestamp()
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE
  v_days INTEGER;
  v_cutoff TIMESTAMPTZ;
  v_rows JSONB := '[]'::jsonb;
  v_terminal BOOLEAN := FALSE;
  v_blockers JSONB := '[]'::jsonb;
  v_relation TEXT;
BEGIN
  SELECT retention_days INTO v_days FROM public.retention_archive_policies_v1
  WHERE root_kind=p_root_kind AND enabled;
  IF v_days IS NULL THEN RAISE EXCEPTION 'retention_policy_disabled_or_unknown'; END IF;
  v_cutoff:=p_now-make_interval(days=>v_days);

  IF p_root_kind='candidate_research_run' THEN
    v_relation:='public.candidate_research_runs';
    SELECT run.status='success' AND run.finished_at IS NOT NULL AND run.finished_at<v_cutoff
      AND NOT EXISTS (
        SELECT 1 FROM public.candidate_research_run_items item
        WHERE item.run_id=run.id AND item.status IS DISTINCT FROM 'success'
      ) INTO v_terminal
    FROM public.candidate_research_runs run WHERE run.id=p_root_id;
    SELECT coalesce(jsonb_agg(row_spec ORDER BY relation_name,row_key),'[]'::jsonb) INTO v_rows FROM (
      SELECT 'public.candidate_research_runs' relation_name,run.id::TEXT row_key,
        jsonb_build_object('relation','public.candidate_research_runs','key',run.id::TEXT) row_spec
      FROM public.candidate_research_runs run WHERE run.id=p_root_id
      UNION ALL
      SELECT 'public.candidate_research_run_items',item.id::TEXT,
        jsonb_build_object('relation','public.candidate_research_run_items','key',item.id::TEXT)
      FROM public.candidate_research_run_items item WHERE item.run_id=p_root_id
    ) closure;
  ELSIF p_root_kind='connector_run' THEN
    v_relation:='public.connector_runs';
    SELECT run.status IN ('success','skipped') AND run.finished_at IS NOT NULL AND run.finished_at<v_cutoff
      AND NOT coalesce(run.metadata,'{}'::jsonb) @> '{"unresolved":true}'::jsonb
      AND NOT coalesce(run.metadata,'{}'::jsonb) @> '{"recovery_required":true}'::jsonb
      AND NOT EXISTS (
        SELECT 1 FROM public.source_audits audit
        WHERE audit.connector_run_id=run.id AND (
          audit.status IS DISTINCT FROM 'success'
          OR coalesce(audit.metadata,'{}'::jsonb) @> '{"unresolved":true}'::jsonb
          OR coalesce(audit.metadata,'{}'::jsonb) @> '{"recovery_required":true}'::jsonb
          OR coalesce(audit.metadata,'{}'::jsonb) @> '{"security_event":true}'::jsonb
        )
      ) INTO v_terminal
    FROM public.connector_runs run WHERE run.id=p_root_id;
    SELECT coalesce(jsonb_agg(row_spec ORDER BY relation_name,row_key),'[]'::jsonb) INTO v_rows FROM (
      SELECT 'public.connector_runs' relation_name,run.id::TEXT row_key,
        jsonb_build_object('relation','public.connector_runs','key',run.id::TEXT) row_spec
      FROM public.connector_runs run WHERE run.id=p_root_id
      UNION ALL
      SELECT 'public.source_audits',audit.id::TEXT,
        jsonb_build_object('relation','public.source_audits','key',audit.id::TEXT)
      FROM public.source_audits audit WHERE audit.connector_run_id=p_root_id
    ) closure;
  ELSIF p_root_kind='source_run_ledger' THEN
    v_relation:='public.source_run_ledger';
    SELECT terminal_reason IN ('successful_empty','duplicate_only') AND attempted_at<v_cutoff INTO v_terminal
    FROM public.source_run_ledger WHERE id=p_root_id;
    SELECT coalesce(jsonb_agg(jsonb_build_object('relation','public.source_run_ledger','key',id::TEXT)),'[]'::jsonb)
      INTO v_rows FROM public.source_run_ledger WHERE id=p_root_id;
  ELSIF p_root_kind='worker_job_run' THEN
    v_relation:='public.worker_job_runs';
    SELECT status='success' AND finished_at IS NOT NULL AND finished_at<v_cutoff
      AND NOT coalesce(metadata,'{}'::jsonb) @> '{"unresolved":true}'::jsonb
      AND NOT coalesce(metadata,'{}'::jsonb) @> '{"recovery_required":true}'::jsonb
      AND NOT coalesce(metadata,'{}'::jsonb) @> '{"security_event":true}'::jsonb
      INTO v_terminal
    FROM public.worker_job_runs WHERE id=p_root_id;
    SELECT coalesce(jsonb_agg(jsonb_build_object('relation','public.worker_job_runs','key',id::TEXT)),'[]'::jsonb)
      INTO v_rows FROM public.worker_job_runs WHERE id=p_root_id;
  ELSIF p_root_kind='source_audit' THEN
    v_relation:='public.source_audits';
    SELECT status='success' AND created_at<v_cutoff
      AND NOT coalesce(metadata,'{}'::jsonb) @> '{"unresolved":true}'::jsonb
      AND NOT coalesce(metadata,'{}'::jsonb) @> '{"recovery_required":true}'::jsonb
      AND NOT coalesce(metadata,'{}'::jsonb) @> '{"security_event":true}'::jsonb
      INTO v_terminal FROM public.source_audits WHERE id=p_root_id;
    SELECT coalesce(jsonb_agg(jsonb_build_object('relation','public.source_audits','key',id::TEXT)),'[]'::jsonb)
      INTO v_rows FROM public.source_audits WHERE id=p_root_id;
  ELSIF p_root_kind='worker_log' THEN
    v_relation:='public.worker_logs';
    SELECT lower(level) NOT IN ('warn','warning','error','critical','security','audit')
      AND created_at<v_cutoff
      AND NOT coalesce(metadata,'{}'::jsonb) @> '{"unresolved":true}'::jsonb
      AND NOT coalesce(metadata,'{}'::jsonb) @> '{"recovery_required":true}'::jsonb
      INTO v_terminal FROM public.worker_logs WHERE id=p_root_id;
    SELECT coalesce(jsonb_agg(jsonb_build_object('relation','public.worker_logs','key',id::TEXT)),'[]'::jsonb)
      INTO v_rows FROM public.worker_logs WHERE id=p_root_id;
  ELSIF p_root_kind='runtime_artifact' THEN
    v_relation:='public.runtime_artifacts';
    SELECT created_at<v_cutoff AND artifact_key !~* '(latest|release|recovery)'
      AND NOT coalesce(metadata,'{}'::jsonb) @> '{"pinned":true}'::jsonb
      AND NOT coalesce(metadata,'{}'::jsonb) @> '{"unresolved":true}'::jsonb
      AND NOT coalesce(metadata,'{}'::jsonb) @> '{"recovery_required":true}'::jsonb
      AND NOT coalesce(metadata,'{}'::jsonb) @> '{"security_event":true}'::jsonb
      INTO v_terminal FROM public.runtime_artifacts WHERE id=p_root_id;
    SELECT coalesce(jsonb_agg(jsonb_build_object('relation','public.runtime_artifacts','key',id::TEXT)),'[]'::jsonb)
      INTO v_rows FROM public.runtime_artifacts WHERE id=p_root_id;
  END IF;

  IF jsonb_array_length(v_rows)=0 THEN v_blockers:=v_blockers||'[{"code":"root_not_found"}]'::jsonb; END IF;
  IF NOT coalesce(v_terminal,FALSE) THEN v_blockers:=v_blockers||'[{"code":"not_terminal_or_retention_not_elapsed"}]'::jsonb; END IF;
  IF EXISTS (
    SELECT 1 FROM public.retention_archive_active_pins_v1() pin
    JOIN jsonb_array_elements(v_rows) row_spec
      ON pin.relation_name=row_spec->>'relation' AND pin.row_key=row_spec->>'key'
  ) THEN v_blockers:=v_blockers||'[{"code":"active_pin"}]'::jsonb; END IF;

  RETURN jsonb_build_object(
    'eligible',jsonb_array_length(v_blockers)=0,'rootKind',p_root_kind,'rootId',p_root_id,
    'rootRelation',v_relation,'cutoffAt',v_cutoff,'rows',v_rows,'blockers',v_blockers,
    'policyVersion','retention-v1'
  );
END;
$function$;

CREATE INDEX IF NOT EXISTS idx_candidate_research_runs_retention_v1
  ON public.candidate_research_runs(finished_at,id) WHERE status='success' AND finished_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_connector_runs_retention_v1
  ON public.connector_runs(finished_at,id) WHERE status IN ('success','skipped') AND finished_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_source_run_ledger_retention_v1
  ON public.source_run_ledger(attempted_at,id) WHERE terminal_reason IN ('successful_empty','duplicate_only');
CREATE INDEX IF NOT EXISTS idx_worker_job_runs_retention_v1
  ON public.worker_job_runs(finished_at,id) WHERE status='success' AND finished_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_source_audits_retention_v1
  ON public.source_audits(created_at,id) WHERE status='success';
CREATE INDEX IF NOT EXISTS idx_worker_logs_retention_v1
  ON public.worker_logs(created_at,id) WHERE lower(level) NOT IN ('warn','warning','error','critical','security','audit');
CREATE INDEX IF NOT EXISTS idx_runtime_artifacts_retention_v1
  ON public.runtime_artifacts(created_at,id);

CREATE OR REPLACE FUNCTION public.list_retention_archive_candidates_v1(
  p_root_kind TEXT,p_now TIMESTAMPTZ DEFAULT clock_timestamp(),p_limit INTEGER DEFAULT 100
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE v_result JSONB;
BEGIN
  IF p_limit<1 OR p_limit>1000 THEN RAISE EXCEPTION 'retention_candidate_limit_invalid'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.retention_archive_policies_v1 WHERE root_kind=p_root_kind AND enabled) THEN
    RAISE EXCEPTION 'retention_policy_disabled_or_unknown';
  END IF;
  WITH candidates AS (
    SELECT id,finished_at observed_at FROM public.candidate_research_runs
      WHERE p_root_kind='candidate_research_run' AND status='success'
        AND finished_at<p_now-interval '90 days'
        AND NOT EXISTS (
          SELECT 1 FROM public.candidate_research_run_items item
          WHERE item.run_id=candidate_research_runs.id AND item.status IS DISTINCT FROM 'success'
        )
    UNION ALL
    SELECT id,finished_at FROM public.connector_runs
      WHERE p_root_kind='connector_run' AND status IN ('success','skipped')
        AND finished_at<p_now-interval '90 days'
        AND NOT coalesce(metadata,'{}'::jsonb) @> '{"unresolved":true}'::jsonb
        AND NOT coalesce(metadata,'{}'::jsonb) @> '{"recovery_required":true}'::jsonb
        AND NOT EXISTS (
          SELECT 1 FROM public.source_audits audit
          WHERE audit.connector_run_id=connector_runs.id AND (
            audit.status IS DISTINCT FROM 'success'
            OR coalesce(audit.metadata,'{}'::jsonb) @> '{"unresolved":true}'::jsonb
            OR coalesce(audit.metadata,'{}'::jsonb) @> '{"recovery_required":true}'::jsonb
            OR coalesce(audit.metadata,'{}'::jsonb) @> '{"security_event":true}'::jsonb
          )
        )
    UNION ALL
    SELECT id,attempted_at FROM public.source_run_ledger
      WHERE p_root_kind='source_run_ledger' AND terminal_reason IN ('successful_empty','duplicate_only')
        AND attempted_at<p_now-interval '30 days'
    UNION ALL
    SELECT id,finished_at FROM public.worker_job_runs
      WHERE p_root_kind='worker_job_run' AND status='success'
        AND finished_at<p_now-interval '90 days'
        AND NOT coalesce(metadata,'{}'::jsonb) @> '{"unresolved":true}'::jsonb
        AND NOT coalesce(metadata,'{}'::jsonb) @> '{"recovery_required":true}'::jsonb
        AND NOT coalesce(metadata,'{}'::jsonb) @> '{"security_event":true}'::jsonb
    UNION ALL
    SELECT id,created_at FROM public.source_audits
      WHERE p_root_kind='source_audit' AND status='success'
        AND created_at<p_now-interval '30 days'
        AND NOT coalesce(metadata,'{}'::jsonb) @> '{"unresolved":true}'::jsonb
        AND NOT coalesce(metadata,'{}'::jsonb) @> '{"recovery_required":true}'::jsonb
        AND NOT coalesce(metadata,'{}'::jsonb) @> '{"security_event":true}'::jsonb
    UNION ALL
    SELECT id,created_at FROM public.worker_logs
      WHERE p_root_kind='worker_log'
        AND lower(level) NOT IN ('warn','warning','error','critical','security','audit')
        AND created_at<p_now-interval '30 days'
        AND NOT coalesce(metadata,'{}'::jsonb) @> '{"unresolved":true}'::jsonb
        AND NOT coalesce(metadata,'{}'::jsonb) @> '{"recovery_required":true}'::jsonb
    UNION ALL
    SELECT id,created_at FROM public.runtime_artifacts
      WHERE p_root_kind='runtime_artifact' AND created_at<p_now-interval '90 days'
        AND artifact_key !~* '(latest|release|recovery)'
        AND NOT coalesce(metadata,'{}'::jsonb) @> '{"pinned":true}'::jsonb
        AND NOT coalesce(metadata,'{}'::jsonb) @> '{"unresolved":true}'::jsonb
        AND NOT coalesce(metadata,'{}'::jsonb) @> '{"recovery_required":true}'::jsonb
        AND NOT coalesce(metadata,'{}'::jsonb) @> '{"security_event":true}'::jsonb
  ), bounded AS (
    SELECT * FROM candidates ORDER BY observed_at,id LIMIT p_limit
  ), evaluated AS (
    SELECT bounded.id,bounded.observed_at,
      public.retention_archive_eligibility_v1(p_root_kind,bounded.id,p_now) eligibility
    FROM bounded
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'rootKind',p_root_kind,'rootId',id,'observedAt',observed_at,
    'eligible',(eligibility->>'eligible')::BOOLEAN,'blockers',eligibility->'blockers',
    'rowCount',jsonb_array_length(eligibility->'rows')
  ) ORDER BY observed_at,id),'[]'::jsonb) INTO v_result FROM evaluated;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.prepare_retention_archive_manifest_v1(
  p_root_kind TEXT,p_root_id UUID,p_planned_snapshot_at TIMESTAMPTZ,p_schema_hash TEXT,
  p_closure_hash TEXT,p_relation_counts JSONB,p_rows JSONB,p_created_by_principal TEXT
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE v_eligibility JSONB; v_manifest UUID; v_row JSONB; v_ordinal INTEGER:=0; v_requested_rows JSONB;
  v_computed_closure_hash TEXT; v_computed_relation_counts JSONB;
BEGIN
  IF p_schema_hash !~ '^[0-9a-f]{64}$' OR p_closure_hash !~ '^[0-9a-f]{64}$'
    OR jsonb_typeof(p_relation_counts)<>'object' OR jsonb_typeof(p_rows)<>'array'
    OR length(trim(coalesce(p_created_by_principal,'')))=0 THEN
    RAISE EXCEPTION 'retention_manifest_input_invalid';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_rows) row_spec
    WHERE coalesce(row_spec->>'relation','') !~ '^public[.][a-z][a-z0-9_]*$'
      OR coalesce(row_spec->>'key','') !~ '^[0-9a-fA-F-]{36}$'
      OR coalesce(row_spec->>'rowHash','') !~ '^[0-9a-f]{64}$') THEN
    RAISE EXCEPTION 'retention_manifest_row_invalid';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('relation',row_spec->>'relation','key',row_spec->>'key')
    ORDER BY row_spec->>'relation',row_spec->>'key'),'[]'::jsonb)
    INTO v_requested_rows FROM jsonb_array_elements(p_rows) row_spec;
  SELECT encode(digest(convert_to(coalesce(string_agg(
      (row_spec->>'relation')||'|'||(row_spec->>'key')||'|'||(row_spec->>'rowHash')||E'\n',''
      ORDER BY row_spec->>'relation',row_spec->>'key'),''),'UTF8'),'sha256'),'hex')
    INTO v_computed_closure_hash FROM jsonb_array_elements(p_rows) row_spec;
  SELECT coalesce(jsonb_object_agg(relation_name,row_count),'{}'::jsonb)
    INTO v_computed_relation_counts FROM (
      SELECT row_spec->>'relation' relation_name,count(*) row_count
      FROM jsonb_array_elements(p_rows) row_spec GROUP BY row_spec->>'relation'
    ) counts;
  IF v_computed_closure_hash IS DISTINCT FROM p_closure_hash
    OR v_computed_relation_counts IS DISTINCT FROM p_relation_counts THEN
    RAISE EXCEPTION 'retention_manifest_summary_mismatch';
  END IF;
  v_eligibility:=public.retention_archive_eligibility_v1(p_root_kind,p_root_id,p_planned_snapshot_at);
  IF NOT coalesce((v_eligibility->>'eligible')::BOOLEAN,FALSE) THEN
    RAISE EXCEPTION 'retention_root_not_eligible:%',v_eligibility->'blockers';
  END IF;
  IF v_eligibility->'rows' IS DISTINCT FROM v_requested_rows THEN RAISE EXCEPTION 'retention_closure_changed'; END IF;
  INSERT INTO public.retention_archive_manifests_v1(
    root_kind,root_id,policy_version,cutoff_at,planned_snapshot_at,schema_hash,closure_hash,
    expected_row_count,expected_relation_counts,created_by_principal
  ) VALUES (
    p_root_kind,p_root_id,v_eligibility->>'policyVersion',(v_eligibility->>'cutoffAt')::TIMESTAMPTZ,
    p_planned_snapshot_at,p_schema_hash,p_closure_hash,jsonb_array_length(p_rows),p_relation_counts,p_created_by_principal
  ) RETURNING manifest_id INTO v_manifest;
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    INSERT INTO public.retention_archive_manifest_rows_v1(manifest_id,relation_name,row_key,row_hash,ordinal)
    VALUES(v_manifest,v_row->>'relation',v_row->>'key',v_row->>'rowHash',v_ordinal);
    v_ordinal:=v_ordinal+1;
  END LOOP;
  RETURN v_manifest;
END;
$function$;

CREATE OR REPLACE FUNCTION public.retention_archive_current_row_hash_v1(p_relation TEXT,p_row_key TEXT)
RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE v_hash TEXT;
BEGIN
  IF p_row_key !~ '^[0-9a-fA-F-]{36}$' THEN RETURN NULL; END IF;
  CASE p_relation
    WHEN 'public.candidate_research_runs' THEN
      SELECT encode(digest(convert_to(to_jsonb(row_value)::TEXT,'UTF8'),'sha256'),'hex') INTO v_hash
        FROM public.candidate_research_runs row_value WHERE id=p_row_key::UUID;
    WHEN 'public.candidate_research_run_items' THEN
      SELECT encode(digest(convert_to(to_jsonb(row_value)::TEXT,'UTF8'),'sha256'),'hex') INTO v_hash
        FROM public.candidate_research_run_items row_value WHERE id=p_row_key::UUID;
    WHEN 'public.connector_runs' THEN
      SELECT encode(digest(convert_to(to_jsonb(row_value)::TEXT,'UTF8'),'sha256'),'hex') INTO v_hash
        FROM public.connector_runs row_value WHERE id=p_row_key::UUID;
    WHEN 'public.source_audits' THEN
      SELECT encode(digest(convert_to(to_jsonb(row_value)::TEXT,'UTF8'),'sha256'),'hex') INTO v_hash
        FROM public.source_audits row_value WHERE id=p_row_key::UUID;
    WHEN 'public.source_run_ledger' THEN
      SELECT encode(digest(convert_to(to_jsonb(row_value)::TEXT,'UTF8'),'sha256'),'hex') INTO v_hash
        FROM public.source_run_ledger row_value WHERE id=p_row_key::UUID;
    WHEN 'public.worker_job_runs' THEN
      SELECT encode(digest(convert_to(to_jsonb(row_value)::TEXT,'UTF8'),'sha256'),'hex') INTO v_hash
        FROM public.worker_job_runs row_value WHERE id=p_row_key::UUID;
    WHEN 'public.worker_logs' THEN
      SELECT encode(digest(convert_to(to_jsonb(row_value)::TEXT,'UTF8'),'sha256'),'hex') INTO v_hash
        FROM public.worker_logs row_value WHERE id=p_row_key::UUID;
    WHEN 'public.runtime_artifacts' THEN
      SELECT encode(digest(convert_to(to_jsonb(row_value)::TEXT,'UTF8'),'sha256'),'hex') INTO v_hash
        FROM public.runtime_artifacts row_value WHERE id=p_row_key::UUID;
    ELSE RAISE EXCEPTION 'retention_relation_not_allowlisted';
  END CASE;
  RETURN v_hash;
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_retention_archive_export_v1(
  p_manifest_id UUID,p_archive_locator TEXT,p_archive_sha256 TEXT,p_archive_bytes BIGINT,p_exported_at TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
BEGIN
  IF p_archive_locator !~ '^backup/retention/[A-Za-z0-9._/-]+[.]sira$'
    OR p_archive_locator ~ '(^|/)[.][.]($|/)' OR p_archive_sha256 !~ '^[0-9a-f]{64}$'
    OR p_archive_bytes<=0 THEN RAISE EXCEPTION 'retention_export_receipt_invalid'; END IF;
  UPDATE public.retention_archive_manifests_v1 SET status='exported',archive_locator=p_archive_locator,
    archive_sha256=p_archive_sha256,archive_bytes=p_archive_bytes,encrypted=TRUE,exported_at=p_exported_at
  WHERE manifest_id=p_manifest_id AND status='planned';
  IF NOT FOUND THEN RAISE EXCEPTION 'retention_manifest_not_planned'; END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_retention_archive_restore_v1(
  p_manifest_id UUID,p_restore_environment_id TEXT,p_restored_row_count INTEGER,
  p_restored_closure_hash TEXT,p_restored_schema_hash TEXT,p_verified_at TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE v_manifest public.retention_archive_manifests_v1%ROWTYPE;
BEGIN
  SELECT * INTO v_manifest FROM public.retention_archive_manifests_v1 WHERE manifest_id=p_manifest_id FOR UPDATE;
  IF v_manifest.status<>'exported' THEN RAISE EXCEPTION 'retention_manifest_not_exported'; END IF;
  IF length(trim(coalesce(p_restore_environment_id,'')))=0 OR p_restore_environment_id='source'
    OR p_restored_row_count<>v_manifest.expected_row_count
    OR p_restored_closure_hash IS DISTINCT FROM v_manifest.closure_hash
    OR p_restored_schema_hash IS DISTINCT FROM v_manifest.schema_hash THEN
    RAISE EXCEPTION 'retention_restore_verification_mismatch';
  END IF;
  UPDATE public.retention_archive_manifests_v1 SET status='verified',restore_environment_id=p_restore_environment_id,
    restored_row_count=p_restored_row_count,restored_closure_hash=p_restored_closure_hash,
    restored_schema_hash=p_restored_schema_hash,restore_verified_at=p_verified_at
  WHERE manifest_id=p_manifest_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.retention_archive_deletion_readiness_v1(p_manifest_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE v_manifest public.retention_archive_manifests_v1%ROWTYPE; v_eligibility JSONB; v_blockers JSONB:='[]'::jsonb;
BEGIN
  SELECT * INTO v_manifest FROM public.retention_archive_manifests_v1 WHERE manifest_id=p_manifest_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ready',FALSE,'blockers',jsonb_build_array(jsonb_build_object('code','manifest_not_found'))); END IF;
  IF v_manifest.status<>'verified' THEN v_blockers:=v_blockers||'[{"code":"restore_not_verified"}]'::jsonb; END IF;
  v_eligibility:=public.retention_archive_eligibility_v1(v_manifest.root_kind,v_manifest.root_id,clock_timestamp());
  IF NOT coalesce((v_eligibility->>'eligible')::BOOLEAN,FALSE) THEN
    v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','eligibility_changed','detail',v_eligibility->'blockers'));
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.retention_archive_active_pins_v1() pin
    JOIN public.retention_archive_manifest_rows_v1 archived
      ON archived.manifest_id=p_manifest_id AND archived.relation_name=pin.relation_name AND archived.row_key=pin.row_key
  ) THEN v_blockers:=v_blockers||'[{"code":"pin_added_after_export"}]'::jsonb; END IF;
  IF EXISTS (
    SELECT 1 FROM public.retention_archive_manifest_rows_v1 archived
    WHERE archived.manifest_id=p_manifest_id
      AND public.retention_archive_current_row_hash_v1(archived.relation_name,archived.row_key)
        IS DISTINCT FROM archived.row_hash
  ) THEN v_blockers:=v_blockers||'[{"code":"row_changed_or_missing_after_export"}]'::jsonb; END IF;
  RETURN jsonb_build_object('ready',jsonb_array_length(v_blockers)=0,'manifestId',p_manifest_id,
    'blockers',v_blockers,'deleteRpcAvailable',FALSE,'requiresSeparateReviewedDeletionExecutor',TRUE);
END;
$function$;

CREATE OR REPLACE FUNCTION public.reject_retention_archive_direct_mutation_v1()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $function$
BEGIN
  IF current_setting('stockinsider.retention_rpc_transition',TRUE) IS DISTINCT FROM 'allowed' THEN
    RAISE EXCEPTION 'retention_archive_direct_mutation_rejected' USING ERRCODE='55000';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$function$;

-- State can change only inside the two reviewed SECURITY DEFINER functions.
ALTER FUNCTION public.record_retention_archive_export_v1(UUID,TEXT,TEXT,BIGINT,TIMESTAMPTZ)
  SET stockinsider.retention_rpc_transition='allowed';
ALTER FUNCTION public.record_retention_archive_restore_v1(UUID,TEXT,INTEGER,TEXT,TEXT,TIMESTAMPTZ)
  SET stockinsider.retention_rpc_transition='allowed';
DROP TRIGGER IF EXISTS trg_retention_archive_manifests_guard_v1 ON public.retention_archive_manifests_v1;
CREATE TRIGGER trg_retention_archive_manifests_guard_v1 BEFORE UPDATE OR DELETE
  ON public.retention_archive_manifests_v1 FOR EACH ROW EXECUTE FUNCTION public.reject_retention_archive_direct_mutation_v1();
DROP TRIGGER IF EXISTS trg_retention_archive_rows_guard_v1 ON public.retention_archive_manifest_rows_v1;
CREATE TRIGGER trg_retention_archive_rows_guard_v1 BEFORE UPDATE OR DELETE
  ON public.retention_archive_manifest_rows_v1 FOR EACH ROW EXECUTE FUNCTION public.reject_retention_archive_direct_mutation_v1();
DROP TRIGGER IF EXISTS trg_retention_archive_pins_guard_v1 ON public.retention_archive_pin_events_v1;
CREATE TRIGGER trg_retention_archive_pins_guard_v1 BEFORE UPDATE OR DELETE
  ON public.retention_archive_pin_events_v1 FOR EACH ROW EXECUTE FUNCTION public.reject_retention_archive_direct_mutation_v1();

ALTER TABLE public.retention_archive_policies_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retention_archive_pin_events_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retention_archive_manifests_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retention_archive_manifest_rows_v1 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service role reads retention policies v1" ON public.retention_archive_policies_v1;
CREATE POLICY "service role reads retention policies v1"
  ON public.retention_archive_policies_v1 FOR SELECT TO service_role USING (TRUE);
DROP POLICY IF EXISTS "service role appends retention pins v1" ON public.retention_archive_pin_events_v1;
CREATE POLICY "service role appends retention pins v1"
  ON public.retention_archive_pin_events_v1 FOR INSERT TO service_role WITH CHECK (TRUE);
DROP POLICY IF EXISTS "service role reads retention pins v1" ON public.retention_archive_pin_events_v1;
CREATE POLICY "service role reads retention pins v1"
  ON public.retention_archive_pin_events_v1 FOR SELECT TO service_role USING (TRUE);
DROP POLICY IF EXISTS "service role reads retention manifests v1" ON public.retention_archive_manifests_v1;
CREATE POLICY "service role reads retention manifests v1"
  ON public.retention_archive_manifests_v1 FOR SELECT TO service_role USING (TRUE);
DROP POLICY IF EXISTS "service role reads retention manifest rows v1" ON public.retention_archive_manifest_rows_v1;
CREATE POLICY "service role reads retention manifest rows v1"
  ON public.retention_archive_manifest_rows_v1 FOR SELECT TO service_role USING (TRUE);
REVOKE ALL ON public.retention_archive_policies_v1,public.retention_archive_pin_events_v1,
  public.retention_archive_manifests_v1,public.retention_archive_manifest_rows_v1 FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.retention_archive_policies_v1,public.retention_archive_pin_events_v1,
  public.retention_archive_manifests_v1,public.retention_archive_manifest_rows_v1 TO service_role;
GRANT INSERT ON public.retention_archive_pin_events_v1 TO service_role;
REVOKE ALL ON FUNCTION public.retention_archive_active_pins_v1(),
  public.retention_archive_eligibility_v1(TEXT,UUID,TIMESTAMPTZ),
  public.list_retention_archive_candidates_v1(TEXT,TIMESTAMPTZ,INTEGER),
  public.retention_archive_current_row_hash_v1(TEXT,TEXT),
  public.prepare_retention_archive_manifest_v1(TEXT,UUID,TIMESTAMPTZ,TEXT,TEXT,JSONB,JSONB,TEXT),
  public.record_retention_archive_export_v1(UUID,TEXT,TEXT,BIGINT,TIMESTAMPTZ),
  public.record_retention_archive_restore_v1(UUID,TEXT,INTEGER,TEXT,TEXT,TIMESTAMPTZ),
  public.retention_archive_deletion_readiness_v1(UUID),
  public.reject_retention_archive_direct_mutation_v1()
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.retention_archive_active_pins_v1(),
  public.retention_archive_eligibility_v1(TEXT,UUID,TIMESTAMPTZ),
  public.list_retention_archive_candidates_v1(TEXT,TIMESTAMPTZ,INTEGER),
  public.retention_archive_current_row_hash_v1(TEXT,TEXT),
  public.prepare_retention_archive_manifest_v1(TEXT,UUID,TIMESTAMPTZ,TEXT,TEXT,JSONB,JSONB,TEXT),
  public.record_retention_archive_export_v1(UUID,TEXT,TEXT,BIGINT,TIMESTAMPTZ),
  public.record_retention_archive_restore_v1(UUID,TEXT,INTEGER,TEXT,TEXT,TIMESTAMPTZ),
  public.retention_archive_deletion_readiness_v1(UUID)
  TO service_role;

COMMIT;
