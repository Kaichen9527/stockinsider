ALTER TABLE IF EXISTS recommendations
  ADD COLUMN IF NOT EXISTS recommendation_state VARCHAR(32) NOT NULL DEFAULT 'watchlist_candidate'
    CHECK (recommendation_state IN ('watchlist_candidate', 'validated_thesis', 'actionable_setup')),
  ADD COLUMN IF NOT EXISTS story_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS thesis_title TEXT,
  ADD COLUMN IF NOT EXISTS thesis_summary TEXT,
  ADD COLUMN IF NOT EXISTS catalyst_summary TEXT,
  ADD COLUMN IF NOT EXISTS expected_upside_pct NUMERIC,
  ADD COLUMN IF NOT EXISTS evidence_score NUMERIC,
  ADD COLUMN IF NOT EXISTS timing_score NUMERIC;

CREATE TABLE IF NOT EXISTS theme_heat (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_key VARCHAR(120) NOT NULL,
  theme_name VARCHAR(255) NOT NULL,
  window_type VARCHAR(20) NOT NULL CHECK (window_type IN ('daily', 'three_day', 'weekly')),
  market_regime VARCHAR(50),
  heat_score NUMERIC NOT NULL,
  capital_flow_signals JSONB NOT NULL DEFAULT '{}'::jsonb,
  related_symbols JSONB NOT NULL DEFAULT '[]'::jsonb,
  supporting_evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  as_of_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(theme_key, window_type, as_of_date)
);

CREATE TABLE IF NOT EXISTS story_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id UUID NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
  story_type VARCHAR(50) NOT NULL CHECK (
    story_type IN (
      'product_upgrade',
      'supply_chain_win',
      'shortage_pricing',
      'operating_turnaround',
      'policy_benefit',
      'inventory_reversal',
      'valuation_reset',
      'conference_guidance'
    )
  ),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  catalyst_summary TEXT,
  thesis_state VARCHAR(32) NOT NULL DEFAULT 'watchlist_candidate'
    CHECK (thesis_state IN ('watchlist_candidate', 'validated_thesis', 'actionable_setup', 'review', 'rejected')),
  confidence NUMERIC NOT NULL DEFAULT 0.5,
  novelty_score NUMERIC NOT NULL DEFAULT 0.5,
  evidence_score NUMERIC NOT NULL DEFAULT 0.0,
  timing_score NUMERIC NOT NULL DEFAULT 0.0,
  source_mix JSONB NOT NULL DEFAULT '[]'::jsonb,
  related_themes JSONB NOT NULL DEFAULT '[]'::jsonb,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  as_of_date DATE NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(stock_id, story_type, as_of_date)
);

CREATE TABLE IF NOT EXISTS story_evidence_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_candidate_id UUID NOT NULL REFERENCES story_candidates(id) ON DELETE CASCADE,
  stock_id UUID NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
  evidence_class VARCHAR(40) NOT NULL CHECK (
    evidence_class IN ('official', 'company', 'industry', 'public_research', 'news', 'social', 'financial', 'transcript')
  ),
  source_name VARCHAR(255) NOT NULL,
  source_url TEXT,
  headline TEXT NOT NULL,
  excerpt TEXT,
  stance VARCHAR(20) NOT NULL CHECK (stance IN ('supporting', 'contradicting', 'neutral')),
  evidence_strength NUMERIC NOT NULL DEFAULT 0.5,
  source_timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS company_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id UUID NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
  event_type VARCHAR(40) NOT NULL CHECK (
    event_type IN ('earnings', 'monthly_revenue', 'conference', 'supply_chain', 'product_launch', 'guidance', 'mops_filing')
  ),
  headline TEXT NOT NULL,
  summary TEXT NOT NULL,
  source_url TEXT,
  event_timestamp TIMESTAMPTZ NOT NULL,
  extracted_signals JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(stock_id, event_type, event_timestamp, headline)
);

CREATE TABLE IF NOT EXISTS conference_transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id UUID NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
  event_name TEXT NOT NULL,
  transcript_excerpt TEXT NOT NULL,
  source_url TEXT,
  event_timestamp TIMESTAMPTZ NOT NULL,
  management_tone VARCHAR(20) CHECK (management_tone IN ('bullish', 'neutral', 'cautious')),
  catalyst_mentions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(stock_id, event_name, event_timestamp)
);

