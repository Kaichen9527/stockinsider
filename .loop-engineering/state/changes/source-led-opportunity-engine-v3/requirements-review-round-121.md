# Fresh Requirements Gate Review — Round 121

Subject commit: `eaae8ade09534c6158b324f8c30cd0a2c97b4750`
Subject tree: `90570857f5d060767dd60cd9b4f039c3ba139765`
Baseline commit: `75e329471da257c2855d4de04d71e05a589e6c72`
Reviewer: independent read-only `gpt-5.6-sol` / xhigh process
Verdict: `CHANGES_REQUIRED` (`P0=0`, `P1=4`, `P2=0`)

## P1 findings

1. The official operating bridge was not period-aligned or fully reconciled. The
   parser omitted operating expense and noncontrolling interest, constructed each
   TTM series independently and derived weighted shares from aggregate earnings and
   EPS. A read-only adversarial probe mixed 2024 gross profit with 2025 flows while
   still returning `ttm_from_four_official_quarters`.
2. Formal valuation authority remained incomplete across the seven methods. The
   scenario path counted 252 raw rows while using only eight method observations,
   omitted primary/cross-check freshness anchors and did not emit complete scenario
   inputs/sensitivity. Divergence review also discarded its reviewable range.
3. Conditional `research_starter` authority was unsatisfiable and split across two
   planes: SQL supplied 252 sessions including current, runtime removed current and
   required 252 prior sessions, while peers came from a separate legacy sector
   aggregation rather than the candidate's exact exchange/session/sector authority.
4. SQL overflow conservation was count-only. A rejected overflow document could be
   paired with a same-identity `transcript_ready/eligible_for_claim_extraction` item
   and still pass terminal accounting.

The instant balance-fact shape, shared projection freshness/degradation,
FULL-over-LIGHT authority, immutable decision revisions, exact detail lookup, three
Landing sections, compatibility mapping and quality/market-before-technical
precedence were accepted as closed. Architecture remains blocked. No production
operation was performed.
