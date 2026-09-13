# Exact implementation review — preserve SQL-effective financial rejections

Date: 2026-09-13

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `e073aad9db3e7fe983e313a646c00c040a4bf713` / `c30757bc0aab12a883b94b547ad8e2f02dec8924`
- Full final range: `0d869f4d234cda931cd4fc18fe3145d0cc5eaf4e..e073aad9db3e7fe983e313a646c00c040a4bf713`
- Active graph: `c563d77e416fdc2284b7aba50ca2eb03fd5f4cbed44f4edb1c918c63db96e3a2`

## Review result

- Reviewed both changed files against protected `main` and the first production drain from the preceding release. The local validator can be intentionally more permissive than the SQL authority boundary because the database sees persisted conflicts that a peer-filtered application batch excludes.
- A principal-bound V2 receipt whose effective SQL result is `rejected` now remains terminal only when its immutable input hash is identical. Re-running the drain no longer appends duplicate rejection receipts or reports a false new failure.
- The input hash binds fact content, period peers, provenance, validator version and accounting-policy versions. Any changed financial evidence, new peer conflict, changed source proof or policy revision changes the hash and forces the fact through the authority RPC again.
- Validated facts retain their stricter existing checks: the stored fact must remain fully validated and the trusted accepted hash must match. The patch does not promote a rejected fact, alter a financial value, relax provenance, or turn predecessor data into authority.
- The regression test recreates the production boundary: local validation says valid while the trusted SQL-effective state is rejected for the same hash. It proves the worker reports `unchangedRejected`, performs no RPC write and returns success. Existing changed-evidence and database-failure tests remain intact.
- Twenty focused financial validation tests passed. TypeScript, ESLint with zero errors, the production Next.js build, and `git diff --check` passed for the immutable subject.
- No schema, source ranking, valuation formula, classification threshold, token, migration, UI or Threads behavior changed. No unresolved P0, P1, or P2 finding remains.

## Production boundary

This review authorizes deployment only after all protected checks pass and the PR is merged normally. Production must still fail on a changed rejection, a current provenance gap, a provider acquisition error or any database/authentication error. Ruleset `20177392` remains enabled.
