# V3.15 production-activation repair exact-commit review

Date: 2026-08-14
Reviewer: Codex Sol independent read-only review
Final verdict: `PASS`
Findings: `P0=0 P1=0 P2=0`

## Immutable subjects

- Reviewed base: `e74b672cf397b7f8ba11f86ff49b2633afb5b7dd`
- Exact implementation commit/tree: `36f06640e68fda287beaeffd4a35eccb2700fb47` / `caf25c5dbb3c10e2d3ef3736781186124276013e`
- Final reviewed repair/tree: `36f06640e68fda287beaeffd4a35eccb2700fb47` / `caf25c5dbb3c10e2d3ef3736781186124276013e`
- Full final range: `e74b672cf397b7f8ba11f86ff49b2633afb5b7dd..36f06640e68fda287beaeffd4a35eccb2700fb47`
- Active graph: `734b013bdfd750bfdf87ceb731f9db5033d9d4c8614323e1a884d8b43cb7c717`
- PCR fulfillment: `pcr-fulfillment-record-v1.json`

## Review closure

1. Production rehearsal completed 3,388 source/candidate jobs and staged 27 official
   ingestion chunks before the first financial-fact application exceeded the database
   statement timeout. The failure was reproduced in a rollback-only chunk rehearsal.
2. Instrument authority now uses the existing exact canonical stream hash index and a
   bounded symbol index. It preserves the latest-cutoff conflict checks and removes the
   per-fact full-registry JSON/bytea scan.
3. A retried facts job receives its already-staged immutable official snapshot through
   the private authority-carrying claim. It cannot silently accept a conflicting live
   refetch, alter a staged chunk, or exceed the 12 MiB resume ceiling.
4. Typed diagnostics now preserve the real `stage_barrier` job kind under the same live
   run, job, owner-token and lease checks; SQL text, payloads and credentials remain absent.
5. The migration is additive and apply-twice safe. No public mutation, source trust tier,
   ranking weight, valuation threshold, decision action or buy quota changed.
6. Product correctness passes 95/95 and migration passes 53/53. The exact migration
   catalog proves the symbol index, hash lookup, bounded resolver and resume transport.
7. Canonical evidence topology: implementation `d735fcbc8cd1a4b8ae92c62827e3b44846fe39bd`
   → Requirements `580ba1c6c44f1b10f9a29929b9c58f1506a4eb4e`
   → Architecture/source `36f06640e68fda287beaeffd4a35eccb2700fb47`.

## Authority boundary

This PASS authorizes the coordinated additive migration, tracked producer and Web
release already approved by the repository owner. LINE, dispatch, automatic trading
and V3 Promotion remain disabled. Evaluation governance remains
`blocked/non_fabricated_elapsed_cohorts_unavailable` pending real cohorts.
