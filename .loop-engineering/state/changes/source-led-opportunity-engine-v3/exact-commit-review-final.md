# Exact implementation review — durable FinMind financial fallback

Date: 2026-09-07

Review authority: independent read-only review of the complete immutable diff,
official-first acquisition boundary, FinMind mirror provenance, persistent queue
retry semantics, point-in-time financial reconstruction, valuation hard gates,
and additive database migration.

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `7bdd87b74b51ba8b8513b35f1f4b2a5df4bae0a7` / `56fc1379a331f2bc0ea7e64201064a900967025d`
- Full final range: `6fb031c81df002a6c635142e2c4cfb02725dfa8b..7bdd87b74b51ba8b8513b35f1f4b2a5df4bae0a7`
- Active graph: `1c32b707a2e3d36e0ca01b4e78b9c20fa5bcef5eb34dce486063d9f694a2c9fc`

## Review result

- Official MOPS and TPEx acquisition remains the primary authority. FinMind is
  used only after a bounded official failure and is persisted as
  `finmind_mirror`, never relabelled as direct official evidence or counted as
  an independent corroborating source.
- The fallback client is pinned to the FinMind HTTPS host, refuses redirects,
  caps response bytes, bounds every request to one symbol and fiscal period,
  and sends the optional token only as an Authorization header. It does not
  expose credentials, response bodies, or a public write surface.
- Income statement duration facts and balance-sheet instant facts preserve
  their distinct period semantics. Comparative MOPS contexts and TPEx rows for
  a different reporting period cannot contaminate the claimed queue item.
- Mirror facts can supply an explicitly incomplete research bridge, but any
  mirror, conflict, stale input, missing diluted-share basis, or missing formal
  valuation dependency remains a hard blocker for new Actionable authority.
  Recovery by an exact official series supersedes the corresponding mirror.
- A successful fallback does not falsely complete the official job. The queue
  retains its official retry with independent backoff and consecutive-failure
  accounting, while unchanged mirror facts are semantically de-duplicated.
  Superseded TPEx periods are resolved by the exact-period fallback instead of
  retrying an endpoint that only publishes the newest period forever.
- The additive migration grants only the existing service-role acquisition
  boundary and validates symbol, period, provider, authority, and collection
  identity inside the database functions. Reapplication is covered by the
  migration contract.
- The final test run passed 134 TypeScript tests plus 30 migration and schedule
  contract tests. TypeScript and the 72-route production build passed; ESLint
  reported zero errors and 33 pre-existing warnings. Independent diff and
  security reviews found no remaining P1 or P2 release blocker.

## Closure

Independent exact-diff review found no P0, P1, or P2 release blocker. The
change is safe to merge and deploy only after the protected product/runtime
gate accepts this exact subject commit and evidence child.
