# Exact commit review: official calendar recovery, VPS readiness, and V3.14 governance closure

Result: `PASS`

P0=0 P1=0 P2=0

## Scope reviewed

- Exact implementation range `a6d0820af7776f25b63204cb8ff43c301f9c4bcf..3a28fb7116c3869c795b12afab98368e7ed2f8f0` and reviewed tree `1354ae881e2819061b852eb956bc130a54dc1cc2`.
- Official TWSE calendar recovery when the append-only database plane contains fewer than 1,320 distinct completed sessions.
- Reuse of the same cutoff-bound official session set by candidate research and market-evidence ingestion.
- VPS writer activation ordering after a systemd restart.
- Complete alignment of the already-upgraded V3.14 signed host-pin fixture with its active catalog, canonical catalog digests, product-track command, governance hash self-checks, and protected base graph registry.

## Findings

- No P0/P1/P2 findings remain. Calendar recovery unions persisted authority rows with dates parsed from TWSE's official monthly market feed, applies the evaluation cutoff, deduplicates dates, and never synthesizes weekday sessions.
- Market evidence receives the same official session set and uses only its latest 520 completed sessions, eliminating the false 520-session failure caused by duplicate revisions in the young database calendar.
- Failure remains closed: fewer than two official sessions aborts research, incomplete market components leave the risk budget empty, and missing valuation evidence cannot manufacture targets.
- The writer activation script requires systemd active state and a ready loopback HTTP listener before registering the release identity.
- The protected product runs exposed stale V3.13 declarations and then the two canonical catalog-identity comments that necessarily changed with the catalog. The amendment authority, fixture assertion, model-runner command, derived script-row digest, and both catalog SHA-256 authority comments now bind consistently to V3.14; no host identity or security requirement was relaxed.
- The final graph is registered against the existing immutable V3.14 Requirements and Architecture evidence refs so later base-owned protected workers can resolve it without accepting candidate-selected evidence.

## Verification

- Candidate, market-evidence, valuation, source-policy, stage, risk-action, and Shadow tests: 43/43 passed.
- Deployment, migration, scheduler, publication, writer-fence, and Shadow contracts: 17/17 passed.
- Focused candidate/market tests: 10/10 passed; focused structural contracts: 13/13 passed.
- TypeScript, ESLint, diff check, and production Next.js build: passed.
- The first protected product run passed 268/272 cases; after the V3.14 declarator repair the second passed 270/272, leaving only the two catalog-digest authority bindings corrected in this final tree.

## Evidence

- Final reviewed repair/tree: `3a28fb7116c3869c795b12afab98368e7ed2f8f0` / `1354ae881e2819061b852eb956bc130a54dc1cc2`
- Full final range: `a6d0820af7776f25b63204cb8ff43c301f9c4bcf..3a28fb7116c3869c795b12afab98368e7ed2f8f0`
- Active graph: `1c32b707a2e3d36e0ca01b4e78b9c20fa5bcef5eb34dce486063d9f694a2c9fc`
