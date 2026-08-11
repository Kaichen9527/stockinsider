# Source-led Opportunity Engine V3 — Hybrid Product Amendment

Status: approved by user on 2026-07-24
Amendment version: `hybrid-product-v3.2`
Parent change: `source-led-opportunity-engine-v3`

## Decision

The complete V3 source-to-projection runtime, immutable evidence model, security model, bounded execution protocol and shadow evaluation remain in scope. The first product milestone changes from a homepage-first opportunity panel to a dedicated verified-change workspace.

The local `model_runner_v3` remains an independent evidence track and cannot influence
V3 domain outputs. Under the later V3.11 amendment its required, non-skipped check is
an input to the Code Gate aggregate, while its evidence can never substitute for a
product/runtime case or a Promotion cohort.

Research action sizing is deferred from the user-facing milestone. The runtime may retain typed allocation calculations for invariant and evaluation purposes, but public compact/detail projections SHALL omit requested or suggested position percentages until a later explicit product and evidence checkpoint authorizes them.

## Verified-change workspace

The first milestone SHALL expose a dedicated `/opportunity-v3` workspace with three decision lanes:

1. `new_verified_change`: a newly verified official or public-research change with bounded supporting evidence.
2. `strengthened_thesis`: a previously known thesis whose independent evidence or fundamental support materially strengthened.
3. `contradiction_or_review`: conflicting, stale, incomplete or valuation-review evidence requiring attention.

Every item SHALL include a bounded immutable `verifiedChangeBrief`:

- `briefVersion`;
- `changeKind`;
- `headline`;
- `whatChanged`;
- `whyItMatters`;
- `verifiedAt`;
- `sourceCutoff`;
- at most three `evidenceRefs`;
- `independentSourceClassCount`;
- `contradictions`;
- `formalResearchStatus`;
- `primaryHorizon`;
- `scoreDelta`;
- `detailPath`;
- the fixed shadow/research-only disclosure.

Text fields SHALL be normalized, nonempty and bounded. The brief is derived only from the same successful run and immutable evidence roots as the card plus the one comparison-key-equal prior successful projection already selected by `data-contract.md`. It cannot trigger a write, provider refresh, legacy lookup or cross-run fallback.

The exact brief contract is `verified-change-brief-v3.0`. `changeKind` is `official_event|fundamental_update|valuation_update|source_corroboration|contradiction`. `headline` is 1..96 characters, `whatChanged` and `whyItMatters` are 1..280 characters, and every value is NFC, trimmed and whitespace-collapsed. Raw connector text and generated model prose are forbidden.

The sole derivation input for one deep-success candidate is:

`[runId,symbol,detailPath,anchorSourceClass,anchorEffectiveAt,sourceCutoff,evidenceRows,changedBecause,formalResearchStatus,primaryHorizon,scoreDelta,newPositionAction,valuationStatus,valuationEvidenceRefs,priorComparableOrNull]`.

`runId` is the current successful run UUID. `detailPath` is accepted only when it byte-equals `/opportunity-v3/{runId}/{symbol}`; it is never supplied independently by a client. `evidenceRows` contains only same-run claims whose owning revision was selected complete and whose opaque source ref, evidence root and effective time passed the source contract. Every included claim occurrence `(runId,revisionId,claimOrdinal)` must own at least one same-run mention occurrence whose stored `stockId` and four-digit `symbol` byte-equal the candidate and whose outcome is exactly `linked_new|linked_refresh|linked_duplicate_claim`. Cross-run, cross-stock, cross-symbol, unlinked, ambiguous, rejected and unsupported mentions can never contribute evidence. Each row is `[sourceSelectionOrdinal,claimOrdinal,evidenceRef,evidenceRootId,sourceClass,sourceKey,effectiveAt,freshness,verificationTier,stance,runId,revisionId,stockId,symbol,mentionOutcome]`; `sourceKey` is copied from the owning selected revision and is required by the exact public source-summary/evidence projection. Order is the first two integers, evidence ref, then root ID, while the final five provenance fields are equality witnesses and never ordering keys. `freshness` is `fresh|stale` from the source-class TTL at the run cutoff. `verificationTier` is `provenance_verified|publisher_verified` and byte-equals the normalized claim column derived by the exact publication-record rule in `source-matrix.md`. `stance` is `supports|contradicts` and byte-equals the normalized claim column produced by `claim-evidence-stance-v3.0` in `entity-link-contract.md`. The deep worker copies the source key, both stored enums and the database-derived provenance witnesses; projection/evaluation cannot infer them from text, source class or current authority. Duplicate evidence roots retain their first row. `priorComparableOrNull` is `[priorSourceCutoff,priorAnchorEffectiveAt,priorFormalResearchStatus,priorIndependentSourceClassCount,priorValuationStatus]` from the selected prior stored projection or null.

