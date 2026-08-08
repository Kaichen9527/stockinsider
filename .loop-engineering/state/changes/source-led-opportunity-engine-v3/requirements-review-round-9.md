# Requirements Gate Review — Round 9

- Reviewer: fresh independent `gpt-5.6-sol`, `xhigh`, read-only session
- Date: 2026-07-19 (Asia/Taipei)
- Verdict: `CHANGES_REQUIRED`
- Counts: `P0=0 P1=6 P2=0`

## Findings

1. **P1 — Policy lineage:** `publisherVerificationPolicyHash` changed `comparisonContractKey` but was absent from logical idempotency, so OPS-013 could reuse the wrong prior success.
2. **P1 — Sector manifest:** sector-excess populations were closed, but aggregate tuples/exclusions/conservation/key order/static financial-contract hash and maximum-bound acceptance remained incomplete.
3. **P1 — Peer reviewers:** `reviewerAllowlistHash` had no canonical point-in-time authority, bound or cutoff-visible membership rule.
4. **P1 — Publisher bound:** publisher authority manifest had no workload sentinel or overflow acceptance.
5. **P1 — Sector cycle:** sector 20d/60d excess lacked an exact market benchmark.
6. **P1 — Public lineage:** unavailable status for cold/nonmatching states and `acceptanceVersion` identity were not exact.

## Independently Confirmed Closed

The 156-case JSON/mirror/count; recognized non-TW suffix semantics; peer row sentinel/terminal exclusions/tuples/conservation/collapse; point-in-time publisher-row comparison separation; all Round 7 repairs; additive guarded storage; atomic success; shadow/legacy isolation; and zero model influence.
