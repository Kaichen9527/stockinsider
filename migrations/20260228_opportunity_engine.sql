-- Core entities
CREATE TABLE IF NOT EXISTS stocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol VARCHAR(20) NOT NULL,
    name VARCHAR(255) NOT NULL,
    market VARCHAR(10) NOT NULL CHECK (market IN ('US', 'TW')),
    sector VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(symbol, market)
);

CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    line_user_id VARCHAR(255) UNIQUE,
    preferences JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS market_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market VARCHAR(10) NOT NULL CHECK (market IN ('US', 'TW')),
    date DATE NOT NULL,
    focus_industries JSONB,
    money_flow_metrics JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(market, date)
);

CREATE TABLE IF NOT EXISTS sentiments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stock_id UUID REFERENCES stocks(id) ON DELETE CASCADE,
    source VARCHAR(100) NOT NULL,
    sentiment VARCHAR(20) CHECK (sentiment IN ('bullish', 'bearish', 'neutral')),
    summary TEXT,
    date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS strategies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stock_id UUID REFERENCES stocks(id) ON DELETE CASCADE,
    recommendation_date DATE NOT NULL,
    target_price NUMERIC,
    stop_loss_price NUMERIC,
    buy_amount_range VARCHAR(100),
    sell_amount_range VARCHAR(100),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'hit_target', 'hit_stop_loss', 'closed')),
    rationale TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS market_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market VARCHAR(10) NOT NULL CHECK (market IN ('US', 'TW')),
    as_of TIMESTAMPTZ NOT NULL,
    source VARCHAR(100) NOT NULL,
    sector_flows JSONB NOT NULL DEFAULT '{}'::jsonb,
    index_state JSONB NOT NULL DEFAULT '{}'::jsonb,
    freshness_status VARCHAR(20) NOT NULL CHECK (freshness_status IN ('fresh', 'stale', 'missing')),
    source_timestamp TIMESTAMPTZ NOT NULL,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(market, as_of)
);

CREATE TABLE IF NOT EXISTS stock_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stock_id UUID NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
    as_of TIMESTAMPTZ NOT NULL,
    source VARCHAR(100) NOT NULL,
    price NUMERIC NOT NULL,
    volume BIGINT,
    ma_short NUMERIC,
    ma_mid NUMERIC,
    ma_long NUMERIC,
    rsi NUMERIC,
    macd NUMERIC,
    macd_signal NUMERIC,
    chip_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    technical_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    freshness_status VARCHAR(20) NOT NULL CHECK (freshness_status IN ('fresh', 'stale', 'missing')),
    source_timestamp TIMESTAMPTZ NOT NULL,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(stock_id, as_of)
);

CREATE TABLE IF NOT EXISTS institutional_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stock_id UUID NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
    source VARCHAR(120) NOT NULL,
    report_title TEXT,
    expectation_score NUMERIC NOT NULL,
    thesis_summary TEXT,
    source_timestamp TIMESTAMPTZ NOT NULL,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    freshness_status VARCHAR(20) NOT NULL CHECK (freshness_status IN ('fresh', 'stale', 'missing'))
);

CREATE TABLE IF NOT EXISTS social_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stock_id UUID NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
    source_type VARCHAR(30) NOT NULL CHECK (source_type IN ('PTT', 'Threads', 'KOL')),
    source_name VARCHAR(120) NOT NULL,
    sentiment_label VARCHAR(20) NOT NULL CHECK (sentiment_label IN ('bullish', 'bearish', 'neutral')),
    confidence NUMERIC NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    mention_count INTEGER NOT NULL DEFAULT 1,
    summary TEXT,
    source_timestamp TIMESTAMPTZ NOT NULL,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    freshness_status VARCHAR(20) NOT NULL CHECK (freshness_status IN ('fresh', 'stale', 'missing'))
);

CREATE TABLE IF NOT EXISTS recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stock_id UUID NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
    as_of DATE NOT NULL,
    market_scope VARCHAR(20) NOT NULL CHECK (market_scope IN ('TW_PRIMARY', 'US_SECONDARY')),
    score NUMERIC NOT NULL,
    confidence NUMERIC NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    action VARCHAR(20) NOT NULL CHECK (action IN ('buy', 'watch', 'reduce')),
    rationale TEXT NOT NULL,
    signal_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
    published_at TIMESTAMPTZ,
    is_blocked BOOLEAN NOT NULL DEFAULT FALSE,
    block_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(stock_id, as_of)
);

CREATE TABLE IF NOT EXISTS strategy_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recommendation_id UUID NOT NULL REFERENCES recommendations(id) ON DELETE CASCADE,
    entry_rule TEXT NOT NULL,
    position_size_rule TEXT NOT NULL,
    target_price NUMERIC,
    stop_loss NUMERIC,
    review_horizon VARCHAR(50),
    state VARCHAR(30) NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'hit_target', 'hit_stop_loss', 'invalidated', 'closed')),
    state_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(recommendation_id)
);

CREATE TABLE IF NOT EXISTS line_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    line_user_id VARCHAR(255) NOT NULL UNIQUE,
    watchlist JSONB NOT NULL DEFAULT '[]'::jsonb,
    event_preferences JSONB NOT NULL DEFAULT '{"hit_target":true,"hit_stop_loss":true,"daily_digest":true}'::jsonb,
    digest_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    throttle_minutes INTEGER NOT NULL DEFAULT 30,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS line_alert_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    strategy_action_id UUID NOT NULL REFERENCES strategy_actions(id) ON DELETE CASCADE,
    event_type VARCHAR(30) NOT NULL CHECK (event_type IN ('hit_target', 'hit_stop_loss', 'state_changed', 'daily_digest')),
    payload JSONB NOT NULL,
    sent_at TIMESTAMPTZ,
    delivery_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'sent', 'failed', 'skipped')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pipeline_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_type VARCHAR(30) NOT NULL CHECK (run_type IN ('ingestion', 'recommendation', 'line_dispatch')),
    status VARCHAR(20) NOT NULL CHECK (status IN ('running', 'success', 'failed')),
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_stocks_symbol_market ON stocks(symbol, market);
CREATE INDEX IF NOT EXISTS idx_market_snapshots_market_asof ON market_snapshots(market, as_of DESC);
CREATE INDEX IF NOT EXISTS idx_stock_signals_stock_asof ON stock_signals(stock_id, as_of DESC);
CREATE INDEX IF NOT EXISTS idx_stock_signals_freshness ON stock_signals(freshness_status, as_of DESC);
CREATE INDEX IF NOT EXISTS idx_institutional_signals_stock_ts ON institutional_signals(stock_id, source_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_social_signals_stock_ts ON social_signals(stock_id, source_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_recommendations_date_score ON recommendations(as_of DESC, score DESC);
CREATE INDEX IF NOT EXISTS idx_recommendations_market_scope ON recommendations(market_scope, as_of DESC);
CREATE INDEX IF NOT EXISTS idx_strategy_actions_state ON strategy_actions(state, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_line_alert_events_delivery ON line_alert_events(delivery_status, created_at);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_type_started ON pipeline_runs(run_type, started_at DESC);
