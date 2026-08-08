# Fresh Architecture Gate Review — Round 10

Date: 2026-08-02
Reviewer model: Sol XHigh
Review mode: independent, read-only subject review
Result: `CHANGES_REQUIRED`
Findings: `P0=0 P1=3 P2=1`

## Immutable subject

- Requirements-evidence carrier commit:
  `cac130d1a5e35ccc74136c960a68501c6a652e43`
- Reviewed tree: `8e39d6e550c231c4e67d274486a6ff3b60e25097`
- Carrier parent: `bccd44d9d98743028c24387476c1e564f10493cb`
- Carrier parent tree: `e8bfd96b60a8bd878db4ca4762b7c69d7248fdde`
- Requirements implementation commit:
  `89f0be4fc8aff3c0eed531d21a6518eff158f84f`
- Requirements implementation tree:
  `7c8100f69c1fa1af569bfaa5afebc1f1742b6160`
- Active graph SHA-256:
  `97359bfabddb7a52b50c5da05f75a5f93a5a641f8f3d1d4ef20e1b84174232b7`

The evidence carrier contains the immutable fresh Requirements Round 99 PASS. It was
resolved into a new detached worktree and remained clean throughout this review. The
subject tree was not edited. The carrier-only diff contains the Round 99 report and
status/task/summary evidence; it does not alter the reviewed active graph.

## Step 0 — scope challenge

Scope is accepted as already approved: repair current disabled-V3 radar correctness,
prepare the future shadow V3 path, preserve point-in-time authority, and stop before
production mutation. No product feature was added to this review. Architecture PASS
requires every required factor and revision value to have a finite, token/cutoff-bound
path from stored authority through a worker result to its public projection.

## What already exists

- Round 9's monolithic parse blocker is closed. Acquire freezes paged selected-revision
  authority; source sync creates deterministic one-revision shards; claim releases one
  token/hash-bound raw revision; completion persists bounded typed outcomes; a compact
  conservation barrier feeds the next stage.
- Main V3 manifest preparation already builds `bias_reference`,
  `technical_history_reference` and `reported_pe_reference` in deterministic order.
- The factor, technical, valuation and revision contracts define point-in-time
  formulas, closed unavailable states, hard action precedence and public unions.
- The legacy projection table has bounded indexed reads, checksum/ETag authority and
  a 6,000-row retention ceiling. These should be extended, not replaced.

## Architecture findings

### P1-1 — the legacy producer becomes input-free after parse

`runtime-installation-contract.md` says the `candidate_funnel` claim receives a
database-computed at-most-60-candidate projection, but the exact
`legacy_producer_claim_v3_11` tuple contains only payload/predecessor plus source-sync
or one-revision authority members. The exhaustive candidate payload contains only
`candidateInputRoot`, and the later `facts_refresh`, `analysis_revision` and
`compact_radar_projection` payloads/results contain IDs or hashes, not the bounded
rows needed to compute them. The execution plane also says its sole V3-owner read
exception is the roster/source bridge, and the private helper catalog contains no
candidate, fact, technical, valuation, revision or projection read helper.

Therefore Terra cannot implement the promised candidate, financial/technical/
valuation, material-revision and compact-projection stages without inventing a
worker-readable query/view, rereading mutable current data, embedding undocumented
rows in a root-only payload, or bypassing the closed ten-function catalog. This is a
material unspecified interface and an interruption/idempotency gap.

Required repair: define one closed stage-input/read bundle for every post-parse legacy
stage, including exact tuple schema, source cutoff and manifest/root binding, row/byte
bounds, owner/grant boundary, token validation, retry identity, failure precedence and
atomic successor behavior. Candidate input must actually travel through that tuple.
Facts/technical/valuation authority and snapshot persistence/reuse must be explicit;
no live or mutable reread may be implementation convention. Add maximum-size and
interrupt/replay acceptance across each new boundary.

Affected owners: `runtime-installation-contract.md` v1.5,
`storage-schema-contract.md` v3.22, `postgres-type-contract.md` v3.18,
`product-correctness-runtime-amendment.md` v3.11.8 and PCR-006/007/011/012..022.

### P1-2 — the main V3 deep job cannot consume or persist the R14 decision plane

