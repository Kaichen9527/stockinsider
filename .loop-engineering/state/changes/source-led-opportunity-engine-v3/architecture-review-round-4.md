# Architecture Gate Round 4 — CHANGES_REQUIRED

Reviewed: 2026-07-20 Asia/Taipei

Reviewer: fresh `gpt-5.6-sol` session `019f7b5a-3820-76e2-8137-255f712b5ba3` (`xhigh`, read-only, approval `never`)

Reviewer-reported audit ID: `58a534ce-bd06-47a7-b1de-be1404a9d292`

## Immutable boundary

- Baseline `B`: `12c131aa50ca53268878e9f025973533ac100c49` (verified commit and intentional shallow boundary).
- Previous design head `P`: `2801da3c11668d688e2103a0d6f9d6c2d311b395`.
- Reviewed head `H`: `ae9fbd868237a620191d515bd0ce48df0152c996`, sole parent `P`.
- `H` root tree: `31ee91949cbea601dd78756c6f1f5288f61521b2`.
- `H` change subtree: `b4cb35f1214b1ad23d1557e4bd44d2a67faf8a9f`.
- `B..H`: 53 first-parent commits, 53 total commits and zero merges.
- `P` root/change trees: `54af10083f1277297cc70885153bd33602702ec5` / `942ce669cd14ed661807d114d9ebf04dc88bda85`.

`P..H` changes only five Loop evidence/state files: `decision-log.md` (+6), `gate-summary.md` (+4), new `requirements-review-round-39.md` (+62), `status.json` (+8/-8) and `tasks.md` (+1/-1). No active normative artifact changed after `P`.

The reviewed subtree contains 81 files / 1,085,654 bytes. Its closed active catalog contains 32 artifacts / 745,723 bytes with:

- blob-map digest over `path<TAB>blobOID<LF>`: `41b8f0d404c408bebb05972b61ee1a2a6987dbf107a699cf31e6d7f2a1d808f2`;
- framed content digest over `path\0size\0content`: `7cec74ed460f515941a93d57c4f368f0b3b7a6b1fffa38a75cc394239b7d6c2a`.

## Requirements Gate lineage

Requirements Round 39 session `019f7b47-7094-76c3-915e-3930954fb902` is a genuine PASS for the corpus it reviewed. The reviewer independently confirmed its four exact `auth-principal-contract.md v3.7 -> v3.8` repairs, active-corpus hashes, `1.31.0` / 231-case JSON/Markdown parity, R1-R11/Safety trace counts, 36 static members, 19 manifests, eleven adapters, seven authority families, 31 public RPCs and two private helpers.

That Requirements PASS did not cover the additional mandatory `model_runner_v3` macOS isolation amendment supplied to Architecture Round 4.

## Findings

### P0

None.

### P1

#### ARC4-001 — approved `model_runner_v3` isolation amendment has no active architecture owner

The active catalog has no reference to `model_runner_v3`, macOS isolation, a sanitized source view or Codex-private scratch behavior:

- `H:design.md`, blob `d8419eedc9f1cdfb401e9d1c520f52b1380c6bf4`, lines 24–32 has an exhaustive normative catalog without a runner contract; line 60 only registers offline assistive artifacts.
- `H:requirements.md`, blob `306d7293c021cc877e15bf1971df218cd26472e8`, lines 197–204 governs artifact registration, non-influence and Vercel no-download/no-training, but not offline runner execution.
- `H:acceptance-tests.md`, blob `e7d0e061c744bf9b60af55a1e188591eda9c176e`, `MOD-003` and `MOD-004` cover only Vercel/non-execution behavior, not a macOS runner boundary.
- `H:tasks.md`, blob `529c126e96f035b11c2e37f57c9e635483caaf81`, lines 91–111 assigns no constructible runner/integration task.

Terra therefore cannot derive sanitized-input construction, launcher/profile boundaries, prompt policy, output handoff, audit identity, failure effects or acceptance oracles. The corpus does not reinstate absolute no-code-execution; the blocker is absence of the approved narrower contract.

### P2

None.

## Architecture Round 3 reconciliation

- `ARC3-001` closed: `sector-reference-contract.md` defines one provenance-bound `10*K+2*U <= 200000` representation, benchmark reuse, conservation, hashes and fail-closed completion; `SCR-014` covers bounds.
- `ARC3-002` closed: `shadow-evaluation-contract.md`, `auth-principal-contract.md` and `storage-schema-contract.md` define sample-bound evidence, dual authorization, blind dispositions, nonce atomicity, locking, idempotency and immutable effects; `EVAL-014` covers leakage and mutation.
- `ARC3-003` closed: `job-graph-contract.md` is the sole inline RFC-4122 UUIDv5 owner with qualified `pgcrypto`, exact namespaces/preimages/vectors and exactly two private helpers; `MIG-005` covers it.
- `ARC3-004` closed: `legacy-compatibility-contract.md` defines `disabled|drain|shadow`, forward/rollback/re-enable ordering, bounded drain and retained additive evidence; `OPS-040` covers interruptions.

All other reviewed source-led, market, valuation, authority, transaction, persistence and compatibility mechanisms are constructible.

## Required Sol amendment

Add one active normative `model_runner_v3` owner which:

1. joins the active catalog/version graph and implementation tasks;
2. defines sanitized view construction, digest/provenance, allowed inputs and typed results;
3. defines the exact macOS launcher/profile and fail-closed preflight for external-read, authoritative-write and network isolation;
4. prohibits prompts from instructing repository-code execution without claiming all execution or Codex-private scratch writes are impossible;
5. defines scratch lifecycle, inherited environment/file descriptors, symlink/path safety, auditing, idempotency and failure effects;
6. keeps any domain-facing output assistive-only and human-registered with zero V3 decision influence;
7. adds deterministic mirrored acceptance for allowed scratch, forbidden external reads/network/authoritative writes, prompt mutation and isolation/preflight failures.

After repair, a brand-new Requirements Gate and then a different fresh Architecture Gate are mandatory. Implementation remains unauthorized.

## Verdict

`ARCHITECTURE_GATE_ROUND_4: CHANGES_REQUIRED`

Counts: `P0=0`, `P1=1`, `P2=0`.