The selected evidence set is the first row for each unique root. Traverse that selected-root set in its existing order, retain only the first occurrence of each byte-equal `evidenceRef`, then take the first three retained refs; that ordered set is `evidenceRefs`. `verifiedAt` is the greatest `effectiveAt` in that selected set, ties irrelevant because the timestamp value is equal. `independentSourceClassCount` is the number of unique source-class enums in that set. A zero-row, zero-unique-ref or over-four-class result is invalid; no brief is constructed.

Contradictions are derived in the following fixed code order:

1. `conflicting_source` when selected rows contain at least one `supports` and one `contradicts` row from different roots; its ref is the first contradicting row.
2. `missing_official_confirmation` when the anchor is `curated_thesis|community` and no selected `official|public_research` row has `publisher_verified`; its ref is the first selected row.
3. `stale_evidence` when any selected row is stale; its ref is the first stale row.
4. `valuation_outlier` when valuation status is `outlier_review`; its ref is the first valuation evidence ref or null.

`changeKind` uses first match: any contradiction -> `contradiction`; official anchor -> `official_event`; a nonzero `factor_contribution_changed/fundamental` fact -> `fundamental_update`; a nonzero `factor_contribution_changed/valuation` fact or valuation status differing from the prior card -> `valuation_update`; otherwise -> `source_corroboration`. No other input can choose the kind.

Exact NFC output templates are:

| Kind | `headline` | `whatChanged` |
|---|---|---|
| `official_event` | `{symbol} 已確認官方事件` | `官方或公司事件已由不可變來源確認。` |
| `fundamental_update` | `{symbol} 基本面證據更新` | `基本面因子相較前次可比快照出現變化。` |
| `valuation_update` | `{symbol} 估值證據更新` | `估值因子或狀態相較前次可比快照出現變化。` |
| `source_corroboration` | `{symbol} 取得獨立來源佐證` | `新增或保留的獨立來源強化目前研究依據。` |
| `contradiction` | `{symbol} 存在待覆核矛盾` | `證據存在衝突、確認缺口、過期或估值異常。` |

`whyItMatters` is exactly `研究狀態：{formalLabel}；主要觀察週期：{horizonLabel}。`. Formal labels in enum order are `未評估|證據不足|估值待覆核|正式觀察|正式候選`; horizon labels are `5–20 個交易日|20–60 個交易日`. Substitution adds no escaping or punctuation choice because the symbol grammar is ASCII.

`contradictions` contains at most three unique rows in code order `conflicting_source|missing_official_confirmation|stale_evidence|valuation_outlier`, each `{code,evidenceRef}` with a nullable opaque ref of at most 120 characters. `evidenceRefs` contains one through three unique same-run verified refs in source-selection order. `independentSourceClassCount` is an integer from one through four.

A direct-source deep-success candidate is workspace eligible only when the derivation above yields at least one same-run evidence ref. Lane precedence is:

1. `contradiction_or_review` when any contradiction exists, formal state is `insufficient_evidence|valuation_review`, or action is `valuation_review`;
2. `new_verified_change` when the anchor is official/public research and either no comparable prior card exists or current anchor effective time is strictly after the prior run cutoff;
3. `strengthened_thesis` when score delta is at least positive 5.00, formal state improved in order `not_evaluated < insufficient_evidence < valuation_review < formal_watch < formal_candidate`, or independent source-class count increased from the prior row;
4. otherwise the candidate is absent from workspace lanes while remaining in the underlying immutable projection.

Each symbol occurs in at most one lane. Within a lane order is `verifiedAt` descending, absolute non-null `scoreDelta` descending with null last, then symbol ascending. Each lane is capped at eight and the combined workspace is capped at eighteen by taking rows in round-robin lane order `new_verified_change`, `strengthened_thesis`, `contradiction_or_review`. Zero eligible rows is a valid `empty` workspace, distinct from cold/degraded/failed.