The pre-seal V3 plan constructs the three new R14 manifest kinds, but the closed
`deep_candidate_rows` read body is only
`[candidateRows,financialRows,factorRows,sectorRows,valuationVerificationRows,
sourceEvidenceRows]`. It does not name candidate-bound
`bias_reference`, `technical_history_reference` or `reported_pe_reference` rows.
Because workers have no second/open read, the deep worker cannot reproduce BIAS
history, technical geometry or official/model PE comparison from its claim.

The exact `deep_candidate_batch` output then omits `technicalDecision`, `factorAxes`,
`valuation.relativeMultiple` and material-revision metadata. `projection_rows` carries
only stored deep results, yet `OpportunityCardV3` requires all of those fields. A
standalone pure implementation could make PCR-025..031 unit fixtures green while the
durable V3 graph still could not create a conforming card.

Required repair: extend the closed deep read tuple with exact per-candidate R14
manifest-native rows and manifest identities; extend the deep output/normalized
snapshot storage with the complete typed technical/factor/relative-multiple/revision
lineage; and bind projection to those stored values. Preserve the <=5 MiB claim and
<=3 MiB staging limits with maximum fixtures. Add a claim -> deep completion ->
projection integration case that mutates every R14 manifest/hash and forbids live
fallback.

Affected owners: `job-graph-contract.md` v3.12,
`runtime-transaction-contract.md` v3.15, `storage-schema-contract.md` v3.22,
`postgres-type-contract.md` v3.18, `data-contract.md` v3.6 and PCR-025..031/MIG-004.

### P1-3 — R14 is not visible on the only product surface available while V3 is disabled

R14 and the factor amendment require every candidate card to expose four axes, BIAS
and official/model PE. The approved rollout keeps V3 disabled, so
`OpportunityEngineV3` is omitted and `/api/opportunity-v3` is a zero-query 404. The
current user-facing surface is therefore the separate legacy-correctness projection.
Its exact `LegacyResearchDecisionV311` contains fundamental, technical geometry,
valuation scenarios and revision metadata, but no `factorAxes`, moving-average
deviation/history/sector values or official/model PE comparison. The factor amendment
only assigns those additions to an available V3 projection.

Consequently the implementation could satisfy the disabled rollout and still never
show the newly requested BIAS and historical/industry PE information to an app user.
This conflicts with the product-level R14 obligation and leaves public compatibility,
payload size and UI/accessibility behavior unspecified.

Required repair: add the closed factor axes, BIAS and relative-multiple unions to the
legacy research-decision card (recommended), with additive-strip baseline equality,
route/window bounds, unavailable semantics, labels and UI/accessibility acceptance.
Narrowing R14 to future shadow V3 only would not satisfy the approved product intent.

Affected owners: `factor-correctness-amendment.md` v3.11.2,
`legacy-radar-correctness-contract.md` v3.11.1, `data-contract.md` v3.6,
the legacy baseline lock and PCR-021/022/024/025..030.

### P2-1 — active status points to nonexistent Round 9 evidence

`status.json` and `gate-summary.md` cite
`architecture-review-round-9.md`, but no reachable Git history contains that path.
The gate summary retains enough prose to understand the historical finding, so this
does not change the current architecture verdict, but the direct evidence pointer is
not auditable.

Required repair: replace the false path with an explicit historical-summary reference
or a verifiable immutable object reference. Do not synthesize a review report that was
never committed.

## Test coverage review

```text
legacy authority pages -> revision shard claim -> typed outcomes/root
        PCR-006/007/011: specified and bounded
                         |
                         v
                  candidate input       [GAP P1-1]
                         |
                         v
            facts/technical/valuation   [GAP P1-1]
                         |
                         v
              revision -> projection    [GAP P1-1]

V3 R14 manifests -> deep claim/read      [GAP P1-2]
                         |
                         v
                typed deep result        [GAP P1-2]
                         |
                         v
                 public projection       PCR-030 schema only;
                                          integration gap P1-2

disabled V3 -> legacy radar card          [GAP P1-3]
```

The 31 PCR boundaries remain truthful planned RED owners, not current Code Gate
evidence. Repair acceptance must add end-to-end durable graph coverage; pure
formula/serializer tests alone cannot close these architecture findings.

