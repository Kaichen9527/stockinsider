# Fresh Requirements Gate Review — Round 112

Subject commit: `914d07957581369def5c46909d806f2139f9b521`
Subject tree: `f530cedb78e03efad845c90bbb41b62f83d73172`
Baseline commit: `1b714a4303c2a97ebb913dced8d9d607a4ac8951`
Baseline tree: `463cdf53127a38553ecba80f31ad8cddb28ff6f1`
Reviewer: independent read-only `gpt-5.6-sol` / xhigh process
Verdict: `CHANGES_REQUIRED` (`P0=0`, `P1=2`, `P2=0`)

## P1 findings

1. The eight persistent V3.13 source-plane relations added for frozen authority,
   connector-attempt truth and conservation were not fully specified in the normative
   storage/type contracts or owned by the canonical DI-006/MIG-004 acceptance oracle.
   An implementation and its local test could therefore drift together without a
   contract-level failure.
2. A present but malformed, uppercase, truncated or duplicated `decisionRevisionId`
   was normalized to absence. It could fall through to the legacy detail path and, with
   `refresh=1`, trigger a research refresh instead of returning typed unavailable.

## Required closure

- Specify every new source relation's exact columns, bounds, keys, foreign keys,
  lifecycle, immutability, RLS, ownership and grants in the active contracts; advance
  the canonical acceptance artifact and make mutation coverage explicit in DI-006 and
  MIG-004.
- Treat revision parameter absence separately from malformed or ambiguous presence.
  Any present invalid or duplicate value must return typed unavailable before fixture,
  refresh, legacy deep-dive or recent-projection reads.
- Add canonical catalog mutations and Web regressions for all branches above.

## Prior-round disposition and evidence

Both Round 111 implementation roots are closed. Source authority is frozen at the
run cutoff with database-owned append context, and exactly 51 typed connector attempts
are conserved with SQL-derived profile terminals. Post-cutoff authority mutations,
missing/duplicate/tampered attempts and all four empty-terminal classes have applied
rollback fixtures.

The reviewer verified the exact clean tree, read all 49 active artifacts and 308
acceptance owners, and ran changed-JavaScript syntax, active JSON/catalog integrity and
TypeScript no-emit checks. Evaluation governance remains honestly
`blocked/non_fabricated_elapsed_cohorts_unavailable`; that is a Promotion Gate evidence
blocker, not one of these Code Gate findings. No production write, connector call,
runtime activation or deployment occurred.
