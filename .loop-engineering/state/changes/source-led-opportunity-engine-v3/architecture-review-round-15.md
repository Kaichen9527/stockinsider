# StockInsider V3.13 — Architecture Gate Round 15

## Subject identity and cleanliness

- Commit: `1e6f8c421cc1141a3fa2376dbae8aea4af7db262`
- Tree: `be578da611fa0cfb224e6781067e4b0f1b7984ec`
- Parent: `df2e210a3f883070ee42f947c78388164f024e4c`
- Detached HEAD and clean; no staged, unstaged or untracked files.

## Verdict

`CHANGES_REQUIRED P0=0 P1=2 P2=0`

This was an independent, read-only, offline Sol XHigh architecture review. It did
not execute tests, mutate the repository, or authorize any production operation.

## Findings

### SI-V313-AG15-P1-001 — Actionable detail cache crosses freshness boundary

The origin generated correct `no-store` stale/unavailable bodies, but a ready detail
body containing the envelope and valuation used
`public, s-maxage=60, stale-while-revalidate=300`. A shared representation created
immediately before a missed-run boundary could therefore remain actionable after
origin freshness became `stale_readonly`. Deep-dive forwarded that cache policy and
insight inherited it.

Required closure: every time-authorized revision-bound detail response is
`no-store`; add a clock-bound fresh-to-stale regression proving the stale body omits
the envelope and valuation through the shared deep-dive/insight publication path.

### SI-V313-AG15-P1-002 — Generic migration runner can apply unauthorized V3.13 SQL

The durable authority record denies V3.13 production migration. The generic
`db:migrate` denylist excluded base V3 and V3.12 but omitted V3.13, so it could commit
V3.13 objects and function replacements without the dedicated authority boundary.
The old plan pinned only the base migration.

Required closure: replace filename denylisting with a closed legacy allowlist;
exclude current and future V3-family migrations; emit one complete ordered/hash-pinned
base + V3.12 + V3.13 plan bound to the durable authority artifact; add regression
coverage and preserve the dedicated disabled/drain rollback boundary.

## Prior-finding closure

Round 14's publication finding was only partially closed because of the ready-cache
escape. Its blocker vocabulary, unavailable union, stale precedence, envelope-free
stale body, React behavior and SQL trust-boundary portions were verified closed.

No additional P0, P1 or P2 finding was identified.

## Limitations and authority

Historical test statements were context only, not current execution evidence.
Production authority remains absent for V3.13 Web deploy, DB migration, runtime or
credential activation, source writes, V3 activation, LINE/dispatch and ranking
promotion.
