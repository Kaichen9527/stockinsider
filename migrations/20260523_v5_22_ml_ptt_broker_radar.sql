-- StockInsider v5.22: ML forecast band, PTT full-text signals, and social broker radar

create extension if not exists pgcrypto;

create table if not exists ptt_post_signals (
  id uuid primary key default gen_random_uuid(),
  stock_id uuid references stocks(id) on delete cascade,
  symbol varchar(16) not null,
  document_url text not null,
  title text,
  post_type text,
  push_score integer default 0,
  push_count integer default 0,
  boo_count integer default 0,
  neutral_count integer default 0,
  push_bull_bear_ratio numeric,
  comment_sentiment varchar(24),
  matched_symbol_reason text,
  metadata jsonb not null default '{}'::jsonb,
  collected_at timestamptz not null default now(),
  unique (document_url, symbol)
);

create index if not exists idx_ptt_post_signals_symbol_collected_at
  on ptt_post_signals(symbol, collected_at desc);

create index if not exists idx_ptt_post_signals_stock_id_collected_at
  on ptt_post_signals(stock_id, collected_at desc);

create table if not exists social_broker_mentions (
  id uuid primary key default gen_random_uuid(),
  stock_id uuid references stocks(id) on delete cascade,
  symbol varchar(16) not null,
  source_document_id uuid,
  platform text,
  broker_name text not null,
  target_price numeric,
  forward_eps numeric,
  source_url text,
  summary text,
  source_mode text not null default 'social_broker_leak',
  verification_status text not null default 'pending',
  metadata jsonb not null default '{}'::jsonb,
  collected_at timestamptz not null default now(),
  unique (stock_id, source_url, broker_name)
);

create index if not exists idx_social_broker_mentions_symbol_collected_at
  on social_broker_mentions(symbol, collected_at desc);

create index if not exists idx_social_broker_mentions_mode_status
  on social_broker_mentions(source_mode, verification_status);

create table if not exists ml_forecast_snapshots (
  id uuid primary key default gen_random_uuid(),
  stock_id uuid references stocks(id) on delete cascade,
  symbol varchar(16) not null,
  horizon_days integer not null,
  lower_price numeric,
  median_price numeric,
  upper_price numeric,
  upside_probability numeric,
  confidence numeric,
  model_version text not null,
  training_window text,
  feature_set jsonb not null default '{}'::jsonb,
  feature_attribution jsonb not null default '[]'::jsonb,
  source_signal_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_ml_forecast_snapshots_symbol_created_at
  on ml_forecast_snapshots(symbol, created_at desc);

create index if not exists idx_ml_forecast_snapshots_stock_horizon_created
  on ml_forecast_snapshots(stock_id, horizon_days, created_at desc);

create table if not exists model_training_runs (
  id uuid primary key default gen_random_uuid(),
  model_name text not null,
  task text not null,
  base_model text,
  dataset_path text,
  training_window text,
  metrics jsonb not null default '{}'::jsonb,
  artifact_path text,
  status text not null default 'completed',
  created_at timestamptz not null default now()
);

create index if not exists idx_model_training_runs_task_created_at
  on model_training_runs(task, created_at desc);

create table if not exists model_feature_attributions (
  id uuid primary key default gen_random_uuid(),
  stock_id uuid references stocks(id) on delete cascade,
  symbol varchar(16) not null,
  forecast_snapshot_id uuid references ml_forecast_snapshots(id) on delete cascade,
  feature_name text not null,
  feature_value numeric,
  contribution numeric,
  direction text,
  created_at timestamptz not null default now()
);

create index if not exists idx_model_feature_attributions_symbol_created_at
  on model_feature_attributions(symbol, created_at desc);
