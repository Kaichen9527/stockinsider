-- StockInsider V3.15 production repair: apply bounded official ingestion
-- chunks before the terminal job transaction. Official facts are immutable and
-- idempotent; the application ledger lets interruption recovery prove exactly
-- which reviewed chunks reached their append-only authorities.

GRANT CREATE ON SCHEMA public TO opportunity_v3_rpc_owner;

CREATE TABLE IF NOT EXISTS public.legacy_official_ingestion_applications_v3_15(
  run_id uuid NOT NULL REFERENCES public.legacy_producer_runs_v3_11(run_id),
  job_id uuid NOT NULL,
  chunk_kind text NOT NULL,
  chunk_ordinal integer NOT NULL CHECK(chunk_ordinal>=0),
  chunk_hash text NOT NULL CHECK(chunk_hash~'^[0-9a-f]{64}$'),
  producer_sha text NOT NULL CHECK(producer_sha~'^[0-9a-f]{40}$'),
  source_cutoff timestamptz NOT NULL,
  item_count integer NOT NULL CHECK(item_count BETWEEN 0 AND 200),
  applied_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(job_id,chunk_kind,chunk_ordinal),
  FOREIGN KEY(job_id,chunk_kind,chunk_ordinal)
    REFERENCES public.legacy_official_ingestion_chunks_v3_14(job_id,chunk_kind,chunk_ordinal)
);
ALTER TABLE public.legacy_official_ingestion_applications_v3_15 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.legacy_official_ingestion_applications_v3_15 FROM PUBLIC,anon,authenticated,service_role;

DO $preserve_v314_official_ingestion_apply$
BEGIN
  IF to_regprocedure('public.apply_legacy_official_ingestion_chunk_base_v3_15(uuid,uuid,uuid,text,integer,jsonb,text,text,timestamptz)') IS NULL THEN
    IF to_regprocedure('public.apply_legacy_official_ingestion_chunk_v3_14(uuid,uuid,uuid,text,integer,jsonb,text,text,timestamptz)') IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='official_ingestion_apply_predecessor_missing';
    END IF;
    ALTER FUNCTION public.apply_legacy_official_ingestion_chunk_v3_14(
      uuid,uuid,uuid,text,integer,jsonb,text,text,timestamptz)
      RENAME TO apply_legacy_official_ingestion_chunk_base_v3_15;
  END IF;
END $preserve_v314_official_ingestion_apply$;

