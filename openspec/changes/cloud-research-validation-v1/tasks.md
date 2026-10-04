# Cloud validation progress (2026-10-04)

## Implemented; local acceptance only

- [x] Portable work/result contract binds exact source, role, job/attempt,
  reservation/owner, data scope, cutoff evidence and a <=30-minute Taipei-day lease.
- [x] Reuse existing financial/article validator; no duplicated EPS/discount model.
- [x] Separate Linux Cloud capacity admission (20 GB resident, 4 GB temporary,
  8 GB free reserve, <=8 GiB expected peak); unknown project quota stays explicit.
- [x] Explicit prepare/run/verify CLI, clean exact checkout, create-only output,
  single sandbox lock and synthetic fixture clearly separated from live research.
- [x] Authenticated independent-test result receiver uses existing reservation /
  completion plus atomic Cloud acceptance receipt, immutable replay and current server evidence/fact checks.
- [x] Local tests for identity, time, withdrawal, accounting, capacity, body/auth,
  replay, overwrite and source checkout mismatch. Cloud suite: 16 pass, zero skips, including real PostgreSQL provenance/rollback tests.
- [x] Type check passes. Full research suite: 93 pass, zero skips, including PostgreSQL tests.
  Final lint/build pass (zero errors, 33 baseline warnings); recorded in the handoff.

## Must remain open until actual evidence exists

- [x] Independent Astra code review of exact successor `960319d7`; P1 closed.
  Unsigned code-scope review is not protected release authority.
- [x] Actual Linux Cloud synthetic execution on `0faebfd`: 16 tests, zero skips;
  prepare/run/verify, lock/source/overwrite tests pass. Measured run RSS 97,558,528
  bytes and workspace ~2.50 GB; disk observations are not continuous peaks.
- [x] Same Cloud chat next-turn continuation: eight artifacts hash-match and
  unexpired original task verifies; no deadline reset.
- [ ] VM recreation/cross-task persistence and full-workload continuous resource peaks.
- [ ] Real VPS reservation -> Cloud execution -> authenticated VPS completion,
  including interruption/restart and durable duplicate receipts.
- [ ] Rights-aware issuer projection and production job binding end-to-end.
- [ ] Six-role model adapter, watchdog, shared daily budget and 30-day review consumer.
- [ ] Platform-owned Cloud dispatch/persistence capability verified before schedules.
- [ ] AUO and a different industry complete source/finance/article/review/publication.
- [ ] Protected exact-source reviews and root gate pass; merge commits in approved order.
- [ ] VPS capacity admission, migrations, deployment and desktop/mobile verification.
- [ ] Five real trading days of operational acceptance; profitability is separate.

No local fixture result, this checklist or a draft PR confers publication or
strategy-adoption approval. Existing production capacity/trust gates are unchanged.
