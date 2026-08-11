# Fresh Requirements Gate Review — Round 116

Subject commit: `773bc1155902ba5f2af0bbec5b392b97d20131c8`
Subject tree: `7d63c15e18f129dce69d2b905e40e50e3d75f0e2`
Baseline commit: `a358126211ba24ee57b451a87bd386a32047bce8`
Baseline tree: `4d5c991c9a61cd66ecae240797009b2958631841`
Reviewer: independent read-only `gpt-5.6-sol` / xhigh process
Verdict: `CHANGES_REQUIRED` (`P0=0`, `P1=4`, `P2=0`)

## P1 findings

1. Symbol and trading-session consumers retained sequential-history scans, raw-history
   prefilters and silent 513-row truncation instead of one registry-first bounded
   enumeration with an explicit bound+1 failure.
2. Official exchange valuation append did not require the same-exchange cutoff-selected
   calendar authority to be completed with `close_at <= collected_at` before the write
   and audit.
3. Candidate/peer valuation remained bypassable through caller-supplied market values,
   an observation/instrument exchange mismatch and the compatibility
   `bundle.valuationInputs` override.
4. Equal-head reported-valuation or normalized-share conflicts either selected a UUID/
   source-ref winner or aborted the whole fact-plane query instead of producing the
   closed `authority_conflict` typed-unavailable valuation branches.

## Required closure

- Enumerate symbol and calendar identities once from bounded indexed registry/window
  sentinels, reject bound+1, and remove all raw-history prefilters and silent truncation.
- Bind every official PE/PB append to a cutoff-selected completed official session for
  the same exchange whose close has elapsed; reject an unavailable/conflicting calendar
  before both the observation and audit writes.
- Derive candidate and peer exchange/taxonomy exclusively from cutoff-resolved SQL
  authority, bind the observation exchange exactly, and reject any compatibility
  valuation override rather than merging it.
- Detect equal-head reported-valuation and shares disagreement before UUID/source-ref
  selection, retain the symbol row as typed `authority_conflict`, and carry that reason
  through current/history/sector valuation and `valuation_review` without aborting the
  complete candidate plane.

## Confirmed closure and residual blockers

Round 115's positive-document terminal precedence, per-stream authority bounds,
before/equal/after-close semantics, candidate taxonomy validation and raw share-unit
normalization are confirmed. Acceptance `1.45.1` remains 308 unique cases with the
`260/28/20` track split; the independently recomputed active graph for the subject is
`3efc2ac1e0b3ecad3eb82ebd57b5245a2027d6b0ea57f448b79e971b53dbc41f`.

The product/runtime trace and applied PostgreSQL suite are supporting evidence only and
cannot override these four contract findings. Non-fabricated elapsed cohorts remain
unavailable. No production migration, credential installation, runtime activation,
deployment, LINE dispatch or promotion was authorized or performed.
