# Fresh Requirements Gate Review — Round 110

Subject commit: `b0f7aecbb2e0f090757c48966247104aee078ce2`
Subject tree: `09ad284a99996eebbced12e4fb29b15e62d9cf31`
Baseline commit: `1b714a4303c2a97ebb913dced8d9d607a4ac8951`
Baseline tree: `463cdf53127a38553ecba80f31ad8cddb28ff6f1`
Reviewer: independent read-only `gpt-5.6-sol` / xhigh process
Verdict: `CHANGES_REQUIRED` (`P0=0`, `P1=4`, `P2=0`)

## P1 findings

The shared root cause is that V3.13 completion validated caller payloads for local
consistency without always binding them to the authoritative stream, projection or
public card they represented.

1. Source identity append, frozen authority and V3.13 provenance still contained
   status/source-key filters before contractual latest-event collapse. A later
   revocation, rename or equal-time conflict could revive or hide an older event.
2. Successful empty source polls had no truthful terminal. SQL trusted caller status
   and reason for zero-document profiles, did not bind the exact approved 17-profile
   roster, and did not prove item/document multiset and disposition conservation.
3. Compact persistence used `ON CONFLICT(projection_key) DO NOTHING`. An old key with
   different cutoff or bytes could therefore be discarded while the job and run
   succeeded and decision rows attached to the older projection.
4. Decision revisions were not one-to-one bound to persisted home cards. SQL hashed
   caller-supplied identity serialization, allowing alternate whitespace/key order to
   mint another ID for equivalent parsed material.

## Required closure

- Collapse and lock source/instrument/alias/taxonomy authority by contractual stream
  before terminal classification, with equal-time conflict failure.
- Add a truthful `no_new_items` terminal and database-derived roster/conservation
  classification.
- Recompute projection identity and permit only exact byte/metadata reuse.
- Bind the bounded ordered home-card set exactly to decision revisions and recompute
  canonical identity bytes in SQL.
- Add applied negative and rollback fixtures for every branch above.

## Prior-round disposition and evidence

Round 109 findings 1 and 6 were closed as stated. Findings 2, 3, 4 and 5 were closed
only narrowly; the four root gaps above remained. The reviewer read all 49 active
artifacts, all 39 owner mappings, the 308-case inventory, migrations, runtime and
changed tests. Typecheck, lint, JavaScript syntax and JSON parsing passed. The
read-only sandbox prevented six write-requiring product owners and PostgreSQL fixture
creation; those were recorded as environment blocks, not assertion failures.

Evaluation governance remains honestly
`blocked/non_fabricated_elapsed_cohorts_unavailable`. No production database,
connector, credential, runtime activation, deployment or repository write occurred.
