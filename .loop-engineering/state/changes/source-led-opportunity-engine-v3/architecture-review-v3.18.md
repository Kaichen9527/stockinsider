# V3.18 independent Architecture review — bounded pooler RPC repair closure

Date: 2026-08-23
Review authority: independent, read-only Architecture review following the
fresh V3.18 pooler-deadline Requirements PASS.
Result: `PASS`
Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Protected implementation parent: `25eb4ecb92fed0112500ddd6caaeef147ecc67c5`
- Final repair-closure commit/tree: `0e0b3a1cee6c3084a35197be60528d3f2fcd0cd8` / `b9b0a947ceab3b4fcd6e431c6e82d191b3fca19e`
- Full reviewed implementation range: `25eb4ecb92fed0112500ddd6caaeef147ecc67c5..0e0b3a1cee6c3084a35197be60528d3f2fcd0cd8`
- Active graph: `729370999da4668cc5d8291e0e160a44c2d1a14edaae9a871f95be9e0203ac6d`

## Architecture closure

The repair applies one bounded transport policy at the shared `Pool`
construction boundary. `query_timeout` closes a client-side wait and
`statement_timeout` closes an executing server statement, both at 20 seconds.
Their combined purpose is architectural rather than a throughput preference:
they guarantee a general producer RPC returns before the 120-second durable
lease expires, so the outer job handler can record a typed terminal outcome.

The claim RPC remains a distinct, explicitly idempotent retry boundary. General
append, refresh and completion writes do not inherit that retry behavior,
because replaying an operation after a lost reply could duplicate a committed
mutation. Thus the repair preserves the single-DAG, leased ownership and
immutable-predecessor recovery model; it merely makes the pooler boundary
observable and terminal.

The host pin is a protected-base bootstrap, while the release candidate contains
no alternate host oracle. The active catalog's V3.17 predecessor is present in
the frozen graph before its V3.18 extension. The release has one bounded,
source-led data flow: approved public acquisition
emits typed terminal outcomes; entity-linked source claims nominate candidates;
the candidate ledger retains complete last-good candidates through a bounded
twenty-session window; official facts, valuation and technical evidence enrich
only those candidates; the unique decision revision emits a compact projection
and the same revision's full dossier. There is no reverse path by which an
official full-market fetch, a seed list, paid InvestAnchors text or Telegram
content can nominate a card.

The detached Shadow process accepts no inherited execution path. It admits the
same literal allowlisted PATH that it constructs for each child and rejects any
other value before it opens a repository or executes a command. That is the
minimal boundary which makes project-local npm/Playwright PCRs executable
without converting ambient PATH into authority.

The cardinality and authority boundaries remain closed. The funnel retains at
most 60 candidates, has deterministic source-session accounting, and carries
typed retention/exit reasons. The compact payload excludes the full dossier;
the revision-card union deduplicates equal revisions and fails closed on a
window conflict. Web detail validation consumes only the same revision ID,
while a missing per-card authority renders research-only detail rather than
blanking the complete projection or manufacturing an action.

The V3.18 migration is additive: it wraps the existing leased claim function,
renames the predecessor only once, reuses the preceding terminal result, bounds
the stored ledger to 60, restores the original owner/grants, and revokes the
temporary schema-create capability. It contains no drop, truncate or data
rewrite. The worker bundle tracks the dossier code, so runtime hash, installer
and doctor cannot silently execute an ignored implementation. The projection
schema is accepted by both runtime and Web; action authority remains disabled
until matching reviewed migration, runtime, manifest, producer and Web release
identities are all proven later.

## Executable evidence examined

- Product correctness suite: `129/129` PASS with zero failed, skipped or todo,
  including the 31 PCR boundaries and the new bounded-pool regression.
- Static code inspection confirms no producer `Pool` construction can omit the
  paired 20-second query and statement deadlines.

No production migration, source write, password reset, credential rotation,
LINE, dispatch, automatic trading or Promotion occurred during this review.
This Architecture PASS authorizes the exact implementation/review evidence
sequence only; the protected Code Gate and all production operations remain
pending. Evaluation governance remains
`blocked/non_fabricated_elapsed_cohorts_unavailable` and is not represented as
future-return validation.
