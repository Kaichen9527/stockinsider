# StockInsider V3.11.1 — Requirements Gate Round 92

## Result

`CHANGES_REQUIRED` — `P0=0 P1=2 P2=2`

This was an independent fresh Requirements review of immutable subject commit
`2eef1c13c2a969890c255c55084cfb1868730d59`, tree
`6001b5ec196f47ef603c905c2ba34af7f9499062`. The prior reviewed subject is
`86191c8392fa41292f5877db2580be28f215d66b`; the reviewed repair/evidence range is:

```text
86191c8392fa41292f5877db2580be28f215d66b..2eef1c13c2a969890c255c55084cfb1868730d59
```

The range changes 21 tracked paths with 264 additions and 68 deletions. It contains
no `node_modules`, package-lock, deployment, migration application, runtime install,
scheduler, flag, production-data, merge, push or PR mutation.

## Round 91 closure

The Round 91 host-pin P1 is closed. Fresh measurement and executable verification
agree on the exact active host identity:

- fixture `model-runner-host-pins-v3.5`, 2,137 canonical pre-LF bytes / 2,138 file
  bytes, SHA-256
  `6d038608c9084e1b6d8acc4c4709c48a2140a1f967aa94e8fde9df853ec8902b`;
- signed Codex `codex-cli 0.146.0-alpha.9.2` at the exact pinned path/stat/hash,
  Team ID and designated requirements;
- 18-member/884-byte runner identity SHA-256
  `e3947ead4c5079109c08ba8be6f1e3f93cbecb0dc5d752cd34c973958ef6f480`;
- fresh model-runner suite `15/15` and doctor PASS with deployment `disabled`.

Authenticated read-only GitHub Settings inspection also reconfirmed Ruleset
`20177392` is `stockinsider-v3-gate-root`, `Active`, applies to `main`, has an empty
bypass list, requires a pull request, requires the exact
`stockinsider-v3-gate-root` check and requires the branch to be up to date. The
external protected-root prerequisite therefore remains observable.

## Findings

### P1-1 — Active-graph topology and catalog identity are normatively contradictory

The subject's actual catalog and executable graph oracle agree on:

```text
active-artifact-catalog-v3.json bytes: 5034
catalog SHA-256: 8a358ec84aeb9b9eafcef468fb775ea95c6ede4ba3c0424d10b5946cb6192d5f
active files / owners: 48 / 38
active graph SHA-256: 1f0e859b0d925c3d7641224023c8aef3efa4a8171eebe0eadcb3dd49068593e9
```

But active `design.md` still declares 4,133 bytes, catalog SHA-256
`c2886bf43a6675a476e6dbba7c406fc5e23aca388d588eb5dd8d5c194ee1a7b6`
and 45 active blobs. Active `acceptance-evidence-contract.md` separately promises a
45-file/37-owner closure. These values cannot all describe the sole current active
graph. `GOV-004` nevertheless passes because it hard-codes 48/38 without checking the
competing active prose, contradicting the same contracts' fail-closed/no-stale-prose
rule.

Repair must synchronize both active documents to the tracked catalog and make the
oracle reject a future catalog byte/hash/file/owner prose drift. Because those
documents are active graph members, the repair must compute and freeze a new active
graph SHA rather than reusing this review's digest.

### P1-2 — `design.md` names the wrong active product-correctness owner

The active catalog, amendment header, requirements and hybrid amendment all select
`product-correctness-runtime-v3.11.8`; active `design.md` instead calls the current
root `v3.11.4`. Its following text says extracted owner versions must equal the
catalog, but `GOV-004` does not scan this shortened prose edge and returns green.

Repair must change the active design edge to v3.11.8 and extend the graph oracle so a
stale shortened owner reference cannot coexist with the catalog/header authority.

### P2-1 — Round 91 repair evidence undercounts the runner suite

`requirements-round-91-host-pin-repair.md` and the current Round 91 gate-summary
section claim `npm run test:model-runner-v3` passed `12/12`. Fresh complete TAP output
shows `15/15`, including the descendant propagation, CLI fail-closed and maker
integration tests after the first twelve. The suite passes, so this is not a hidden
test failure, but the durable evidence count is false and must be corrected.

### P2-2 — The pending Requirements tree does not identify the reviewed candidate

Before this review, `status.json.requirementsPendingTree` was
`51c55919b6e57ee82f41a70d740dbf4930705c39`, the host-pin implementation tree. The
requested fresh candidate is tree `6001b5ec196f47ef603c905c2ba34af7f9499062`, which
also carries `requirements-round-91-host-pin-repair.md`; that evidence file does not
exist in the older pending tree. This is durable next-work drift. The Round 92 evidence
carrier must identify the actual reviewed subject, and the next repair must identify
its new immutable subject before Round 93.

## Fresh verification

| Check | Result |
| --- | --- |
| `npm run test:source-led-opportunity-v3` | PASS — 53/53 |
| `npm run test:source-led-opportunity-v3:migration` | PASS — 20/20 |
| `npm run test:model-runner-v3` | PASS — 15/15 |
| `npm run v3:doctor -- --expect-mode disabled --require-host-pin model-runner-host-pins-v3.5` | PASS — exact host preflight; deployment disabled |
| protected-harness-shaped `GOV-001` / `GOV-004` | PASS — 2/2, but false-green gaps are P1-1/P1-2 |
| active graph recomputation | PASS — actual values shown in P1-1 |
| `git diff --check` | PASS |

Evaluation governance remains honestly
`blocked/non_fabricated_elapsed_cohorts_unavailable`; it is not a Requirements defect
and no synthetic elapsed cohort was created. The ordinary PCR implementation remains
the explicitly planned RED state and is not represented as a Code Gate PASS.

## Required next step

Architecture Round 10 remains locked. Use **Terra XHigh** to repair both P1 and both
P2 findings in a new immutable tree, then return to **Sol XHigh** for independent
Fresh Requirements Round 93. No Architecture, implementation, Verification, PR,
deployment or production authority is unlocked by this result.
