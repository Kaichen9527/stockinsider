# Requirements Round 122 — six P1 repair

Round 122 reviewed commit `c92792e48dcf63907508853a865ad869e1de6451`, tree
`93294d9f5612221c7974211e0a927cf2e2c39e11`, and returned
`CHANGES_REQUIRED P0=0 P1=6 P2=0`. This repair closes the six roots in one batch:

1. Runtime and Web now count cutoff-visible `completed` and `scheduled` exchange
   sessions with the same grace/missed-run policy. The production-shaped acceptance
   fixture carries scheduled future sessions and proves the third miss is unavailable.
2. Generic stock detail never derives an action, entry, invalidation, trigger or
   position from legacy decisions when an authoritative V3.13 envelope is absent.
3. A Decision Brief is publishable only with exactly three thesis points, three risk
   points and six point-to-citation mappings. Every cited reference resolves to a
   navigable HTTPS authority with published, collected and evaluated times; runtime,
   SQL and revision-bound UI independently fail closed. Generic padding was removed.
4. Candidate selection groups by authoritative stock identity, hashes the complete
   evidence set and preserves every source observation. Compact projection merges
   same-symbol evidence into citations instead of first-row retention.
5. The tracked roster now uses Meta's official Threads keyword-search endpoint
   `https://graph.threads.net/keyword_search`; the worker requests recent posts and
   required fields, then retains only exact approved usernames. Credentials remain
   external and no connector was activated.
6. DI-007 maps to its exact current test name. The suite executor requires the exact
   TAP subtest, rejects `1..0`, and requires one semantic test and one pass.

Fresh diagnostics after repair: V3.13 `11/11`, product correctness `38/38`, applied
migration `46/46`, performance `4/4`, Web typecheck and lint PASS. The focused SQL
test proves both a valid cited brief commit and atomic rejection of an uncited brief;
the production build and Playwright keyboard/mobile/200%-zoom suite pass `3/3`.
No production database, runtime, scheduler, credential, flag, deployment or source
state changed. The next step is a new immutable Round 123 subject and independent
fresh Requirements review.
