# Fresh Architecture Gate Review — Round 12 Production Completion

Date: 2026-08-08
Reviewer: Codex independent architecture gate review
Review mode: read-only review of the Requirements evidence-carrying immutable tree
Result: `PASS`
Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Protected base: `2a15fcff2172101f2c75fc0a88d3ec82f13d1fb1`
- Requirements implementation commit/tree: `e3d4269383dc545985359fb1352ef63e0eb6cf8a` / `c75d1cf51a2ddfe5be7fe24a0eb01c3400f0a793`
- Requirements evidence carrier/tree: `fa54a5daae34151b7afd314c24651bc576e65964` / `58e12e49a970401b7c4d57041d9d1885095d2a0c`
- Full reviewed range: `2a15fcff2172101f2c75fc0a88d3ec82f13d1fb1..fa54a5daae34151b7afd314c24651bc576e65964`
- Active contract graph: `bd557c0f27263dbca17610ec07469ac73835838e5cc3d6d5fe921891c82de435`
- Requirements evidence: `requirements-review-round-101.md`, `PASS P0=0 P1=0 P2=0`

The Requirements evidence carrier changes only evidence and status. It does not alter
the executable subject or the closed active graph.

## Architecture decision

The completion architecture is additive and fail-closed. Official master data and
tracked legacy documents seed the existing immutable V3 authority plane; the reviewed
single producer consumes that plane into compact projections; Vercel remains a bounded
read-only consumer. Bootstrap authority, producer activation and V3 ranking influence
remain separate privileges.

### Authority bootstrap and recovery

- Official roster fetching is bounded to two fixed HTTPS endpoints and validates
  exchange, four-digit symbol, names, dates, duplicate symbols and minimum cardinality.
- Bootstrap execution is bound to a clean exact implementation commit plus its direct-
  child attestation and a separate owner-signed, expiring, replay-protected mutation
  envelope. It cannot run from a dirty workspace or an unrelated evidence commit.
- One session advisory lock serializes the entire operation. Principal/roster/source
  identity setup commits first; source revisions use independent 100-row transactions.
  An interrupted document phase retains valid append-only batches and a later signed
  invocation converges idempotently. No cleanup path deletes authority history.
- Rehearsal mode uses the same append functions but limits document work and rolls back
  the complete transaction. The observed zero post-count proves this path does not
  mutate production.

### Point-in-time and producer DAG

- Invalid legacy publication chronology is rejected, never rewritten. Remaining
  publication, collection, authority approval, record and validity timestamps must be
  visible at the selected cutoff.
- A material refresh cutoff is the first elapsed whole second after the greatest new
  authority `recorded_at`. That timestamp and occurrence kind participate in the
  occurrence identity, yielding one repeatable run rather than a per-poll loop.
- Ordinary Taiwan weekday 18:20 behavior is unchanged when no later material authority
  exists. The refresh retains the latest available trading-session identity and does
  not invent a weekend market session.
- The existing 60-to-30-to-20 funnel, leases, bounded retries, terminal outcomes and
  immutable compact projection remain the only production producer path.

### Health, compatibility and rollback

- Local doctor evidence is canonicalized and written locally before durable database
  publication. A publication/schema/database failure fails activation and invokes the
  existing scheduler/pointer rollback transaction.
- Vercel accepts a durable observation only when its commit, worker hash and config hash
  match the latest producer. It separately verifies projection hash/freshness and stuck
  runs. Mixed-version health cannot be assembled into PASS.
- Rollout order is migration, signed bootstrap, exact Web deployment, exact runtime
  activation, then read-only smoke. Each step has a prior Vercel/runtime target and the
  append-only bootstrap is safely resumable rather than destructively rolled back.
- `/api/opportunity-v3` remains disabled and does not query V3 public ranking state.
  Bootstrap and shadow evidence cannot change legacy ordering, LINE dispatch or any
  mutating public endpoint.

### Product correctness boundary

The architecture creates dynamic discoverability, not synthetic conviction. A newly
linked symbol can surface as `source_signal`, but absent official financial/price facts
continues to produce unavailable technical/valuation state and no buy-like geometry.
The 2337 golden case, negative-EPS rules, BIAS, PE comparisons, support/reclaim states,
material revision identity and legacy compatibility remain owned by the unchanged
active graph and covered by the 31 PCR boundaries.

## Failure and recovery map

| Failure | Closed behavior |
|---|---|
| Official roster unavailable/underfilled/duplicated | bootstrap stops before DB transaction |
| Signed authority invalid, expired or replayed | CLI stops before mutation |
| Phase-one database error | explicit rollback, session lock release |
| Document batch error/interruption | current batch rollback; prior append-only batches retained for idempotent resume |
| Publication after collection | typed bootstrap rejection, no source revision |
| Health schema/publication failure | runtime activation rollback |
| Durable observation belongs to another producer | public health fail-closed fallback |
| Consumer/producer commits differ | compatibility failure; no PASS |
| Dynamic evidence lacks valuation/technical authority | `source_signal`/`valuation_review`, no buy-like action |
| Real cohorts immature | Promotion remains blocked; no fabricated rows |

## Evidence reviewed

Typecheck, lint, zero-warning production build, 61 core tests, 31 PCR tests, 27 applied
PostgreSQL tests, two rollback rehearsals, full 3,189-row source preparation audit,
official 1,977-instrument normalization and zero-finding root/Web production dependency
audits all pass. The working tree was clean and the exact range passed `git diff --check`.

Evaluation governance remains
`blocked/non_fabricated_elapsed_cohorts_unavailable`. Shadow evidence may accumulate,
but ranking influence and homepage promotion remain prohibited until every real cohort
conjunct passes.

## Decision

`PASS P0=0 P1=0 P2=0`.

The architecture is constructible, recoverable and compatible. The evidence-carrying
tree may become the exact implementation commit and proceed to exact-range diff review,
protected Code/Verification Gate and the explicitly authorized rollout sequence.