CREATE TABLE IF NOT EXISTS revenue_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id UUID NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
  as_of_date DATE NOT NULL,
  monthly_revenue NUMERIC NOT NULL,
  yoy_growth NUMERIC,
  mom_growth NUMERIC,
  source_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(stock_id, as_of_date)
);

CREATE TABLE IF NOT EXISTS fundamental_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id UUID NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
  as_of_date DATE NOT NULL,
  eps_ttm NUMERIC,
  gross_margin NUMERIC,
  operating_margin NUMERIC,
  pe_ratio NUMERIC,
  pb_ratio NUMERIC,
  revenue_run_rate NUMERIC,
  source_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(stock_id, as_of_date)
);

CREATE TABLE IF NOT EXISTS valuation_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_candidate_id UUID NOT NULL REFERENCES story_candidates(id) ON DELETE CASCADE,
  stock_id UUID NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
  case_type VARCHAR(20) NOT NULL CHECK (case_type IN ('base', 'upside', 'invalidation')),
  target_price NUMERIC,
  expected_return_pct NUMERIC,
  assumptions JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(story_candidate_id, case_type)
);

CREATE TABLE IF NOT EXISTS research_memos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id UUID REFERENCES stocks(id) ON DELETE CASCADE,
  story_candidate_id UUID REFERENCES story_candidates(id) ON DELETE SET NULL,
  report_kind VARCHAR(30) NOT NULL CHECK (report_kind IN ('daily_radar', 'hot_theme', 'weekly_conviction', 'deep_dive')),
  title TEXT NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  summary TEXT NOT NULL,
  memo_markdown TEXT NOT NULL,
  recommendation_state VARCHAR(32) CHECK (recommendation_state IN ('watchlist_candidate', 'validated_thesis', 'actionable_setup')),
  catalyst_calendar JSONB NOT NULL DEFAULT '[]'::jsonb,
  entry_exit_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  related_symbols JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_key VARCHAR(120) NOT NULL UNIQUE,
  source_library VARCHAR(120) NOT NULL,
  mapped_role VARCHAR(120) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  execution_mode VARCHAR(20) NOT NULL DEFAULT 'reference_only' CHECK (execution_mode IN ('reference_only', 'internal_wrapped')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('running', 'success', 'failed')),
  initiated_by VARCHAR(50) NOT NULL DEFAULT 'system',
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS agent_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_run_id UUID NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  agent_role VARCHAR(120) NOT NULL,
  profile_key VARCHAR(120) REFERENCES agent_profiles(profile_key) ON DELETE SET NULL,
  task_type VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('running', 'success', 'failed', 'review')),
  input_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_summary TEXT,
  reviewer_state VARCHAR(20) NOT NULL DEFAULT 'not_required' CHECK (reviewer_state IN ('not_required', 'pending', 'approved', 'rejected')),
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS agent_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_task_id UUID NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
  stock_id UUID REFERENCES stocks(id) ON DELETE CASCADE,
  theme_key VARCHAR(120),
  finding_type VARCHAR(50) NOT NULL,
  summary TEXT NOT NULL,
  confidence NUMERIC NOT NULL DEFAULT 0.5,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_review_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_task_id UUID REFERENCES agent_tasks(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  state VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'approved', 'rejected')),
  reviewed_by VARCHAR(100),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_theme_heat_window_asof ON theme_heat(window_type, as_of_date DESC, heat_score DESC);
CREATE INDEX IF NOT EXISTS idx_story_candidates_stock_state ON story_candidates(stock_id, thesis_state, as_of_date DESC);
CREATE INDEX IF NOT EXISTS idx_story_evidence_story ON story_evidence_items(story_candidate_id, source_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_company_events_stock_time ON company_events(stock_id, event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_conference_transcripts_stock_time ON conference_transcripts(stock_id, event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_revenue_signals_stock_date ON revenue_signals(stock_id, as_of_date DESC);
CREATE INDEX IF NOT EXISTS idx_fundamental_snapshots_stock_date ON fundamental_snapshots(stock_id, as_of_date DESC);
CREATE INDEX IF NOT EXISTS idx_valuation_cases_story ON valuation_cases(story_candidate_id, case_type);
CREATE INDEX IF NOT EXISTS idx_research_memos_kind_created ON research_memos(report_kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_runs_type_started ON agent_runs(run_type, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_run_status ON agent_tasks(agent_run_id, status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_findings_stock_created ON agent_findings(stock_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_review_queue_state ON agent_review_queue(state, created_at DESC);
