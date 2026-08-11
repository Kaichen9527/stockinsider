# V3.14 exact implementation commit review

## Immutable subject

- Parent: `75e329471da257c2855d4de04d71e05a589e6c72`
- Exact implementation commit: `db55309e17887d59d2f6001f5577114ab6cc343b`
- Range: `75e329471da257c2855d4de04d71e05a589e6c72..db55309e17887d59d2f6001f5577114ab6cc343b`
- Review mode: independent, read-only exact-range review using `gpt-5.6-sol` at `xhigh`
- Verdict: `CHANGES_REQUIRED P0=0 P1=4 P2=3`

## Findings

1. `P1` — the V3.14 completion wrapper delegated non-empty V3.14 decision revisions to the closed V3.13 persistence validator and constraints, so publication rolled back.
2. `P1` — `selective_or_defensive` treated the absent `actionAuthority` property as permission, making `wait_market` unreachable from the real worker.
3. `P1` — checksum-valid V3.13 read-only cards were removed by the V3.14 DecisionEnvelope filter before the three-section Landing rendered them.
4. `P1` — the official calendar loader fetched only two years, which cannot establish 300 completed sessions near the beginning of a year.
5. `P2` — the exact deep-dive and insight boundary rejected `decision-v3.14:*` revision identifiers.
6. `P2` — runtime doctor classified every V3.14 projection as a fresh pre-V3.13 legacy projection instead of applying the shared freshness policy.
7. `P2` — the valuation audit filtered and rejected all V3.14 revisions and continued to emit a V3.13 report schema.

## Required closure

- Persist and read a non-empty V3.14 revision and evaluation through a fresh applied PostgreSQL migration while preserving V3.13 compatibility and apply-twice safety.
- Preserve a false action gate for defensive/selective regimes and prove `wait_market` remains reachable.
- Render all checksum-valid read-only compatibility cards in browser evidence.
- Load enough bounded official annual history for early-year 300-session authority.
- Accept V3.13 and V3.14 exact revision IDs at the detail boundary.
- Apply the same V3.13/V3.14 freshness policy in Web and runtime doctor.
- Audit both envelope versions under the V3.14 audit schema.

This review grants no production authority. A repair commit, repair-range review,
full-range closure review and authoritative Verification Gate remain mandatory.

## First repair-range review

- Range: `db55309e17887d59d2f6001f5577114ab6cc343b..1fd694954a4805ec11cbe6b99c13f98fa45a93db`
- Repair tree: `a3a110688648334a4170f933943e0f3ba70ca279`
- Review mode: independent, read-only exact-range review using `gpt-5.6-sol` at `xhigh`
- Verdict: `CHANGES_REQUIRED P0=0 P1=2 P2=1`

The first repair closed all seven original findings, but its review found three
new compatibility boundaries: the three-year calendar output exceeded the 1,200
row completion ceiling; valid V3.14 `unavailable` cards with retained threshold
diagnostics were rejected by SQL; and V3.12 read-only cards exposed an unbound
detail link. The next immutable repair bounds calendar retention, preserves typed
threshold diagnostics in the applied validator and removes revision-less detail
navigation, with applied PostgreSQL and browser regressions. Closure review remains
mandatory and grants no production authority.

## Second repair-range review

- Range: `1fd694954a4805ec11cbe6b99c13f98fa45a93db..1136125ce1814d199856c0c81bf685b396917199`
- Repair tree: `e76f020e6d88078dc0f5b6cedf2ebda7854afed8`
- Review mode: independent, read-only exact-range review using `gpt-5.6-sol` at `xhigh`
- Verdict: `CHANGES_REQUIRED P0=0 P1=1 P2=1`

The second repair review found two over-broad exemptions: actionable V3.14 SQL
envelopes could omit threshold authority, and exact-revision stale current-schema
cards lost their safe typed detail navigation. The next immutable repair makes
thresholds mandatory for every actionable action while validating optional retained
diagnostics on `unavailable`, preserves revision-bound stale links, and still removes
all revision-less V3.12 card navigation. Closure review remains mandatory.

## Third repair-range review

- Range: `1136125ce1814d199856c0c81bf685b396917199..603f6da509c9976f1f8c2ead1a056c76b3bf68b7`
- Repair tree: `7370a78dead156acc625c11240fc52fa2a0fbe8a`
- Review mode: independent, read-only exact-range review using `gpt-5.6-sol` at `xhigh`
- Verdict: `CHANGES_REQUIRED P0=0 P1=0 P2=2`

The third repair closed both P1 roots. Its review found two remaining executable
closure gaps: retained `unavailable` threshold diagnostics did not enforce the same
regime-to-margin/reward-risk mapping in SQL, runtime and Web; and the restored stale
current-schema exact-revision link lacked a positive browser traversal. The next
immutable repair applies one closed threshold schema at all three boundaries,
rejects omitted SQL threshold keys, and follows a stale V3.14 Landing card to its
typed revision-bound read-only detail in Playwright. No production authority is
inferred from this review.

## Fourth repair-range review

- Range: `603f6da509c9976f1f8c2ead1a056c76b3bf68b7..d1d62b787baf505ac2fa036e25fc385079103e8d`
- Repair tree: `cfac0decdc33e47e7fc8b510410eedc8f2ebfa53`
- Review mode: independent, read-only exact-range review using `gpt-5.6-sol` at `xhigh`
- Verdict: `CHANGES_REQUIRED P0=0 P1=0 P2=1`

The fourth repair review verified the regime mapping and browser traversal, but
showed that PostgreSQL three-valued logic still accepted a threshold object with an
omitted required subfield. The next immutable repair defines threshold authority as
one exact six-key object at SQL, runtime and Web boundaries and executes missing,
extra and mismatched-field negative cases against fresh applied PostgreSQL.
