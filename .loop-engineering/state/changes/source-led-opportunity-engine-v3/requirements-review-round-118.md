# Fresh Requirements Gate Review — Round 118

Subject commit: `2314ee9f579645f1d579d8738e0115e6864a7afb`
Subject tree: `aaee71c8aeef1a713b4f4e0f86055b41cc11af06`
Baseline commit: `93db3334e23b5a00dbd163b6adc977d7ec4e36be`
Baseline tree: `6010aa36e8a66ba40e8ba26a63a1205edc9fc6a6`
Reviewer: independent read-only `gpt-5.6-sol` / xhigh process
Verdict: `CHANGES_REQUIRED` (`P0=0`, `P1=3`, `P2=0`)

## P1 findings

1. The fact-plane calendar path truncated raw session identities to 512 before
   deriving the interval passed to the 513/512 resolver. The excluded 513th member
   could therefore never trip the sentinel.
2. Runtime peer selection matched sector and session but not the candidate's
   authority-derived exchange. A TPEx row could enter a TWSE formal peer set.
3. Runtime equal-key merging did not include normalized `sharesOutstanding` in its
   conflict comparison. Two different share counts selected the first input value,
   so reversing input order changed the valuation input without a conflict terminal.

## Required closure

- Name one explicit civil-date window before enumerating its raw session identities;
  invoke the 513/512 resolver over that complete interval without pre-truncation.
- Require every peer to match the candidate observation's exchange in addition to
  the same session and canonical sector.
- Include normalized shares in order-independent semantic conflict comparison and
  add direct regressions for both input permutations, not only for a pre-marked
  conflict row.

The prior repair's 1,261 session-identity enumeration, equal-head SQL aggregation,
winner-free lineage, canonical SQL row and closed public conflict union were accepted.
The worktree was clean, immutable identities matched, and the exact 13-file diff
passed `git diff --check`. Evaluation governance remains honestly
`blocked/non_fabricated_elapsed_cohorts_unavailable`. No production action occurred.
