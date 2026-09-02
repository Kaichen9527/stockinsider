# Exact commit review: official calendar recovery, VPS readiness, and V3.14 governance closure

Result: `PASS`

P0=0 P1=0 P2=0

## Scope reviewed

- Exact implementation range `a6d0820af7776f25b63204cb8ff43c301f9c4bcf..86d4a8ef6b52c99cb2198a3e87b5857706309634` and reviewed tree `0390907b716568c9bc5d0b290a102595c7dc509e`.
- Official TWSE calendar recovery to 1,320 real completed sessions and reuse of the same cutoff-bound session set by market evidence.
- VPS writer activation readiness ordering.
- Complete V3.14 signed host-pin catalog, canonical digest, command, traceability, and protected graph alignment.

## Findings

- No P0/P1/P2 findings remain. Calendar recovery parses TWSE official monthly data, applies the evaluation cutoff, and never synthesizes weekday sessions.
- Market evidence consumes the latest 520 sessions from that same authority; missing market or valuation evidence remains fail-closed and cannot manufacture targets.
- Writer activation requires both systemd active state and a ready loopback HTTP listener.
- Successive protected runs localized the pre-existing host-pin drift from four stale V3.13/digest assertions to two catalog authority digests, then to the final duplicate V3.13 amendment-version assertion. All are now V3.14-consistent; the graph is registered against the existing immutable V3.14 Requirements and Architecture evidence refs without widening security authority.

## Verification

- Candidate, market-evidence, valuation, source-policy, stage, risk-action, and Shadow tests: 43/43 passed.
- Deployment, migration, scheduler, publication, writer-fence, and Shadow contracts: 17/17 passed.
- Focused candidate/market tests: 10/10 passed; focused structural contracts: 13/13 passed.
- TypeScript, ESLint, diff check, and production Next.js build: passed.
- The most recent protected product run passed 270/272 cases; both failures were emitted by the same final stale V3.13 amendment-version assertion corrected in this tree.

## Evidence

- Final reviewed repair/tree: `86d4a8ef6b52c99cb2198a3e87b5857706309634` / `0390907b716568c9bc5d0b290a102595c7dc509e`
- Full final range: `a6d0820af7776f25b63204cb8ff43c301f9c4bcf..86d4a8ef6b52c99cb2198a3e87b5857706309634`
- Active graph: `1c32b707a2e3d36e0ca01b4e78b9c20fa5bcef5eb34dce486063d9f694a2c9fc`
