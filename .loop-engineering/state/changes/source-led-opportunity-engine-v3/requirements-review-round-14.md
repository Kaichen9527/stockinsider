# Requirements Gate Review — Round 14

- Reviewer: fresh independent `gpt-5.6-sol`, `xhigh`, read-only session
- Reviewer session: `019f7710-4c10-7ab0-8e08-2c20f4254a5c`
- Date: 2026-07-19 (Asia/Taipei)
- Reviewed range: `12c131aa50ca53268878e9f025973533ac100c49..952deeb28aba383de8b176910b3011b0611516d9`
- Verdict: `CHANGES_REQUIRED`
- Counts: `P0=0 P1=2 P2=1`
- Worktree at review: clean
- Architecture Gate performed: no

## Findings

1. **P1 — The universal manifest protocol still lacks executable native-row authority for several potentially large kinds.** `manifest-storage-contract.md:5-9` delegates exact native tuples, eligibility, ordering and conservation to domain contracts. However, `design.md:199` uses an undefined `inputFamily` enum/order and unspecified closed exclusion/conservation shapes for `market_reference`, then defines `outcome_input` and `evaluation_input` only by “similarly” storing inputs. `manifest-storage-contract.md:26-30` supplies section names and bounds but not those missing native records. Likewise, `shadow-evaluation-contract.md:61` does not define the exact `strata`/`samples` payloads or `sampleId` derivation for `link_audit_sample`. Separately, `storage-schema-contract.md:111` requires a mover-audit `price_manifest_id`, but the closed kind table in `manifest-storage-contract.md:13-30` assigns no manifest kind/version or required target kind to that full-roster price authority. Consequently OPS-019 cannot independently construct every expected row/root, prove that the mover FK references the correct universal root, or exclude implementation-selected enums, tuples and hashes. Round 13’s universal-manifest closure is incomplete.
2. **P1 — The “exact additive DDL” and minimum-RPC authority remain under-specified outside the repaired manifest/link-audit seam.** `storage-schema-contract.md:12` says all FKs are explicit, while `design.md:189` requires child rows to be bound to their owning runs. Yet `storage-schema-contract.md:57` names peer relationship “FKs” without targets, `:115` leaves `upstream_run_id` and `supersedes_run_id` without declared self-FKs, and `:119` lists run/input/manifest/job relationships without their required FK targets or deletion actions. Principal IDs are called FKs despite authority living in the secret mapping and no referenced principal relation being declared. Moreover, `storage-schema-contract.md:9,13` requires writes through named RPCs and exact grants, but the exact RPC inventory in `runtime-transaction-contract.md:31-86` covers orchestration/manifests, while source-identity, publisher, peer, alias and valuation authority-write RPC names/signatures remain unstated. `MIG-002` cannot assert every required FK/grant against one unambiguous catalog. The repaired `building -> complete|failed` lifecycle, generic sector kinds and composite link-audit FK are valid, but they do not close the complete DDL authority claimed by `storage-schema-contract.md:205`.
3. **P2 — Assistive-artifact registration and bounded public selection are not deterministic.** `requirements.md:193-196` requires artifact hash, license, training cutoff, out-of-sample metrics and comparison baseline registration. `design.md:187` mentions only hash/license/cutoff/evaluation-manifest extensions, without an exact registration identity or comparison-baseline schema. `data-contract.md:168-175,194` permits up to three public artifacts but defines no selection, ordering or duplicate rule when more than three qualify. MOD-002 covers only one artifact, so it cannot detect arbitrary database-order truncation or incomplete registration evidence. Influence remains correctly fixed to `none`, but the public canonical bytes and registration seam are not executable as written.

## Independently Confirmed Closed

- Round 13’s `createdAt` boundary is now exact: API-019 covers attempts created at C−1, C and C+1 after all work terminates, including equality, invisibility, precedence, warning visibility and stored-success byte preservation.
- The universal physical row/page/root algorithm itself is closed: exact RFC 8785 identities, page/root preimages, page bounds, interruption resume and `building -> complete|failed` lifecycle are defined in `manifest-storage-contract.md`.
- The specific Round 13 schema repairs are present: only three generic manifest relations exist, sector manifests are logical kinds, terminal immutability is explicit, and link-audit labels use the valid composite `(sample_manifest_id,sample_id)` FK.
- Round 12’s historical status/warning reconstruction and strict valuation-verification C−1/C/C+1 expiry boundary remain closed.
- Round 11’s eleven-key adapter registry, revision-family collapse, static-versus-point-in-time policy hashes, separate alias principals, prepare/seal convergence, bounded valuation approval selection, warning authority and exact three-horizon detail isolation remain closed.
- Architecture Round 1’s immutable pre-truncation revisions, database knowledge time, signed principals, service-role fail-closed behavior, durable bounded jobs, crash recovery and no-legacy-refresh V3 detail boundary remain intact.
- Discovery remains source-led and bounded. Full-market work is shallow context/reference/audit only; V3 is shadow/research-only, cannot weaken legacy publication behavior, writes no recommendation/strategy/alert state, and grants no model, migration or deployment influence.

## Inventory Validation

- Canonical version: `1.13.0`
- Declared/actual/unique cases: `170/170/170`
- Structurally complete records: `170`
- Exact ordered five-field records: `170`
- Duplicate, malformed, empty or non-string records: `0`
- Skip/todo semantics: none; the only textual occurrence is GOV-001’s prohibition against skipped/todo registrations.
- Version mirrors: consistent across `acceptance-tests.md`, `data-contract.md`, `v3-detail-contract.md`, `gate-summary.md` and current acceptance cases.
- API-019, OPS-019 and MIG-003 explicitly target the Round 13 repairs, but OPS-019/MIG-002 cannot provide semantic executable coverage for Findings 1-2 until the missing native manifest and catalog/RPC authorities are fixed.

## Governance

Implementation, migration, production mutation, merge, push, deploy, scheduler enablement and model influence remain unauthorized. Architecture Gate may not proceed until these findings are repaired and a fresh Requirements Gate returns `P0=0 P1=0 P2=0`.
