# AUO 2409 market-event revision — 2026-09-22

## Decision

The prior preview was not fit for a current entry decision. It froze price and prose at 2026-09-18, treated the 75th percentile P/B as an upper bound, and never advanced its breakout state. This revision separates traditional operations, transformation evidence and the dated trading setup.

## Point-in-time evidence

- AUO disclosed Micro LED CPO and glass-core-substrate work on 2026-08-31. This establishes technical activity, not an Intel order or production revenue.
- Public Intel-collaboration reporting is recorded as a rumor from 2026-09-20/21. No AUO/Intel joint announcement, purchase order or production schedule was found in the reviewed primary sources.
- TWSE closes were 30.35 on 2026-09-18, 33.35 on 2026-09-21 and 36.65 on 2026-09-22. The two-session return was 20.76%.
- The 2026-09-19 setup used a 32.2 close trigger and a 36.6 measured target. The replay reaches `target_reached` on 2026-09-22 without moving either threshold.
- The 60-observation P/B ledger has p25/p50/p75 of 0.70/0.77/0.85 and a maximum of 1.65. P75 is not a historical upper bound.

## Changes

- Updated the AUO research artifact and official price ledger through 2026-09-22.
- Added an event timeline, transformation evidence ladder, 2029 discounted EPS sensitivity and 20x/24x current-price reverse valuation.
- Changed usable positive-EPS scenarios to use normalized P/E as the scenario value while retaining P/B as a separately displayed asset cross-check.
- Added immutable dated breakout evaluation, trading-day freshness and volume bars.
- Added an authenticated bounded `research-inbox` endpoint with content hashes, first-observed timestamps, rumor/reported/confirmed/denied states and public/authenticated-summary rights boundaries.
- Added Other revenue to the quarterly forecast table so displayed segment revenue reconciles to consolidated revenue.

## Verification

- 15 focused Node tests passed.
- TypeScript passed.
- Scoped ESLint passed with zero warnings.
- AUO preview, valuation and governance contract tests passed.
- Next.js production build passed and includes `/api/internal/research-inbox` and `/preview/auo-2409`.

## Remaining boundary

The inbox is a guarded import surface, not proof that every social platform is readable. A scheduled local Codex run must report each attempted source as read, empty or failed; authenticated content may contribute only a bounded summary and citation, never cookies, session material or member-only full text.

## 2026-09-23 18:00 follow-up

- TWSE recorded a 34.70 close, down 5.32%, after opening and trading as high as 36.65. Volume was 948,644,349 shares and turnover was NT$33.26 billion.
- The frozen 9/19 breakout remains `target_reached` on 9/22. The 9/23 pullback does not rewrite that outcome and is only the first completed session after the target; it is not yet a completed pullback entry signal.
- The reviewed AUO and Intel official pages contained no new partnership confirmation. The current MOPS open-data snapshot returned no new 2409 material announcement, and public news searches did not add an independent source beyond the existing rumor chain.
- Public official, news and PTT coverage succeeded. Authenticated Threads, Instagram and Facebook were unavailable to this run and remain explicitly unreviewed rather than recorded as having no result.
- The versioned preview was updated to 34.70, including the event timeline, reverse EPS requirements, P/B cross-check and post-target trading condition.
