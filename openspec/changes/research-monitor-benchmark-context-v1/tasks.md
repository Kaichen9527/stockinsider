# Benchmark context implementation checkpoint — 2026-10-09

- [x] Bounded requirements/design unsigned review for25b7587, after fixing source-release approval inheritance and shared-deadline pagination requirements.
- [x] Pure aligned61-session TWSE/TPEX context, exact clock/revision selection, explicit unavailable reasons, canonical source bindings and ratio fractions.
- [x] Readonly adapter with fixed-cutoff ordered pagination, exact counts, combined logical8MiB cap and one15-second abort deadline.
- [x] Existing guarded snapshot stores context, binds context/version into decision identity, and normally regenerates source release. Parameters remain unchanged; no approval is created.
- [x] Maker focused14/14 and actual-route dependency integration5/5 plus release identity1/1, zero skips. Fixture transport/storage and price-plan stub are explicit; this is not PG/HTTP acceptance.
- [ ] Independent code review on frozen implementation commit; close findings rather than infer approval from the earlier design review.
- [ ] VM actual PostgreSQL/PostgREST/guarded route acceptance, including complete/missing/corrected data, exact replay, wrong-calendar binding and no-auth no-write.
- [ ] VM unchanged relevant suite, typecheck, lint and normal build on exact final subject; preserve failures and resource receipts.
- [ ] Subsequent integration into reviewed release; protected authority, genuine strategy approval and production adoption remain separate.

Maker raw TAPs (outside Git, synthetic fixtures only):

- `/tmp/stockinsider-monitor-benchmark-second.tap` —14/14.
- `/tmp/stockinsider-monitor-benchmark-route-second.tap` —6/6 (five actual-route tests plus one source-release identity test).

The actual-route tests execute the imported benchmark adapter, existing execution-approval reader and decision function together, with synthetic DB transport. They verify old source-code approval is rejected, held monitoring persists, identical input replays, corrections change decision identity, missing benchmarks remain explicit, and auth is checked before DB access. They do not claim official feed activation, production ACL acceptance or investment performance.

Independent exact1c1fc2 review found one P2: BigInt literal syntax was incompatible with the repository's ES2017 TypeScript target, despite Node strip-types tests passing. The successor uses BigInt constructors without changing tsconfig and regenerates the normal source release. The original failure and subject remain in Git; affected tests and independent targeted compiler check must be repeated. No semantic or parameter change accompanies this repair.

Independent successor78882 code pass closed the P2 (targeted ES2017 TS2737 three→zero, adapter/route19/19 and nine epoch probes); full VM build/HTTP remain separate. Ordinary GitHub CI run37887903183 then exposed an existing converged-base priority contract harness gap:19 tests failed on its missing real observed-priority module registration, while3 native cases were explicitly skipped. Adding the actual module revealed one stale fixture missing the now-required `research_scope:'formal_v1'`; repair adds that field and an observed-only negative-control job while retaining every original assertion. The resulting affected39/39 tests pass, zero skip, with unchanged runtime codeHash/parameters. This does not retroactively relabel the failed CI run or skipped native cases successful.
