BEGIN;

CREATE OR REPLACE FUNCTION public.read_financial_facts_for_stocks_as_of(
  p_cutoff timestamptz,
  p_stock_ids uuid[]
)
RETURNS SETOF public.opportunity_financial_facts_v3
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $asof$
  SELECT (
    jsonb_populate_record(
      NULL::public.opportunity_financial_facts_v3,
      to_jsonb(f) || CASE
        WHEN latest.id IS NOT NULL THEN COALESCE(
          latest.effective_validation,
          '{"validation_status":"pending","schema_valid":false,"unit_valid":false,"point_in_time_valid":false,"consistency_valid":false}'::jsonb
        )
        ELSE
          '{"validation_status":"pending","schema_valid":false,"unit_valid":false,"point_in_time_valid":false,"consistency_valid":false,"validation_recorded_at":null}'::jsonb
      END
    )
  ).*
  FROM public.opportunity_financial_facts_v3 f
  LEFT JOIN LATERAL (
    SELECT r.id, r.effective_validation
    FROM public.official_financial_validation_receipts r
    WHERE r.fact_id = f.fact_id
      AND r.validated_at <= p_cutoff
      AND r.validator_version = 'official-financial-v2'
      AND r.validator_principal IS NOT NULL
    ORDER BY r.validated_at DESC, r.receipt_sequence DESC
    LIMIT 1
  ) latest ON true
  WHERE cardinality(p_stock_ids) BETWEEN 1 AND 20
    AND f.stock_id = ANY (p_stock_ids)
    AND f.recorded_at <= p_cutoff
    AND (
      COALESCE(f.source_ref, '') NOT LIKE 'issuer-document:%'
      OR public.candidate_financial_fact_has_structural_proof_as_of_v10(
        f.fact_id,
        f.recorded_at,
        substring(f.source_ref from '^issuer-document:([0-9a-f]{64}):'),
        p_cutoff
      )
    );
$asof$;

REVOKE ALL ON FUNCTION public.read_financial_facts_for_stocks_as_of(timestamptz, uuid[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_financial_facts_for_stocks_as_of(timestamptz, uuid[])
  TO service_role;
ALTER FUNCTION public.read_financial_facts_for_stocks_as_of(timestamptz, uuid[])
  OWNER TO opportunity_v3_rpc_owner;

COMMENT ON FUNCTION public.read_financial_facts_for_stocks_as_of(timestamptz, uuid[])
  IS 'Point-in-time validated financial facts for a bounded stock set; service-role only.';

COMMIT;
