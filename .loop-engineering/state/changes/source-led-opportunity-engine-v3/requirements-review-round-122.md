# Fresh Requirements Gate Review — Round 122

Subject commit: `c92792e48dcf63907508853a865ad869e1de6451`
Subject tree: `93294d9f5612221c7974211e0a927cf2e2c39e11`
Baseline commit: `75e329471da257c2855d4de04d71e05a589e6c72`
Baseline tree: `c8880d15adb87d40ae32773ab87bd4cb9ccf1f8f`
Reviewer: independent read-only `gpt-5.6-sol` / xhigh process
Verdict: `CHANGES_REQUIRED` (`P0=0`, `P1=6`, `P2=0`)

## P1 findings

1. Projection freshness discarded calendar rows serialized as `scheduled`, so a
   projection that missed three due sessions could remain `fresh` with actions
   enabled. Runtime, Web and the production-shaped fixture must share due-session
   semantics.
2. Direct stock-detail navigation could render a buy-like legacy action when the
   symbol had no authoritative `DecisionEnvelopeV313`, while simultaneously showing
   no recommendation authority.
3. Decision Brief accepted three uncited thesis strings and three uncited risks;
   generic detail also padded missing text instead of returning typed unavailable.
4. Candidate and compact-projection stock dedup retained the first source and
   discarded later same-stock evidence instead of merging every citation and time.
5. The tracked Threads roster fixed the search endpoint to null, leaving its success
   path constructible only by a test-only override even when OAuth was supplied.
6. DI-007 pointed at an obsolete test name and its executor accepted TAP `1..0` as a
   pass because it checked only aggregate file-wrapper counts.

Round 121's operating bridge, method-specific valuation authority, exact
252-session/eight-peer conditional-research plane, SQL identity conservation,
FULL-over-LIGHT authority and immutable revision paths were independently accepted
as closed. Architecture remains blocked until a new immutable tree receives a fresh
Requirements PASS. No production operation was performed.
