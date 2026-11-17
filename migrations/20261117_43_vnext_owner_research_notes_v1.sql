BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL lock_timeout = '2s';

-- Owner research is a separate read projection over existing operator notes.
-- Only the trusted server supplies a rights subject after owner authentication.
CREATE FUNCTION public.vnext_owner_research_notes_v1(p_rights_subject text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog
SET statement_timeout = '3s'
AS $$
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'source', note.source,
      'statement', note.statement,
      'publishedAt', note.published_at
    ) ORDER BY note.completed_at DESC, note.content_hash
  ), '[]'::jsonb)
  FROM (
    SELECT receipt.source, receipt.original->>'statement' AS statement,
      receipt.original->>'publishedAt' AS published_at, receipt.completed_at, receipt.content_hash
    FROM public.vnext_extractions_v1 receipt
    JOIN public.vnext_source_policies_v1 policy USING (source, scope, rights_subject, license_basis)
    WHERE p_rights_subject ~ '^[A-Za-z0-9_.:-]{1,128}$'
      AND receipt.rights_subject = p_rights_subject
      AND receipt.scope = 'operator_claim'
      AND receipt.source IN ('investanchors', 'telegram')
      AND receipt.state = 'completed' AND receipt.completed_at IS NOT NULL
      AND policy.enabled AND policy.valid_until > statement_timestamp()
      AND receipt.original->'rightsAttested' = 'true'::jsonb
      AND receipt.original->'operatorAuthored' = 'true'::jsonb
      AND jsonb_typeof(receipt.original->'statement') = 'string'
      AND char_length(btrim(receipt.original->>'statement')) BETWEEN 1 AND 320
      AND jsonb_typeof(receipt.original->'publishedAt') = 'string'
      AND NOT (receipt.original ?| ARRAY['body', 'title'])
      AND NOT EXISTS (
        SELECT FROM public.vnext_source_withdrawals_v1 withdrawal WHERE withdrawal.content_hash = receipt.content_hash
      )
      AND EXISTS (SELECT FROM public.vnext_mode_v1 WHERE enabled AND legacy_fenced)
    ORDER BY receipt.completed_at DESC, receipt.content_hash
    LIMIT 20
  ) note
$$;

ALTER FUNCTION public.vnext_owner_research_notes_v1(text) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_owner_research_notes_v1(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vnext_owner_research_notes_v1(text) TO service_role;

COMMIT;
