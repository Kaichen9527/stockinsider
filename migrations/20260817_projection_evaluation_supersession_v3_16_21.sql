-- StockInsider V3.16.21 production repair: content cutoff is not the
-- evaluation/release clock.  A newer reviewed producer may truthfully evaluate
-- the same immutable market cutoff after an earlier producer has published it.
-- Preserve append-only rows and fail closed on time regression, incomplete
-- release identity, or nondeterministic output from the same producer.

BEGIN;

GRANT CREATE ON SCHEMA public TO legacy_correctness_rpc_owner;

CREATE OR REPLACE FUNCTION public.guard_legacy_radar_projection_insert_v3_13()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $guard$
DECLARE
  v_latest public.legacy_radar_projections_v3_11%ROWTYPE;
  v_latest_correctness jsonb;
  v_new_correctness jsonb;
  v_latest_evaluated_at timestamptz;
  v_new_evaluated_at timestamptz;
  v_latest_published_at timestamptz;
  v_new_published_at timestamptz;
  v_expected_window text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW."window"::text,0));
  SELECT projection.* INTO v_latest
  FROM public.legacy_radar_projections_v3_11 projection
  WHERE projection."window"=NEW."window"
  ORDER BY projection.as_of DESC,projection.created_at DESC,projection.projection_id ASC LIMIT 1;

  IF v_latest.projection_id IS NULL THEN RETURN NEW;END IF;
  IF NEW.as_of<v_latest.as_of THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='non_monotonic_projection';
  END IF;
  IF NEW.as_of>v_latest.as_of OR NEW.payload_sha256=v_latest.payload_sha256 THEN
    RETURN NEW;
  END IF;

  v_latest_correctness:=v_latest.payload_json->'sourceLedCorrectness';
  v_new_correctness:=NEW.payload_json->'sourceLedCorrectness';
  v_expected_window:=CASE WHEN NEW."window"::text='three_day' THEN 'hot' ELSE NEW."window"::text END;

  IF jsonb_typeof(v_latest_correctness) IS DISTINCT FROM 'object'
    OR jsonb_typeof(v_new_correctness) IS DISTINCT FROM 'object'
    OR coalesce(v_new_correctness->>'window','')<>v_expected_window
    OR coalesce(v_new_correctness->>'asOf','')!~
      '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,9})?Z$'
    OR (v_new_correctness->>'asOf')::timestamptz<>NEW.as_of
    OR coalesce(v_latest_correctness->>'evaluatedAt','')!~
      '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,9})?Z$'
    OR coalesce(v_new_correctness->>'evaluatedAt','')!~
      '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,9})?Z$'
    OR coalesce(v_latest_correctness->>'publishedAt','')!~
      '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,9})?Z$'
    OR coalesce(v_new_correctness->>'publishedAt','')!~
      '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,9})?Z$'
    OR coalesce(v_new_correctness#>>'{producerIdentity,commitSha}','')<>NEW.producer_commit_sha
    OR coalesce(NEW.payload_json#>>'{releaseIdentity,producerCommitSha}','')<>NEW.producer_commit_sha
    OR coalesce(v_new_correctness#>>'{producerIdentity,workerSha256}','')<>NEW.worker_sha256
  THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='projection_release_identity_invalid';
  END IF;

  v_latest_evaluated_at:=(v_latest_correctness->>'evaluatedAt')::timestamptz;
  v_new_evaluated_at:=(v_new_correctness->>'evaluatedAt')::timestamptz;
  v_latest_published_at:=(v_latest_correctness->>'publishedAt')::timestamptz;
  v_new_published_at:=(v_new_correctness->>'publishedAt')::timestamptz;
  IF v_new_evaluated_at<=v_latest_evaluated_at
    OR v_new_published_at<v_new_evaluated_at
    OR v_new_published_at<=v_latest_published_at
  THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='projection_evaluation_time_conflict';
  END IF;
  IF NEW.producer_commit_sha=v_latest.producer_commit_sha THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='projection_same_producer_nondeterminism';
  END IF;
  RETURN NEW;
EXCEPTION
  WHEN SQLSTATE 'PT409' THEN RAISE;
  WHEN OTHERS THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='projection_release_identity_invalid';
END $guard$;

ALTER FUNCTION public.guard_legacy_radar_projection_insert_v3_13()
  OWNER TO legacy_correctness_rpc_owner;
REVOKE ALL ON FUNCTION public.guard_legacy_radar_projection_insert_v3_13()
  FROM PUBLIC,anon,authenticated,service_role;

REVOKE CREATE ON SCHEMA public FROM legacy_correctness_rpc_owner;

DO $projection_evaluation_supersession_contract$
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM pg_proc function
    JOIN pg_namespace namespace ON namespace.oid=function.pronamespace
    JOIN pg_roles owner ON owner.oid=function.proowner
    WHERE namespace.nspname='public'
      AND function.proname='guard_legacy_radar_projection_insert_v3_13'
      AND function.provolatile='v' AND function.prosecdef
      AND owner.rolname='legacy_correctness_rpc_owner'
      AND position('projection_same_producer_nondeterminism' IN pg_get_functiondef(function.oid))>0
      AND position('projection_evaluation_time_conflict' IN pg_get_functiondef(function.oid))>0
  ) THEN
    RAISE EXCEPTION 'projection_evaluation_supersession_contract_unavailable';
  END IF;
  IF has_schema_privilege('legacy_correctness_rpc_owner','public','CREATE') THEN
    RAISE EXCEPTION 'projection_evaluation_supersession_owner_create_leaked';
  END IF;
END $projection_evaluation_supersession_contract$;

COMMIT;
