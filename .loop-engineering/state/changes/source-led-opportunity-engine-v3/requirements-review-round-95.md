# StockInsider V3.11.1 — Requirements Gate Round 95

## Result

`CHANGES_REQUIRED` — `P0=0 P1=2 P2=0`

This was an independent fresh Sol XHigh Requirements review of immutable subject
commit `73ab42010158a7a27e859e45790392a3669b77ad`, tree
`73893409a94c943e4aa0f94256387c545b4705b5`. Its parent is the Round 94 evidence
carrier `0f649238b493b8954f87b243c3bd19a58f5f7288`; the separate pre-review repair
evidence carrier is `afeee201caee5f6b8bda6d61a7a5f0cd5be33674`, tree
`bdbb45f70d1269e3597879013bcb6e610a810d4b`.

The review used a new clean detached worktree and made no subject-tree edit. It made
no push, PR, merge, deployment, migration application, runtime installation,
scheduler/flag change or production write.

## Independent current-state recomputation

```text
active-artifact-catalog-v3.json bytes: 5034
catalog SHA-256: 8a358ec84aeb9b9eafcef468fb775ea95c6ede4ba3c0424d10b5946cb6192d5f
active files / unique files: 48 / 48
owners / unique owners: 38 / 38
owner headers matching catalog: 38 / 38
active graph SHA-256: a0b209641919fb7f86dada6328dfae0c59526ab5b4e65d05bdbed09544e8a117
acceptance JSON / Markdown: 1.44.1 / 297, exact GOV-001 parity
```

All active paths are present, nonempty regular tracked blobs and equal to the reviewed
tree. No tracked `node_modules`, `.DS_Store`, `__pycache__` or `.pyc` artifact exists;
`git diff --check` passes.

## Round 94 closure assessment

The five canonical `GOV-004-AUTHORITY` tags are parsed as canonical JSON, occur once
and equal catalog/header-derived values. Missing, duplicate-equal, conflicting and
non-canonical tags reject. The Round 94 registered key/value, uncommaed, hyphen,
paired-number, case and spacing examples also reject. Focused GOV-001/GOV-004 passes
2/2 on the unmodified subject.

That closes the exact Round 94 examples, but not the promised order- and phrase-closed
semantic authority grammar.

## Findings

### P1-1 — GOV-004 still accepts reordered and plainly equivalent authority claims

Affected authority:

- `design.md`, Mechanical active-version graph: every untagged lexical declaration
  claiming managed catalog, topology or PCR-owner authority must reject;
- `acceptance-evidence-contract.md`, active graph oracle: the grammar is promised to
  reject any untagged lexical variant;
- canonical `GOV-004`: alternate key/value, number, hyphen, case and spacing syntax is
  promised to fail closed.

The catalog classifier requires the words in the order `catalog -> bytes -> sha256`.
The topology classifier recognizes only `active files/blobs` or the registered paired
count spellings. The owner classifier requires the version number immediately after a
shortened product-correctness owner phrase. These are presentation-order assumptions,
not a closed semantic declaration rule.

A disposable clean detached probe added:

```text
Alternate catalog declaration: sha256=000...000; byteLength=5033.
Alternate active graph topology: files=45; owners=37.
Alternate product-correctness owner: product-correctness-runtime-v3.11.7.
```

It recomputed and froze the legitimate mutated graph
`52e61c8c2b745018c0da2ab40233a73a5f8bcf9b1bd843c0755e4cfcb2bc03e0`.
Probe commit `2db4ce4e5cfccb55554767abdc221309f6290819`, tree
`afedea751f8213e74204bfad56bf143adc4e61ac`, then returned GOV-004 PASS 1/1. All
three additions unambiguously conflict with their canonical tags while using the same
managed field vocabulary.

Repair must classify the managed tokens independently of field order and harmless
punctuation, reject active-graph `files/owners` topology claims and reject every full
`product-correctness-runtime-v*` owner identity outside the canonical tag/header
authorities. The exact rebound probe above and order permutations must become negative
tests in the new immutable tree.

### P1-2 — The required model-runner command is nonterminal on the exact pinned host

Affected authority:

- `acceptance-evidence-contract.md`, `model-runner-code-gate`: the required sequence
  includes the complete `npm run test:model-runner-v3` command before doctor;
- `acceptance-tests.json` script-value authority: the exact command is a mandatory
  model-track input;
- MR3-009/MR3-013 and `model-runner-contract.md`: the bounded real model attempt and
  process-group handling must return one explicit terminal result or closed failure.

The test file declares 15 top-level tests. On the exact host accepted by
`model-runner-host-pins-v3.5`, the complete npm command was run twice. Both executions
reported tests 1..12 as passing, then ended the parent command while entering the real
model-attempt test. Neither emitted `1..15`, a TAP summary, an exit marker placed after
the npm command, nor results for tests 13..15. This cannot be recorded as 15/15 PASS.

The two post-attempt tests were isolated with the native pinned Node command and pass
2/2: CLI validation/fail closure and maker materialization. Doctor independently
passes the exact Node/Git/Codex fixture and reports deployment `disabled`, so this is
not an allowed host-pin mismatch. No synthetic result was substituted.

Repair must contain the real model attempt so it cannot terminate the TAP parent or
calling shell, map every completion/timeout/signal to the closed result, and make the
exact required npm command finish with a terminal 15-test TAP plan/summary. A following
shell marker must execute, proving control returned to the protected gate runner.

## Fresh verification

| Check | Result |
| --- | --- |
| clean detached subject and independent graph recomputation | PASS |
| catalog uniqueness/header agreement and `1.44.1/297` mirror | PASS |
| focused protected-harness-shaped GOV-001/GOV-004 | PASS — 2/2 on the subject; rebound semantic-order probe false-greens |
| `npm run test:source-led-opportunity-v3` | PASS — 53/53 |
| `npm run test:source-led-opportunity-v3:migration` | PASS — 20/20 |
| `npm run test:model-runner-v3` | INCOMPLETE — twice nonterminal after 12 of 15 declared tests |
| isolated post-attempt model-runner tests | PASS — 2/2 |
| `npm run v3:doctor -- --expect-mode disabled --require-host-pin model-runner-host-pins-v3.5` | PASS — exact host preflight; deployment disabled |
| tracked environment-artifact scan | PASS |

Evaluation governance remains honestly
`blocked/non_fabricated_elapsed_cohorts_unavailable`; no elapsed cohort was generated
or reclassified. Ordinary PCR implementation remains explicit planned RED work and is
not represented as a Code Gate PASS.

## Required next step

Architecture Round 10 remains locked. Use **Terra XHigh** to repair both P1 findings
in a new immutable tree, then return to **Sol XHigh** for independent fresh
Requirements Round 96. This result grants no Architecture, Code Gate, Verification,
PR, deployment, migration, runtime, scheduler/flag or production authority.
