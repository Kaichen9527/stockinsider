# Decision Contract: source-led-opportunity-engine-v3

Version: `opportunity-decisions-v3.3`

## Inputs and Derived Conditions

All decisions consume only the immutable deep-research snapshot for the same run. Percentages below are percentage points. `primaryScore` uses the horizon resolution in `scoring-contract.md`. With normal valuation, `primaryConfidence` is that horizon's valuation-dependent score confidence; otherwise it is `availableWeight / 100 * sourceConfidence` and cannot satisfy `starter_now`. Serialized decision confidence is the branch's primary/event confidence, clamped to 0 through 1.

`criticalDataInvalid` is true for a source-accounting conservation failure, unsupported/ineligible instrument, non-finite price, missing current price, or a timestamp later than `sourceCutoff`. A stale optional factor is unavailable under the scoring contract; it is not silently promoted to a critical-data failure.

`valuationHardBlock` is true exactly when resolved valuation status is `outlier_review`. `valuation-contract.md` converts every bridge/method/invariant or unapproved >80/>150/consensus-divergence condition to that status and may convert only its closed human-clearable subset to `normal` through matching valid verification; the decision engine never re-applies raw thresholds after approval. `valuationReviewRequired` is true for `missing|stale|outlier_review`; every such candidate has null formal targets and cannot reach any buy-like or technical-wait branch.

Technical state, adjusted inputs, support/resistance selection, indicator formulas,
entry zones and invalidation geometry come only from
`technical-decision-contract.md`. `technicalBuyEligible` and
`technicalWaitEligible` have the exact meanings there. Decision code cannot rebuild
an MA20-only confirmation, turn a level above current price into a pullback, or choose
a stop at/above entry. The immutable `technicalDecision` object is never rewritten by
the action serializer. For `starter_now|event_starter`,
`actionDecision.invalidation.stopPrice` is byte-equal to that same typed
`technicalDecision.invalidation.stop`; no second stop formula exists.
`wait_trigger` publishes the exact typed trigger but its action-level invalidation is
`evidence_expiry_only` with a null public stop. Its underlying technical object remains
byte-identical: `breakout_pending` retains its conditional `trigger_zone` and typed
invalidation, while `below_support|reclaim_required|extended` retain their owner-defined
null entry/invalidation. `valuation_review|avoid` cannot publish an entry-linked stop.
Unavailable technical data and `invalidated` are fail-closed.

The additive BIAS fields in `factor-correctness-amendment.md` v3.11.6 are timing
context, never an alternate entry rule. `technicalHardBlock` is true exactly for an
available technical state of `below_support|reclaim_required|invalidated`; it remains
prior to every BIAS and buy-like branch regardless of BIAS percentile.
`biasSafetyObserveOnly` is true exactly when technical input is available, is not a
technical hard block, and its closed BIAS branch is available with `bias20Atr <= -3`.
It maps to `avoid/bias_observe_only`: it produces no `starter_now`, `event_starter`
or `wait_trigger`, reserves no capacity and clears only under the amendment's later
completed-session rule. Shadow BIAS points never alter `primaryScore`, confidence or
any threshold. A normal or low BIAS cannot bypass `valuationReviewRequired`.

`qualityActionEligible` is true exactly when `factorAxes.quality.status='available'`,
`availableWeight >= 0.65` and `score >= 50`. It is a fundamental evidence minimum,
not a technical trigger or a composite score override. A false result maps to
`avoid/quality_insufficient` after valuation closure and before market/capacity
selection.

## Formal Research Status Precedence

Evaluate in order and stop at the first match:

1. Not in the deep-research pool -> `not_evaluated`.
2. `criticalDataInvalid` -> `insufficient_evidence`.
3. Valuation status `missing`, `stale` or `outlier_review` -> `valuation_review`.
4. Fewer than the required independent evidence classes, thesis `availableWeight <80`, `sourceConfidence <0.60`, or valuation confidence <0.60 -> `insufficient_evidence`.
5. At least one official/public-research claim plus a second independent source class, valuation normal with confidence >=0.60, and thesis score >=60 -> `formal_candidate`.
6. Otherwise -> `formal_watch`.

An official event and its reposts remain one class. A community repost cannot satisfy the second independent class.

## New-position Precedence

Evaluate in order and stop at the first match. For internal invariant/evaluation output, buy-like branches are provisional until the ordered cross-card allocator in `portfolio-context-contract.md` applies step 4 capacity against prior accepted cards:

