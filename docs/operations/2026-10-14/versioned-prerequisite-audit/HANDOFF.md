# Versioned protocol prerequisite audit — no permission repair applied

Frozen product source: `36ea8f0c0f7e5c3f9d52499c97882be60acbf538`.
Sealed audit entry: `6db9e79f` (`scripts/opportunity-v3/research-versioned-prerequisite-audit.mjs`).
This is maker forensic evidence, not independent protocol review, formal peer validation, installation approval or live-state evidence.

## Actual single run

Node22.14 / PostgreSQL17.11. Original schema-only gzip SHA `2e9fc2f8a795a13490c12a90a2d9c974e19c1e93f9593d443d834978e0a19c60`, expanded SHA `a82e3b089ee0523a9de3b1a84c0e799d878fa47bb6ec892a51af8c8e037c3731`.
Original bootstrap roles are synthetic local prerequisite roles. Restore → actual financial50 engineering helper COMMIT → actual guarded26 helper COMMIT → unchanged candidate migration → BEGIN REPEATABLE READ READ ONLY → catalog queries / resolver savepoint → ROLLBACK. No business fixture, source mutation, job insertion, reservation, preparation or seal was attempted. No post-setup permission change was executed. The setup necessarily executes the unchanged original migrations' existing grants/operator prerequisite; the audit summary `grantsAttempted:false` means **no new/counterfactual grant**, not that original setup SQL contains no grants.

Audit exit0; not a TAP suite and not protocol PASS. 18 non-`pg_` roles,340 public functions,29 literal-call reachable functions,43 direct permission edges measured/derived. Public is ACL grantee0, not an invented pg_roles principal. All public tables' effective SELECT/INSERT/UPDATE and existing column ACLs were collected separately. No password value was selected; only `rolpassword IS NULL`.

Resolver `research_input_binding_candidate_v3(text,text,text,boolean)` raised42501 `permission denied for schema public`, context `compilation of PL/pgSQL function ... near line 2`, even with empty registry and zero test hashes. It runs SECURITY DEFINER as `research_input_preparation_owner_v2`, config `search_path=pg_catalog, public`, bodySHA `433f0d2da00ea4e73f7a742c31c1705d07685ef1b19c9f65cece5e5205fc95f7`. This independently confirms the prerequisite at the new audit subject, not retroactive catalog evidence for the earlier run.

## Measured privilege separation

| Actual principal | public USAGE / CREATE | Relevant finding |
|---|---|---|
| research_input_preparation_owner_v2 | false / false | owns new registry and preparation ledger; SELECT jobs/reservations/source documents and EXECUTE source assertion already true |
| research_source_fence_owner_v2 | false / false | owns source seals/events; SELECT source_raw_documents true; source seal/assert SECDEF owner |
| research_observed_rpc_owner | true / false | scoped store/enqueue/claim owner; existing explicit roster migration grant |
| service_role, anon, authenticated | true / false | retained original schema grants; no new grants proposed |
| legacy_correctness_rpc_owner, opportunity_v3_rpc_owner | true / false | retained existing schema grants |
| PUBLIC | false / false | no grantee0 entry in public schema ACL |

`research_source_owner_v2`, `research_deep_job_rpc_owner`, `research_model_rpc_owner` **do not exist** in this restored actual profile. Do not create them. Actual reservation function owner is `postgres`; observed claim/deep enqueue owner is `research_observed_rpc_owner`. Full role-name resolution and actual installed body hashes/signatures are in raw JSON.

Preparation and observed owners: NOLOGIN/NOINHERIT, no super/createRole/createDB/replication/BYPASSRLS, limit-1, null config/validuntil/password, no memberships involving either role. Source-fence owner has the same low attributes **except INHERIT=true**, exactly as its original `CREATE ROLE ... NOLOGIN NOSUPERUSER NOBYPASSRLS` defaults; memberships are empty. Preserve this value, do not silently impose NOINHERIT. Legacy/opportunity role memberships involving postgres exist from original fixture bootstrap and are recorded; this is not a blanket empty-membership claim for all roles.

`has_function_privilege(...,'EXECUTE')` and `has_table_privilege(...,'SELECT')` do not imply schema lookup works, nor do table privileges bypass RLS. All43 direct literal call edges have the required EXECUTE under their SECDEF caller owner; INVOKER entries explicitly need upstream execution-context interpretation. No additional known public function name was found as an unqualified call in these29 bodies. pg_depend alone does not capture PL/pgSQL body dependencies; dynamic SQL, triggers/defaults/policies and wider downstream closure remain separate verification work. Source-fence write/record trigger definitions are preserved in exact source excerpts; this audit does not claim to have executed those writes.

## Original source comparison and context

All26 selected SQL files match descriptor bytes/SHA and exact `2e078dfdd74272d3d50dffdd4cc6c14df3152c78`, including the original complete-input/preparation/assert/source-fence SQL. The only `GRANT USAGE ON SCHEMA` in the26 is `20261008_research_observed_roster_v1.sql:55`, public/extensions to observed owner.

The captured public schema is owned by `pg_database_owner`, with explicit grants to selected existing principals and no PUBLIC USAGE. `20261009_research_input_preparations_v2.sql` grants table/function rights but no public USAGE; `20261009_research_publication_source_fence_v2.sql:5–8,32` likewise creates the owner and grants source SELECT, not schema USAGE. Original partial complete-input tests use initdb's default public namespace plus shadow prerequisite tables, unlike this private captured schema. Their passing outcome does not prove this profile's lookup permission.

