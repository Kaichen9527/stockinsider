BEGIN;

-- Source semantics and publisher identity are additive. Historical rows remain
-- queryable and are intentionally not rewritten into a new meaning.
ALTER TABLE public.source_raw_documents
  ADD COLUMN IF NOT EXISTS content_semantics TEXT NOT NULL DEFAULT 'editorial_discussion'
    CHECK (content_semantics IN ('editorial_discussion','bulk_institutional_ranking','official_chip_evidence','metadata_only')),
  ADD COLUMN IF NOT EXISTS publisher_key TEXT,
  ADD COLUMN IF NOT EXISTS publisher_name TEXT;

ALTER TABLE public.candidate_source_mentions
  ADD COLUMN IF NOT EXISTS content_semantics TEXT NOT NULL DEFAULT 'editorial_discussion'
    CHECK (content_semantics IN ('editorial_discussion','metadata_only')),
  ADD COLUMN IF NOT EXISTS publisher_key TEXT,
  ADD COLUMN IF NOT EXISTS publisher_name TEXT;

CREATE INDEX IF NOT EXISTS idx_candidate_mentions_publisher_window
  ON public.candidate_source_mentions (publisher_key, available_at DESC);
CREATE INDEX IF NOT EXISTS idx_source_documents_semantics_collected
  ON public.source_raw_documents (content_semantics, collected_at DESC);

