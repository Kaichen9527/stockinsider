# Technical Decision Contract: source-led-opportunity-engine-v3

Version: `opportunity-technical-decision-v3.11.1`

Fundamentals answer why a stock merits research. This contract answers when a new long
entry is technically admissible and where its risk is invalidated. It is evaluated
before every buy-like decision branch.

## Point-in-time adjusted inputs

For one deep candidate, select exactly the latest 122 completed Taiwan sessions at or
before `sourceCutoff` from the frozen trading calendar and price manifest. Every row
must carry one cutoff-valid official corporate-action snapshot and the manifest's
adjustment factor. Adjusted OHLC are raw OHLC multiplied by the factor; adjusted volume
is raw volume divided by it. A zero/non-finite factor, duplicate session, non-monotonic
date, high below max(open,close), low above min(open,close), negative volume, fewer
than 122 consecutive completed sessions, or a row after cutoff returns:

```ts
{
  contractVersion:'opportunity-technical-decision-v3.11.1',
  availability:'unavailable',
  state:null,
  reason:'insufficient_adjusted_history'|'corporate_action_authority_missing'|
    'invalid_ohlcv'|'nonconsecutive_sessions'|'future_observation'|
    'volume_reference_unavailable'|'taiex_reference_unavailable'|
    'insufficient_support_structure'|'invalid_entry_geometry',
  asOf:string,
  trigger:null,
  entryZone:null,
  invalidation:null,
  indicators:null
}
```

No unavailable branch synthesizes an indicator or signal.

The same immutable `technical_history_reference` carries the at-most-122 ordered
`market_benchmark_rows` owned by `manifest-storage-contract.md`; the consumer selects
the exact stock window and requires a one-for-one session match before computing
TAIEX relative strength. This is frozen input, not a request-path or worker live read.

Unavailable reasons use this exhaustive first-match order:

1. any row after cutoff -> `future_observation`;
2. absent/wrong cutoff-valid action snapshot or feed identity ->
   `corporate_action_authority_missing`;
3. non-finite/non-positive adjustment factor, invalid OHLC relation or negative/
   non-finite volume -> `invalid_ohlcv`;
4. duplicate, non-monotonic or calendar-gap session -> `nonconsecutive_sessions`;
5. fewer than 122 otherwise valid rows -> `insufficient_adjusted_history`;
6. zero/non-finite prior-20-volume mean -> `volume_reference_unavailable`;
7. absent/misaligned/non-finite TAIEX series -> `taiex_reference_unavailable`;
8. missing confirmed support or resistance -> `insufficient_support_structure`;
9. a derived trigger/entry/stop violating final geometry ->
   `invalid_entry_geometry`.

The first reason returns the complete unavailable object above. Missing sector
benchmark alone is not in this list and leaves only sector relative strength null.

Indicators use unrounded double precision and are rounded only at serialization:

- `MA20|MA60|MA120`: arithmetic mean of adjusted closes over exactly 20/60/120
  sessions including the current row.
- `RSI14`: Wilder smoothing. Seed average gains/losses from the first 14 close
  differences in the 122-row window, then apply
  `(previous*13+current)/14`; zero loss gives 100, zero gain and loss gives 50.
- `EMA(n)`: seed with the arithmetic mean of the first `n` closes, then
  `alpha=2/(n+1)`. MACD is `EMA12-EMA26`; signal is EMA9 over the MACD series and
  histogram is MACD minus signal.
- true range is `max(high-low,abs(high-priorClose),abs(low-priorClose))`; ATR14 uses
  the same Wilder seed/update.
- `volumeRatio20 = currentVolume / mean(previous 20 completed-session volumes)`;
  a zero/non-finite denominator returns
  `unavailable/volume_reference_unavailable`.
- stock/index and stock/sector relative strength are respectively
  `100*((stockClose/stockClose20)-(benchmarkClose/benchmarkClose20))`. Both benchmark
  series must be in the same completed-session manifest; a missing sector benchmark
  makes only sector relative strength null, while missing/misaligned TAIEX returns
  `unavailable/taiex_reference_unavailable`.

TA-Lib may be used only as a test oracle. Production outputs must match the formulas
above within absolute `1e-9` before serialization.

## Support, resistance and ticks

A confirmed pivot low at session `i` has `low[i] <= low[i-1],low[i-2],low[i+1],low[i+2]`;
a confirmed pivot high uses the symmetric `>=` rule. Consider only pivots in the last
60 sessions excluding the current two unconfirmable sessions. Support is the most
recent pivot low not above the previous session's close; ties use lower price then
earlier date. Resistance is the most recent pivot high strictly above support; ties
use higher price then earlier date. Missing either pivot returns
`unavailable/insufficient_support_structure`.

Taiwan tick size at a positive trigger price is deterministic:
`<10:0.01`, `10..<50:0.05`, `50..<100:0.1`, `100..<500:0.5`,
`500..<1000:1`, `>=1000:5`. `roundDownToTick` and `roundUpToTick` use integer tick
quotients with an absolute `1e-9` comparison tolerance.

## Typed state

Available output is:

