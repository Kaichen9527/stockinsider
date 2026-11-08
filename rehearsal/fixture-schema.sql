-- Exact public table definitions from pinned commit; fixture rows only.
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
