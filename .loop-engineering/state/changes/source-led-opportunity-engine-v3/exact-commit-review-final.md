# Exact implementation review — AUO research direction sample

Date: 2026-09-24

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `d24977824a0ff00beef6a26b53e6c8078144841b` / `e205dc2ea9ec28a2d6aa40a18693f4196ea7f767`
- Full final range: `3852578bd0b0dcbd564836792926a46d757423cf..d24977824a0ff00beef6a26b53e6c8078144841b`
- Active graph: `c563d77e416fdc2284b7aba50ca2eb03fd5f4cbed44f4edb1c918c63db96e3a2`

## Scope and outcome reviewed

- The AUO page is labeled as a single-issuer research-direction sample. Its issuer evidence, order-stage uncertainty, existing-business EPS, conditional commercialization bridge, reverse-price sensitivity, and entry conditions remain separate. Intel cooperation is not treated as a confirmed order or added to base EPS.
- The article and tables use the same versioned data and calculation functions. Company background, financial detail and evidence ledger are collapsed behind accessible native disclosures. The page is read-only and does not promote a formal investment recommendation.
- The issuer-scoped research inbox accepts bounded, authenticated summaries; it keeps root URLs, observation times, revision hashes and visibility metadata. The new canary endpoint requires an exact internal bearer and an active writer, and its symbol scope is bounded before acquisition and valuation.
- The AUO forward common-equity/PB path needs eight adjacent reported quarters, aligned common-equity and share dates, point-in-time PB observations, and an official segment bridge. Missing or contradictory inputs block target publication. The two SQL migrations extend enumerated valuation values and approve only AUO's own IR host.
- The frozen trading setup is evaluated in trading-day order, keeps the first terminal event, and distinguishes target touch from a filled trade. The official 2026 exchange calendar controls price freshness.

## Review repair

- Review found the AUO-specific valuation profile could be selected for a historical cutoff before its `2026-09-19` effective date. Commit `d24977824a0ff00beef6a26b53e6c8078144841b` passes the research cutoff through both valuation and coverage selection; an invalid or earlier cutoff cannot activate the profile. Focused historical-replay tests pass.
- Review also removed two whitespace-only extra trailing lines. `git diff --check` passes.

## Security and rollout boundary

- Internal writes remain behind existing authentication and writer fencing. The preview is read-only. No secret, cookie or private social content is introduced in the diff.
- The current article is explicitly a demonstration of future article direction. Its static 2026-09-23 market snapshot and uncalibrated multiple sensitivities are labeled; they must not be presented as a current executable target after freshness expires.
- This review covers the exact source commit. Merge, database migration, production release activation and post-deploy verification are separate steps.

## Verification

- Focused AUO model, preview contract, inbox, valuation, and historical-cutoff tests passed. TypeScript, ESLint (zero errors), Next.js production build and `git diff --check` passed.
- The exact-commit V3 product-correctness suite passed 154/154 with zero failures, skips or todos. The structured PCR fulfillment record binds the captured command output and all 31 PCR boundaries to this exact commit.
- GitHub's diagnostic product/runtime job must finish successfully before merge; protected gate results are not replaced by these local checks.
