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
  completion RPC, immutable replay and current server evidence/fact checks.
- [x] Local tests for identity, time, withdrawal, accounting, capacity, body/auth,
  replay, overwrite and source checkout mismatch. Cloud suite: 14 pass, zero skip.
- [x] Type check, lint (zero errors) and production build pass. Full research suite
  before the added midnight test: 90 pass, zero skip, including PostgreSQL tests.

## Must remain open until actual evidence exists

- [ ] Independent Astra review of the exact successor commit and resolution of findings.
- [ ] Actual Linux Cloud execution and measured peak memory/disk/lock contention.
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
