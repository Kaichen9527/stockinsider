# Requirements Gate Review — Round 16

- Reviewer: fresh independent Sol Requirements Gate reviewer
- Model: `gpt-5.6-sol`
- Effort: `xhigh`
- Session ID: not visible
- Date: 2026-07-19 (Asia/Taipei)
- Reviewed range: `12c131aa50ca53268878e9f025973533ac100c49..8a5136202ebe1d378ca51945a6aceaa549795995`
- Architecture Gate performed: no
- Verdict: `CHANGES_REQUIRED`
- Counts: `P0=0 P1=2 P2=0`

## Findings

1. **P1 — The blinded assignment RPC still lacks complete deterministic branches.** `get_link_audit_assignment_v3` has no requested-role/disposition argument, although principals may hold multiple roles. The contract does not define the exact result or failure precedence for a reviewer when both slots are occupied, an adjudicator before two labels exist, or a dual-role principal where reviewer and adjudicator paths differ. Consequently `OPS-021` cannot supply the promised exact read-branch oracle. See [auth-principal-contract.md:44](/Users/kaerchen/Desktop/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/auth-principal-contract.md:44), [auth-principal-contract.md:70](/Users/kaerchen/Desktop/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/auth-principal-contract.md:70), [auth-principal-contract.md:100](/Users/kaerchen/Desktop/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/auth-principal-contract.md:100), [auth-principal-contract.md:102](/Users/kaerchen/Desktop/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/auth-principal-contract.md:102), and [acceptance-tests.json:179](/Users/kaerchen/Desktop/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/acceptance-tests.json:179).

2. **P1 — Official instrument-name bounds conflict with alias and public-display contracts.** The schema accepts legal/short names through 120 Unicode code points and requires generated `official_name` for every public display. Alias authority and `chineseName`, however, are capped at 40. For a valid 41–120-code-point official name, no rule determines whether ingestion fails, the alias is omitted, or the public name is truncated/null—each conflicts with another normative statement. `PEER-008` and generic bound fuzzing do not resolve this mapping boundary. See [storage-schema-contract.md:46](/Users/kaerchen/Desktop/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/storage-schema-contract.md:46), [instrument-roster-contract.md:5](/Users/kaerchen/Desktop/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/instrument-roster-contract.md:5), [entity-link-contract.md:28](/Users/kaerchen/Desktop/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/entity-link-contract.md:28), [data-contract.md:149](/Users/kaerchen/Desktop/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/data-contract.md:149), and [acceptance-tests.json:180](/Users/kaerchen/Desktop/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/acceptance-tests.json:180).

## Independently Confirmed Closed

- Assistive artifacts use only equality with the evaluation-header and consuming-run `comparisonContractKey`; dataset-lock and legacy-lock hashes cannot substitute.
- Peer rows copy immutable instrument stock IDs, store no symbols, and derive endpoint symbols solely from the bound roster manifest.
- Database-owned role bindings, the closed 18-function non-orchestration catalog, source-led scope, point-in-time authority, additive schema, shadow isolation and principal non-FK history are otherwise present.

## Inventory Validation

- Version: `1.15.0`
- Declared/actual/unique: `177/177/177`
- Exact ordered five-field, nonempty-string records: `177`
- Duplicate, malformed, empty or extra-field records: `0`
- Skip/todo registrations: `0`; `GOV-001` only prohibits them
- Mirror literals: consistent
- Semantic one-to-one coverage remains blocked by the two findings above.

## Governance

HEAD exactly equals the endpoint and the worktree remained clean. Review used read-only shell inspection only. No edit, stage, commit, application execution, migration, build, deployment, web access or production operation occurred. Implementation and production mutation remain unauthorized; Architecture Gate remains blocked pending repair and another fresh Requirements Gate.
