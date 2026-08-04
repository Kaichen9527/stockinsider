## 1. Spec And Schema

- [ ] Add OpenSpec change files for 6-hour social refresh and Supabase runtime state.
- [ ] Add Supabase migration for worker state, job runs, runtime artifacts, logs, and encrypted sessions.

## 2. Runtime

- [ ] Add `social-source-refresh-6h` to `.agent/scripts/auth-source-worker.js`.
- [ ] Persist worker state and job runs to Supabase while keeping local JSON fallback.
- [ ] Add encrypted Supabase-backed Meta session store with local file migration fallback.

## 3. Product And Audits

- [ ] Expose `refreshCadenceHours`, `lastScheduledAt`, and 6-hour freshness semantics in source health.
- [ ] Add `audit:social-refresh-sla`.
- [ ] Add `audit:supabase-runtime-state`.

## 4. Verification And Deploy

- [ ] Run local lint, build, Playwright, source-health, worker-freshness, social-refresh SLA, and Supabase runtime audits.
- [ ] Deploy Vercel Preview and run the same audits/smoke tests.
- [ ] Deploy Production and run production smoke/audits.
