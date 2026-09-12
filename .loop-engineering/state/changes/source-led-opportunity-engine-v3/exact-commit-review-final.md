# Exact implementation review — quarantine unproved predecessor financial facts

Date: 2026-09-13

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `9c52d85a059d59cbf6a591da6376206ba779eef9` / `1c87e2ec61054900dcbe29a2928510c04e26675c`
- Full final range: `e6d5dbe2089785ff3f4a1386f716fd567c37868b..9c52d85a059d59cbf6a591da6376206ba779eef9`
- Active graph: `c563d77e416fdc2284b7aba50ca2eb03fd5f4cbed44f4edb1c918c63db96e3a2`

## Review result

- Reviewed both changed files against protected `main`. Production inspection proved that all unproved exchange facts covered by the exception were written by predecessor collectors between 2026-08-14 and 2026-08-27. Their original response bytes and row locators do not exist, so the missing provenance cannot be reconstructed honestly.
- The exception is closed to `twse` or `tpex` predecessor source references and facts whose database-generated `recorded_at` predates 2026-09-01. Those rows remain stored and queryable, never become validated valuation authority, and are reported separately as `legacyUnproved`.
- Any current or future fact without provenance remains `missingProvenance`, keeps the validation result partial, and fails the production queue. Issuer-document rows are not covered by the exception and still require structural document proof.
- A prior principal-bound V2 rejection suppresses only an identical later rejection with the same immutable input hash. New peers, changed provenance, or changed fact content alter that hash and force revalidation. Rejected values remain non-authoritative and auditable.
- The regression tests cover the cutover boundary, source-family boundary, current missing-provenance failure, unchanged trusted rejection, changed validation work, database failures, and the existing structural-proof boundary.
- Thirty-one focused financial validation and coverage tests passed. TypeScript, ESLint with zero errors, the production Next.js build, and `git diff --check` passed for the immutable subject.
- No database row was deleted or promoted, no financial value was changed, and no source ranking, valuation formula, classification threshold, publication policy, token, migration, or Threads state changed. No unresolved P0, P1, or P2 finding remains.

## Production boundary

This review authorizes deployment only after all protected checks pass and the PR is merged normally. The first production drain must report predecessor rows separately while returning success only when every current fact has provenance and every changed validation result is terminal. Ruleset `20177392` remains enabled.
