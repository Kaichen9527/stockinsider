# Fresh Requirements Gate Review — Round 100 Final Revalidation

Date: 2026-08-08
Reviewer: Codex independent gate review
Review mode: read-only review of the final immutable implementation and repair closure
Result: `PASS`
Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Protected base: `bef6ae972fe0901696960ee59a3bf54840f1eef6`
- Final repair-closure commit/tree: `16b62921cbaebc34e0f9554a9fb2e5b7c4e1fceb` / `1d2730f8d04ce9773093fae3023021b0bb6a24bc`
- Full reviewed range: `bef6ae972fe0901696960ee59a3bf54840f1eef6..16b62921cbaebc34e0f9554a9fb2e5b7c4e1fceb`
- Active graph: `bd557c0f27263dbca17610ec07469ac73835838e5cc3d6d5fe921891c82de435`
- Acceptance inventory: `1.44.6`, 297 cases, 31 immutable PCR boundaries

This is a fresh review of the current post-PR-19 rebase implementation. It does not reuse
the obsolete `103c464`, `51c8330` or pre-PR-19 evidence. The subject was resolved from its immutable Git tree; the
working tree was clean, `git diff --check` passed, and dependency/build products were
not included in the reviewed tree.

The protected model-oracle bootstrap, pinned Node toolchain sandbox amendment, track
prerequisites, host-pin v3.6, shared Web preparation, Apple Git sandbox repair and
protected PostgreSQL toolchain binding are now part of the reviewed base. Every protected model-runner and external-worker byte in
the subject is identical to that base. The read-only sandbox grant is derived from the
real setup-node executable, rejects npm outside that exact toolchain root, and admits
only the public macOS OpenSSL configuration in addition to the existing minimal paths.
The post-rebase host-compatibility repair also proves that a host without the contract-pinned
`/usr/bin/shlock` fails closed before activation instead of producing a false CI failure.
Only one or two complete, exact Apple Git xcrun cache-denial lines are tolerated; zero,
three, unterminated, altered or non-Git forms fail closed. The Codex version probe may
add only its one byte-exact, LF-terminated PATH-alias warning. The non-credential sandbox
continues to verify codesign but delegates `spctl` and real network-denial infrastructure
to the protected live oracle; unknown modes require Gatekeeper and the ordering matrix
uses only injected fake endpoints. Only a real,
package-owned `/usr/lib/postgresql/<major>/bin` containing executable `initdb`, `pg_ctl`
and `psql` may enter the protected product track. The model track receives neither grant.
The product trace runner now revalidates that same closed directory, realpaths,
non-world-writable ownership boundary and three executables before preserving the
package bin in its child `PATH`; this closes the run-17 PCR-022 harness failure without
weakening the model or evaluation environments.

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
| Protected worker compatibility contract | PASS `8/8` |
| Model-runner non-credential sandbox | PASS `15/15`; host-pin v3.6; trusted live oracle remains a protected-gate obligation |
| Evaluation semantic tests | PASS `12/12` |

The protected product `249/249` and model `28/28` partitions are intentionally not
pre-claimed by this evidence carrier. The downstream base-owned five-envelope Code Gate
must reproduce them independently on the final subject; this Requirements PASS cannot
mint or substitute those envelopes.

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
