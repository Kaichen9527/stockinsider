# Architecture Gate Review — Round 1

- Reviewer: fresh independent `gpt-5.6-sol`, `xhigh`, read-only session
- Date: 2026-07-19 (Asia/Taipei)
- Reviewed range: `12c131aa50ca53268878e9f025973533ac100c49..22594433`
- Verdict: `CHANGES_REQUIRED`
- Counts: `P0=0 P1=8 P2=0`

## Findings

1. **P1 — Source revision plane:** current `source_raw_documents` is URL-unique, lossy and normally truncated to 4,000 characters. The architecture lacks an additive immutable revision ledger, dual-write/backfill rules, exact connector field adapters and supporting indexes for the canonical raw/canonical hashes.
2. **P1 — Knowledge time:** roster and taxonomy rows do not bind immutable recorded/collected knowledge time, so a later insertion with an old business timestamp could enter an earlier manifest. Official alias seeding inherits the same look-back defect.
3. **P1 — Additive data plane:** storage inventory omits exact persistence for publisher authority/verification, source revisions, official observations, adjusted prices, trading calendars, mover audits, peer manifest evidence and several terminal manifest row sets. Exact columns, constraints, indexes, FKs, immutability, RLS and normalized-versus-JSON layout remain unresolved.
4. **P1 — Transactions and recovery:** advisory run claim and terminalization lack RPC signatures, isolation level, staging protocol, lease/heartbeat/crash recovery and cleanup rules. Independent PostgREST calls cannot supply one snapshot/transaction by convention.
5. **P1 — Principal binding:** shared `requireInternalAuth()` proves no reviewer identity; alias, valuation, peer and blinded-audit actors can be impersonated. The general server client also falls back to the anon key instead of failing closed for V3 writes.
6. **P1 — Execution placement:** finite maxima still exceed one synchronous Vercel request. The architecture lacks database-side scans/hashing, durable chunking, resumable worker ownership and explicit memory/query/egress/time budgets.
7. **P1 — V3 detail seam:** V3 cards can link into the legacy stock page, whose read path may show differently authoritative data and trigger legacy background writes. Read-only V3 detail projection, labeling and no-refresh behavior are unspecified.
8. **P1 — Acceptance coverage:** the 158-case inventory does not cover the seven architecture gaps above, including crash recovery, impersonation/service-role failure, maximum resource execution and V3-detail isolation.

## Independently Confirmed Strengths

- The primary funnel is source-led and bounded; market, peer and mover data cannot independently promote a candidate.
- Entity-link accounting, quotas, valuation/decision rules and public bounds are substantially deterministic and fail closed.
- RFC 8785 plus SHA-256 is feasible in the Node runtime without a new production dependency.
- Public availability unions, shadow-only mode, RLS intent, internal guarded writes, no legacy recommendation/strategy/alert writes and zero model authority are explicit.
- The reviewed commit is pure Loop/constitution documentation; no implementation, migration or production mutation exists.
