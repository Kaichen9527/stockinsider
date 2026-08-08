# Fresh Sol Requirements Gate — Round 2

Reviewer: independent ephemeral `gpt-5.6-sol`, reasoning `xhigh`, read-only sandbox
Reviewed: 2026-07-18
Verdict: `CHANGES_REQUIRED`
Severity: P0 0, P1 11, P2 1

## P1 Findings

1. Source accounting lacked closed low-confidence/rejection outcomes, reason fields, alias authority, exact claim equivalence and reach identity.
2. Connector ownership for multi-source candidates and canonical sector grouping were undefined.
3. Percentile/tie/quantile math and formal completeness/source-confidence thresholds were incomplete.
4. V3 session freshness conflicted with the existing one-hour OpenSpec publication gate and recommendation/strategy/alert projection obligations.
5. Sector reference universe and auditable per-input market/sector evidence had no exact persistence/public shape.
6. Missing valuation could not serialize a non-null method, stale was not a status, and outlier verification had no actor/evidence/input-hash authority.
7. Existing-position `trim` target could not be serialized independently.
8. The public contract lacked complete bounds, membership/order/mutual-exclusion/delta semantics and had nullable-valuation conflict.
9. Mode-specific runs lacked upstream lineage and deterministic selection; accounting ownership and the idempotency version tuple were incomplete.
10. V3/legacy evaluation ranking, entry-close alignment and link precision/recall sampling/pass rules were unreproducible.
11. Canonical acceptance coverage omitted the above invariants.

## P2 Observation

`AGENTS.loop-engineering.md` references absent `.specify/memory/constitution.md`. Existing Loop policy was sufficient for review; this is repository governance hygiene and not a change blocker.

Architecture Gate was not performed. All P1 findings must be repaired and reviewed in another fresh session.
