# Requirements Gate Round 42 — CHANGES_REQUIRED

Reviewer: fresh Sol xhigh session `7f2c8f4a-3d11-4a6b-9e27-6c5d8b903142`

Reviewed immutable checkpoint: `d07b9c35236d6e06a991449543ac6fb85640bb9d`

Verdict: `CHANGES_REQUIRED` (`P0=0 P1=2 P2=0`)

Scope: read-only Requirements/Contract Gate. No Architecture Gate, implementation, App test, build, lint, migration or Git write was performed by the reviewer.

## Immutable evidence

- Sole parent `edd0a125e8dc3b960829c72970e1a30a0d54632b`; root tree `bb98c0ca563a47970ebf37786df52320a47a094d`.
- Baseline through reviewed head: 57 first-parent commits and zero merges.
- Repair range: exactly 14 change-directory files, comprising 13 modified files and new `requirements-review-round-41.md`; no implementation, migration, executable-test, secret, deployment or production path.
- Target subtree: 86 files / 1,203,039 bytes. Active normative corpus: 34 artifacts / 831,562 bytes.
- Active path/OID/size digest `1a28483f48c55433e3425ea3b552b797eeefebf3123e6a3a277818eec6ea4fa2`; framed-content digest `183f3a121d5a4e0fdc3a9b59bf80c1373c0aa545f22dc0148b6bb6062d3e0e33`.
- Acceptance `1.34.0`: all five counts are 256, exact order parity, and `MR3-001` through `MR3-025` occur exactly once in both mirrors.
- Host fixture remains canonical 2,136 pre-LF / 2,137 file bytes with the expected SHA-256.
- Runner identity remains 18 unique ASCII-sorted members / 883 bytes / SHA-256 `60175c63935fc0fc3176b1cac4cfd5d14c2a681fbaa4c277d2a3edc02a91f652`.
- Runtime tuple remains 36 unique ASCII-sorted members; catalogs remain 19 manifest kinds, 11 adapters, seven authority families, 31 public RPCs and two private helpers.

## P1 findings

### R42-001 — Pre-`prepared` resource attempts are not retryable

The resource journal is keyed only by `operationKeySha256`, while the round counter changes only at `prepared`. A failure after durable resource allocation but before `prepared` terminalizes that key without changing the counter, so the next invocation derives the same key and cannot append, replace or select another resource chain. Pre-`prepared` cleanup failure state/output is also unspecified.

Required repair: define one exact durable uniqueness/reservation mechanism before the first resource record and total state/output/cleanup/retry behavior for every pre-`prepared` resource failure. Journal deletion or an implementation-selected retry convention is forbidden.

### R42-002 — Cleanup-failure precedence conflicts with the global exit precedence

The global precedence orders model protocol and valid terminal verdicts before I/O, while the journal rules make any cleanup failure after a protocol failure or semantic terminal return `IO_ERROR`/11. A primary result plus cleanup failure therefore has two normative exits.

Required repair: make the global precedence and terminal-output rules select one identical result for every primary-plus-cleanup collision, including retained primary evidence, task state, `lastExit`, stdout/stderr and replay.

## Prior-finding disposition

- `R41-001`, `R41-002` and `R41-004` are closed.
- `R41-003` remains open only through `R42-001` and `R42-002`.
- The hard isolation claim, pinned host/profile/routing, V1/V2 nonmutation, R1–R11/Safety and `ARC3-001` through `ARC3-004` remain coherent without drift.

Architecture Round 5 and implementation remain locked. Sol must close both findings and obtain a brand-new Requirements PASS before a different fresh Architecture Gate.
