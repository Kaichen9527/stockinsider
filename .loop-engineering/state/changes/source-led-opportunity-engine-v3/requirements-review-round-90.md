# StockInsider V3.11.1 — Requirements Gate Round 90

## Result

`CHANGES_REQUIRED` — `P0=0 P1=5 P2=0`

This was an independent fresh Requirements review of immutable repair subject commit
`6f192ef26d151b652e9dc17f7d16e5ee069518b9`, tree
`ead151e59963c1412d368053936c6bee9dc1e8f8`. The Round 89 repair document was treated
as a claim to verify, not as authority. Read-only review used a clean detached worktree;
forged-envelope probes were confined to a separate disposable worktree and never changed
the subject. Architecture Round 10 and implementation remain locked.

## Findings

### P1-1 — The protected external trust root is still a declaration, not a verifiable authority

`external-gate-harness-contract.md:5-18` names a reviewer-owned protected check and
lines 38-56 require a registry-owned harness release, artifacts and aggregate. The
reviewed subject contains no protected workflow/App configuration, immutable release
allowlist, check-run identity, registry lookup record or accepted external artifact that
can establish that this authority exists and is outside PR control. The checked-in
workflow at `.github/workflows/source-led-opportunity-v3.yml:36-99` contains only a PR
diagnostic, nonblocking evaluation diagnostic, manually dispatched model job and the
product-only PR result check. It does not acquire or bind an external envelope.

This is specifically the independent verification required by
`requirements-round-89-repair.md:30-32`; contract prose cannot prove its own external
trust root. Repair must provide a durable, independently retrievable protected-runner
registration/release identity and an exact artifact/check handoff that the candidate
cannot create or replace. Missing registry proof must remain fail-closed.

### P1-2 — The canonical compatibility validator accepts forged review and model evidence

`gate-evidence.mjs:61-75` validates review objects by shape and regex only. It does not
resolve the evidence commit/tree/range, verify the direct-child/evidence-only diff,
compare evidence-file bytes, or reproduce the reviewed active graph. Lines 77-133 do
not enforce the check-specific partition, acceptance version, exact registered/executed
count or command catalog. Lines 136-147 accept any 40–64-hex harness release after the
caller supplies the issuer string; no allowlist or registry attestation is resolved.

A disposable probe constructed a Requirements PASS envelope bound to the real outer
subject but used nonexistent review commits/trees/range/path, an arbitrary harness
digest and recomputed local JSON digests. The checked-in validator returned exit 0:

```text
{"authority":"external_harness_required","check":"requirements","compatibilityValidation":"pass"}
```

The positive canonical test itself creates a model result with
`registeredCount=1/executedCount=1`, one generic `protected-harness` command, an
arbitrary release digest and synthetic review identities, then requires it to pass
(`gate-evidence.test.mjs:30-95`). This contradicts the exact 28-case model partition and
the evidence lineage rules in `acceptance-evidence-contract.md:236-259`.

Repair must make the compatibility schema check-specific and Git-object-aware, bind
approved harness releases through an independently supplied registry attestation, and
add mutation tests for nonexistent lineage, wrong evidence bytes/path/range, 1-of-28
model evidence, wrong acceptance version and command substitution.

### P1-3 — The mandatory PCR fulfillment record has no constructible schema or gate binding

`external-gate-harness-contract.md:63-74` and
`acceptance-evidence-contract.md:96-102` require each green PCR to attach an
exact-commit-bound fulfillment record containing fixture, real caller/result dependency
and execution evidence. No active contract defines that record's closed schema,
canonical digest, exact storage path, producer, validator, relationship to
`GateReviewEvidenceV1`, or required `GateResultV1` field. Repository search finds only
the two prose obligations, while `gate-evidence.mjs` never reads a fulfillment record.

As specified, implementation can either turn PCR bytes green without the promised
lineage or be unable to create evidence that Code Gate recognizes. Repair must define
the exact record, one row per PCR fixture, canonical identity/digest, writer, Git/caller
validation, exact-review attachment and Code aggregate rejection rules.

### P1-4 — The canonical Requirements PCR trace is broken by incompatible output schemas

`product-correctness.test.mjs:103-110` now emits the complete typed planned boundary in
`implementationBoundary`. The traceability oracle still hard-codes the superseded
string `source-led-opportunity-engine-v3.11` at
`acceptance-traceability.test.mjs:2401-2425` and deep-compares it to the child output.

The exact product/runtime trace command completed with `129/131` tests passing and two
failures, both beginning at PCR-001 because actual typed boundary and expected string do
not match. This is the canonical Requirements owner path, so the repair candidate cannot
produce its own required all-pass baseline. Repair the traceability expectation to load
and validate the immutable boundary row for every PCR, then prove all 31 baseline
children and the complete product trace have zero fail/skip/todo.

