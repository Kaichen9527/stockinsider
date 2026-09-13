# Exact implementation review — TWSE VPS final-evidence recovery

Date: 2026-09-14

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `21e7eb316bfd854e0ad5e7426dab561cc5f1232e` / `05dc3dbeafffe763661b62f438b47233c833fe71`
- Full final range: `ef8c9b0d9f67a17cb8f1ad29af506ac72386139a..21e7eb316bfd854e0ad5e7426dab561cc5f1232e`
- Active graph: `c563d77e416fdc2284b7aba50ca2eb03fd5f4cbed44f4edb1c918c63db96e3a2`

## Scope reviewed

- TWSE institutional flow now uses the current `fund/T86` RWD route with `selectType=ALL`, which returned the requested official session from the Contabo production address. The narrower legacy selector was rejected by the exchange edge.
- TWSE margin evidence now uses the current `marginTrading/MI_MARGN` RWD route. The parser selects the securities table by an explicit stock-code header instead of accidentally consuming the leading market summary table.
- The bounded response ceiling is raised from 2 MB to 5 MB because the authoritative exchange-wide T86 response is currently about 2.1 MB. Streaming cancellation and the hard ceiling remain enforced.
- Both stock-code header spellings used by the official institutional and margin responses are accepted. A response without a recognized code field remains schema-invalid.
- The immutable provider contract advances from v7 to v8, so earlier terminal failures cannot be reused for the new URL/parser behavior.

## Security and correctness reasoning

- All provider URLs remain hard-coded HTTPS allowlist entries; no caller-controlled host, path, credential destination, redirect proxy, or HTML scraper was introduced.
- Official exchange data remains preferred. FinMind remains an explicitly labelled fallback and cannot be presented as official evidence.
- Multi-table selection is limited to institutional and margin datasets and requires one of the closed official code-header aliases. Other dataset parsing behavior is unchanged.
- The response remains memory-bounded and hash-audited. Invalid JSON, security HTML, wrong session dates, unavailable endpoints, and oversized bodies still fail closed.
- The v8 queue identity preserves prior v7 terminal attempts as audit history while forcing a fresh acquisition for the changed provider contract.
- The change does not alter classification thresholds, writer leases, database privileges, retention, token handling, or destructive cleanup behavior.

## Verification

- Taiwan provider and refresh-scope unit tests: 27 passed, 0 failed.
- Candidate research/runtime tests: 222 passed, 0 failed, 1 optional local-parser test skipped.
- Migration and contract tests: 43 passed, 0 failed.
- Source-led product correctness on the final commit: 154 passed, 0 failed.
- TypeScript passed; ESLint completed with 0 errors and 33 pre-existing warnings.
- Next.js production build passed and generated 89 routes.
- Live read-only probes confirmed the exact TWSE RWD routes return the requested session and expected table shapes from the Contabo production address.
- `git diff --check ef8c9b0d9f67a17cb8f1ad29af506ac72386139a..21e7eb316bfd854e0ad5e7426dab561cc5f1232e` passed.

This review covers the exact implementation commit. Production acquisition, research publication, and the seven-day Supabase rollback observation remain separately measured rollout gates.
