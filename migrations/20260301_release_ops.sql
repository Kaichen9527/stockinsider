ALTER TABLE market_snapshots
  ADD COLUMN IF NOT EXISTS source_key VARCHAR(150);

ALTER TABLE stock_signals
  ADD COLUMN IF NOT EXISTS source_key VARCHAR(150);

ALTER TABLE institutional_signals
  ADD COLUMN IF NOT EXISTS source_key VARCHAR(150);

ALTER TABLE social_signals
  ADD COLUMN IF NOT EXISTS source_key VARCHAR(150);

CREATE TABLE IF NOT EXISTS source_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key VARCHAR(150) NOT NULL UNIQUE,
  source_type VARCHAR(30) NOT NULL CHECK (source_type IN ('market', 'institutional', 'social', 'kol', 'forum')),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked', 'review')),
  risk_level VARCHAR(20) NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high')),
  added_by VARCHAR(100) NOT NULL DEFAULT 'system',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS source_health_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key VARCHAR(150) NOT NULL REFERENCES source_registry(source_key) ON DELETE CASCADE,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  latency_ms INTEGER,
  parse_success_ratio NUMERIC CHECK (parse_success_ratio >= 0 AND parse_success_ratio <= 1),
  freshness_pass_rate NUMERIC CHECK (freshness_pass_rate >= 0 AND freshness_pass_rate <= 1),
  error_summary TEXT
);

CREATE TABLE IF NOT EXISTS source_review_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key VARCHAR(150) NOT NULL REFERENCES source_registry(source_key) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  state VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'approved', 'rejected')),
  reviewed_by VARCHAR(100),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_snapshots_source_key ON market_snapshots(source_key, as_of DESC);
CREATE INDEX IF NOT EXISTS idx_stock_signals_source_key ON stock_signals(source_key, as_of DESC);
CREATE INDEX IF NOT EXISTS idx_institutional_signals_source_key ON institutional_signals(source_key, source_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_social_signals_source_key ON social_signals(source_key, source_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_source_registry_status ON source_registry(status, source_type);
CREATE INDEX IF NOT EXISTS idx_source_health_checks_source_time ON source_health_checks(source_key, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_source_review_queue_state ON source_review_queue(state, created_at DESC);
