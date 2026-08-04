# Acceptance Test Plan: improve-stock-discovery-pool

Generated: 2026-06-22

## RED Characterization Targets

These tests/audits are expected to fail or be incomplete before implementation.

1. `audit:missed-hot-symbols --fixture market-movers`
   - Fixture includes one limit-up symbol, one near-limit-up symbol, and one unusual-volume symbol.
   - Expected post-change: every fixture symbol is visible as candidate/early/scenario/hot_tracking or has an explicit exclusion reason.

2. `audit:recommendation-pool-freshness --fixture static-radar`
   - Does not require `http://127.0.0.1:3012`.
   - Expected post-change: audit can validate unchanged reason, source activity, and candidate summary from fixture data.

3. `audit:social-broker-revaluation-trigger --fixture broker-leak`
   - Fixture includes a social post mentioning Morgan Stanley or FactSet target/EPS.
   - Expected post-change: broker leak creates revaluation trigger and candidate evidence, but formal gate remains blocked without verified broker/official source.

4. `audit:recommendation-gates`
   - Must remain green throughout the change.

5. `audit:source-health`
   - Must remain green or fail only with connector-specific degraded reasons.

## Regression Commands

```bash
cd web && npm run lint
cd web && npm run build
npm run audit:recommendation-gates
npm run audit:valuation-sanity
npm run audit:revaluation-loop
npm run audit:source-health
npm run audit:source-cadence
npm run audit:missed-hot-symbols
npm run audit:recommendation-pool-freshness
npm run audit:social-surface-coverage
npm run audit:global-theme-lead-lag
```

## Manual Smoke Set

- Current visible symbols from latest audit: `2382 / 3324 / 2337 / 5388 / 2421 / 2449 / 2356 / 3231 / 6230 / 3711 / 2301 / 2327 / 5328 / 2492`.
- Add day-specific limit-up/near-limit-up symbols during implementation smoke.