## Failure modes

| Path | Realistic failure | Current handling/test | User effect |
|---|---|---|---|
| legacy post-parse claim | root is present but rows are unavailable or later data is reread | no constructible typed boundary | silent stale/incorrect analysis or implementation-specific bypass |
| V3 deep claim | R14 manifests complete but are absent from the read body | no claim-to-card integration oracle | missing/invented BIAS or PE fields; false valuation/action confidence |
| disabled public radar | calculation exists only behind omitted V3 projection | legacy schema rejects/omits R14 values | user never sees the requested factors |
| maximum new read bundle | valid R14 inputs exceed claim/staging bound | bounds exist, but no end-to-end maximum fixture for the missing tuple | terminal bound violation or pressure to truncate |

## Performance review

No independent performance finding is added because the 5 MiB claim, 3 MiB staging,
20-deep-candidate, 6,000-projection and radar p95/body limits are already explicit.
The repairs must prove their new exact tuples fit those existing limits; raising a
limit or truncating valid rows is not an accepted fix.

## Implementation order and parallelization

| Step | Modules touched | Depends on |
|---|---|---|
| A. legacy stage read authority | Loop contracts, migration/schema, tracked runtime | — |
| B. main V3 R14 deep dataflow | Loop contracts, migration/schema, V3 worker/domain | — |
| C. legacy/V3 public factor surfaces | public types, projection serializers, UI | A and B contracts |
| D. evidence pointer repair | Loop status/evidence only | — |
| E. cross-path integration and performance | acceptance, migration, Playwright/performance | A, B and C |

Lane A and Lane B may be implemented in parallel after both contract shapes are
fixed. Lane D is independent. Lane C can build static UI/types after the contracts are
fixed but final wiring waits for A/B. Lane E runs after all paths converge. Migration,
PostgreSQL type and acceptance inventory files are shared conflict points; integrate
those changes sequentially.

## Implementation tasks

- [ ] **T1 (P1, human ~1d / CC ~2h)** — Define and test exact bounded legacy
  post-parse stage input/read authority.
- [ ] **T2 (P1, human ~1d / CC ~2h)** — Carry all R14 manifests through V3 deep
  claim, result storage and projection.
- [ ] **T3 (P1, human ~4h / CC ~45m)** — Expose factor axes, BIAS and reported/model
  PE on the disabled-V3 legacy radar surface with additive compatibility.
- [ ] **T4 (P2, human ~15m / CC ~5m)** — Replace the nonexistent Round 9 evidence
  path with truthful historical provenance.

## NOT in scope

- Implementing any repair in this review; the subject review is read-only.
- Applying a migration or changing a production database, runtime, scheduler, flag or
  environment variable.
- Activating V3 shadow, changing public ranking/dispatch, merging a PR or deploying.
- Treating planned RED PCR cases, successful legacy regressions or blocked elapsed
  cohorts as product/promotion evidence.
- Changing BIAS from shadow diagnostic/safety cap into a promoted score weight.

## Fresh checks

| Check | Result |
|---|---|
| Subject HEAD/tree/cleanliness, JSON, `git diff --check`, artifact scan | PASS |
| Protected-harness-shaped focused GOV-001/GOV-004 | PASS `2/2` |
| `npm run test:source-led-opportunity-v3` | PASS `53/53` |
| `npm run test:source-led-opportunity-v3:migration` | PASS `20/20` |
| `npm run test:model-runner-v3` | PASS, terminal TAP `15/15` |
| disabled v3.5 host-pinned doctor | PASS; no shadow/production authority |

These checks prove the immutable graph and historical implementation remain internally
healthy; they do not fill the missing architecture interfaces above.

## Gate decision

`CHANGES_REQUIRED P0=0 P1=3 P2=1`.

Requirements Round 99 remains valid evidence for the reviewed subject, but the repair
must form a new immutable active tree. Terra XHigh should repair T1..T4. Because the
active contracts and acceptance graph will change, Sol must then run a fresh
Requirements gate and, only after that PASS is incorporated, a fresh Architecture
gate. Implementation remains locked beyond the architecture-repair work. No PR,
merge, deployment, migration, runtime installation, scheduler, flag, database or
production state changed.
