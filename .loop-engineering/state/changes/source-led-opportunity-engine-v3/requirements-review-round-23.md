# Fresh Sol Requirements Gate — Round 23

## Verdict

**CHANGES_REQUIRED**

- P0: **0**
- P1: **7**
- P2: **0**

The material Architecture Round 2 repair is not yet a self-consistent executable requirements contract. RLS/owner semantics and inventory structure are closed, but bootstrap, dependency ordering, completion counts, outcome maturity storage, mover-audit creation, observation trace bytes and worker-wire behavior require amendment.

## Frozen Evidence

- Repository: `/Users/kaerchen/Desktop/20_stock/StockInsider-source-led-v3`
- Branch: `codex/source-led-opportunity-engine-v3`
- Reviewer session: `019f780b-a764-71a2-a34e-854afa77727f`
- Model/reasoning: `gpt-5.6-sol`, `xhigh`
- Baseline and exact merge base: `12c131aa50ca53268878e9f025973533ac100c49`
- Reviewed HEAD: `e16583c1f49d010d227235c527cff3b76c81e73d`
- Required range: `12c131aa50ca53268878e9f025973533ac100c49..e16583c1f49d010d227235c527cff3b76c81e73d`
- Range size: 20 commits, 62 changed files and 4,399 additions
- Reviewer token usage: 316,484

Before and after review, HEAD and merge base were unchanged; staged, unstaged and untracked counts were zero. The reviewer inspected all 62 changed artifacts and performed only static repository inspection. It ran no implementation tests, build or lint; edited no file; accessed no production service; applied no migration; and performed no merge, push or deployment.

## Findings

### P1 — Deterministic bootstrap is absent from the successor interface

`job-graph-contract.md` permits `enqueue_next_opportunity_job_v3_internal(run_id,predecessor_job_id)` only for a terminal predecessor, but `begin_opportunity_run_v3` must atomically create the first manifest header and payload. No null predecessor, sentinel, overload or separate bootstrap branch exists.

Required repair: define the exact bootstrap signature/branch, permitted run state, first plan descriptor, canonical payload/hash, lock/idempotency behavior and invalid/concurrent outcomes. Extend `OPS-028` across every bootstrap branch.

### P1 — The enrichment manifest plan is not topological

The current plan builds `candidate_financial` before `sector_valuation_reference`, although the candidate-financial header binds that reference hash. It builds `market_reference` before `mover_price_reference`, although the market-reference dependency manifest binds the complete mover-price identity/hash.

Required repair: publish one acyclic order with sector valuation before candidate financial and mover price before market reference; bind exact ordinals/descriptors/hashes and interruption/replay coverage in `OPS-019` and `OPS-028`.

### P1 — Deep-batch counts contradict mixed failure semantics

Failed deep candidates correctly carry null score rows and one failure code, and only successful candidates contribute score snapshots, but the count contract requires `score_snapshot_count = 3*candidate_count`. A mixed batch cannot satisfy all three requirements.

Required repair: separate candidate/success/failure counts, require score snapshots to equal three times successful candidates, define database recomputation/constraints and cover mixed results in `MIG-004` and `OPS-015`.

### P1 — Four outcome maturities use a three-value scoring horizon

R11 and the evaluation contract require 20/60/120/250-session outcome observations. The stored `opportunity_horizon_v3` has only three lane values and is reused for maturity, so 120 and 250 sessions cannot be represented independently.

Required repair: add one separate closed four-value outcome-maturity type and propagate it through manifests, payloads, normalized storage, constraints, RPCs, evaluation and `OUT-004`.

### P1 — No exact pre-seal mover-audit writer exists

Requirements demand an immutable mover-audit snapshot and selected audit/root identity. Tables exist, but neither the closed RPC catalog nor job output kinds/bodies owns deterministic audit creation.

Required repair: assign a sole existing writer without expanding the public RPC catalog, or version an explicitly approved catalog change; define canonical input, deterministic audit ID, atomic mover-root/successor relationship, collision/replay rules and immutable pending-to-matured semantics. Add creation/crash/replay/collision acceptance.

### P1 — `OPS-014` contradicts observation manifest tuples

`OPS-014` says each input tuple binds database `recordedAt`, while exact factor, market-reference, mover-price, sector evidence and benchmark tuples omit it even though selection requires database knowledge-time eligibility.

Required repair: either narrow the oracle to database cutoff filtering, or include `recordedAt` in every affected canonical tuple, ordering and hash preimage. The repair must leave one unambiguous byte-identity rule.

### P1 — Worker-wire failure positions and acceptance are incomplete

The route specifies nominal responses and client rejection before claim, but not remote 401/403 rejection during stage/complete/fail after a committed claim. Exact HTTP response, call count, staging durability, lease effect and precedence are missing, and no canonical case proves all 200/202/204/403/409/422/500/503 response bytes and headers.

Required repair: close every rejection position and exact status/body/content type/cache/call/write/lease/staging outcome and precedence. Add dedicated canonical worker-wire acceptance covering every branch.

## Independently Confirmed Closed

- All current normative version identities agree: `opportunity-job-graph-v3.0`, `opportunity-postgres-types-v3.3`, `opportunity-storage-v3.2`, `opportunity-manifest-storage-v3.1` and `opportunity-runtime-v3.1`.
- The enabled/non-forced RLS model is coherent: the NOLOGIN/NOBYPASSRLS function owner can operate owned relations; the separately owned binding relation exposes only the one owner SELECT policy; `service_role` has the closed SELECT/EXECUTE surface, BYPASSRLS preflight and no table DML.
- The reviewed range contains only the constitution plus Loop change artifacts; implementation remains unstarted.

## Acceptance Inventory Validation

- Version: `1.22.0`
- Declared / actual / unique: `193 / 193 / 193`
- Duplicate, malformed, empty, extra-field, invalid-ID or invalid-layer records: `0`
- Exact ordered five-field records: `193`
- Semantic skip/TODO cases: `0`
- Requirement labels cover R1–R11 and Safety.
- Semantic one-to-one traceability: **failed** for the seven findings above.

## Gate Consequence

Architecture Gate may not start. Sol must repair the seven findings, version the affected contracts/inventory, then submit the complete immutable range to another fresh Requirements Gate. A material repair resets no earlier historical review, authorizes no implementation and cannot be reviewed by the editing session.
