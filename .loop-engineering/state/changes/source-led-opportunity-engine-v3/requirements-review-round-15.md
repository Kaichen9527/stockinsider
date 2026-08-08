# Requirements Gate Review — Round 15

- Reviewer: fresh independent Sol Requirements Gate reviewer
- Model: Codex, GPT-5 family; exact runtime model identifier not exposed
- Effort: not exposed
- Session: read-only; session identifier unavailable
- Date: 2026-07-19 (Asia/Taipei)
- Reviewed range: `12c131aa50ca53268878e9f025973533ac100c49..84048fa6b0abbb8bf43088e4346b8bc6c0337632`
- Architecture Gate performed: no
- Verdict: `CHANGES_REQUIRED`
- Counts: `P0=0 P1=3 P2=0`
- Worktree: clean; `HEAD` is exactly the reviewed endpoint

## Findings

1. **P1 — The closed RPC catalog and principal-enforcement boundary remain internally incomplete.**

   The artifact calls fourteen listed functions the only non-orchestration V3 write entry points, but `submit_link_audit_label_v3` is another non-orchestration write and appears outside that catalog without PostgreSQL argument types, closed `labelRole` values, return type, or exact reviewer/adjudicator branch semantics. `consume_internal_nonce_v3` and `get_link_audit_assignment_v3` likewise lack exact catalog signatures, despite the storage contract requiring every granted function to have one exact non-overloaded signature. See [auth-principal-contract.md:22](/Users/kaerchen/Desktop/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/auth-principal-contract.md:22), [auth-principal-contract.md:46](/Users/kaerchen/Desktop/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/auth-principal-contract.md:46), [auth-principal-contract.md:90](/Users/kaerchen/Desktop/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/auth-principal-contract.md:90), and [storage-schema-contract.md:221](/Users/kaerchen/Desktop/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/storage-schema-contract.md:221).

   Principal enforcement also conflicts across layers: roles exist only in the server-secret mapping, while RPCs receive a bare `callerPrincipal uuid`; nevertheless the storage contract requires role checks inside every RPC. No database-visible mapping, signed attestation, or other closed input lets those functions distinguish an authorized mapped principal from an arbitrary UUID supplied through `service_role`. See [auth-principal-contract.md:18](/Users/kaerchen/Desktop/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/auth-principal-contract.md:18), [auth-principal-contract.md:46](/Users/kaerchen/Desktop/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/auth-principal-contract.md:46), [storage-schema-contract.md:13](/Users/kaerchen/Desktop/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/storage-schema-contract.md:13), and [storage-schema-contract.md:221](/Users/kaerchen/Desktop/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/storage-schema-contract.md:221). `OPS-020` therefore lacks an executable oracle for the promised wrong-role and exact-signature checks.

2. **P1 — Assistive-artifact baseline matching still has no normative right-hand-side identity.**

   Registrations store arbitrary `comparisonBaselineKey text`; the trigger requires an evaluation manifest with “the same comparison key,” and available-run selection requires “matching `comparison_baseline_key`.” The artifacts never specify whether that value must equal the run’s `comparison_contract_key`, `evaluationDatasetLockHash`, legacy baseline-lock hash, or another versioned identity. `opportunity_runs` contains no `comparison_baseline_key` field. Different implementations can therefore select different artifacts and produce different public canonical bytes from identical rows.

   See [auth-principal-contract.md:75](/Users/kaerchen/Desktop/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/auth-principal-contract.md:75), [storage-schema-contract.md:68](/Users/kaerchen/Desktop/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/storage-schema-contract.md:68), [storage-schema-contract.md:70](/Users/kaerchen/Desktop/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/storage-schema-contract.md:70), [storage-schema-contract.md:125](/Users/kaerchen/Desktop/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/storage-schema-contract.md:125), and [shadow-evaluation-contract.md:14](/Users/kaerchen/Desktop/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/shadow-evaluation-contract.md:14). `MOD-004` mentions baseline mismatch but cannot determine which value is a match.

