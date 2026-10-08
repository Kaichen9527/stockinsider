# Isolated PostgreSQL test clock

## Problem and scope

GitHub ordinary diagnostic run 37802933947 at 2026-10-08T15:43Z ran at Taipei 23:43. Three unchanged isolated PostgreSQL suites expected positive model reservations, while the original production policy correctly rejects new 30-minute leases from 23:30 through midnight. Four cases failed. This is independent of the child-pipe repair and does not establish a production defect.

Only `research-deep-jobs-postgres`, `research-deep-publication-postgres` and `research-source-budget-postgres` tests receive a controlled clock. No migration, production routine, runner trust, acceptance expectation, global machine clock, default model budget, or production service environment changes.

## Design

1. A shared test-only helper constructs an explicit child environment for an isolated PostgreSQL cluster. In Linux deterministic mode a trusted absolute regular libfaketime library path is mandatory; record its bytes hash and PostgreSQL version. Never mutate `process.env` or export preload globally. Other test processes and database clients retain real time.
2. The helper calculates one signed integer seconds offset from the real host instant to Taipei noon on that instant's Asia/Taipei date, independently of the host's timezone. Pass that same offset to `pg_ctl start` and restart, inherited by PostgreSQL backends. The clock advances normally. Do not use stopped absolute time or per-process resetting start-at clocks. Keep monotonic timers and file timestamps real (`FAKETIME_DONT_FAKE_MONOTONIC=1`, `NO_FAKE_STAT=1`). Reject inherited preload/faketime injection rather than silently combining it with controlled values.
3. Before original assertions, SQL canaries must prove the cluster is near the intended real-plus-offset time and advances across independent connections; bounded statement timeout must still terminate a sleeping query. Missing library/preload, unsupported behavior or clock mismatch fails the suite. There is no fallback success in deterministic mode.
4. Publication review timestamps must come from the same database `clock_timestamp()`, rather than mixing host wall time with the test database. Existing publication assertions and SQL bodies remain unchanged.
5. Linux diagnostic workflow installs libfaketime and passes its discovered verified absolute path as a test setting. The helper is opt-in for existing local Mac tests; absence is explicitly real-clock mode, never reported as deterministic clock evidence. Linux CI requires the setting and cannot silently fall back.
6. Add a dedicated actual PostgreSQL canary with separate isolated open/closed clusters. At noon, reservation and deep-job claim succeed. At Taipei 23:43, reservation and claim return empty with zero new reservation, attempts or running state. Pure production policy boundary tests retain 23:29:59.999999 accepted, 23:30:00 rejected, 23:59:59.999999 rejected and next midnight accepted. Verify clock continuity after restart, unchanged migration bytes and installed policy body.
7. The unpreloaded Node parent limits each init/start/restart/stop to 30 seconds and each query to 5 seconds, with a 1 MiB output cap. Canary checks use a shared 15-second real monotonic deadline, a fixed maximum of six calls, and at most five seconds clock error. No resettable readiness loop. A process timeout is a failure; only this test's temporary cluster may be stopped. Stop is bounded too; if its daemon cannot be confirmed stopped, preserve its temporary directory and report cleanup failure instead of deleting a live cluster. Unit probes cover hung commands, frozen time and incorrect offset without fallback.

## Acceptance

- Unit tests: offset arithmetic across UTC/Taipei day boundary; no parent environment mutation; deterministic mode rejects absent/nonabsolute/nonregular library and inherited injection; one offset reused on restart; no production imports.
- Linux VM: actual installed PostgreSQL/library version and hash, advancing SQL time, timeout, restart, original three suites zero skipped cases, open/closed behavior and no write in closed window.
- CI exact changed version must run all original assertions. No retries merely to obtain a daytime run; no always-true policy replacement, altered production SQL, skipped boundary assertions or generic successful fake receipts.
- Type/lint/build and independent review precede integration. This scoped clock test does not authorize merge, deployment, model execution, publication or strategy adoption.

## Method source

libfaketime documents relative offsets, monotonic exclusion and unmodified file timestamps: https://github.com/wolfcw/libfaketime/blob/master/README . Actual installed compatibility is established by executable canaries, not assumed from the documentation.

## Implementation checkpoint

Unsigned requirements/design review approved spec SHA2561b0522801aa361729ecda18bd0933afcf28b5c8e436b89ee386b650ecc64190b after adding external process bounds. Root implemented the test-only helper, three existing suite adapters, dedicated two-window PostgreSQL test and Linux diagnostic workflow. No migrations or production-source/parameter/DB-policy identity changed; supported release generator --check passes unchanged.

Local Node22.14 unit regression: initial missing-module red0pass/1fail/0skip; final8/8pass/0skip covers advancing offset arithmetic, mandatory Linux CI clock, injection/path rejection, frozen/wrong-offset/deadline/timeout failures, bounded child command/output and preservation of an unconfirmed live cluster. All four modified/added PG files parse; diff check passes. Actual Linux library/PG compatibility, dedicated open/closed/restart acceptance, three original PG suites, type/lint/normalbuild and independent code review remain pending. This is not an assertion that the old CI is repaired.

Private log hashes: red eff4561cd944b0733dfb1977163823d95ec53033e6f5eac77c43a470fe804e77; green489e7734e2aba3b6d40fb65da250e707ee9e5812902e341835089146d196e5ec. Logs are not committed. Review timestamps in publication fixtures now use the same DB clock; all prior acceptance assertions remain.

### Independent code-review repair

Review of55ccf78 found a P2: the expected SQL-timeout exception bypassed the final shared15-second deadline. Independent four-by-four-second synthetic probe incorrectly returned success after16seconds. Added root regression initially failed with missing expected exception (alongside the corrected offset-format expectation); final9/9unit cases pass0skip after checking the deadline in finally and clamping each query's external timeout to remaining time. All four SQL adapters now forward that bounded timeout. Relative seconds use signed integers without a suffix for documented parser compatibility. These are scoped fixes, not proof of actual Linux compatibility; VM clock/PG/build acceptance remains pending.
