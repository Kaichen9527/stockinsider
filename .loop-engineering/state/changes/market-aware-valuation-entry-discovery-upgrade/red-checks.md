# RED Checks: market-aware-valuation-entry-discovery-upgrade

These checks define what must fail before implementation and pass after implementation.

## RED-1: Radar Cards Must Carry Compact Trade Decision

Command:

```bash
npm run audit:market-index-gate -- --base-url https://stockinsider-three.vercel.app
npm run audit:market-aware-entry-v3 -- --base-url https://stockinsider-three.vercel.app
```

Current production result:

- Fails with `missing_trade_decision`.

Required pass behavior:

- Every visible radar card in:
  - `opportunities`,
  - `scenarioUpsideCandidates`,
  - `earlyWatchlist`,
  - `hotTracking`
  must include:
  - `tradeDecision.action`,
  - `tradeDecision.positionSize`,
  - `tradeDecision.entryZone` or actionable trigger,
  - `tradeDecision.stopLoss`,
  - `tradeDecision.marketGateReason`.

Allowed exception:

- A card may omit `tradeDecision` only if it includes `tradeDecisionUnavailableReason`, but this should be rare and must not affect all visible cards.

## RED-2: Scenario-Only Cards Must Not Collapse To Generic Waiting

Fixture shape:

```json
{
  "symbol": "SCENARIO1",
  "currentPrice": 120,
  "baseTarget": 100,
  "upsideTarget": 160,
  "targetCoverageStatus": "scenario_only",
  "marketGateStatus": "risk_on_can_attack",
  "entryDecision": { "action": "等回測", "buyZone": "回測 115-120", "stopLoss": "跌破 110" }
}
```

Required pass behavior:

- `tradeDecision.action` is one of:
  - `突破追蹤買進`,
  - `等回測買點`,
  - `可分批買進`,
  - `不追價` only when paired with a trigger.
- Must include:
  - scenario upside explanation,
  - non-formal label,
  - repricing required evidence.

## RED-3: Over-Scenario Cards Must Be Hot Tracking, Not Buy

Fixture shape:

```json
{
  "symbol": "OVER1",
  "currentPrice": 180,
  "baseTarget": 100,
  "upsideTarget": 160,
  "targetCoverageStatus": "over_base_and_scenario",
  "marketGateStatus": "risk_on_can_attack"
}
```

Required pass behavior:

- `tradeDecision.action` is `停利`, `減碼`, `出場`, or `不買`.
- Must show:
  - `hotTrackingReason` or `archiveReason`,
  - evidence required to raise target,
  - no formal recommendation.

## RED-4: Market Block Must State Decision Budget

Required payload:

- `marketIndexSignal.riskBudget`
- `marketIndexSignal.entryBias`
- `marketIndexSignal.exitBias`
- `marketBreadthSummary` or equivalent summary
- homepage market block must be able to render:
  - can buy / hold / reduce guidance,
  - not only a regime enum.

## RED-5: Broker Evidence Must Be Classified

For any repricing candidate:

- verified broker consensus should be classified separately from:
  - public news summary,
  - imported report,
  - `social_broker_leak`,
  - no hit.

Required pass behavior:

- `brokerEvidenceSearchStatus.summary` must mention the evidence class or source type.
- Social broker leaks may trigger revaluation but must not mark `verifiedForBase=true`.

## RED-6: Discovery Must Explain No Movement

If recommendations do not change:

- `discoveryFreshnessSummary.unchangedReason` must identify one dominant reason:
  - no new candidate passed Gate,
  - source stale,
  - price reflected,
  - bridge insufficient,
  - broker evidence missing,
  - revaluation queued.

Generic `沒有通過 Gate` alone is not enough.
