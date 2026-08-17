# Verification Results: source-led-opportunity-engine-v3

Recorded at `2026-07-27T01:17:26+08:00` before exact implementation commit.

Final gate refresh recorded at `2026-07-27T02:01:47+08:00` after exact-commit diff review PASS.

## Scope and authority

- Production database migration: not run.
- V3 cron/shadow/drain runtime activation: not enabled.
- Production mutations: not authorized and not performed.
- Evaluation elapsed cohorts: not fabricated.
- Generated local artifacts were treated as environment output only: `web/.next`, `web/next-env.d.ts` and `web/tsconfig.tsbuildinfo` are not evidence inputs.

## Acceptance-owner repair during verification

Product/runtime verification exposed one stale owner assertion for `ENT-013`: the applied SQL now routes authority visibility through `opportunity_authority_selected_stream_count_v3_internal(..., v_run.source_cutoff)` and the helper predicate owns `approved_at<=requested_cutoff`. The traceability owner now asserts both facts directly.

This repair changes active verification ownership after Requirements Round 62 and Architecture Round 6, so a new immutable tree requires fresh Requirements and Architecture gates before the exact implementation commit.

## Product/runtime track

- `npm run typecheck:source-led-opportunity-v3` — PASS.
- `npm run lint:source-led-opportunity-v3` — PASS.
- `node scripts/run-node22.js --experimental-strip-types --test web/src/lib/opportunity-v3/opportunity-v3.test.ts web/src/lib/opportunity-v3/public-schema.test.ts scripts/opportunity-v3/acceptance-traceability.test.mjs` — PASS, `180/180`.
- `npm run test:source-led-opportunity-v3:migration` — PASS, `20/20`.
- `npm run build:source-led-opportunity-v3` — PASS, Next.js production build completed and generated 63 static pages.

Final gate refresh:

- Local dependency hygiene: `npm ci && npm --prefix web ci` rebuilt dependency directories from lockfiles after local `web/node_modules/@types/* 2` pollution was detected; no source or lockfile change was staged from this environment repair.
- `npm run verify:source-led-opportunity-v3:product-runtime` — PASS.
- Typecheck PASS.
- Lint PASS.
- Product tests PASS, `180/180`.
- Migration tests PASS, `20/20`.
- Production build PASS, Next.js production build completed and generated 63 static pages.

## Model-runner track

- `npm run verify:source-led-opportunity-v3:model-runner` — PASS.
- Result: model-runner acceptance `1/1`, runner tests `15/15`.
- `npm run v3:doctor` — PASS.
- Doctor deployment state: `disabled`.
- Doctor flags: `shadowRuntimeConfigured=false`, `productionMutationAuthorized=false`, `localVerificationReady=true`.

Final gate refresh:

- `npm run verify:source-led-opportunity-v3:model-runner` — PASS.
- Result: model-runner acceptance `1/1`, runner tests `15/15`.
- `npm run v3:doctor` — PASS.
- Doctor deployment state: `disabled`.
- Doctor flags: `shadowRuntimeConfigured=false`, `productionMutationAuthorized=false`, `localVerificationReady=true`.
- Historical host pin fixture SHA-256: `bdafed0274ab4eebc461b64c9a901dcc862f039039dc37a70ff4c4df7e2320a0` (superseded by Round 89 repair).

## Evaluation-governance track

- `npm run verify:source-led-opportunity-v3:evaluation-governance` — BLOCKED as expected by real-data availability.
- Acceptance subtrack: PASS, `21/21`.
- Product-value readiness subtrack: PASS, `12/12`.
- Formal gate JSON:

```json
{
  "protocol": "opportunity-verification-track-v3.0",
  "track": "evaluation_governance",
  "status": "blocked",
  "blocker": "non_fabricated_elapsed_cohorts_unavailable",
  "requiredBacktestDates": 120,
  "requiredLiveDates": 20,
  "requiredAttemptRosterDates": 252
}
```

The blocker is an honest elapsed-evidence blocker and does not claim Verification Gate PASS.

Final gate refresh:

- `npm run verify:source-led-opportunity-v3:evaluation-governance` — executable subtracks PASS, formal gate BLOCKED.
- Acceptance subtrack: PASS, `21/21`.
- Product-value readiness subtrack: PASS, `12/12`.
- Formal gate exit: `2`.
- Blocker: `non_fabricated_elapsed_cohorts_unavailable`.

No synthetic elapsed cohort evidence was generated. The aggregate evaluation-governance gate remains blocked until real `120` backtest dates, `20` live dates and `252` attempt-roster dates are available.

## Verification Gate conclusion

