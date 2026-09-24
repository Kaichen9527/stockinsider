# PR1 executable acceptance inventory
Existing acceptance expectations are not changed. Final report maps each ID to executed evidence; unresolved checks remain unresolved.
| ID | Required behavior | Planned evidence |
|---|---|---|
| P1-01 | prior20 excludes t; no incomplete close/history signal | tw-entry-plan.test.ts |
| P1-02 | confirmed raw signal survives formal risk block | tw-entry-plan.test.ts; UI fixture |
| P1-03 | touch without confirmation, invalid geometry, no-chase | tw-entry-plan.test.ts |
| P1-04 | tick boundaries, official holidays, late availability, idempotence | core + authority tests |
| P1-05 | no fabricated candles or unverified adjustment scales | authority + reader tests; UI fixture |
| P1-06 | same revision across reader/summary/chart; GET read-only | publication contract + reader/summary tests |
| P1-07 | hypothetical plan distinct from personal fills/holdings | UI fixture |
| P1-08 | formal gates preserved; stale current view not actionable | existing stage tests; summary + UI checks |
| P1-09 | immutable repeatability, old payload absent/unsupported | core + envelope tests |
| P1-10 | desktop/360px readable; bounded compact radar without OHLCV | Playwright + compact summary tests |