CREATE TABLE IF NOT EXISTS public.source_connector_cursors (
  connector TEXT PRIMARY KEY,
  cursor_value TEXT NOT NULL,
  cursor_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_timestamp TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Writer fencing is dormant until a release is explicitly registered active.
-- This lets the migration be applied before the VPS release is installed.
CREATE TABLE IF NOT EXISTS public.production_writer_releases (
  release_id TEXT PRIMARY KEY CHECK (release_id ~ '^[0-9a-f]{7,64}$'),
  writer_kind TEXT NOT NULL CHECK (writer_kind IN ('vps')),
  active BOOLEAN NOT NULL DEFAULT FALSE,
  activated_at TIMESTAMPTZ,
  retired_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_one_active_production_writer
  ON public.production_writer_releases ((active)) WHERE active;

CREATE OR REPLACE FUNCTION public.register_production_writer_release(
  p_release_id TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF p_release_id !~ '^[0-9a-f]{7,64}$' THEN
    RAISE EXCEPTION 'invalid_production_writer_release';
  END IF;
  UPDATE public.production_writer_releases
  SET active = FALSE, retired_at = NOW()
  WHERE active;
  INSERT INTO public.production_writer_releases (
    release_id, writer_kind, active, activated_at, metadata
  ) VALUES (p_release_id, 'vps', TRUE, NOW(), COALESCE(p_metadata, '{}'::jsonb))
  ON CONFLICT (release_id) DO UPDATE SET
    active = TRUE, activated_at = NOW(), retired_at = NULL,
    metadata = EXCLUDED.metadata;
END
$function$;

CREATE OR REPLACE FUNCTION public.enforce_production_writer_fence()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  required_release TEXT;
  supplied_release TEXT;
  headers JSONB;
BEGIN
  SELECT release_id INTO required_release
  FROM public.production_writer_releases
  WHERE active
  ORDER BY activated_at DESC
  LIMIT 1;
  IF required_release IS NULL THEN
    RETURN NEW;
  END IF;
  BEGIN
    headers := COALESCE(NULLIF(current_setting('request.headers', TRUE), ''), '{}')::jsonb;
  EXCEPTION WHEN OTHERS THEN
    headers := '{}'::jsonb;
  END;
  supplied_release := headers->>'x-stockinsider-writer-release';
  IF supplied_release IS DISTINCT FROM required_release THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'production_writer_release_rejected';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.production_write_leases
    WHERE lease_key = 'production-data-plane'
      AND expires_at > NOW()
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'production_writer_lease_required';
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_source_raw_documents_writer_fence ON public.source_raw_documents;
CREATE TRIGGER trg_source_raw_documents_writer_fence
  BEFORE INSERT OR UPDATE ON public.source_raw_documents
  FOR EACH ROW EXECUTE FUNCTION public.enforce_production_writer_fence();
DROP TRIGGER IF EXISTS trg_candidate_source_mentions_writer_fence ON public.candidate_source_mentions;
CREATE TRIGGER trg_candidate_source_mentions_writer_fence
  BEFORE INSERT OR UPDATE ON public.candidate_source_mentions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_production_writer_fence();

CREATE TABLE IF NOT EXISTS public.official_price_history (
  stock_id UUID NOT NULL REFERENCES public.stocks(id) ON DELETE CASCADE,
  session_date DATE NOT NULL,
  open NUMERIC NOT NULL,
  high NUMERIC NOT NULL,
  low NUMERIC NOT NULL,
  close NUMERIC NOT NULL,
  volume NUMERIC,
  source_url TEXT NOT NULL,
  as_of TIMESTAMPTZ NOT NULL,
  available_at TIMESTAMPTZ NOT NULL,
  provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (stock_id, session_date)
);
CREATE INDEX IF NOT EXISTS idx_official_price_history_session
  ON public.official_price_history (session_date DESC, stock_id);

CREATE TABLE IF NOT EXISTS public.official_multiple_history (
  stock_id UUID NOT NULL REFERENCES public.stocks(id) ON DELETE CASCADE,
  month_end DATE NOT NULL,
  close NUMERIC,
  pe_ratio NUMERIC,
  pb_ratio NUMERIC,
  source_url TEXT NOT NULL,
  as_of TIMESTAMPTZ NOT NULL,
  available_at TIMESTAMPTZ NOT NULL,
  provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (stock_id, month_end)
);

CREATE TABLE IF NOT EXISTS public.candidate_official_facts (
  fact_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id UUID NOT NULL REFERENCES public.stocks(id) ON DELETE CASCADE,
  fact_key TEXT NOT NULL,
  period_end DATE NOT NULL,
  value NUMERIC,
  unit TEXT,
  as_of TIMESTAMPTZ NOT NULL,
  available_at TIMESTAMPTZ NOT NULL,
  source_url TEXT NOT NULL,
  provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (stock_id, fact_key, period_end, available_at)
);
CREATE INDEX IF NOT EXISTS idx_candidate_official_facts_pit
  ON public.candidate_official_facts (stock_id, fact_key, available_at DESC);

ALTER TABLE public.valuation_snapshots
  ADD COLUMN IF NOT EXISTS valuation_basis TEXT NOT NULL DEFAULT 'ttm_multiple_reference'
    CHECK (valuation_basis IN ('forward_12m','normalized_cycle','ttm_multiple_reference','turnaround_conditional','no_defensible_valuation_method')),
  ADD COLUMN IF NOT EXISTS multiple_months_covered INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_12m_bridge_complete BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.valuation_snapshots
  DROP CONSTRAINT IF EXISTS valuation_snapshots_primary_method_check;
ALTER TABLE public.valuation_snapshots
  ADD CONSTRAINT valuation_snapshots_primary_method_check CHECK (primary_method IN (
    'forward_pe','normalized_pe','ev_ebitda','forward_pb','ev_sales','ev_gross_profit','dcf',
    'ttm_pe_reference','ttm_pb_reference'
  ));

CREATE TABLE IF NOT EXISTS public.market_evidence_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('complete','data_incomplete')),
  regime TEXT NOT NULL CHECK (regime IN ('risk_on','selective','risk_off','breakdown','unknown')),
  taiex_state JSONB,
  tpex_state JSONB,
  breadth_state JSONB,
  foreign_flow_state JSONB,
  completeness_pct NUMERIC NOT NULL CHECK (completeness_pct BETWEEN 0 AND 100),
  roster_coverage_pct NUMERIC NOT NULL DEFAULT 0 CHECK (roster_coverage_pct BETWEEN 0 AND 100),
  missing_components JSONB NOT NULL DEFAULT '[]'::jsonb,
  risk_budget TEXT,
  as_of TIMESTAMPTZ NOT NULL,
  available_at TIMESTAMPTZ NOT NULL,
  provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
  model_version TEXT NOT NULL,
  UNIQUE (session_date, model_version)
);

CREATE TABLE IF NOT EXISTS public.candidate_detail_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id UUID NOT NULL REFERENCES public.stocks(id) ON DELETE CASCADE,
  session_date DATE NOT NULL,
  lifecycle_stage TEXT NOT NULL CHECK (lifecycle_stage IN ('found','waiting','actionable')),
  detail_kind TEXT NOT NULL CHECK (detail_kind IN ('fact','full')),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  fact_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_links JSONB NOT NULL DEFAULT '[]'::jsonb,
  valuation JSONB NOT NULL DEFAULT '{}'::jsonb,
  technical JSONB NOT NULL DEFAULT '{}'::jsonb,
  market_evidence_snapshot_id UUID REFERENCES public.market_evidence_snapshots(id) ON DELETE SET NULL,
  research_run_id UUID REFERENCES public.candidate_research_runs(id) ON DELETE SET NULL,
  ruleset_version TEXT NOT NULL,
  model_version TEXT NOT NULL,
  as_of TIMESTAMPTZ NOT NULL,
  available_at TIMESTAMPTZ NOT NULL,
  provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (stock_id, session_date, model_version)
);
CREATE INDEX IF NOT EXISTS idx_candidate_detail_latest
  ON public.candidate_detail_snapshots (stock_id, available_at DESC);

