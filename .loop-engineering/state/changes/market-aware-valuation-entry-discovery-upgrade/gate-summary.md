# Gate Summary: market-aware-valuation-entry-discovery-upgrade

## Why This Change Exists

The user is not asking for a cosmetic copy change. The app needs to become better at:

- recognizing when price targets are stale because the market/sector has rerated,
- using TAIEX/OTC market state in every stock's buy/hold/reduce decision,
- producing actionable entry/exit plans instead of mostly saying wait or don't buy,
- discovering under-followed candidates through market movers, broker evidence, social sources, and global lead-lag.

## Evidence Collected

- Production `audit:market-index-gate` failed on 2026-06-28.
- Root cause: `/api/radar/daily` strips compact `tradeDecision` from cards even though domain code builds it.
- Impact: homepage cards often show only fallback `entryActionLabel`, with no `positionSize`, `entryZone`, `marketGateReason`, or `exitCondition`.
- Existing v2 entry/revaluation/broker audits pass, so v3 must be stricter and user-visible.

## Approval Needed

The Requirements Gate needs approval because the requested changes touch core recommendation semantics:

- target stale/repricing interpretation,
- market-aware valuation read model,
- entry/exit action labels,
- discovery and broker evidence promotion rules.

## Implementation Order After Approval

1. Fix compact radar payload to include egress-safe `tradeDecision`.
2. Strengthen `audit:market-index-gate` to require action plus position size.
3. Add market-aware valuation adjustment fields to types/read models.
4. Make scenario promotion summaries distinguish market rerating from unsupported price action.
5. Make entry v3 more decisive for scenario-upside stocks while preserving hard blocks.
6. Improve discovery/broker evidence summaries for repricing candidates.

## Required Human Response

```text
APPROVE REQUIREMENTS
```

After that, the next gate will be Design approval.
