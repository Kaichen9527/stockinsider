# Analysis Revision Contract: source-led-opportunity-engine-v3

Version: `stock-analysis-revision-v3.11.2`

An evaluation and an analysis revision are different facts. Rechecking unchanged
inputs appends an evaluation event; only a material input change appends a new immutable
analysis revision. Neither operation rewrites an older revision or its prose.

## Canonical material identity

For one symbol, build this RFC 8785 array:

```text
[
  "stockinsider-material-change-v2",
  symbol,
  sourceEvidence,
  financialFacts,
  priceTriggerState,
  technicalState,
  valuationState,
  riskState,
  factorCorrectnessState
]
```

- `symbol` is the roster symbol. Evaluation cutoff belongs to evaluation lineage and
  is deliberately absent from material identity.
- `sourceEvidence` contains unique opaque evidence refs sorted by evidence effective
  time descending, then ref ascending; max 40.
- `financialFacts` rows are
  `[factId,factKey,normalizedValue,normalizedUnit,sourceTimestamp]`, sorted fact-key
  enum, period end descending, fact UUID; max 128. Every number is finite and uses the
  normalized point-in-time fact selected by `financial-data-contract.md`.
- `priceTriggerState` is
  `["price_trigger",availability,stateOrNull,triggerKindOrNull]`, where availability
  is `available|unavailable`, state is the exact technical state, and trigger kind is
  `reclaim|breakout|pullback|null`. Raw session date/close and ordinary price movement
  inside the same state/trigger bucket do not create a revision.
- `technicalState` is
  `["technical",stateOrUnavailable,supportOrNull,resistanceOrNull]`.
- `valuationState` is `["valuation",valuationInputHashOrNull]`.
- `riskState` is `["risk",firstRiskCodeOrNone]`, where the closed code is
  `none|source_contradiction|financial_conflict|technical_invalidated|valuation_conflict`.
- `factorCorrectnessState` is `['factor',qualityStatus,qualityAvailableWeight,
  qualityScoreDecileOrNull,biasAvailability,biasOwnLabelOrNull,
  biasSectorBandOrNull,timingRiskStatus,reportedPeOwnPercentileDecileOrNull,
  reportedPeSectorBandOrNull]`. Numeric deciles are floor-clamped `0..9`; a raw
  same-bucket price/BIAS/PE change is deliberately not material. Every member comes
  from the same bound R14 manifest/decision roots, not display prose.

No display prose, current clock, run ID, database UUID or model output enters this
preimage. `materialChangeHash` and the older draft name `materialInputHash` are the
same field; only `materialChangeHash` serializes. It is lowercase SHA-256 over the
exact canonical UTF-8 bytes.

Golden canonical bytes are:

```json
["stockinsider-material-change-v2","2337",["source-ref-a"],[["fact-2337-eps","quarterly_diluted_eps",0.9,"TWD_per_share","2026-04-30T06:00:00Z"]],["price_trigger","available","reclaim_required","reclaim"],["technical","reclaim_required",43,50],["valuation","dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"],["risk","none"],["factor","available",0.75,6,"available","low","normal","wait_trigger",4,"normal"]]
```

The expected digest is
`ce1fde50d6378ebf0de9e0ac978351e95ea8c398993baa2b91120d55c54cb70b`.
Sorting, null, numeric or tag mutation must change it.

A later evaluation records its own later cutoff/session/close below. If all material
members above remain byte-equal, the digest remains this same value and the operation
is `no_material_change`. Crossing a technical state/trigger bucket, changing
support/resistance, or any other material member changes the digest.

## Immutable records

The additive, not-yet-authorized production migration creates:

