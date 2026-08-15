# StockInsider V3.16 — Exact-Commit Diff Review

## Subject

- Parent: `3f1ba2e803e6f619ca2cf6bde0af15ac54c3a8de`
- Exact implementation commit: `f11897f354dfe137b0f61f33a3dd4371aab09ea1`
- Exact implementation tree: `17ccfab8a8e8b9ac037c865b76ab8885576cd7bd`
- Range: `3f1ba2e803e6f619ca2cf6bde0af15ac54c3a8de..f11897f354dfe137b0f61f33a3dd4371aab09ea1`

## Verdict

`PASS P0=0 P1=0 P2=0`

Scope check: CLEAN. The 17-file, 427-addition/92-deletion range repairs the
official acquisition boundary and near-buy visibility without adding an action
quota, synthetic authority, LINE/dispatch activation or Promotion claims.

## Review conclusions

- SQL/data safety: no SQL or migration is changed by this exact range. Official
  filing/source timestamps, not acquisition completion time, enforce the
  point-in-time cutoff; source-to-collection ordering remains required.
- Concurrency/boundedness: MOPS remains at most 30 candidates × six completed
  quarters and at most 128 retained facts per symbol. Historical price and
  valuation requests are sequential and bounded; producer lease heartbeat and
  immutable chunk persistence are unchanged.
- Source trust: the additional `wwwc.twse.com.tw` host is narrowly used for
  TWSE corporate-action range reports and remains HTTPS allowlisted. No
  user-controlled or model-produced URL is admitted.
- Valuation correctness: peer references exclude the subject security and use
  the conventional `(1 - current / reference)` discount. The 8299 live official
  fixture produces a four-quarter bridge of the correct order of magnitude; no
  EPS or target is hardcoded. Incomplete 2408 authority remains unavailable.
- Decision integrity: fixed-weight research ranking controls visibility only.
  Shallow candidates may be labelled near a buy point with a typed deep-research
  blocker, but retain `recommendationAuthority=none` and `userAction=unavailable`.
- UI/enum completeness: near-buy unavailable cards are exclusively placed in
  the waiting section, while other unavailable cards remain in data-pending.
  The change introduces no new decision enum and cannot enable an action.
- Tests/docs: unit, product, migration, legacy, typecheck, lint, build, browser
  and performance evidence cover the repaired cutoff, MOPS bounds, peer math,
  source host and section placement.

No remaining SQL safety, race/concurrency, trust-boundary, shell, enum,
field-name, time-window, type-coercion, frontend, documentation or CI finding
was verified. Greptile triage was unavailable because the exact V3.16 subject
had not yet been published as a PR at review time.
