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