CREATE TABLE IF NOT EXISTS public.candidate_research_dossiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  detail_snapshot_id UUID NOT NULL REFERENCES public.candidate_detail_snapshots(id) ON DELETE CASCADE,
  narrative_kind TEXT NOT NULL CHECK (narrative_kind IN ('deterministic_fact','codex_enriched')),
  content JSONB NOT NULL,
  claim_fact_map JSONB NOT NULL DEFAULT '{}'::jsonb,
  validation_status TEXT NOT NULL CHECK (validation_status IN ('valid','rejected')),
  rejection_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.candidate_daily_stage_snapshots
  ADD COLUMN IF NOT EXISTS detail_revision_id UUID REFERENCES public.candidate_detail_snapshots(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.candidate_signal_tracking (
  stock_id UUID NOT NULL REFERENCES public.stocks(id) ON DELETE CASCADE,
  session_date DATE NOT NULL,
  reference_session_date DATE,
  reference_price NUMERIC,
  close NUMERIC,
  taiex_relative_return_pct NUMERIC,
  max_drawdown_pct NUMERIC,
  target_hit BOOLEAN NOT NULL DEFAULT FALSE,
  stop_hit BOOLEAN NOT NULL DEFAULT FALSE,
  risk_action TEXT NOT NULL CHECK (risk_action IN ('hold','trim_no_chase','hard_exit','data_incomplete')),
  action_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  stage_event_id UUID,
  as_of TIMESTAMPTZ NOT NULL,
  available_at TIMESTAMPTZ NOT NULL,
  model_version TEXT NOT NULL,
  PRIMARY KEY (stock_id, session_date, model_version)
);

CREATE TABLE IF NOT EXISTS public.candidate_shadow_manifests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_date DATE NOT NULL,
  policy_version TEXT NOT NULL,
  source_cutoff TIMESTAMPTZ NOT NULL,
  candidate_symbols JSONB NOT NULL,
  input_versions JSONB NOT NULL,
  manifest_hash TEXT NOT NULL,
  frozen_at TIMESTAMPTZ NOT NULL,
  UNIQUE (session_date, policy_version),
  UNIQUE (manifest_hash)
);

CREATE TABLE IF NOT EXISTS public.candidate_shadow_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manifest_id UUID NOT NULL REFERENCES public.candidate_shadow_manifests(id) ON DELETE RESTRICT,
  pipeline_run_id UUID,
  publication_id UUID,
  payload_hash TEXT,
  terminal_count INTEGER NOT NULL DEFAULT 0,
  candidate_count INTEGER NOT NULL DEFAULT 0,
  completeness_pct NUMERIC NOT NULL DEFAULT 0,
  freshness_pct NUMERIC NOT NULL DEFAULT 0,
  replay_hash TEXT,
  status TEXT NOT NULL CHECK (status IN ('running','qualified','failed','conflict')),
  blockers JSONB NOT NULL DEFAULT '[]'::jsonb,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ
);

