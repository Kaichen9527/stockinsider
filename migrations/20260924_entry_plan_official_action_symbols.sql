-- The exchange corporate-action feed includes ordinary shares, ETFs and
-- other listed instruments.  Preserve every source row and its v3.1 hash;
-- four-digit ordinary-stock filtering belongs to candidate selection only.
ALTER TABLE public.opportunity_corporate_action_events_v3
  DROP CONSTRAINT IF EXISTS opportunity_corporate_action_events_v3_symbol_check;
ALTER TABLE public.opportunity_corporate_action_events_v3
  ADD CONSTRAINT opportunity_corporate_action_events_v3_symbol_check
  CHECK (symbol ~ '^[0-9A-Za-z]{2,12}$');

-- A frozen roster and calendar make official authority catch-up resumable
-- without presenting a later acquisition as if it were known at the cutoff.
CREATE TABLE IF NOT EXISTS public.entry_plan_authority_runs_v1 (
  run_id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  source_cutoff timestamptz NOT NULL,
  latest_session date NOT NULL,
  roster jsonb NOT NULL CHECK (jsonb_typeof(roster) = 'array'),
  roster_hash text NOT NULL CHECK (roster_hash ~ '^[0-9a-f]{64}$'),
  excluded_symbols jsonb NOT NULL CHECK (jsonb_typeof(excluded_symbols) = 'array'),
  calendar jsonb NOT NULL CHECK (jsonb_typeof(calendar) = 'object'),
  calendar_hash text NOT NULL CHECK (calendar_hash ~ '^[0-9a-f]{64}$'),
  authority_cutoff timestamptz,
  status text NOT NULL DEFAULT 'initializing'
    CHECK (status IN ('initializing','running','complete','failed')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS entry_plan_authority_runs_v1_created
  ON public.entry_plan_authority_runs_v1 (created_at DESC);

CREATE TABLE IF NOT EXISTS public.entry_plan_authority_jobs_v1 (
  run_id uuid NOT NULL REFERENCES public.entry_plan_authority_runs_v1(run_id) ON DELETE RESTRICT,
  job_key text NOT NULL CHECK (char_length(job_key) BETWEEN 5 AND 80),
  kind text NOT NULL CHECK (kind IN ('price_month','action_range')),
  exchange text NOT NULL CHECK (exchange IN ('TWSE','TPEX')),
  symbol text CHECK (symbol IS NULL OR symbol ~ '^[0-9]{4}$'),
  month text CHECK (month IS NULL OR month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  sessions jsonb NOT NULL CHECK (jsonb_typeof(sessions) = 'array'),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','retry','complete','failed')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 5),
  claimed_at timestamptz,
  collected_at timestamptz,
  evidence_hash text CHECK (evidence_hash IS NULL OR evidence_hash ~ '^[0-9a-f]{64}$'),
  source_url text,
  source_urls jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(source_urls) = 'array'),
  accepted_rows integer NOT NULL DEFAULT 0 CHECK (accepted_rows >= 0),
  missing_rows integer NOT NULL DEFAULT 0 CHECK (missing_rows >= 0),
  last_error text,
  completed_at timestamptz,
  PRIMARY KEY (run_id, job_key),
  CHECK ((kind = 'price_month' AND symbol IS NOT NULL AND month IS NOT NULL)
    OR (kind = 'action_range' AND symbol IS NULL AND month IS NULL))
);
CREATE INDEX IF NOT EXISTS entry_plan_authority_jobs_v1_pending
  ON public.entry_plan_authority_jobs_v1 (run_id, status, job_key);
CREATE UNIQUE INDEX IF NOT EXISTS entry_plan_authority_jobs_v1_single_running
  ON public.entry_plan_authority_jobs_v1 ((true)) WHERE status = 'running';

ALTER TABLE public.entry_plan_authority_runs_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entry_plan_authority_jobs_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.entry_plan_authority_runs_v1, public.entry_plan_authority_jobs_v1 FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.entry_plan_authority_runs_v1, public.entry_plan_authority_jobs_v1 TO service_role;
