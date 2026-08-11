# Requirements Round 124 P1 Repair

Round 124 reviewed commit `13ebbd0395932f8ce44d5b2ac01081b2976086cb`
(tree `69d72deee8d4786ba54af6a14471a07319fc8067`) and returned
`CHANGES_REQUIRED P0=0 P1=3 P2=0`.

The repair closes one publication-authority root across all public surfaces:

- generic and exact detail resolve exactly one validated symbol/revision card;
- the retained technical URL redirects to that route and public detail/insight APIs
  require the exact revision without invoking legacy lookups or refresh writes;
- Web and tracked runtime validate the closed envelope authority/readiness/action,
  valuation and long-entry geometry matrix before rendering or publishing;
- citation authority is mandatory, unique and trimmed, with credential-free WHATWG
  HTTPS and strict offset-bearing RFC3339 calendar validation;
- SQL independently requires nested/outer revision equality, one card per symbol,
  mandatory cited 3+3 evidence and the same closed envelope matrix, rejecting all
  counterexamples atomically.

The complete product/runtime diagnostic passes as one terminal invocation: Web
typecheck, lint and production build; base `61/61`; V3.13 correctness `49/49`;
applied migration `46/46`; legacy regression `2/2`; Playwright accessibility and
revision-bound UI `3/3`; controlled performance `4/4`. The focused V3.13 `11/11`
and applied SQL persistence checks also pass independently.
The independent model-runner diagnostic also passes `17/17`; doctor returns `pass`
for disabled deployment with the exact `model-runner-host-pins-v3.7` fixture.
No production operation was performed.
