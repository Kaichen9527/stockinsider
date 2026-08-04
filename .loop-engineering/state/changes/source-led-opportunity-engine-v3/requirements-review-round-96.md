# StockInsider V3.11.1 — Requirements Gate Round 96

## Result

`CHANGES_REQUIRED` — `P0=0 P1=1 P2=0`

This was an independent fresh Sol XHigh Requirements review of immutable subject
commit `ea513abebea7f0c3907b76fcc00b351095c2d63e`, tree
`19e5a06b7077412a676a31b5226afcfecc01bcd7`. Its parent is the separate Round 95
review-evidence carrier `884d90f7f2d67c6def4493be7d74c7f49f478159`; the pre-review
Round 95 repair-evidence carrier is `af46a7b77f02814d9f273228b919b683ffca8072`,
tree `cf18d8521a0c0d0462188cbc05e9a9c748fa6576`.

The review used a new clean detached worktree and made no subject-tree edit. It made no
push, PR, merge, deployment, migration application, runtime installation,
scheduler/flag change or production write.

## Independent current-state recomputation

```text
active-artifact-catalog-v3.json bytes: 5034
catalog SHA-256: 8a358ec84aeb9b9eafcef468fb775ea95c6ede4ba3c0424d10b5946cb6192d5f
active files / unique files: 48 / 48
owners / unique owners: 38 / 38
active graph SHA-256: dcce40bea732c496749e42db0b704530e1ca7e94ea6526dc87475506c0a757b4
acceptance JSON / Markdown: 1.44.1 / 297, exact GOV-001 parity
```

All active paths are present, nonempty regular tracked blobs and equal to the reviewed
tree. No tracked `node_modules`, `.DS_Store`, `__pycache__` or `.pyc` artifact exists;
syntax checks and `git diff --check` pass.

## Round 95 closure assessment

The exact Round 95 SHA-before-byteLength catalog declaration, active-graph
files/owners declaration and full `product-correctness-runtime-v3.11.7` owner identity
are now rejected after a legitimate graph rebind. Catalog and topology token matching
is order-independent for those managed fields.

The required model-runner defect is closed. The complete npm command returns control
to its caller and emits `1..15`, 15 passes, zero failures and exit 0. Independent
mutation probe commit `9d14da3c4caacc704451c6530a414ccb2e0eaf47`, tree
`527efea30d5f758266cb86968b5606f023388a28`, forces worker exit 23, SIGTERM and a
bounded timeout separately. In all three cases the real-attempt case fails normally,
the two following tests execute, a terminal TAP plan/summary appears and the following
shell marker runs. No model-worker outcome terminates the TAP parent.

## Finding

### P1-1 — PCR-owner classification is still order-dependent

Affected authority:

- `design.md`, Mechanical active-version graph: GOV-004 promises order- and
  punctuation-independent lexical closure for PCR ownership;
- `acceptance-evidence-contract.md`, active graph oracle: field order must be
  normalized before any untagged PCR-owner variant is rejected;
- canonical GOV-004: graph-rebound shortened/full PCR-owner claims and order variants
  must fail closed.

`authorityLikeDeclaration()` at
`scripts/opportunity-v3/acceptance-traceability.test.mjs:286-288` accepts a PCR owner
only when the three-part version follows `product correctness [runtime]
[owner|version]`. Unlike the catalog and topology branches, it does not derive an
owner-name token group and a version token group independently of their order.

A clean detached probe added this untagged, unambiguous owner declaration:

```text
Alternate product-correctness authority: v3.11.7 is the product-correctness-runtime owner.
```

It then recomputed and froze the legitimate mutated graph
`50b4598df377bf44425b16bb75e645e691a473bb5f80318c0d16b0bc1a2da380`.
Probe commit `40bd544020e4f857c490ac4752ac6e47eaa084c0`, tree
`1274264725e4eea6c25a03d48f15c494ff25e4d0`, returned focused GOV-004 PASS 1/1.
The result is a false green: the line asserts stale PCR ownership using the same
managed name/version vocabulary, differing only by natural sentence order.

Repair must recognize the normalized PCR owner-name token group and valid three-part
version token group within a bounded declaration window regardless of which appears
first, while retaining only the two exact catalog/header-derived canonical exceptions.
Version-before-name, name-before-version, shortened/full, camel/hyphen, case, spacing
and punctuation forms must become graph-rebound negative mutations in the next
immutable tree.

## Fresh verification

| Check | Result |
| --- | --- |
| clean detached subject and independent graph recomputation | PASS |
| catalog uniqueness and `1.44.1/297` mirror | PASS |
| focused protected-harness-shaped GOV-001/GOV-004 | PASS — 2/2 on the subject; owner/version-order rebound probe false-greens |
| `npm run test:source-led-opportunity-v3` | PASS — 53/53 |
| `npm run test:source-led-opportunity-v3:migration` | PASS — 20/20 |
| `npm run test:model-runner-v3` | PASS — terminal 15/15 with following shell marker |
| worker exit/signal/timeout mutation probes | PASS — each fails the selected case normally and preserves terminal TAP/caller control |
| `npm run v3:doctor -- --expect-mode disabled --require-host-pin model-runner-host-pins-v3.5` | PASS — exact host preflight; deployment disabled |
| tracked environment-artifact scan | PASS |

Evaluation governance remains honestly
`blocked/non_fabricated_elapsed_cohorts_unavailable`; no elapsed cohort was generated
or reclassified. Ordinary PCR implementation remains explicit planned RED work and is
not represented as a Code Gate PASS.

## Required next step

Architecture Round 10 remains locked. Use **Terra XHigh** to repair the one P1 in a
new immutable tree, then return to **Sol XHigh** for independent fresh Requirements
Round 97. This result grants no Architecture, Code Gate, Verification, PR, deployment,
migration, runtime, scheduler/flag or production authority.
