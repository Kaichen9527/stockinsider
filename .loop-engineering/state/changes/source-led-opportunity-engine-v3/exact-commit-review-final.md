# Exact implementation review — Taiwan session publication hotfix

Date: 2026-09-06

Review authority: independent read-only review of the complete immutable diff,
the production session authority boundary, publication metadata selection,
queue starvation behavior, internal writer authentication, systemd scheduling,
and focused regressions.

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `95e50d6558ef746b69b6d7846519544c48452661` / `d8362336a66cac85f8a45d90d49cc2e3f6e8f3c1`
- Full final range: `0e0976f4d5628519bd2bd268a9377bf3a2f9f458..95e50d6558ef746b69b6d7846519544c48452661`
- Active graph: `1c32b707a2e3d36e0ca01b4e78b9c20fa5bcef5eb34dce486063d9f694a2c9fc`

## Review result

- Scheduled close refreshes now resolve the newest authoritative session from
  the maintained exchange calendar or already-persisted official close rows.
  The latter can advance a stale calendar without guessing weekends or market
  holidays, and only evidence available at execution time is considered.
- Preliminary publication uses the identical resolver, so it no longer reads
  wall-clock weekend metadata while the data refresh targets a prior session.
- If both authority reads fail or neither contains a valid session, the routes
  return a terminal non-2xx response; the change introduces no weekday or
  future-session fallback.
- The preliminary service drains up to 100 queued jobs before publication so
  previously retryable work cannot starve the six just-enqueued market jobs.
- Exact internal bearer authentication and the active VPS writer lease remain
  mandatory before any read or write. No credential, public trust-boundary
  expansion, destructive schema change, or permissive valuation fallback was
  introduced.
- Focused provider contracts passed 5/5. TypeScript, lint with zero errors, and
  the production build completed successfully.

## Closure

Independent exact-diff review found no remaining P0, P1 or P2 release blocker
in this hotfix. It is safe to merge and deploy, followed by a controlled VPS
queue drain and preliminary-publication canary.