ALTER TABLE public.candidate_shadow_session_observations
  ADD COLUMN IF NOT EXISTS shadow_policy_version TEXT NOT NULL DEFAULT 'shadow-policy-v1',
  ADD COLUMN IF NOT EXISTS manifest_id UUID REFERENCES public.candidate_shadow_manifests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS attempt_id UUID REFERENCES public.candidate_shadow_attempts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payload_hash TEXT;

-- Existing observations remain v1 audit evidence. Only observations inserted
-- after this migration participate in the v2 0/30 progress counter.
ALTER TABLE public.candidate_shadow_session_observations
  ALTER COLUMN shadow_policy_version SET DEFAULT 'shadow-policy-v2';

CREATE OR REPLACE FUNCTION public.candidate_research_stock_authority(p_cutoff TIMESTAMPTZ)
RETURNS TABLE(
  stock_id UUID,
  symbol TEXT,
  name TEXT,
  exchange TEXT,
  sector TEXT,
  source_timestamp TIMESTAMPTZ
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  WITH instrument AS (
    SELECT DISTINCT ON (i.stock_id)
      i.stock_id, i.symbol,
      COALESCE(i.official_name, i.official_short_name, i.official_legal_name) AS name,
      i.exchange::TEXT AS exchange, i.source_timestamp
    FROM public.stock_instruments_v3 i
    WHERE i.recorded_at <= p_cutoff
      AND i.source_timestamp <= p_cutoff
      AND i.valid_from <= p_cutoff
      AND (i.valid_to IS NULL OR i.valid_to > p_cutoff)
      AND i.listing_status = 'active'
      AND i.instrument_type = 'common_stock'
    ORDER BY i.stock_id, i.recorded_at DESC, i.source_timestamp DESC, i.instrument_authority_id DESC
  ), sector AS (
    SELECT DISTINCT ON (s.stock_id)
      s.stock_id, s.canonical_sector_key::TEXT AS sector
    FROM public.stock_sector_assignments_v3 s
    WHERE s.recorded_at <= p_cutoff
      AND s.source_timestamp <= p_cutoff
      AND s.valid_from <= p_cutoff
      AND (s.valid_to IS NULL OR s.valid_to > p_cutoff)
      AND s.status = 'active'
    ORDER BY s.stock_id, s.recorded_at DESC, s.source_timestamp DESC, s.assignment_authority_id DESC
  )
  SELECT i.stock_id, i.symbol, i.name, i.exchange, s.sector, i.source_timestamp
  FROM instrument i LEFT JOIN sector s USING (stock_id)
  ORDER BY i.symbol;
$function$;

REVOKE ALL ON FUNCTION public.candidate_research_stock_authority(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.candidate_research_stock_authority(TIMESTAMPTZ) TO service_role;
REVOKE ALL ON FUNCTION public.register_production_writer_release(TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_production_writer_release(TEXT, JSONB) TO service_role;

ALTER TABLE public.source_connector_cursors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_writer_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.official_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.official_multiple_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_official_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_evidence_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_detail_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_research_dossiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_signal_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_shadow_manifests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_shadow_attempts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.source_connector_cursors,
  public.production_writer_releases,
  public.official_price_history,
  public.official_multiple_history,
  public.candidate_official_facts,
  public.market_evidence_snapshots,
  public.candidate_detail_snapshots,
  public.candidate_research_dossiers,
  public.candidate_signal_tracking,
  public.candidate_shadow_manifests,
  public.candidate_shadow_attempts
FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.source_connector_cursors,
  public.production_writer_releases,
  public.official_price_history,
  public.official_multiple_history,
  public.candidate_official_facts,
  public.market_evidence_snapshots,
  public.candidate_detail_snapshots,
  public.candidate_research_dossiers,
  public.candidate_signal_tracking,
  public.candidate_shadow_manifests,
  public.candidate_shadow_attempts
TO service_role;

COMMIT;