- Product/runtime: `PASS`.
- Model-runner plus doctor: `PASS`.
- Evaluation-governance: `BLOCKED/non_fabricated_elapsed_cohorts_unavailable`.

The disabled Vercel Web deployment may proceed under the user's explicit production-Web-only authority because the deploy does not run V3 migration, does not enable `SOURCE_LED_OPPORTUNITY_V3=shadow|drain`, does not enable V3 cron/shadow runtime and does not call mutating production endpoints. A full aggregate Verification PASS is not claimed.

## V3.13 pre-repair-freeze diagnostics — 2026-08-10

The independent exact-commit review of `3f3fb99412ceee7c3c21dda11199a30be1594242`
returned `CHANGES_REQUIRED P0=0 P1=5 P2=3`. The repair worktree then passed:

- product/runtime diagnostic: typecheck PASS, lint PASS, production build PASS (63 pages), base tests `61/61`, product correctness including V3.13 `51/51`, migration `48/48`, legacy `2/2`, performance `4/4`;
- authoritative V3.13 Playwright fixture after adding the revision-bound consumers: `6/6` passed; the legacy chart-room case remains in the regular E2E project;
- model-runner `17/17` and doctor PASS with deployment `disabled` and host pin `model-runner-host-pins-v3.7`;
- root and Web production dependency audits: zero vulnerabilities;
- focused adversarial repair tests: generic migration authority, mandatory source/facts completion, point-in-time history and Podcast SSRF PASS.

These are diagnostics on a mutable repair worktree, not the authoritative Code Gate. No production migration, runtime activation, credential installation, source write, Web deployment, LINE dispatch or ranking promotion was performed.

## V3.13 reviewed-head local Code Gate diagnostic — 2026-08-10

The repair-range and full-range closure reviews both returned `PASS P0=0 P1=0 P2=0`.
The resulting reviewed evidence head was `1ac740f33c7e3bf8ab682e044417617bfc306fde`
with tree `690579f93ca9fcf2fa15ec42b3d9b5ae3a9604cb`. A clean-worktree rerun then
produced:

- product/runtime diagnostic: typecheck PASS, lint PASS, production build PASS (63
  pages), base tests `61/61`, product/V3.13 `51/51`, migration `48/48`, legacy
  `2/2`, Playwright `6/6`, performance `4/4`;
- model-runner `17/17` and doctor PASS with deployment `disabled`, host pin
  `model-runner-host-pins-v3.7`, `localVerificationReady=true` and no configured
  runtime credential environment;
- evaluation/product-value contract subtrack `12/12` PASS;
- formal evaluation-governance gate exit `2`, status `blocked`, blocker
  `non_fabricated_elapsed_cohorts_unavailable`, requiring 120 backtest dates, 20
  live dates and a 252-date attempt roster.

This is final local diagnostic evidence for the reviewed implementation. It does not
mint or replace the protected `stockinsider-v3-gate-root` artifact. The authoritative
Code Gate remains pending the protected GitHub workflow over the final evidence tree.
The Promotion Gate remains honestly blocked; no synthetic cohort was created.

## V3.14 Requirements Round 132 repair diagnostics — 2026-08-11

Round 132 returned `CHANGES_REQUIRED P0=0 P1=7 P2=0` because seven canonical REC
owners could pass without executing the behavior they claimed. The repair now runs
the real browser cardinality case, applied PostgreSQL lifecycle and upgrade suite,
release compatibility/doctor matrix, mixed 51-connector outcomes, every missing
ranking axis, and an official facts-to-Web `buy` publication fixture.

- V3.14 owner suite: `23/23` PASS.
- Combined product correctness: `75/75` PASS using deterministic test concurrency 1.
- The invoked applied migration evidence reports zero failures and zero skips.

This remains mutable repair-worktree evidence. It neither constitutes fresh
Requirements PASS nor authorizes a production migration, credential use, runtime
activation or deployment.

## V3.16.21 focused implementation verification (2026-08-17)

- Permanent canonical repository verified at
  `/Users/kaerchen/Desktop/20_stock/StockInsider/repo`; remote main and PR #89
  objects are available. Old dirty worktrees remain preserved.
- V3.16.20 activation journal is `rolled_back`; the known-good runtime pointer is
  `184390953048209730c22828548858c28fa3b6b7`.
- Frozen provider unit coverage PASS: true `fetchedAt`, response bytes/hash,
  same-input reuse without refetch, partial-key retry, conflict quarantine,
  past-evaluation exclusion and secret-safe diagnostics.
