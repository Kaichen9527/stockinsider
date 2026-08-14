# StockInsider V3.15 — Exact-Commit Diff Review

## Subject

- Parent: `e74b672cf397b7f8ba11f86ff49b2633afb5b7dd`
- Exact implementation commit: `97bc7de9027e8f334f9343aa1552d7b7bb33fce2`
- Exact implementation tree: `fe2752f1aca66766cdca7710e8577e0799509aa0`
- Range: `e74b672cf397b7f8ba11f86ff49b2633afb5b7dd..97bc7de9027e8f334f9343aa1552d7b7bb33fce2`

## Verdict

`CHANGES_REQUIRED P0=0 P1=2 P2=0`

Scope check: CLEAN. The diff implements the V3.15 official-market research
entrance, point-in-time market/fundamental repairs, REST producer/doctor boundary,
additive migration, runtime identity and matching tests. It does not add an action
quota, activate LINE/dispatch or claim Promotion proof.

## Findings

1. **P1, confidence 10/10 — future filing leakage.**
   `scripts/runtime/official-twse-valuation.js:572-573` and `:745-748` filtered
   monthly revenue only by the represented month (`row.asOf<=cutoffSession`). The
   parser already carried `filingPublishedAt`, but neither the full nor coarse loader
   required it to be at or before the run cutoff. A historical replay could therefore
   consume a number announced after its point-in-time cutoff.

2. **P1, confidence 10/10 — REST doctor cannot read its queried tables.**
   `scripts/runtime/runtime-health-observer.js:38-42` queried producer run/job tables
   directly with `service_role`. The installed base migration explicitly revokes all
   table privileges on those relations from `service_role`; it grants direct SELECT
   only for projections and prior health observations. The production doctor would
   fail with a REST authorization error before reporting compatibility.

## Repair requirement

- Gate both revenue paths on `filingPublishedAt<=cutoff` and prove an after-cutoff
  filing cannot enter coarse research.
- Keep run/job tables private. Add one bounded security-definer health-read RPC with
  the minimum fields, grant only that RPC to `service_role`, and prove the REST doctor
  never requests the private tables directly.

No other verified SQL safety, concurrency, trust-boundary, shell, enum, field-name,
time-window, type-coercion, documentation or CI finding remained after the full diff
pass. Greptile triage was unavailable because no PR existed at review time.
