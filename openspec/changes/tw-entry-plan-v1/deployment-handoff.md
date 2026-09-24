# Deployment and full-roster acceptance

PR: https://github.com/Kaichen9527/stockinsider/pull/279

This is a deployment handoff, not deployment authorization or a release PASS.

## Required gates first
Use the exact final reviewed branch commit. Re-run required CI, Requirements, Architecture and exact-review checks; preserve existing assertions and formal publication gates. The protected worker currently lacks graph-bound review sources for the active graph already present on main (`da0305fd3f28b39964617a4b6eb4fce7bd94d3db0884d0b4b3d47a3c0f047fd0`). That requires genuine independent reviews and the protected-base evidence registration workflow. A feature-branch mapping edit or copied attestation is not a repair.

## Deployment operator
After the required review and authorized merge, a Codex session with the existing Contabo VPS access can use the repository's reviewed standalone packaging, single-writer locks, health checks and rollback procedure. Follow `deployment/vps/CAPACITY_AND_BACKUP.md`; do not infer Vercel deployment from the older overview in AGENTS.md. No secrets belong in chat or this document.

## Full research refresh
Run the existing authenticated core pipeline with a real current cutoff and the existing single-writer lease. Do not restrict `symbols`, do not use `dryRun`, and explicitly avoid `skipIfResearchSessionComplete` for this first acceptance run. The bounded `candidate-research-run` endpoint is only a 1–5 stock canary and does not itself publish the full homepage/Radar dataset.

The new producer version is `candidate-research-v4.4.2`. The strategy formula remains `tw-entry-plan-v0.1`; existing revisions stay immutable. A deployment alone does not create new analysis for historical rows.

Resume completion requires both successful research and its matching successful pipeline. A publication failure therefore remains eligible for retry. Existing oldest-session backlog ordering is retained: older-than-current ready sessions append historical research only and do not replace or mark failed the current public snapshot. The explicit initial current full run above is still required; do not wait for a multi-session historical backlog to update today's site.

Before describing all stocks as usable plans, inventory the 240 completed-session official observations, calendar and corporate-action adjustment evidence for the complete candidate roster. The existing `official_price_history` refresh does not by itself populate the strategy's `opportunity_price_observations_v3` and adjustment authority. Repair missing evidence only through authorized acquisition/guarded producer paths. Never label raw prices as verified adjusted prices to make coverage pass.

## Report actual results
Report source commit, research run ID, source/authority cutoffs, expected stock count, evaluated count, data-insufficient count, unavailable/failed/missing/duplicate counts, excluded symbols and their reason, and final snapshot publication time. Required conservation:

`expectedCount = evaluatedCount + dataInsufficientCount`

Missing, duplicate, invalid, unavailable and failed plan outcomes must be zero for complete plan coverage. Data-insufficient is an explicit processed result, not a complete price plan. Independently verify every newly published Taiwan stage card uses its same-run saved revision and compact summary; source-signal links must reach current technical research without changing older decision pages.

All results remain research-only. Current production liquidity qualification is unavailable; this work does not enable brokerage execution or guarantee trading profitability.

Source/stage scans are complete up to explicit 100,000-row bounds and fail on overflow. Record live scanned rows/pages and duration during acceptance; the historical stage plane eventually requires latest-per-stock query optimization rather than larger silent truncation limits.
