# Exact commit review: official calendar pagination and public payload budget

Result: `PASS`

P0=0 P1=0 P2=0

## Scope reviewed

- Exact implementation range `aa62c21f471920356d1b6e2b3c88064f5b0e2709..c11c6f718b3e65affc4a0c7172adf7531b0f6eb2` and reviewed tree `330a7e52638e51c65826cc17080973be7d7310e2`.
- Official trading-session authority pagination and de-duplication before the 520-session market-evidence gate.
- Homepage SSR/RSC preview hydration, immutable daily snapshot replacement, and Radar transport compaction.
- Updated structural contracts for endpoint-scoped official-host circuit breakers and compact homepage rendering.

## Findings

- No P0/P1/P2 findings remain. The append-only trading-session authority is read in bounded 1,000-row pages from the TWSE stream until 520 distinct completed sessions are present; the previously observed false `official_market_session_history_below_520` terminal can no longer result from de-duplicating after an undersized limit.
- The 520-session requirement, official-only evidence rule, fail-closed market gate, and null risk budget for incomplete evidence remain unchanged.
- Homepage SSR sends a 12-card preview and immediately fetches the complete immutable daily snapshot after hydration. All source-hit cards remain available, while first response transfer no longer serializes the entire candidate plane.
- The daily Radar response retains every candidate-stage card and trims only bounded theme compatibility data. Full research remains on stock and theme detail routes.
- The changes are application-only, contain no migration or destructive data operation, and do not alter scoring, valuation, stage, or Shadow thresholds.

## Verification

- `npm run test:source-led-opportunity-v3:product-correctness`: 150/150 passed on the exact reviewed commit.
- Candidate research, Shadow, market evidence, source policy, and technical tests: 43/43 passed.
- Scheduler, internal caller, additive migration, publication, writer-fence, and Shadow contracts: 17/17 passed.
- Targeted source-led homepage ordering regression: passed.
- TypeScript, ESLint with zero errors, and production build: passed.

## Evidence

- Final reviewed repair/tree: `c11c6f718b3e65affc4a0c7172adf7531b0f6eb2` / `330a7e52638e51c65826cc17080973be7d7310e2`
- Full final range: `aa62c21f471920356d1b6e2b3c88064f5b0e2709..c11c6f718b3e65affc4a0c7172adf7531b0f6eb2`
- Active graph: `81dceab0d17b6c0f0c104ee3376f6d1dc5065a283040a4c1ee0ac40f574580d4`
