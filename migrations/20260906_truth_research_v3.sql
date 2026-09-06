BEGIN;

-- Preserve the misparsed observations for audit while making them impossible
-- to reuse as valuation authority.  The corrected parser writes a versioned
-- lineage marker on every replacement observation.
ALTER TABLE public.fundamental_snapshots
  ADD COLUMN IF NOT EXISTS valuation_parser_version TEXT,
  ADD COLUMN IF NOT EXISTS quality_status TEXT NOT NULL DEFAULT 'valid'
    CHECK (quality_status IN ('valid','quarantined')),
  ADD COLUMN IF NOT EXISTS quality_reason TEXT;

ALTER TABLE public.official_multiple_history
  ADD COLUMN IF NOT EXISTS valuation_parser_version TEXT,
  ADD COLUMN IF NOT EXISTS quality_status TEXT NOT NULL DEFAULT 'valid'
    CHECK (quality_status IN ('valid','quarantined')),
  ADD COLUMN IF NOT EXISTS quality_reason TEXT;

ALTER TABLE public.candidate_official_facts
  ADD COLUMN IF NOT EXISTS fact_kind TEXT NOT NULL DEFAULT 'official_numeric'
    CHECK (fact_kind IN ('official_numeric','official_text','model_assumption','derived_calculation','data_gap')),
  ADD COLUMN IF NOT EXISTS derivation JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.candidate_research_dossiers
  ADD COLUMN IF NOT EXISTS bundle_hash TEXT,
  ADD COLUMN IF NOT EXISTS detail_payload_hash TEXT;

ALTER TABLE public.candidate_research_run_items
  ADD COLUMN IF NOT EXISTS execution_status TEXT,
  ADD COLUMN IF NOT EXISTS research_readiness TEXT,
  ADD COLUMN IF NOT EXISTS valuation_method TEXT,
  ADD COLUMN IF NOT EXISTS narrative_kind TEXT;

ALTER TABLE public.candidate_signal_tracking
  ADD COLUMN IF NOT EXISTS signal_episode_id TEXT,
  ADD COLUMN IF NOT EXISTS initial_atr14 NUMERIC,
  ADD COLUMN IF NOT EXISTS initial_stop_price NUMERIC,
  ADD COLUMN IF NOT EXISTS peak_close NUMERIC;

CREATE TABLE IF NOT EXISTS public.valuation_data_quality_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key TEXT NOT NULL UNIQUE,
  affected_source TEXT NOT NULL,
  affected_before TIMESTAMPTZ NOT NULL,
  reason TEXT NOT NULL,
  correction_parser_version TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.valuation_data_quality_row_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key TEXT NOT NULL REFERENCES public.valuation_data_quality_events(event_key),
  source_table TEXT NOT NULL,
  source_row_key TEXT NOT NULL,
  source_row JSONB NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_key, source_table, source_row_key)
);

INSERT INTO public.valuation_data_quality_events
  (event_key, affected_source, affected_before, reason, correction_parser_version)
VALUES
  ('tpex_pe_yield_column_misread_v2_2', 'tpex_peQryDate', '2026-09-06T00:00:00+08:00',
   'Legacy positional parser read dividend yield as PE. Rows remain for audit and are excluded from authority.',
   'tpex-header-v2')
ON CONFLICT (event_key) DO NOTHING;

INSERT INTO public.valuation_data_quality_row_audit
  (event_key, source_table, source_row_key, source_row)
SELECT 'tpex_pe_yield_column_misread_v2_2', 'fundamental_snapshots', f.id::text, to_jsonb(f)
FROM public.fundamental_snapshots f
WHERE f.source_url LIKE 'https://www.tpex.org.tw/%'
  AND COALESCE(f.valuation_parser_version, '') <> 'tpex-header-v2'
ON CONFLICT (event_key, source_table, source_row_key) DO NOTHING;

INSERT INTO public.valuation_data_quality_row_audit
  (event_key, source_table, source_row_key, source_row)
SELECT 'tpex_pe_yield_column_misread_v2_2', 'official_multiple_history',
       m.stock_id::text || ':' || m.month_end::text, to_jsonb(m)
FROM public.official_multiple_history m
WHERE m.source_url LIKE 'https://www.tpex.org.tw/%'
  AND COALESCE(m.valuation_parser_version, '') <> 'tpex-header-v2'
ON CONFLICT (event_key, source_table, source_row_key) DO NOTHING;

UPDATE public.fundamental_snapshots
SET quality_status = 'quarantined',
    quality_reason = 'tpex_pe_yield_column_misread_v2_2'
WHERE source_url LIKE 'https://www.tpex.org.tw/%'
  AND COALESCE(valuation_parser_version, '') <> 'tpex-header-v2';

UPDATE public.official_multiple_history
SET quality_status = 'quarantined',
    quality_reason = 'tpex_pe_yield_column_misread_v2_2'
WHERE source_url LIKE 'https://www.tpex.org.tw/%'
  AND COALESCE(valuation_parser_version, '') <> 'tpex-header-v2';

