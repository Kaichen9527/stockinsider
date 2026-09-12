# Exact implementation review — restore financial validation contract

Date: 2026-09-13

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `63694e1084682db76391325fb75ec40a7ff8e27c` / `74929c9069cea0effca013dca309faa3f681cb80`
- Full final range: `55a225e380a2b34409502bd02aef3f139f0f83c3..63694e1084682db76391325fb75ec40a7ff8e27c`
- Active graph: `c563d77e416fdc2284b7aba50ca2eb03fd5f4cbed44f4edb1c918c63db96e3a2`

## Review result

- Reviewed all five changed files against protected `main`. The production failure is reproducible: `record_official_financial_validation` casts to `public.financial_validation_status_v3`, but the restored `validation_status` column is checked `text` and no enum/domain with that name exists.
- The additive hotfix is fail-closed. It first verifies the exact table/column contract, requires exactly one legacy cast in the immutable function definition, replaces only that token with `::text`, and re-verifies the resulting definition inside one transaction. It neither invents a compatibility type nor relaxes the existing status check.
- The owner repair restores the reviewed security boundary for the internal principal helper and financial facts table. The helper remains inaccessible to `PUBLIC`, `anon`, `authenticated`, and `service_role`; service-role callers continue through reviewed security-definer RPCs.
- The staged restore now replays archive owners after bootstrapping all compatibility principals. It then applies the complete reviewed financial, Taiwan refresh, history, status-hotfix, and Contabo data-plane migration chain before verification. This prevents a fresh restore from recreating the ownership and missing-procedure drift observed during the canary.
- Restore verification now fails if the refresh/financial parser procedures are absent, either critical owner is wrong, or the validation writer still references the nonexistent type.
- The two PostgreSQL integration suites and two deployment contract suites passed (`9/9`). ESLint, TypeScript through the production build, the production Next.js build, and `git diff --check` passed for the immutable subject.
- No destructive schema or data operation is introduced. No provider token, source-ranking rule, valuation threshold, publication rule, or Threads activation state changes. No unresolved P0, P1, or P2 finding remains.

## Production boundary

This review authorizes the additive migration and immutable Contabo release only after all protected checks pass and the PR is merged normally. Apply the migration transactionally, reload PostgREST schema, rerun the financial queue canary, and preserve fail-closed behavior if any later document or fact validation fails. Ruleset `20177392` remains enabled.
