# StockInsider V3.11.1 — Requirements Gate Round 97

## Result

`CHANGES_REQUIRED` — `P0=0 P1=1 P2=0`

This was an independent fresh Sol XHigh Requirements review of immutable implementation
commit `8918ad3f22d231e5153492ff16e8e52c795bfb2b`, tree
`47ec955e6d8b43a6171465ae8fd5ddea708eaf8a`. Its parent is the separate Round 96
review-evidence carrier `ed2bb18cb60b31bf24de9fa0bccd2e462b026fa2`; the pre-review
Round 96 repair-evidence carrier is `20d64739a4eb111cbc0f7ddb2cac05c498892844`,
tree `25391c33258bfad302e5a26329c0c064f3a38bb7`.

The review used a new clean detached worktree and made no implementation-tree edit. It
made no push, PR, merge, deployment, migration application, runtime installation,
scheduler/flag change or production write.

## Independent current-state recomputation

```text
active-artifact-catalog-v3.json bytes: 5034
catalog SHA-256: 8a358ec84aeb9b9eafcef468fb775ea95c6ede4ba3c0424d10b5946cb6192d5f
active files / unique files: 48 / 48
owners / unique owners: 38 / 38
active graph SHA-256: a61c4979397286cda8d6f9fbcdb8d2d59c3250679d773136f00a42a088c3d5d0
acceptance JSON / Markdown: 1.44.1 / 297, exact GOV-001 parity
```

All active paths are present, nonempty regular tracked blobs and equal to the reviewed
tree. No tracked `node_modules`, `.DS_Store`, `__pycache__` or `.pyc` artifact exists;
syntax, JSON and diff checks pass.

## Round 96 closure assessment

The exact four Round 96 version-first variants are now rejected after legitimate graph
rebinds. The PCR classifier independently extracts owner-name and three-part-version
spans and accepts either presentation order. The complete model-runner command also
remains terminal with `1..15`, 15 passes, zero failures and caller control.

## Finding

### P1-1 — Bare three-part PCR authority versions still false-green

Affected authority:

- `design.md`, Mechanical active-version graph, requires a bounded PCR owner name and
  three-part version to be paired in either order;
- `acceptance-evidence-contract.md`, canonical authority-tag grammar, requires every
  untagged lexical PCR-ownership variant to reject after normalizing field order and
  harmless punctuation;
- canonical GOV-004 setup/expected text requires shortened/full owner-name and
  three-part-version claims in both orders to fail closed.

`pcrOwnerIdentity()` at
`scripts/opportunity-v3/acceptance-traceability.test.mjs:279-281` discards a matched
three-part version unless it has a literal `v` prefix or the surrounding slice contains
the words `owner` or `version`. That extra condition is not part of the approved
owner-name/three-part-version pairing contract and does not recognize an explicit
`authority` declaration.

A clean detached probe added these two untagged declarations:

```text
Alternate product-correctness authority: 3.11.7 is productCorrectnessRuntime.
Alternate product-correctness authority: product-correctness-runtime is 3.11.7.
```

It then recomputed and froze the legitimate mutated graph
`4cdeac60cb4c01cdc0d970064865eb7f09537edabcfaab008ea30b56c0259cbb`.
Probe commit `693dec06727f1b8d4b576c33c25a4fd432bd4111`, tree
`791b4ce8a56a0febb4b0a050fd64bd348ab9a151`, returned focused GOV-004 PASS 1/1.
The result is a false green: both lines explicitly claim PCR authority with the managed
full owner name and a valid three-part version, differing only by omitted presentation
words and field order.

Repair must close bare three-part semver claims when an unambiguous normalized PCR
runtime owner or authority context is paired inside the bounded declaration window,
without turning unrelated date prose into ownership. Graph-rebound negative mutations
must cover bare-semver name-before/version-before, full/shortened owner names,
authority/owner/version context and non-authority date controls.

## Fresh verification

| Check | Result |
| --- | --- |
| clean detached subject and independent graph recomputation | PASS |
| catalog uniqueness and `1.44.1/297` mirror | PASS |
| focused protected-harness-shaped GOV-001/GOV-004 | PASS — 2/2 on subject; bare-semver rebound probe false-greens |
| `npm run test:source-led-opportunity-v3` | PASS — 53/53 |
| `npm run test:source-led-opportunity-v3:migration` | PASS — 20/20 |
| `npm run test:model-runner-v3` | PASS — terminal 15/15 |
| `npm run v3:doctor -- --expect-mode disabled --require-host-pin model-runner-host-pins-v3.5` | PASS — deployment disabled |
| syntax, JSON, diff and tracked-environment-artifact checks | PASS |

Evaluation governance remains honestly
`blocked/non_fabricated_elapsed_cohorts_unavailable`; no cohort was generated or
reclassified. Ordinary PCR implementation remains planned RED work and is not a Code
Gate PASS.

## Required next step

Architecture Round 10 remains locked. Use **Terra XHigh** to repair this one P1 in a
new immutable tree, then use **Sol XHigh** for independent fresh Requirements Round 98.
This result grants no Architecture, Code Gate, Verification, PR, deployment, migration,
runtime, scheduler/flag or production authority.