-- Historical PTT bulk institutional rankings predate the semantic classifier.
-- Preserve both planes for audit, but invalidate their candidate mentions so
-- a long list of official-flow tickers cannot masquerade as independent social
-- recommendations during the remaining seven-day window.
-- These two tables are protected by the production-writer trigger. A schema
-- migration runs as the database owner rather than as the VPS writer, so pause
-- only the named fence triggers for this audited, transactional backfill. Any
-- error rolls the trigger state and the data changes back together.
ALTER TABLE public.source_raw_documents
  DISABLE TRIGGER trg_source_raw_documents_writer_fence;
ALTER TABLE public.candidate_source_mentions
  DISABLE TRIGGER trg_candidate_source_mentions_writer_fence;

UPDATE public.source_raw_documents
SET content_semantics = 'bulk_institutional_ranking',
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'content_semantics', 'bulk_institutional_ranking',
      'candidate_discovery_eligible', false,
      'semantic_reclassified_by', 'source-ranking-v2.2.0'
    )
WHERE platform = 'ptt'
  AND (
    COALESCE(title, '') || ' ' || COALESCE(summary, '')
  ) ~* '(外資|投信|三大法人).*(買超|賣超).*(排行|前[[:space:]]*[0-9]+|TOP[[:space:]]*[0-9]+)';

UPDATE public.candidate_source_mentions mention
SET provenance = COALESCE(mention.provenance, '{}'::jsonb) || jsonb_build_object(
  'discovery_eligible', false,
  'invalidated', true,
  'invalidation_reason', 'ptt_bulk_institutional_ranking'
)
WHERE mention.platform = 'ptt'
  AND EXISTS (
    SELECT 1
    FROM public.source_raw_documents document
    WHERE document.platform = 'ptt'
      AND document.document_url = mention.source_url
      AND document.content_semantics = 'bulk_institutional_ranking'
  );

ALTER TABLE public.candidate_source_mentions
  ENABLE TRIGGER trg_candidate_source_mentions_writer_fence;
ALTER TABLE public.source_raw_documents
  ENABLE TRIGGER trg_source_raw_documents_writer_fence;

-- The source-center result plane and its coverage aggregation share exactly
-- the same discovery-validity predicate. Invalidated GDELT rows remain in the
-- base table for audits, but can no longer appear as current search results.
CREATE OR REPLACE VIEW public.source_search_documents_v3
WITH (security_invoker = true)
AS
SELECT d.*
FROM public.source_raw_documents d
WHERE d.platform <> 'gdelt'
   OR (
     d.metadata->>'discovery_eligible' = 'true'
     AND d.metadata->>'matcher_version' = 'gdelt-tw-context-v2'
     AND COALESCE(d.metadata->>'invalidated', 'false') <> 'true'
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
  FROM public.source_search_documents_v3 d
  WHERE (p_from IS NULL OR d.collected_at >= p_from)
    AND (p_to IS NULL OR d.collected_at <= p_to)
    AND (p_platform IS NULL OR p_platform = 'all' OR d.platform = p_platform)
    AND (p_query IS NULL OR d.title ILIKE '%' || p_query || '%' OR d.summary ILIKE '%' || p_query || '%')
    AND (p_symbol IS NULL OR d.symbols ? p_symbol)
    AND (p_theme_symbols IS NULL OR d.symbols ?| p_theme_symbols)
    AND (
      p_verification_status IS NULL
      OR (p_verification_status = '已證實' AND d.metadata->>'verification_status' = 'verified')
      OR (p_verification_status = '部分證實' AND d.metadata->>'verification_status' = 'partial')
      OR (p_verification_status = '未證實' AND COALESCE(d.metadata->>'verification_status', 'unverified') NOT IN ('verified','partial'))
    )
  GROUP BY d.platform
  ORDER BY COUNT(*) DESC, d.platform ASC;
$$;

CREATE TABLE IF NOT EXISTS public.source_connector_cursors (
  connector TEXT NOT NULL,
  scope_key TEXT NOT NULL DEFAULT 'default',
  cursor_value TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (connector, scope_key)
);
ALTER TABLE public.source_connector_cursors
  ADD COLUMN IF NOT EXISTS scope_key TEXT NOT NULL DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS observed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
UPDATE public.source_connector_cursors
SET observed_at = COALESCE(observed_at, NOW());
ALTER TABLE public.source_connector_cursors
  ALTER COLUMN observed_at SET NOT NULL;
ALTER TABLE public.source_connector_cursors
  DROP CONSTRAINT IF EXISTS source_connector_cursors_pkey;
ALTER TABLE public.source_connector_cursors
  ADD CONSTRAINT source_connector_cursors_pkey PRIMARY KEY (connector, scope_key);

ALTER TABLE public.valuation_data_quality_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.valuation_data_quality_row_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_connector_cursors ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.valuation_data_quality_events, public.valuation_data_quality_row_audit, public.source_connector_cursors
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.valuation_data_quality_events, public.valuation_data_quality_row_audit TO service_role;
GRANT ALL ON public.source_connector_cursors TO service_role;
GRANT SELECT ON public.source_search_documents_v3 TO service_role;
REVOKE ALL ON FUNCTION public.source_document_coverage(TIMESTAMPTZ,TIMESTAMPTZ,TEXT,TEXT,TEXT,TEXT,TEXT[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.source_document_coverage(TIMESTAMPTZ,TIMESTAMPTZ,TEXT,TEXT,TEXT,TEXT,TEXT[])
  TO service_role;

COMMIT;
