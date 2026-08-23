# V3.19 independent Architecture review — release reconciliation

Date: 2026-08-23

Review authority: independent, read-only Architecture review following the
fresh V3.19 Requirements PASS. No runtime, database, Vercel or source operation
was performed as part of this review.

Result: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Total-order repair commit/tree: `a67bc72c0fb11cc97340216a88e55dbf8be7ea7c` /
  `e6e6726abbcc77b4bfd1403140f29812fff41e1a`
- Final repair-closure commit/tree: `f646093ea8194476ab692df2ac041a4f3b5cc090` /
  `f5f8827d14dc4e05e3a1d78602d426570aa9a76c`
- Full reviewed implementation range:
  `0fe9e359bbf518c01c2dda7b5e54fc00cdc5cafa..f646093ea8194476ab692df2ac041a4f3b5cc090`
- Active graph: `cfc135973718c924114f367953fac9e38cc48918df54832efa27205fc997622a`

## Architecture closure

The V3.19 architecture makes the producer a durable state machine instead of
making installation wait for producer completion. A runtime installer waits no
longer than two minutes for registration and first heartbeat. The runtime
activation journal preserves the old owner until the new owner is verifiably
installed; recovery after interruption is therefore a closed either-or outcome,
not the former `old_owners_disabled` half-state. Lease expiry, provider timeout
and interruption retain typed terminal evidence and cannot be represented as a
continuing run.

The source authority is a one-way, bounded pipeline:

`authorized acquisition → immutable document revision → frozen revision → claim/entity link → 60 candidates → 30 research → 20 dossiers → decision → compact projection`.

The V3.19 migration adds a source high-water cursor and retains predecessor
authorization/lease checks. The source-sync wrapper persists a bounded document
revision before it inserts a frozen input, advances the cursor only for rows
actually consumed by a successful terminal transaction, and may release a
same-run successor only from that newly frozen input. Thus retrying a cutoff
cannot silently refetch provider state or scan the historical corpus. The
migration records its cursor as the lexicographic `(recorded_at, revision_id)`
pair. This closes the timestamp-tie loss case while preserving no-replay
semantics. It wraps its named predecessor once, has explicit service
grants and owner-only RLS, and exposes no public write capability.

Acquisition, decision and Web boundaries remain separated. Raw member-only
InvestAnchors text and raw Telegram messages never cross acquisition. An
authorized structured claim carries bounded facts and a citation; metadata-only
or credential-unavailable sources finish with an explicit non-claim outcome.
Official datasets join only after a source nomination and cannot reverse this
authority direction. The active-master symbol/name context rule prevents a bare
year-like four-digit token from becoming a stock link.

`ResearchReadinessV319` controls only visibility and lane placement, while the
single Decision Envelope controls executable action. This prevents a shared
calendar, manifest, runtime or migration failure from converting an unknown
into `avoid`, or from emptying checksum-valid last-good cards. The compact
projection is revision/checksum cacheable; a small health overlay owns freshness
and action blockers. SSR renders the landing cards without JavaScript, and
detail uses the same `decisionRevisionId`, falling back safely to a
research-only snapshot when an authoritative decision is unavailable.

Disk capacity is a strictly observational safety boundary. It uses retained
artifact policy and free-space thresholds to fail the runtime closed before it
can generate unbounded evidence, but contains no broad cleanup behaviour. The
same bundle includes the worker, disk policy, readiness mapping and manifest
inputs, so a manifest/hash/consumer mismatch disables actions rather than
letting Web and producer announce different authority.

The dark/light semantic CTA tokens, tab semantics and keyboard navigation are
contained in the presentation layer and do not alter decision or data authority.
No password reset, credential change, LINE, dispatch, automated trading,
Promotion or public mutating endpoint is in the reviewed architecture.

## Executable evidence examined

- Product/runtime correctness: `133/133` PASS, including `PCR-001` through
  `PCR-031`; zero failed, skipped or todo.
- Migration contract/rehearsal suite: `62/62` PASS, including the additive
  V3.19 cursor/function postconditions.
- Source-led unit: `61/61` PASS; V1/V2 regression: `2/2` PASS.
- Browser V3 correctness: `9/9` PASS; performance: `5/5` PASS.
- Lint, typecheck, production build and immutable-range whitespace validation
  all PASS.

This Architecture PASS authorizes the exact implementation commit, exact-range
review and attestation sequence. Migration, runtime activation, Web deployment
and release closure remain separately gated. Evaluation governance remains
`blocked/non_fabricated_elapsed_cohorts_unavailable` and is not future-return
validation.