```ts
type AnalysisRevisionV311 = {
  revisionId:string;            // UUID
  symbol:string;
  sourceCutoff:string;
  materialChangeHash:string;
  priorRevisionId:string|null;
  researchMaturity:'source_signal'|'fundamental_review'|'decision_ready';
  formalResearchStatus:'not_evaluated'|'insufficient_evidence'|
    'valuation_review'|'formal_watch'|'formal_candidate';
  newPositionAction:'avoid'|'valuation_review'|'wait_trigger'|
    'event_starter'|'starter_now';
  fundamentalSnapshotHash:string;
  technicalDecisionHash:string|null;
  valuationInputHash:string|null;
  lockedClaims:Array<{
    claimId:string;
    clauseKind:'thesis'|'latest_change'|'risk'|'technical'|'valuation';
    key:string;
    value:string|number|null;
    unit:'text'|'TWD'|'TWD_per_share'|'percentage_points'|'shares'|
      'dimensionless'|'date'|'state';
    sourceRef:string;
    asOf:string;
  }>;
  narrativeTemplateVersion:'stockinsider-narrative-template-v1';
  sentenceClaimRefs:Array<{
    sentenceOrdinal:number;
    clauseKind:'thesis'|'latest_change'|'risk'|'technical'|'valuation';
    claimIds:string[];
  }>;
  narrative:string;
  narrativeHash:string;
  analysisGeneratedAt:string;
  producerCommitSha:string;
};
type AnalysisEvaluationV311 = {
  evaluationId:string;          // UUID
  symbol:string;
  revisionId:string;
  evaluatedMaterialChangeHash:string;
  disposition:'material_revision_created'|'no_material_change';
  evaluatedSourceCutoff:string;
  evaluatedPriceSession:string|null;
  evaluatedAdjustedClose:number|null;
  evaluatedAt:string;
  trigger:'daily_base'|'material_evidence'|'price_state_transition'|'official_filing';
  producerRunId:string;
};
```

`legacy_analysis_revisions_v3_11` has unique
`(symbol,material_change_hash)` and append-only triggers rejecting update/delete.
`legacy_analysis_evaluations_v3_11` is append-only and has unique
`(producer_run_id,symbol)`. The only service-role writes are the non-overloaded
security-definer functions `append_legacy_analysis_revision_v3_11` and
`append_legacy_analysis_evaluation_v3_11`; both validate the producer lease, commit/hash
manifest, idempotency key and exact referenced revision. They have empty search paths,
owned RLS-protected tables, no `PUBLIC|anon|authenticated` grant and no public route.
They belong to the V3.11 legacy-correctness migration catalog, not the existing
33-function `/api/opportunity-v3` catalog, whose disabled route remains zero-query.

`lastEvaluatedAt` is derived from the greatest evaluation `evaluatedAt`, then UUID;
`analysisGeneratedAt` is copied from the immutable selected revision. An evaluation
never updates a revision timestamp. Collision on the same material hash returns the
byte-identical retained revision; differing payload for the same key fails
`analysis_revision_conflict`. Evaluation cutoff is UTC whole-second RFC3339 `Z`;
session is a completed Taiwan date and close is finite positive when present. They are
lineage/audit values only and never re-enter `materialChangeHash`.

## Changed reasons and no-change output

Compare the prior selected revision's canonical material preimage with the new one.
Append unique reasons in this fixed order, max seven:

```ts
type MaterialChangedBecauseV311 =
  'source_evidence_changed'|'financial_fact_changed'|'price_trigger_changed'|
  'technical_state_changed'|'valuation_changed'|'risk_changed'|
  'factor_correctness_changed';
```

`price_trigger_changed` is emitted only when `priceTriggerState` changes, not for a
later session or raw close inside the same bucket. The existing V3 `changedBecause`
transition/factor array remains separate and retains
its old meaning. The additive public field is named `materialChangedBecause`; neither
array is inferred from the other.

When the digest is unchanged, append only `no_material_change` evaluation and expose:

```text
已於 {lastEvaluatedAt in Asia/Taipei YYYY-MM-DD HH:mm} 檢查，無重大變化
```

The timestamp derives from the ledger, uses zero-padded 24-hour time and no seconds.
When changed, append exactly one new revision and one evaluation in the same
transaction; `materialChangedBecause` must be nonempty. The additional closed reason
`factor_correctness_changed` is emitted only when `factorCorrectnessState` changes.
Legacy `changedBecause` never receives `no_material_change`; it remains the separate
score/rank transition array in `data-contract.md`.

## Locked deterministic narrative boundary

