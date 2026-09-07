BEGIN;

-- New writers use reported_numeric. official_numeric remains readable because
-- historical evidence is immutable audit material, not a rewrite target.
ALTER TABLE public.candidate_official_facts
  DROP CONSTRAINT IF EXISTS candidate_official_facts_fact_kind_check;
ALTER TABLE public.candidate_official_facts
  ADD CONSTRAINT candidate_official_facts_fact_kind_check CHECK (
    fact_kind IN (
      'reported_numeric','official_numeric','official_text','model_assumption',
      'derived_calculation','data_gap'
    )
  );
ALTER TABLE public.candidate_official_facts
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS upstream_provider TEXT,
  ADD COLUMN IF NOT EXISTS validation_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS schema_valid BOOLEAN,
  ADD COLUMN IF NOT EXISTS unit_valid BOOLEAN,
  ADD COLUMN IF NOT EXISTS point_in_time_valid BOOLEAN,
  ADD COLUMN IF NOT EXISTS consistency_valid BOOLEAN;
ALTER TABLE public.candidate_official_facts
  DROP CONSTRAINT IF EXISTS candidate_official_facts_validation_status_check;
ALTER TABLE public.candidate_official_facts
  ADD CONSTRAINT candidate_official_facts_validation_status_check CHECK (
    validation_status IN ('validated','pending','rejected','stale','conflict')
  );

-- The V3 provider enum identifies the collector but previously had no
-- independent validation plane. Pending is deliberately fail-closed. It keeps
-- old FinMind rows out of promotion until a validation receipt exists.
ALTER TABLE public.opportunity_financial_facts_v3
  ADD COLUMN IF NOT EXISTS validation_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS schema_valid BOOLEAN,
  ADD COLUMN IF NOT EXISTS unit_valid BOOLEAN,
  ADD COLUMN IF NOT EXISTS point_in_time_valid BOOLEAN,
  ADD COLUMN IF NOT EXISTS consistency_valid BOOLEAN,
  ADD COLUMN IF NOT EXISTS upstream_provider TEXT;
ALTER TABLE public.opportunity_financial_facts_v3
  DROP CONSTRAINT IF EXISTS opportunity_financial_facts_v3_validation_status_check;
ALTER TABLE public.opportunity_financial_facts_v3
  ADD CONSTRAINT opportunity_financial_facts_v3_validation_status_check CHECK (
    validation_status IN ('validated','pending','rejected','stale','conflict')
  ) NOT VALID;

-- Only a server-side writer can promote a FinMind mirror, and only after all
-- validation dimensions were independently supplied. This is intentionally a
-- state transition, not an allowlist of provider names.
CREATE OR REPLACE FUNCTION public.validate_finmind_financial_fact_v6(
  p_fact_id UUID,
  p_schema_valid BOOLEAN,
  p_unit_valid BOOLEAN,
  p_point_in_time_valid BOOLEAN,
  p_consistency_valid BOOLEAN,
  p_upstream_provider TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_updated BOOLEAN := FALSE;
BEGIN
  IF p_fact_id IS NULL OR COALESCE(p_upstream_provider, '') !~ '^[A-Za-z0-9_.:-]{1,120}$' THEN
    RAISE EXCEPTION 'invalid_finmind_validation_input';
  END IF;
  UPDATE public.opportunity_financial_facts_v3
  SET validation_status = CASE
        WHEN p_schema_valid AND p_unit_valid AND p_point_in_time_valid AND p_consistency_valid THEN 'validated'
        ELSE 'rejected'
      END,
      schema_valid = p_schema_valid,
      unit_valid = p_unit_valid,
      point_in_time_valid = p_point_in_time_valid,
      consistency_valid = p_consistency_valid,
      upstream_provider = p_upstream_provider
  WHERE fact_id = p_fact_id
    AND provider = 'finmind'
    AND authority_tier = 'finmind_mirror'
  RETURNING TRUE INTO v_updated;
  RETURN COALESCE(v_updated, FALSE);
END;
$function$;
REVOKE ALL ON FUNCTION public.validate_finmind_financial_fact_v6(UUID,BOOLEAN,BOOLEAN,BOOLEAN,BOOLEAN,TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_finmind_financial_fact_v6(UUID,BOOLEAN,BOOLEAN,BOOLEAN,BOOLEAN,TEXT)
  TO service_role;

ALTER TABLE public.valuation_snapshots
  DROP CONSTRAINT IF EXISTS valuation_snapshots_primary_method_check;
ALTER TABLE public.valuation_snapshots
  ADD CONSTRAINT valuation_snapshots_primary_method_check CHECK (primary_method IN (
    'forward_pe','normalized_pe','ev_ebitda','forward_pb','financial_pb_roe',
    'pb_reference','ev_sales','ev_gross_profit','dcf','ttm_pe_reference',
    'ttm_pb_reference'
  ));
ALTER TABLE public.valuation_snapshots
  DROP CONSTRAINT IF EXISTS valuation_snapshots_valuation_basis_check;
ALTER TABLE public.valuation_snapshots
  ADD CONSTRAINT valuation_snapshots_valuation_basis_check CHECK (valuation_basis IN (
    'forward_12m','normalized_cycle','pb_reference','ev_ebitda',
    'financial_pb_roe','ttm_multiple_reference','turnaround_conditional',
    'no_defensible_valuation_method'
  ));

ALTER TABLE public.candidate_research_run_items
  DROP CONSTRAINT IF EXISTS candidate_research_run_items_valuation_method_check;
ALTER TABLE public.candidate_research_run_items
  ADD CONSTRAINT candidate_research_run_items_valuation_method_check CHECK (
    valuation_method IS NULL OR valuation_method IN (
      'forward_12m','normalized_cycle','pb_reference','ev_ebitda',
      'financial_pb_roe','ttm_multiple_reference','turnaround_conditional',
      'no_defensible_valuation_method','insufficient_official_evidence'
    )
  ) NOT VALID;

ALTER TABLE public.candidate_research_runs
  ADD COLUMN IF NOT EXISTS partial_count INTEGER NOT NULL DEFAULT 0
  CHECK (partial_count >= 0);

COMMIT;
