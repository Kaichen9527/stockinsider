# V3.18 exact repair diff review — idle pooler transport containment

Date: 2026-08-23
Reviewer: independent exact-range review after the reviewed producer activation
rollback exposed that an idle checked-in pool client could emit an unhandled
transport error and terminate the worker before it persisted a terminal result.
Result: `PASS`
Findings: `P0=0 P1=0 P2=0`

## Exact subject

- Protected main parent: `de7eb5fa702ec9aab02d436ed9df1617a2af4d41`
- Final reviewed repair/tree: `e21272191065bd227c712c9e3d34d2215a7a15f3` / `6121b639c7e4698c1eabba561dc45c1f0d617db6`
- Full final range: `de7eb5fa702ec9aab02d436ed9df1617a2af4d41..e21272191065bd227c712c9e3d34d2215a7a15f3`
- Active graph: `729370999da4668cc5d8291e0e160a44c2d1a14edaae9a871f95be9e0203ac6d`

## Review result

The only new production-affecting implementation change installs one no-op
`error` listener on each shared producer pool. It contains idle pool-client
transport errors so Node does not exit outside the durable worker's terminal
authority. Paired 20-second `query_timeout` and `statement_timeout` values
remain unchanged. The repair does not retry a generic mutable query; the
specialized claim retry remains the only idempotent transport retry.

The following Requirements and Architecture evidence commits are bound by the
final empty commit. The subject descends from the current protected `main`
merge commit. There are no changes to
candidate selection, retention policy, valuation, source acquisition, decision
action, migration SQL, credentials, notification, automated trading, LINE,
Promotion or production configuration.

The focused product-correctness diagnostic passes `129/129` with zero failed,
skipped or todo. It includes PCR-001 through PCR-031 and the regression that
requires idle pool-client error containment. The prior activation was rolled
back automatically and remains unclaimed by this review.

Evaluation governance remains
`blocked/non_fabricated_elapsed_cohorts_unavailable`; no cohort or market
outcome has been fabricated.