Each `lockedClaims` row has exactly the seven members above. `claimId` is unique
lowercase ASCII `[a-z0-9][a-z0-9_-]{0,63}`; `key` is a closed renderer key;
`clauseKind` owns its destination section; `unit` is mandatory even for text/null;
`sourceRef` and `asOf` bind the cutoff-valid fact. Rows sort by clause-kind enum,
claim ID and source ref. Unknown keys, missing/wrong units, duplicate IDs, a value
whose type does not match its key/unit, or a clause with no source ref fails
`narrative_claim_mismatch` before any revision write.

The sole authoritative narrative is rendered without a model by
`stockinsider-narrative-template-v1`. The template is a closed map from
`(locale,clauseKind,key,unit)` to literal prefix/value-format/suffix tokens. Each
output sentence stores one parallel `sentenceClaimRefs` row. Ordinals are contiguous
from zero, `clauseKind` equals that sentence's renderer branch, and `claimIds` are
unique and sorted by the canonical locked-claim order; every locked claim appears in
exactly one row and no unknown claim ID appears. The closed array is persisted for
internal audit but omitted from public prose. Sentence order is thesis, latest
change, technical, valuation, risks, then claim ID. A clause can contain only literal
template tokens and the exact formatted value owned by its cited claims. Status/action
are separately rendered from their already computed enums and cannot be supplied as
claim text.

The template version fixes `locale='zh-TW'`; locale is therefore not a stored or
caller-selected member. No other locale is valid in V3.11. The closed registry is:

| Clause | Key | Unit | Literal prefix | Format | Literal suffix |
|---|---|---|---|---|---|
| thesis | `thesis_summary` | text | `研究重點：` | text | `。` |
| thesis | `research_maturity` | state | `研究成熟度：` | research-maturity state | `。` |
| latest_change | `latest_change_summary` | text | `最新變化：` | text | `。` |
| latest_change | `quarterly_diluted_eps` | TWD_per_share | `最新變化：稀釋後每股盈餘為 ` | decimal-2 | ` 元。` |
| latest_change | `monthly_revenue_yoy` | percentage_points | `最新變化：月營收年增率為 ` | signed-decimal-2 | ` 個百分點。` |
| latest_change | `operating_margin` | percentage_points | `最新變化：營業利益率為 ` | signed-decimal-2 | `%。` |
| technical | `technical_state` | state | `技術狀態：` | technical-state | `。` |
| technical | `entry_trigger` | state | `進場觸發：` | trigger-state | `。` |
| technical | `entry_zone_low` | TWD | `進場區間下緣：` | decimal-2 | ` 元。` |
| technical | `entry_zone_high` | TWD | `進場區間上緣：` | decimal-2 | ` 元。` |
| technical | `invalidation_stop` | TWD | `失效價：` | decimal-2 | ` 元。` |
| valuation | `valuation_status` | state | `估值狀態：` | valuation-state | `。` |
| valuation | `bear_target` | TWD_per_share | `保守估值：` | decimal-2 | ` 元。` |
| valuation | `base_target` | TWD_per_share | `基準估值：` | decimal-2 | ` 元。` |
| valuation | `bull_target` | TWD_per_share | `樂觀估值：` | decimal-2 | ` 元。` |
| valuation | `valuation_confidence` | dimensionless | `估值信心：` | decimal-2 | `。` |
| valuation | `valuation_as_of` | date | `估值資料日：` | date | `。` |
| risk | `risk_summary` | text | `風險：` | text | `。` |
| risk | `first_risk_code` | state | `主要風險：` | risk-state | `。` |

`decimal-2` accepts only a finite number, rounds half away from zero to two decimals,
normalizes negative zero to `0.00`, and emits one optional ASCII `-`, at least one
integer digit, `.` and exactly two fraction digits with no grouping. `signed-decimal-2`
uses the same bytes and does not add `+`. `date` accepts and emits only a real ASCII
`YYYY-MM-DD`. `text` first requires NFC, trims and collapses every Unicode whitespace
run to U+0020, then requires 1..180 Unicode code points and at most 720 UTF-8 bytes;
U+0000..U+001F, U+007F, every `Cf`, LF/CR and the sentence terminators
`。！？.!?` are forbidden, so a value cannot create a second sentence. No HTML,
Markdown or locale API escaping/formatting is applied.

The state formats are total literal maps:

- research maturity: `source_signal=來源訊號`,
  `fundamental_review=基本面待覆核`, `decision_ready=決策資料完整`;
