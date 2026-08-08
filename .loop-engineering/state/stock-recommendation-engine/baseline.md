# Baseline: stock-recommendation-engine

Generated: 2026-06-22
Loop command: `$loop-baseline stock-recommendation-engine`

## Domain Scope

Homepage recommendation generation, formal/scenario/early/hot-tracking buckets, recommendation gate metadata, user-visible reason codes, and the source-to-candidate discovery path that feeds those buckets.

## Source of Truth

- INTENDED: `openspec/specs/recommendation-strategy-engine/spec.md` requires deterministic recommendation score, actionable strategy fields, and state transition events.
- INTENDED: `openspec/specs/market-intelligence/spec.md` requires fresh market/stock signals and a freshness gate.
- INTENDED: `openspec/specs/social-sentiment-intelligence/spec.md` requires PTT/Threads/KOL sentiment ingestion and weighted aggregation.
- INTENDED: `AGENTS.md` requires build verification after code changes and secrets protection.
- OBSERVED: `.loop-engineering/policy.yaml` disables auto-merge and auto-deploy.

## Current Implementation Evidence

- Recommendation gate: `web/src/lib/domain.ts` implements `recommendationGateStatus()`, requiring fresh revaluation, strict Base upside, non-blocked entry, verification, and valuation sanity before `formal_pass`.
- Bucket display: `recommendationDisplayBucket()` maps non-formal cards into scenario, early, revaluation queue, or valuation-reflected archive.
- Radar assembly: `getRadarPayload()` builds same-day recommendation rows, scenario candidates, early watchlist, hot tracking, and discovery freshness summary.
- Discovery path: `runStoryScan()` combines fixed research seeds, recent `source_raw_documents`, passive-components/MLCC themes, additional discovery themes, and global lead-lag baskets.
- Recommendation batch: `runRecommendationBatch()` runs `theme_scan → story_scan → story_verify → thesis_rank → report_build`.

## Behavior Classification

- INTENDED: Formal recommendation must not be filled by historical fallback or over-target names.
- INTENDED: Social/ML/broker-leak signals can trigger discovery or revaluation but cannot alone make a formal recommendation.
- OBSERVED: Formal recommendation gate is strict; latest audit saw `opportunities=0`, `scenarioUpsideCandidates=2`, `earlyWatchlist=12`.
- OBSERVED: Current discovery is theme/story/source driven, not guaranteed to start from full-market daily limit-up, near-limit-up, or unusual-volume scans.
- OBSERVED: `missed-hot-symbols` currently checks a narrow sample (`3008`) and passed; it does not prove all market limit-up stocks are captured.
- OBSERVED: `recommendation-pool-freshness` requires a running app at `http://127.0.0.1:3012` by default; without that runtime it fails with `fetch failed`.
- UNKNOWN: Whether the hourly/local worker consistently writes all social surfaces before radar generation.
- UNKNOWN: Whether TWSE/TPEx full-market daily price/volume movers are available in Supabase with enough timeliness to drive a first-layer discovery feed.
- UNKNOWN: Which current sources reliably expose broker upgrades or target-price leaks early enough for discovery.

## Characterization Evidence

- `cd web && npm run lint`: PASS with existing warnings in `web/src/lib/research-v2.ts`.
- `cd web && npm run build`: PASS.
- `npm run audit:recommendation-gates`: PASS; report `.agent/reports/recommendation-gates-audit-2026-06-22T14-38-54-747Z.json`.
- `npm run audit:missed-hot-symbols`: PASS; report `.agent/reports/missed-hot-symbols-audit-2026-06-22T14-38-59-701Z.json`.
- `npm run audit:source-health`: PASS; report `.agent/reports/source-health-audit-2026-06-22T14-38-53-659Z.json`.
- `npm run audit:recommendation-pool-freshness`: BLOCKED; default local radar URL was unavailable.

## Characterization Test Backlog

1. Add a fixture/API-level test proving formal recommendations cannot include `currentPrice >= baseTarget`.
2. Add a fixture/API-level test proving scenario candidates with `baseTarget <= currentPrice < scenarioTarget` show scenario upside, not only `needs_revaluation`.
3. Extend `missed-hot-symbols` to check a full dynamic hot-symbol set, not only a fixed small sample.
4. Add a discovery-pool test proving a synthetic limit-up/volume-spike stock becomes discovered/watchlist/hot_tracking or receives an explicit exclusion reason.
5. Add a social/broker-leak test proving a synthetic broker-target mention triggers revaluation but not formal recommendation.
6. Add a pool-freshness test that can run against a mock radar payload without requiring local port `3012`.

## Unresolved Decisions

- Whether discovery should scan full TWSE/TPEx every hour or only after close, given Supabase I/O constraints.
- Whether first-layer hot movers should be visible as `hot_tracking` even when no thesis/valuation bridge exists.
- Whether to add a durable `market_mover_candidates` table or reuse existing `story_candidates`/`source_raw_documents` plus read models.
- Whether Spec Kit should be installed and used in parallel with OpenSpec before the next implementation run.
