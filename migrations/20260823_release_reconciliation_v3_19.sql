BEGIN;

-- V3.19 records release progress separately from producer state.  It is
-- append-only evidence: scheduler ownership and action authority remain
-- derived from the reviewed runtime, manifest and projection identities.
GRANT CREATE ON SCHEMA public TO legacy_correctness_rpc_owner;

CREATE TABLE IF NOT EXISTS public.legacy_release_checkpoints_v3_19 (
  checkpoint_id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  release_version text NOT NULL CHECK (release_version = 'v3.19'),
  phase text NOT NULL CHECK (phase IN (
    'workspace_ready','contract_passed','implementation_reviewed','runtime_staged',
    'run1_terminal','web_deployed','run2_terminal','verified','closed'
  )),
  source_commit_sha text CHECK (source_commit_sha IS NULL OR source_commit_sha ~ '^[0-9a-f]{40}$'),
  reviewed_tree_sha text CHECK (reviewed_tree_sha IS NULL OR reviewed_tree_sha ~ '^[0-9a-f]{40}$'),
  runtime_manifest_sha256 text CHECK (runtime_manifest_sha256 IS NULL OR runtime_manifest_sha256 ~ '^[0-9a-f]{64}$'),
  migration_level text CHECK (migration_level IS NULL OR migration_level = 'release-reconciliation-v3.19'),
  evidence_kind text NOT NULL CHECK (evidence_kind ~ '^[a-z][a-z0-9_]{2,63}$'),
  evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (release_version, phase),
  CHECK (
    phase NOT IN ('implementation_reviewed','runtime_staged','run1_terminal','web_deployed','run2_terminal','verified','closed')
    OR (source_commit_sha IS NOT NULL AND reviewed_tree_sha IS NOT NULL)
  ),
  CHECK (
    phase NOT IN ('runtime_staged','run1_terminal','web_deployed','run2_terminal','verified','closed')
    OR (runtime_manifest_sha256 IS NOT NULL AND migration_level = 'release-reconciliation-v3.19')
  )
);

CREATE INDEX IF NOT EXISTS legacy_release_checkpoints_v3_19_recorded_idx
  ON public.legacy_release_checkpoints_v3_19(recorded_at DESC, checkpoint_id);

ALTER TABLE public.legacy_release_checkpoints_v3_19 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legacy_release_checkpoints_v3_19 OWNER TO legacy_correctness_rpc_owner;

DO $immutable_trigger$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.legacy_release_checkpoints_v3_19'::regclass
      AND tgname = 'legacy_release_checkpoints_v3_19_immutable'
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER legacy_release_checkpoints_v3_19_immutable
      BEFORE UPDATE OR DELETE ON public.legacy_release_checkpoints_v3_19
      FOR EACH ROW EXECUTE FUNCTION public.legacy_correctness_immutable_v3_11();
  END IF;
END
$immutable_trigger$;

CREATE OR REPLACE FUNCTION public.read_legacy_release_checkpoints_v3_19()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $read$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'releaseVersion',row.release_version,
    'phase',row.phase,
    'sourceCommitSha',row.source_commit_sha,
    'reviewedTreeSha',row.reviewed_tree_sha,
    'runtimeManifestSha256',row.runtime_manifest_sha256,
    'migrationLevel',row.migration_level,
    'evidenceKind',row.evidence_kind,
    'evidenceSha256',row.evidence_sha256,
    'recordedAt',to_char(row.recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"')
  ) ORDER BY row.recorded_at,row.checkpoint_id),'[]'::jsonb)
  FROM public.legacy_release_checkpoints_v3_19 row;
$read$;

ALTER FUNCTION public.read_legacy_release_checkpoints_v3_19() OWNER TO legacy_correctness_rpc_owner;
REVOKE ALL ON TABLE public.legacy_release_checkpoints_v3_19 FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.read_legacy_release_checkpoints_v3_19() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_legacy_release_checkpoints_v3_19() TO service_role;

