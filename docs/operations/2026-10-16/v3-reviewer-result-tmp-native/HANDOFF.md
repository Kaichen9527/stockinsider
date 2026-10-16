# Reviewer-result owned-tmp native: failed, no retry

Execution-only subject: base `513e25de37916c48346982c2964a1808aee535c1`, executed fixture source `1b44d34594bd3dd4bfa6d4e5655e8d7f60959ce7`. All 334 sealed inputs (10,516,436 bytes) remain byte/Git-blob exact. No product, fixture, harness, monitor logic, limits, permissions, or expected outcomes were modified. This handoff is not a new runtime subject or an independent approval.

## Actual terminal result

One serial Node 22.14.0 / PostgreSQL 17.11 run, 2026-10-16 10:37:41.394642Z–10:38:20.573213Z, duration 39.178575 seconds, exit 1. Actual TAP: **0 PASS / 2 FAIL** (AUO child + parent), zero cancelled/skipped/todo. EMC was NOT_RUN after failfast. No rerun occurred.

AUO failed at `author lifecycle: genuine v3 input firstseal`, with `financial_parent_invalid`. This is the original I/O guard rejection, not a SQL P0001 or permission error. It occurred before financial FD acquisition: opens 0 / closes 0. Original candidate read and preassert RPC calls were reached; detailed ReadyForQuery states for these calls were not recorded and are NOT_OBSERVED. Reviewer direct receive and its ReadyI assertions were NOT_RUN.

## Exact physical-input cause

`web/src/lib/research-financial-io-engine.ts:12` rejects every directory with `(mode & 0o022) !== 0`. Its ancestor walk at lines 33–37 checks `/` and `/tmp` before the unique secure child. Actual postrun `/tmp` metadata is mode 1777, device 34, inode 1; `/` is mode 0755. The sticky bit does not exempt `/tmp` from the frozen guard. The new `owned_tmp` physical path therefore reaches a prohibited ancestor even though the private child is 0700. This diagnosis uses the saved actual stack, unchanged source, and read-only OS metadata; no added I/O probe, guard change, chmod, relocation fix, or second native run was performed. Root must decide any next change.

## Components observed before failure

In this new run, complete c08 author union, 2592 handoff fence, and reviewer union SQL each committed and were observed by independent read-only connections. Reviewer union original pre-namespace `718f62f9…` / catalog `e5b3fc64…` became post-namespace `dfdbe8dc…` / catalog `0d8e754a…`; full JS/DB canonical checks agreed. Full before/after private snapshots differ at exactly two routine bodies, their two definition hashes, and two corresponding metadata body hashes; all remaining metadata/OIDs/ACL/defaults/roles/tables are unchanged. Installed-repeat rejected with `P0001 reviewer_union_predecessor_namespace`, and rollback was exact. These are components of an overall failed run, not extra PASS tests or durable reviewer acceptance.

The full 16-table business snapshot before author prefix and at failure is canonically identical, including full ledger, request/input/row clocks and source fences. Ledger charge remains count 1 / 2,582 bytes. Input revision, author assignment/result, reviewer assignment/result, completion and invocation rows are all absent. Financial material, author packet, reviewer packet and reviewer result byte measurements are **null / NOT_RUN**, not historical values or zero-sized results.

## Resources and cleanup

The unchanged 0.2-second monitor recorded 164 samples, sampled peak session-plus-PG RSS 931,356,672 bytes, minimum free `/workspace` 8,590,831,616 and `/tmp` 13,503,692,800 bytes. No resource stop occurred; these are sampled observations, not instantaneous peaks or guarantees. `/tmp` staging and raw/PG writes are RAM-backed; workspace/Git common remain on device 27, and implicit concurrent writes were not assumed zero. No cleanup of cache/history/shared data or reserve manipulation occurred. The below-5GB read-only inventory trigger did not fire.

Normal fixture finally ran. Independent postrun lstat confirmed this run's cluster, socket path, secure parent, and old/new financial roots absent. Six observed backend PIDs are absent; shutdown appears in the saved server log. Sampled Node processes exited. PG PID 705734 remains PID1 zombie, RSS 0, and is **not** called absent or killed. No relay was created. No timeout was represented as query settlement. No recovery cleanup was needed or executed.

## Scope and next work

R1 direct SQL discriminator negatives, actual author/reviewer lifecycle, result/completion atomicity, READ/replay/missing-root recovery and binding read-tombstone rejection were NOT_RUN. EMC was NOT_RUN. Legacy/compatible-v2 reverse dispatch, other ACL/rights/lease/caps/invocation-uniqueness cases, installer busy/drift/rollback for this union, real reviewer transport loss, Q-R/reviewpack/publication union/atomic publication, whole S-C-B-Q-R-A and formal article/semantic approval remain pending. Synthetic local fixture setup is not formal rights, model execution, author/reviewer execution or HTTP/Next acceptance.

Private raw is retained only under `/tmp/rr-tmp-native-o16` and `/tmp/reviewer-result-tmp-native-work-o16`. Public evidence is an explicit hash/count/cleanup allowlist with stack-free TAP. The witness is maker-derived; Root has not received or independently verified the private contents. Prior a085/b6ca resource interruption, 30-vs-29 checker and packaging race REDs remain at their original subjects. No old PASS or RED is reclassified. No VPS, production DB, CI, PR, deployment or terminal PR helper was touched. Full goal remains ACTIVE; this task stops for Root review.