Read-only git search of pending2e migrations/scripts/deployment found an explicit test-only grant in `scripts/research-publication-lineage-postgres.test.mjs:38` to preparation/observed owners. It is not a production prelude and does not cover source-fence owner. No corresponding selected production grant was found. No76 bundle, extra prelude or role amendment was copied/applied.

## Small finite prerequisite proposal — TEXT ONLY, not executable delivery

Subject to later Root approval and an exact reviewed candidate prerequisite, the smallest measured lookup delta is:

```sql
-- PROPOSAL ONLY: NOT EXECUTED, NOT IN ANY INSTALLER PLAN
GRANT USAGE ON SCHEMA public TO
  research_input_preparation_owner_v2,
  research_source_fence_owner_v2;
```

This proposes neither CREATE nor extensions USAGE, table/function grants, PUBLIC/service/anon/auth grants, GRANT OPTION, new roles/memberships, LOGIN, owner change, or a more privileged executor. Before USAGE=false; after expected USAGE=true for these two only, CREATE=false unchanged. Existing function/table privilege descriptors, role attributes (including source INHERIT=true), memberships, owner/body/config/RLS/column ACLs remain exact. Name resolution becomes possible; this alone does not prove full protocol authorization or absence of later prerequisites.

A future implementation must bind the exact predecessor role/schema/function/table descriptors and actual grantor to a reviewed profile. Under the existing shared installer lock and one transaction, reject absent/unknown owner, unexpected ACL/grantor/grantability/membership/config/attributes before mutation; accept only the exact old ACL or exact intended two-entry successor for idempotence; preserve all other ACL entries. Recheck full descriptors before COMMIT; any failure/disconnect ROLLBACK. Grantor must be deliberately fixed and recorded (public owner currently pg_database_owner), not guessed from a superuser session. Full installed catalog expectations must be a separate reviewed candidate; do not normalize away this delta to pass original sealed catalog. Native before/after/idempotence/rollback tests require later authorization; none ran here.

## Legal business fixture route — not executed / no test change

The original1PASS5FAIL run wrongly inserted an observed deep job directly as postgres. `20261008_research_observed_priority_v1.sql:63–93` requires the scoped owner and an admission-clock row for this insert; `observed_job_requires_scoped_rpc` is correct rejection. Avoid changing that trigger, setting bypass flags or directly inserting attempts/reservations/sealed rows.

Minimal fixture sequence, using real original functions and real local synthetic input material:

1. Establish a valid observed roster using `admit_research_observed_roster_v1(text,text)` (`20261008_research_observed_roster_v1.sql:78`); use the exact retained classifier/packet contract and complete accounting. Existing pending `research-observed-priority-native.test.mjs` and `research-local-inbox-dataplane.mjs` show the real1978 fixture route; they were read, not executed/copied wholesale. This is not permission to crawl or fabricate formal roster authority.
2. Supply legal retained source rows through the original scoped source path, with actual hashes/clocks/rights and head identity. Source mutation invokes the fence owner, so its missing schema USAGE can block before priority admission. No direct synthetic job/receipt insertion substitutes for this.
3. Call `read_research_observed_roster_v1(text,timestamptz,integer,integer)` and derive `scope_receipt = returned_json - 'members'`. At valid asOf, call `store_observed_research_priority_v1(text,timestamptz,text,jsonb,jsonb,jsonb,jsonb)` (priority SQL:180). Rows must exactly account for included members; queue<=20 must be contained in rows; rootIds/count, actual eligible DB heads, firstSeenAt/hasDiscoveryEvidence must match. No fake nonempty queue.
4. Store RPC calls `enqueue_research_deep_jobs_v1(uuid)` (priority SQL:149,229) itself under lock2409/6001. It writes the genuine admission clock/receipt/weekly charge and scoped job (weekly<=5). A separate duplicate enqueue is unnecessary and must retain original idempotence.
5. `claim_research_observed_job_v2(text,text)` (claim SQL:34) locks2409/6002, checks running work, chooses the queued job, calls `reserve_research_model_v1(text,text,text)` for `company_research` / `deep:<job>:<attempt+1>`, then writes matching attempt/job lease and returns `read_research_observed_claim_v2(text,text,uuid,integer)`. Do not separately INSERT reservation/attempt. Reservation retains global1/daily7200/1800seconds/day-fit gates; null admission is not success.
6. Use returned job/attempt/reservation/owner/snapshot in original neutral preparation and candidate controller. First seal remains unproven.

Exact installed function signature/bodySHA/source definitions are in `function-source-map.json`; definitions may have later replacements, so source line alone is not asserted as installed body identity. No fixture test edit was made: a new business run is deliberately blocked by the measured prerequisite. Roster/source fixture construction and scoped RPC execution remain pending after permission proposal review.

## Historical attribution and remaining work

Original native subject `cf897862` produced1PASS5FAIL: four resolver errors followed by invalid direct-job fixture. Final test-only `f69e761e` added stop-on-first-error/catalog preflight but **was never rerun**; final36 adds handoff. This audit has its own6db source, empty-registry diagnostic and read-only catalog results. It does not overwrite/relabel the original RED or imply final36's business test preflight ran.

Not run: oldsealed-v2 read/replay, fresh compatibility firstseal, v3actualFS firstseal, mixed-version conflicts, quota/bytes/freshness/ABA/response-loss/lockwait, fourcaller integration, complete predecessor/candidate ACL profile, whole S/C/B/Q/R/A, formal peer/production capacity/approval. No production/VPS/network credentials/HTTP/model work. No existing build/native suite was repeated. Node syntax check passed; runtime/test SQL bytes untouched, so prior build is historical only and no new application build claimed.
