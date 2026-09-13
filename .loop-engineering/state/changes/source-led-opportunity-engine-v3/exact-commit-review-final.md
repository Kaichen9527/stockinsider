# Exact implementation review — TWSE RWD parameter-order recovery

Date: 2026-09-14

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `2e66f189e344431500c99d6cdb09add47c0e15ad` / `67ded1c646fb4f5ce21a4d7db7070498a1bb7cc6`
- Full final range: `046e282a896534286cb4ef179e6a56f9fea44f27..2e66f189e344431500c99d6cdb09add47c0e15ad`
- Active graph: `c563d77e416fdc2284b7aba50ca2eb03fd5f4cbed44f4edb1c918c63db96e3a2`

## Scope reviewed

- The official TWSE institutional-flow and margin-short RWD requests now preserve the parameter order emitted by the exchange page: `date`, `selectType`, then `response`.
- The provider contract advances from v8 to v9 so failed v8 terminals cannot be silently reused for the repaired acquisition path.
- Contract tests bind both official URLs and the immutable v9 queue identity.

## Security and correctness reasoning

- A live dual-order canary from the Contabo production address demonstrated that the same allowlisted endpoint returns official JSON with the exchange order and a 307 security response when `response` is placed first.
- The change does not widen hostname, protocol, path, dataset, date, or selector authority; only query serialization order changes.
- Existing response-size limits, schema parsing, provenance, writer leases, terminal-result handling, and fail-closed research gates remain intact.
- No database rows, volumes, running containers, credentials, or unrelated application files are deleted or mutated by this repair.

## Verification

- Targeted provider and refresh tests: 27 passed, 0 failed.
- `npm run test:source-led-opportunity-v3:product-correctness`: 154 passed, 0 failed.
- TypeScript and ESLint passed.
- Next.js production build passed and generated 89 routes.
- `git diff --check 046e282a896534286cb4ef179e6a56f9fea44f27..2e66f189e344431500c99d6cdb09add47c0e15ad` passed.

This review covers the exact implementation commit. Provider reconciliation, research publication, external canary checks, and the seven-day Supabase read-only observation remain separately measured rollout gates.
