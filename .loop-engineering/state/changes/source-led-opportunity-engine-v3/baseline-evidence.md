# Baseline Evidence: source-led-opportunity-engine-v3

Captured: 2026-07-18 Asia/Taipei

## Repository Evidence

- `.agent/scripts/data-collect-local.js` declares 30 `ALL_SEEDS` and says they must match `TW_STORY_RESEARCH_SEEDS`.
- `scoreStoryDrivenCandidates()` only scores stocks already present in stories, current themes or recent raw documents; it does not create a full-market discovery universe.
- `buildPeScenario()`:
  - accepts observed PE up to 140x,
  - uses current/observed PE as an EPS anchor,
  - never lowers Base margins below the higher of current or profile Base,
  - permits Base/Up PE up to 60x/70x,
  - weights a broker target at 72% of Base.
- `buildAssistiveMlForecastBand()` is `stockinsider-assistive-baseline-v0` and explicitly says `待接 ml_forecast_snapshots`.

## Production Evidence

Read-only request:

```bash
curl -L --fail --silent https://stockinsider-three.vercel.app/api/radar/daily
```

Observed on 2026-07-18:

```json
{
  "asOf": "2026-07-18",
  "marketStatus": "risk_on_can_attack",
  "taiexState": null,
  "otcState": null,
  "breadthState": null,
  "foreignFlowState": null,
  "opportunities": 1,
  "scenario": 6,
  "early": 12,
  "hot": 12,
  "discovered": 0,
  "sourceRecordsWritten24h": 644,
  "newCandidates24h": 0,
  "globalLeadLagMeasuredThemes": 0,
  "globalLeadLagPendingPriceRefresh": 7
}
```

Representative valuation anomalies in the same payload:

- `2337`: Base upside 140.32%, scenario upside 220.16%.
- `6230`: Base upside 81.26%, scenario upside 161.66%.
- `2356`: Base upside 117.93%, scenario upside 209.50%.
- `3231`: Base upside 104.90%, scenario upside 204.99%.

These are marked insufficient bridge but can still display a buy-like action. This proves the app currently mixes research confidence with trading action and can show precise but unsupported valuation ranges.

## RED Conclusions

V3 is RED until executable fixtures prove:

1. approved-source documents link to candidates or a typed rejection;
2. source refresh without linked candidates is reported as an extraction/funnel failure, not healthy stasis;
3. incomplete market data cannot emit an affirmative risk-on regime;
4. valuation outliers fail closed before any buy-like action;
5. constructive fixtures can produce bounded starter actions without weakening formal research evidence;
6. model labels correspond to registered artifacts and out-of-sample metrics.
