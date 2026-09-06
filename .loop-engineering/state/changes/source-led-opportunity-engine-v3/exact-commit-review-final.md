# Exact commit review: candidate detail fact batching

Result: `PASS`

P0=0 P1=0 P2=0

## Scope reviewed

- Exact implementation range `f4b54fa3e828d191df8910e4eaab7b2ed93df2e2..ef242e5ad690c9072a75a7840cd6fba7ca46a52e` and reviewed tree `55ca2597e4ed9c149bef52a6b0daaebf7f0f1d2b`.
- Candidate-detail evidence reads for revisions containing more fact IDs than can safely fit in one PostgREST `.in()` URL.
- Deterministic fact-ID de-duplication, bounded batching, aggregate error handling, and exact-revision preservation.

## Findings

- No P0/P1/P2 findings remain. Fact IDs are de-duplicated without changing first-seen order and queried in bounded batches of 40 (hard maximum 50), preventing the oversized request that made the live 2330 detail endpoint return HTTP 500.
- All batches preserve the same exact detail revision and evidence authority; this is a transport repair, not a widening of facts or authorization.
- A failure in any batch remains fail-closed with the existing `candidate_detail_evidence_read_failed` terminal reason. Partial evidence is never silently published as a complete revision.
- The changes do not weaken point-in-time cutoffs, valuation authority, lifecycle promotion, publication ordering, or Shadow policy.

## Verification

- Protected product-correctness acceptance suite: 150/150 passed on this exact subject.
- Source policy and source ranking suite: 69/69 passed, including candidate-detail batching coverage.
- TypeScript, ESLint (zero errors; pre-existing warnings only), diff check, and production Next.js build: passed.
- Exact-diff review of batch bounds, revision identity, aggregation, and failure propagation: passed.

## Evidence

- Final reviewed repair/tree: `ef242e5ad690c9072a75a7840cd6fba7ca46a52e` / `55ca2597e4ed9c149bef52a6b0daaebf7f0f1d2b`
- Full final range: `f4b54fa3e828d191df8910e4eaab7b2ed93df2e2..ef242e5ad690c9072a75a7840cd6fba7ca46a52e`
- Active graph: `1c32b707a2e3d36e0ca01b4e78b9c20fa5bcef5eb34dce486063d9f694a2c9fc`
