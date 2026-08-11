# Fresh Requirements Gate Review — Round 125

Subject commit: `6b5b75fb9eff7533791a9493cedfdcefb9465e3a`
Subject tree: `7abac8d161b8084a8ab86efdde991edef3359901`
Predecessor tree: `69d72deee8d4786ba54af6a14471a07319fc8067`
Baseline tree: `c8880d15adb87d40ae32773ab87bd4cb9ccf1f8f`
Reviewer: independent read-only `gpt-5.6-sol` / xhigh process
Verdict: `CHANGES_REQUIRED` (`P0=0`, `P1=4`, `P2=0`)

## P1 findings

1. Duplicate `decisionRevisionId` query parameters remained ambiguous on the
   technical, deep-dive and delegated insight surfaces. Tests covered the generic
   detail only, and the DI-004 oracle still mentioned a legacy fallback.
2. Runtime, Web and SQL accepted incomplete or contradictory DecisionEnvelopes:
   the 15% upside/discount and 2.0 reward/risk thresholds, method/as-of/sources,
   nested equality, raw-card uniqueness, and missing-to-unavailable rule were not
   closed. Landing classified cards without first validating them.
3. SQL publication grammar was looser than Web: it accepted `24:00:00`, blank
   whitespace thesis text and numeric citation/provenance source fields.
4. Source acquisition and SQL persistence accepted credential-bearing URLs and
   timezone-free item timestamps.

Round 121 roots remain closed. Round 122 freshness, evidence merge, Threads,
DI-007 ownership, FULL-over-LIGHT and exact lookup roots remain closed. The Round
123/124 citation and publication-boundary roots were not closed. No partial-write
path was found, but invalid payloads were accepted. Architecture remained blocked.
No production operation was performed.
