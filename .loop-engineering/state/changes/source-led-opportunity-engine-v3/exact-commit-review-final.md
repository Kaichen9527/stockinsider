# Exact commit review: official calendar backfill and VPS readiness

Result: `PASS`

P0=0 P1=0 P2=0

## Scope reviewed

- Exact implementation range `a6d0820af7776f25b63204cb8ff43c301f9c4bcf..63e903db2c585c9256f834b482624d8f83a0c777` and reviewed tree `e8156ed32c68367a90ebfc32c485df526438cf0f`.
- Official TWSE calendar recovery when the append-only database plane contains fewer than 1,320 distinct completed sessions.
- Reuse of the same cutoff-bound official session set by candidate research and market-evidence ingestion.
- VPS writer activation ordering after a systemd restart.

## Findings

- No P0/P1/P2 findings remain. Calendar recovery unions persisted authority rows with dates parsed from TWSE's official monthly market feed, applies the evaluation cutoff, deduplicates dates, and never synthesizes weekday sessions.
- Market evidence receives the same official session set and uses only its latest 520 completed sessions, eliminating the false 520-session failure caused by duplicate revisions in the young database calendar.
- Failure remains closed: fewer than two official sessions aborts research, incomplete market components leave the risk budget empty, and missing valuation evidence cannot manufacture targets.
- The writer activation script requires systemd active state and a ready loopback HTTP listener before registering the release identity.

## Verification

- Candidate, market-evidence, valuation, source-policy, stage, risk-action, and Shadow tests: 43/43 passed.
- Deployment, migration, scheduler, publication, writer-fence, and Shadow contracts: 17/17 passed.
- Focused candidate/market tests: 10/10 passed; focused structural contracts: 13/13 passed.
- TypeScript, ESLint, diff check, and production Next.js build: passed.
- The active graph is unchanged from the preceding exact-reviewed release, whose product correctness suite passed 150/150.

## Evidence

- Final reviewed repair/tree: `63e903db2c585c9256f834b482624d8f83a0c777` / `e8156ed32c68367a90ebfc32c485df526438cf0f`
- Full final range: `a6d0820af7776f25b63204cb8ff43c301f9c4bcf..63e903db2c585c9256f834b482624d8f83a0c777`
- Active graph: `81dceab0d17b6c0f0c104ee3376f6d1dc5065a283040a4c1ee0ac40f574580d4`
