# Local response-loss native execution

Executed exact `b09a49eaccd82ba14c00f1a04a84d7683638f727` (native source code `d33d6328763ee2591a41d849ff4bfadf75c2ff2e`) once, with the mandatory early FS preload, Node22.14.0 and PostgreSQL17.11. All 263 source entries matched sealed Git blobs before execution. No application, SQL, relay, fixture, binding, role, grant, cap or expectation changed. Historical 7ece/R1 RED remains preserved; this run follows the independently reviewed normalization correction.

The exact selected entry was `scripts/opportunity-v3/research-versioned-response-loss-native.test.mjs`, serial Node test concurrency1. **3 PASS = two children plus parent, 0 FAIL/cancel/SKIP/TODO**, elapsed18.351945s. No prior green matrix was selected. Private raw directory: `/tmp/response-loss-exec-o15`; no held protocol, payload, source content, URLs or private principals are published to Git.

## Observed cases

| Local synthetic case | Held response bytes | Seal bytes forwarded | Slots / logical bytes after commit | Actual financial FD opens/closes |
| --- | ---: | ---: | --- | --- |
| AUO2409 currentv3 | 467622 | 0 | 2 / 234998 | 9 / 9 |
| EMC2383 compatiblev2 | 248693 | 0 | 2 / 101687 | 6 / 6 |

Each case used the actual fixed Unix PG relay and four distinct backend PIDs (fixture writer, proxy writer, read-only observer, reconcile connection). Complete held protocol had exactly `SELECT 1\0` CommandComplete, one DataRow, no ErrorResponse, ReadyForQuery idle. The observer confirmed the actual uniquely committed row and exact request/input hashes before the relay destroyed both sockets. The actual PG promise rejected; the executed test asserted controller error object identity, pending query count0, both real socket closes and zero forwarded response bytes. ReadyI alone was not used as commit proof.

Both owned financial roots were then removed. New service-role connection read and seal-replay invoked only the candidate read RPC, with zero new FS opens, preparation, claim, charge or clock renewal. The corrected normalizer first deep-compared full returned binding against the selected binding, then compared all persisted fields unchanged. Eight snapshots per case retain all nine table counts/hashes, full ledger/hash, clocks, source fence events/invalidations, charge and FD accounting. Commit changes the revision ledger only; subsequent rejection/reconcile/replay snapshots are identical to the committed snapshot. Public witness is mechanically derived from private raw, not Root's independent raw/native approval.

## Resources and cleanup

Sampled every0.2s: peak combined native-session plus PG RSS522870784bytes; minimum `/workspace` free8601907200bytes and `/tmp` free15288119296bytes, both above8589934592. No reserve was lowered or cache/shared data deleted. The two cluster paths and relay directories are absent; each final server log confirms shutdown. Both transport cleanup records have pendingQueries0 and no errors. All38 sampled process IDs are absent or terminated; two PostgreSQL zombies remain awaiting their host parent's reap, with no active backend or service. Timers/socket cleanup follows the executed relay's close path; no kernel cancellation claim is made. Ordering follows the actual awaited helper/callback trace; this run did not add an independent per-socket wall-clock event recorder.

This is captured-schema local engineering: real50+26+candidate36 and the already explicit LOCAL two-owner USAGE profile, with synthetic bootstrap/source/roster/registry fixtures. Captured inactive production release means it does not demonstrate formal active-production writer enforcement, private peer, live rights, historical compiled Next execution or approved whole application closure. No remote DB/VPS/HTTP/model/CI/deployment action occurred.

Pending: old77 transport loss; other lease/lock-wait scenarios; whole S-C-B-Q-R-A, four callers, Q-R/cash citations, formal author-review-publication and production readiness. No self-signed independent approval or protected ref is created. Source code remains unchanged; this handoff and a separate evidence commit are the only delivery changes.
