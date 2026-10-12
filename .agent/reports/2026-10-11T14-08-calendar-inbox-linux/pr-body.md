Fix entry-plan calendar acquisition when many revisions consume the old 3,000-row prefix before 240 completed date heads can be selected. Read bounded pages through complete date heads, preserve cancelled-head precedence and all cutoff/provider/close checks, and reject explicit row/byte/time exhaustion.

Also acquire the existing production write lease before research inbox upserts, release only the acquired owner in finally, and reject busy/unavailable or unconfirmed release without weakening auth, revision or dedup behavior.

Validation: existing entry-plan suite (107 tests) and inbox route/validator tests (19 tests), typecheck, lint and normal build. The original synthetic calendar failure and initial fixture/type/build RED logs are preserved with exact source hashes in the VM evidence receipt. No production database, acquisition, candidate ranking, schedule or deployment was run; independent review remains pending. The inbox lease route tests use synthetic boundary doubles, not a live production lease test.

Commits separate calendar, inbox lease, and a test-only fixture type correction for selective review. Canonical package commands, locks, SQL and strategy parameters are unchanged.
