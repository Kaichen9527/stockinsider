# Exact implementation review — candidate research, live shadow, and VPS snapshots

Date: 2026-08-31

Review authority: read-only review of the complete immutable diff, migrations,
production-write boundaries, source terminal semantics, public projection cache,
and VPS scheduler configuration. The review included SQL/data safety, concurrent
writer exclusion, stale-action fail-closed behavior, official-market provenance,
shadow reproducibility, payload compatibility, and deployment rollback boundaries.

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `950ef2fd98237e0aa31682d6c2216c0ad49f0f91` / `555c55c2a1848230f4e0511fcb042085264cb46d`
- Full final range: `dfffaa5277462bf6b8431f39d10b4dac3db681bd..950ef2fd98237e0aa31682d6c2216c0ad49f0f91`
- Active graph: `329de76e514164f7ebd1905708491aa15e80c9ce34eb0fb7be3eb03786cdcf64`

## Review result

- The additive migration preserves historical rows, uses service-role-only RPCs,
  and performs home/daily snapshot publication atomically while retaining the
  prior last-good snapshot on failure. No DROP, TRUNCATE, destructive backfill,
  broad public grant, or secret-bearing unit command was introduced.
- The shared database lease and bounded systemd file locks prevent GitHub manual
  recovery, source refresh, and the research pipeline from becoming concurrent
  production writers. All scheduled GitHub workflows and Vercel write crons are
  disabled; Threads is excluded from this scheduler and shadow SLA.
- Every recent source-hit candidate is visible in found. Official metadata,
  trading sessions, price history, technical features, point-in-time fundamentals,
  conservative valuation, and classification run independently per stock. Missing
  inputs do not manufacture targets, and a failed refresh revokes older actionable
  authority; failure to persist that revocation aborts publication.
- Two-close promotion uses adjacent official trading sessions. Same-day shadow
  writes are canonical and include research, freshness, completeness, source
  health, and deterministic classification-replay identity; conflicts remain
  non-qualifying evidence and historical backtests cannot increment live progress.
- Telegram now treats an approved seven-channel roster with zero parsed messages
  as `parser_failed`, preventing a green empty-run false positive. PTT and Telegram
  production attestations are enforced by the protected VPS environment; BullTalk
  remains explicitly license-blocked and cannot enter the scheduled active roster.
- TypeScript, lint, source-ranking tests, candidate/shadow contracts, the 56-test
  opportunity product contract, production build, and diff hygiene completed
  successfully on the exact subject.

## Closure

No P0, P1, or P2 code finding remains. The subject is ready for protected checks,
the reviewed additive migration, an atomic VPS release, a controlled first cycle,
and live canary/performance verification.
