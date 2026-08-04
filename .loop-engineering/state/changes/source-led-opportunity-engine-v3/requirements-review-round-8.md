# Requirements Gate Review — Round 8

- Reviewer: fresh independent `gpt-5.6-sol`, `xhigh`, read-only session
- Date: 2026-07-19 (Asia/Taipei)
- Verdict: `CHANGES_REQUIRED`
- Counts: `P0=0 P1=4 P2=0`

## Findings

1. **P1 — Sector-excess populations:** the exact market/sector population, terminal inclusion/exclusion rules and conservation for sector-excess percentiles remained unspecified.
2. **P1 — Unsupported markets:** `unsupported_market` was public but unreachable because recognized non-TW suffix lexemes and offsets were absent.
3. **P1 — Peer authority:** the peer-authority manifest lacked an exact preimage, closed exclusions, workload bound and overflow behavior.
4. **P1 — Acceptance:** no case proved that a point-in-time publisher-row change alters manifest/idempotency without altering `comparisonContractKey`, while a static policy change alters the comparison key.

## Independently Confirmed Closed

The 152-case JSON/mirror/count and unique IDs; canonical URL/query/claim identities; raw/canonical content hashes; alias/roster/taxonomy/publisher manifest preimages; twelve factor-reference populations; missing-MA20 invalidation; deterministic public refs/root bound; adjusted mover selection/denominator; directed peer traversal; typed `changedBecause`; market-reason/failure precedence; guarded writes; atomic success visibility; and legacy shadow isolation.
