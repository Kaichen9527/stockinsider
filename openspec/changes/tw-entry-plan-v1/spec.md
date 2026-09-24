# Taiwan daily entry plans — PR1
Status: implementation authorized by the user's 2026-09-24 instruction「我要你直接在這裡修改，我不用轉換去 Codex@GitHub」following the reviewed PR1 handoff. This authorizes the requested branch/PR implementation, not merge, deployment, production migration or schedule changes.
Baseline: main 9fd86fe620ccc63c89c4acd208327bf2c4e15332.

## Requirements
Implement versioned research-only breakout and confirmed uptrend pullback plans for existing Taiwan candidates. Preserve formal lifecycle, market, overseas, valuation and two-close gates. Display raw technical signal separately from formal eligibility and research validation status.
Use the handoff's tw-entry-plan-v0.1 formulas: 240 verified completed-session bars; Wilder ATR14; prior20 high/low and average volume excluding today; close>MA20>MA60 with non-declining five-session MA60. Breakout requires first tick above prior20 high and 1.5x prior20 mean volume; pullback touches MA20±0.5ATR and closes above previous high. Entry/no-chase/stop formulas follow the handoff, with legal Taiwan stock ticks. No position or fill inference.
Signal availability follows source/corporate-action/calendar known times. Plan is for next official session only; no future bars or weekday calendar fabrication.
Show immutable OHLCV, volume, MA, horizontal structure and plan levels in existing detail; compact same-revision summary in radar. Existing revisions without the new envelope remain readable and visibly unavailable.
PR1 excludes pattern classification (channels/triangles), strategy profitability, execution backtesting, new data purchases, broker orders and relaxed formal gates.

## Frozen calculation contract
Let A be Wilder ATR14 on the final 240 completed bars; M20/M60 include signal-session close C. R20/S20 and V20 are high/low and mean volume of the preceding 20 sessions, excluding the signal session. Trend requires C > M20 > M60 and M60 >= M60 five sessions earlier.
- Breakout: C >= next legal stock tick strictly above R20 and volume >= 1.5 V20. Lower = nextTick(R20); upper = floorTick(min(C + 0.25 A, R20 + 0.75 A)); risk line = floorTick(R20 - A).
- Pullback: signal range intersects M20 ± 0.5 A; C >= M20 and C > previous high. Lower = C; upper = floorTick(min(C + 0.25 A, M20 + A)); risk line = floorTick(min(signal low, M20) - 0.5 A).
- A valid zone requires 0 < risk line < lower <= upper. An upper below lower or signal close above upper preserves the raw confirmation but withholds the entry zone as avoid_chase.
- The plan is valid for the next official session only. Publication at/after its open cannot claim that opening; publication at/after its close is expired. Source cutoff and actual plan publication time are distinct.
- Exit rules apply only if entered under this strategy: initial risk line, close below MA20, or 20-session holding limit. Close/time exits refer to the next tradable time, never a fabricated personal fill.
- All output remains research_only. The current classifier has no audited execution-liquidity gate, so it is explicitly unavailable for this additional qualification; no new volume threshold is invented.
- A recent share-changing event requires comparable volume evidence. Existing price-only adjustment factors cannot silently adjust share volume.

## Acceptance
The executable inventory is P1-01 through P1-10 in acceptance-tests.md. Existing approved acceptance is unchanged.
