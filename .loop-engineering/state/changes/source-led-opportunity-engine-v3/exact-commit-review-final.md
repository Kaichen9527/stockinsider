# Exact commit review: official calendar recovery, VPS readiness, and V3.14 governance alignment

Result: `PASS`

P0=0 P1=0 P2=0

## Scope reviewed

- Exact implementation range `a6d0820af7776f25b63204cb8ff43c301f9c4bcf..ed14a17cc2140b65d0456c60875285d5295b398c` and reviewed tree `caecae4363335dbc8773d603ef3d1bb4f6fde87d`.
- Official TWSE calendar recovery when the append-only database plane contains fewer than 1,320 distinct completed sessions.
- Reuse of the same cutoff-bound official session set by candidate research and market-evidence ingestion.
- VPS writer activation ordering after a systemd restart.
- Alignment of the already-upgraded V3.14 signed host-pin fixture with its active catalog, product-track command, and governance hash self-checks.

## Findings

- No P0/P1/P2 findings remain. Calendar recovery unions persisted authority rows with dates parsed from TWSE's official monthly market feed, applies the evaluation cutoff, deduplicates dates, and never synthesizes weekday sessions.
- Market evidence receives the same official session set and uses only its latest 520 completed sessions, eliminating the false 520-session failure caused by duplicate revisions in the young database calendar.
- Failure remains closed: fewer than two official sessions aborts research, incomplete market components leave the risk budget empty, and missing valuation evidence cannot manufacture targets.
- The writer activation script requires systemd active state and a ready loopback HTTP listener before registering the release identity.
- The protected product run exposed four stale V3.13 governance declarations after the signed fixture had already moved to V3.14. The catalog amendment authority, host fixture assertion, protected model-runner command assertion, and derived script-row digest are now bound consistently to V3.14; no host identity or security requirement was relaxed.

## Verification

- Candidate, market-evidence, valuation, source-policy, stage, risk-action, and Shadow tests: 43/43 passed.
- Deployment, migration, scheduler, publication, writer-fence, and Shadow contracts: 17/17 passed.
- Focused candidate/market tests: 10/10 passed; focused structural contracts: 13/13 passed.
- TypeScript, ESLint, diff check, and production Next.js build: passed.
- Before the governance alignment, the protected product track passed 268/272 semantic and structural cases; all four failures were the same stale V3.13 declarator/digest mismatch corrected in this tree.

## Evidence

- Final reviewed repair/tree: `ed14a17cc2140b65d0456c60875285d5295b398c` / `caecae4363335dbc8773d603ef3d1bb4f6fde87d`
- Full final range: `a6d0820af7776f25b63204cb8ff43c301f9c4bcf..ed14a17cc2140b65d0456c60875285d5295b398c`
- Active graph: `8c4d36c50c2e4d2437429a4bf2dbc3911cfe69a59f9ae6a231dd7105a69b1c2c`
