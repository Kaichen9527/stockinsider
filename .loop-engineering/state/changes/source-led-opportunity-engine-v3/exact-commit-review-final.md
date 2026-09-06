# Exact commit review: complete authority pagination

Result: `PASS`

P0=0 P1=0 P2=0

## Scope reviewed

- Exact implementation range `fca204fc86577e4e45c68fe4018cc921396584bb..37c7366b2108d9746fefd0bc94181b9052c5aeaf` and reviewed tree `e298bf70c9257cf6f0bf7c8cc374e3c9fd39b9af`.
- PostgreSQL-bound pagination for the complete point-in-time common-stock authority and 1,320-session official calendar.
- Candidate research, market breadth, and GDELT symbol-roster callers that previously repeated the first PostgREST 1,000-row RPC page.
- Service-role-only grants, deterministic order, argument bounds, and caller terminal behavior.

## Findings

- No P0/P1/P2 findings remain. Offset and limit are now applied inside PostgreSQL, so PostgREST's RPC response ceiling cannot make callers silently reuse the first 1,000 rows.
- Both page functions validate cutoff, offset, and page size, use deterministic ordering, and deny execution to public, anon, and authenticated roles.
- The official-session reader can return all 1,320 sessions and the stock authority can traverse the complete current roster. Existing collectors still stop on a short page and retain their explicit maximum-row bounds.
- The changes do not weaken point-in-time cutoffs, source validity filters, valuation authority, lifecycle promotion, dossier evidence, publication ordering, or Shadow policy.

## Verification

- Protected product-correctness acceptance suite: 150/150 passed on this exact subject.
- Source policy and source ranking suite: 67/67 passed, including the new authority pagination contract.
- TypeScript, ESLint (zero errors; pre-existing warnings only), diff check, and production Next.js build: passed.
- Exact-diff review of SQL privileges, stable pagination, caller bounds, and failure propagation: passed.

## Evidence

- Final reviewed repair/tree: `37c7366b2108d9746fefd0bc94181b9052c5aeaf` / `e298bf70c9257cf6f0bf7c8cc374e3c9fd39b9af`
- Full final range: `fca204fc86577e4e45c68fe4018cc921396584bb..37c7366b2108d9746fefd0bc94181b9052c5aeaf`
- Active graph: `1c32b707a2e3d36e0ca01b4e78b9c20fa5bcef5eb34dce486063d9f694a2c9fc`
