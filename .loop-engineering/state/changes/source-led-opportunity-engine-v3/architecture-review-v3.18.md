# V3.18 independent Architecture review — idle pooler transport containment closure

Date: 2026-08-23
Review authority: independent, read-only Architecture review following the
fresh V3.18 idle-pooler containment Requirements PASS.
Result: `PASS`
Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Protected implementation parent: `80994d9e54caf3787826dff314203e9eb72fd565`
- Final repair-closure commit/tree: `5ada36b969f4deeb359f420093ec4e6d387cf066` / `11cdf2582398afb86525f66f88e8631561c0b0b4`
- Full reviewed implementation range: `80994d9e54caf3787826dff314203e9eb72fd565..5ada36b969f4deeb359f420093ec4e6d387cf066`
- Active graph: `729370999da4668cc5d8291e0e160a44c2d1a14edaae9a871f95be9e0203ac6d`

## Architecture closure

The repair applies one containment policy at the shared `Pool` construction
boundary. PostgreSQL may emit an asynchronous error for an idle pooled client
whose transport was retired. The listener consumes that transport event so it
cannot terminate Node outside the durable worker's terminal-outcome boundary.
The existing 20-second client and server deadlines remain responsible for
bounded database operations below the 120-second lease.

The claim RPC remains a distinct, explicitly idempotent retry boundary. General
append, refresh and completion writes do not inherit retry behavior, because
replaying an operation after a lost reply could duplicate a committed mutation.
Thus the repair preserves the single-DAG, leased ownership and immutable-
predecessor recovery model; it makes a pooler retirement non-fatal while the
outer job remains the terminal authority.

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
  including the 31 PCR boundaries and the idle-client containment regression.
- Static code inspection confirms no general producer `Pool` construction can
  omit the asynchronous idle-client error listener or the paired 20-second
  query and statement deadlines.

No production migration, source write, password reset, credential rotation,
LINE, dispatch, automatic trading or Promotion occurred during this review.
This Architecture PASS authorizes the exact implementation/review evidence
sequence only; the protected Code Gate and all production operations remain
pending. Evaluation governance remains
`blocked/non_fabricated_elapsed_cohorts_unavailable` and is not represented as
future-return validation.