- V3.16.21 additive migration PASS on a fresh PostgreSQL database with apply twice;
  executable persistence proves `appended -> reused -> conflict`, append-only
  trigger presence and service-role RPC-only writes.
- Effective health matrix PASS: checksum, runtime, consumer, manifest, migration or
  acquisition mismatch disables actions; checksum-valid research remains last-good
  read-only, checksum conflict clears it.
- Typecheck and lint PASS after research-only detail and shared health changes.
- Pending: full product/runtime, migration, browser, performance, model-runner,
  exact-review/protected root, production migration/runtime x2, Vercel smoke and
  Safari verification.

## V3.16.21 production-cardinality repair diagnostic (2026-08-17)

- Forensic run `68691805-c80c-39df-26e5-ae9715d80318` retained truthful frozen
  provider timestamps and hashes but was not eligible for release: repeated global
  roster validation made 22,448 valuation rows exceed the finite activation window.
- Automatic runtime rollback is verified at
  `184390953048209730c22828548858c28fa3b6b7`; Web was not changed and action
  authority was not published.
- The additive, apply-twice repair keeps each official chunk at 20 rows, rejects
  mixed acquisition timestamps, executes one complete roster integrity check per
  chunk, and performs three indexed internal symbol-resolution paths.
- Focused V3.16.21 suite passes `7/7`; fresh-database migration suite passes
  `60/60`, including owner/grant closure and installed-function cardinality.
- This is mutable diagnostic evidence only. Exact commit review, protected Code
  Gate, exact production migration, two terminal producers, Vercel smoke and Safari
  remain pending.

## V3.16.21 projection-evaluation supersession diagnostic (2026-08-17)

- Production run `f7d1cef1-95aa-32e4-96db-58368e851eb6` is terminal forensic
  evidence only. Its compact projection completion collided with predecessor
  producer `950e4f5433e4fd9a42697cca6a5f66a223f473b9` at the same immutable market
  cutoff; automatic runtime rollback to `184390953048209730c22828548858c28fa3b6b7`
  is complete and Web action authority remains disabled.
- Exact immutable input replay completes four compact projections and 12 decision
  revisions. Daily/three-day/weekly/home raw payloads are respectively 141,574,
  122,009, 140,090 and 141,573 bytes, all under 150,000.
- Fresh PostgreSQL coverage appends a strictly later, differently reviewed producer
  at one content cutoff, and rejects same-producer nondeterminism, equal-time
  disagreement and incomplete embedded release identity with typed PT409 errors.
- Completion rejection now records `origin=rpc_validation` and invariant
  `projection_supersession_conflict` without SQL, payload, URI or secret text.
- Complete precommit diagnostics PASS: typecheck, lint, production build (63 static
  pages), base product `61/61`, product correctness `118/118`, fresh PostgreSQL
  migration `61/61`, legacy `2/2`, Playwright `8/8`, performance `5/5`, model-runner
  `18/18` and disabled host-pin v3.9 doctor.
- This remains precommit diagnostic evidence. Exact review/protected gate,
  production migration/runtime x2, matching Web deploy, smoke and Safari remain
  pending. Requirements/Architecture are not reopened.

## V3.16.21 authoritative production verification — PASS WITH CONCERNS

- Protected run `32021648447` PASS: Requirements, Architecture, exact review,
  product/runtime, model-runner and root.
- Exact source/tree/evidence: `ded5acafe57fd1b82cf44ed03879b1281d8f39b3` /
  `19b770d6c5c8e039b94c5dbb7cad341b615b8074` /
  `620e3b98575086a3d89f7ba35a5db89178aa23dd`.
- Runtime run `1d26ffd2-de98-39c5-a65c-482cb62ac9d0` PASS 3,447/3,447;
  second invocation `retained_success`; doctor PASS; stuck=0; single owner.
- Vercel `dpl_8ko9HPokaWe2fRUTUWSdJGyvgKia` is live at
  `https://stockinsider-three.vercel.app`; exact consumer/producer/manifest match.
- Homepage/Radar/health/detail/V3-disabled smoke PASS. Homepage is 147,125 bytes;
  Radar payloads are 111,130-129,246 bytes; warm aggregate p95 is 1,006 ms; five
  concurrent reads are all below 10 seconds.
- Safari PASS: stock research 23, social discovery 12, navigable cards and matching
  2605 decision revision. Evidence paths and complete identities are recorded in
  `v3.16.21-release-state-evidence.md`.
- Concern: incomplete official coverage disables formal actions but preserves
  nonzero research; third-party failures remain typed; real-cohort Promotion remains
  `blocked/non_fabricated_elapsed_cohorts_unavailable`.
