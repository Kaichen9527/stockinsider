# Requirements Gate Round 34

## Formal verdict

**CHANGES_REQUIRED**

| Severity | Count |
|---|---:|
| P0 | 0 |
| P1 | 1 |
| P2 | 0 |

The zero-blocker/high threshold in `.loop-engineering/policy.yaml` is not met. Architecture Gate remains locked and implementation is not authorized.

## Immutable review evidence

- Reviewer session: `019f7a4f-542b-7fd3-9214-53c38f8da330`
- Baseline: `12c131aa50ca53268878e9f025973533ac100c49`
- Review commit: `5d9423126483fe38d7912db893215fcc33fcf330`
- Direct parent: `e18bc729b631a620b783dcd44bfdc7645d036dca`
- HEAD tree: `591987c24afdafd3ced99f24ad1bdd9c474a4261`
- Change subtree: `5666f67a62572754d7bb150056a5afa51efb2cc2`, 74 blobs
- Parent-to-HEAD modifies exactly nine active-change files. Baseline-to-HEAD contains exactly the 74 change-subtree blobs plus `.specify/memory/constitution.md`, with no escaped path or non-addition status.
- GOV-004 mechanically resolves 32 active normative artifacts.

The fresh Sol reviewer used immutable read-only Git object reads, no network, no worktree bytes, no repository code, no tests/builds and no mutable state. It opened only Requirements Round 33 as prior-review evidence.

## Prior-round closure

Round 33's PostgreSQL ACL/RLS constructibility defect is technically repaired in `storage-schema-contract.md`: the sole `opportunity_worker_read_units_v3` view is owned by `opportunity_v3_rpc_owner`, has `security_barrier=true` and `security_invoker=false`; `service_role` retains no direct registry `SELECT`. Owner rights over owner-held, RLS-enabled but non-FORCE registry relations make the bounded projection constructible without another read surface.

The closure is not global because one active sentence in `job-graph-contract.md` still calls the same view security-invoker.

## P1 finding

### P1-1 — The sole worker read view has mutually exclusive normative privilege modes

`job-graph-contract.md` requires a security-invoker barrier view, while `storage-schema-contract.md` requires the same named view to be `security_invoker=false` and relies on its owner rights because the two registry tables deliberately withhold direct `service_role` SELECT. PostgreSQL cannot satisfy both reloptions.

Choosing invoker mode reproduces Round 33's missing-table-ACL failure. Choosing owner-rights mode is constructible but violates the active job-graph requirement. There is no alternate RPC, view, table grant, route or worker read sequence, and canonical `MIG-004` requires agreement with both owners.

The repair must make design, job graph, storage and acceptance state one exact owner/reloptions model while preserving: no direct registry grant; no alternate surface; exact job/input/read-kind binding; registry access only under closed manifest-page branches; indexed sentinels; and existing byte caps.

## Independent mechanical checks

| Check | Recomputed result |
|---|---|
| Acceptance inventory | `1.30.0`; 227 declared/actual/unique cases |
| Markdown mirror | 227 unique rows; exact five-field/order parity |
| Runtime static identity | 36 unique ASCII-sorted members; storage/types both v3.11 |
| Manifest catalog | 19 kinds in exact PostgreSQL enum order |
| RPC catalog | 31 unique functions matching all exact signatures |
| Route catalogs | 6 control, 1 worker, 7 runner-ingestion and 11 human-authority routes |
| Provider preimage | 18 rows; 1,645 bytes; `fe78e0f8c5b0846f822f72c6b2356cac35ed5c00dd0bcd06f9a75b7c5b21d3f7` |
| Price/action preimage | 2 rows; 313 bytes; `48fa54ee9f0e3a0b888ac0dc17eda8ad5bb746106a6fe4395eb50a5865e4e44e` |
| Storage drift | Zero active v3.10 references; owner/design/runtime/acceptance use v3.11 |

Apart from P1-1, the reviewer found source-led authority, all finite bounds, point-in-time correction semantics, market/action reconstruction, durable job effects, schema/RLS/grants, research/action/valuation separation, public/detail/legacy isolation, evaluation/model boundaries and acceptance traceability mutually consistent. No independent P0 or P2 was found.

## Formal verdict

**CHANGES_REQUIRED — P0=0, P1=1, P2=0.**

Architecture Gate and implementation remain unauthorized.
