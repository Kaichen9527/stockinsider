# Fresh Sol Requirements Gate — Round 5

Reviewer: independent ephemeral `gpt-5.6-sol`, reasoning `xhigh`, read-only sandbox
Reviewed: 2026-07-19
Verdict: `CHANGES_REQUIRED`
Severity: P0 0, P1 10, P2 3

## P1 Findings

1. Document content-hash preimage/encoding/normalization/overflow order was not canonical.
2. Source idempotency omitted output-affecting deferred eligibility.
3. Provider/field allowlist hash was absent from market manifest/idempotency preimages.
4. Claim-occurrence conservation conflicted with a claim-hash uniqueness constraint.
5. Market provider precedence and z-score sample/variance/zero-variance rules were incomplete.
6. Broker consensus lacked a hard institution cap and equal-timestamp tie-break.
7. Missing required valuation inputs had no closed public reason.
8. Approved consensus-divergence verification could still be re-blocked by decision logic.
9. Cold/no-success egress omitted a matching run still in progress.
10. Backtest date selection and separation from matured live cohorts were incomplete.

## P2 Observations

1. Mover-audit symbols lacked exact uniqueness/order/length invariants.
2. The repository constitution reference remains absent.
3. `gate-summary.md` prematurely requested Architecture review while Requirements remained pending.

Architecture Gate was not performed.
