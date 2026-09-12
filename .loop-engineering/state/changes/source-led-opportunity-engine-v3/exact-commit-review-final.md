# Exact implementation review — retry truncated TPEx financial responses

Date: 2026-09-13

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `3da42c12c964b880b4e1bc95a3864db6406f21e0` / `bfc36f9ec80b25eb85d40b0532fd6695cfd52db2`
- Full final range: `937f3053eebe28bb3791422c7f5482210864957a..3da42c12c964b880b4e1bc95a3864db6406f21e0`
- Active graph: `c563d77e416fdc2284b7aba50ca2eb03fd5f4cbed44f4edb1c918c63db96e3a2`

## Review result

- Reviewed both changed files against protected `main`. The production failure was reproduced from the VPS with Node fetch and curl: TPEx sometimes closed an otherwise successful JSON response body early, yielding `terminated`, `ECONNRESET`, or `UND_ERR_SOCKET`. The previous adapter performed one unbounded `response.text()` attempt, so one transient body truncation failed every claimed job for that endpoint.
- The repair retries only the transport read, at most three attempts, with bounded backoff. The second attempt requests identity encoding because production evidence showed compression-dependent resets; the third returns to the default negotiation. HTTP status, content type, JSON shape, official schema, per-symbol selection, immutable hash, provenance, and validation checks remain unchanged.
- Each attempt streams into a 15 MB cap and cancels before accepting an oversized response. A partial stream is never parsed or persisted. Exhaustion returns the explicit `tpex_transport_exhausted` error and preserves the existing fail-closed job behavior.
- The regression test injects a 200 response whose body terminates after partial JSON, proves that the partial bytes are rejected, then proves the complete retry is returned with the expected encoding transition and exact byte count.
- The focused financial test suite passed (`15/15`). ESLint completed with zero errors, the production Next.js build and TypeScript check passed, and `git diff --check` passed for the immutable subject.
- No database migration, destructive operation, token handling, source ranking, valuation rule, classification threshold, publication rule, or Threads state changes. No unresolved P0, P1, or P2 finding remains.

## Production boundary

This review authorizes the immutable Contabo release only after all protected checks pass and the PR is merged normally. After deployment, rerun the TPEx financial queue canary and retain failure status if all bounded transport attempts fail. Ruleset `20177392` remains enabled.
