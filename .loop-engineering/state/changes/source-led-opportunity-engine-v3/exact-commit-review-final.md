# Exact commit review: retained official market index recovery

Result: `PASS`

P0=0 P1=0 P2=0

## Scope reviewed

- Exact implementation range `08e28f82274b37b8d410b0c3c7934447c193804a..c384a18b075df48358d2ea32c127e26e8b953ec1` and reviewed tree `4a511bf8500740eb9937956bf0cb16f22f70dff0`.
- Official TWSE and TPEx market-index acquisition after the verified 1,320-session calendar/index backfill.
- Retained-history selection, missing-date recovery, bounded TPEx concurrency, database NULL handling, and unchanged market-completeness gates.
- Regression coverage, candidate/shadow contract tests, TypeScript, ESLint, and the production Next.js build.

## Findings

- No P0/P1/P2 findings remain.
- Existing official index values are selected only by exact market and session date. A retained non-null authority value suppresses a redundant request; a missing or NULL value remains eligible for official recovery.
- TPEx recovery is bounded to eight concurrent requests. The change removes the previous 520-request fan-out without creating an unofficial fallback or weakening the 520-bar requirement.
- Persistence still validates official origins and preserves retained rows through the existing market/session idempotency key.
- Breadth, foreign-flow, freshness, 95% roster coverage, risk budget, and actionable fail-closed rules are unchanged.
- No scoring threshold, valuation value, target price, market regime, actionable quota, source policy, or historical Shadow observation is changed.

## Verification

- Candidate, market, source, valuation and Shadow tests: 47/47 passed.
- Candidate/shadow contract tests: 17/17 passed.
- TypeScript and production Next.js build: passed.
- ESLint: passed with only the repository's pre-existing warnings.

## Evidence

- Final reviewed repair/tree: `c384a18b075df48358d2ea32c127e26e8b953ec1` / `4a511bf8500740eb9937956bf0cb16f22f70dff0`
- Full final range: `08e28f82274b37b8d410b0c3c7934447c193804a..c384a18b075df48358d2ea32c127e26e8b953ec1`
- Active graph: `1c32b707a2e3d36e0ca01b4e78b9c20fa5bcef5eb34dce486063d9f694a2c9fc`
