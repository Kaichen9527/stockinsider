# PR #279 exact implementation review

Result: `PASS`

Findings: `P0=0 P1=0 P2=0`

Reviewer: Codex performed a separate final read-through and execution review. This session also authored the official-authority backfill repair, so the review is not represented as independent of every implementation author. Earlier PR #279 research/entry-plan changes were separately reviewed before this final delta.

## Exact reviewed identity

- Final reviewed repair/tree: `5a12d0c8b384d2d1ace3e39b326fc0e995af23f3` / `85ed426aa7bf0ea7c4b6994b3603b9b2c6533db0`
- Full final range: `c6818f0de43f68fe24deb486ff41795f7e946f8a..5a12d0c8b384d2d1ace3e39b326fc0e995af23f3`
- Active graph: `da0305fd3f28b39964617a4b6eb4fce7bd94d3db0884d0b4b3d47a3c0f047fd0`
- Scope: the 66-path PR product diff from the repaired protected main, including the additive SQL migration, official feed loader, authenticated resumable authority acquisition, shared candidate roster, research calculation, page integration and publication conservation checks.

## Review conclusion

The two `research_only` plans remain separate from formal investment eligibility and user holdings. Their inputs are bound to official completed sessions and immutable candidate revisions; missing price/adjustment evidence returns a typed insufficient result. Home, Radar and individual detail use the same run/revision summary, with publication blocked on missing or mismatched candidate results. Full-run backfill freezes a roster/calendar, ingests monthly official OHLCV and corporate-action ranges through the existing principal-bound price-authority RPC, records source URL/hash and retry state, and does not publish directly. The authenticated route requires the active VPS writer. The new tables are additive, RLS-enabled and have no anonymous/public write grant.

A review found that the first backfill implementation summarized only one default database page. The final subject fixes that with bounded 1,000-row pagination and a 1,001-row regression, so pending work beyond the first page cannot be reported complete. No code path in this PR relaxes the V3 protected graph, exact-review grammar or production publication gate. The main graph registration was repaired separately in PR #280 and carried into this exact subject unchanged.

## Reproduced verification

- Product-correctness suite on this final implementation commit: 155 passed, zero failed/skipped/todo. Its stdout SHA-256 and all 31 passing PCR case names are bound in `pcr-fulfillment-record-v1.json`.
- Entry-plan and official-authority tests: 98 passed, zero failed/skipped/todo.
- Model-runner V3 tests: 21 passed, zero failed/skipped/todo; disabled-mode V3.18 host doctor passed.
- TypeScript and production web build passed. Lint reported zero errors and 33 pre-existing warnings. Focused PostgreSQL migration/RLS/idempotence checks and prior seven browser checks passed before the final protected mapping merge; the final merge changes no product UI or migration bytes.
- `git diff --check` on the exact reviewed range passed.

## Release boundary

This exact code review is not production acceptance. The official full-roster backfill, live conservation check, current service failures and Contabo capacity remain open. The host resource check at 2026-09-24T13:06:54Z blocked the declared 4 GiB workload: 14.23 GB then available, projected 9.94 GB, below the 15 GiB reserve. The checked-in obsolete SOHO image refs are absent on the host, so no cleanup was performed. Merge and deployment still require the protected root Code Gate and a fresh capacity/backup/cutover check.
