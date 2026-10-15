# Repaired author union — single native execution, new RED

Taipei 2026-10-16 01:10 task start; actual native 01:11:04–01:11:17 (UTC 2026-10-15 17:11:04–17:11:17). No source changes, no previous suite rerun, no production or remote operations.

## Exact subjects

- Execution/evidence base: `1493cfbeec0ee6f26096b21aec8db1fbc4f47055`.
- Repaired product: `c38fb00986925b4b50719b3389a2a94a5ee3a4c0`.
- SQL SHA256: `9e38550d28849cbbcc178f5237f5a985d921b47560a5be3b164186d5e002ed9b`.
- Harness/helper/fixture: byte-identical `0a0ea4ccc618df2d86ceb4de4bc7eff537ff3f77`.
- All289 input bytes/blobs sealed before execution and rechecked afterward. No product/fixture/harness/profile/expected hash or role/ACL changes.

## Actual result

One command with mandatory early FS preload and test-concurrency1: **0 PASS / 2 FAIL (AUO child + parent), 0 cancelled/skip/todo**. EMC and all author lifecycles NOT_RUN after fail-fast. This does not add to any historical count.

The original captured schema, synthetic bootstrap, financial50, publication26, candidate36 and explicit LOCAL two-owner USAGE setup succeeded. Fresh pristine observer descriptor matched the unchanged original predecessor profile. JS/DB canonical bytes agree: namespace2730480 bytes/hash cb22ccfeb504b6fd82cc1af0d954fe220427d562120dd6089fc9accb9bffd29f; catalog7823725 bytes/hash4afc6fe90ae3d65acbc3858003695fc9b3c9c4122ef129f92ae174f0ea6bf9e4. All six actual original function body hashes match their original source hashes.

The repaired actual SQL crossed the prior catalog selection failure, but failed at the third replacement EXECUTE: **42601 syntax error at end of input**, inline_code_block line261. The logged query is byte-equal to the source CREATE OR REPLACE of `read_research_author_result_v2(jsonb,uuid,text,text)` at migration line268. Server character26960 maps to source line281, the first THEN of `IS DISTINCT FROM CASE ... WHEN ... THEN ... END` in the IF predicate (lines280–283).

This suggests the unparenthesized CASE/IF delimiter as the next narrow source issue; no modified query or independent grammar probe was run, so a repair is not proven here. Earlier two EXECUTEs being reached/completed follows control flow; no in-transaction changed-body snapshot was taken before failure, so this is not a successful four-body postcondition proof.

Explicit ROLLBACK completed. Distinct readonly observer full catalog/namespace/details plus all pg_proc metadata/defaultACL data are identical before/after. No union COMMIT or installed-successor observation. No firstseal/assignment/result business prefix started. Therefore no 9-table business snapshots, durable row/charge/clock proof, or author response-loss proof is claimed. These are NOT_RUN, not zero-valued inferred measurements.

## Resources and cleanup

Fresh resource floor was checked independently. Sampled peak session+PG RSS848293888 bytes; minimum workspace8594186240 and tmp15131566080, both above8589934592. Sampling is not an instantaneous peak claim. No cache/data cleanup or budget adjustment.

Writer648949 and observer648950 absent; owned cluster/socket directory removed; server log confirms shutdown. Postmaster648937 remains a PID1-owned zombie, RSS0, not an absent PID. No roots were created because setup failed before binding/roster/preparation. Private raw and full canonical/catalog/logs remain only `/tmp/author-durable-repaired-o16`. Published witness is maker-derived and does not imply Root inspected private bytes or independently reran native.

Historical unchanged79fd 42883 RED/0a0/d8de/f035 and the source-only c38/1493/8dafa7 six-static-case receipt remain immutable. This new 42601 is a different input and failure, not a rewrite of either history.

## Pending

Root decision on the new exact failure, then a separately authorized changed-input native run; union first COMMIT and all four-body successor postconditions; installed-firstonly rejection; AUO/EMC v3 durable author lifecycle and no-root READ/replay; original77/compatible-v2 differences; busy/drift/forced rollback/principal/lease/invocation/hash/caps/revocation; true author response-loss. Four callers/reviewer/Q-R/reviewpack/atomic publication/whole S-C-B-Q-R-A and semantic/formal publication remain pending. No formal or independent approval is granted by this receipt.
