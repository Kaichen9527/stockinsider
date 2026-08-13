# V3.15 completion-authority exact-commit review

Date: 2026-08-14
Reviewer: Codex Sol independent read-only review
Final verdict: `PASS`
Findings: `P0=0 P1=0 P2=0`

## Immutable subjects

- Reviewed base: `e74b672cf397b7f8ba11f86ff49b2633afb5b7dd`
- Exact implementation repair commit/tree: `1719653be79729475a68b31c77a61d2773d58408` / `8fb198d4bec4b3c64479e7c52aacad5a113e6702`
- Requirements evidence carrier/tree: `3a7b139c3302d6e232329fd367d49d9ac2619681` / `8fe0ee1a33f6bb146b1dbf89459ef70680c19348`
- Architecture/source commit/tree: `33b3e2fb8a70493868fd555de91f997a4ef7f4f1` / `66bdc9fc3fc85b20f0683b268fdc1e9819969cf1`
- Final reviewed source commit/tree: `33b3e2fb8a70493868fd555de91f997a4ef7f4f1` / `66bdc9fc3fc85b20f0683b268fdc1e9819969cf1`
- Full final range: `e74b672cf397b7f8ba11f86ff49b2633afb5b7dd..33b3e2fb8a70493868fd555de91f997a4ef7f4f1`
- PCR fulfillment: `pcr-fulfillment-record-v1.json`

## Review closure

1. The production rehearsal processed 3,388 source/candidate jobs and staged the
   immutable official chunks before completion exposed a separate REST authority
   boundary: claim restored the registry authority, completion did not.
2. The additive V3.15 repair introduces a private completion wrapper that accepts the
   claimed authority hash, verifies it is the exact authority hash registered for the
   live run, restores the transaction-local authority context, and only then delegates
   to the unchanged V3.14 completion implementation.
3. The REST adapter caches authority only from the authenticated claim response and
   supplies it to completion. Arbitrary hashes, stale run authority and missing claim
   authority fail closed. The longer statement timeout is scoped to this bounded
   completion RPC rather than all producer traffic.
4. The repair does not weaken immutable chunk hashes, lease/owner-token checks,
   registry conflict checks, source trust, valuation gates, ranking weights, decision
   actions or the no-quota policy. SQL text, payloads and credentials remain excluded
   from typed diagnostics.
5. Migration ownership and grants remain private: `service_role` receives execute on
   the exact wrapper while public and authenticated roles receive none. The migration
   remains additive and apply-twice safe.
6. Product correctness passes 95/95, the migration suite passes 53/53, focused V3.15
   tests pass 11/11, and `git diff --check` passes for the repair and full final range.
7. Fresh Requirements Round 153 and independent Architecture Round 34 both pass with
   `P0=0 P1=0 P2=0`. Canonical topology is implementation repair `1719653` →
   Requirements `3a7b139` → Architecture/reviewed source `33b3e2f`.

## Authority boundary

This PASS authorizes the coordinated additive migration, tracked producer and Web
release already approved by the repository owner. LINE, dispatch, automatic trading
and V3 Promotion remain disabled. Evaluation governance remains
`blocked/non_fabricated_elapsed_cohorts_unavailable` pending real cohorts.
