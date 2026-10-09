# Exact review finding repair — 2026-09-26

Independent native review 5325166143 / comment 4110689295 on source c3522ea
identified a missing --apply-reviewed-calendar-amendment argument in the guarded
CI execution step. This repair adds that argument; the CLI still verifies both
independent exact-head contracts before applying the single bounded overlay.
No execution flag, native acceptance, artifact hash, original input, frozen
proposal, 31-path budget, R1 equality or statistical criterion is relaxed.

Three offline regression tests execute the actual workflow shell with an argv
recorder in place of Python. They cover submitted and inline review forms,
paths containing spaces, exactly one runner invocation, the amendment flag,
and the existing execution/trigger boundary. They do not invoke the study or
contact a network. On the old workflow two tests failed for the missing flag;
after the fix all 240 research tests passed in the Chat Linux workspace.
GitHub CI and new exact-head independent review must be checked separately.

The completed c3522ea 31-path Mac study remains immutable; it is not rerun or
retargeted to this repair. Its original 49-file inventory, including six missing
logs, has now been restored byte-exact on evidence branch commit
797e6f9f5492f568f1200b4660ee49594459c6c2. Archive run 36229261758 succeeded;
artifact 10902450836 ZIP SHA256 is
4ee7f33d76d2a655bd1352af72dfd9c89c2c5f2e3008fc4652d487316e49eed8.
The downloaded ZIP was also independently hash-checked and all 49 inventory
entries matched. Archive success is not a new research run or release approval.

The user has authorized the new measured host-identity compatibility work in
separate PR #285 and deferred capacity and production deployment. No host pin,
protected authority, production data, article publication or trade is changed
by this workflow repair. Full financial/article coverage remains unaccepted.