The homepage summary has exactly `{workspacePath:'/opportunity-v3',asOf,status,totalCount,laneCounts,topItems}`. `topItems` is the first at most three items from the same round-robin order and contains only `symbol,chineseName,changeKind,headline,verifiedAt,detailPath`. It contains no score, action, sizing or raw evidence.

## Strategy bake-off

Shadow evaluation SHALL retain three non-authoritative strategy labels:

- `official_only`;
- `source_led`;
- `hybrid`.

The comparison uses the same cutoff, roster, market reference, evaluation contract and outcome maturity. Product-value reporting includes verified-change precision, contradiction capture rate, time-to-first-verified-change and reviewer resolution rate. No strategy may alter legacy recommendations or become authoritative without a later checkpoint.

All strategies filter one common bounded immutable strategy population derived exclusively from frozen `direct_candidate` snapshots with `directSource=true` and `deepStatus=succeeded`. The supplying run set is closed: traverse the bound complete `evaluation_input` manifest's `backtest_rows` in stored section order, then its `live_rows` in stored section order, take each row's `enrichRunId`, and retain the first occurrence of each byte-equal UUID. Every supplying run must be a successful `enrich_rank` input named by that manifest, have the manifest's `evaluationDatasetLockHash` and `comparisonContractKey`, and have `sourceCutoff <= evaluationCutoff`; a run from the attempt roster alone, an excluded date, another manifest, another lock/key, or after the cutoff is invalid. Join exactly the deep-success direct candidates stored by those retained run IDs. Comparison-only shallow observations never enter the strategy population. Deduplicate by `[runId,symbol]`, order the immutable snapshot rows by `sourceCutoff` descending then run UUID and symbol ascending, and call the complete ordered identity array `preCapIdentities`. `preCapCandidateCount=preCapIdentities.length`; `preCapOrderedIdentityHash=SHA256(UTF8(RFC8785(["strategy-population-v3.0",preCapIdentities])))` as lowercase hex; `retainedCandidateCount=min(preCapCandidateCount,400)`; `deferredDueStrategyEvidenceCap=preCapCandidateCount-retainedCandidateCount`; and the retained population is exactly `preCapIdentities.slice(0,retainedCandidateCount)`. Only those retained identities enter any strategy selected/excluded identity array. Every retained candidate must then yield the deterministic candidate brief above; lane membership is not required for evaluation and the lane key may be null. The identical retained population is presented to all three strategies.

- `official_only`: retain candidates with at least one verified official/public-research evidence root.
- `source_led`: retain every direct-source candidate with at least one verified evidence root.
- `hybrid`: retain a `source_led` candidate only when it has official/public-research evidence or at least two independent source classes.

Every retained population member appears exactly once in each strategy row, either selected or excluded. Exclusions use this closed precedence and no generic filter code:

1. `invalid_verified_change_input` when the exact brief derivation or detail-path validation fails;
2. `missing_verified_evidence` when no qualifying verified evidence root exists;
3. `missing_official_or_research_evidence` when `official_only` has verified evidence but none is official/public research;
4. `insufficient_independent_source_classes` when `hybrid` has verified direct-source evidence, no official/public-research evidence and fewer than two independent source classes.

Thus `official_only` applies codes 1, 2 and 3; `source_led` applies codes 1 and 2; `hybrid` applies codes 1, 2 and 4. `not_direct_source` is deliberately not an exclusion code because non-direct candidates are excluded before `preCapIdentities` is constructed. First match wins and no retained candidate can disappear.

They never recompute factors, valuation, rank or action. Each result stores the selected candidate-brief count and:

- `verifiedChangePrecision = selected candidate briefs with zero contradictions and formal_watch|formal_candidate / selected candidate briefs`;
- `contradictionCaptureRate = selected candidate briefs carrying at least one contradiction / all candidate briefs in the common frozen set carrying at least one contradiction`;
- `timeToFirstVerifiedChangeMinutes` is the Type-7 median of nonnegative whole minutes from each selected candidate's earliest qualifying evidence effective time to `verifiedAt`;
- `reviewerResolutionRate = link-audit samples with either two agreeing reviewer labels or terminal adjudication / all samples`.

