# Change Tasks Draft: improve-stock-discovery-pool

Generated: 2026-06-22
Gate status: blocked until `APPROVE REQUIREMENTS` and `APPROVE DESIGN`.

## Tasks

1. Add characterization tests/audits for current discovery gaps.
   - Extend `audit:missed-hot-symbols` to accept a dynamic hot-symbol fixture.
   - Add fixture mode to `audit:recommendation-pool-freshness`.

2. Implement hot mover discovery normalization.
   - Read full-market price/volume signals where available.
   - Classify limit-up, near-limit-up, unusual volume, and 3/5/10-day movers.
   - Preserve explicit exclusion reasons.

3. Implement social/broker candidate triggers.
   - Normalize broker-leak keywords from Threads/IG/PTT/Telegram/BullTalk/KOL sources.
   - Trigger candidate/revaluation only, never formal promotion.

4. Surface recommendation pool update proof.
   - Add summary fields for new candidates, unchanged reasons, blocked reasons, and archived/reflected counts.
   - Keep homepage copy compact.

5. Verify gates and regressions.
   - Run lint/build, recommendation gates, valuation sanity, revaluation loop, source health, source cadence, missed hot symbols, pool freshness, social surface coverage, and global lead-lag.

## Acceptance Criteria

- A limit-up or unusual-volume fixture stock appears in candidate/early/scenario/hot_tracking or has an explicit exclusion reason.
- Social-only broker leak cannot become formal.
- Recommendation pool freshness can pass without a live local server using fixture mode.
- Existing formal safety gate audit still passes.
- Homepage can explain why the recommendation pool did or did not change.