1. `criticalDataInvalid` -> `avoid` with `data_integrity`.
2. `valuationReviewRequired` -> `valuation_review`; `blockReasons` contains the first
   at most five matching valuation reasons in `ValuationReasonV3` enum order. Missing
   without another reason uses `valuation_unavailable`. Size/trigger/entry/invalidation
   are null/zero and no formal target is published.
3. Technical availability `unavailable` -> `avoid/entry_data_unavailable` with zero
   size and no trigger.
4. Technical state `invalidated` -> `avoid/entry_invalidated` with zero size and no
   trigger.
5. Technical state `below_support|reclaim_required` -> `avoid/entry_unconfirmed`
   with zero size and its typed reclaim trigger retained only in `technicalDecision`.
6. `biasSafetyObserveOnly` -> `avoid/bias_observe_only` with zero size and no trigger.
7. `!qualityActionEligible` -> `avoid/quality_insufficient` with zero size and no trigger.
8. Market regime `risk_off` -> `avoid` with `market_risk_off`.
9. Compute capacity as `min(10-stockExposure,25-sectorExposure,
   regimeGrossCap-grossExposure)`, floored at zero. Negative/non-finite exposure input
   -> `avoid/invalid_exposure_input`.
10. If valuation is normal, `primaryScore>=70`, `primaryConfidence>=0.65`,
   base/p50 upside `>=15`, bear/p10 downside `>=-12`, and
   `technicalBuyEligible`, request 5%. Capacity below 3% ->
	   `avoid/capacity_exhausted`; otherwise `starter_now`, copying the technical entry
	   and exact typed stop.
11. If `formalResearchStatus != formal_candidate`, a direct verified official/public
   catalyst exists, momentum score `>=70`, event confidence `>=0.60`, liquidity
   factor `>=50`, valuation is normal and `technicalBuyEligible`, request 3%.
	   Capacity below 2% -> `avoid/capacity_exhausted`; otherwise `event_starter`,
	   copying the same exact typed stop.
   Community/curated evidence alone never qualifies and missing valuation can never
   enter this branch.
12. If valuation is normal, base/p50 upside `>=15`, bear/p10 downside `>=-12`,
   `primaryScore>=60`, `primaryConfidence>=0.45` and `technicalWaitEligible`, return
   `wait_trigger` with the exact reclaim/breakout/pullback trigger. It reserves no
   capacity.
13. Otherwise -> `avoid` with the first failed reason in this order:
   `score_below_threshold`, `confidence_below_threshold`,
   `valuation_reward_risk`, `entry_unconfirmed`.

`wait_trigger` never reserves portfolio capacity and has zero `initialPositionPct`. `starter_now` and `event_starter` set `maximumPositionPct` to the applicable 10% single-stock cap after current exposure; all other new-position actions set both size fields to zero.

## Existing-position Precedence

Evaluate independently from the new-position branch:

1. No current holding -> `no_position`, target `null`.
2. Stop or thesis invalidation breached -> `exit`, target 0%.
3. `criticalDataInvalid`, valuation status `stale`/`missing`, or valuation hard block -> `manual_review`, target `null`.
4. Market `risk_off`, `p90DecisionEligible` with current price at or above p90, stock exposure above 10%, sector exposure above 25%, or gross exposure above the regime cap -> `trim`. Candidate targets are: 0% for risk-off gross-cap breach; 5% for decision-eligible price at/above p90; 10% for single-stock cap; `max(0, currentStockExposure - (sectorExposure-25))` for sector excess; and `max(0, currentStockExposure - (grossExposure-regimeGrossCap))` for gross excess. `existingTargetExposurePct` is the minimum applicable candidate, clamped to 0 through current stock exposure. A missing/stale/outlier p90 never enters this branch because step 3 already returns manual review.
5. Otherwise -> `hold`, target equals current stock exposure.

`InternalActionDecisionV3` reports both branches even when the new-position action is irrelevant to an existing holding. `existingReason` is the first matched reason code; it is independent of new-position zeroed size fields. The public serializer derives `PublicActionDecisionV3` by exact omission of `existingTargetExposurePct|initialPositionPct|maximumPositionPct`; no sizing value is renamed, nested or encoded elsewhere. No branch is modified to achieve a preferred distribution of actions.
