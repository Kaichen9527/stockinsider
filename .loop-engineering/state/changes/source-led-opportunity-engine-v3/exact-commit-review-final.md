# Protected gate bootstrap exact-commit review — graph-bound evidence selection

Date: 2026-08-29

Review authority: independent, read-only exact-range review of the immutable
bootstrap repair. It did not mutate production state, issue credentials, start
a runtime, deploy Web, or enable LINE, dispatch, automatic trading, Promotion,
or evaluation governance.

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Protected base: `6aaa017618f15a0082efb2cafe8c08b32947be1c`
- Final reviewed repair/tree: `9fe05141cdab1fe8daa49cfd6793cf42b53f6da6` / `efd3fd51994897ec7c6c4c57cce2532cc4078558`
- Full final range: `6aaa017618f15a0082efb2cafe8c08b32947be1c..9fe05141cdab1fe8daa49cfd6793cf42b53f6da6`
- Active graph: `4baf35c1a17cc7c7cd451e71b29e34e9b83c90ee03ca18822fcf4f7f47b19a7b`

## Review result

The previous bootstrap correctly made exact-review proof subject-addressed, but
revealed a separate invariant: the bootstrap tree and the V3.20 product tree
have different, already-reviewed active artifact graphs. A single static
Requirements/Architecture reference therefore cannot be valid for both.

This repair uses a closed mapping from the two reviewed graph hashes to their
respective immutable Requirements and Architecture evidence. The selector runs
only after the subject identity is derived from the detached checkout; any
unknown graph fails closed. Preparation fetches the closed union of known
evidence refs plus the subject-addressed exact ref, so it cannot select an
unfetched or caller-controlled location.

The range was inspected for graph-selector widening, untrusted ref construction,
attestation substitution, evidence-tree leakage, and changes to executable
candidate commands. No P0, P1, or P2 finding remains.

## Executable evidence

- `protected-external-gate-worker.test.mjs`: `9/9` PASS.
- `git diff --check`: PASS.
- This bootstrap has no product, migration, runtime, or public API behavior
  change. The protected workflow remains the authoritative full execution gate
  before this PR can merge.

Evaluation governance remains
`blocked/non_fabricated_elapsed_cohorts_unavailable`; it is unrelated to this
gate-topology repair.
