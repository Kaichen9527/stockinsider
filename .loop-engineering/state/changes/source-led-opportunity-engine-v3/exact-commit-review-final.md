# V3.16.12 exact-commit reviewed-apply closure review

Date: 2026-08-16
Reviewer: Sol exact-range deployment-path, SQL and privilege review
Final verdict: `PASS`
Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Reviewed base: `01de33bdf55bdd47890a519d92dbf96d20d90d82`
- Final reviewed repair/tree: `ab68233cc1dc1575560a74e3647f38b6a52915f8` / `c352a560ba919c826f3d90fd6bd25fa919f4600b`
- Full final range: `01de33bdf55bdd47890a519d92dbf96d20d90d82..ab68233cc1dc1575560a74e3647f38b6a52915f8`
- Active graph: `71abf84b4ae6b4703fd0559807fba15553c1f5a68c56e19039aae44173727b9d`

## Finding and closure

The V3.16.12 migration was present in the canonical migration plan but absent from
the separate closed allowlist used by the production reviewed-apply CLI. A release
could therefore pass code review while the authorized production operator applied
only the preceding eleven migrations.

This repair adds the exact V3.16.12 migration to the reviewed-apply allowlist and
adds an executable postcondition proving that the private predecessor helper exists,
the legacy scheduler cannot execute it, and the legacy scheduler can execute only
the compatibility wrapper. The regression binds both the migration path and that
privilege postcondition. No ad-hoc SQL or operator bypass is used.

## Verification evidence

- Complete fresh-database migration chain and apply-twice boundary: 55/55 PASS.
- V3.13 decision/integration suite: 14/14 PASS.
- Product correctness: 108/108 PASS; output SHA-256
  `cbd128c40253d0791905d4e120123caa7903e3c4fc2faf8c337c872406f345df`.
- `git diff --check` PASS.
- Exact full-range review: `P0=0 P1=0 P2=0`.

The range does not reset credentials, grant schema CREATE or table access, enable
LINE/dispatch, automatic trading, or V3 Promotion. Evaluation governance remains
`blocked/non_fabricated_elapsed_cohorts_unavailable`.
