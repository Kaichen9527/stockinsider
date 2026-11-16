# PR #384 exact historical native replay

Staging built the exact CI merge commit with Node 22.14.0 and Next.js 16.3.4. The two suites used separate synthetic clusters from the pinned PostgreSQL 17.11 image. Formal service and timer signatures matched before and after.

The original all-active research suite passed 7 of 7 tests, including changed evidence IDs, withdrawal and charged retry. This result does not retroactively change the October CI result.

The preparation SQL passed the original OID, routine body, catalog and whole-row checks in this replay. The subsequent original forecast SQL reached its 30-second PostgreSQL statement limit in the catalog comparison. Next HTTP was not reached. This is distinct from the historical CI assertion. The integration branch carries the existing full-row EXCEPT ALL correction in 356ed575, and the exact current-build replay has started.

[Machine-readable receipt](../../docs/operations/2026-11-16/vnext/pr-384-exact-native-quality-replay.json)
