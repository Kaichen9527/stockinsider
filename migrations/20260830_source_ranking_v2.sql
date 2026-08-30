BEGIN;

CREATE TABLE IF NOT EXISTS public.source_run_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_run_id TEXT,
  connector TEXT NOT NULL,
  expected_at TIMESTAMPTZ NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL,
  succeeded_at TIMESTAMPTZ,
  fetched INTEGER NOT NULL DEFAULT 0 CHECK (fetched >= 0),
  matched INTEGER NOT NULL DEFAULT 0 CHECK (matched >= 0),
  new_count INTEGER NOT NULL DEFAULT 0 CHECK (new_count >= 0),
  duplicate INTEGER NOT NULL DEFAULT 0 CHECK (duplicate >= 0),
  written INTEGER NOT NULL DEFAULT 0 CHECK (written >= 0),
  auth_status TEXT NOT NULL CHECK (auth_status IN ('authorized','missing','rejected','not_applicable')),
  terminal_reason TEXT NOT NULL CHECK (terminal_reason IN (
    'success','successful_empty','duplicate_only','parser_failed','auth_failed',
    'license_blocked','retired','manual_only','failed','partial'
  )),
  terminal_detail TEXT,
  parser_version TEXT NOT NULL,
  license_basis TEXT NOT NULL,
  source_disposition TEXT NOT NULL CHECK (source_disposition IN ('active','blocked_auth','blocked_license','manual_only','retired')),
  next_expected_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_source_run_ledger_connector_attempted
  ON public.source_run_ledger (connector, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_source_run_ledger_terminal_attempted
  ON public.source_run_ledger (terminal_reason, attempted_at DESC);

CREATE TABLE IF NOT EXISTS public.source_connector_registry (
  connector TEXT PRIMARY KEY,
  lifecycle TEXT NOT NULL CHECK (lifecycle IN ('active','blocked_auth','blocked_license','manual_only','retired')),
  display_name TEXT NOT NULL,
  license_basis TEXT NOT NULL,
  parser_version TEXT,
  retired_at TIMESTAMPTZ,
  retirement_reason TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.source_connector_registry
  (connector, lifecycle, display_name, license_basis, retired_at, retirement_reason)
VALUES
  ('telegram','blocked_license','Telegram','approved_public_channel_use_required',NULL,NULL),
  ('threads','blocked_auth','Threads','official_threads_keyword_api',NULL,NULL),
  ('ptt','blocked_license','PTT Stock','metadata_only_rights_review_required',NULL,NULL),
  ('bulltalk','blocked_license','股市爆料同學會','cmoney_api_or_authorized_export_required',NULL,NULL),
  ('gdelt','active','GDELT 新聞中介資料','gdelt_metadata_and_source_links',NULL,NULL),
  ('investanchors','manual_only','InvestAnchors','authorized_structured_conclusions_only',NULL,NULL),
  ('instagram','manual_only','Instagram','authenticated_review_only',NULL,NULL),
  ('podcast','active','Podcast RSS','creator_authorized_rss_metadata',NULL,NULL),
  ('twse_insider','active','TWSE/TPEx/MOPS','official_open_data',NULL,NULL),
  ('youtube','retired','YouTube','historical_audit_only','2026-08-30'::timestamptz,'retired_by_source_ranking_v2'),
  ('googlenews','retired','Google News','historical_audit_only','2026-08-30'::timestamptz,'retired_by_source_ranking_v2'),
  ('udn','retired','UDN','historical_audit_only','2026-08-30'::timestamptz,'retired_by_source_ranking_v2'),
  ('anue','retired','鉅亨網','historical_audit_only','2026-08-30'::timestamptz,'retired_by_source_ranking_v2'),
  ('mobile01','retired','Mobile01','historical_audit_only','2026-08-30'::timestamptz,'retired_by_source_ranking_v2')
ON CONFLICT (connector) DO UPDATE SET
  lifecycle = EXCLUDED.lifecycle,
  display_name = EXCLUDED.display_name,
  license_basis = EXCLUDED.license_basis,
  retired_at = EXCLUDED.retired_at,
  retirement_reason = EXCLUDED.retirement_reason,
  updated_at = NOW();

CREATE TABLE IF NOT EXISTS public.candidate_source_mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id UUID NOT NULL REFERENCES public.stocks(id) ON DELETE CASCADE,
  source_document_id UUID REFERENCES public.source_raw_documents(id) ON DELETE SET NULL,
  source_run_ledger_id UUID REFERENCES public.source_run_ledger(id) ON DELETE SET NULL,
  platform TEXT NOT NULL,
  source_name TEXT NOT NULL,
  author_name TEXT,
  source_url TEXT NOT NULL,
  stance TEXT NOT NULL CHECK (stance IN ('positive','negative','neutral','mixed')),
  independent_content_hash TEXT,
  mentioned_at TIMESTAMPTZ NOT NULL,
  as_of TIMESTAMPTZ NOT NULL,
  available_at TIMESTAMPTZ NOT NULL,
  confidence NUMERIC NOT NULL CHECK (confidence >= 0 AND confidence <= 100),
  provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
  ruleset_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_candidate_source_mentions_document
  ON public.candidate_source_mentions (stock_id, platform, source_url);
CREATE INDEX IF NOT EXISTS idx_candidate_source_mentions_independent_content
  ON public.candidate_source_mentions (stock_id, independent_content_hash)
  WHERE independent_content_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_candidate_source_mentions_stock_available
  ON public.candidate_source_mentions (stock_id, available_at DESC);

CREATE TABLE IF NOT EXISTS public.candidate_daily_stage_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id UUID NOT NULL REFERENCES public.stocks(id) ON DELETE CASCADE,
  session_date DATE NOT NULL,
  lifecycle_stage TEXT NOT NULL CHECK (lifecycle_stage IN ('found','waiting','actionable')),
  discovery_score NUMERIC NOT NULL CHECK (discovery_score BETWEEN 0 AND 100),
  research_score NUMERIC NOT NULL CHECK (research_score BETWEEN 0 AND 100),
  actionability_score NUMERIC NOT NULL CHECK (actionability_score BETWEEN 0 AND 100),
  data_confidence_score NUMERIC NOT NULL CHECK (data_confidence_score BETWEEN 0 AND 100),
  base_upside_pct NUMERIC,
  bear_downside_pct NUMERIC,
  reward_risk_ratio NUMERIC,
  market_regime TEXT CHECK (market_regime IN ('risk_on','selective','risk_off','breakdown','unknown')),
  hard_gate_results JSONB NOT NULL DEFAULT '{}'::jsonb,
  unmet_conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  promotion_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  as_of TIMESTAMPTZ NOT NULL,
  available_at TIMESTAMPTZ NOT NULL,
  ruleset_version TEXT NOT NULL,
  model_version TEXT NOT NULL,
  provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (stock_id, session_date, ruleset_version, model_version)
);

CREATE INDEX IF NOT EXISTS idx_candidate_daily_stage_stage_date
  ON public.candidate_daily_stage_snapshots (lifecycle_stage, session_date DESC);

CREATE TABLE IF NOT EXISTS public.candidate_stage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id UUID NOT NULL REFERENCES public.stocks(id) ON DELETE CASCADE,
  from_stage TEXT CHECK (from_stage IN ('found','waiting','actionable')),
  to_stage TEXT NOT NULL CHECK (to_stage IN ('found','waiting','actionable')),
  reason_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
  consecutive_sessions_passed INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_sessions_passed >= 0),
  as_of TIMESTAMPTZ NOT NULL,
  available_at TIMESTAMPTZ NOT NULL,
  ruleset_version TEXT NOT NULL,
  snapshot_id UUID REFERENCES public.candidate_daily_stage_snapshots(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_candidate_stage_events_stock_as_of
  ON public.candidate_stage_events (stock_id, as_of DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_candidate_stage_events_snapshot_transition
  ON public.candidate_stage_events (stock_id, snapshot_id, to_stage);

CREATE TABLE IF NOT EXISTS public.technical_feature_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id UUID NOT NULL REFERENCES public.stocks(id) ON DELETE CASCADE,
  session_date DATE NOT NULL,
  close NUMERIC NOT NULL,
  volume BIGINT,
  ma5 NUMERIC,
  ma20 NUMERIC,
  ma60 NUMERIC,
  ma120 NUMERIC,
  ma240 NUMERIC,
  ma60_slope NUMERIC,
  volume_ratio_20_median NUMERIC,
  atr14 NUMERIC,
  rsi14 NUMERIC,
  obv NUMERIC,
  institutional_flow_5d_norm NUMERIC,
  institutional_flow_20d_norm NUMERIC,
  market_regime TEXT CHECK (market_regime IN ('risk_on','selective','risk_off','breakdown','unknown')),
  peer_catchdown_block BOOLEAN NOT NULL DEFAULT FALSE,
  as_of TIMESTAMPTZ NOT NULL,
  available_at TIMESTAMPTZ NOT NULL,
  provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
  ruleset_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (stock_id, session_date, ruleset_version)
);

CREATE TABLE IF NOT EXISTS public.valuation_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id UUID NOT NULL REFERENCES public.stocks(id) ON DELETE CASCADE,
  valuation_horizon_months INTEGER NOT NULL DEFAULT 12 CHECK (valuation_horizon_months > 0),
  primary_method TEXT NOT NULL CHECK (primary_method IN ('forward_pe','normalized_pe','ev_ebitda','forward_pb','ev_sales','ev_gross_profit','dcf')),
  cross_check_method TEXT,
  current_price NUMERIC NOT NULL CHECK (current_price >= 0),
  historical_pe_percentile NUMERIC CHECK (historical_pe_percentile BETWEEN 0 AND 100),
  historical_pb_percentile NUMERIC CHECK (historical_pb_percentile BETWEEN 0 AND 100),
  bear_target NUMERIC NOT NULL CHECK (bear_target >= 0),
  base_target NUMERIC NOT NULL CHECK (base_target >= 0),
  bull_target NUMERIC NOT NULL CHECK (bull_target >= 0),
  bear_probability NUMERIC NOT NULL DEFAULT 0.25 CHECK (bear_probability BETWEEN 0 AND 1),
  base_probability NUMERIC NOT NULL DEFAULT 0.50 CHECK (base_probability BETWEEN 0 AND 1),
  bull_probability NUMERIC NOT NULL DEFAULT 0.25 CHECK (bull_probability BETWEEN 0 AND 1),
  probability_weighted_target NUMERIC NOT NULL CHECK (probability_weighted_target >= 0),
  base_upside_pct NUMERIC NOT NULL,
  bear_downside_pct NUMERIC NOT NULL,
  reward_risk_ratio NUMERIC,
  earnings_bridge JSONB NOT NULL DEFAULT '{}'::jsonb,
  assumption_ledger JSONB NOT NULL DEFAULT '[]'::jsonb,
  catalysts JSONB NOT NULL DEFAULT '[]'::jsonb,
  invalidation_conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  as_of TIMESTAMPTZ NOT NULL,
  available_at TIMESTAMPTZ NOT NULL,
  provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
  model_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_valuation_snapshots_stock_available
  ON public.valuation_snapshots (stock_id, available_at DESC);

CREATE TABLE IF NOT EXISTS public.peer_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id UUID NOT NULL REFERENCES public.stocks(id) ON DELETE CASCADE,
  peer_ticker TEXT NOT NULL,
  peer_market TEXT NOT NULL,
  relationship_type TEXT NOT NULL CHECK (relationship_type IN ('customer','supplier','competitor','product_peer')),
  product_subcategory TEXT NOT NULL,
  directionality TEXT NOT NULL CHECK (directionality IN ('positive_lead','negative_catchdown','mixed','context_only')),
  relationship_weight NUMERIC NOT NULL DEFAULT 0 CHECK (relationship_weight BETWEEN 0 AND 1),
  evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  effective_from DATE NOT NULL,
  effective_to DATE,
  version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (stock_id, peer_ticker, relationship_type, product_subcategory, version)
);

