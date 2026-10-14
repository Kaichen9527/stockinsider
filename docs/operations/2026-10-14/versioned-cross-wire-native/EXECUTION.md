# Cross-wire native execution — bounded local engineering

Exact executed code: `7951cb3be14715891868dcf08a3acd57a3c98dbb` (tree `9c7b01095144e428d2839af446d75e0c3c7c0f59`). No source or fixture correction was needed. The prior source-only handoff remains historical; this report is the subsequent authorized execution.

Executed once with Node 22.14.0 and PostgreSQL 17.11, original locked dependencies, OS-derived USER, inherited proxy/CA, mandatory FS preload and serial test concurrency. Started 2026-10-14 23:21:02 Asia/Taipei; duration 53.608 seconds. Manual window: 23:19:53–23:39:53 Asia/Taipei.

Command (artifact leaf was absent before launch):

```sh
RESEARCH_PREREQUISITE_PROFILE_ARTIFACTS=/tmp/cross-wire-exec-o14/native-initial-artifacts \
node --experimental-strip-types \
 --import ./scripts/opportunity-v3/research-versioned-prerequisite-fs-witness.mjs \
 --test --test-concurrency=1 scripts/opportunity-v3/research-versioned-cross-wire-native.test.mjs
```

## Results

Six child cases plus one parent: **7 PASS, 0 FAIL, 0 CANCELLED, 0 SKIP, 0 TODO**. Only the new entry ran; the previous AUO-v3/EMC-compatible entry was not imported or rerun.

| Child | Actual result |
|---|---|
| AUO compatible-v2 | First seal, exact schema/hash, 8 opens/closes, pre/post/seal FD order, missing-root replay without IO/charge, same-preparation opposite-binding rejection; nine-table audit unchanged on replay/conflict |
| EMC v3 | Same checks with fixed 7 files; original stored clocks retained |
| AUO v2→v3 mixed slots | Same job/attempt/reservation; two distinct preparations + two sealed revisions = 4 slots / 404008 bytes; fifth preparation rejected `input_preparation_count_bound` with unchanged audit and no IO |
| EMC v3→v2 mixed slots | 4 slots / 246078 bytes; same exact fifth-slot rejection and invariants |
| AUO max30→29 mixed measurement | First preparation 21909 + first seal 177057; second seal 242709; final shared 4-slot charge 462917 bytes |
| EMC max30→29 mixed measurement | First preparation 21667 + first seal 152313; second seal 109288; final shared 4-slot charge 304278 bytes |

**Byte-bound rejection remains pending.** Both legal 30/29-source inputs fit within 524288 bytes. Their measured successful charge does not prove a reachable over-cap input or the rejection path. Sources are synthetic local documents, not 30 qualified independent news roots. No logical-byte, budget, role, cap, clock or expectation was changed.

## Resource and cleanup

Sampling every 250 ms counted the actual test session and PostgreSQL processes, including detached daemons (aggregate RSS may count shared pages repeatedly). Peak 533512192 bytes. Minimum free: `/workspace` 8604012544 bytes; `/tmp` 15307337728 bytes, both above 8 GiB. No threshold stop.

All six independently prefixed server logs were saved before and after cleanup; each confirms server shutdown. All six disposable cluster paths and all twelve writer/observer PID paths were independently confirmed absent; no active PostgreSQL process remained. Observers were separate READ ONLY connections. No cache deletion or other services.

## Evidence and limits

Private full-row payloads, binding contexts and raw server logs stay local at `/tmp/cross-wire-exec-o14/`; they are **not uploaded or committed publicly**. The committed receipt includes their exact relative path/byte/SHA inventory plus 248 selected source blobs/hashes. This selected source inventory is not an approved whole-execution closure. Original RED references remain in the earlier handoff/evidence branches; no new RED occurred in this run.

Unchanged synthetic bootstrap/captured-schema/local two-owner-USAGE profile scope applies. Hs/Hc are the existing partial-four-source/actual-Node engineering identities, not Next compiled identity, old77 execution, formal authority or production activation. No build/types/lint/npm/browser/HTTP/remote DB run was performed. Byte-bound closure, freshness/ABA/response loss/old77/all four callers/whole S-C-B-Q-R-A and formal review remain separate pending work. This maker execution is not independent approval.
