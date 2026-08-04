# Requirements Review — Round 51

Date: 2026-07-26
Immutable tree: `473317817aa6afe21e6d11d8b559934f2005f50a`
Base: `1fe429d3a91359cd2d6d07c89441ebb66d9ccc5d`
Verdict: `CHANGES_REQUIRED`
Counts: `P0=3 P1=2 P2=1`

This was a fresh read-only Sol xhigh review of only the named immutable Git tree, exported into an isolated directory. It did not read or modify the mutable worktree.

## Findings

1. `P0` — Claim canonical-prior selection depended on newest-first job completion and the immutable job result copied a staged outcome that could disagree with normalized PostgreSQL truth.
2. `P0` — Blinded assignment did not detect an adjudicator row owned by another principal, so `adjudication_completed` was unreachable and a later adjudicator could receive reviewer-pair values.
3. `P0` — Acceptance remained false-green for canonical claim truth and the complete blinded assignment state machine.
4. `P1` — Remote PostgREST `401/403` credential rejection mapped to internal `500` rather than `v3_service_role_unavailable/503`.
5. `P1` — A segment whose normalized claim text was empty and had no occurrence still emitted a claim.
6. `P2` — The task ledger mislabeled the active `143/117/6` execution classifications.

## Independent execution evidence

- Product/runtime passed: typecheck, lint, product/trace `171/171`, fresh PostgreSQL `15/15`, and production build.
- Model runner passed `14/14`.
- Evaluation acceptance `21/21` and focused product `12/12` passed, then the track honestly blocked with `non_fabricated_elapsed_cohorts_unavailable`.
- Host-pin v3.4 and installed Codex `0.146.0-alpha.3.1` identity, signing and notarization checks passed.

## Repair incorporated after this immutable tree

- The newest at-most-1,000 eligible revisions remain the selected population, but `source_dataset` now assigns parse ordinals by source, ascending effective time, canonical document ID and original eligible ordinal. Predecessor-only enqueue makes canonical earlier claims durable first.
- Source-parse commit atomically normalizes cross-document claim and mention truth back into byte-equal staging and immutable result envelopes/hashes.
- Blinded assignment now detects any terminal adjudicator row, returns `adjudication_completed` to another principal with every label field null, and has applied coverage for all eight dispositions.
- Remote `401/403` maps to the exact `503` service-role-unavailable response.
- Empty-normalized/no-occurrence segments are discarded before claim count and ordinal assignment.
- Case-specific product and applied PostgreSQL regressions now pass at product/trace `173/173` and migration `16/16`; the task classification prose matches the executable registry.

Architecture remains locked. These repairs require a new immutable tree and a brand-new Requirements review.
