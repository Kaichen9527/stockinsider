# Exact implementation review — hourly financial evidence drain

Date: 2026-09-06

Review authority: independent read-only review of the complete immutable diff,
the durable financial acquisition queue, VPS writer boundary, bounded worker
budget, retry semantics, and systemd schedule wiring.

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `07fbf68eee2ee86e8f6c987cf79350dda8749a27` / `0f5bcefba1e459556e8d85053b8b5cbc716932ee`
- Full final range: `ac588c9ffdce48ac594bb88e0fc6ab7224968207..07fbf68eee2ee86e8f6c987cf79350dda8749a27`
- Active graph: `1c32b707a2e3d36e0ca01b4e78b9c20fa5bcef5eb34dce486063d9f694a2c9fc`

## Review result

- The new route requires the exact internal bearer and a live, release-bound
  VPS writer before reading or mutating acquisition state. It exposes no
  credential, raw filing content, or public write surface.
- Each invocation selects only ready durable jobs and enforces a hard total
  budget of twenty claims across MOPS and all TPEx endpoints. Existing
  concurrency remains two for MOPS fetches, and the shared production lock
  serializes it with close, source, and research writers.
- Hourly work disables enqueue expansion and consumes the existing persistent
  queue. The daily research cycle retains its original enqueue behavior and
  default claim limits, so this change does not alter valuation thresholds,
  stage authority, or immutable Shadow inputs.
- Failed official requests still use the existing terminal classification,
  durable retry/backoff, cursor, and IR fallback paths; one issuer cannot
  prevent the remaining claimed jobs from reaching a terminal result.
- The timer keeps the approved minute-10 cadence and chains the market queue
  before the financial queue under one lock. TypeScript, the 155 focused
  research/provider tests, lint with zero errors, and the 72-route production
  build completed successfully.
- The diff changes no secret, database schema, public data license, valuation
  method, promotion threshold, or deployment authority.

## Closure

Independent exact-diff review found no P0, P1, or P2 release blocker. The
change is safe to merge and deploy after the protected product/runtime gate.
