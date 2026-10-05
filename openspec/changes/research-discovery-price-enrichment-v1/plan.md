# Isolated implementation plan

1. Inspect exact source-controller integration commit, immutable capture migration,
   official quote/calendar/adjusted-authority readers and existing phase predicates.
2. Strengthen existing discovery helper's temporal/RSI boundaries, retaining legacy
   standalone compatibility and mandating the full 61-session enrichment path.
3. Add server-only bounded first-capture/raw-quote reader and pure shadow evaluator.
   Keep incomplete benchmark/adjustment/phase sources visibly unknown.
4. Attach one context per candidate after original ranking, before immutable input
   hashing/storage, and return contexts/hash/accounting through the same guarded API.
5. Exercise new DE/DP/DR inventory plus directly affected regressions; run full
   typecheck/lint/build, distinguish platform/baseline failures from owned code.
6. Record real limitations and receipts, commit/push owned files only; source chat
   performs independent review/integration. No PR, merge, deploy, live credential
   acquisition, migration, production write or schedule activation by this worker.

No root npm script or existing migration is changed. A future official adjusted
stock/benchmark adapter needs actual cutoff-visible validation/calendar/action
records; no adapter flag, model claim or synthetic verification can replace them.

Review repair on `8613458`: restrict calendar bounds to latest head/ties, align
exact stock/date/parameter contracts with each collector endpoint, and preserve
legacy captures as unverified historical raw evidence. Execute all prior 43 plus
DP19–DP24 regressions, then return the exact same-branch pushed SHA for independent
re-review. A separate supplementary receipt for later knowledge remains pending;
this repair never backfills the immutable first-known quote/gap.
