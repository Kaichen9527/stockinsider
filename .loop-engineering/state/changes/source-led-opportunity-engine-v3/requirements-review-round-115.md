# Fresh Requirements Gate Review — Round 115

Subject commit: `a358126211ba24ee57b451a87bd386a32047bce8`
Subject tree: `4d5c991c9a61cd66ecae240797009b2958631841`
Baseline commit: `d756ff2b9a2866adfc0eccb8d66787350292823b`
Baseline tree: `3bfbbbf16d0ab1dc7c5c5a218a987bac43d00ba7`
Reviewer: independent read-only `gpt-5.6-sol` / xhigh process
Verdict: `CHANGES_REQUIRED` (`P0=0`, `P1=5`, `P2=0`)

## P1 findings

1. Mixed `unchanged + deferred` source documents still fell through to the
   zero-document `no_new_items` terminal.
2. The new instrument, sector and calendar resolvers did not retain the normative
   registry-first family bound, per-stream `64/65`, and calendar `1024/1025`
   sentinels.
3. A future session marked `completed` could become effective before its `close_at`.
4. Candidate valuation could trust the caller's named sector when the cutoff-resolved
   instrument/taxonomy authority was missing, inactive, unknown or mismatched.
5. Official shares authority used raw `thousand_shares` values as individual shares
   and silently excluded differing equal-head ties instead of propagating
   `authority_conflict`.

## Required closure

- Close every positive-document deferred mixture as fail-closed `provider_failed`;
  reserve `no_new_items` for exactly zero documents and add an applied-RPC fixture.
- Reuse the canonical bounded authority guards, including registry/global bounds,
  literal `LIMIT 65` and `LIMIT 1025` sentinels, typed overflow/conflict failures and
  indexed access evidence.
- Separate cutoff-visible calendar selection from effective completion; a completed
  row is usable only at or after `close_at`, with before/equal/after fixtures.
- Bind candidate instrument and taxonomy exclusively to the cutoff-resolved SQL
  authority, require the authoritative sector to match the current observation, and
  fail closed for missing, inactive, unknown or mismatched membership.
- Normalize `share` and `thousand_shares` before equality and market-cap weighting;
  collapse normalized-equal ties and propagate normalized-different ties as
  `authority_conflict`.

## Confirmed closure and residual blockers

Round 114's exact unchanged/rejected, YouTube successful-empty, latest-recorded/equal-
head selection, unknown-peer exclusion, positive-share filtering and exact catalog
oracle repairs were confirmed. The findings above close the remaining combinations
and authority boundaries rather than reopening those exact cases.

Acceptance `1.45.1` remains 308 unique cases with the `260/28/20` track split; the
independently recomputed active graph remains
`55ee5844b27767a4f231fa1732224b79ce22cf3ec5f18fe8e19b82c959ebfb14`.
Non-fabricated elapsed cohorts remain unavailable. No production migration,
credential installation, runtime activation, deployment, LINE dispatch or promotion
was authorized or performed.
