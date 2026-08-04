# Requirements Gate Round 36

## Formal verdict

**CHANGES_REQUIRED**

| Severity | Count |
|---|---:|
| P0 | 0 |
| P1 | 1 |
| P2 | 0 |

Architecture Gate remains locked because policy permits no P0 or P1 finding.

## Immutable review evidence

- Baseline: `12c131aa50ca53268878e9f025973533ac100c49`.
- Review head: `d8f7cb925bd2f0a125c888ffc5befc637c6abb41`.
- Direct parent: `03402a08387207806c513f0cdf9e0025661dd02c`.
- Review tree: `60762344d496ccf79115e93a3198bc394141910e`.
- Change subtree: `f377e25e34cf8c13409c1629e249da0f6f40a87f`.
- Reviewer session: `019f7a7a-3365-7242-b2eb-dc3ce00c184d`, fresh `gpt-5.6-sol` at xhigh reasoning, read-only, approval never, ephemeral, user config/rules and web disabled.
- `/usr/bin/git` 2.50.1 read immutable objects only. The slow first-parent traversal was polled beyond 180 seconds and proved the baseline is reached after exactly 45 parent edges.
- Baseline-to-head scope is exactly 77 added paths: 76 change-state blobs and the approved `.specify/memory/constitution.md`. No path escaped that scope and no modification/deletion exists.
- Parent-to-head scope is exactly the five Round 35 evidence files: `decision-log.md`, `gate-summary.md`, `requirements-review-round-35.md`, `status.json`, and `tasks.md`.

Round 35's infrastructure-only object-read failure is closed: Round 36 successfully read the commit, trees, governance, every active contract, both acceptance artifacts, and all required catalogs/hashes. Round 34's owner-rights worker view is also closed and PostgreSQL-constructible: the sole worker view is owner-rights and a barrier, direct registry SELECT remains withheld, and the registry branches remain exact job/input/read-kind bounded projections.

## P1 finding

### P1-1 — Canonical GOV-004 names storage v3.10 while every active owner names v3.11

- `acceptance-tests.json` case `GOV-004` expects storage `v3.10`.
- The exact Markdown mirror repeats storage `v3.10`.
- `storage-schema-contract.md` owns `opportunity-storage-v3.11`.
- `design.md`, the runtime static identity tuple, `OPS-009`, and `MIG-004` all require `opportunity-storage-v3.11`.

An implementation cannot satisfy both forms. The approved canonical `GOV-004` expectation and its Markdown mirror must name storage `v3.11`; no stale active v3.10 reference may remain. This is an oracle correction to the already-approved active owner, not a change to test behavior or acceptance coverage.

## Independent global checks

| Check | Result |
|---|---|
| Active GOV-004 catalog | 32 immutable artifacts |
| Active catalog serialization hash | `ba643f39aa118dbc60908bf66ad47b55d7561dcc06443c9f204d4f33ac0c4d49` |
| Full 76-blob subtree catalog hash | `3f0d0359b8b1bb7bc69f6e381542640cc4b5e034594480ee962e81cf6f50745f` |
| Acceptance inventory | `1.30.0`; declared, actual, and unique counts all 227 |
| JSON/Markdown mirror | Exact five-field and order parity; hash `f7b650fd0c5dd2f978f18a06d0396fdf18a10cf3d9c9d7ad4443148c1f4fc6ac` |
| Requirement traceability | R1-R11 all covered; Safety has 90 cases |
| Runtime static identity | 36 unique strict-ASCII members; storage/types both v3.11 |
| Manifest catalog | 19 exact kinds; owner/type order hashes agree |
| Source adapters | 11 exact keys; source matrix/adapter hashes agree |
| Authority families | Seven exact bounded families |
| PostgreSQL RPC catalog | 31 public functions; two private helpers excluded |
| HTTP route catalogs | 6 control, 1 worker, 7 runner-ingestion, 11 human-authority |
| Provider-field preimage | 1,645 bytes; `fe78e0f8c5b0846f822f72c6b2356cac35ed5c00dd0bcd06f9a75b7c5b21d3f7` |
| Price/action preimage | 313 bytes; `48fa54ee9f0e3a0b888ac0dc17eda8ad5bb746106a6fe4395eb50a5865e4e44e` |
| Taxonomy | 32 codes/32 sectors plus `unknown`; hash `6b28d85903d7a410eef29386de011c71aa789dc0ce3231df38cb4e085181060c` |
| Active storage v3.10 references | Exactly two: canonical GOV-004 and its Markdown mirror |
| Promotion lock | Legacy evaluation inputs/metrics null and `promotionAllowed=false` |

The reviewer found no additional contradiction in candidate discovery, point-in-time authorities, finite resource bounds, canonical identity, PostgreSQL schema/RLS/grants, manifest/job transactions, scoring/valuation/decision/portfolio rules, model influence, or legacy/public/detail isolation.

## Final gate state

**CHANGES_REQUIRED — P0=0, P1=1, P2=0.** Architecture, implementation, migration, merge, push, deployment, production action, and model influence remain unauthorized. After the two mirrored storage literals are corrected, a brand-new Requirements Gate must review a new immutable head before Architecture review may start.
