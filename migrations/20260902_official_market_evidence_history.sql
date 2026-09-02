BEGIN;

CREATE TABLE IF NOT EXISTS public.official_market_evidence_history (
  market TEXT NOT NULL CHECK (market IN ('TWSE','TPEX')),
  session_date DATE NOT NULL,
  index_close NUMERIC,
  breadth_above_ma20 INTEGER,
  breadth_observed INTEGER,
  breadth_eligible INTEGER,
  foreign_net_twd NUMERIC,
  source_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  as_of TIMESTAMPTZ NOT NULL,
  available_at TIMESTAMPTZ NOT NULL,
  provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (market, session_date),
  CHECK (
    (breadth_above_ma20 IS NULL AND breadth_observed IS NULL AND breadth_eligible IS NULL)
    OR (
      breadth_above_ma20 BETWEEN 0 AND breadth_observed
      AND breadth_observed BETWEEN 0 AND breadth_eligible
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_official_market_evidence_history_session
  ON public.official_market_evidence_history (session_date DESC, market);

ALTER TABLE public.official_market_evidence_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.official_market_evidence_history FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.official_market_evidence_history TO service_role;

COMMIT;