### P1-5 — PCR-030 violates the repair's own distinct caller-boundary invariant

The immutable row in `pcr-implementation-boundaries-v3.json` maps PCR-030 owner
`serializeCorrectnessPublicUnion` and caller `serializeOpportunityPublicProjection` to
the same file, `scripts/runtime/public-projection.js`. The Requirements baseline oracle
explicitly rejects equal owner/caller paths at
`product-correctness.test.mjs:82-99` because a same-file token is not a real boundary.

The focused PCR-030 baseline exits 1 with:

```text
PCR-030 planned caller must be a real boundary, not a same-file token
```

Repair must name a distinct real consumer module/function whose behavior depends on the
serialization result, and keep the owner/caller operation identities distinct.

## Round 89 closure assessment

| Round 89 finding | Round 90 assessment |
|---|---|
| PR-controlled bootstrap | **OPEN — P1-1/P1-2**. A contract now describes an external root, but no independently verifiable registration/handoff exists and its checked-in compatibility validator accepts forged evidence. |
| False PCR owner map | **PARTIAL — P1-5**. Typed planned rows replace unrelated current symbols, but PCR-030 still uses a same-file caller and fails the mandatory baseline. |
| Unconstructible RED-to-green graph | **PARTIAL — P1-3/P1-4**. Implementation-test hashes left the active graph, but the promised fulfillment evidence is undefined and the typed baseline broke the canonical trace. |
| Model/aggregate bypass | **PARTIAL — P1-1/P1-2**. The fourteenth script row and aggregate order exist, but 1-of-28 forged model evidence passes the canonical validator and no protected artifact flow is evidenced. |
| False-green doctor | **CLOSED**. Doctor calls the shared real host preflight; the pinned host, model suite and doctor pass together. |
| Stale 290/141 tasks | **CLOSED**. Current counts recompute and durable current prose uses `297/143/148/6`. |

## Immutable review boundary

- Round 89 evidence carrier: `af1297aaff6ab1798ca76447ece0d98e994da757`
- Reviewed repair subject commit: `6f192ef26d151b652e9dc17f7d16e5ee069518b9`
- Reviewed subject tree: `ead151e59963c1412d368053936c6bee9dc1e8f8`
- Exact repair range:
  `af1297aaff6ab1798ca76447ece0d98e994da757..6f192ef26d151b652e9dc17f7d16e5ee069518b9`
- Range: 29 paths, 917 additions, 499 deletions

`git diff --check` passes. The reviewed range contains no deployment, migration
application, scheduler/runtime activation, production-data mutation, flag change,
merge, push, package-lock or environment-artifact change.

## Independent recomputations and executable evidence

| Authority | Recomputed result |
|---|---|
| Active catalog | 4,304 bytes; SHA-256 `2fa64d7bcaee372e1f3084a30659926f265894884f15f2e08e891d9ece9894fd` |
| Active graph | 47 files; 38 owners; SHA-256 `47615e89d4bf38660f0800e4e60e94a2c7e9c584e392cedeba958deb1838ef1a` |
| Acceptance inventory | `1.44.1`; 297 unique cases |
| Classification | 143 `semantic_automated`; 148 `semantic_suite_backed`; 6 `structural_meta` |
| Track partition | 249 product/runtime; 28 model runner; 20 evaluation governance |
| Owner rows | 297; SHA-256 `30ff920699bc5cea270a9077473fac4b184edfe0fb17fcf5da9e17458ada672b` |
| Script-value rows | 14; SHA-256 `049e59017bb3c1dfdd6b31c12e46210612bf117fe5fcf82fb191ae00e4bc95dd` |
| Product/runtime trace | exit 1; 129/131 pass, 2 fail, 0 skip/todo; typed PCR baseline mismatch |
| Focused PCR-030 baseline | exit 1; same-file caller rejected |
| Forged Requirements envelope | exit 0; nonexistent review lineage and arbitrary harness digest accepted |
| Source-led product suite | 52/52 pass, 0 fail/skip/todo |
| Model-runner suite | 15/15 pass, 0 fail/skip/todo |
| Doctor | PASS with shared host preflight, deployment disabled and required v3.4 pin |

No Code Gate, Architecture Gate or Verification PASS is claimed. These probes did not
install a runtime, apply a migration, activate shadow mode or touch production.

## Required next step

Switch to Terra XHigh and repair all five P1 findings into a new immutable tree. Then
switch to Sol XHigh for independent fresh Requirements Round 91. Only a Round 91 result
with `P0=0 P1=0` may unlock independent Architecture Round 10.

Implementation, exact commit/review, Verification, PR mutation, merge, deployment,
migration, runtime installation, scheduler/flag changes and all production actions
remain blocked.
