# Exact implementation review — recover TPEx official payloads by verified ranges

Date: 2026-09-13

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `08d26fcec8cf8c5ac7648f230b0fdf82666f0f72` / `5bd5ed9314cd71586b08baf041d3c5668fd39957`
- Full final range: `071348cc9d1150c410ff259363ac3eb2ed6443c1..08d26fcec8cf8c5ac7648f230b0fdf82666f0f72`
- Active graph: `c563d77e416fdc2284b7aba50ca2eb03fd5f4cbed44f4edb1c918c63db96e3a2`

## Review result

- Reviewed both changed files against protected `main` and reproduced the production failure from Contabo. The official TPEx edge advertises a 1,180,687-byte response but resets ordinary long transfers around 56 KiB. The same official HTTPS URL reliably serves exact HTTP 206 byte ranges.
- Ordinary bounded fetches remain the first path. Only after all three attempts fail does the adapter request sequential 48 KiB ranges from the identical official endpoint, below the observed reset boundary.
- Every segment must return HTTP 206, an exact `Content-Range` start/end/total, a bounded body of the advertised length and a stable total. Contradictory ranges, gaps, truncation, oversized payloads, invalid UTF-8 and transport errors fail closed; partial JSON is never parsed or stored.
- A server that ignores the first range and returns a complete HTTP 200 response remains supported through the existing 15 MB bound. Redirects stay disabled, the official URL is unchanged and no proxy, mirror or unofficial data source is introduced.
- The live adapter reconstructed exactly 1,180,687 bytes and parsed 883 official rows. Twenty-one acquisition and parsing tests passed, including edge reset recovery and contradictory range rejection. TypeScript, ESLint with zero errors, the production Next.js build and `git diff --check` passed.
- The patch changes only official TPEx transport recovery. It does not relax provenance, validation, valuation, stage promotion, source ranking, writer identity, token storage or Threads behavior. No unresolved P0, P1 or P2 finding remains.

## Production boundary

This review authorizes deployment only after all protected checks pass and the PR is merged normally. The production queue must still fail on any incomplete range contract, parser/schema failure, current provenance gap or database/authentication error. Ruleset `20177392` remains enabled.
