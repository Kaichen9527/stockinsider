-- Admit the issuer-scoped cyclical-asset valuation identity produced by the
-- AUO forward common-equity bridge. This changes the enum contract only; it
-- does not run research or publish a recommendation.
BEGIN;

ALTER TABLE public.valuation_snapshots
  DROP CONSTRAINT IF EXISTS valuation_snapshots_primary_method_check;
ALTER TABLE public.valuation_snapshots
  ADD CONSTRAINT valuation_snapshots_primary_method_check CHECK (primary_method IN (
    'forward_pe','normalized_pe','ev_ebitda','forward_pb','forward_bvps_pb',
    'financial_pb_roe','pb_reference','ev_sales','ev_gross_profit','dcf',
    'ttm_pe_reference','ttm_pb_reference'
  ));

ALTER TABLE public.valuation_snapshots
  DROP CONSTRAINT IF EXISTS valuation_snapshots_valuation_basis_check;
ALTER TABLE public.valuation_snapshots
  ADD CONSTRAINT valuation_snapshots_valuation_basis_check CHECK (valuation_basis IN (
    'forward_12m','forward_bvps_pb','normalized_cycle','pb_reference','ev_ebitda',
    'financial_pb_roe','ttm_multiple_reference','turnaround_conditional',
    'no_defensible_valuation_method'
  ));

ALTER TABLE public.candidate_research_run_items
  DROP CONSTRAINT IF EXISTS candidate_research_run_items_valuation_method_check;
ALTER TABLE public.candidate_research_run_items
  ADD CONSTRAINT candidate_research_run_items_valuation_method_check CHECK (
    valuation_method IS NULL OR valuation_method IN (
      'forward_12m','forward_bvps_pb','normalized_cycle','pb_reference','ev_ebitda',
      'financial_pb_roe','ttm_multiple_reference','turnaround_conditional',
      'no_defensible_valuation_method','insufficient_official_evidence'
    )
  ) NOT VALID;

COMMIT;
