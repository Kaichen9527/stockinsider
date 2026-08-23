BEGIN;

-- V3.19 records release progress separately from producer state.  It is
-- append-only evidence: scheduler ownership and action authority remain
-- derived from the reviewed runtime, manifest and projection identities.
-- These owner roles deliberately do not retain CREATE on public.  The
-- migration needs it transiently because PostgreSQL requires both ownership
-- of a replaced function and CREATE on its schema; role boundaries are reset
-- and revoked before COMMIT.
GRANT CREATE ON SCHEMA public TO legacy_correctness_rpc_owner,opportunity_v3_rpc_owner;

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

SET ROLE legacy_correctness_rpc_owner;

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

-- The V3.19 completion wrapper reads source revisions under the opportunity
-- owner, while the frozen ledger and job transport are deliberately owned by
-- legacy_correctness_rpc_owner.  Do not grant cross-owner DML: RLS would still
-- reject it and a grant would widen the table surface.  These two narrowly
-- scoped helpers validate the completed source job, mutate only its immutable
-- shard / queued successor, and are executable solely by the no-login
-- opportunity owner.
CREATE OR REPLACE FUNCTION public.append_legacy_source_shard_v3_19(
  p_run uuid,p_completed_source_job uuid,p_source_result_hash text,p_selected_rows jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $append_source_shard$
DECLARE
  v_initial_count integer;v_next_ordinal integer;v_first_ordinal integer:=NULL;
  v_first_revision uuid:=NULL;v_appended integer:=0;v_item jsonb;v_source_key public.source_key_v3;
  v_revision uuid;v_selected_bytes bytea;v_selected_hash text;v_inserted integer;
BEGIN
  IF p_source_result_hash !~ '^[0-9a-f]{64}$'
    OR jsonb_typeof(p_selected_rows)<>'array' OR jsonb_array_length(p_selected_rows)>200 THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='v319_source_shard_shape_invalid';
  END IF;
  PERFORM 1 FROM public.legacy_producer_jobs_v3_11 job
  JOIN public.legacy_producer_job_results_v3_11 result ON result.job_id=job.job_id
  WHERE job.run_id=p_run AND job.job_id=p_completed_source_job
    AND job.stage='source_sync' AND job.status='succeeded' AND result.result_hash=p_source_result_hash;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='v319_source_shard_predecessor_conflict';
  END IF;
  SELECT count(*),coalesce(max(frozen.selection_ordinal),-1)+1
  INTO v_initial_count,v_next_ordinal
  FROM public.legacy_frozen_source_revisions_v3_11 frozen WHERE frozen.run_id=p_run;
  FOR v_item IN SELECT item.value FROM jsonb_array_elements(p_selected_rows) item
  LOOP
    IF jsonb_typeof(v_item)<>'array' OR jsonb_array_length(v_item)<>11
      OR nullif(v_item->>0,'') IS NULL OR nullif(v_item->>1,'') IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='v319_source_shard_row_invalid';
    END IF;
    v_source_key:=(v_item->>0)::public.source_key_v3;
    v_revision:=(v_item->>1)::uuid;
    v_selected_bytes:=convert_to(v_item::text,'utf8');
    v_selected_hash:=encode(extensions.digest(v_selected_bytes,'sha256'),'hex');
    INSERT INTO public.legacy_frozen_source_revisions_v3_11(
      run_id,selection_ordinal,source_key,revision_id,selected_revision_row_canonical,
      selected_revision_row_json,selected_revision_row_hash,raw_field_payload_algorithm_version,
      ingestion_content_revision_sha256,canonical_content_algorithm_version,canonical_content_sha256
    ) VALUES(
      p_run,v_next_ordinal,v_source_key,v_revision,v_selected_bytes,v_item,v_selected_hash,
      v_item->>7,v_item->>8,v_item->>9,v_item->>10
    ) ON CONFLICT(run_id,revision_id) DO NOTHING;
    GET DIAGNOSTICS v_inserted=ROW_COUNT;
    IF v_inserted=1 THEN
      IF v_first_ordinal IS NULL THEN
        v_first_ordinal:=v_next_ordinal;v_first_revision:=v_revision;
      END IF;
      v_next_ordinal:=v_next_ordinal+1;v_appended:=v_appended+1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('initialCount',v_initial_count,'firstOrdinal',v_first_ordinal,
    'firstRevision',v_first_revision,'appended',v_appended);
END $append_source_shard$;

CREATE OR REPLACE FUNCTION public.schedule_legacy_source_shard_successor_v3_19(
  p_run uuid,p_completed_source_job uuid,p_successor_job uuid,p_source_result_hash text,
  p_first_ordinal integer,p_first_revision uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $schedule_successor$
DECLARE
  v_payload jsonb;v_payload_bytes bytea;v_payload_hash text;v_successor uuid;
  v_execution_ordinal integer;v_uuid_hash text;v_existing public.legacy_producer_jobs_v3_11%ROWTYPE;
BEGIN
  IF p_source_result_hash !~ '^[0-9a-f]{64}$' OR p_first_ordinal<0 OR p_first_revision IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='v319_same_run_successor_input_invalid';
  END IF;
  PERFORM 1 FROM public.legacy_producer_jobs_v3_11 job
  JOIN public.legacy_producer_job_results_v3_11 result ON result.job_id=job.job_id
  WHERE job.run_id=p_run AND job.job_id=p_completed_source_job
    AND job.stage='source_sync' AND job.status='succeeded' AND result.result_hash=p_source_result_hash;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='v319_same_run_successor_predecessor_conflict';
  END IF;
  SELECT job.execution_ordinal+1 INTO v_execution_ordinal
  FROM public.legacy_producer_jobs_v3_11 job
  WHERE job.job_id=p_successor_job AND job.run_id=p_run AND job.status='queued'
    AND job.stage='mention_claim_extraction' AND job.job_kind='stage_barrier'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='v319_same_run_successor_conflict';
  END IF;
  v_uuid_hash:=encode(extensions.digest(convert_to(
    'legacy-v319-source-shard:'||p_run::text||':'||p_first_ordinal::text||':'||p_first_revision::text,'utf8'),'sha256'),'hex');
  v_successor:=(substr(v_uuid_hash,1,8)||'-'||substr(v_uuid_hash,9,4)||'-'||substr(v_uuid_hash,13,4)||'-'||
    substr(v_uuid_hash,17,4)||'-'||substr(v_uuid_hash,21,12))::uuid;
  v_payload:=jsonb_build_array('e6d9c09b8b552f5d9eaf389b76d2d90daa2d89578433d2a1ad63286888b3b743',
    p_source_result_hash,'mention_claim_extraction','revision_shard',p_first_ordinal,p_first_revision);
  v_payload_bytes:=convert_to(v_payload::text,'utf8');
  v_payload_hash:=encode(extensions.digest(v_payload_bytes,'sha256'),'hex');
  UPDATE public.legacy_producer_jobs_v3_11 job
  SET status='cancelled',terminal_at=date_trunc('second',clock_timestamp()),failure_code='cancelled',
    owner_token_hash=NULL,leased_at=NULL,heartbeat_at=NULL,lease_expires_at=NULL
  WHERE job.job_id=p_successor_job AND job.status='queued';
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='v319_same_run_successor_transition_conflict';
  END IF;
  SELECT * INTO v_existing FROM public.legacy_producer_jobs_v3_11 job WHERE job.job_id=v_successor;
  IF v_existing.job_id IS NULL THEN
    INSERT INTO public.legacy_producer_jobs_v3_11(
      job_id,run_id,stage,job_kind,stage_ordinal,shard_ordinal,execution_ordinal,revision_id,
      predecessor_job_id,input_hash,payload_hash,status,attempt,max_attempts,owner_token_hash,leased_at,
      heartbeat_at,lease_expires_at,terminal_at,failure_code,recorded_at
    ) VALUES(
      v_successor,p_run,'mention_claim_extraction','revision_shard',1,p_first_ordinal,v_execution_ordinal,
      p_first_revision,p_completed_source_job,v_payload_hash,v_payload_hash,'queued',0,5,NULL,NULL,NULL,NULL,NULL,NULL,
      date_trunc('second',clock_timestamp())
    );
    INSERT INTO public.legacy_producer_job_payloads_v3_11(
      job_id,payload_canonical,payload_json,payload_hash,recorded_at
    ) VALUES(v_successor,v_payload_bytes,v_payload,v_payload_hash,date_trunc('second',clock_timestamp()));
  ELSIF v_existing.run_id<>p_run OR v_existing.stage<>'mention_claim_extraction'
    OR v_existing.job_kind<>'revision_shard' OR v_existing.shard_ordinal<>p_first_ordinal
    OR v_existing.revision_id<>p_first_revision OR v_existing.input_hash<>v_payload_hash
  THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='v319_same_run_successor_identity_conflict';
  END IF;
  RETURN jsonb_build_object('jobId',v_successor,'stage','mention_claim_extraction');
END $schedule_successor$;

REVOKE ALL ON FUNCTION public.append_legacy_source_shard_v3_19(uuid,uuid,text,jsonb),
  public.schedule_legacy_source_shard_successor_v3_19(uuid,uuid,uuid,text,integer,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.append_legacy_source_shard_v3_19(uuid,uuid,text,jsonb),
  public.schedule_legacy_source_shard_successor_v3_19(uuid,uuid,uuid,text,integer,uuid)
  TO opportunity_v3_rpc_owner;

RESET ROLE;

-- The producer used to freeze every retained source revision before source_sync.
-- This cursor records only the highest *consumed* revision timestamp.  A failed
-- run is not eligible as a later cursor and no source evidence is mutated.
CREATE TABLE IF NOT EXISTS public.legacy_source_sync_cursors_v3_19 (
  source_run_id uuid PRIMARY KEY REFERENCES public.legacy_producer_runs_v3_11(run_id) ON DELETE RESTRICT,
  source_document_high_water_at timestamptz NOT NULL,
  source_document_high_water_revision_id uuid NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.legacy_source_sync_cursors_v3_19 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legacy_source_sync_cursors_v3_19 OWNER TO opportunity_v3_rpc_owner;

-- Existing last-good research stays in the V3.18 ledger. V3.19 begins from
-- documents that arrive or change after this reviewed reconciliation, instead
-- of reprocessing the historical corpus as if it were fresh.
SET ROLE opportunity_v3_rpc_owner;

INSERT INTO public.legacy_source_sync_cursors_v3_19(
  source_run_id,source_document_high_water_at,source_document_high_water_revision_id
)
SELECT latest.run_id,high_water.recorded_at,high_water.revision_id
FROM (
  SELECT run.run_id
  FROM public.legacy_producer_runs_v3_11 run
  WHERE run.status='success'
  ORDER BY run.source_cutoff DESC,run.terminal_at DESC,run.run_id DESC
  LIMIT 1
) latest
CROSS JOIN LATERAL (
  SELECT revision.recorded_at,revision.revision_id
  FROM public.source_document_revisions_v3 revision
  ORDER BY revision.recorded_at DESC,revision.revision_id DESC
  LIMIT 1
) high_water
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
          AND (d.recorded_at,d.revision_id)>coalesce((
            SELECT ROW(cursor.source_document_high_water_at,cursor.source_document_high_water_revision_id)
            FROM public.legacy_producer_runs_v3_11 prior
            JOIN public.legacy_source_sync_cursors_v3_19 cursor ON cursor.source_run_id=prior.run_id
            WHERE prior.status='success' AND prior.source_cutoff<v_run.source_cutoff
            ORDER BY prior.source_cutoff DESC,prior.terminal_at DESC,prior.run_id DESC LIMIT 1
          ),ROW('-infinity'::timestamptz,'00000000-0000-0000-0000-000000000000'::uuid))$$);
    EXECUTE v_definition;
  -- The replacement retains the old predicate as its leading conjunct, so an
  -- already-installed definition has exactly two old and two new markers.
  -- Any other shape is a non-authoritative predecessor and must fail closed.
  ELSIF NOT(v_old=2 AND v_new=2) THEN
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
  v_status text;v_next jsonb;v_stage text;v_initial_count integer;
  v_first_ordinal integer:=NULL;v_first_revision uuid:=NULL;v_row record;v_selected jsonb;
  v_selected_rows jsonb:='[]'::jsonb;v_append jsonb;
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

  FOR v_row IN
    SELECT revision.*
    FROM public.legacy_source_document_persistence_v3_13 persisted
    JOIN public.source_document_revisions_v3 revision ON revision.revision_id=persisted.revision_id
    WHERE persisted.source_run_id=p_run AND persisted.disposition='new_revision'
      AND revision.acquisition_status='complete'
    ORDER BY revision.source_key,revision.recorded_at,revision.revision_id
  LOOP
    v_selected:=jsonb_build_array(v_row.source_key,v_row.revision_id,v_row.revision_family_key,
      v_row.approved_source_identity_id,v_row.stable_connector_document_id,
      CASE WHEN v_row.published_at IS NULL THEN NULL ELSE to_char(v_row.published_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') END,
      to_char(v_row.collected_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      v_row.raw_field_payload_algorithm_version,v_row.ingestion_content_revision_sha256,
      v_row.canonical_content_algorithm_version,v_row.ingestion_canonical_content_hash_v3);
    v_selected_rows:=v_selected_rows||jsonb_build_array(v_selected);
  END LOOP;
  v_append:=public.append_legacy_source_shard_v3_19(p_run,p_job,p_hash,v_selected_rows);
  v_initial_count:=(v_append->>'initialCount')::integer;
  v_first_ordinal:=NULLIF(v_append->>'firstOrdinal','')::integer;
  v_first_revision:=NULLIF(v_append->>'firstRevision','')::uuid;

  -- With no cursor-selected document the predecessor created a barrier. Turn
  -- that still-queued successor into the first fresh shard; terminal rows are
  -- never rewritten and the normal shard chain handles remaining revisions.
  IF v_initial_count=0 AND v_first_ordinal IS NOT NULL AND v_next->>'stage'='mention_claim_extraction' THEN
    v_next:=public.schedule_legacy_source_shard_successor_v3_19(
      p_run,p_job,(v_next->>'jobId')::uuid,p_hash,v_first_ordinal,v_first_revision);
  END IF;

  INSERT INTO public.legacy_source_sync_cursors_v3_19(
    source_run_id,source_document_high_water_at,source_document_high_water_revision_id
  )
  SELECT p_run,high_water.recorded_at,high_water.revision_id
  FROM (
    SELECT revision.recorded_at,revision.revision_id
    FROM public.legacy_frozen_source_revisions_v3_11 frozen
    JOIN public.source_document_revisions_v3 revision ON revision.revision_id=frozen.revision_id
    WHERE frozen.run_id=p_run
    ORDER BY revision.recorded_at DESC,revision.revision_id DESC
    LIMIT 1
  ) high_water
  ON CONFLICT(source_run_id) DO NOTHING;
  status:=v_status;next_job:=v_next;RETURN NEXT;
END $v319_completion$;

ALTER FUNCTION public.complete_legacy_producer_job_v3_11(uuid,uuid,uuid,bytea,jsonb,text)
  OWNER TO opportunity_v3_rpc_owner;
REVOKE ALL ON TABLE public.legacy_source_sync_cursors_v3_19 FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.complete_legacy_producer_job_v3_11(uuid,uuid,uuid,bytea,jsonb,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_legacy_producer_job_v3_11(uuid,uuid,uuid,bytea,jsonb,text) TO service_role;

RESET ROLE;

REVOKE CREATE ON SCHEMA public FROM legacy_correctness_rpc_owner,opportunity_v3_rpc_owner;
COMMIT;