-- The producer used to freeze every retained source revision before source_sync.
-- This cursor records only the highest *consumed* revision timestamp.  A failed
-- run is not eligible as a later cursor and no source evidence is mutated.
CREATE TABLE IF NOT EXISTS public.legacy_source_sync_cursors_v3_19 (
  source_run_id uuid PRIMARY KEY REFERENCES public.legacy_producer_runs_v3_11(run_id) ON DELETE RESTRICT,
  source_document_high_water_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.legacy_source_sync_cursors_v3_19 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legacy_source_sync_cursors_v3_19 OWNER TO opportunity_v3_rpc_owner;

-- Existing last-good research stays in the V3.18 ledger. V3.19 begins from
-- documents that arrive or change after this reviewed reconciliation, instead
-- of reprocessing the historical corpus as if it were fresh.
INSERT INTO public.legacy_source_sync_cursors_v3_19(source_run_id,source_document_high_water_at)
SELECT latest.run_id,max(revision.recorded_at)
FROM (
  SELECT run.run_id
  FROM public.legacy_producer_runs_v3_11 run
  WHERE run.status='success'
  ORDER BY run.source_cutoff DESC,run.terminal_at DESC,run.run_id DESC
  LIMIT 1
) latest
JOIN public.source_document_revisions_v3 revision ON true
GROUP BY latest.run_id
ON CONFLICT(source_run_id) DO NOTHING;

-- Replace the two selected-revision scans in the reviewed authority reader
-- with the latest successful consumed cursor.  The exact predecessor shape is
-- checked before replacement so a future edit fails rather than silently
-- widening or weakening selection.
DO $v319_cursor_selection$
DECLARE v_definition text;v_old integer;v_new integer;
BEGIN
  SELECT pg_get_functiondef('public.read_legacy_discovery_authority_v3_11(uuid,text,text)'::regprocedure)
    INTO STRICT v_definition;
  v_old:=(length(v_definition)-length(replace(v_definition,
    'd.collected_at<=v_run.source_cutoff AND d.recorded_at<=v_run.source_cutoff','')))
    /length('d.collected_at<=v_run.source_cutoff AND d.recorded_at<=v_run.source_cutoff');
  v_new:=(length(v_definition)-length(replace(v_definition,
    'legacy_source_sync_cursors_v3_19','')))/length('legacy_source_sync_cursors_v3_19');
  IF v_old=2 AND v_new=0 THEN
    v_definition:=replace(v_definition,
      'd.collected_at<=v_run.source_cutoff AND d.recorded_at<=v_run.source_cutoff',
      $$d.collected_at<=v_run.source_cutoff AND d.recorded_at<=v_run.source_cutoff
          AND d.recorded_at>coalesce((
            SELECT cursor.source_document_high_water_at
            FROM public.legacy_producer_runs_v3_11 prior
            JOIN public.legacy_source_sync_cursors_v3_19 cursor ON cursor.source_run_id=prior.run_id
            WHERE prior.status='success' AND prior.source_cutoff<v_run.source_cutoff
            ORDER BY prior.source_cutoff DESC,prior.terminal_at DESC,prior.run_id DESC LIMIT 1
          ),'-infinity'::timestamptz)$$);
    EXECUTE v_definition;
  ELSIF NOT(v_old=0 AND v_new=2) THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='v319_source_cursor_predecessor_conflict';
  END IF;
END $v319_cursor_selection$;

-- V3.13 persists the validated source acquisition during source_sync, but the
-- predecessor's shard list was frozen beforehand.  Preserve that immutable
-- predecessor, then append only same-run new revisions before the first mention
-- job is leased. Metadata-only and unchanged outcomes remain terminal evidence.
DO $v319_completion_rename$
BEGIN
  IF to_regprocedure('public.complete_legacy_producer_job_authoritative_v3_19(uuid,uuid,uuid,bytea,jsonb,text)') IS NULL THEN
    ALTER FUNCTION public.complete_legacy_producer_job_v3_11(uuid,uuid,uuid,bytea,jsonb,text)
      RENAME TO complete_legacy_producer_job_authoritative_v3_19;
  END IF;
END $v319_completion_rename$;

CREATE OR REPLACE FUNCTION public.complete_legacy_producer_job_v3_11(
  p_run uuid,p_job uuid,p_token uuid,p_result bytea,p_json jsonb,p_hash text
) RETURNS TABLE(status text,next_job jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $v319_completion$
DECLARE
  v_status text;v_next jsonb;v_stage text;v_initial_count integer;v_ordinal integer;
  v_first_ordinal integer:=NULL;v_first_revision uuid:=NULL;v_row record;v_selected jsonb;
  v_selected_bytes bytea;v_selected_hash text;v_payload jsonb;v_payload_bytes bytea;v_payload_hash text;
BEGIN
  SELECT job.stage::text INTO v_stage
  FROM public.legacy_producer_jobs_v3_11 job
  WHERE job.run_id=p_run AND job.job_id=p_job AND job.status='leased';
  SELECT completed.status,completed.next_job INTO v_status,v_next
  FROM public.complete_legacy_producer_job_authoritative_v3_19(p_run,p_job,p_token,p_result,p_json,p_hash) completed;
  IF v_status IS NULL THEN RETURN;END IF;
  IF v_stage<>'source_sync' OR v_status<>'running' THEN
    status:=v_status;next_job:=v_next;RETURN NEXT;RETURN;
  END IF;

  SELECT count(*) INTO v_initial_count
  FROM public.legacy_frozen_source_revisions_v3_11 frozen WHERE frozen.run_id=p_run;
  SELECT coalesce(max(frozen.selection_ordinal),-1)+1 INTO v_ordinal
  FROM public.legacy_frozen_source_revisions_v3_11 frozen WHERE frozen.run_id=p_run;
  FOR v_row IN
    SELECT revision.*
    FROM public.legacy_source_document_persistence_v3_13 persisted
    JOIN public.source_document_revisions_v3 revision ON revision.revision_id=persisted.revision_id
    WHERE persisted.source_run_id=p_run AND persisted.disposition='new_revision'
      AND revision.acquisition_status='complete'
      AND NOT EXISTS(SELECT 1 FROM public.legacy_frozen_source_revisions_v3_11 frozen
        WHERE frozen.run_id=p_run AND frozen.revision_id=revision.revision_id)
    ORDER BY revision.source_key,revision.recorded_at,revision.revision_id
  LOOP
    v_selected:=jsonb_build_array(v_row.source_key,v_row.revision_id,v_row.revision_family_key,
      v_row.approved_source_identity_id,v_row.stable_connector_document_id,
      CASE WHEN v_row.published_at IS NULL THEN NULL ELSE to_char(v_row.published_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') END,
      to_char(v_row.collected_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      v_row.raw_field_payload_algorithm_version,v_row.ingestion_content_revision_sha256,
      v_row.canonical_content_algorithm_version,v_row.ingestion_canonical_content_hash_v3);
    v_selected_bytes:=convert_to(v_selected::text,'utf8');
    v_selected_hash:=encode(extensions.digest(v_selected_bytes,'sha256'),'hex');
    INSERT INTO public.legacy_frozen_source_revisions_v3_11(run_id,selection_ordinal,source_key,revision_id,
      selected_revision_row_canonical,selected_revision_row_json,selected_revision_row_hash,
      raw_field_payload_algorithm_version,ingestion_content_revision_sha256,canonical_content_algorithm_version,
      canonical_content_sha256)
    VALUES(p_run,v_ordinal,v_row.source_key,v_row.revision_id,v_selected_bytes,v_selected,v_selected_hash,
      v_row.raw_field_payload_algorithm_version,v_row.ingestion_content_revision_sha256,
      v_row.canonical_content_algorithm_version,v_row.ingestion_canonical_content_hash_v3);
    IF v_first_ordinal IS NULL THEN v_first_ordinal:=v_ordinal;v_first_revision:=v_row.revision_id;END IF;
    v_ordinal:=v_ordinal+1;
  END LOOP;

  -- With no cursor-selected document the predecessor created a barrier. Turn
  -- that still-queued successor into the first fresh shard; terminal rows are
  -- never rewritten and the normal shard chain handles remaining revisions.
  IF v_initial_count=0 AND v_first_ordinal IS NOT NULL AND v_next->>'stage'='mention_claim_extraction' THEN
    v_payload:=jsonb_build_array('e6d9c09b8b552f5d9eaf389b76d2d90daa2d89578433d2a1ad63286888b3b743',
      p_hash,'mention_claim_extraction','revision_shard',v_first_ordinal,v_first_revision);
    v_payload_bytes:=convert_to(v_payload::text,'utf8');
    v_payload_hash:=encode(extensions.digest(v_payload_bytes,'sha256'),'hex');
    UPDATE public.legacy_producer_jobs_v3_11 job
    SET job_kind='revision_shard'::public.opportunity_legacy_producer_job_kind_v3_11,
      shard_ordinal=v_first_ordinal,revision_id=v_first_revision,input_hash=v_payload_hash,payload_hash=v_payload_hash
    WHERE job.job_id=(v_next->>'jobId')::uuid AND job.run_id=p_run AND job.status='queued'
      AND job.stage='mention_claim_extraction' AND job.job_kind='stage_barrier';
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='v319_same_run_successor_conflict';END IF;
    UPDATE public.legacy_producer_job_payloads_v3_11 payload
    SET payload_canonical=v_payload_bytes,payload_json=v_payload,payload_hash=v_payload_hash
    WHERE payload.job_id=(v_next->>'jobId')::uuid;
  END IF;

  INSERT INTO public.legacy_source_sync_cursors_v3_19(source_run_id,source_document_high_water_at)
  SELECT p_run,max(revision.recorded_at)
  FROM public.legacy_frozen_source_revisions_v3_11 frozen
  JOIN public.source_document_revisions_v3 revision ON revision.revision_id=frozen.revision_id
  WHERE frozen.run_id=p_run
  HAVING count(*)>0
  ON CONFLICT(source_run_id) DO NOTHING;
  status:=v_status;next_job:=v_next;RETURN NEXT;
END $v319_completion$;

ALTER FUNCTION public.complete_legacy_producer_job_v3_11(uuid,uuid,uuid,bytea,jsonb,text)
  OWNER TO opportunity_v3_rpc_owner;
REVOKE ALL ON TABLE public.legacy_source_sync_cursors_v3_19 FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.complete_legacy_producer_job_v3_11(uuid,uuid,uuid,bytea,jsonb,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_legacy_producer_job_v3_11(uuid,uuid,uuid,bytea,jsonb,text) TO service_role;

REVOKE CREATE ON SCHEMA public FROM legacy_correctness_rpc_owner;
COMMIT;
