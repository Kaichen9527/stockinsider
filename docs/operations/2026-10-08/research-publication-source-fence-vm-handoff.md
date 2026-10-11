# First-publication v2 source fence: VM slice, 2026-10-09

This is an isolated development slice of independently approved contract64f7f077352cbef216e9fd175c9f93a2c94a9d5e, not publication or role approval. Observed repair43d19d6 is included; root relayed its unsigned scoped review closure. The original 30-case maker receipt is retained unchanged at `.agent/reports/2026-10-08T16-32-observed-priority-fences-vm.json`.

## Actual change

The additive migration installs a database transaction advisory fence shared by all INSERT/UPDATE/DELETE and TRUNCATE paths on `source_raw_documents`, including direct legacy service writers. A deliberately coarse single lock covers root/rights changes and new-revision phantoms. This trades source-write throughput for a simple common lock order. It does not alter existing production writer lease/gate triggers. Future publication must take this source lock before other publication locks; a full deployed writer/ACL dependency audit remains required.

Sealing rebuilds exact row hashes and current root/rights state under the same fence. It creates private immutable source dependency receipts. Rights revocation, retraction, new revision, parent change and deletion append atomic invalidations without rewriting receipt bytes. TRUNCATE fails closed. A restricted owner-only recheck acquires the same fence; service callers cannot use it as publication permission. This function still needs integration into the future existing submission transaction. Receipt replays retain original clocks, and unknown publication time remains null. No historical PIT eligibility is granted.

No article/input revision, principal, official instrument, formal stock, stage, publication, role reservation or strategy is created by this migration. The narrow PG fixture contains synthetic source rows and production-equivalent BYPASSRLS service privileges on the source table; it is not a full production predecessor/RLS deployment rehearsal. Source-fence receipt invalidation is proven; published-article dependency/invalidation integration is still pending.

## Verification and resources

Actual native PostgreSQL17.11: initial10/10 and final11/11 TAP, zero skip. Real separate database connections exercised both source-first and seal-first commit orders. Rights/new-root revision invalidation and restart preservation passed. Required types, lint and normal web build passed; lint retained33 existing warnings. Web source tree was unchanged. No dotenv filenames were found under the web directory; only filename inventory was read. Exact measurements, source hashes, clock/capability boundaries and logs are in `.agent/reports/2026-10-09T04-10-publication-source-fence-vm.json`. The receipt records sampled process-group/descendant RSS, including sampling limits; df availability is not asserted to be project quota.

The manual window is UTC03:56:08–04:26:08 / Taipei11:56:08–12:26:08. No automated role-budget acceptance is inferred.

## Snapshot regression: failure preserved

Requested exact6fd23c04d4feb75087b069aae738631deefda428 in a separate fresh cluster:16 TAP,12 pass/4 fail/0 skip. c96's missing-FROM error is gone. The first new error is `operator does not exist: boolean -> unknown` at `commit_insider_snapshot_page_v1` line15, expression `d.metadata @> doc->'metadata'`. Full first SQL query and log SHA are preserved in the receipt; raw log is `/workspace/cloud-insider-snapshot-6fd-artifacts-oct09/pg-native-6fd.log`. Later progress failures follow that failed commit. Worker-owned d274 repair and approved597 harness are queued; neither is claimed to pass actual stack acceptance here.

## Actual identity gap and next work

Platform status currently supplies no configured capabilities or secrets, and no genuine research author/reviewer adapter/identity authority was available. Caller-provided author/reviewer strings and cross-chat observations cannot establish authenticated role execution. Real dispatch therefore remains unavailable rather than retrospectively wrapping manual AUO/EMC drafts. Next slices must bind immutable v2 input, original job/reservation, trusted assignments and execution clocks, then integrate the same existing outbox/submission/receipt pipeline. The source seal does not relax any of those conditions.

Root relayed VPS expansion as a resolved earlier capacity shortfall, not permission to bypass each job's admission. This VM still measures its own cgroup/disk bounds. No main merge, deployment, VPS operation or protected evidence was performed.

## Successor repairs after exact6b49 independent review

Root relayed two independently reproduced PG defects: an older ancestor's rights/withdrawal could be laundered by a child, and REPEATABLE READ could hold a stale snapshot across the advisory lock and miss a committed seal. The predecessor is retained as a failed review subject, not approved code.

Successor seals deliberately reject any non-self parent lineage until complete immutable ancestor/rights closure exists. This is a visible unsupported scope, not a claim that one-level roots prove ancestor permission. All source write/record/seal/assert functions require READ COMMITTED; RR and SERIALIZABLE fail closed rather than pretending an advisory lock refreshes their snapshot. Actual RC two-order concurrency tests remain. Exact INSERT-conflict and no-op UPDATE replay also received an independent maker red→green fix: BEFORE obtains the lock, AFTER logs only actual row changes.

Final exact-old-SQL red run:15 TAP,8 pass/7 fail/0 skip, including the aggregate failed parent. Actual stale RR writer committed, invalidations0, private assertion accepted. Final repaired run:15/15 zero skip; RR writer rejected before mutation. A new normal build passed. Types/lint refer to the identical unchanged web source tree; native PG tests validate SQL. Earlier mislabeled/intermediate measurement runs are retained and explicitly corrected in `.agent/reports/2026-10-09T04-21-source-fence-review-repair.json`. Exact successor independent review is pending.

## Separate exact-checkout queue completed before 04:26 UTC

Clock exact77002376: approved official pinned unmodified source built once in0.94s with test-only `-UFAKE_SLEEP`; dynamic nm wrapper absence check passed. Library SHA483dfc28d0b87718ce50b48d382f03b8615fe861c5f859c958ddfc934fa0b3c6. Original three PG suites plus dedicated open/closed/restart/100ms timeout cases passed6/6 zero skip on PG17.11. C signal main/handler/end offsets matched at0,+3600,-3600; same built ELF direct/helper nm each completed1–4ms. CI16 nm hang was not reproduced or declared fixed. Earlier stock-library failure remains unchanged. Full proof is `.agent/reports/2026-10-09T04-25-clock-770-vm.json`; no new build of this exact clock branch is claimed, and the d274 build is a different scope.

Snapshot exactd274726e clean checkout: original16 PG cases plus1 Linux FD journal passed17/17 zero skip. Its fresh normal build, types and lint passed (33 warnings). Actual guarded Next→PostgREST16.3→PG17 passed6/6 zero skip:401/no write,1001 documents over three rounds/four empty pins, exact replay,12MiB raw/16MiB base64 transport and +1 rejection, oversized projection atomic rejection. Loopback-only services and all ephemeral keys were synthetic; source raw egress and formal minimum-privilege deployment were not claimed. Receipt `.agent/reports/2026-10-09T04-25-insider-d274-vm.json` preserves source/build hashes, prior c96/6fd failures, actual privilege profile, resources and sanitized artifact hashes. Worker source was not edited and remains a separate branch.