CREATE TABLE IF NOT EXISTS public.peer_market_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  peer_relationship_id UUID NOT NULL REFERENCES public.peer_relationships(id) ON DELETE CASCADE,
  price_return_5d NUMERIC,
  price_return_20d NUMERIC,
  fundamental_signal NUMERIC,
  availability_status TEXT NOT NULL CHECK (availability_status IN ('available','stale','unknown','blocked_license')),
  catchdown_block BOOLEAN NOT NULL DEFAULT FALSE,
  as_of TIMESTAMPTZ NOT NULL,
  available_at TIMESTAMPTZ NOT NULL,
  provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
  model_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (peer_relationship_id, as_of, model_version)
);

CREATE OR REPLACE FUNCTION public.source_document_coverage(
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to TIMESTAMPTZ DEFAULT NULL,
  p_platform TEXT DEFAULT NULL,
  p_query TEXT DEFAULT NULL,
  p_symbol TEXT DEFAULT NULL,
  p_verification_status TEXT DEFAULT NULL,
  p_theme_symbols TEXT[] DEFAULT NULL
)
RETURNS TABLE(platform TEXT, count BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.platform::text, COUNT(*)::bigint
  FROM public.source_raw_documents d
  WHERE (p_from IS NULL OR d.collected_at >= p_from)
    AND (p_to IS NULL OR d.collected_at <= p_to)
    AND (p_platform IS NULL OR p_platform = 'all' OR d.platform = p_platform)
    AND (p_query IS NULL OR d.title ILIKE '%' || p_query || '%' OR d.summary ILIKE '%' || p_query || '%')
    AND (p_symbol IS NULL OR d.symbols ? p_symbol)
    AND (p_theme_symbols IS NULL OR d.symbols ?| p_theme_symbols)
    AND (
      p_verification_status IS NULL
      OR (p_verification_status = '已證實' AND d.confidence >= 0.65)
      OR (p_verification_status = '部分證實' AND d.confidence >= 0.35 AND d.confidence < 0.65)
      OR (p_verification_status = '未證實' AND (d.confidence IS NULL OR d.confidence < 0.35))
    )
  GROUP BY d.platform
  ORDER BY COUNT(*) DESC, d.platform ASC;
$$;

ALTER TABLE public.source_run_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_connector_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_source_mentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_daily_stage_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_stage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.technical_feature_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.valuation_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.peer_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.peer_market_snapshots ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.source_run_ledger, public.source_connector_registry,
  public.candidate_source_mentions, public.candidate_daily_stage_snapshots,
  public.candidate_stage_events, public.technical_feature_snapshots,
  public.valuation_snapshots, public.peer_relationships,
  public.peer_market_snapshots FROM anon, authenticated;
GRANT ALL ON public.source_run_ledger, public.source_connector_registry,
  public.candidate_source_mentions, public.candidate_daily_stage_snapshots,
  public.candidate_stage_events, public.technical_feature_snapshots,
  public.valuation_snapshots, public.peer_relationships,
  public.peer_market_snapshots TO service_role;
REVOKE ALL ON FUNCTION public.source_document_coverage(TIMESTAMPTZ,TIMESTAMPTZ,TEXT,TEXT,TEXT,TEXT,TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.source_document_coverage(TIMESTAMPTZ,TIMESTAMPTZ,TEXT,TEXT,TEXT,TEXT,TEXT[]) TO service_role;

COMMIT;
