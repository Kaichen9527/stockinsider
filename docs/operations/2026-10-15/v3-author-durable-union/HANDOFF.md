# Uninstalled finite author storage union — source-only candidate

Base d15f24aa4c6589e0a9d298df71c27f2a705d4a0e, article source5609; consumer92870/protocol d33 remain unchanged. This slice implements private caller methods plus a new additive candidate migration. It does not activate a route, create a principal/reservation, dispatch a model, approve prose or publish an article. No PG, HTTP, application build, dependency install or deployment was executed.

## Implemented paths and trust boundary

`web/src/lib/research-v3-author-result.ts` now calls the **existing signatures** `assign_research_author_v2`, `read_research_author_assignment_v2`, `read_research_author_packet_v2`, `receive_research_author_result_v2`, `read_research_author_result_v2`. These names require the new finite union bodies; they do not authorize sending v3 to old SQL. The old packet's five-key shape fails the v3 seven-key packet contract before receive. No missing-candidate-RPC retry/fallback exists. Only exact retained server binding configuration and the original ten-key request select the branch. Authentication and original controller-principal verification precede body reads/RPCs.

Private methods: `assignAuthor`, `readAuthorPacket`, `receiveAuthorResult`, `readAuthorResult`. `prepareAuthorResult` remains an explicitly nonpersisting diagnostic, with persistence unavailable; it is not used as durable success. Assign validates all15 fields against the verified assignment and a repeat READ. Receive only succeeds with the actual six-key receipt; it checks UUID, assignment, full envelope, tagged hash/bytes, clocks and bounded size. READ recovery revalidates article/citations/calculation/observation against live READ and packet, but performs no model/FS/claim/prepare/seal/receive. The same shared10s deadline spans all stages; no second budget is allocated. Transport errors propagate unchanged and may mean uncertain durable outcome: explicit READ recovery, never automatic receive/reclaim/renew. No API route is installed.

Article table/value/classification/source/clock/cash/ratio/capital semantics are recomputed by the existing exact validator before receive and on recovery, including fully rehashed forged-result negatives. SQL independently binds closed envelope/validated/context keys, original observation constraints, retained normalized calculation, exact Hb/Hs/Hc context, source descriptors, article/output/envelope hashes, original job/reservation/source/lease fences, immutable receivedAt/logical bytes and all false flags. SQL is a finite storage boundary, **not an independent implementation of the JS arithmetic/prose validator**. Service-role calls remain trusted server composition, not an author-controlled validated boolean.

## Candidate SQL and exact predecessor

New `migrations/20261015_research_author_durable_union_candidate_v3.sql` replaces only:

- `research_author_assignment_context_v2(jsonb,uuid,text,text)`
- `read_research_author_packet_v2(jsonb,uuid,text,text)`
- `read_research_author_result_v2(jsonb,uuid,text,text)`
- `receive_research_author_result_v2(jsonb,uuid,text,text,jsonb)`

No new function/table/role/member/service/registry/ledger, GRANT/REVOKE/owner change, installer flag or plan change. Existing assign/read-assignment bodies and original migration files stay exact. Historical77 uses original input READ; other retained candidate selectors use the current candidate READ and never catch failure into legacy. Candidate compatible-v2 stays the original v2 result arm. The original receive-v2 body is retained byte-exact after finite v3 dispatch; v2 packet remains five keys, v3 adds only wireVersion/Hb. This is source preservation, not a newly executed v2 acceptance proof.

Final predecessor source order: unchanged captured-schema→financial50→publication26 (tail ordered edc46d48...)→candidate36 SQL→explicit existing LOCAL two-owner USAGE profile. The four last definitions are still the original author assignments/packet/results migrations; no later original tail overwrites them. `source-derived-profile.json` pins their original and successor body SHA256/signature/line, and the exact preexisting profile/query sources. No observed OID is invented.

The candidate takes the existing installer transaction advisory lock then source610091002→global2409/6002, under READ COMMITTED/statement30s/lock2s. Before mutation, the full existing namespace hash `cb22ccfeb504b6fd82cc1af0d954fe220427d562120dd6089fc9accb9bffd29f` and catalog hash `4afc6fe90ae3d65acbc3858003695fc9b3c9c4122ef129f92ae174f0ea6bf9e4` must match the **unchanged LOCAL prerequisite successor**. These include original body/owner/security/config/ACL/grantor, tables/columns/constraints/indexes/triggers/RLS/effective ACL and roles; password observation is boolean only. Original read-only catalog queries are reused with SQL parameter expressions/INTO destinations. The prior helper canonicalized metadata in JS; this migration uses the original DB canonical function, so byte-equivalence still needs real PG proof and fails closed on mismatch.

Actual pg_proc OIDs/all non-body metadata are captured and compared within the transaction, not hardcoded. The full namespace postcondition substitutes only the four verified body hashes; everything else remains exact. Default ACL rows are captured unchanged; the newly created preparation-owner role is required to have no owner-specific default ACL (source-derived premise pending native). The existing broader default-ACL provenance was not reobserved this turn. The candidate is deliberately first-install-only: already-replaced or unknown profiles fail the predecessor guard, not silently replay. No production profile is claimed.

## Source tests and boundaries

New durable tests use the two pinned full original drafts/materials with explicitly synthetic RPC/role/assignment/receipt data. Both raw Markdown texts and nine original printed Markdown tables remain unchanged; paragraph reference mapping remains synthetic/nonsemantic. No actual COMMIT, authority, trusted model execution or socket-loss proof is implied. Tests cover receive/replay/read absence, all receipt fields/clock/hash/lineage, fully rehashed wrong table/units/cash/caps, unknown/unupgraded packet, auth-before-RPC, shared deadline, same-error transport recovery and source revocation after receive.

Static SQL tests check original/successor hashes, exact allowed replacement set, no grants/new objects, complete guards/lock order, original receive-v2 byte preservation and original atomic scanner handling. They are not a PostgreSQL syntax or migration execution claim. Original first static test5PASS1FAIL matched the comment word “grant”; the corrected checker strips comments, with original raw retained. The initial sandbox `--test` command reported only two file-level passes; it is not counted as individual cases. Direct entrypoint runs provide actual per-case TAP. Final exact-subject counts and resources are in the separate evidence receipt; no historical overlap is added.

## Pending and next actual work

1. Independent source review; actual PG17.11 catalog canonical parity, exact ACL/OID/role/default/profile pre/post, wrong-body/owner/config/overload/default/unknown-profile/busy/forced-error rollback. No candidate SQL has been executed.
2. Genuine old77/v2 and compatible-v2 assignment/result preservation; actual v3 two-issuer assign→packet→receive→read/replay and response loss/source revoke/principal/expiry/invocation/clock/caps negatives through legal fixture lifecycle. Existing old green entries were not rerun.
3. Actual HTTP route and all four callers remain unwired. The private composition is source-ready for a reviewed installer, not an enabled endpoint. No production binding or capability approval exists.
4. Reviewer ordering/independent principals/reservations, Q/R, review-pack, publication finite union and atomic publication, full S-C-B-Q-R-A, exact release/protected checks and formal capacity/transport.
5. Actual claim-by-claim mapping and independent editorial review of both drafts; no author/result/content approval is manufactured here.

All original limits and old SQL49/50/26, roles/ACL/HBA/authority/locks/workflows, reader/core/calculator/material/pins remain unchanged. No sourceClosureApproved/dispatch/model/research/PIT/strategy/entry/publication flag is raised. Private WIP/RED/raw stays local; publish only exact approved-safe summaries/hashes and final stack-free TAP.
