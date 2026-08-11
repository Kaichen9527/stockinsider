# Fresh Requirements Gate Review — Round 109

Subject commit: `3e7cd3130e275d4bf0584ea184876c7ff4a2506c`
Subject tree: `f841b40ddeae24899e1f33e27d8c84947150d416`
Baseline commit: `1b714a4303c2a97ebb913dced8d9d607a4ac8951`
Baseline tree: `463cdf53127a38553ecba80f31ad8cddb28ff6f1`
Reviewer: independent read-only `gpt-5.6-sol` / xhigh process
Verdict: `CHANGES_REQUIRED` (`P0=0`, `P1=6`, `P2=0`)

## P1 findings

1. The V3.13 completion wrapper performs source, fact, price and decision writes after
   authoritative completion returns no row for a wrong, expired or replayed owner
   token. It checks `v_status` only after those writes instead of returning immediately.
2. The live compact-completion path inserts projections directly and bypasses the
   authoritative append RPC's advisory lock, monotonic `as_of` validation and
   same-transaction 1,500-row per-window retention.
3. Database claims omit the prior immutable facts and Decision Brief. The worker's
   unchanged path consequently reuses a payload with `decisionBrief:null`; SQL also
   accepts a syntactically valid decision revision ID without recomputing its exact
   disclosure-card preimage.
4. Latest-event supersession remains absent from source-authority and trading-session
   streams because queries filter active/completed status before selecting the latest
   cutoff-eligible event. Later revocations or cancellations can revive older events.
5. A profile whose database-resolved documents are all deferred can preserve the
   adapter's `fresh` status even though no authorized document was accepted.
6. Prior compact projections are selected without the authoritative
   `as_of DESC, created_at DESC, projection_id ASC` precedence or an equal-instant
   two-row checksum-conflict sentinel. A non-authoritative prior row can falsely reset
   `contentAsOf`.

## Round 108 disposition

- Findings 1, 2, 3, 4, 7 and 8 are closed as narrowly stated.
- Finding 5 remains open on the database-claimed unchanged path and lacks SQL ID
  preimage verification.
- Finding 6 is only partially closed: instrument and sector peers use latest-event
  classification, but source and trading-calendar authority do not.

## Evidence and gate disposition

The review covered eight commits and 44 files (+2,187/-400). The active graph contained
49 artifacts and 39 owners; acceptance inventory remained version `1.45.0` with 308
cases including DI-001 through DI-011. Subject, tree, baseline and merge-base identities
matched. Worktree, index and untracked state were clean before and after. Changed
JavaScript syntax and diff checks passed; no database, migration, build, Playwright,
network or production operation ran under the independent read-only constraint.

Requirements Gate is `FAIL / CHANGES_REQUIRED`. Architecture remains blocked until all
six P1 roots are repaired in a new immutable tree and a fresh independent review returns
`P0=0` and `P1=0`.
