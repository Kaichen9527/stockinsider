# PR1 validation — 2026-09-24

Implementation is prepared for review against main `9fd86fe620ccc63c89c4acd208327bf2c4e15332`. User authorized direct implementation in this session. No production migration, execution, merge, release activation or schedule change was performed.

Delivered on branch `codex/tw-entry-plan-v1` as [draft PR #279](https://github.com/Kaichen9527/stockinsider/pull/279). Initial implementation commit: `a3573a1639190be8b793198acb77d2f7271e6cfa`.

## Executed evidence

| Check | Result |
|---|---|
| `npm run test:tw-entry-plan` | 61 passed, 0 failed/skipped; includes 5 build-bridge tests and 56 strategy/authority/envelope/store/transport/formal-gate regressions |
| `npm --prefix web run typecheck` | Passed; final production build also completed TypeScript |
| `npm --prefix web run lint` | Exit 0, no errors; 33 pre-existing unused-variable warnings in unchanged files |
| `npm --prefix web run build` | Passed, 91 static pages generated; original `next.config.ts` retained |
| Playwright trade-plan suite | 3 passed in Chromium; desktop 1280px and mobile 360px screenshots reviewed, no horizontal overflow or browser page errors |
| Standalone smoke outside repository | Flat `server.js` starts with no sibling runtime scripts; `/privacy` 200, development fixture 404 even with fixture environment enabled, unauthenticated research POST 401 |
| `git diff --check` | Passed |

Playwright command: `cd web && npx playwright test --config playwright.trade-plan.config.ts`. The environment's normal Playwright browser download was unavailable; verification used a temporary external Chromium executable through `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`, without modifying project dependencies. An external CJK font enabled readable screenshot inspection. Test screenshots are under `web/test-results` and local unit evidence under `.agent/reports/2026-09-24/tw-entry-plan-v1`.

P1-01–P1-05 and P1-09 are covered by core/authority/envelope cases; P1-06 by envelope, append-store and transport cases; P1-07–P1-08 by UI and existing stage-classifier regressions; P1-10 by browser, summary-size and transport checks. Tests use synthetic fixtures; they are not trading backtests or evidence of investment performance.

## Independent review and resolved findings

The separate reviewer assessed requirements/design and then the implementation without editing it. No high or blocking findings remain in the reviewed scope. Fixes and regression evidence cover:

- Old immutable raw observations retain their own calendar revision, instead of being rejected against a newer head.
- Cutoff-known ad hoc cancellations override annual schedules for both past and future sessions.
- Publication time is captured after acquisition/computation and cached for retry; it is not copied from old source availability.
- Recent share-changing events cannot silently create a comparable raw-volume ratio.
- Byte-identical generated build inputs reuse existing validators while preserving the original flat standalone layout. Five bridge checks were also independently rerun.

This is a scoped code assessment, not a formal Code/Release Gate PASS.

## Remaining release evidence and behavior

Actual production authority-table coverage and live candidate publication were not exercised. A complete 240-session price/corporate-action/calendar chain is required; otherwise the attachment records the data gap and supplies no synthetic candles. Existing revisions remain readable with the previous close-line chart.

The active candidate classifier has no verified execution-liquidity predicate. The new plan therefore identifies that qualification as unavailable and remains `research_only`, while preserving existing formal stage decisions.

Representative card-plane fixture sizes are 110,431 bytes for 40 Radar cards and 182,822 bytes for 24 cards in each of three home stages. Summary is independently capped at 1,800 UTF-8 bytes. These are local fixture measurements, not validation of complete live HTTP payload budgets; production response-size/canary evidence remains a release check.

Future official annual calendar availability, closed-day overrides, and underlying authority retention are operational dependencies. No broker orders, position assumptions or new strategy-performance claims are introduced. Merge/deployment remain separate actions.

## Follow-up: full screened roster

The same-day user clarification requested all screened candidates. The implementation now unions current screens and all published windows with the normal universe, records conserved per-stock outcome counts, and checks each new Taiwan stage card against the current run's saved revision and summary. Data gaps remain separate from evaluated/usable plans. Research model version advances to v4.4.2; the strategy and formal classification formulas stay unchanged.

Final local verification for this follow-up:
- `npm run test:tw-entry-plan`: 92 passed, zero failed/skipped, including published-roster, coverage and resume cases.
- Candidate research/policy, authority pagination, public request boundary and internal sequence regression files: 49 passed, zero failed/skipped.
- Trade-plan Playwright suite: 4 passed; unchanged V3.13 landing, V3.14 stale revision and V3.17 waiting-source checks: 3 passed.
- Full lint: zero errors, the same 33 pre-existing warnings. TypeScript and production build pass; 91 static pages generated.
- Isolated flat standalone package outside the repository: privacy 200; source-navigation fixture 404 even with `OPPORTUNITY_V3_UI_FIXTURE=enabled`; unauthenticated candidate and pipeline POSTs both 401 with a synthetic local auth fixture. Missing auth configuration itself retains the existing fail-closed 500 behavior.
- Broader `test:evidence-recovery` diagnostic: 42 of 43 passed; the PostgreSQL test could not run because this environment lacks `initdb`. It was not skipped or weakened. This is not a full CI/release PASS.

Independent follow-up review found and resolved civil-date handling, legitimate cross-bucket card duplication, failed-publication resume, and historical-backlog/current-publication conflicts. Current detail selection now prefers the newest session before publication time; exact revision requests remain unchanged. No high/blocker findings remained in that scoped review. No formal release attestation was produced.

Protected CI also has an existing baseline blocker: both main and the prior PR head use active graph `da0305fd3f28b39964617a4b6eb4fce7bd94d3db0884d0b4b3d47a3c0f047fd0`, absent from the protected worker's graph-bound Requirements/Architecture evidence mapping. It fails before evidence retrieval. This change does not edit that mapping, create review evidence or claim those checks pass. See deployment-handoff.md for the legitimate review and live acceptance sequence.

Live coverage is not yet measured. Complete means every in-scope stock has a validated outcome; it does not mean every stock has 240-session authority or an eligible price zone. The 100,000-row complete-scan limits, actual runtime/egress, full response sizes and real data repair remain deployment acceptance items.
