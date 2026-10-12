# Financial49 captured existing-schema native attempt

Base 0dd1f36dfe80660b073aa5102f42671cec577e3a. Only a new native test, exact original schema fixture/README and this handoff are added. Installer/guard/catalog expectations, financial169 SQL, default48, authority artifacts, package/locks and role source files remain unchanged.

## Input and restoration scope

The schema-only fixture is copied byte-for-byte from PR364 exact 2e078dfdd74272d3d50dffdd4cc6c14df3152c78. Compressed SHA256 2e9fc2f8a795a13490c12a90a2d9c974e19c1e93f9593d443d834978e0a19c60; decompressed SHA256 a82e3b089ee0523a9de3b1a84c0e799d878fa47bb6ec892a51af8c8e037c3731. It is the captured Oct11 VPS schema-only public/extensions/auth baseline, no rows or credentials. It is not a current live VPS read or a fresh synthetic Supabase prerequisite fixture.

The original bootstrap bytes match both this branch and PR364 (SHA256 6d08fbb7545b4a76aa740927a6519cd8eda1e90d6003d920b4ec3c08d5f4768a). The native test reuses only the original isolated cluster/bootstrap/schema restoration method: original synthetic postgres cluster principal, remove psql metacommands, relocate bootstrap public/extensions schemas and move pgcrypto back at the original marker. Environment USER is OS-derived agent. No operator role amendment, ownership bridge, new schema stub or additional grant/role beyond original bootstrap was executed. This is not a production least-privilege/peer proof.

## Actual first-apply RED

The real applyReviewedMigrationPlanToClient receives the exact unchanged 49 selected buffers, ordered hash cec630ce83aea1f7bdcafae815990e2e964ebbf599a3441e08d978e4427f46cd. The caller is a real pg8.18 Client on local PG17.11; query tracing forwards all original queries/results and records normalized body hashes to original source paths. No keychain access, production exact attestation or review-literal approval is simulated. The CLI authorization path is not invoked or claimed.

Schema restore succeeded. First apply failed with SQLSTATE42501, `must be owner of function read_legacy_release_checkpoints_v3_19`, in migrations/20260823_release_reconciliation_v3_19.sql. That SQL switches to legacy_correctness_rpc_owner before CREATE OR REPLACE of the captured postgres-owned function. All before/after public function definitions/owners/config/ACL, public table owner/ACL/RLS, roles, memberships and public schema ACL JSON are byte-identical: 1,436,239 bytes, SHA256 4dacab49c50d4d92bb4c91f704fff0b769b7db306d0394e8c5c202d51949ae59. The unchanged apply helper rolled back and closed its writer. All temporary processes and cluster data were stopped/removed. No financial tail execution, commit or nonempty financial seed occurred.

Raw TAP is 0PASS/2FAIL/0SKIP: the first-apply child fails and its enclosing case reports dependent_stages_blocked_by_first_apply. These are one underlying owner failure, not two independent product defects. It is retained, not made into an expected-success test. A subsequent separate restore-only owner diagnostic is 1PASS, not an installer rerun or acceptance. Initial first-apply test was uncommitted WIP before the diagnostic-only/closed-artifact additions; installer/SQL runtime inputs are exact0dd throughout. No claim that later test source was the initial command's byte identity.

## Read-only need diagnosis

All five existing ownership-bridge target functions are actually postgres-owned in this restored captured schema. Their actual body hashes occur in the existing bridge profiles; complete attributes (language, result, argnames, security, config, raw ACL) and target-role attributes are saved for review. The first failing checkpoint reader has exact body813934a6a5130d3aaf20ea9b39748427220b156b1a864c105d61f435cd21ed24. Both target owner roles are NOLOGIN, nonsuperuser, no replication/CREATE ROLE/CREATE DB/BYPASSRLS, no public CREATE. The bootstrap compatibility stockinsider_runtime_v319 remains NOLOGIN, so no current production peer/login contract is claimed.

migrations/20261005_release_function_ownership_bridge_v1.sql is saved as a read-only reference from exactPR364 and was not applied. It transfers five pinned legacy functions; it is not a direct financial-tail prerequisite. The missing dependency is the older selected base replay on the captured owner layout. This first error does not prove there are no further prerequisites after correcting owners.

## Proposed next bounded slice, requiring approval/review

Define a financial-only existing-schema profile with the reviewed exact five-function ownership prelude and before-state catalog binding, checked under the same shared lock before mutation. Preserve default48 and original49 bytes/list/hash; separately bind prelude bytes and combined ordered selection/profile hash through actual attestation. Apply prelude+49+postconditions in one shared transaction; no free flag, broad grants, role amendment or 76-file bundle. Current helper's 49-length guard means this is a separate minimal profile/caller change, not a silently inserted prelude.

Then test first/twice, nonempty real-RPC seed and full rows/catalog beforeafter, forced failure after genuine predecessor replacement, partial residue/changed config, disconnect and competing install lock on this real captured baseline. All are currently pending/blocked by firstapply. The new test implements first/replay attempts plus restore-only diagnostic; later negative stages are explicitly not implemented or executed here. Original3 native financial and37catalog cases are not substituted for these. Normal protected checks, actual operator/runtime transport, capacity and deployment remain separate. No production repair or343 usability is claimed.
