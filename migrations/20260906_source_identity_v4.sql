BEGIN;

-- Preserve durable, cross-URL identity separately from the display payload.
-- This supports concentration checks without deleting or rewriting audit rows.
ALTER TABLE public.source_raw_documents
  ADD COLUMN IF NOT EXISTS canonical_content_hash TEXT,
  ADD COLUMN IF NOT EXISTS stance_semantics TEXT
    CHECK (stance_semantics IN ('endorsement', 'negative', 'neutral'));
CREATE INDEX IF NOT EXISTS idx_source_raw_documents_canonical_content
  ON public.source_raw_documents (canonical_content_hash)
  WHERE canonical_content_hash IS NOT NULL;

-- A Telegram cursor is channel-scoped.  The old cursor_value remains for
-- backward compatibility; these fields make its identity and observed time
-- queryable without parsing URLs or JSON.
ALTER TABLE public.source_connector_cursors
  ADD COLUMN IF NOT EXISTS channel_identity TEXT,
  ADD COLUMN IF NOT EXISTS message_id BIGINT,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_source_connector_cursors_telegram_channel_message
  ON public.source_connector_cursors (connector, channel_identity, message_id DESC)
  WHERE connector = 'telegram';

-- Source centre has to distinguish a successful metadata-index refresh from
-- permission to analyze content.  valid_matches is deliberately separate from
-- rows written, because an existing document can still be a valid match.
ALTER TABLE public.source_run_ledger
  ADD COLUMN IF NOT EXISTS index_updated BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS content_analyzable BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS valid_matches INTEGER NOT NULL DEFAULT 0
    CHECK (valid_matches >= 0);

ALTER TABLE public.podcast_episodes
  ADD COLUMN IF NOT EXISTS content_analyzable BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS index_updated_at TIMESTAMPTZ;

-- All old and newly-invalidated GDELT rows remain accessible from the base
-- table for audit.  The default source-search plane, its count, and coverage
-- RPC share this exact predicate so none can leak into current discovery.
CREATE OR REPLACE VIEW public.source_search_documents_v3
WITH (security_invoker = true)
AS
SELECT d.*
FROM public.source_raw_documents d
WHERE d.platform <> 'gdelt'
   OR (
     COALESCE(d.metadata->>'discovery_eligible', 'false') = 'true'
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
SET search_path = public, pg_temp
AS $function$
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
$function$;

REVOKE ALL ON FUNCTION public.source_document_coverage(TIMESTAMPTZ,TIMESTAMPTZ,TEXT,TEXT,TEXT,TEXT,TEXT[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.source_document_coverage(TIMESTAMPTZ,TIMESTAMPTZ,TEXT,TEXT,TEXT,TEXT,TEXT[])
  TO service_role;
GRANT SELECT ON public.source_search_documents_v3 TO service_role;

COMMIT;
