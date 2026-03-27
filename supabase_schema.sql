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
    source_key VARCHAR(150),
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
    source_key VARCHAR(150),
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
    source_key VARCHAR(150),
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
    source_key VARCHAR(150),
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
    -- Keep user_id nullable and unconstrained to support existing projects
    -- where `profiles` may not use `id` as PK.
    user_id UUID,
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

CREATE INDEX IF NOT EXISTS idx_stocks_symbol_market ON stocks(symbol, market);
CREATE INDEX IF NOT EXISTS idx_market_snapshots_market_asof ON market_snapshots(market, as_of DESC);
CREATE INDEX IF NOT EXISTS idx_market_snapshots_source_key ON market_snapshots(source_key, as_of DESC);
CREATE INDEX IF NOT EXISTS idx_stock_signals_stock_asof ON stock_signals(stock_id, as_of DESC);
CREATE INDEX IF NOT EXISTS idx_stock_signals_freshness ON stock_signals(freshness_status, as_of DESC);
CREATE INDEX IF NOT EXISTS idx_stock_signals_source_key ON stock_signals(source_key, as_of DESC);
CREATE INDEX IF NOT EXISTS idx_institutional_signals_stock_ts ON institutional_signals(stock_id, source_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_institutional_signals_source_key ON institutional_signals(source_key, source_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_social_signals_stock_ts ON social_signals(stock_id, source_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_social_signals_source_key ON social_signals(source_key, source_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_recommendations_date_score ON recommendations(as_of DESC, score DESC);
CREATE INDEX IF NOT EXISTS idx_recommendations_market_scope ON recommendations(market_scope, as_of DESC);
CREATE INDEX IF NOT EXISTS idx_strategy_actions_state ON strategy_actions(state, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_line_alert_events_delivery ON line_alert_events(delivery_status, created_at);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_type_started ON pipeline_runs(run_type, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_source_registry_status ON source_registry(status, source_type);
CREATE INDEX IF NOT EXISTS idx_source_health_checks_source_time ON source_health_checks(source_key, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_source_review_queue_state ON source_review_queue(state, created_at DESC);

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
