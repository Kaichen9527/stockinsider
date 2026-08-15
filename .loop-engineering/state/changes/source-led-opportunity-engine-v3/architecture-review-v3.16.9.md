# StockInsider V3.16.9 — Fresh Architecture Gate

## Subject identity

- Subject commit: `8580f40c932d0a8a84fb4d9a4f938d1c34fe067d`
- Subject tree: `c32ee762b622a4163a1a86d8027763f9fcd392bf`
- Requirements closure: `PASS P0=0 P1=0 P2=0`
- Review time: `2026-08-15T21:22:00Z`
- Subject worktree/index: clean

## Verdict

`PASS P0=0 P1=0 P2=0`

## Fresh architecture conclusions

- The repair separates event/knowledge time from database transaction time
  instead of weakening the historical resolver or backdating `recorded_at`.
- The private resolver is bounded by session, market, evidence cutoff and
  transaction cutoff; it preserves latest-head conflict semantics and cannot
  import a parent whose source or collection time is future to the child.
- Chunk order remains the dependency order: calendar, financial facts, prices,
  corporate actions, reported valuations, terminal. Each outer append/apply RPC
  commits before the next reviewed chunk, so the private resolver sees a parent
  only after durable commit.
- The existing staged hash check, immutable application ledger, <=20 item bound,
  synchronous lease renewal and terminal conservation remain outside the
  replaced base and are unchanged.
- Scheduled future calendar rows retain their intentional non-materializing
  outcome; every nonempty item that requires a parent now either appends
  idempotently or raises a safe typed dependency failure.
- The general valuation RPC and all public/detail analytical reads keep the
  original one-cutoff point-in-time authority. The transaction-aware append is
  private and reachable only through the lease-bound reviewed ingestion path.
- Upgrade safety is explicit: the new migration replaces the already preserved
  V3.15 base by exact signature, applies twice, restores ownership and closes
  temporary schema CREATE authority before commit.
- A failed run's prior application rows cannot authorize a later run or
  completion because applications are keyed by job/run/chunk and completion
  also requires the same terminal graph. Additive authority rows remain
  immutable and idempotent.
- Runtime rollback, Vercel rollback and disabled action authority remain
  coordinated release prerequisites; no data-plane success can independently
  promote a Web action.

## Evidence

- Requirements subject and closure: fresh PASS, zero findings.
- Fresh PostgreSQL full-chain apply twice: 54/54 PASS.
- Executable repaired path traverses the actual chunk-apply base for calendar
  and corporate action, then verifies public count 0/private count 1 and one
  reported valuation append.
- Product correctness: 108/108 PASS.
- `git diff --check`: PASS.

This Architecture PASS authorizes full implementation verification and exact
commit review only. It does not authorize publication before the runtime has
two terminal producer results.
