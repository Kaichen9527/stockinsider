# Requirements Gate Round 40

## Formal verdict

**CHANGES_REQUIRED**

| Severity | Count |
|---|---:|
| P0 | 0 |
| P1 | 5 |
| P2 | 0 |

Architecture Gate Round 5 and implementation remain locked. The original Architecture Round 4 finding `ARC4-001` is closed as stated because an active runner owner now exists, but that owner is not yet complete enough for deterministic implementation.

## Immutable boundary evidence

- Baseline B: `12c131aa50ca53268878e9f025973533ac100c49`.
- Direct parent P: `ae9fbd868237a620191d515bd0ce48df0152c996`.
- Review H: `0da2ec3dd06af29159c24175992ae569299e1ddd`; sole parent P.
- H root tree: `5fb01bbd95c492ced9ab04e952a9a3c1820db68f`.
- H change subtree: `9d9b1fef46d768ffe7d40528a77c5547168f1029`.
- Reviewer session: `019f7b79-eae2-7853-8361-84ea66d0372a`, fresh `gpt-5.6-sol` at xhigh reasoning, read-only, approval never and ephemeral, with user config/rules, web, apps, plugins, hooks, MCP, multi-agent, browser/computer use, shell snapshot, skill dependency installation and tool suggestions disabled.
- B..H contains 54 first-parent commits and zero merges. P..H is exactly 14 files in the approved change directory: 12 modified plus new `architecture-review-round-4.md` and `model-runner-contract.md`. No App, migration, runner implementation, executable test, policy, secret or production path changed.

## Mechanical evidence

| Check | Result |
|---|---|
| Target subtree | 83 files / 1,140,158 bytes |
| Active corpus | 33 artifacts / 788,503 bytes |
| Relative blob-map digest | `743b38ec1eb6c5a35798e7d1d4accc46a8c3a2a83113416b0004edfcff28104f` |
| Framed full-content digest | `22891a0363151cb41f46377407f07774a8f756934ebca1a2ea77775a6694095d` |
| Acceptance | `1.32.0`; declared/JSON/unique/Markdown/Markdown-unique all 246; exact five-field order parity |
| Acceptance ID digest | `d0a4b2fddd4b943caa051be0a7b609529b84b8e26cb1fccf2497528c67398561` |
| Five-field JSON-line digest | `3098692a60a05d27cf254a615009bffdf93740a55916bc9be4f423c6f88018ac` |
| Runner identity | 13 unique ASCII-sorted members / 596 bytes / `4179c04e52b14f0d8ab0a5fcc7638e11f399262db95e09876da76d44866a784e` |
| Runtime identity | 36 unique ASCII-sorted members; only acceptance version advanced |
| Structural catalogs | 19 manifest kinds, 11 adapters, 7 authority families, 31 public RPCs, 2 private helpers |

All `MR3-001` through `MR3-015` cases occur exactly once in both mirrors and in identical order. Coverage is R1=34, R2=20, R3=14, R4=12, R5=17, R6=21, R7=18, R8=25, R9=18, R10=24, R11=47 and Safety=109, with zero unknown labels. The 27 active version owners have no stale recognized edge or active `1.31.0` literal. Canonical taxonomy, both market allowlist digests and all three UUIDv5 vectors reproduce.

## P1 findings

### R40-001 — CLI, manifest, routing and status authority is incomplete

`model-runner-contract.md` defines CLI grammar and exits but not an exact V3 manifest schema, task/role/model routing, strategy/waiver semantics, status response/state transitions, durable path layout, complete failure mapping, `run` to `make`, or transaction/resource journal protocol. Request members also lack complete types and limits, and no acceptance case proves V1/V2 history is immutable across every V3 command.

### R40-002 — Source-view and prompt-file authority is contradictory

The exclusion categories are not exhaustive, `promptFiles` can currently reintroduce control or secret classes that the zero-injection boundary says are never included, and the source identity's `mode` has no unique original-versus-materialized meaning. Selector grammar, path aliases, view bounds and prompt count/byte limits also need one canonical oracle.

### R40-003 — Scratch ancestry and descendant FD isolation are incomplete

Requiring scratch and every absolute ancestor to be invoking-UID-owned mode `0700` is impossible on macOS because `/` and system ancestors are outside that boundary. The child environment rule also does not prove that auth/config/transport descriptors opened later by Codex cannot reach model-command descendants.

### R40-004 — Executable and codesign pins lack an immutable oracle

There is no absolute Node path, and the unnamed contract fixture has no active schema, digest, approval source or graph identity. Node/Git/Codex realpath, stat, SHA-256 and Codex bundle/team/designated-requirement checks therefore cannot be implemented without selecting new values.

### R40-005 — Result protocol and Git publication are underspecified

The accepted JSONL event catalog, task deadline, result member limits and valid operation/status matrix are absent. Deterministic commit tree/preimage, actor/timestamps/message, ref namespace/CAS and exact restart journal states are also absent, so multiple byte-different implementations could pass the prose.

## Prior architecture findings

- `ARC4-001`: closed as originally stated; replacement completeness findings are R40-001 through R40-005.
- `ARC3-001`: closed with bounded sector evidence and `SCR-014`.
- `ARC3-002`: closed with sample-bound blinded review evidence and `EVAL-014`.
- `ARC3-003`: closed with inline UUIDv5 and the exact two-helper catalog through `MIG-005`.
- `ARC3-004`: closed with the rollback/drain/re-enable DAG and `OPS-040`.

## Required next action

Sol must repair all five P1 families, add mirrored acceptance for every new boundary, and advance affected runner/fixture/acceptance identities consistently. A brand-new fresh Sol Requirements Gate is mandatory before a different fresh Sol may perform Architecture Gate Round 5. No implementation action is authorized.
