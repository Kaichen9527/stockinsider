# Fresh Requirements Gate Review — Round 111

Subject commit: `179a430586a4dc181c3c2eba1ee35d045d5ddb9d`
Subject tree: `e8cc41744dc43bc0d2ad88b0d3027ded11a647f4`
Baseline commit: `1b714a4303c2a97ebb913dced8d9d607a4ac8951`
Baseline tree: `463cdf53127a38553ecba80f31ad8cddb28ff6f1`
Reviewer: independent read-only `gpt-5.6-sol` / xhigh process
Verdict: `CHANGES_REQUIRED` (`P0=0`, `P1=2`, `P2=0`)

## P1 findings

1. Source acquisition completion read the current authority clock rather than the
   authority frozen at the run's `source_cutoff`. A post-cutoff grant, revocation or
   rename could therefore change the same occurrence on completion or retry. The
   append RPC also revalidated the authority against current time instead of a
   database-owned run binding.
2. Successful-empty acquisition remained a caller assertion. Two otherwise identical
   empty payloads could select `no_new_items` or `auth_failed`, because the database
   received no connector response evidence that distinguished a successful 2xx empty
   response from missing configuration, authentication rejection or provider failure.

## Required closure

- Persist the exact cutoff-visible source authority set when the run is created and
  bind append validation to that immutable database-owned context. Later authority
  events must not affect the run; equal-cutoff conflicts must fail atomically.
- Persist and conserve one typed connector attempt for every approved profile and each
  of Threads, Podcast and YouTube. Store bounded response evidence and derive aggregate
  profile status and reason in SQL; reject caller-supplied aggregate status/reason.
- Add applied rollback fixtures for post-cutoff grant/revoke/rename, missing or
  duplicate attempts, tampered terminal evidence and the four empty-terminal classes.

## Prior-round disposition

Round 110 roots 3 and 4 are closed by exact projection collision comparison and
one-to-one canonical home-card/decision-revision binding. Round 110 roots 1 and 2 remain
open through the two findings above.

Evaluation governance remains honestly
`blocked/non_fabricated_elapsed_cohorts_unavailable`. It is not a Code Gate P1 and no
production database, connector, credential, runtime activation or deployment action
occurred during this review.