The time metric uses each selected candidate brief's earliest selected evidence-row effective time and the brief's `verifiedAt`; negative duration is integrity failure and whole minutes use floor before the Type-7 median. Reviewer resolution is intentionally common across strategies because it measures the one frozen link-audit sample and its cutoff-bound `link_audit_resolution` manifest: numerator is a sample frozen as two byte-equal reviewer dispositions or one terminal adjudicator disposition, denominator is every sample represented by exactly one resolved or unresolved row. Mutable current labels are forbidden evaluation input. A zero denominator for any metric yields JSON null and adds the unique typed fact `insufficient_product_value_evidence`; nonzero metrics do not add it. Candidate identities, selected identities, exclusions, numerators, denominators, null facts and values are stored in fixed strategy order. Each evaluation row's canonical UTF-8 bytes must be at most 262,144; the maximum 400-candidate/four-exclusion-code/four-byte-UTF-8 fixture must pass rather than truncate. These metrics are descriptive shadow evidence only and are not promotion conditions in this checkpoint.

## Information architecture

- `/opportunity-v3` is the primary V3 workspace.
- The homepage may show only a bounded shadow summary and a link to the workspace.
- Disabled and drain states omit all V3 homepage content.
- Cold, degraded, empty and available workspace states are distinct and human-readable.
- Detail remains same-run and immutable.

The root workspace contract is owned here. `GET /opportunity-v3` is a server-rendered, read-only document route with no query/body. The deployment gate runs first: `disabled|drain` returns the application 404 with zero V3 query; only `shadow` calls the public projection loader. The loader captures one server UTC whole-second `requestProjectionCutoff`, selects exactly as `data-contract.md`, performs no provider/legacy/write call and sends `Cache-Control: private, no-store`. State mapping is exact: `cold_start|no_matching_success -> cold`, `matching_run_in_progress -> calculating`, `latest_matching_failed -> failed`, available health `degraded -> degraded`, available workspace `empty -> empty`, otherwise `available`. Cold/calculating/failed render no lane/item/detail link; degraded renders the valid stored lanes plus warning disclosure; empty renders the valid empty-state message; available renders the three lanes in contract order. A malformed payload fails to the same `failed` presentation and internal bounded telemetry without exposing raw errors. The root has no JSON mutation endpoint and every detail link remains same-run.

## Preserved boundaries

- `productionMutationAuthorized=false`.
- No production migration, principal binding, scheduler activation, homepage promotion or model influence is authorized.
- No elapsed 120-date/20-cohort evidence may be synthesized.
- Legacy radar, recommendations, strategy actions and alerts remain unchanged.
- The exact-commit diff review precedes the repair Verification Gate.

The V3.11 product-correctness milestone is governed by the catalog-bound PCR amendment.
Its tracked producer, material-change revision, valuation-integrity and compact-projection
rules are part of this hybrid milestone and advance the canonical acceptance inventory to
historical `1.44.6` (superseded by the V3.14 canonical `1.46.0`).

## Independent verification tracks

- `evaluation_governance` is exactly every `OUT-*`, every `EVAL-*`, and `HYB-005`.
- `model_runner` is exactly every `MR3-*`.
- Historical `product_runtime` was the exact remainder of the 297 IDs at this amendment; V3.14 supersedes it with 320 total and 272 product/runtime cases.

This is serialized as `opportunity-verification-partition-v3.0` in
`acceptance-tests.json`; prefixes and exact exceptions are disjoint and exhaustive,
and the historical meta-test expanded them to exactly 297 unique IDs; V3.14 now expands 320. Each track runs every
currently executable registered case in its partition with no skip/todo. V3.11 has two
non-interchangeable aggregates owned by `acceptance-evidence-contract.md`: Code Gate
requires Requirements, Architecture, product/runtime, model-runner and exact-review
PASS for one commit/tree; Promotion Gate additionally requires evaluation governance
PASS over real elapsed cohorts. Evaluation
`blocked/non_fabricated_elapsed_cohorts_unavailable` is neutral only to Code Gate and
blocks Promotion. No track can borrow evidence from another, and no blocked result is
reported as a full product/Promotion PASS. Status uses these exact snake-case track
names.
