## Why

StockInsider's current contract is still centered on a signal-scoring MVP. That is not enough for the actual product goal: finding TW stocks that have not fully moved yet, but could rerate in the next 1-3 months because of story, catalyst, and business verification. We need a new canonical direction that treats narrative discovery, evidence validation, valuation impact, timing, and report output as first-class capabilities.

## What Changes

- Redefine the product around a TW-only, story-driven opportunity radar for 1-3 month ideas.
- Add canonical capabilities for market regime, story discovery, story verification, thesis/valuation, entry-exit strategy, research workbench/reporting, and agent orchestration.
- Change the recommendation contract from "score from mixed signals" to a three-stage lifecycle: `watchlist_candidate`, `validated_thesis`, `actionable_setup`.
- Move LINE and simple dispatch out of the product core and treat them as downstream delivery surfaces.
- Formalize `agency-agents` as an optional vendored prompt/role library, not as the production runtime.

## Capabilities

### New Capabilities
- `tw-market-regime-intelligence`
- `tw-story-discovery`
- `tw-story-verification`
- `tw-thesis-and-valuation-engine`
- `tw-entry-exit-strategy`
- `research-workbench-and-reports`
- `agent-orchestration-and-ops`

### Modified Capabilities
- Merge `market-intelligence` and `market-analysis` under the new market + theme regime model.
- Merge `stock-strategy` and `recommendation-strategy-engine` under thesis lifecycle + execution timing.
- Merge `frontend-dashboard` and `insight-dashboard` under a research workbench model.
- Demote `line-integration` and `line-personalized-alerts` from product core to distribution.

## Impact

- Backend/data model: Adds canonical story, evidence, valuation, report, and agent audit objects.
- Research pipeline: Replaces a single ingest/score flow with multi-stage discovery, verification, ranking, and report generation.
- Product surface: Adds daily radar, hot themes, weekly conviction reports, and on-demand stock deep dives.
- Governance: Requires evidence-based recommendation gating, review queues, and agent audit logs.
- External dependencies: TW official/public sources, public research/news/forum sources, LLM tooling, optional vendored `agency-agents` profiles, optional future runtime integration with multi-agent frameworks.
