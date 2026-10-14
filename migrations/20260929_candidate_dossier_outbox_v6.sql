BEGIN;

-- A claimed article must either finish under its lease or return to the queue.
-- This migration is additive to the deployed v5 table and retains its receipts.
ALTER TABLE public.candidate_dossier_outbox_v5
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_submission_hash TEXT,
  ADD COLUMN IF NOT EXISTS publication_kind TEXT NOT NULL DEFAULT 'ordinary'
    CHECK (publication_kind IN ('ordinary','deep'));
ALTER TABLE public.candidate_dossier_outbox_v5
  DROP CONSTRAINT IF EXISTS candidate_dossier_outbox_v5_revision_id_input_hash_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_candidate_outbox_publication_kind_v6
  ON public.candidate_dossier_outbox_v5(revision_id,input_hash,publication_kind);

UPDATE public.candidate_dossier_outbox_v5
SET status = 'failed', lease_owner = NULL, lease_expires_at = NULL,
    last_error = 'candidate_dossier_attempt_limit_reached', updated_at = clock_timestamp()
WHERE publication_kind='ordinary' AND attempts >= 12 AND status IN ('queued', 'running');

CREATE OR REPLACE FUNCTION public.claim_candidate_dossier_outbox_v5(p_owner TEXT, p_limit INTEGER DEFAULT 5)
RETURNS SETOF public.candidate_dossier_outbox_v5
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
BEGIN
  IF length(trim(coalesce(p_owner, ''))) = 0 OR length(p_owner) > 120 OR p_limit < 1 OR p_limit > 20 THEN
    RAISE EXCEPTION 'candidate_dossier_outbox_claim_invalid';
  END IF;
  UPDATE public.candidate_dossier_outbox_v5
  SET status = 'failed', lease_owner = NULL, lease_expires_at = NULL,
      last_error = 'candidate_dossier_attempt_limit_reached', updated_at = clock_timestamp()
  WHERE publication_kind='ordinary' AND attempts >= 12 AND (status = 'queued' OR (status = 'running' AND lease_expires_at < clock_timestamp()));
  RETURN QUERY
  WITH candidates AS (
    SELECT job_id FROM public.candidate_dossier_outbox_v5
    WHERE publication_kind='ordinary' AND attempts < 12 AND (next_attempt_at IS NULL OR next_attempt_at <= clock_timestamp())
      AND (status = 'queued' OR (status = 'running' AND lease_expires_at < clock_timestamp()))
    ORDER BY created_at, job_id FOR UPDATE SKIP LOCKED LIMIT p_limit
  ), claimed AS (
    UPDATE public.candidate_dossier_outbox_v5 job SET status = 'running', attempts = job.attempts + 1,
      lease_owner = p_owner, lease_expires_at = clock_timestamp() + interval '20 minutes',
      next_attempt_at = NULL, updated_at = clock_timestamp()
    FROM candidates WHERE job.job_id = candidates.job_id RETURNING job.*
  ) SELECT * FROM claimed;
END;
$function$;

