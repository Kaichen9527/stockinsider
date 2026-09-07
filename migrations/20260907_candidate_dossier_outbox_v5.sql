BEGIN;

-- Durable hand-off for the article worker.  A bundle is immutable; this job is
-- only its delivery state and therefore may be leased/retried without ever
-- mutating the evidence or published revision.
CREATE TABLE IF NOT EXISTS public.candidate_dossier_outbox_v5 (
  job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id UUID NOT NULL REFERENCES public.candidate_dossier_bundles(bundle_id) ON DELETE RESTRICT,
  revision_id UUID NOT NULL REFERENCES public.candidate_detail_snapshots(id) ON DELETE RESTRICT,
  input_hash TEXT NOT NULL CHECK (input_hash ~ '^[0-9a-f]{64}$'),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','accepted','rejected','failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0 AND attempts <= 12),
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ,
  last_error TEXT,
  receipt_id UUID REFERENCES public.candidate_dossier_submission_receipts(submission_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (revision_id, input_hash),
  CHECK ((status = 'running') = (lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL)),
  CHECK ((status = 'accepted') = (receipt_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_candidate_dossier_outbox_v5_claim
  ON public.candidate_dossier_outbox_v5 (status, created_at, job_id);

CREATE OR REPLACE FUNCTION public.claim_candidate_dossier_outbox_v5(
  p_owner TEXT, p_limit INTEGER DEFAULT 5
)
RETURNS SETOF public.candidate_dossier_outbox_v5
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
BEGIN
  IF length(trim(coalesce(p_owner, ''))) = 0 OR p_limit < 1 OR p_limit > 20 THEN
    RAISE EXCEPTION 'candidate_dossier_outbox_claim_invalid';
  END IF;
  RETURN QUERY
  WITH candidates AS (
    SELECT job_id FROM public.candidate_dossier_outbox_v5
    WHERE status = 'queued' OR (status = 'running' AND lease_expires_at < clock_timestamp())
    ORDER BY created_at, job_id FOR UPDATE SKIP LOCKED LIMIT p_limit
  ), claimed AS (
    UPDATE public.candidate_dossier_outbox_v5 job SET status = 'running', attempts = job.attempts + 1,
      lease_owner = p_owner, lease_expires_at = clock_timestamp() + interval '20 minutes', updated_at = clock_timestamp()
    FROM candidates WHERE job.job_id = candidates.job_id RETURNING job.*
  ) SELECT * FROM claimed;
END;
$function$;

ALTER TABLE public.candidate_dossier_outbox_v5 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.candidate_dossier_outbox_v5 FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.candidate_dossier_outbox_v5 TO service_role;
REVOKE ALL ON FUNCTION public.claim_candidate_dossier_outbox_v5(TEXT,INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_candidate_dossier_outbox_v5(TEXT,INTEGER) TO service_role;

COMMIT;
