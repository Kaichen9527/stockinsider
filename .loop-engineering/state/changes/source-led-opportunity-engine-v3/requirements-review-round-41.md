# Requirements Gate Round 41 — CHANGES_REQUIRED

Reviewer: fresh Sol xhigh session `3fd44316-9b74-4f02-8da7-0f684b3a6c12`

Reviewed immutable checkpoint: `edd0a125e8dc3b960829c72970e1a30a0d54632b`

Verdict: `CHANGES_REQUIRED` (`P0=0 P1=4 P2=0`)

Scope: read-only Requirements/Contract Gate. No Architecture Gate, implementation, App test, build, lint, migration or Git write was performed by the reviewer.

## Immutable evidence

- Sole parent `7c0ffe18e2288251d0e03d4369de1af58fc303e1`; root tree `e9f830d36864eb36553a2aabdeb17755c2880420`; change subtree `1d3a0a16c6b19f28891ee0fcdc54c4e19d7c74ca`.
- Baseline through reviewed head: 56 first-parent commits and zero merges.
- Repair range: exactly 14 change artifacts, comprising 13 modified files and new `model-runner-host-pins-v3.json`; no application, implementation, migration, executable-test, secret, policy, deployment, merge or production path.
- Target subtree: 85 files / 1,176,349 bytes. Active normative corpus: 34 artifacts / 813,690 bytes.
- Active path/OID/size digest `c8df19093fc9e0217c53af846c84e5d06c5c4a42bb2ae59ca43ef4ade5376fb0`; framed-content digest `d64716b4d5b0fb53a278e36d46b092246ff692f0d6bc38b91c3c0d61e785b662`.
- Acceptance `1.33.0`: declared/JSON/unique/Markdown/Markdown-unique counts all 252, zero order mismatch, and `MR3-001` through `MR3-021` exactly once in each mirror.
- Host fixture is canonical 2,136 pre-LF bytes / 2,137 file bytes with SHA-256 `70eb964ca9cfc22e237dc9b041ff8c53604db84992f9a6fb06d583de4a963387`.
- Runner identity is 18 unique ASCII-sorted members / 883 bytes / SHA-256 `6075dd8d58bb742e748e5c68e22891882b6dd6d0d0c4a688bfbb9dcb3672421f`.
- The opportunity tuple stays 36 members; catalogs stay 19 manifest kinds, 11 adapters, seven authority families, 31 public RPCs and two private helpers.

## P1 findings

### R41-001 — Review and verification cannot observe the proposal

The view is materialized from `inputHead`, while review and verify receive only proposal hashes/OIDs/refs and cannot read the authoritative maker result. A schema-valid verdict can therefore be emitted without seeing proposed bytes.

Required repair: define one exact hash-bound proposal representation, bind it into operation source-view identity and permissions, and carry it through review, verification, repairs, restart validation and mirrored acceptance.

### R41-002 — Permanent exclusions lack a closed path oracle

The permanent-control rule omits exact skill/plugin/hook classes and relies on undefined semantic categories such as shell snapshots and fixture-marked secrets. The broad contract prompt-reopen grammar can also collide with a permanently forbidden name.

Required repair: replace semantic classes with a complete basename/component/suffix/path grammar and give permanent exclusion unconditional precedence over selectors and prompt reopen.

### R41-003 — Task state and dual-journal recovery are not total

The contract lacks an exhaustive operation phase/exit to task-state/counter/output/retention/retry table and a legal cross-journal order. Cleanup after an otherwise completed operation, simultaneous primary and cleanup failure, partial resource/operation terminals and the result-file-fsync-before-`result_sealed` crash window remain ambiguous.

Required repair: freeze one total transition oracle, write-ahead ordering, orphan-result handling, cleanup precedence, status reconstruction, exact outputs, counters, retained identities and replay rules for every crash edge.

### R41-004 — Empty maker proposal conflicts with mandatory Git apply

The result matrix permits an empty patch, but the parser requires an ordinary Git diff and trusted Git always invokes `git apply`.

Required repair: either forbid empty proposal patches or define a complete no-op publication path. This change chooses the fail-closed nonempty-patch rule.

## Prior-finding disposition

- `R40-003` and `R40-004` are closed.
- `R40-001`, `R40-002` and `R40-005` remain partially open only through the four findings above.
- `ARC3-001` through `ARC3-004` remain closed without drift.
- The user-approved boundary remains honest: external user/repository reads, authoritative writes and command network/Unix sockets are hard denials; private scratch writes and possible sandbox execution are not denied claims.

Architecture Round 5 and implementation remain locked. Sol must close all four findings and obtain a brand-new Requirements PASS before a different fresh Architecture Gate.
