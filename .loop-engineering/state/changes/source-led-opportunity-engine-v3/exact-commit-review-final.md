# V3.15 authority-cache exact-commit review

Date: 2026-08-14
Reviewer: Codex Sol independent read-only review
Final verdict: `PASS`
Findings: `P0=0 P1=0 P2=0`

## Immutable subjects

- Reviewed base: `e74b672cf397b7f8ba11f86ff49b2633afb5b7dd`
- Exact implementation repair commit/tree: `70db2f425c55581b21427fa58942625209a94dc3` / `cdb3315cd55d2daece75154eb87f4225ab7ac3fd`
- Requirements evidence carrier/tree: `a6ac12401841cc32032dd7b8ab008971af5f5780` / `ae1032d6d8e9529d38885bc4853b56fd8707d63b`
- Architecture/source commit/tree: `2e2c835d4c678e48cddd0429abdc7358e2b0e2f2` / `6222513619c685f0557bec6f532d993375cfaae5`
- Final reviewed repair/tree: `2e2c835d4c678e48cddd0429abdc7358e2b0e2f2` / `6222513619c685f0557bec6f532d993375cfaae5`
- Full final range: `e74b672cf397b7f8ba11f86ff49b2633afb5b7dd..2e2c835d4c678e48cddd0429abdc7358e2b0e2f2`
- Active graph: `734b013bdfd750bfdf87ceb731f9db5033d9d4c8614323e1a884d8b43cb7c717`
- PCR fulfillment: `pcr-fulfillment-record-v1.json`

## Review closure

1. The first reviewed production run terminated after source sync and before any
   mention result or projection publication. Typed evidence identified a missing
   frozen-authority page cache, not an authentication or market-data failure.
2. The regression came from conflating two capabilities. A claim's run-bound
   `authorityHash` is sufficient for the private completion wrapper, but it does not
   prove that the worker process has materialized the corresponding authority pages.
3. The adapter now stores `completionAuthorityHash` from an authoritative claim and
   stores `cachedAuthorityPagesHash` only after the claim delivers a non-empty page set
   whose embedded hash is valid. Later claim calls send only the latter.
4. A production-shaped three-claim test proves the exact sequence: identity-only claim
   sends no page-cache assertion, completion receives the run identity, a page-bearing
   claim establishes the cache, and only the following claim elides pages.
5. Both caches are private to one adapter instance. Process restart requests pages
   again, while DB run/hash, lease, immutable chunk and result-hash checks remain
   authoritative. No source trust, valuation, ranking or decision threshold changed.
6. Product correctness passes 95/95, migration passes 53/53, focused regression passes
   1/1, and `git diff --check` passes for the repair and full final range.
7. Fresh Requirements Round 154 and independent Architecture Round 35 both pass with
   `P0=0 P1=0 P2=0`. Topology is implementation `70db2f4` → Requirements `a6ac124`
   → Architecture/source `2e2c835` → this direct exact child.

## Authority boundary

This PASS authorizes the coordinated tracked producer and Web release already approved
by the repository owner. LINE, dispatch, automatic trading and V3 Promotion remain
disabled. Evaluation governance remains
`blocked/non_fabricated_elapsed_cohorts_unavailable` pending real cohorts.
