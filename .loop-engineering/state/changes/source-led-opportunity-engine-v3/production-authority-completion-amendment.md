# Production Authority Completion Amendment: source-led-opportunity-engine-v3

Version: `production-authority-completion-v3.11.1`

Date: 2026-08-08

This amendment owns the final authority-bootstrap, public health and material-refresh
gap discovered after the previously reviewed V3.11 Web/runtime deployment. It does
not weaken the Promotion Gate or authorize fabricated evaluation evidence.

## Reproducible RED baseline

Read-only production inspection found a compatible reviewed Web consumer and local
producer, but the current V3.11 authority plane was empty:

- `stock_instruments_v3=0`, `stock_aliases_v3=0`,
  `stock_sector_assignments_v3=0`;
- `source_identity_authorities_v3=0`, `source_document_revisions_v3=0`;
- the latest producer authority bundle therefore had four zero-row page families;
- the public Daily compact projection contained one legacy carry-forward card and
  zero `source_signal` discoveries;
- local runtime health passed, but no durable health observation was available to
  the Vercel consumer.

The existing Code Gate was accurate for the reviewed code, but could not prove that
production authority inputs had been bootstrapped. This is a product-readiness gap,
not permission to synthesize recommendations.

## Official roster and source authority bootstrap

The bootstrap consumes the official TWSE listed-company roster endpoint
`https://openapi.twse.com.tw/v1/opendata/t187ap03_L` and official TPEx listed-company
roster endpoint `https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O`. It retains
only exact four-digit common-company symbols, rejects duplicate symbols, requires at
least 1,700 combined instruments, and assigns deterministic stock identities.

The bootstrap may run only from a clean exact reviewed implementation commit with a
direct-child review attestation commit. It additionally requires an owner-only,
canonical, HMAC-signed authority envelope bound to both commits, the exact mutation
`production_authority_bootstrap`, a 15-minute maximum lifetime and a one-use nonce.
The database credential remains a keychain reference and is never serialized.

Bootstrap writes are append-only and idempotent. Principal bindings, instruments,
aliases, sectors and source identity authorities are created in one locked phase.
Legacy source documents are then appended in bounded 100-document transactions, so
the operation does not exhaust PostgreSQL relation locks; a failed batch rolls back
without deleting prior committed append-only batches and a new signed invocation can
resume safely. A non-committing rehearsal imports at most 20 documents and rolls the
entire transaction back. Required postconditions are at least 1,700 active
instruments, aliases and sectors, at least one active source identity, and more than
500 complete source revisions.

## Point-in-time material refresh

The ordinary schedule remains one Taiwan-time occurrence at 18:20 on the most recent
weekday. If append-only instrument, alias, sector, source-identity or complete source
revision authority is recorded after that cutoff, the resolver emits exactly one
`material-authority-refresh` occurrence. Its cutoff is the first whole second after
the greatest material `recorded_at`, only after that second has elapsed. The greatest
recorded timestamp participates in the occurrence identity, so repeated leases do
not manufacture duplicate runs.

All discovery authority reads now require source timestamps, approvals and
`recorded_at` values to be visible at the selected cutoff in addition to their
validity interval. Weekend bootstrap data is therefore neither backdated nor hidden
until Monday: it is selected by a truthful material refresh with its actual recorded
time.

## Durable runtime health

`legacy_runtime_health_observations_v3_11` is append-only, hash-bound, immutable and
service-role-readable. Runtime activation must write the locally verified observation
to the active release and durably publish the same canonical observation to the
database. Publication failure fails activation and invokes the existing rollback.

The authenticated health route reads the latest durable observation and independently
overlays the latest producer run identity/status, stuck-run count and compact
projection checksum/freshness. Consumer/producer compatibility requires the Vercel
commit and latest producer commit to be byte-identical.

## Verification and rollout

Before production mutation, the final tree requires fresh zero-P0/P1 Requirements
and Architecture review, full product/runtime and model-runner gates, exact-range
review, a direct-child evidence commit and the protected external Code Gate. Root and
Web production dependency audits must report zero known vulnerabilities.

After those gates, the reviewed migration is applied, the signed bootstrap is run,
the exact implementation is deployed to the existing Vercel project, and the same
commit is activated as the sole local producer. Read-only public verification covers
home, Daily/Hot/Weekly, authenticated health, compact payload bounds, parallel read
latency and exact disabled 404 behavior for `/api/opportunity-v3`. Any failure uses
the previously captured Vercel/runtime rollback targets.

The product may truthfully surface new candidates as `source_signal` when official
financial/valuation facts are unavailable. It must not invent a target price, EPS,
technical trigger or buy recommendation. V3 ranking/promotion remains blocked until
120 point-in-time backtest dates, 20 real elapsed live dates and the 252-attempt roster
pass evaluation governance.
