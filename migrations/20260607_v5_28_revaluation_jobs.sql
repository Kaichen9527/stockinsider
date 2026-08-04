-- StockInsider v5.28: durable revaluation queue and broker search attempts.

CREATE TABLE IF NOT EXISTS revaluation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id UUID NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  trigger_reason TEXT NOT NULL,
  trigger_source TEXT NOT NULL DEFAULT 'system',
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN (
      'queued',
      'running',
      'repriced',
      'unchanged_with_reason',
      'promoted_scenario_to_base',
      'blocked_insufficient_evidence',
      'archived_reflected'
    )),
  priority INTEGER NOT NULL DEFAULT 50,
  required_evidence TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  last_result TEXT,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_attempt_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  old_base_target NUMERIC,
  old_scenario_target NUMERIC,
  new_base_target NUMERIC,
  new_scenario_target NUMERIC,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_revaluation_jobs_symbol_status_priority
  ON revaluation_jobs(symbol, status, priority DESC, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_revaluation_jobs_stock_updated
  ON revaluation_jobs(stock_id, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_revaluation_jobs_open_unique
  ON revaluation_jobs(stock_id, trigger_reason)
  WHERE status IN ('queued', 'running');

CREATE TABLE IF NOT EXISTS revaluation_job_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES revaluation_jobs(id) ON DELETE CASCADE,
  stock_id UUID REFERENCES stocks(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  attempt_status TEXT NOT NULL DEFAULT 'running'
    CHECK (attempt_status IN ('running', 'completed', 'failed')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  result_status TEXT
    CHECK (result_status IS NULL OR result_status IN (
      'repriced',
      'unchanged_with_reason',
      'promoted_scenario_to_base',
      'blocked_insufficient_evidence',
      'archived_reflected'
    )),
  result_summary TEXT,
  evidence_found JSONB NOT NULL DEFAULT '{}'::JSONB,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB
);

CREATE INDEX IF NOT EXISTS idx_revaluation_attempts_job_started
  ON revaluation_job_attempts(job_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_revaluation_attempts_symbol_started
  ON revaluation_job_attempts(symbol, started_at DESC);

CREATE TABLE IF NOT EXISTS broker_search_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id UUID REFERENCES stocks(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  job_id UUID REFERENCES revaluation_jobs(id) ON DELETE SET NULL,
  search_surface TEXT NOT NULL,
  search_keywords TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  status TEXT NOT NULL DEFAULT 'attempted'
    CHECK (status IN ('attempted', 'hit', 'miss', 'failed')),
  records_found INTEGER NOT NULL DEFAULT 0,
  records_written INTEGER NOT NULL DEFAULT 0,
  summary TEXT,
  source_refs JSONB NOT NULL DEFAULT '[]'::JSONB,
  failure_reason TEXT,
  searched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB
);

CREATE INDEX IF NOT EXISTS idx_broker_search_attempts_symbol_time
  ON broker_search_attempts(symbol, searched_at DESC);

CREATE INDEX IF NOT EXISTS idx_broker_search_attempts_job_time
  ON broker_search_attempts(job_id, searched_at DESC);