CREATE OR REPLACE FUNCTION public.apply_legacy_official_ingestion_chunk_v3_14(
  p_run_id uuid,p_job_id uuid,p_owner_token uuid,p_kind text,p_ordinal integer,p_items jsonb,p_chunk_hash text,
  p_producer_sha text,p_source_cutoff timestamptz
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $apply_once$
DECLARE v_staged public.legacy_official_ingestion_chunks_v3_14;
BEGIN
  SELECT chunk.* INTO v_staged FROM public.legacy_official_ingestion_chunks_v3_14 chunk
  WHERE chunk.run_id=p_run_id AND chunk.job_id=p_job_id AND chunk.chunk_kind=p_kind
    AND chunk.chunk_ordinal=p_ordinal FOR SHARE;
  IF NOT FOUND OR v_staged.chunk_hash<>p_chunk_hash OR v_staged.producer_sha<>p_producer_sha
    OR v_staged.source_cutoff<>p_source_cutoff OR v_staged.items_json<>p_items
  THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='official_ingestion_staged_chunk_mismatch';END IF;
  IF EXISTS(SELECT 1 FROM public.legacy_official_ingestion_applications_v3_15 applied
    WHERE applied.job_id=p_job_id AND applied.chunk_kind=p_kind AND applied.chunk_ordinal=p_ordinal
      AND applied.run_id=p_run_id AND applied.chunk_hash=p_chunk_hash AND applied.producer_sha=p_producer_sha
      AND applied.source_cutoff=p_source_cutoff AND applied.item_count=jsonb_array_length(p_items))
  THEN RETURN true;END IF;
  PERFORM public.apply_legacy_official_ingestion_chunk_base_v3_15(p_run_id,p_job_id,p_owner_token,p_kind,
    p_ordinal,p_items,p_chunk_hash,p_producer_sha,p_source_cutoff);
  INSERT INTO public.legacy_official_ingestion_applications_v3_15(run_id,job_id,chunk_kind,chunk_ordinal,
    chunk_hash,producer_sha,source_cutoff,item_count)
  VALUES(p_run_id,p_job_id,p_kind,p_ordinal,p_chunk_hash,p_producer_sha,p_source_cutoff,jsonb_array_length(p_items))
  ON CONFLICT(job_id,chunk_kind,chunk_ordinal) DO NOTHING;
  IF NOT EXISTS(SELECT 1 FROM public.legacy_official_ingestion_applications_v3_15 applied
    WHERE applied.job_id=p_job_id AND applied.chunk_kind=p_kind AND applied.chunk_ordinal=p_ordinal
      AND applied.run_id=p_run_id AND applied.chunk_hash=p_chunk_hash AND applied.producer_sha=p_producer_sha
      AND applied.source_cutoff=p_source_cutoff AND applied.item_count=jsonb_array_length(p_items))
  THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='official_ingestion_application_conflict';END IF;
  RETURN true;
END $apply_once$;

CREATE OR REPLACE FUNCTION public.append_legacy_official_ingestion_chunk_rest_v3_15(
  p_run_id uuid,p_job_id uuid,p_owner_token uuid,p_kind text,p_ordinal integer,p_items jsonb,p_chunk_hash text,
  p_producer_sha text,p_source_cutoff timestamptz
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $append_apply$
BEGIN
  PERFORM public.append_legacy_official_ingestion_chunk_v3_14(p_run_id,p_job_id,p_owner_token,p_kind,p_ordinal,
    p_items,p_chunk_hash,p_producer_sha,p_source_cutoff);
  IF p_kind<>'terminal' THEN
    PERFORM public.apply_legacy_official_ingestion_chunk_v3_14(p_run_id,p_job_id,p_owner_token,p_kind,p_ordinal,
      p_items,p_chunk_hash,p_producer_sha,p_source_cutoff);
  END IF;
  RETURN true;
END $append_apply$;

CREATE OR REPLACE FUNCTION public.complete_legacy_producer_job_rest_v3_15(
  p_run_id uuid,p_job_id uuid,p_owner_token uuid,p_result bytea,p_json jsonb,p_hash text,p_authority_hash text
) RETURNS TABLE(status text,next_job jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $rest_complete$
BEGIN
  IF coalesce(p_authority_hash,'')!~'^[0-9a-f]{64}$' OR NOT EXISTS(
    SELECT 1 FROM public.legacy_producer_runs_v3_11 run
    WHERE run.run_id=p_run_id AND run.authority_hash=p_authority_hash
  ) THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='authentication_rejected';END IF;
  IF p_json#>>'{officialIngestion,schema}'='legacy-official-ingestion-v3.14' AND EXISTS(
    SELECT 1 FROM public.legacy_official_ingestion_chunks_v3_14 chunk
    WHERE chunk.run_id=p_run_id AND chunk.job_id=p_job_id AND chunk.chunk_kind<>'terminal'
      AND NOT EXISTS(SELECT 1 FROM public.legacy_official_ingestion_applications_v3_15 applied
        WHERE applied.run_id=chunk.run_id AND applied.job_id=chunk.job_id
          AND applied.chunk_kind=chunk.chunk_kind AND applied.chunk_ordinal=chunk.chunk_ordinal
          AND applied.chunk_hash=chunk.chunk_hash AND applied.producer_sha=chunk.producer_sha
          AND applied.source_cutoff=chunk.source_cutoff AND applied.item_count=chunk.item_count)
  ) THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='official_ingestion_preapply_incomplete';END IF;
  PERFORM pg_catalog.set_config('stockinsider.legacy_authority_hash',p_authority_hash,true);
  RETURN QUERY SELECT completed.status,completed.next_job
  FROM public.complete_legacy_producer_job_v3_14(
    p_run_id,p_job_id,p_owner_token,p_result,p_json,p_hash) completed;
END $rest_complete$;

ALTER TABLE public.legacy_official_ingestion_applications_v3_15 OWNER TO opportunity_v3_rpc_owner;
ALTER FUNCTION public.apply_legacy_official_ingestion_chunk_base_v3_15(uuid,uuid,uuid,text,integer,jsonb,text,text,timestamptz)
  OWNER TO opportunity_v3_rpc_owner;
ALTER FUNCTION public.apply_legacy_official_ingestion_chunk_v3_14(uuid,uuid,uuid,text,integer,jsonb,text,text,timestamptz)
  OWNER TO opportunity_v3_rpc_owner;
ALTER FUNCTION public.append_legacy_official_ingestion_chunk_rest_v3_15(uuid,uuid,uuid,text,integer,jsonb,text,text,timestamptz)
  OWNER TO opportunity_v3_rpc_owner;
ALTER FUNCTION public.complete_legacy_producer_job_rest_v3_15(uuid,uuid,uuid,bytea,jsonb,text,text)
  OWNER TO opportunity_v3_rpc_owner;
REVOKE ALL ON FUNCTION public.apply_legacy_official_ingestion_chunk_base_v3_15(uuid,uuid,uuid,text,integer,jsonb,text,text,timestamptz),
  public.apply_legacy_official_ingestion_chunk_v3_14(uuid,uuid,uuid,text,integer,jsonb,text,text,timestamptz),
  public.append_legacy_official_ingestion_chunk_rest_v3_15(uuid,uuid,uuid,text,integer,jsonb,text,text,timestamptz),
  public.complete_legacy_producer_job_rest_v3_15(uuid,uuid,uuid,bytea,jsonb,text,text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.append_legacy_official_ingestion_chunk_rest_v3_15(
  uuid,uuid,uuid,text,integer,jsonb,text,text,timestamptz),
  public.complete_legacy_producer_job_rest_v3_15(uuid,uuid,uuid,bytea,jsonb,text,text)
  TO service_role;
REVOKE CREATE ON SCHEMA public FROM PUBLIC,anon,authenticated,service_role;
