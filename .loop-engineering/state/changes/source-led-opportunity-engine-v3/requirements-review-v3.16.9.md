# StockInsider V3.16.9 — Fresh Requirements Gate

## Subject identity

- Subject commit: `f581e2fec71cd6d22fd814afd530e639e57d86a2`
- Subject tree: `98aeb24b3ccbce64f45cc05dba3e989cd03a4a31`
- Implementation base: `5fe2e7e013254593791833c2a8c4fb08e5064a90`
- Review time: `2026-08-15T21:17:24Z`
- Initial and final subject worktree/index: clean

## Verdict

`PASS P0=0 P1=0 P2=0`

The subject closes the production-observed calendar dependency failure without
backdating database transaction visibility, weakening public point-in-time
reads or accepting an unapplied official item as successful.

## Fresh requirements conclusions

- The RED run, exact producer, typed SQLSTATE, failed field, durable chunk counts
  and verified runtime rollback are recorded without credentials or raw SQL
  payloads.
- Public historical resolution still requires `recorded_at`, source time and
  collection time no later than the requested historical cutoff.
- The new private dependency resolver independently bounds evidence knowledge
  time and database transaction time, selects one latest transaction head,
  retains the 1,024 revision cap and rejects equal-head semantic conflict.
- Only private ingestion price, corporate-action and reported-valuation paths
  use the two-clock resolver. The general public reported-valuation append and
  downstream analytical reads retain the original point-in-time resolver.
- Missing instrument, calendar, price and valuation metric dependencies raise
  allowlisted `PT409` diagnostics with safe allowlisted constraint identities;
  nonempty official items no longer disappear behind `CONTINUE`.
- The successor migration is additive, applies twice on a fresh database, is in
  the exact authority-bound migration plan and restores schema CREATE privilege
  only inside its transaction.
- Private helper functions are owned by `opportunity_v3_rpc_owner` and revoked
  from `PUBLIC`, `anon`, `authenticated` and `service_role`; the existing
  lease-bound REST wrapper remains the sole service-role mutation entrance.
- Candidate bounds, valuation/technical decision gates, V3 disabled route,
  no-secret-log policy and non-fabricated evaluation blocker are unchanged.
- No password reset, destructive DDL, LINE, dispatch, automatic trading or V3
  Promotion is introduced or authorized.

## Review evidence

- `git diff --check 5fe2e7e..f581e2f`: PASS.
- Fresh PostgreSQL migration chain apply twice: 54/54 PASS.
- Executable two-clock regression: public historical count 0, private dependency
  count 1, reported valuation append count 1.
- Product correctness: 108/108 PASS after installing the clean Web dependency
  tree; the initial missing-dependency run was environmental and was rerun.

This verdict authorizes a separate Architecture review only. It is not runtime
activation, Web deployment or future-return evidence.
