# Exact implementation review — candidate history backfill schedule v14

Date: 2026-09-14

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `03431bce75fa3e74dc0945ebc36eeaac251d754d` / `ea498cc3f3ecea1e4c68dd7338be3326dbbb7120`
- Full final range: `2c7c054409106948ff18696bbd73145f49904c49..03431bce75fa3e74dc0945ebc36eeaac251d754d`
- Active graph: `c563d77e416fdc2284b7aba50ca2eb03fd5f4cbed44f4edb1c918c63db96e3a2`

## Scope reviewed

- A dedicated systemd oneshot invokes the existing authenticated candidate-history backfill endpoint with an 80-request global budget and four-request per-stock budget.
- The job runs hourly at minute 25 outside the 18:00–21:59 Asia/Taipei final market and research window.
- Installation enables the new timer with the existing production schedule set.
- The provider contract test fixes the timer, endpoint, budget, capacity guard, and shared production writer lock as reviewed behavior.

## Security and correctness reasoning

- The service loads internal authentication only from `/etc/stockinsider/stockinsider.env`; no secret is embedded in the unit, command line, repository, or journal output.
- The existing capacity guard runs before every attempt and can stop optional backfill before the 15 GiB floor is endangered.
- The shared `stockinsider-production-write.lock` serializes history acquisition against source, market, financial, research, and publication writers.
- The endpoint remains protected by internal bearer authentication and the active VPS writer lease; this change does not alter validation, valuation, classification, or publication rules.
- Bounded budgets and the service timeout prevent a single timer activation from becoming an unbounded provider crawl.

## Verification

- Taiwan data provider contract tests: 10 passed, 0 failed.
- `npm run test:source-led-opportunity-v3:product-correctness`: 154 passed, 0 failed.
- TypeScript passed; ESLint passed with 33 pre-existing warnings and zero errors.
- Production build passed.
- `systemd-analyze verify` on Contabo accepted both units and normalized the timer schedule.
- `git diff --check 2c7c054409106948ff18696bbd73145f49904c49..03431bce75fa3e74dc0945ebc36eeaac251d754d` passed.

This review covers the exact implementation commit. Deployment, timer activation, bounded production canary, and continuing provider coverage are separately measured rollout gates.
