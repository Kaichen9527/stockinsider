# Exact implementation review — durable official calendar and host fail-fast

Date: 2026-08-31

Review authority: read-only review of the complete immutable diff, official authority
selection, external-host outage containment, migration grants, regression tests, and
the unchanged product/runtime graph.

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `3fc35e4edc1c70b874b2654b1c41edc4c55e3233` / `9ab97aa8e9e1539fb1ce83cf5f0c3a2174ed16af`
- Full final range: `4947d0e610ae3c6723728c775eece218654b7bb8..3fc35e4edc1c70b874b2654b1c41edc4c55e3233`
- Active graph: `329de76e514164f7ebd1905708491aa15e80c9ce34eb0fb7be3eb03786cdcf64`

## Review result

- The candidate scheduler reads completed sessions from the already-recorded,
  official TWSE authority plane at its evaluation cutoff. It no longer requires a
  live five-year calendar fetch before it can create a research run.
- The additive service-role RPC bounds requests to 2–1,320 dates, requires all
  authority timestamps at or before the cutoff, retains only a single semantic
  latest head, and returns completed sessions only. It neither writes nor creates
  calendar facts.
- Live calendar retrieval remains a bootstrap fallback only when the durable plane
  has fewer than two usable sessions. This preserves a new installation path without
  allowing a live outage to override existing official evidence.
- A five-minute per-host circuit breaker contains timeout, 403/429, and 5xx failure.
  Requests for that host then fail closed quickly; other official hosts and all
  candidate items continue. Existing per-stock failure snapshots remain `found` and
  cannot reuse a stale `waiting` or `actionable` decision.
- The patch does not change lifecycle thresholds, two-day confirmation, confidence
  requirements, valuation formulae, publication semantics, or the non-fabricated
  30-trading-day shadow rule. Threads remains outside the scheduler and SLA.
- No direct table write, unbounded source fan-out, public RPC grant, credentials, or
  fallback pricing source was introduced.
- The contract test proves durable calendar authority, service-role-only grant, and
  circuit behavior. Candidate/shadow tests, TypeScript, lint, production build, and
  diff hygiene passed on the exact subject. The protected product/runtime track
  remains responsible for the complete graph verification.
- Candidate/shadow contract tests, TypeScript, lint, production build, and diff
  hygiene passed on the exact subject. The protected product/runtime track remains
  responsible for the complete graph verification.
- The Opportunity V3 active graph is unchanged and all 31 PCR fulfillment rows
  remain bound to the reviewed tree.

## Closure

No P0, P1, or P2 code finding remains. The subject is ready for protected checks,
additive migration application, rebase merge, atomic VPS release, and a controlled
production research cycle.
