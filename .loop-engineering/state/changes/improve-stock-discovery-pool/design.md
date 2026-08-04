# Change Design Draft: improve-stock-discovery-pool

Generated: 2026-06-22
Gate status: draft; design may proceed only after `APPROVE REQUIREMENTS`.

## Approach

Add a discovery layer before recommendation gates. The layer collects high-momentum market movers, social/broker signals, and overseas lead-lag candidates, then normalizes them into candidate evidence. Existing valuation, revaluation, chip/technical, and formal gates remain the promotion boundary.

## Proposed Data Flow

1. Hot mover scan collects full-market TW price/volume signals.
2. Social/broker scan collects source mentions and broker-leak keywords.
3. Discovery normalizer dedupes by symbol and reason.
4. Candidate writer creates/updates candidate records with `candidate_only_until_bridge_pass=true`.
5. Radar read model surfaces new candidates as early/scenario/hot_tracking with explicit reasons.
6. Recommendation gate continues to decide whether a card can become formal.

## Implementation Touchpoints

- `web/src/lib/domain.ts`: add/extend discovery normalization and radar visibility for hot movers.
- `scripts/audit_missed_hot_symbols.js`: expand from narrow sample to dynamic hot-symbol set.
- `scripts/audit_recommendation_pool_freshness.js`: allow fixture/mock mode so it can run without local port `3012`.
- Existing source health and social surface audits remain part of release gate.

## Candidate Classification

- `market_mover`: limit-up, near-limit-up, unusual volume, 3/5/10-day move.
- `social_heat`: Threads/IG/PTT/Telegram/BullTalk/KOL mention spike.
- `broker_leak`: social or public source mentions target price, EPS, rating, US broker, FactSet, or consensus.
- `global_lead_lag`: overseas peer basket leads Taiwan mapped symbols.

## Promotion Policy

- `market_mover`, `social_heat`, `broker_leak`, and `global_lead_lag` can create discovery and revaluation events.
- Formal recommendation still requires Base bridge, valuation sanity, fresh revaluation, entry gate, and current price below Base.
- Scenario/early/hot tracking must show why it is not formal.

## Failure Modes

- If market-wide price scan fails, show degraded source reason and do not fabricate hot movers.
- If social sources are stale, keep last successful summary separate from latest failure.
- If a candidate lacks stock master mapping, record exclusion reason instead of silently dropping it.
- If Supabase I/O risk is high, run full-market hot scan after close and hourly scan only on candidate/theme universe.
