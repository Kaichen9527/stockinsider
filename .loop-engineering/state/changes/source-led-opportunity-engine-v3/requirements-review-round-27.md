# Loop Engineering Requirements Gate — Round 27

## Verdict

**CHANGES_REQUIRED**

- P0: **0**
- P1: **6**
- P2: **0**
- Architecture Gate performed: **No**

## Frozen evidence

- Repository: `/Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3`
- Branch: `codex/source-led-opportunity-engine-v3`
- Reviewer session: `019f78bb-2f11-7f01-92aa-369f43051891`
- Reviewer/model: fresh independent Requirements Gate, `gpt-5.6-sol`
- Reasoning effort: `xhigh`
- Baseline and merge base: `12c131aa50ca53268878e9f025973533ac100c49`
- Reviewed HEAD: `67ec0ea96e08671e4ffd5f9abe15cdd0c3f75c41`
- Reviewed range: `12c131aa50ca53268878e9f025973533ac100c49..67ec0ea96e08671e4ffd5f9abe15cdd0c3f75c41`
- Range size: 28 commits, 68 added files and 5,277 insertions.
- Reviewer usage: 10,363,423 input tokens, 28,766 output tokens and 14,013 reasoning-output tokens.
- The reviewer independently re-audited all change artifacts and relevant Loop policy/instructions. Prior reviews were history only.
- Review was static and read-only. It performed no Architecture Gate, implementation, migration, test, build, lint, network access, edit, merge, push, deployment or production action.
- Scoped worktree state matched the reviewed HEAD.

PASS requires `P0=0` and `P1=0`; this round therefore blocks Architecture Gate.

## Findings

### P1 — Caller-bound binding rejections have conflicting identities

Storage and runtime require every missing, inactive, ambiguous or conflicting caller binding to return only `PT403/principal_role_unavailable`. Authentication instead assigns those failures `authentication_rejected/PT403`, including blinded assignment and submission paths, contradicting `AUTH-006`.

Affected authorities: `storage-schema-contract.md:65`, `runtime-transaction-contract.md:114`, `auth-principal-contract.md:78`, `auth-principal-contract.md:144`, `postgres-type-contract.md:36`, `acceptance-tests.md:263`.

Required repair: use database failure identity `PT403/principal_role_unavailable` for every caller-bound RPC. Specify route-layer mapping separately to the public `authentication_rejected` envelope without changing or exposing the database identity.

### P1 — Empty or immature shadow evaluation conflicts with the exact 120-backtest manifest

Runtime and design treat empty or not-yet-mature inputs as valid manifest evidence, while manifest and evaluation contracts require exactly 120 backtests and fail below 120. `OPS-035` requires the empty and immature branches.

Affected authorities: `design.md:208`, `runtime-transaction-contract.md:116`, `manifest-storage-contract.md:30`, `shadow-evaluation-contract.md:22`, `acceptance-tests.md:262`.

Required repair: choose one terminal behavior. Either permit complete partial manifests with actual `0..120` counts while promotion remains gated on exactly 120, or make empty/immature runs fail and remove valid-manifest wording. Align job, header, manifest, failure and acceptance contracts.

### P1 — Database-owned key preimages are not byte-exact

Comparison, preparation and final logical keys describe SHA-256 over canonical JSON containing lists of values but do not fix exact tagged object/tuple schemas, member names, null handling or normalized cutoff encoding.

Affected authorities: `runtime-transaction-contract.md:120`, `data-contract.md:228`, `design.md:210`.

Required repair: define exact RFC 8785 preimage schemas for all three keys, including tags, field names, encodings, purpose/mode inputs and static versions. Add golden preimage/hash and one-field-mutation acceptance cases.

### P1 — Enrich source-run selection is ambiguous across purposes

Ad-hoc, production-shadow and backtest source scans can validly share cutoff, manifests and versions because purpose participates in preparation/final identity. Enrich selection omits purpose, so legitimate cross-purpose scans can become `multiple_source_runs`.

Affected authorities: `postgres-type-contract.md:55`, `runtime-transaction-contract.md:120`, `design.md:206`, `control-plane-contract.md:13`.

Required repair: define exact purpose compatibility for enrich selection, normally same-purpose, or explicitly make source-scan identity purpose-independent. Add a cross-purpose collision acceptance case.

### P1 — Exactly three calendar indexes is not constructible as written

The table also requires a primary key and uniqueness constraint, both backed by PostgreSQL indexes, while the contracts and `CAL-004` describe the complete catalog as exactly the three named supporting indexes.

Affected authorities: `storage-schema-contract.md:79`, `trading-calendar-contract.md:22`, `acceptance-tests.md:264`.

Required repair: say exactly three non-constraint supporting indexes and filter constraint-backed indexes in `CAL-004`, or list the entire catalog including constraint backing indexes. Preserve the three supporting shapes and bounded-plan oracle.

### P1 — Label-outcome begin selection lacks a bounded input sentinel

Begin selects every eligible enrich run/snapshot before durable bootstrap, but only the later manifest limits combined terminal identities to 20,000. Historical ad-hoc/backtest rows can therefore cause unbounded pre-bootstrap selection and key construction.

Affected authorities: `runtime-transaction-contract.md:116`, `manifest-storage-contract.md:29`, `shadow-evaluation-contract.md:26`.

Required repair: require indexed `LIMIT bound+1` or an equivalent bounded aggregate sentinel during begin before any durable write. Define the exact overflow identity and bound/bound+1 acceptance cases.

## Independently confirmed closures

- Begin has one exact non-overloaded five-argument signature, and the control plane supplies only those arguments.
- Global lineage → preparation → run lock order and atomic bootstrap are specified.
- Source-scan empty, enrich zero/one/multiple, label empty/nonempty and shadow empty/immature/duplicate-canonical branches are textually present; Findings 2–4 prevent a consistent oracle.
- Point-in-time authority, source-led bounded scope, additive/shadow-only operation and prohibition on predecessor recommendation/strategy/alert writes are preserved.
- Interface catalogs remain mechanically closed and unique at 31 RPC names and 19 manifest kinds.
- The reviewed range contains documentation/state artifacts only, with no implementation or migration changes.

## Acceptance inventory

- Version: `1.26.0`
- JSON declared/actual/unique: `207/207/207`
- Markdown cases: `207`
- JSON ↔ Markdown ordered five-field mirror: `207/207` exact matches

The inventory is mechanically complete, but `AUTH-006`, `OPS-035` and `CAL-004` conflict with normative contracts, while Findings 3, 4 and 6 lack executable oracle coverage.

## Gate consequence

Architecture Gate remains locked. Sol must repair all six P1 findings, persist the material requirements amendment and submit the complete immutable range to another brand-new Requirements Gate. This verdict authorizes no implementation, migration, production binding, scheduler, merge, push or deployment.
