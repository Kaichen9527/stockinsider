# Architecture Gate Round 3

## Formal verdict

**CHANGES_REQUIRED**

| Severity | Count |
|---|---:|
| P0 | 0 |
| P1 | 4 |
| P2 | 0 |

Implementation remains unauthorized.

## Immutable identity and review boundary

- Baseline B: `12c131aa50ca53268878e9f025973533ac100c49`.
- Review H: `80d8fee11135661f46864cee865ece8ebbd80308`.
- Direct parent P: `f11608fceb9c20d0c2559ca27625afa2d293f24d`.
- H tree: `32e03391a1bb1b64c2cfbe8c8419496920e13a42`.
- H change subtree: `a56e0fa762d19fcb435c489af39e6f8bfa329b86`.
- Reviewer session: `019f7ab2-f704-7581-b5c6-5e6a2dda8c5c`, fresh `gpt-5.6-sol` with xhigh reasoning, read-only sandbox, approval `never`, ephemeral, user configuration/rules, web, plugins, apps, hooks, MCP, multi-agent, browser/computer use, shell snapshots, dependency installation and tool suggestions disabled.
- Evidence came only from immutable B/P/H Git objects through `/usr/bin/git --git-dir=...` with locks and lazy fetching disabled. No ref, worktree/index byte, network, repository program, external skill/configuration or mutable state was used.
- B-to-H is exactly 79 additions: 78 files below this change plus `.specify/memory/constitution.md`; no application, migration, runtime or deploy artifact changed.
- P-to-H is exactly five checkpoint/evidence paths for Requirements Gate Round 37. No active requirement, contract, acceptance, architecture or schema artifact changed after its valid PASS.

## Mechanical evidence

- Active catalog: 32 exact artifacts; Requirements Round 37 digest `0fe688a70556ed4a8f43ce142522e2cb2488242f3a8fb6df4c787bad4e781fc2`.
- Acceptance: `1.30.0`; declared/actual/unique `227/227/227`; exact JSON/Markdown five-field and order parity hash `1e91e1a38622eddfb243f53b116ea6457ec57333dcbd1db51d1e4c5b29af9a4c`; ID-order hash `e584211061b426db9ca8610a539bd2667cce2d6125a4e7af86b259b3d67c7ad4`.
- Traceability: R1-R11 `34,19,14,12,17,20,18,25,18,23,37`; Safety 90.
- Runtime identity: 36 unique ASCII-sorted members; 19 manifest kinds; 11 source adapters; seven authority families; 31 granted RPCs and two declared private successor helpers; 6 control, 1 worker, 7 runner-ingestion and 11 human-authority routes.
- Provider preimage: 18 rows, 1,645 bytes, `fe78e0f8c5b0846f822f72c6b2356cac35ed5c00dd0bcd06f9a75b7c5b21d3f7`.
- Price/action preimage: two exchange rows, 313 bytes, `48fa54ee9f0e3a0b888ac0dc17eda8ad5bb746106a6fe4395eb50a5865e4e44e`.
- Taxonomy: 32 codes, 32 distinct sectors plus `unknown`, `6b28d85903d7a410eef29386de011c71aa789dc0ce3231df38cb4e085181060c`.

## P1 findings

### ARC3-001 — Sector-reference evidence is not constructible at the declared bound

`sector-reference-contract.md` requires ten sector aggregate families with per-constituent evidence and two full-roster market-benchmark evidence hashes, while `manifest-storage-contract.md` permits at most 200,000 `aggregate_evidence_rows`. The contracts do not define whether 20/60-session sector evidence is reused for market benchmarks, how `unknown` is represented, or whether benchmark rows are duplicated. The possible implementations have different row counts, ordering and roots, and straightforward duplication exceeds the bound. `SCR-013` covers 40,000 percentile rows but not aggregate/benchmark evidence conservation or overflow.

Required repair: define one stored benchmark-evidence representation, reuse rule, identity, ordering, conservation equation and constructible maximum including `unknown`; synchronize manifest bounds and exact maximum/overflow/hash acceptance.

### ARC3-002 — Blinded link-audit assignment cannot be semantically labeled

The stored sample binds token, offsets, engine link/outcome and symbol, but the exact assignment response exposes only opaque `evidenceRef`, sample identity and label state. There is no dereference route. A reviewer therefore cannot see bounded mention context, token/offsets or the engine decision needed to choose `canonicalSymbol|noLink`. Existing cases test state/blinding but not operability.

Required repair: define a bounded immutable sample-hash-bound reviewer evidence projection or exact dereference protocol with the minimum context and engine decision required to label, while keeping other reviewers' labels blinded and raw text absent from public output; add exact payload, operability and leakage acceptance.

### ARC3-003 — The deterministic UUIDv5 helper conflicts with the exact private-helper catalog

The job graph and migration require exactly two named private successor helpers. The UUID preimage section separately says the migration supplies an unnamed private deterministic UUIDv5 helper with no client grant. PostgreSQL has no universally assumed matching built-in, so an implementation must either violate the exact two-helper catalog or invent an ungoverned dependency/function.

Required repair: prescribe an exact inline or approved-extension UUIDv5 operation that adds no V3 helper, or enumerate the additional helper with exact name/signature/owner/search path/privileges and dependency preflight, updating all helper-count acceptance.

### ARC3-004 — Deployment and migration rollback are unspecified

The rollout order and shadow isolation are defined, but the active corpus has no operational rollback contract for schema application, application deployment, worker/scheduler enablement, shadow projection or a future promotion. Disabled-state semantics, lease draining, scheduler/worker shutdown order, additive-object retention, verification and re-enable order are unspecified.

Required repair: define an exact rollback DAG with triggers, ordering, lease handling, additive-object policy, legacy verification, re-enable sequence and interruption fixtures for every boundary.

## Gate state

Requirements Gate Round 37 remains a valid PASS for H's unchanged active artifacts, but the four architecture blockers invalidate implementation readiness. Sol must amend the active corpus, obtain a brand-new Requirements Gate PASS, then use a different fresh Sol session for the next Architecture Gate. No Terra task, application code, migration, merge, push, deployment, scheduler enablement, homepage promotion or model influence is authorized.
