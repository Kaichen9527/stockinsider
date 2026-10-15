# Author durable union native — blocked exact candidate

Task window began 2026-10-15T15:20:23Z (deadline 16:00:23Z). One new native invocation only; no old green suite, build, remote service, production install, PR, or review ref.

- Executed harness source: `0a0ea4ccc618df2d86ceb4de4bc7eff537ff3f77`; tree `9c729baf6daa822a9403d5adb9bb5db3eef356e7`.
- Frozen product: `79fd6e001ec77f58618d784948f9097e785b8f31`; all 131 prior product inventory files byte-equal. Branch base `68bc9c83e1c41796a1a700f7bf197eae2dd42b9f`.
- Only harness, test-only original-draft construction and one optional private fixture callback were changed. Callback runs after the original LOCAL two-owner prerequisite, before binding registration or business fixtures. Defaults do not call it.
- Product migration SHA256 `d7ebb13af043d28d189a2337b5544850ccd5d2407ed53b4f3475693a514988ae` remains unchanged.

## Actual result and root cause

Node22.14 / PostgreSQL17.11 run 15:27:28–15:27:39Z: **0 PASS, 2 FAIL (one AUO child plus parent), 0 skip/todo/cancel**. EMC was not registered after fail-fast; it is NOT_RUN, not a skipped/passed case. Syntax checks of three harness/helper modules exited0.

The genuine original captured schema + synthetic bootstrap + financial50 + publication26 + unchanged candidate36 + explicit LOCAL two-owner USAGE setup completed. A distinct readonly observer read the full pristine catalog/namespace, object identities/default ACLs, and the six actual installed function bodies. All six bodies match their original source-derived hashes. Original JS and DB `research_observed_canonical_json_v1` byte encodings agree exactly:

- namespace: 2,730,480 bytes, `cb22ccfeb504b6fd82cc1af0d954fe220427d562120dd6089fc9accb9bffd29f`;
- catalog: 7,823,725 bytes, `4afc6fe90ae3d65acbc3858003695fc9b3c9c4122ef129f92ae174f0ea6bf9e4`.

Executing the **unchanged actual candidate migration** then failed with PostgreSQL `42883: operator does not exist: name = name[]`, inline block line17, the first catalog SELECT. Its first source occurrence is migration line68: `c.relname=ANY((SELECT array_agg(relname ...)))`. SQL treats this as subquery ANY over a name[] column, rather than scalar-array comparison. Seven later source sites use the same pattern (81/90/98/553/566/575/583); those are static risks, not seven additional executed failures.

Explicit ROLLBACK completed. Observer full before/after state and all pg_proc non-body metadata/default ACL data are equal. No function replacement or union COMMIT occurred. This is not a hash mismatch and no expectation, role, grant, body, or SQL was adjusted. Root must decide a narrow expression repair preserving the fixed scope/order/hashes before authorizing a new-input run. Do not retry this unchanged failure.

## Scope, private evidence and cleanup

The setup stopped before binding registration, roster/source/job/preparation creation and input firstseal. No business-row snapshots were obtained; do not infer 9-table/author-row counts from this catalog-only failure. Full original draft/native lifecycle code is sealed but NOT_RUN. The source inventory is a conservative union of the earlier installation acquisition closure and author product closure plus new harness (289 Git inputs); historical test/docs entries in it were not executed. The three edited harness bytes were sealed before run; the complete immutable Git subject was committed before execution and rechecked afterward.

Private raw catalog/canonical/error/serverlog remains only `/tmp/v3-author-native-o15`; public files contain allowlisted hashes, catalog identities, resources and stack-free TAP. They are maker-derived witnesses, not Root raw-byte verification or independent approval. Historical source/RED evidence is unchanged.

Sampled peak session plus PostgreSQL RSS744697856 bytes. Minimum free: workspace8594411520, tmp15206969344; both above8589934592. No cache/output cleanup was used. Readonly observer PID643599 and installer PID643598 are absent. PG logged shutdown and owned cluster/socket directory `/tmp/vp3profile-U5U7Ud` is absent. Postmaster PID643586 remains a PID1-owned zombie with RSS0: **not all PIDs absent**. No business roots were created; no pending query/client was reused after failure.

## Pending, not green

- Union first COMMIT, exact four-body successor observed metadata, installed-repeat refusal.
- Busy, wrong body/owner/config/overload/default/profile, forced-error rollback matrix.
- Both v3 issuer assign/packet/receive/read/replay and full 9-input-table plus assignment/result/clock/charge observations.
- Original77 and compatible-v2 author delta acceptance.
- Principal/lease/invocation/hash/caps/source-revocation and true author response-loss recovery.
- Actual routes/four callers, Q/R/reviewer/review-pack/atomic publication, whole S-C-B-Q-R-A, per-claim semantic article review and formal publication.

The first installer RED blocks dependent lifecycle stages. No formal author execution, live source rights, private peer, production ACL or publication approval is claimed.
