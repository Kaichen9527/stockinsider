# Exact implementation review — candidate financial TPEx fallback v12

Date: 2026-09-14

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `fb0d81694eca671d1a57fb5ad1c64e93979b6c36` / `c9efd1dc26e49fc76dd9229a67e5644fe5a0bd19`
- Full final range: `0f96aec09f809c7e44548109b76a4b69289436f3..fb0d81694eca671d1a57fb5ad1c64e93979b6c36`
- Active graph: `c563d77e416fdc2284b7aba50ca2eb03fd5f4cbed44f4edb1c918c63db96e3a2`

## Scope reviewed

- Candidate financial acquisition now reuses the fixed-host, bounded official curl transport only after ordinary fetch and Node range recovery both fail.
- The fallback is limited to TPEx official financial datasets and returns the same `Response` contract consumed by the existing JSON parser, validation, and persistence stages.
- Test injection remains authoritative: when a bounded fetch implementation is supplied, production curl is not selected, so unit and integration tests remain hermetic.
- No valuation threshold, accounting validation rule, classification rule, database grant, writer lease, or source policy changed.

## Security and correctness reasoning

- The shared transport accepts only HTTPS `www.tpex.org.tw`, rejects ports, URL credentials, request bodies, authorization headers, and cookies, and executes only `/usr/bin/curl` with a closed argument set.
- Responses remain bounded to five megabytes with connect, transfer, and subprocess output limits. Non-success HTTP states remain explicit errors and cannot be persisted as verified facts.
- FinMind and any credential-bearing endpoint stay on ordinary fetch, so provider tokens cannot enter subprocess arguments or journals.
- Existing structured financial validation still controls admission: transport success alone cannot mark an iXBRL or JSON fact verified.
- The live official `generalIncome` and `generalBalance` objects were read through the bounded transport at 1,180,687 and 758,855 bytes respectively, each yielding 883 rows without writing production data during review.

## Verification

- Candidate financial and bounded transport tests: 22 passed, 0 failed.
- `npm run test:source-led-opportunity-v3:product-correctness`: 154 passed, 0 failed.
- TypeScript passed; ESLint passed with 33 pre-existing warnings and zero errors.
- Next.js production build passed and generated 89 routes.
- Live bounded transport parsing passed for TPEx general income and balance datasets.
- `git diff --check 0f96aec09f809c7e44548109b76a4b69289436f3..fb0d81694eca671d1a57fb5ad1c64e93979b6c36` passed.

This review covers the exact implementation commit. Deployment, queue drain, research publication, and the seven-day Supabase read-only observation remain separately measured rollout gates.
