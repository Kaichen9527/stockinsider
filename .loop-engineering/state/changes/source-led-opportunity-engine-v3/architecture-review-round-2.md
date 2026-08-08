# Sol Architecture Gate Report — Round 2

## Verdict

**CHANGES_REQUIRED**

- P0: **0**
- P1: **3**
- P2: **0**

Architecture Gate Round 2 fails because durable job creation, terminal storage typing, and the RLS/`SECURITY DEFINER` ownership model still require material implementation decisions.

## Frozen Evidence

- Repository: `/Users/kaerchen/Desktop/20_stock/StockInsider-source-led-v3`
- Branch: `codex/source-led-opportunity-engine-v3`
- Reviewer session: `019f77e3-b245-7e73-a417-2d066cb0c825`
- Model/reasoning: `gpt-5.6-sol`, `xhigh`
- Baseline and exact merge base: `12c131aa50ca53268878e9f025973533ac100c49`
- Reviewed HEAD: `7bafd590319d455902a82a59645f3eac3ebe3d47`
- Required range: `12c131aa50ca53268878e9f025973533ac100c49..7bafd590319d455902a82a59645f3eac3ebe3d47`
- Range size: 18 commits, 60 added files and 4,077 insertions
- Reviewer token usage: 297,141

Before and after review, branch, HEAD, merge base and range were identical. Staged, unstaged and untracked counts were all zero. The reviewer read every changed artifact plus the relevant baseline schema/auth/client surfaces and performed only static repository inspection.

## Findings

### P1 — The durable job graph has no constructible creation or payload protocol

The runtime requires header, variable-sized page, root, seal and post-seal jobs, and says a root job is created only after all expected pages succeed. Page boundaries depend on canonical byte size. The exhaustive 31-function RPC catalog nevertheless has no enqueue/create-next-job operation, and no existing function owns exact job-spawning side effects.

`claim_opportunity_job_v3` also returns `payload_ref uuid`, while the job schema defines only `payload_manifest_id`; no relation or rule defines a general payload reference for source parsing, candidate batches, projection, labeling or evaluation. The worker route has no exact request, success, no-job, retry or error wire contract.

Evidence:

- `runtime-transaction-contract.md:23,47,108,110`
- `manifest-storage-contract.md:48,78`
- `storage-schema-contract.md:134,228`
- `runtime-transaction-contract.md:13`

Required repair: define the exact job-DAG bootstrap/advance owner, atomic enqueue rules, persisted payload relation and schema, page continuation/end-of-section protocol, concurrency/idempotency rules, worker-route wire contract, and crash fixtures beginning before page-job creation.

### P1 — The claimed exact storage/type catalog remains incomplete

The PostgreSQL type contract claims sole authority for stored enums and staged completion shapes, but several terminal relations remain abbreviated column families:

- `opportunity_candidate_snapshots.shallow_status` and `deep_status` have no value catalog;
- run and manifest input roles point to an exact design table that never supplies literal role tokens;
- document/claim/mention outcomes, link modes, candidate states, horizons and several internal statuses lack named stored SQL types or exact `text CHECK` declarations;
- non-manifest `output_json` staging bundles lack exact canonical schemas for each `output_kind` even though completion must decode them into normalized rows.

Evidence:

- `postgres-type-contract.md:5,198`
- `storage-schema-contract.md:132,140,166`
- `design.md:203`

Required repair: provide exhaustive SQL column/type/nullability/check declarations for every normalized relation, every input-role token, and one canonical staging payload schema for every non-manifest output kind.

### P1 — RLS and `SECURITY DEFINER` ownership are internally inconsistent

The contracts require all mutation RPCs to be `SECURITY DEFINER`, `opportunity_v3_rpc_owner` to own functions and new relations, no permissive policy, and RLS to be enabled/forced. PostgreSQL `FORCE ROW LEVEL SECURITY` is table-wide and subjects the table owner to RLS. Therefore a forced table with no applicable policy prevents owner-executed security-definer functions from using the table. Omitting `FORCE` makes the owner-bypass design feasible but contradicts the current instruction.

Evidence:

- `runtime-transaction-contract.md:29`
- `storage-schema-contract.md:14,226,228`

Required repair: state exact `ENABLE`/`FORCE` DDL per relation, whether the RPC owner bypasses RLS, every owner policy if any, and catalog acceptance proving both denied direct access and successful security-definer operation.

## Architecture Round 1 Re-audit

- Immutable source revisions before legacy truncation: **closed**.
- Database knowledge time and cutoff semantics: **closed**.
- Additive constructible storage, migration, RLS and privileges: **open under Findings 2–3**.
- Durable transaction, crash recovery and bounded execution: **open under Finding 1**; the protocol is exact only after jobs exist.
- Authenticated principal authority and blinded isolation: **partially closed**; application/auth semantics are exact, but the database execution boundary remains open under Finding 3.
- Same-run V3 detail isolation: **closed**.
- Source-led rather than full-market-primary discovery: **closed**.
- Executable canonical acceptance coverage: **open for Findings 1–3**.

## Requirements Rounds 11–22 Re-audit

The reviewer independently reconfirmed the closed source-adapter registry, knowledge-time semantics, universal manifests, valuation expiry, historical projection, source/publisher/peer/principal authority, blinded state machine, financial `sourceTimestamp`, supersession, dual auth, dedicated client, eleven route catalog, family-specific failures, remote credential-rejection positions, publisher-policy lineage, shadow-only rollout, legacy isolation and zero model influence. Round 22 Requirements PASS is accurately recorded but does not resolve the three architecture constructibility findings.

## Acceptance Inventory Validation

Static validation passed:

- JSON parse: valid;
- version: `1.21.0`;
- declared / actual / unique IDs: `190 / 190 / 190`;
- exact ordered five-field records: 190;
- malformed, duplicate, empty, extra-field, invalid-ID or invalid-layer records: 0;
- semantic skip/todo outside `GOV-001`: 0;
- Markdown and public/detail version mirrors: consistent.

Semantic one-to-one validation fails. `OPS-015`, `OPS-017` and `OPS-019` assume a functioning resumable job/page graph without defining its creation protocol. `MIG-002`, `MIG-003` and `OPS-020` claim exact catalog/RLS assertions without supplying the missing stored types or resolving forced-RLS owner behavior.

## Read-Only Attestation

This review edited, generated, staged and committed nothing; ran no application code, tests, builds or lint; accessed no production service; applied no migration; and performed no merge, push or deployment.

Architecture PASS would not authorize implementation, migration, merge, push or deploy. This verdict is `CHANGES_REQUIRED`, so implementation remains unauthorized.
