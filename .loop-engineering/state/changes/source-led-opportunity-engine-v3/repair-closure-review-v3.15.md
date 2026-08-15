# StockInsider V3.15 — Repair and Full-Range Closure Review

## Subject identity

- Original parent: `e74b672cf397b7f8ba11f86ff49b2633afb5b7dd`
- Exact implementation: `97bc7de9027e8f334f9343aa1552d7b7bb33fce2`
- Repair head: `5e9b56e4621d0a04e2e59f4b903e535ba3769ac6`
- Repair tree: `b5cb4e0e6c037c28544eafd7b2939992ffbb4f58`
- Repair range: `97bc7de9027e8f334f9343aa1552d7b7bb33fce2..5e9b56e4621d0a04e2e59f4b903e535ba3769ac6`
- Full range: `e74b672cf397b7f8ba11f86ff49b2633afb5b7dd..5e9b56e4621d0a04e2e59f4b903e535ba3769ac6`

## Verdict

- Repair range: `PASS P0=0 P1=0 P2=0`
- Full range: `PASS P0=0 P1=0 P2=0`

Both exact-review findings are closed. No new SQL/data-safety, race, trust-boundary,
shell, enum, schema-field, time-window, type-boundary, documentation or deployment
finding remains in either range.

## Closure evidence

1. Both full and coarse official revenue paths require
   `filingPublishedAt<=cutoff`. The new fixture presents a valid July value filed on
   August 14 to an August 13 replay and proves it cannot enter research.
2. The REST doctor no longer queries private run/job tables. The bounded
   `read_legacy_runtime_health_rest_v3_15()` RPC returns only the last run, at most two
   leases and a fail-closed stuck count; only `service_role` receives execute authority.
3. The complete five-migration chain applies twice in fresh PostgreSQL, including the
   new health-read function and unchanged RLS/append-only boundaries: 51/51 PASS.
4. Product/runtime closure on the repair head: typecheck PASS, lint PASS, production
   build PASS, core 61/61, product correctness 92/92, migration 51/51, legacy 2/2,
   Playwright 8/8 and performance 4/4.
5. Model runner: 17/17 PASS; disabled host-pin v3.8 doctor PASS. Root and Web npm audit
   report zero vulnerabilities.
6. Evaluation contract: 12/12 PASS. Formal evaluation governance remains honestly
   `blocked/non_fabricated_elapsed_cohorts_unavailable`; no synthetic cohort was added.

The repair head is the reviewed release source. This closure evidence commit is its
direct attestation child and does not change runtime code.
