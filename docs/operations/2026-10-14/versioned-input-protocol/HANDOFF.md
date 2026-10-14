# Bounded candidate delivery — protocol native remains RED

Base: `6bc724971b0875af0688e441a756bc07f1f06b8d`. First sealed implementation/native subject `cf897862`; final tested runtime is identical in `f69e761e` (test-only follow-up). This is maker work, not an independent review, approved source closure, registry activation or production installation. No route is added and no old fresh-v2 route is disabled.

## Implemented candidate

- New `20261014_research_versioned_input_candidate_v3.sql` is **not in the installation plan**. Old26 SQL and original financial48/49/50/profile/operator bytes remain untouched. Exact prerequisite copies are solely for the captured local test.
- Existing preparation/revision ledgers and their original charge formulas, unique preparation key, source→global locks and deadlines are reused. New metadata registry/tombstones are separate from budget ledgers. No rows are registered by this migration.
- New common controller does READ selection before FRESH, selects Hb, validates returned material/protocol, uses real shared-owner8/6 or9/7 session with RPC assertions, and passes a context witness to seal. Old77 response validation was extracted with imports/function name adapted; it performs no FS. An absent old77 request requiring seal explicitly belongs to the retained old realm; this candidate is not wired to replace it.
- Exact old mapping and schema bundles were copied from15d4, not altered; copied fixture namespace dependencies are from dd598. No pending branch merge.
- Candidate RPC ACL delta is explicit in ADR-addendum. No role, membership, login or schema USAGE grant was added. No production DB contacted.

## Actual results and blockers

1. First typecheck RED: TS18046 on a union schema properties access. Corrected to the statically typed fixed v3 schema path; original output preserved.
2. First native test process: 0PASS/1FAIL, no SQL work. A diagnostic direct import exposed `spawnSync pg_config EPERM`. The separately authorized unsandboxed isolated run used the same code; this was an environment change, not a product retry.
3. Actual PG17.11 captured schema restore → original financial50 helper COMMIT → original guarded26 helper COMMIT → candidate migration installed. Empty original ledgers/registry assertion passed. Four calls to new binding resolver all failed `42501 permission denied for schema public`; later synthetic direct job insertion hit `observed_job_requires_scoped_rpc`. Final original native TAP: **1PASS/5FAIL/0skip** (five children plus failed parent). No first seal/replay was reached. These are not six independent full-protocol cases.
4. Root cause evidence: captured schema explicitly grants public USAGE to selected existing roles, not PUBLIC; original preparation migration creates NOINHERIT `research_input_preparation_owner_v2` and grants table/function privileges but no public-schema USAGE. The new SECURITY DEFINER resolver uses that original owner. This is an actual42501 plus source diagnosis; no retained in-transaction pg_catalog result was captured before cluster cleanup, so do not claim a measured effective-privilege matrix. Original source-fence owner also warrants explicit dependency inspection, not an assumed broad grant.
5. No grant/owner/expectation was added to make native green. The final test-only revision stops after the first binding failure and captures owner/schema catalog beforehand for a **future authorized changed-prerequisite run**; it was not rerun here. The initial test's failure to stop after a failed subtest is preserved honestly.
6. Final current suite: **112PASS/0FAIL/0skip** =104 existing cases +8 new finite-binding/controller cases. New response fixtures are synthetic unit contracts with actual full financial material; their no-FS branch is demonstrated using absent roots. They do not prove PG preparation/lease/role admission. The existing84/104 historical runs are not added to this count.
7. Final typecheck and lint passed (lint0errors/33existingwarnings); normal build result and exact BUILD_ID/server manifest are in this delivery's evidence. The prior72f build is not reused as this subject's result.

Native test engineering identities hash the actual four new controller source files and native Node executable/version. They are **partial engineering component identities**, not whole S/C/B/Q/R/A, not a Next executor fingerprint and not77b1. The registry fixtures were local only and never formal registration. The four-file identity must be replaced by an explicitly complete transitive native executor manifest before any future identity-completeness claim.

## Next concrete work (requires Root review, no mutation authorized by this report)

- Decide a narrow additive prerequisite correction after checking exact catalog: public USAGE for the actual existing preparation owner and any genuinely required downstream owner. Preserve NOLOGIN/NOINHERIT/memberships/table ACL and all original SQL bytes; separately bind/review any privilege delta. Do not grant PUBLIC USAGE or reuse a more privileged owner.
- Repair **test setup**, not product guards: use original `store_observed_research_priority_v1`, `enqueue_research_deep_jobs_v1`, `claim_research_observed_job_v2`/reservation path with real admission clock/charges, rather than direct job insert. This test's synthetic roster rows are input fixtures, not a claim that roster admission or1978 accounting ran.
- Then run the actual common controller over both issuers: original sealed77v2 created via real seal; compatible fresh8/6; v3fresh9/7; exact replay/no new FD/charge/clocks. No direct insertion of sealed revisions.
- Both mixed-version same-preparation orders, a real count/byte denial and rollback, wrong symbol/Hb/C/schema noIO/noMutation, post-source/lease changes, full quotas/120s/lock-waits/ABA/response-loss/max30sources are **pending**, not skipped PASS.
- Four production callers (route/author-assignment/packet/result), standalone supplement, downstream version dispatch/cash citations, final static Q/R/capsule activation and full closure remain **unwired**. Those existing pending app modules were deliberately not copied into active routes to manufacture coverage.
- Candidate predecessor guard pins three old body/owner/security/config signatures; complete current ACL/attribute/catalog preflight and full installed profile for the new metadata/RPCs remain pending independent review/native coverage.

No genuine author/reviewer/model work, formal IDs, strategy approval, real peer transport, production capacity/deployment or self-signed review was performed. Owned native cluster and fixture directories were stopped/removed; original raw evidence and preexisting unrelated processes/files remain intact.
