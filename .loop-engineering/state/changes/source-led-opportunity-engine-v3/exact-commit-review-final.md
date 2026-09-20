# Exact commit review: AUO source-backed deep research preview

Result: `PASS`

P0=0 P1=0 P2=0

## Scope reviewed

- Exact implementation range `3852578bd0b0dcbd564836792926a46d757423cf..f72aab83fd2ae1578de12e385fadd8a4135a9d91` and reviewed tree `9f4200879d366a2aa4444d109796078b11df5bfe`.
- Versioned AUO research data, forecast/equity bridge, technical-entry calculations, long-form preview components, and deployment packaging.
- Official-source acquisition and point-in-time controls in candidate research, TWSE valuation parsing, canary policy, final-session resume, and systemd time budget.

## Findings

- No P0/P1/P2 findings remain. The preview derives its valuation from an explicit five-quarter common-equity bridge and a 60-month TWSE ledger that binds each month-end close and P/B to the fiscal book-value period available on that date.
- The formal AUO path counts only validated point-in-time P/B observations, requires at least 48 distinct months, and fails closed for insufficient, future, duplicate, conflicting, or untraceable evidence.
- Historical-session resume selects a settled but unresearched session, passes its immutable cutoff through the pipeline, and cannot silently substitute a newer market session. Successful full-pipeline receipts remain the only completion authority.
- Technical entry levels remain calculated from the latest complete official session and are disabled when stale. Medium-term valuation and short-term price conditions stay separate.
- The read-only AUO preview does not change the active OpenSpec authority graph and introduces no database write or production schema change.

## Verification

- Candidate research runtime suite: 235 passed, 1 expected skip, 0 failed.
- Financial evidence completion suite: 96 passed after updating the resume contract assertion.
- Focused AUO and point-in-time P/B tests: 13 passed.
- TypeScript, ESLint, and Next.js production build: passed.
- `npm run test:source-led-opportunity-v3:product-correctness`: 154/154 passed with no failed, skipped, or TODO tests.

## Evidence

- Final reviewed repair/tree: `f72aab83fd2ae1578de12e385fadd8a4135a9d91` / `9f4200879d366a2aa4444d109796078b11df5bfe`
- Full final range: `3852578bd0b0dcbd564836792926a46d757423cf..f72aab83fd2ae1578de12e385fadd8a4135a9d91`
- Active graph: `c563d77e416fdc2284b7aba50ca2eb03fd5f4cbed44f4edb1c918c63db96e3a2`
