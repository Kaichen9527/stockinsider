# Exact commit review: official calendar recovery, VPS readiness, and V3.14 governance closure

Result: `PASS`

P0=0 P1=0 P2=0

## Scope reviewed

- Exact implementation range `a6d0820af7776f25b63204cb8ff43c301f9c4bcf..8f4bb78dfbef305e676c24208fb79b85fb89fb22` and reviewed tree `7b2aabc2d9465cc968aac07aa9e3467d76df5319`.
- Official TWSE calendar recovery to 1,320 real completed sessions and reuse of the same cutoff-bound session set by market evidence.
- VPS writer activation readiness ordering.
- Complete V3.14 signed host-pin catalog, canonical digest, fixture byte/hash/version, runner identity, command, traceability, and protected graph alignment.

## Findings

- No P0/P1/P2 findings remain. Calendar recovery parses TWSE official monthly data, applies the evaluation cutoff, and never synthesizes weekday sessions.
- Market evidence consumes the latest 520 sessions from that same authority; missing market or valuation evidence remains fail-closed and cannot manufacture targets.
- Writer activation requires both systemd active state and a ready loopback HTTP listener.
- Protected runs localized all pre-existing host-pin self-check drift. The final traceability owner now binds the actual V3.14 amendment, Codex 0.151.0-alpha.7.2 fixture, 2,142-byte canonical fixture digest, and 885-byte runner identity. No host identity or security requirement was relaxed.
- The final graph is registered against existing immutable V3.14 Requirements and Architecture evidence refs for subsequent base-owned runs.

## Verification

- Candidate, market-evidence, valuation, source-policy, stage, risk-action, and Shadow tests: 43/43 passed.
- Deployment, migration, scheduler, publication, writer-fence, and Shadow contracts: 17/17 passed.
- Focused candidate/market tests: 10/10 passed; focused structural contracts: 13/13 passed.
- TypeScript, ESLint, diff check, and production Next.js build: passed.
- The most recent protected product run passed 270/272 cases; both failures came from the same stale host identity block now updated atomically in this tree.

## Evidence

- Final reviewed repair/tree: `8f4bb78dfbef305e676c24208fb79b85fb89fb22` / `7b2aabc2d9465cc968aac07aa9e3467d76df5319`
- Full final range: `a6d0820af7776f25b63204cb8ff43c301f9c4bcf..8f4bb78dfbef305e676c24208fb79b85fb89fb22`
- Active graph: `1c32b707a2e3d36e0ca01b4e78b9c20fa5bcef5eb34dce486063d9f694a2c9fc`
