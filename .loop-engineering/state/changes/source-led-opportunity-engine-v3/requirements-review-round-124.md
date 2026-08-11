# Fresh Requirements Gate Review — Round 124

Subject commit: `13ebbd0395932f8ce44d5b2ac01081b2976086cb`
Subject tree: `69d72deee8d4786ba54af6a14471a07319fc8067`
Baseline commit: `75e329471da257c2855d4de04d71e05a589e6c72`
Baseline tree: `c8880d15adb87d40ae32773ab87bd4cb9ccf1f8f`
Reviewer: independent read-only `gpt-5.6-sol` / xhigh process
Verdict: `CHANGES_REQUIRED` (`P0=0`, `P1=3`, `P2=0`)

## P1 findings

1. Public `/stock/{symbol}/technical`, deep-dive API and insight API still bypassed
   the revision-bound DecisionEnvelope, exposed legacy action/target/stop/playbook
   authorities, and their GET path could queue refresh writes.
2. Generic detail treated an envelope version string as sufficient authority, did
   not require nested/outer revision identity equality, uniqueness per symbol, or a
   closed action/readiness/authority/geometry matrix. Malformed envelopes could
   render as buy or throw.
3. Cited authority remained optional at SQL persistence and accepted malformed URL,
   non-string refs, impossible/local timestamps, and duplicate/conflicting refs in
   different layers.

Round 121 roots remain closed. Round 122 schedule freshness, evidence merge,
Threads acquisition, exact DI-007 ownership, FULL-over-LIGHT precedence and indexed
revision lookup remain closed in isolation. The Round 122/123 publication-boundary
and cited-authority roots are not yet closed. No production operation was performed.
