# Requirements Round 118 — P1 Repair Evidence

Round 118 subject: `2314ee9f579645f1d579d8738e0115e6864a7afb` / tree
`aaee71c8aeef1a713b4f4e0f86055b41cc11af06`.

## Root closure

1. The fact plane now names the complete inclusive civil-date window
   `[sourceCutoff(Taipei)-730 days, sourceCutoff(Taipei)]` before querying calendar
   identities. The existing resolver enumerates `LIMIT 513`, rejects member 513,
   and only then resolves at most 512 identities. No raw-calendar `LIMIT 512` is
   used to manufacture the interval.
2. Runtime obtains the candidate exchange from the authoritative current observation
   and requires every same-session canonical-sector peer to have that exchange.
3. `sharesOutstanding` participates in the same order-independent numeric semantic
   comparison as close and reported multiples. Differing normalized values produce
   `authority_conflict`, null authority members and no scenario regardless of input
   order.

## Regression evidence before freeze

- V3.13 decision-integrity tests: `11/11 PASS`, including two differing-share input
  permutations and an explicit cross-exchange peer rejection.
- Applied PostgreSQL migration suite: `45/45 PASS`, including a fact-plane request
  whose complete explicit interval contains 513 distinct calendar identities.
- Web TypeScript: PASS.
- Web ESLint: PASS with the pre-existing 14 warnings and zero errors.
- `git diff --check`: PASS.

These are repair diagnostics, not a Requirements verdict. A new immutable tree and
independent read-only Requirements review remain required. No production operation
was performed.
