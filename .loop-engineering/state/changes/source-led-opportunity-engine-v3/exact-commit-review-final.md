# V3.19.16 exact-commit review — final claim lease and detail navigation closure

Date: 2026-08-28

Review authority: independent exact-range review of the immutable V3.19.16
runtime lease successor, operator-plan repair, and revision-bound detail
navigation closure. The review did not mutate the production database,
runtime, Vercel projects, source providers, LINE, dispatch, auto-trading or
Promotion.

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Protected base: `91d283a0c412d25d8d483ccd6ecb9df74e11e9c7`
- Final reviewed repair/tree: `04d02619c228f361e362a9f803151ad2081ae64d` / `dccb0b789e576d4a0448c00d46a793903a48cad5`
- Full final range: `91d283a0c412d25d8d483ccd6ecb9df74e11e9c7..04d02619c228f361e362a9f803151ad2081ae64d`
- Runtime/operator repair range: `97aca286a4bd71ad1c65c6d7fd2864accd24cb89..949cdcd2c956cd745ccfa99ebc55d2e587c84f73`
- Navigation closure range: `949cdcd2c956cd745ccfa99ebc55d2e587c84f73..04d02619c228f361e362a9f803151ad2081ae64d`
- Active graph: `4baf35c1a17cc7c7cd451e71b29e34e9b83c90ee03ca18822fcf4f7f47b19a7b`

## Root causes and diff review

The V3.19.15 activation exposed a production-only lease timing fault. The
original V3.16 handoff refreshed a 120-second lease before later successor
wrappers materialized bounded authority. A production-sized final claim could
therefore finish enrichment after the committed lease had expired, making
health report a stuck run while the claim transaction was still active.

V3.19.16 keeps the complete existing claim chain as a private predecessor and
refreshes both locked run and job leases only after the predecessor has
materialized the final claim. The returned composite receives the same fresh
lease. The wrapper verifies the token hash and running/leased states under row
locks; it cannot revive a lost lease or change owners. Its predecessor remains
private, schema CREATE is revoked again, service_role retains only the public
entry point, and the minimal runtime role remains exactly 9/9 direct RPCs.

The first full verification attempt found one P1 closure mismatch: the
authoritative apply chain contained the V3.19.16 migration while the human
operator migration plan and two exact-order assertions still ended at
V3.19.12. The first repair adds the same final migration to the operator plan
and updates both closed order assertions.

The next ordinary CI attempt found one P1 browser reliability issue. The
revision detail CTA used a soft client transition, and the second independent
Playwright invocation could observe the new URL before the revision-bound
server detail had replaced a hydrated cached document. The closure uses a
native document navigation for that immutable revision boundary. This does not
change the URL, semantics, styling, accessibility label, data test identity or
decision authority; it removes the router-cache race and guarantees a fresh
SSR document for the selected `decisionRevisionId`.

Review of both repair ranges and the complete final range found no remaining
P0, P1 or P2 issue. The migration is additive and idempotent. A
production-shaped ephemeral PostgreSQL cluster applied the affected chain
twice, preserved the private predecessor boundary, and retained exactly nine
runtime RPC grants. No secret, credential, database password, public mutation
endpoint, LINE, dispatch, auto-trading or Promotion behavior changes.
`git diff --check` passes.

## Executable evidence

- Exact product correctness: `140/140` PASS; zero failed, cancelled, skipped or
  todo. Full stdout SHA-256:
  `6c23bf09e58ccd276348a085654d03a5c4c55f51a44710f67a328ac8db53c814`.
- Revision-bound browser correctness: two consecutive independent runs,
  `9/9` PASS each, including the previously failing detail transition.
- TypeScript typecheck: PASS.
- ESLint: PASS.
- Migration and release-recovery contracts: `83/83` PASS, including
  production-shaped apply twice and exact 9/9 runtime privileges.
- Browser correctness and performance PCRs included in the exact product suite:
  PASS.
- `git diff --check`: PASS.

This exact range authorizes the protected Code Gate and, only after that gate
passes, the reviewed migration, runtime installation and Web deployment from
the same source tree. Evaluation governance remains
`blocked/non_fabricated_elapsed_cohorts_unavailable` and is not represented as
evidence of future returns.
