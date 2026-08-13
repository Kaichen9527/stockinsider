# V3.15 completion-authority exact-commit review

Date: 2026-08-14
Reviewer: Codex Sol independent read-only review
Final verdict: `PASS`
Findings: `P0=0 P1=0 P2=0`

## Immutable subjects

- Reviewed base: `e74b672cf397b7f8ba11f86ff49b2633afb5b7dd`
- Exact implementation repair commit/tree: `ba47a63d8b473f6f39a48f673eeccb977bb15560` / `afb4311a4671f6b8f91a16a8df3d13f2d06c0251`
- Requirements evidence carrier/tree: `d023561700a32d8b1252ff0167213f6dae5b09a2` / `9811364f37a983f0c65d8cabbb36936e92e30b21`
- Architecture/source commit/tree: `6b4bddc4aa68902453ed6fccbcec49ba4c164032` / `7a7f648f9c537b5c7ca2d6e5977245b46938ffe3`
- Final reviewed repair/tree: `6b4bddc4aa68902453ed6fccbcec49ba4c164032` / `7a7f648f9c537b5c7ca2d6e5977245b46938ffe3`
- Full final range: `e74b672cf397b7f8ba11f86ff49b2633afb5b7dd..6b4bddc4aa68902453ed6fccbcec49ba4c164032`
- Active graph: `734b013bdfd750bfdf87ceb731f9db5033d9d4c8614323e1a884d8b43cb7c717`
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
   `P0=0 P1=0 P2=0`. The final evidence topology is implementation `ba47a63` →
   Requirements `d023561` → Architecture/source `6b4bddc` → this direct exact child.

## Authority boundary

This PASS authorizes the coordinated additive migration, tracked producer and Web
release already approved by the repository owner. LINE, dispatch, automatic trading
and V3 Promotion remain disabled. Evaluation governance remains
`blocked/non_fabricated_elapsed_cohorts_unavailable` pending real cohorts.
