BEGIN;

CREATE TABLE IF NOT EXISTS public.research_deep_jobs_v1 (
  job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  priority_run_id UUID NOT NULL REFERENCES public.research_priority_runs_v1(run_id) ON DELETE RESTRICT,
  stock_id UUID NOT NULL REFERENCES public.stocks(id) ON DELETE RESTRICT,
  symbol TEXT NOT NULL CHECK (symbol ~ '^[0-9]{4}$'),
  week_start DATE NOT NULL,
  queue_rank INTEGER NOT NULL CHECK (queue_rank BETWEEN 1 AND 20),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ,
  receipt_id UUID REFERENCES public.candidate_dossier_submission_receipts(submission_id) ON DELETE RESTRICT,
  terminal_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  finished_at TIMESTAMPTZ,
  UNIQUE (stock_id, week_start),
  CHECK ((status = 'running') = (lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL)),
  CHECK (status <> 'completed' OR receipt_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_research_deep_jobs_claim_v1
  ON public.research_deep_jobs_v1 (status, week_start, queue_rank, created_at);

CREATE TABLE IF NOT EXISTS public.research_deep_job_attempts_v1 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.research_deep_jobs_v1(job_id) ON DELETE RESTRICT,
  attempt INTEGER NOT NULL CHECK (attempt BETWEEN 1 AND 3),
  owner TEXT NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  lease_expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE (job_id, attempt)
);
CREATE OR REPLACE TRIGGER trg_research_deep_job_attempts_immutable_v1
  BEFORE UPDATE OR DELETE ON public.research_deep_job_attempts_v1
  FOR EACH ROW EXECUTE FUNCTION public.reject_candidate_dossier_revision_mutation_v4();

CREATE OR REPLACE FUNCTION public.enqueue_research_deep_jobs_v1(p_run_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE
  v_run public.research_priority_runs_v1;
  v_week DATE;
  v_used INTEGER;
  v_added INTEGER := 0;
  v_item JSONB;
  v_rank INTEGER;
  v_stock UUID;
BEGIN
  PERFORM pg_advisory_xact_lock(2409, 6001);
  SELECT * INTO v_run FROM public.research_priority_runs_v1 WHERE run_id = p_run_id;
  IF NOT FOUND OR v_run.as_of > clock_timestamp() OR jsonb_array_length(v_run.research_queue) > 20 THEN
    RAISE EXCEPTION 'research_deep_priority_run_invalid';
  END IF;
  v_week := (v_run.as_of AT TIME ZONE 'Asia/Taipei')::date;
  v_week := v_week - (EXTRACT(ISODOW FROM v_week)::INTEGER - 1);
  SELECT count(*) INTO v_used FROM public.research_deep_jobs_v1 WHERE week_start = v_week;
  FOR v_item, v_rank IN
    SELECT value, ordinality::INTEGER FROM jsonb_array_elements(v_run.research_queue) WITH ORDINALITY
  LOOP
    EXIT WHEN v_used >= 5;
    -- Source failures remain visible in the priority receipt; they cannot be
    -- mistaken for zero interest or silently block all researched companies.
    IF v_item->>'disposition' NOT IN ('queued','stale')
      OR (v_item->>'independentRootCount')::INTEGER < 1 THEN CONTINUE; END IF;
    SELECT id INTO v_stock FROM public.stocks
      WHERE symbol = v_item->>'symbol' AND market = 'TW';
    IF v_stock IS NULL THEN RAISE EXCEPTION 'research_deep_stock_authority_missing'; END IF;
    IF EXISTS (SELECT 1 FROM public.research_deep_jobs_v1
      WHERE stock_id = v_stock AND status IN ('queued','running')) THEN CONTINUE; END IF;
    INSERT INTO public.research_deep_jobs_v1
      (priority_run_id,stock_id,symbol,week_start,queue_rank)
    VALUES (p_run_id,v_stock,v_item->>'symbol',v_week,v_rank)
    ON CONFLICT (stock_id,week_start) DO NOTHING;
    IF FOUND THEN v_added := v_added + 1; v_used := v_used + 1; END IF;
  END LOOP;
  RETURN v_added;
END $function$;

CREATE OR REPLACE FUNCTION public.claim_research_deep_job_v1(p_owner TEXT)
RETURNS TABLE(job_id UUID, symbol TEXT, priority_run_id UUID, attempt INTEGER, lease_expires_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE v_job public.research_deep_jobs_v1;
BEGIN
  IF p_owner IS NULL OR length(trim(p_owner)) < 3 OR length(p_owner) > 120 THEN
    RAISE EXCEPTION 'research_deep_owner_invalid';
  END IF;
  PERFORM pg_advisory_xact_lock(2409, 6002);
  UPDATE public.research_deep_jobs_v1 AS jobs SET
    status = CASE WHEN attempts >= 3 THEN 'failed' ELSE 'queued' END,
    terminal_reason = CASE WHEN attempts >= 3 THEN 'lease_expired_max_attempts' ELSE terminal_reason END,
    lease_owner = NULL, lease_expires_at = NULL,
    finished_at = CASE WHEN attempts >= 3 THEN clock_timestamp() ELSE NULL END
  WHERE jobs.status='running' AND jobs.lease_expires_at <= clock_timestamp();
  IF EXISTS (SELECT 1 FROM public.research_deep_jobs_v1 WHERE status='running')
    OR (SELECT count(*) FROM public.research_deep_job_attempts_v1
       WHERE (claimed_at AT TIME ZONE 'Asia/Taipei')::date =
         (clock_timestamp() AT TIME ZONE 'Asia/Taipei')::date) >= 4 THEN
    RETURN;
  END IF;
  SELECT * INTO v_job FROM public.research_deep_jobs_v1 AS jobs
    WHERE jobs.status='queued' AND jobs.attempts < 3
    ORDER BY jobs.week_start, jobs.queue_rank, jobs.created_at, jobs.job_id
    FOR UPDATE SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE public.research_deep_jobs_v1 SET status='running', attempts=attempts+1,
    lease_owner=p_owner, lease_expires_at=clock_timestamp()+interval '30 minutes'
    WHERE research_deep_jobs_v1.job_id=v_job.job_id
    RETURNING * INTO v_job;
  INSERT INTO public.research_deep_job_attempts_v1(job_id,attempt,owner,lease_expires_at)
    VALUES (v_job.job_id,v_job.attempts,p_owner,v_job.lease_expires_at);
  RETURN QUERY SELECT v_job.job_id,v_job.symbol,v_job.priority_run_id,v_job.attempts,v_job.lease_expires_at;
END $function$;

CREATE OR REPLACE FUNCTION public.finish_research_deep_job_v1(
  p_job_id UUID, p_owner TEXT, p_success BOOLEAN, p_receipt_id UUID, p_reason TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE v_job public.research_deep_jobs_v1;
BEGIN
  PERFORM pg_advisory_xact_lock(2409, 6002);
  SELECT * INTO v_job FROM public.research_deep_jobs_v1 WHERE job_id=p_job_id FOR UPDATE;
  IF FOUND AND p_success AND v_job.status='completed' AND v_job.receipt_id=p_receipt_id THEN
    RETURN TRUE;
  END IF;
  IF NOT FOUND OR v_job.status <> 'running' OR v_job.lease_owner IS DISTINCT FROM p_owner
    OR v_job.lease_expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'research_deep_job_lease_lost';
  END IF;
  IF p_success THEN
    RAISE EXCEPTION 'research_deep_publication_receipt_required';
  END IF;
  UPDATE public.research_deep_jobs_v1 SET
    status=CASE WHEN p_success THEN 'completed' WHEN attempts < 3 THEN 'queued' ELSE 'failed' END,
    lease_owner=NULL,lease_expires_at=NULL,
    receipt_id=CASE WHEN p_success THEN p_receipt_id ELSE NULL END,
    terminal_reason=CASE WHEN p_success THEN NULL ELSE left(coalesce(p_reason,'research_failed'),500) END,
    finished_at=CASE WHEN p_success OR attempts >= 3 THEN clock_timestamp() ELSE NULL END
  WHERE research_deep_jobs_v1.job_id=p_job_id;
  RETURN TRUE;
END $function$;

-- The article receipt and the research-job fence are committed together.
-- Publishing through the ordinary v6 path never completes a deep-study job.
CREATE OR REPLACE FUNCTION public.record_candidate_deep_submission_v1(
  p_deep_job_id UUID, p_deep_owner TEXT, p_deep_attempt INTEGER,
  p_deep_review_id UUID, p_article_hash TEXT,
  p_job_id UUID, p_owner TEXT, p_bundle_id UUID, p_revision_id UUID,
  p_input_hash TEXT, p_submission_hash TEXT, p_content JSONB, p_claims JSONB,
  p_source_references JSONB, p_claim_fact_map JSONB, p_validation_status TEXT,
  p_rejection_reasons JSONB
)
RETURNS TABLE(submission_id UUID, dossier_id UUID, status TEXT, rejection_reasons JSONB, idempotent_replay BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE
  v_job public.research_deep_jobs_v1;
  v_stock UUID;
  v_receipt RECORD;
BEGIN
  SELECT * INTO v_job FROM public.research_deep_jobs_v1
    WHERE research_deep_jobs_v1.job_id=p_deep_job_id FOR UPDATE;
  IF NOT FOUND OR v_job.status<>'running' OR v_job.lease_owner IS DISTINCT FROM p_deep_owner
    OR v_job.attempts<>p_deep_attempt OR v_job.lease_expires_at<=clock_timestamp() THEN
    RAISE EXCEPTION 'research_deep_job_lease_lost';
  END IF;
  SELECT detail.stock_id INTO v_stock FROM public.candidate_detail_snapshots detail
    WHERE detail.id=p_revision_id;
  IF v_stock IS DISTINCT FROM v_job.stock_id THEN
    RAISE EXCEPTION 'research_deep_stock_revision_mismatch';
  END IF;
  IF p_validation_status='valid' AND (
    p_content->'deepResearch'->>'articleHash' IS DISTINCT FROM p_article_hash
    OR NOT EXISTS (
      SELECT 1 FROM public.candidate_deep_article_reviews_v1 review
      WHERE review.id=p_deep_review_id AND review.revision_id=p_revision_id
        AND review.input_hash=p_input_hash AND review.article_hash=p_article_hash
        AND review.decision='accepted' AND review.reviewed_at>=v_job.created_at
    )
  ) THEN
    RAISE EXCEPTION 'research_deep_exact_review_missing';
  END IF;
  SELECT * INTO v_receipt FROM public.record_candidate_dossier_submission_v6(
    p_job_id,p_owner,p_bundle_id,p_revision_id,p_input_hash,p_submission_hash,p_content,
    p_claims,p_source_references,p_claim_fact_map,p_validation_status,p_rejection_reasons
  );
  IF NOT FOUND THEN RAISE EXCEPTION 'research_deep_publication_receipt_missing'; END IF;
  UPDATE public.research_deep_jobs_v1 SET
    status=CASE WHEN v_receipt.status='accepted' THEN 'completed'
      WHEN attempts<3 THEN 'queued' ELSE 'failed' END,
    lease_owner=NULL,lease_expires_at=NULL,
    receipt_id=CASE WHEN v_receipt.status='accepted' THEN v_receipt.submission_id ELSE NULL END,
    terminal_reason=CASE WHEN v_receipt.status='accepted' THEN NULL ELSE 'dossier_rejected' END,
    finished_at=CASE WHEN v_receipt.status='accepted' OR attempts>=3 THEN clock_timestamp() ELSE NULL END
    WHERE research_deep_jobs_v1.job_id=p_deep_job_id;
  RETURN QUERY SELECT v_receipt.submission_id,v_receipt.dossier_id,v_receipt.status,
    v_receipt.rejection_reasons,v_receipt.idempotent_replay;
END $function$;

ALTER TABLE public.research_deep_jobs_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_deep_job_attempts_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.research_deep_jobs_v1, public.research_deep_job_attempts_v1
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.research_deep_jobs_v1, public.research_deep_job_attempts_v1 TO service_role;
REVOKE ALL ON FUNCTION public.enqueue_research_deep_jobs_v1(UUID),
  public.claim_research_deep_job_v1(TEXT),
  public.finish_research_deep_job_v1(UUID,TEXT,BOOLEAN,UUID,TEXT),
  public.record_candidate_deep_submission_v1(UUID,TEXT,INTEGER,UUID,TEXT,UUID,TEXT,UUID,UUID,TEXT,TEXT,JSONB,JSONB,JSONB,JSONB,TEXT,JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_research_deep_jobs_v1(UUID),
  public.claim_research_deep_job_v1(TEXT),
  public.finish_research_deep_job_v1(UUID,TEXT,BOOLEAN,UUID,TEXT),
  public.record_candidate_deep_submission_v1(UUID,TEXT,INTEGER,UUID,TEXT,UUID,TEXT,UUID,UUID,TEXT,TEXT,JSONB,JSONB,JSONB,JSONB,TEXT,JSONB)
  TO service_role;

COMMIT;
