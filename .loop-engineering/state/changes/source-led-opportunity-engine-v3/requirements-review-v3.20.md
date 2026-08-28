# V3.20 fresh Requirements review — KOL-first runtime recovery

Date: 2026-08-28

Review authority: one independent, read-only Requirements review of the
final V3.20 implementation tree. No production database, scheduler, Vercel,
source connector or Safari state was mutated for this review.

Result: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Parent commit/tree: `6aaa017618f15a0082efb2cafe8c08b32947be1c` /
  `dccb0b789e576d4a0448c00d46a793903a48cad5`
- Final reviewed implementation commit/tree: `42f15635438afe82cb0424b58171eb195abb3e4a` / `f339f81b4a77e2429bb8c06ef60e52dce1f8a03d`
- Full reviewed range: `6aaa017618f15a0082efb2cafe8c08b32947be1c..42f15635438afe82cb0424b58171eb195abb3e4a`
- Active graph: `4baf35c1a17cc7c7cd451e71b29e34e9b83c90ee03ca18822fcf4f7f47b19a7b`
- Scope: the V3.20 runtime incident, candidate nomination authority, five
  connector acquisition matrix, compact Radar compatibility and additive
  migration only.

## Requirement closure

- The expired-run RPC locks one running run plus one leased job and checks the
  exact commit, worker and configuration hashes before terminalizing it. The
  identity-only reaper refuses ambiguous matches. Runtime loss now creates an
  allowlisted, redacted diagnostic and a recoverable terminal state rather
  than leaving a perpetual `running` record.
- `CandidateNominationAuthorityV320` accepts only the five stated KOL/rightful
  authority types. Legacy official-only ledger records are evicted immediately,
  including records that would otherwise be retained for twenty sessions. An
  official observation can be evidence only when the same stock already has a
  valid KOL nomination in the current selection.
- The five connector adapters produce an 85-row `17 × 5` terminal matrix.
  Threads remains official OAuth only; Telegram reads public `t.me/s/` pages
  after its cursor; InvestAnchors reads only bounded, rights-attested structured
  claims. Missing credentials and metadata-only input are typed terminal states,
  not successful research.
- The link guard rejects generic `新興市場 ETF`/fund/index contexts before a
  company alias can match 2605, while explicit ticker-plus-company context
  remains linkable. Regression covers both cases.
- V3.20 accepts the new projection schema in Web, runtime health and internal
  health. Read-only freshness never mutates the immutable envelope; it only
  disables action authority, preserving same-revision detail integrity.
- The reviewed migration is additive, preserves V3.13 51-row source result
  validation while requiring 85 rows for V3.20, follows the claim-wrapper
  delegation chain, and grants no table DML to the runtime role.

## Executable evidence examined

- Product/runtime correctness: `146/146` PASS, including PCR-001 through
  PCR-031, KOL authority, 2605 rejection, five connector conservation, lease
  loss terminalization and exact reaper CLI validation.
- Migration contract/rehearsal: `74/74` PASS.
- Source-led unit suite: `63/63` PASS; legacy V1/V2 regression: `2/2` PASS.
- Browser V3 correctness: `9/9` PASS after installing the pinned Playwright
  browser binary; performance: `5/5` PASS.
- Lint had zero errors (19 pre-existing warnings); TypeScript typecheck and
  production build PASS; `git diff --check` PASS.

This PASS authorizes exactly one independent Architecture review. It does not
authorize production migration, runtime activation, Vercel deployment, a
claim of future returns, or any action that the V3.20 amendment forbids.
