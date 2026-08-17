# V3.16.21 production-cardinality final exact review

Date: 2026-08-17
Reviewer: independent Sol exact-range SQL, runtime, security, evidence, and product review
Final verdict: `PASS`
Findings after repair: `P0=0 P1=0 P2=0`

## Immutable subject

- Reviewed base: `cde4915db22f279a891b478540a2ebdab54876fb`
- Initial cardinality implementation: `05cd33bf405c13f9fe30c6ad7f40b4dc15f54337`
- Final implementation repair: `3ff3af557ff84b43c71f91a73747f2627bdb2fc6`
- Final reviewed repair/tree: `3ff3af557ff84b43c71f91a73747f2627bdb2fc6` / `ad32d757575432bfa07679a5a2ec9bf146e265be`
- Full final range: `cde4915db22f279a891b478540a2ebdab54876fb..3ff3af557ff84b43c71f91a73747f2627bdb2fc6`
- Repair range: `05cd33bf405c13f9fe30c6ad7f40b4dc15f54337..3ff3af557ff84b43c71f91a73747f2627bdb2fc6`
- Active graph: `b07516d0b650da847d8e0cba59edf2c25672e88443582a0e696e093a13e80525`

## Production RED evidence and repair

Forensic production run `68691805-c80c-39df-26e5-ae9715d80318` truthfully
froze the provider payload and kept its lease healthy, but every reported
valuation row invoked the public symbol resolver. With 22,448 rows and
1,123 pooler-safe chunks, that repeated a roughly 1,979-stream integrity scan
twenty times per chunk and could not terminate inside the four-hour installer
window. The activation was stopped and the installer restored runtime
`184390953048209730c22828548858c28fa3b6b7`; Web and action authority were
not changed.

The repair keeps the twenty-row bound. A symbol-bearing chunk must have exactly
one immutable acquisition timestamp, validates the complete roster once at that
timestamp, and uses the existing indexed private resolver per row. A mixed
timestamp, unknown predecessor SQL body, unresolved symbol, competing authority
head or grant drift fails closed.

## Exact diff review

- SQL lifecycle: PASS. The additive migration is transactional, refuses an
  unknown predecessor, is present in the reviewed chain and applies twice.
- Authority: PASS. Global roster validation is amortized once per immutable
  chunk, not removed. Each row still performs bounded indexed identity checks.
- Point-in-time provenance: PASS. The chunk timestamp is the truthful frozen
  `collectedAt`; no cutoff or `fetchedAt` is backdated.
- Privileges: PASS. The rewritten helper remains private, owned by
  `opportunity_v3_rpc_owner`, with no PUBLIC, anon, authenticated or direct
  service-role execute grant.
- Pooler, lease, retry and idempotency: PASS. Chunk sizes, staging ledgers,
  heartbeat renewal and conflict behavior are unchanged.
- Public product surface: CLEAN. No valuation formula, action rule, public route,
  component, LINE, dispatch, automatic-trading or Promotion behavior changed.
- Secrets: CLEAN. The range contains no credentials, connection strings,
  provider payloads or dependency artifacts.

## Requirements and Architecture carriers

The protected external gate initially rejected the cardinality evidence because
its three base-owned review refs still described the predecessor active graph.
That was a control-plane binding error, not a product finding. The single fresh
Requirements carrier is a direct child of the reviewed cardinality implementation
and records PASS with P0/P1/P2 zero. The independent Architecture carrier is its
direct child and records the same closed graph. These two historical review files
are excluded from the active graph, so the canonical digest remains unchanged.
No additional Requirements or Architecture round was opened.

## Verification

- Focused V3.16.21 tests: `7/7` PASS.
- Product correctness and 31 PCR boundaries: `116/116` PASS; stdout SHA-256
  `533eb2a602e5850f5c82f4235bda4e410f83ee6d380da24ef4e22fc44b3f6f8b`.
- Fresh PostgreSQL migration/lifecycle: `60/60` PASS.
- V3 Playwright: `8/8` PASS; readonly visibility: `2/2` PASS.
- Model-runner partition: `28/28` PASS.
- Repair-range review: PASS, `P0=0 P1=0 P2=0`.
- Full-range closure review: PASS, `P0=0 P1=0 P2=0`.

Evaluation governance remains
`blocked/non_fabricated_elapsed_cohorts_unavailable` until the real 120-date,
20-live-date and 252-attempt cohorts mature. This exact review does not claim
future returns are proven and does not authorize Promotion.