```ts
type TechnicalStateV311 =
  'below_support'|'reclaim_required'|'at_support'|'breakout_pending'|
  'breakout_confirmed'|'extended'|'invalidated';
type TechnicalDecisionV311 = {
  contractVersion:'opportunity-technical-decision-v3.11.1';
  availability:'available';
  state:TechnicalStateV311;
  reason:null;
  asOf:string;
  currentPrice:number;
  support:number;
  resistance:number;
  trigger:null|{
    kind:'reclaim'|'breakout'|'pullback';
    threshold:number;
    volumeRatioMinimum:number|null;
  };
  entryZone:null|{
    kind:'market_zone'|'trigger_zone';
    lower:number;
    upper:number;
  };
  invalidation:null|{
    stop:number;
    thesisLevel:number;
  };
  indicators:{
    ma20:number;ma60:number;ma120:number;rsi14:number;
    macd:number;macdSignal:number;macdHistogram:number;atr14:number;
    volumeRatio20:number;relativeStrengthTaiex20:number;
    relativeStrengthSector20:number|null;
  };
};
```

Use the first matching state:

1. current close `< support-ATR14` -> `invalidated`;
2. previous close `>= support` and current close `< support` -> `below_support`;
3. a close below the same support occurred in the preceding 20 sessions and current
   close is `< support+0.25*ATR14`, or it is at/above that level without
   `volumeRatio20>=1.20` -> `reclaim_required`;
4. `close/MA20-1>0.12` or RSI14 `>=75` -> `extended`;
5. close `>= resistance+tick`, volume ratio `>=1.20`, MACD histogram `>0` and TAIEX
   relative strength `>0` -> `breakout_confirmed`;
6. `support <= close <= support+0.50*ATR14` -> `at_support`;
7. otherwise -> `breakout_pending`.

The first-break state is therefore observable for one session; a later unreclaimed
break is `reclaim_required`, and a structural break more than one ATR is
`invalidated`. A reclaimed stock leaves those states only after the stated close and
volume conditions.

## Trigger, entry and invalidation geometry

- `below_support|reclaim_required`: no entry zone/invalidation; trigger is
  `reclaim` at `roundUpToTick(support+0.25*ATR14)`, volume minimum 1.20.
- `invalidated`: all three are null.
- `extended`: no entry zone/invalidation; trigger is `pullback` at
  `roundDownToTick(MA20*1.08)`, volume minimum null.
- `breakout_pending`: trigger is `breakout` at `roundUpToTick(resistance+tick)`;
  entry is a conditional `trigger_zone` from that threshold through
  `roundUpToTick(resistance+0.50*ATR14)`.
- `at_support`: entry is a `market_zone` from `roundDownToTick(support)` through
  `roundUpToTick(max(currentPrice,support+0.25*ATR14))`.
- `breakout_confirmed`: entry is a `market_zone` from current price through
  `roundUpToTick(currentPrice+0.25*ATR14)`.

For every non-null entry, stop is
`roundDownToTick(min(support-0.50*ATR14,entry.lower-tick))` and thesis level is
support. Failure of any final check returns the complete
`unavailable/invalid_entry_geometry` object with no partial
trigger/entry/invalidation unless:

```text
0 < entry.lower <= entry.upper
stop < entry.lower
market_zone: entry.lower <= currentPrice <= entry.upper
trigger_zone: currentPrice < entry.lower
```

A trigger zone above current price is labelled breakout/reclaim and never “pullback”.
A stop or invalidation at/above entry is impossible. A price below support never emits
a buy zone; it can only wait for reclaim.

## Decision precedence

`technicalBuyEligible` is true only for available `at_support|breakout_confirmed`
with non-null valid entry/invalidation. `technicalWaitEligible` is true only for
available `below_support|reclaim_required|breakout_pending|extended` with its exact
trigger. `invalidated` and unavailable data block both.

Wait eligibility never rewrites this object. In particular, `breakout_pending`
retains its conditional `trigger_zone` and typed invalidation when a downstream
decision becomes `wait_trigger`; the action serializer publishes the trigger but
uses a null action-level public stop. The other three wait-eligible states retain
the null/non-null geometry stated above. Internal technical geometry and public
non-buy invalidation are separate typed fields, not competing stop authorities.

`decision-contract.md` must apply this gate before `starter_now|event_starter`:

- buy-like action requires `technicalBuyEligible`;
- normal valuation plus `technicalWaitEligible` may produce `wait_trigger`;
- missing, stale or outlier valuation always produces `valuation_review`, never a
  technical wait or buy;
- unavailable/invalidated technical state produces `avoid` with
  `entry_data_unavailable|entry_invalidated`;
- the public `technicalDecision` copies this complete object without prose inference;
  `actionDecision` copies its trigger and only a buy-like typed stop under
  `decision-contract.md`, while every non-buy action-level stop remains null.

## Additive BIAS extension

`factor-correctness-amendment.md` v3.11.6 adds a non-entry-rewriting `maDeviation`
member. It is derived only after this contract has produced valid adjusted MA20/60/120
and ATR14; a failure in this contract therefore serializes the closed unavailable
BIAS branch with no numeric value. For an otherwise available technical result,
`technical_history_reference` supplies at most 877 unique completed sessions per deep
symbol through at most 1,597 block-anchored adjusted OHLC tuples with complete
price-adjustment evidence; its 120-row inclusive endpoint windows yield at most 758
strictly-before-as-of BIAS observations. `bias_reference` supplies the current
full-roster sector snapshot. Neither source may be reread live, extended with an older
sparse prefix or substituted by unadjusted prices. The extension cannot alter state
classification, trigger, entry or stop geometry: `below_support`, `reclaim_required`
and `invalidated` remain prior hard action blocks even at an extreme-low BIAS
percentile.