CREATE OR REPLACE FUNCTION public.heartbeat_candidate_dossier_outbox_v6(p_job_id UUID, p_owner TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
BEGIN
  UPDATE public.candidate_dossier_outbox_v5
  SET lease_expires_at = clock_timestamp() + interval '20 minutes', updated_at = clock_timestamp()
  WHERE job_id = p_job_id AND publication_kind='ordinary' AND status = 'running' AND lease_owner = p_owner
    AND lease_expires_at > clock_timestamp();
  RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION public.release_candidate_dossier_outbox_v6(
  p_job_id UUID, p_owner TEXT, p_retryable BOOLEAN, p_reason TEXT
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
BEGIN
  IF length(trim(coalesce(p_reason, ''))) = 0 OR length(p_reason) > 512 THEN
    RAISE EXCEPTION 'candidate_dossier_release_reason_invalid';
  END IF;
  UPDATE public.candidate_dossier_outbox_v5
  SET status = CASE WHEN p_retryable AND attempts < 12 THEN 'queued' ELSE 'failed' END,
      lease_owner = NULL, lease_expires_at = NULL,
      next_attempt_at = CASE WHEN p_retryable AND attempts < 12
        THEN clock_timestamp() + CASE WHEN attempts <= 1 THEN interval '1 minute'
          WHEN attempts <= 3 THEN interval '5 minutes' ELSE interval '15 minutes' END
        ELSE NULL END,
      last_error = p_reason, updated_at = clock_timestamp()
  WHERE job_id = p_job_id AND publication_kind='ordinary' AND status = 'running' AND lease_owner = p_owner
    AND lease_expires_at > clock_timestamp();
  RETURN FOUND;
END;
$function$;

-- Recording the append-only receipt and closing the owned lease occur in one
-- transaction. A stale worker cannot publish a dossier after losing its lease.
CREATE OR REPLACE FUNCTION public.record_candidate_dossier_submission_v6(
  p_job_id UUID, p_owner TEXT, p_bundle_id UUID, p_revision_id UUID,
  p_input_hash TEXT, p_submission_hash TEXT, p_content JSONB, p_claims JSONB,
  p_source_references JSONB, p_claim_fact_map JSONB, p_validation_status TEXT,
  p_rejection_reasons JSONB
)
RETURNS TABLE(submission_id UUID, dossier_id UUID, status TEXT, rejection_reasons JSONB, idempotent_replay BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE
  v_job public.candidate_dossier_outbox_v5%ROWTYPE;
  v_receipt RECORD;
BEGIN
  SELECT * INTO v_job FROM public.candidate_dossier_outbox_v5
  WHERE job_id = p_job_id FOR UPDATE;
  IF NOT FOUND OR v_job.publication_kind<>'ordinary' OR p_content ? 'deepResearch' OR v_job.bundle_id <> p_bundle_id OR v_job.revision_id <> p_revision_id
    OR v_job.input_hash <> p_input_hash THEN
    RAISE EXCEPTION 'candidate_dossier_job_identity_mismatch';
  END IF;
  IF v_job.status IN ('accepted', 'rejected') AND v_job.last_submission_hash = p_submission_hash THEN
    RETURN QUERY SELECT receipt.submission_id, receipt.dossier_id, receipt.status,
      receipt.rejection_reasons, TRUE
    FROM public.candidate_dossier_submission_receipts receipt
    WHERE receipt.submission_hash = p_submission_hash AND receipt.revision_id = p_revision_id
      AND receipt.bundle_id = p_bundle_id AND receipt.status = v_job.status;
    IF FOUND THEN RETURN; END IF;
  END IF;
  IF v_job.status <> 'running' OR v_job.lease_owner <> p_owner
    OR v_job.lease_expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'candidate_dossier_lease_lost';
  END IF;
  SELECT * INTO v_receipt FROM public.record_candidate_dossier_submission_v4(
    p_bundle_id, p_revision_id, p_input_hash, p_submission_hash, p_content,
    p_claims, p_source_references, p_claim_fact_map, p_validation_status, p_rejection_reasons
  );
  IF NOT FOUND THEN RAISE EXCEPTION 'candidate_dossier_receipt_missing'; END IF;
  UPDATE public.candidate_dossier_outbox_v5
  SET status = v_receipt.status, lease_owner = NULL, lease_expires_at = NULL,
    receipt_id = CASE WHEN v_receipt.status = 'accepted' THEN v_receipt.submission_id ELSE NULL END,
    last_submission_hash = p_submission_hash,
    last_error = CASE WHEN v_receipt.status = 'rejected' THEN v_receipt.rejection_reasons::TEXT ELSE NULL END,
    updated_at = clock_timestamp()
  WHERE job_id = p_job_id;
  RETURN QUERY SELECT v_receipt.submission_id, v_receipt.dossier_id,
    v_receipt.status, v_receipt.rejection_reasons, v_receipt.idempotent_replay;
END;
$function$;

REVOKE ALL ON FUNCTION public.heartbeat_candidate_dossier_outbox_v6(UUID,TEXT),
  public.release_candidate_dossier_outbox_v6(UUID,TEXT,BOOLEAN,TEXT),
  public.record_candidate_dossier_submission_v6(UUID,TEXT,UUID,UUID,TEXT,TEXT,JSONB,JSONB,JSONB,JSONB,TEXT,JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.heartbeat_candidate_dossier_outbox_v6(UUID,TEXT),
  public.release_candidate_dossier_outbox_v6(UUID,TEXT,BOOLEAN,TEXT),
  public.record_candidate_dossier_submission_v6(UUID,TEXT,UUID,UUID,TEXT,TEXT,JSONB,JSONB,JSONB,JSONB,TEXT,JSONB)
  TO service_role;

COMMIT;