3. **P1 — The claimed exact additive DDL still leaves authority-column mappings to implementation convention.**

   The normative peer authority row and manifest use `supplierSymbol` and `customerSymbol`, while the write composite accepts stock IDs. The storage contract says the table “uses the R4 tuple” and separately adds `supplier_stock_id`/`customer_stock_id` FKs, without enumerating whether symbols are stored too or specifying the immutable roster-bound derivation used to create the manifest tuple. See [requirements.md:86](/Users/kaerchen/Desktop/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/requirements.md:86), [requirements.md:94](/Users/kaerchen/Desktop/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/requirements.md:94), [auth-principal-contract.md:73](/Users/kaerchen/Desktop/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/auth-principal-contract.md:73), and [storage-schema-contract.md:58](/Users/kaerchen/Desktop/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/storage-schema-contract.md:58).

   Similarly, the instrument table/manifest has one `official_name`, but the RPC accepts `officialLegalName` and nullable `officialShortName`; no rule identifies the stored manifest name while the second value also seeds aliases. See [instrument-roster-contract.md:5](/Users/kaerchen/Desktop/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/instrument-roster-contract.md:5), [auth-principal-contract.md:77](/Users/kaerchen/Desktop/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/auth-principal-contract.md:77), [auth-principal-contract.md:86](/Users/kaerchen/Desktop/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/auth-principal-contract.md:86), and [storage-schema-contract.md:46](/Users/kaerchen/Desktop/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/storage-schema-contract.md:46). Consequently `MIG-002` cannot assert one exact catalog or reproduce every authority manifest without an implementation-selected mapping.

## Independently Confirmed Closed

- Discovery remains source-led. Market-wide facts are limited to aggregate context, shallow reference populations, and a non-promoting mover audit; comparison peers cannot independently enter formal/actionable pools.
- Database knowledge time and cutoff predicates remain explicit across source revisions, identities, publisher authority, roster, aliases, taxonomy, peers, financial/market observations, and historical public selection.
- Source accounting conservation, quota formulas, scoring weights, market thresholds, valuation precedence, action sizing, and failure behavior remain bounded and deterministic.
- Round 14 added constructible native rows for `market_reference`, `mover_price_reference`, `outcome_input`, `evaluation_input`, and `link_audit_sample`, including terminal orders, conservation, sentinels, and universal root binding.
- The universal manifest row/page/root algorithm, interruption resume, canonical bytes, and `building -> complete|failed` lifecycle remain closed.
- Explicit `ON DELETE RESTRICT` treatment and non-FK actor UUID semantics are present for the relations that are unambiguously enumerated.
- Artifact collapse, revocation, cutoff filtering, three-item ordering, registered evidence fields, and zero influence are deterministic apart from Finding 2.
- Historical `createdAt`/`sealedAt`/`terminalAt` visibility, warning cutoff rules, strict valuation-verification expiry equality, and stored-success byte preservation remain closed.

## Inventory Validation

- Canonical version: `1.14.0`
- Declared/actual/unique cases: `174/174/174`
- Structurally complete records: `174`
- Exact ordered five-field records: `174`
- Duplicate, malformed, empty, extra-field, or non-string records: `0`
- Skip/todo registrations: none
- Version mirrors: consistent across `acceptance-tests.md`, `data-contract.md`, `v3-detail-contract.md`, `gate-summary.md`, and the JSON cases
- Round 14 cases `MKT-014` and `EVAL-011` structurally cover the native-manifest repairs
- `OPS-020`, `MIG-002`, and `MOD-004` cannot yet provide semantic one-to-one executable coverage because Findings 1–3 leave their expected oracle unspecified

## Governance

The reviewed range contains Loop/constitution artifacts only; no application implementation or migration file is present. The worktree remained clean, and this review performed no edit, stage, commit, implementation, migration, build, deployment, or production operation.

Implementation remains `not_started`; production mutation authority is false. Architecture Gate remains `CHANGES_REQUIRED` and was not performed here. Implementation, migration application, scheduler enablement, model influence, merge, push, and deployment remain unauthorized. A repair followed by another fresh Requirements Gate is required before Architecture Gate may proceed.