- technical state: `below_support=股價低於支撐`,
  `reclaim_required=需先收復支撐`, `at_support=位於支撐區`,
  `breakout_pending=等待突破確認`, `breakout_confirmed=突破已確認`,
  `extended=漲幅已延伸`, `invalidated=技術條件失效`;
- trigger state: `reclaim=收復支撐後再評估`, `breakout=突破確認後再評估`,
  `pullback=回測進場區後再評估`;
- valuation state: `normal=估值可用`, `missing=估值資料不足`,
  `stale=估值資料過期`, `outlier_review=估值異常待覆核`;
- risk state: `none=無重大風險代碼`, `source_contradiction=來源互相矛盾`,
  `financial_conflict=財務資料衝突`, `technical_invalidated=技術條件失效`,
  `valuation_conflict=估值資料衝突`.

Each state key accepts only its own listed enum. A null is invalid for every registry
row. One claim renders one sentence. Sentences join with exactly U+000A, with no
leading or trailing LF. Status/action remain separate typed projection fields and do
not create uncited narrative sentences.

Canonical locked claims, already in canonical order, are:

```json
[{"asOf":"2026-04-30T06:00:00Z","claimId":"c-thesis","clauseKind":"thesis","key":"thesis_summary","sourceRef":"source-ref-a","unit":"text","value":"記憶體需求回升"},{"asOf":"2026-04-30T06:00:00Z","claimId":"c-eps","clauseKind":"latest_change","key":"quarterly_diluted_eps","sourceRef":"filing-2337-q1","unit":"TWD_per_share","value":0.9},{"asOf":"2026-04-30T06:00:00Z","claimId":"c-technical","clauseKind":"technical","key":"technical_state","sourceRef":"price-plane-2337","unit":"state","value":"reclaim_required"},{"asOf":"2026-04-30T06:00:00Z","claimId":"c-valuation","clauseKind":"valuation","key":"valuation_status","sourceRef":"valuation-2337","unit":"state","value":"outlier_review"},{"asOf":"2026-04-30T06:00:00Z","claimId":"c-risk","clauseKind":"risk","key":"risk_summary","sourceRef":"valuation-2337","unit":"text","value":"估值輸入待覆核"}]
```

The exact `sentenceClaimRefs` golden is:

```json
[{"clauseKind":"thesis","claimIds":["c-thesis"],"sentenceOrdinal":0},{"clauseKind":"latest_change","claimIds":["c-eps"],"sentenceOrdinal":1},{"clauseKind":"technical","claimIds":["c-technical"],"sentenceOrdinal":2},{"clauseKind":"valuation","claimIds":["c-valuation"],"sentenceOrdinal":3},{"clauseKind":"risk","claimIds":["c-risk"],"sentenceOrdinal":4}]
```

The exact 202-byte UTF-8 narrative is:

```text
研究重點：記憶體需求回升。
最新變化：稀釋後每股盈餘為 0.90 元。
技術狀態：需先收復支撐。
估值狀態：估值異常待覆核。
風險：估值輸入待覆核。
```

Its `narrativeHash` is
`7ce447afdb5afcebc0dbc1a8783171c77758374294d046bae2bd98044601bb36`.
Acceptance enumerates every registry row and state label, both number signs and
half-away boundary, negative zero, date/calendar failures, every forbidden text code
point/terminator, unknown locale/key/unit/state, reordered claims and mutation of
every golden byte.

A model may generate a non-authoritative draft suggestion for developer inspection,
but those bytes are never stored in `legacy_analysis_revisions_v3_11`, never hashed
as `narrativeHash`, never projected, and cannot change a claim, clause, order,
status/action or source ref. There is no model-accepted prose branch or
numeric-multiset heuristic.

Identical canonical claims, locale, status/action and template version produce
byte-identical `sentenceClaimRefs`, narrative and SHA-256 `narrativeHash` across
retries and process restarts. Reordered input claims canonicalize to the same output.
Changing a qualitative text value changes the material financial/source/risk owner
that supplied the claim and therefore cannot silently rewrite the same revision.
Acceptance injects an unsupported qualitative customer/order assertion, missing or
wrong unit, reordered clauses, duplicate refs and repeated retries; only the exact
typed deterministic rendering may persist.
