# Exact implementation review — official TWSE InfoHub revenue fallback v17

Date: 2026-09-14

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `f6a867f2dbcca929657b44b17aec35ebcac921ff` / `602641988d67d87f33775adcbe0602f417180da0`
- Full final range: `c7ab0ef42363176a6bc3293f12a0383a5ca0216c..f6a867f2dbcca929657b44b17aec35ebcac921ff`
- Active graph: `c563d77e416fdc2284b7aba50ca2eb03fd5f4cbed44f4edb1c918c63db96e3a2`

## Scope reviewed

- Candidate monthly-revenue acquisition now falls back to the official TWSE InfoHub company-financial JSON endpoint after the legacy MOPS clients fail and before the optional FinMind adapter.
- The fallback is company-specific and binds the returned `code` to the requested four-digit stock symbol. A cross-company response cannot enter the candidate fact set.
- The parser requires a successful official status, aligned date/revenue arrays, valid `YYYYMM` periods, finite non-negative revenue, and at least one usable observation. Malformed or identity-mismatched data fails closed.
- The change does not restore retired crawlers, consume paid-source text, weaken evidence thresholds, or synthesize missing valuation inputs.

## Production evidence reviewed

- From the Contabo VPS, the legacy TWSE aggregate monthly-revenue OpenAPI returned HTTP 200 with an approximately 800-byte TWSE security-block HTML document, so transport success was not valid financial evidence.
- The free FinMind aggregate fallback returned HTTP 400 because that dataset is unavailable at the configured access level.
- The official TWSE InfoHub company-financial endpoint returned HTTP 200 JSON for a concrete listed company and supplied identity-bound monthly revenue, PE, PB, and price observations. This repair consumes only its monthly-revenue portion.
- The preceding deployed research run completed 284 candidates with zero runtime failures; remaining partial valuations were evidence-coverage gaps rather than parser crashes.

## Security and correctness reasoning

- No credential, cookie, private endpoint, browser automation, or unofficial HTML scraper is introduced.
- Provider identity, period shape, array alignment, value range, provenance URL, and fetched time are preserved and validated before the facts can be used.
- The official InfoHub fallback is bounded per candidate and remains subordinate to the existing primary official clients.
- Missing or conflicting evidence stays partial. Research, confidence, actionability, upside, reward-risk, market, and two-session confirmation gates are unchanged.

## Verification

- Taiwan market unit tests: 26 passed, 0 failed.
- Full product-correctness suite: 154 passed, 0 failed; captured output SHA-256 `87d7c938e5ec93865e09275b683c95786e9a77d220b7c39d694c82002d515ab2`.
- TypeScript passed.
- ESLint for the changed implementation and test passed with zero errors.
- Production build passed.
- `git diff --check` passed.

This review covers the exact implementation commit. Merge, deployment to Contabo, and a production canary remain separate rollout gates.
