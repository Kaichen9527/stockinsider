CREATE TABLE IF NOT EXISTS broker_report_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id UUID REFERENCES stocks(id) ON DELETE CASCADE,
  broker_name VARCHAR(255) NOT NULL,
  report_date DATE,
  file_name VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL,
  source_mode VARCHAR(30) NOT NULL DEFAULT 'manual_pdf' CHECK (source_mode IN ('manual_pdf', 'public_summary')),
  rating VARCHAR(64),
  target_price NUMERIC,
  thesis_title TEXT,
  extracted_summary TEXT,
  raw_text TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(file_path)
);

CREATE TABLE IF NOT EXISTS broker_report_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_report_document_id UUID NOT NULL REFERENCES broker_report_documents(id) ON DELETE CASCADE,
  section_kind VARCHAR(50) NOT NULL CHECK (section_kind IN ('investment_view', 'analysis', 'projection', 'valuation', 'risk', 'focus')),
  section_title VARCHAR(255) NOT NULL,
  section_content TEXT NOT NULL,
  page_from INTEGER,
  page_to INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS source_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform VARCHAR(40) NOT NULL,
  entity_type VARCHAR(40) NOT NULL CHECK (entity_type IN ('broker', 'kol', 'forum_user', 'channel', 'site', 'report_house')),
  display_name VARCHAR(255) NOT NULL,
  source_key VARCHAR(255) NOT NULL UNIQUE,
  profile_url TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'review', 'disabled')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS source_watchlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_entity_id UUID REFERENCES source_entities(id) ON DELETE CASCADE,
  platform VARCHAR(40) NOT NULL,
  watch_type VARCHAR(40) NOT NULL CHECK (watch_type IN ('author', 'channel', 'hashtag', 'keyword', 'url', 'symbol')),
  watch_value TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  priority INTEGER NOT NULL DEFAULT 50,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(platform, watch_type, watch_value)
);

CREATE TABLE IF NOT EXISTS source_credentials_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform VARCHAR(40) NOT NULL UNIQUE,
  credential_ref VARCHAR(255),
  session_ref VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'missing' CHECK (status IN ('missing', 'configured', 'valid', 'invalid')),
  last_validated_at TIMESTAMPTZ,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS source_raw_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_entity_id UUID REFERENCES source_entities(id) ON DELETE SET NULL,
  platform VARCHAR(40) NOT NULL,
  external_id VARCHAR(255),
  document_url TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  content_text TEXT,
  published_at TIMESTAMPTZ,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  symbols JSONB NOT NULL DEFAULT '[]'::jsonb,
  sentiment_label VARCHAR(20),
  confidence NUMERIC,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(platform, document_url)
);

CREATE TABLE IF NOT EXISTS source_discovery_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform VARCHAR(40) NOT NULL,
  candidate_name VARCHAR(255) NOT NULL,
  candidate_url TEXT,
  reason TEXT NOT NULL,
  state VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'approved', 'rejected')),
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS thesis_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id UUID NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
  as_of_date DATE NOT NULL,
  thesis_title TEXT NOT NULL,
  thesis_summary TEXT NOT NULL,
  recommendation_tier VARCHAR(32) NOT NULL CHECK (recommendation_tier IN ('signal_candidate', 'partially_verified', 'validated_thesis', 'actionable_setup')),
  verification_status VARCHAR(16) NOT NULL,
  story_source_summary TEXT,
  verification_summary TEXT,
  financial_projection_summary TEXT,
  valuation_summary TEXT,
  invalidation_summary TEXT,
  target_price_low NUMERIC,
  target_price_high NUMERIC,
  confidence NUMERIC NOT NULL DEFAULT 0.5,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(stock_id, as_of_date)
);

CREATE TABLE IF NOT EXISTS thesis_evidence_matrix (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thesis_model_id UUID NOT NULL REFERENCES thesis_models(id) ON DELETE CASCADE,
  evidence_type VARCHAR(40) NOT NULL CHECK (evidence_type IN ('official', 'conference', 'financial', 'broker_report', 'industry', 'social')),
  source_label VARCHAR(255) NOT NULL,
  source_url TEXT,
  stance VARCHAR(20) NOT NULL CHECK (stance IN ('supporting', 'neutral', 'contradicting')),
  strength NUMERIC NOT NULL DEFAULT 0.5,
  summary TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS valuation_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thesis_model_id UUID NOT NULL REFERENCES thesis_models(id) ON DELETE CASCADE,
  scenario_type VARCHAR(20) NOT NULL CHECK (scenario_type IN ('base', 'upside', 'bear')),
  revenue_assumption TEXT,
  eps_assumption TEXT,
  valuation_method TEXT,
  target_price NUMERIC,
  expected_return_pct NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(thesis_model_id, scenario_type)
);

CREATE TABLE IF NOT EXISTS research_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id UUID REFERENCES stocks(id) ON DELETE CASCADE,
  thesis_model_id UUID REFERENCES thesis_models(id) ON DELETE CASCADE,
  report_kind VARCHAR(30) NOT NULL CHECK (report_kind IN ('daily_radar', 'deep_dive', 'broker_style', 'weekly_conviction')),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  report_markdown TEXT NOT NULL,
  source_coverage JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_broker_report_documents_stock_date ON broker_report_documents(stock_id, report_date DESC);
CREATE INDEX IF NOT EXISTS idx_broker_report_sections_doc ON broker_report_sections(broker_report_document_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_source_entities_platform_status ON source_entities(platform, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_source_watchlists_platform_enabled ON source_watchlists(platform, enabled, priority DESC);
CREATE INDEX IF NOT EXISTS idx_source_raw_documents_platform_collected ON source_raw_documents(platform, collected_at DESC);
CREATE INDEX IF NOT EXISTS idx_source_discovery_queue_state ON source_discovery_queue(state, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_thesis_models_stock_date ON thesis_models(stock_id, as_of_date DESC);
CREATE INDEX IF NOT EXISTS idx_thesis_evidence_matrix_model ON thesis_evidence_matrix(thesis_model_id, evidence_type);
CREATE INDEX IF NOT EXISTS idx_valuation_scenarios_model ON valuation_scenarios(thesis_model_id, scenario_type);
CREATE INDEX IF NOT EXISTS idx_research_reports_stock_created ON research_reports(stock_id, created_at DESC);
