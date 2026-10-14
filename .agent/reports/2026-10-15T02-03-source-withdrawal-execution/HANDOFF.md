# Source withdrawal / exact-row ABA: actual local native delivery

Executed exact `eeb874de40508d69f07f3740dba2af990b6bf653` (runtime/test source `870436576d89d1a7f34cddb10f197787978d42f3`). No source/harness correction was needed. This is an evidence-only commit on the authorized execution branch; it does not create a new runtime subject or independent approval.

**4PASS = 3 children + parent, zero fail/cancel/skip/todo**, one invocation, 26.435139 seconds. Node22.14 / PG17.11 and binary SHAs are recorded. Mandatory early FS preload, serial test runner, fresh private artifact directory, original capturedschema + actual50 +26 + candidate36 + existing explicit LOCAL two-owner USAGE profile were used. No old green entry was selected.

| Child | Actual barrier / intended mutation | Result |
|---|---|---|
| AUO currentv3 | Preassert succeeded;9 FDs held; mutator590573 COMMIT xid757 ordinal5 before postassert call ordinal6 | Exact P0001 source_seal_invalidated_or_missing;9/9 closed; no sealed revision; count1/2581bytes unchanged |
| EMC compatiblev2 | Postassert succeeded with6 FDs held;6 closed before mutator590607 COMMIT xid758 ordinal7 and seal call ordinal8 | Same exact P0001;6/6 closed; no sealed revision; count1/2580bytes unchanged |
| AUO original77 ABA | Genuine original producer/old sealer first COMMIT; mutator590641 separate commits xid759 and762, full selected source row/hash A→B→A | Source row/table hash restored;2 immutable events and2 durable invalidations retained; current read and seal replay both exact P0001,0 current FS, original sealed row/charge/hash/clocks unchanged |

The first two are interrupted first-seal attempts, not successful first seals. Original77 necessary prefix used the exact retained source child, not a relabelled newproducer. Its Node SHA is the observed current engineering Node, not historical compiled Next. Child PID590642 had true exit0+close and pendingRpcAtSave0, actual8/8 FDs; original RPC trace has read/assert/assert/seal. ABA charge remains count2/168978bytes after first seal (initial prep2584bytes).

There are5/6/8 saved snapshot stages respectively. Each carries full9 table counts/hashes, full ledger and original logical charges, full selected source row/root hashes, events/invalidations, seals/owned lease state, and actual FD counters. Private raw preserves original payloads/rows/clocks; Git exposes only their safe hashes/counts and the sanitized machine witness. Independent mutator/writer/observer PIDs are distinct, observer is read-only, and committed RETURNING rowhash matched the observer before blockedRPC. Only selected metadata rights, one event per update and exactly dependent-seal invalidations changed; other8 tables/ledger/charges/sealed rows did not. Failed RPCs added no mutation. All prototype capability values remain false.

The captured schema-only fixture has the original production writer fence's no-active-release early-return path, with no active release populated by this fixture. Actual service-role UPDATE still acquired/released its own original production-data-plane lease and passed normal triggers. This is **not** verification of an active production release header/writer identity, private peer, live source rights or production readiness. No trigger bypass, extra grant/role, alteredSQL, clock or limit was used.

## Cleanup and resources

Three owned clusters stopped; before/after server logs retain shutdown confirmation and all three paths/postmaster PID files are absent. Of53 recorded session/PG/connection/child PIDs,50 are absent and3 zombie (no active process); no owned backend remains live. Mutator COMMIT and owner-bound release were awaited; final lease state equals baseline. This is observed cleanup, not a claim of kernel IO cancellation.

Peak sampled session+PG RSS548708352bytes; minimum workspace8600940544bytes, tmp15290810368bytes, both above8589934592. No cache/shared/history/evidence deletion. No setup installation/configuration change or build. Sampling is every0.2s and reports sampled, not theoretical instantaneous peak.

## Evidence and limitations

Private root `/tmp/source-withdrawal-exec-o15` is mode0700. Full raw remains local; Root has not fetched it. The machine witness is **maker-derived**, not independently approved native evidence. All259 source Git blobs were rechecked unchanged. Receipt inventories every private file hash and all published source identities.

One evidence-only derivation RED is preserved: an overbroad filename suffix exclusion dropped `blocked-rpc-error.json`, yielding0 selected errors. The extractor was corrected to exclude only the exact generic RPC-error filename and succeeded; native/app source was unchanged and no native rerun occurred. Original305/lifecycle/byte RED and prior green receipts remain untouched.

Still pending: whole application closure and four actual callers, Q/R and cash citation allowlists, formal author/reviewer/publication/source qualifications, active production writer/private peer/capacity, other lease/lockwait/response-loss races, and previous rejected-byte would-charge measurement (still null). No PR/ref/merge/deploy/CI rerun or protected approval is implied.
