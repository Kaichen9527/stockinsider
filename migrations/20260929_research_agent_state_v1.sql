BEGIN;

CREATE TABLE IF NOT EXISTS public.research_priority_runs_v1 (
  run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  as_of TIMESTAMPTZ NOT NULL,
  policy_version TEXT NOT NULL CHECK (policy_version = 'research-priority-v1'),
  input_hash TEXT NOT NULL CHECK (input_hash ~ '^[0-9a-f]{64}$'),
  expected_count INTEGER NOT NULL CHECK (expected_count BETWEEN 0 AND 20000),
  accounted_count INTEGER NOT NULL CHECK (accounted_count = expected_count),
  source_attempts JSONB NOT NULL CHECK (jsonb_typeof(source_attempts) = 'array'),
  rows JSONB NOT NULL CHECK (jsonb_typeof(rows) = 'array'),
  research_queue JSONB NOT NULL CHECK (jsonb_typeof(research_queue) = 'array'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (policy_version, input_hash)
);
CREATE INDEX IF NOT EXISTS idx_research_priority_runs_latest_v1
  ON public.research_priority_runs_v1 (as_of DESC, created_at DESC);
CREATE TRIGGER trg_research_priority_runs_immutable_v1
  BEFORE UPDATE OR DELETE ON public.research_priority_runs_v1
  FOR EACH ROW EXECUTE FUNCTION public.reject_candidate_dossier_revision_mutation_v4();

CREATE TABLE IF NOT EXISTS public.candidate_deep_article_reviews_v1 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id UUID NOT NULL REFERENCES public.candidate_detail_snapshots(id) ON DELETE RESTRICT,
  input_hash TEXT NOT NULL CHECK (input_hash ~ '^[0-9a-f]{64}$'),
  article_hash TEXT NOT NULL CHECK (article_hash ~ '^[0-9a-f]{64}$'),
  author_id TEXT NOT NULL,
  reviewer_id TEXT NOT NULL CHECK (reviewer_id <> author_id),
  decision TEXT NOT NULL CHECK (decision IN ('accepted','rejected')),
  findings JSONB NOT NULL CHECK (jsonb_typeof(findings) = 'object'),
  source_document_ids JSONB NOT NULL CHECK (jsonb_typeof(source_document_ids) = 'array'),
  reviewed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (revision_id, input_hash, article_hash, reviewer_id, decision)
);
CREATE INDEX IF NOT EXISTS idx_candidate_deep_article_reviews_v1
  ON public.candidate_deep_article_reviews_v1 (revision_id, reviewed_at DESC);
CREATE TRIGGER trg_candidate_deep_article_reviews_immutable_v1
  BEFORE UPDATE OR DELETE ON public.candidate_deep_article_reviews_v1
  FOR EACH ROW EXECUTE FUNCTION public.reject_candidate_dossier_revision_mutation_v4();

CREATE TABLE IF NOT EXISTS public.candidate_thesis_qualifications_v1 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES public.candidate_thesis_qualifications_v1(id) ON DELETE RESTRICT,
  stock_id UUID NOT NULL REFERENCES public.stocks(id) ON DELETE RESTRICT,
  detail_revision_id UUID NOT NULL REFERENCES public.candidate_detail_snapshots(id) ON DELETE RESTRICT,
  dossier_id UUID NOT NULL REFERENCES public.candidate_research_dossiers(id) ON DELETE RESTRICT,
  article_hash TEXT NOT NULL CHECK (article_hash ~ '^[0-9a-f]{64}$'),
  evidence_snapshot_hash TEXT NOT NULL CHECK (evidence_snapshot_hash ~ '^[0-9a-f]{64}$'),
  review_receipt_hash TEXT NOT NULL UNIQUE CHECK (review_receipt_hash ~ '^[0-9a-f]{64}$'),
  status TEXT NOT NULL CHECK (status IN ('qualified','rejected','needs_evidence','stale','invalidated')),
  horizon TEXT NOT NULL CHECK (horizon IN ('1-3m','3-6m','6-18m')),
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  qualified_at TIMESTAMPTZ NOT NULL,
  next_review_at TIMESTAMPTZ NOT NULL CHECK (next_review_at >= qualified_at),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS idx_candidate_thesis_latest_v1
  ON public.candidate_thesis_qualifications_v1 (stock_id, qualified_at DESC, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_candidate_thesis_successor_v1
  ON public.candidate_thesis_qualifications_v1 (parent_id) WHERE parent_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.candidate_technical_decisions_v1 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id UUID NOT NULL REFERENCES public.stocks(id) ON DELETE RESTRICT,
  thesis_qualification_id UUID NOT NULL REFERENCES public.candidate_thesis_qualifications_v1(id) ON DELETE RESTRICT,
  session_date DATE NOT NULL,
  market_dataset_hash TEXT NOT NULL CHECK (market_dataset_hash ~ '^[0-9a-f]{64}$'),
  calendar_hash TEXT NOT NULL CHECK (calendar_hash ~ '^[0-9a-f]{64}$'),
  feature_version TEXT NOT NULL,
  strategy_version TEXT NOT NULL,
  snapshot JSONB NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  observed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (stock_id, thesis_qualification_id, session_date, market_dataset_hash, strategy_version)
);
CREATE INDEX IF NOT EXISTS idx_candidate_technical_latest_v1
  ON public.candidate_technical_decisions_v1 (stock_id, session_date DESC, observed_at DESC);

ALTER TABLE public.research_priority_runs_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_deep_article_reviews_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_thesis_qualifications_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_technical_decisions_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.research_priority_runs_v1, public.candidate_thesis_qualifications_v1,
  public.candidate_technical_decisions_v1, public.candidate_deep_article_reviews_v1 FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.research_priority_runs_v1, public.candidate_thesis_qualifications_v1,
  public.candidate_technical_decisions_v1, public.candidate_deep_article_reviews_v1 TO service_role;

CREATE TRIGGER trg_candidate_thesis_qualifications_immutable_v1
  BEFORE UPDATE OR DELETE ON public.candidate_thesis_qualifications_v1
  FOR EACH ROW EXECUTE FUNCTION public.reject_candidate_dossier_revision_mutation_v4();
CREATE TRIGGER trg_candidate_technical_decisions_immutable_v1
  BEFORE UPDATE OR DELETE ON public.candidate_technical_decisions_v1
  FOR EACH ROW EXECUTE FUNCTION public.reject_candidate_dossier_revision_mutation_v4();

COMMIT;
