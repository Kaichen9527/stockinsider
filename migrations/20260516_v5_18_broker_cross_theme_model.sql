-- StockInsider v5.18: broker consensus, cross-theme discovery, missed hot symbols, model signals

ALTER TABLE broker_report_documents
  DROP CONSTRAINT IF EXISTS broker_report_documents_source_mode_check;

ALTER TABLE broker_report_documents
  ADD CONSTRAINT broker_report_documents_source_mode_check
  CHECK (source_mode IN ('manual_pdf', 'manual_csv', 'imported_pdf', 'public_summary', 'broker_summary', 'news_summary'));

CREATE TABLE IF NOT EXISTS broker_consensus_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id UUID REFERENCES stocks(id) ON DELETE CASCADE,
  as_of_date DATE NOT NULL,
  source_count INTEGER NOT NULL DEFAULT 0,
  us_broker_count INTEGER NOT NULL DEFAULT 0,
  factset_count INTEGER NOT NULL DEFAULT 0,
  min_target_price NUMERIC,
  median_target_price NUMERIC,
  max_target_price NUMERIC,
  forward_eps NUMERIC,
  forward_year VARCHAR(8),
  rating_distribution JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_document_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  freshness_status VARCHAR(24) NOT NULL DEFAULT 'fresh',
  summary TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(stock_id, as_of_date)
);

CREATE TABLE IF NOT EXISTS cross_theme_discovery_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id UUID REFERENCES stocks(id) ON DELETE CASCADE,
  symbol VARCHAR(16) NOT NULL,
  primary_theme VARCHAR(80),
  cross_theme VARCHAR(80) NOT NULL,
  evidence_level VARCHAR(32) NOT NULL DEFAULT 'inferred_watch',
  source_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  reason TEXT NOT NULL,
  event_date DATE NOT NULL DEFAULT CURRENT_DATE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(symbol, cross_theme, event_date)
);

CREATE TABLE IF NOT EXISTS missed_hot_symbol_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol VARCHAR(16) NOT NULL,
  name VARCHAR(255),
  reason TEXT NOT NULL,
  price_change_3d NUMERIC,
  price_change_5d NUMERIC,
  price_change_10d NUMERIC,
  volume_ratio NUMERIC,
  social_mentions INTEGER NOT NULL DEFAULT 0,
  broker_target_revisions INTEGER NOT NULL DEFAULT 0,
  visible_state VARCHAR(40) NOT NULL DEFAULT 'not_visible',
  report_date DATE NOT NULL DEFAULT CURRENT_DATE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(symbol, report_date)
);

CREATE TABLE IF NOT EXISTS model_signal_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id UUID REFERENCES stocks(id) ON DELETE CASCADE,
  source_document_id UUID,
  model_name VARCHAR(255) NOT NULL,
  task_name VARCHAR(80) NOT NULL,
  sentiment_score NUMERIC,
  extraction_confidence NUMERIC,
  evidence_strength NUMERIC,
  stance VARCHAR(24),
  extracted_symbols JSONB NOT NULL DEFAULT '[]'::jsonb,
  extracted_themes JSONB NOT NULL DEFAULT '[]'::jsonb,
  boundary VARCHAR(32) NOT NULL DEFAULT 'assistive_only',
  promotion_impact VARCHAR(16) NOT NULL DEFAULT 'none',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hf_training_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_name VARCHAR(255) NOT NULL,
  task_name VARCHAR(80) NOT NULL,
  base_model VARCHAR(255) NOT NULL,
  dataset_path TEXT,
  status VARCHAR(24) NOT NULL DEFAULT 'planned',
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  artifact_path TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_broker_consensus_stock_date ON broker_consensus_snapshots(stock_id, as_of_date DESC);
CREATE INDEX IF NOT EXISTS idx_cross_theme_symbol_date ON cross_theme_discovery_events(symbol, event_date DESC);
CREATE INDEX IF NOT EXISTS idx_missed_hot_symbol_date ON missed_hot_symbol_reports(report_date DESC, symbol);
CREATE INDEX IF NOT EXISTS idx_model_signal_stock_created ON model_signal_scores(stock_id, created_at DESC);
