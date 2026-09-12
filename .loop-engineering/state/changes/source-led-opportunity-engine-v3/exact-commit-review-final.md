# Exact implementation review — isolated PostgreSQL restore TOC

Date: 2026-09-13

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `19f81c0d63c256f95068ed4aee24d12aaf4d790b` / `fb181667635677ce7014ce7d19fa611dc355444c`
- Full final range: `371a418f200d55d0402990c39b76ff5d036cdd14..19f81c0d63c256f95068ed4aee24d12aaf4d790b`
- Active graph: `c563d77e416fdc2284b7aba50ca2eb03fd5f4cbed44f4edb1c918c63db96e3a2`

## Review result

- Reviewed the complete two-file repair against the current protected `main`; the production change only relocates the reviewed one-time TOC path and adds its exact contract assertion.
- The TOC is now required under `/run/stockinsider-restore`, outside the private artifact hierarchy. This preserves the artifact root's existing `stockinsider`-only traversal boundary instead of granting the PostgreSQL identity broader access.
- The TOC remains release-bound by an exact 40-character commit path, root-owned, read-only to the postgres group at mode 0640, and rejected if it is a symlink or has unexpected ownership or mode.
- The restore remains stdin-only, stage-first, socket-only and fail-closed. It still refuses existing stage or production database names and does not activate PostgREST, switch Web traffic, or resume schedules.
- The live failed attempt stopped at TOC traversal before archive objects were restored or a production database was named. The disposable partial stage database is separately identified and removed before retry.
- The Contabo production restore contract passed, the exact product-correctness suite passed 151/151 on the immediately preceding unchanged active graph, and the production Web build passed.
- No migration, data model, credential, listener, source-ranking, valuation, research, classification or public-decision behavior changes. No secret, plaintext credential, row or connection string is committed or emitted.
- No unresolved P0, P1 or P2 finding remains.
