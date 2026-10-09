# Outbox race harness pipe-drain repair

Recorded UTC: 2026-10-08T15:09:54.672944+00:00

PR315 product-runtime run37782830390/job113329983656 failed because its captured second-writer stderr was empty when matching `research_thesis_head_changed`. The unchanged harness at8751318/7baa resolved on process exit. A controlled real child independently demonstrated data can arrive after exit, before close. This proves a harness defect, but does not conclusively identify that CI failure's sole cause.

Unsigned independent requirements/architecture review approved a bounded test-only repair before implementation. The helper settles on close, retains original code/signal, rejects spawn/stream errors, caps each output at64KiB and wait at30seconds, checks the monotonic deadline again at close, and destroys pipes on failure. Only its still-live original child may be killed; no leader signal after exit. The SQL caller handles rejection before waiting for its unchanged PgSleep barrier and cancels live collections if the barrier or later work fails.

All original database assertions, writer ordering, error regexes and row counts remain unchanged. No migration, product code, protected authority, production data or strategy was changed. Existing CI command includes the modified test file, so the added lightweight collector cases are not disconnected.

Verification: old exit-based collector failed the actual inherited-pipe regression (0pass/1fail/0skip); repaired six collector cases passed. Full existing real-PostgreSQL17.10 suite plus six collector cases passed7/7, zero skipped, on Mac Node22.14.0. Syntax and diff checks passed. No full application build or VM regression yet; queue these on VM. Exact successor code review remains pending. Local tests do not substitute for protected evidence or authorize merge/deploy.

Source file SHA256:

```json
{
  "scripts/test-support/collect-piped-child.mjs": "588dd7b370d72388510a7833d86b476409a6fb5231bebbf289fad32a2d6d290c",
  "scripts/candidate-dossier-outbox-v6-postgres.test.mjs": "fcbc7e59fdf09babfe3172c4a33f3d2313ca5984f39b7321884be0898c8cc337"
}
```

Private local artifact references (not uploaded raw logs):

```json
{
  "/tmp/stockinsider-pr315-product-runtime.log": {
    "bytes": 279955,
    "sha256": "81dbe0f0150a09f245382c60d0bfe08adfb3ab47671cfa3f33b9aaf8bdacd180"
  },
  "/tmp/stockinsider-outbox-pipe-drain-red.log": {
    "bytes": 1122,
    "sha256": "b16762c06f33199006fea11b86515c30a49195a82b5a4575ff33f005c41574fa"
  },
  "/tmp/stockinsider-outbox-pipe-drain-green.log": {
    "bytes": 1279,
    "sha256": "5e55b3a50ab3f3b24d7eb33c1f78ac23ca39c5d616412c38a0086c9085e1f36d"
  },
  "/tmp/stockinsider-outbox-pipe-drain-all.log": {
    "bytes": 1505,
    "sha256": "d3491c1ab3ce60c5474d532a72d553a151188f794d89986c6498f898d2d794fb"
  }
}
```

Remaining: independently review exact commit, execute native VM PostgreSQL and required normal web build, update PR. No unchanged CI rerun was requested.


## Failed-spawn boundary successor

Post-review probing found the missing-stream failure branch attempted child.kill without a positive spawned PID and returned before installing the child error listener. A controlled real failed-spawn probe on de57358 terminated its own test process with exit137; no application/VPS/provider process was targeted. The exact native low-level signal path is not inferred from that exit alone. A safe deterministic regression independently records the invalid kill attempt (1fail/0skip).

The successor requires a positive safe PID before signalling and installs the error listener before stream validation. It never signals the absent spawn and handles late spawn errors. Updated actual MacPG+collector8/8pass0skip; fixed native failed-spawn/no-stream probe exits0 with piped_child_streams_required and no uncaught event. Original SQL assertions remain unchanged. Earlier de57358 review does not automatically approve this successor; renewed exact review and VM/build required.

Successor source hashes:

```json
{
  "scripts/test-support/collect-piped-child.mjs": "5e9fdc0f17224024cef9cea68fa8548261577d379ef42d4693068822f824a652",
  "scripts/candidate-dossier-outbox-v6-postgres.test.mjs": "8b33bec792a73230813970d50e60b774139a555c3a1aa58d498cf727705073d3"
}
```
