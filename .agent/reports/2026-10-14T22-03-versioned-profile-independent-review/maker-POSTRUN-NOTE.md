# Post-run evidence limitation (no tests rerun)

The two-issuer successful test entry uses symbol-prefixed JSON receipts but copies each cluster server log to the same `postgres.log` in that run's artifact directory. Consequently `native-legal-observer-artifacts/postgres.log` and `native-witness-artifacts/postgres.log` retain the second (2383) cluster log only. The first (2409) successful cluster's separate server log was not preserved before its disposable directory was removed. Do not claim two complete PostgreSQL server logs for either successful run.

Both issuers' actual first-seal, preparation, claim, priority/roster, replay/hash, conflict RPC-error, FD and cleanup JSON remain separately preserved; their shared Node stdout/stderr/TAP covers both. The initial failed legal run's sole AUO server log and original42501 remain intact. The old cf8971PASS5FAIL evidence was not modified.

Future fixture work should prefix the server-log filename with symbol before cleanup. No green business run was repeated merely to regenerate this missing log. This note is evidence-only and does not alter the recorded77201116 executed test subject, original receipt SHA or its raw/source manifest.
