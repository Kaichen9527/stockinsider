# Requirements Gate Round 32

## Formal verdict

**CHANGES_REQUIRED**

| Severity | Count |
|---|---:|
| P0 | 0 |
| P1 | 1 |
| P2 | 0 |

The repository permits zero blocker or high findings. Requirements Gate therefore remains closed. Architecture Gate remains locked, and implementation remains unauthorized.

## Immutable review evidence

Review used `GIT_OPTIONAL_LOCKS=0`, `GIT_NO_LAZY_FETCH=1`, the explicit Git directory, and immutable Git objects only. No network, worktree content, files, refs, index, Loop state, or external resources were changed.

- Baseline: `12c131aa50ca53268878e9f025973533ac100c49`
- Review HEAD: `aa3d6a39b4dc20890eedca96389646e6c94763ae`
- HEAD tree: `c6066e03c1a9dbee63581465a8571e324092492e`
- Direct parent: `e7e70bf963915ab245dacfee44f04fb8886b1e7e`
- Merge-base: exactly the supplied baseline.
- Range shape: 38 commits ahead, zero behind, zero merges; all 38 commits have exactly one parent.
- Change subtree: `dd85fa91bf7f9dc38bb360e3c438d82dab8ad172`, containing 72 blobs.
- Baseline-to-HEAD boundary: 73 additions, zero modifications/deletions. Every path is either under `.loop-engineering/state/changes/source-led-opportunity-engine-v3/` or is `.specify/memory/constitution.md`; no path escapes that boundary.
- Parent-to-HEAD boundary: seven modifications only—`control-plane-contract.md`, `decision-log.md`, `design.md`, `gate-summary.md`, `shadow-evaluation-contract.md`, `status.json`, and `tasks.md`.
- Active normative graph: 32 artifacts, mechanically resolved from `design.md`.

Requirements rounds 1–30 and all Architecture reports were not opened. Round 31 alone was read for closure of its one P1.

## Prior-round closure

Round 31's sole P1 comprised two stale runtime-v3.8 edges. Both are closed at this HEAD:

- Control failure precedence now delegates to runtime v3.9: `control-plane-contract.md:L73`.
- Evaluation-lock derivation now delegates to runtime v3.9: `shadow-evaluation-contract.md:L14`.
- The owner header and static identity both specify `opportunity-runtime-v3.9`: `runtime-transaction-contract.md:L3,L140`.

No runtime-v3.8 reference remains in the active catalog. This closure was verified independently rather than inherited from Round 31.

## P1 finding

### P1-1 — Canonical mover acceptance semantics still require v3.2 roots while every owner requires v3.3

Three active acceptance cases prescribe v3.2 mover roots or audit identity:

1. `MKT-012` says the authority inputs drive “the v3.2 root/audit ID”: `acceptance-tests.md:L198`.
2. `MKT-014` requires “Each v3.2 root”: `acceptance-tests.md:L228`.
3. `MKT-015` explicitly interrupts around “each v3.2 mover root”: `acceptance-tests.md:L252`.

Their canonical JSON counterparts contain the same semantics at `acceptance-tests.json:L145,L175,L199`.

All owning authorities instead require v3.3:

- Manifest kind `mover_price_reference` has contract version `mover-audit-price-v3.3`: `manifest-storage-contract.md:L27`.
- The mover owner declares the same version: `market-contract.md:L153`.
- The runtime static identity binds `moverAuditPriceContractVersion` to `mover-audit-price-v3.3`: `runtime-transaction-contract.md:L134`.
- The deterministic audit UUID preimage uses `opportunity-mover-audit-v3.3`: `job-graph-contract.md:L108`.
- Manifest page and root preimages include `contractVersion`, so v3.2 and v3.3 are not interchangeable labels: `manifest-storage-contract.md:L50-L72`.

An executable test following the canonical inventory therefore cannot simultaneously reproduce the prescribed v3.2 root/audit identity and satisfy the v3.3 manifest, runtime identity and UUID preimage. JSON/Markdown parity faithfully mirrors the contradiction; it does not resolve it. This is a P1 executable-acceptance conflict, not editorial drift. `GOV-004` requires stale active references to fail.

## Independent mechanical checks

| Check | Recomputed result |
|---|---|
| Active normative catalog | 32 artifacts |
| Acceptance version/cases | `1.30.0`; declared 227; JSON actual 227; 227 unique IDs |
| Markdown inventory | 227 rows; 227 unique IDs |
| JSON/Markdown semantic parity | Zero field, order, or content mismatches across all 227 cases |
| Runtime static identity | Exactly 36 unique members; ASCII-name sorted; current runtime/storage/types/source/evaluation versions |
| Manifest catalog | Exactly 19 unique kinds |
| Public RPC catalog | Exactly 31 unique signatures; type enum, grants and contract catalog agree |
| Route catalog | 6 control + 1 worker + 7 runner-ingestion + 11 human routes |
| Provider allowlist preimage | 18 rows, 1,645 canonical bytes, SHA-256 `fe78e0f8c5b0846f822f72c6b2356cac35ed5c00dd0bcd06f9a75b7c5b21d3f7` |
| Price/action preimage | 2 exchange rows, 313 canonical bytes, SHA-256 `48fa54ee9f0e3a0b888ac0dc17eda8ad5bb746106a6fe4395eb50a5865e4e44e` |
| Version edges | Current owner roots agree except for the three v3.2 mover acceptance semantics above |

## Global consistency review

- The repaired observation-plane design inventory agrees with the storage schema.
- Source-dataset v3.3 design and owner agree on the exact connector-root and conservation tuples, bounds and equations.
- Begin, runner, non-blinded nonce, blinded rollback and worker durable-effect models are closed and non-contradictory.
- Source, authority, calendar, market, mover, valuation, label and evaluation work is finite, indexed and deterministically ordered.
- Point-in-time authority and immutable correction lineage remain fail-closed.
- Full-market work is limited to bounded context/reference/mover audit and cannot promote candidates; deep research remains source-led.
- RLS, ownership, service-role grants, registry isolation and the 31-RPC catalog agree.
- Job bootstrap, manifest sequencing, mover audit, post-seal successors, bounded reads, finalization and evaluation lineage are constructible and deterministic.

No additional P0, P1 or P2 findings were identified.
