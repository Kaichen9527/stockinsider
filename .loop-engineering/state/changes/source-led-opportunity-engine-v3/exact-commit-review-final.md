# Exact implementation review — TWSE canonical scope and TPEx transport v10

Date: 2026-09-14

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `797574a7e39784804fb57205efad6a05d47c7426` / `8ba1146ec045fe653dd86a451625801fd837e8e3`
- Full final range: `694043d49539650d2f16df8727bee525d569e185..797574a7e39784804fb57205efad6a05d47c7426`
- Active graph: `c563d77e416fdc2284b7aba50ca2eb03fd5f4cbed44f4edb1c918c63db96e3a2`

## Scope reviewed

- Exchange-wide TWSE institutional and margin canonical results now retain only four-digit common-stock identities while preserving the complete bounded provider payload in the immutable attempt receipt.
- TPEx official acquisition on Contabo uses a fixed executable and a GET-only, HTTPS-only, host-closed, 5 MB bounded curl transport because the TPEx edge terminates Node/undici streams from the production address.
- FinMind fallback remains on the ordinary fetch transport, so its bearer token never enters a process command line.
- Provider contract v10 creates fresh immutable jobs instead of reusing failed v9 terminals.

## Security and correctness reasoning

- The curl adapter accepts only `www.tpex.org.tw` with no port, credentials, body, authorization header, or cookie. It does not invoke a shell and caps connection time, wall time, and output bytes.
- Redirect protocols remain HTTPS-only. HTTP status is separated from the bounded response body using a closed parser before creating the fetch-compatible response.
- Canonical filtering reduces T86 from 16,539 mixed securities to 1,077 four-digit equities without discarding the original official evidence receipt.
- Source hostnames, FinMind credential destination, database grants, writer leases, classification thresholds, and destructive cleanup authority are unchanged.

## Verification

- Targeted provider, refresh, and bounded-curl tests: 30 passed, 0 failed.
- Taiwan provider contract: 10 passed, 0 failed.
- `npm run test:source-led-opportunity-v3:product-correctness`: 154 passed, 0 failed.
- TypeScript and ESLint passed.
- Next.js production build passed and generated 89 routes.
- Live Contabo evidence: all three TPEx endpoints terminated under Node/undici while fixed-host curl returned HTTP 200 for institutional and margin sources.
- `git diff --check 694043d49539650d2f16df8727bee525d569e185..797574a7e39784804fb57205efad6a05d47c7426` passed.

This review covers the exact implementation commit. Deployment, the v10 provider canary, research publication, and the seven-day Supabase read-only observation remain separately measured rollout gates.
