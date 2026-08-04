# Fresh Requirements Gate Review — Round 100 Final Revalidation

Date: 2026-08-04
Reviewer: Codex independent gate review
Review mode: read-only review of the final immutable implementation and repair closure
Result: `PASS`
Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Protected base: `f32a2e7a8029c5e8348712d475d60b3a4729ebca`
- Final repair-closure commit/tree: `c01104ce7d0f83ccc893b5aed4030fcba564440a` / `f44c1250824afac4e78807be1fd2bf4c8b1bfea6`
- Full reviewed range: `f32a2e7a8029c5e8348712d475d60b3a4729ebca..c01104ce7d0f83ccc893b5aed4030fcba564440a`
- Active graph: `f03607130c64872d30e24cf42a70ce2336ecd8a1b6c16275917dfdcbd07d0d7e`
- Acceptance inventory: `1.44.6`, 297 cases, 31 immutable PCR boundaries

This is a fresh review of the current post-rebase implementation. It does not reuse the
obsolete `edbe685` evidence. The subject was resolved from its immutable Git tree; the
working tree was clean, `git diff --check` passed, and dependency/build products were
not included in the reviewed tree.

The protected model-oracle bootstrap and pinned Node toolchain sandbox amendment are
now part of the reviewed base. Every protected model-runner and external-worker byte in
the subject is identical to that base. The read-only sandbox grant is derived from the
real setup-node executable, rejects npm outside that exact toolchain root, and admits
only the public macOS OpenSSL configuration in addition to the existing minimal paths.
The post-rebase host-compatibility repair also proves that a host without the contract-pinned
`/usr/bin/shlock` fails closed before activation instead of producing a false CI failure.

## Requirement closure

### Source-led discovery and point-in-time authority

- The exchange security master and ordered cursor pagination own the coarse universe;
  fixed seeds cannot independently publish a production recommendation.
- Explicit stock and alias joins replace UUID inference. Connector failures and every
  excluded evidence row terminalize with a typed outcome.
- New out-of-seed symbols may enter as non-actionable `source_signal` before valuation
  matures; the bounded 60-to-30-to-20 research funnel remains enforced.
- Financial, price, sector, PE and technical facts remain append-only, point-in-time,
  cutoff-bound and source-attributed. Missing or conflicting authority fails closed.

### Valuation, technical timing and action safety

- Valuation bridges revenue through attributable earnings and diluted shares, with tax,
  non-operating items, cash, debt and sector-specific methods. Missing, stale or
  conflicting bridge evidence produces `valuation_review` with null EPS and targets.
- The 2337 golden case rejects EPS 30.04 and target 300.4; the complete official fixture
  yields EPS 0.90. Negative earnings cannot expose PE.
- Technical state uses adjusted history, BIAS and typed support/breakout/invalidation
  geometry. A long action requires a positive entry, nonempty trigger and stop below
  entry; support loss requires reclaim.
- Fundamental quality, technical timing, BIAS, relative strength, official/company/
  industry PE and model valuation remain distinct sourced axes before the combined
  action. Presentation cannot convert unavailable evidence into a neutral score.

### Immutable analysis and comparable lineage

- A new immutable analysis revision is written only after a material input hash change;
  reevaluation without change preserves the prior narrative and generated timestamp.
- Score deltas, change briefs, material revision carry-over and discovery deltas first
  select the globally immediately preceding comparable successful run, then join the
  same symbol. A missing prior symbol remains null and never falls back to older history.
- More than one preceding success tied on greatest cutoff and terminal timestamp removes
  the worker read unit and fails closed instead of resolving arbitrarily by run UUID.

### Runtime, projection and authority boundary

- The tracked producer bundle, commit/tree, worker/config hashes, scheduler owner,
  leases, idempotency keys, terminal attempts and rollback identity are verified.
- The single DAG ends in an immutable compact projection. Public Radar requests read
  that projection only; they do not perform discovery or valuation in the request path.
- Legacy fields remain additive-compatible, internal health is authenticated and
  non-cacheable, and `/api/opportunity-v3` remains the exact disabled zero-query 404.
- The protected aggregate context has one base-owned trust root. Candidate workflows
  cannot mint `stockinsider-v3-gate-root` evidence.

## Fresh exact-tree evidence

| Evidence | Result |
|---|---|
| Complete protected-base-to-subject diff and active graph | PASS |
| TypeScript, ESLint and production Next build | PASS |
| Core source-led opportunity tests | PASS `59/59` |
| Product correctness boundaries | PASS `31/31` |
| Applied PostgreSQL migration/reapply/integration | PASS `25/25` |
| Legacy V1/V2 regression | PASS `2/2` |
| Playwright correctness/accessibility | PASS `2/2` |
| Controlled projection performance | PASS `4/4` |
| Model-runner and disabled doctor | PASS `15/15`; host-pin v3.5; disabled |

Evaluation governance is separately
`blocked/non_fabricated_elapsed_cohorts_unavailable`: the required 120 point-in-time
backtest dates, 20 real live trading dates and 252-date attempt roster have not elapsed.
No replacement data was fabricated. This blocks Promotion, not the disabled Code Gate.

## Gate decision

`PASS P0=0 P1=0 P2=0`.

Fresh Requirements revalidation is complete for the immutable subject above. It
authorizes only the separate Architecture revalidation and protected Code Gate. It does
not authorize merge, deployment, migration, scheduler change, runtime activation or
production mutation.
