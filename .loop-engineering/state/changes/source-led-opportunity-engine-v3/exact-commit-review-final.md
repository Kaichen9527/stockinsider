# V3.16.12 exact-commit candidate fact-plane bound closure review

Date: 2026-08-16
Reviewer: Sol exact-range SQL, privilege, data-integrity and runtime review
Final verdict: `PASS`
Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Reviewed base: `954b8e42876946656f4a51a86350f8e74d26973a`
- Final reviewed repair/tree: `a7b81cffd4b21e3d6e7082a5477837b42ada398c` / `e072e810f7aa054e92cd166e4a6321b2d35c7b1b`
- Full final range: `954b8e42876946656f4a51a86350f8e74d26973a..a7b81cffd4b21e3d6e7082a5477837b42ada398c`
- Active graph: `71abf84b4ae6b4703fd0559807fba15553c1f5a68c56e19039aae44173727b9d`
- Bounded production amendment: `v3.16.12-candidate-fact-plane-bound-amendment.md`

## Production finding and repair closure

The reviewed V3.16.11 producer completed all immutable source mention shards and
the candidate funnel, then reproduced `bound_violation` when claiming
`facts_refresh`. Transaction-rolled-back production sizing showed that the prior
fact plane materialized session-by-session corporate-action authority for too many
candidates and exceeded the existing 3 MiB claim envelope.

The additive V3.16.12 migration retains the complete, byte-identical 60-candidate
discovery ledger while selecting the first ten `deepSelected` candidates in their
original deterministic order for authority-heavy facts. The final envelope remains
hard-bounded at 3 MiB. Candidates outside that bounded deep set remain visible and
must be classified unavailable; no evidence is compressed and no action gate is
weakened.

The repair commit changed the original `ordinality <= 10` predicate to an ordered
`LIMIT 10` over the deep subset, preventing shallow candidates ahead of deep
candidates from reducing the intended bounded research set. It also closes the
migration-plan expectation regression.

## SQL and privilege review

The migration is additive and apply-twice safe: on first apply it renames the prior
helper once, then creates the public compatibility wrapper; later applies replace
only the wrapper. The internal helper and wrapper remain owned by
`opportunity_v3_rpc_owner`. `legacy_correctness_rpc_owner` receives EXECUTE only on
the wrapper and explicitly receives no EXECUTE on the private helper. No schema
CREATE, table access, secret, destructive DDL, credential reset, LINE/dispatch,
automatic trading, or V3 Promotion authority is introduced.

## Verification evidence

- Complete fresh-database migration chain, apply-twice and privilege boundary:
  55/55 PASS.
- Product correctness: 108/108 PASS; output SHA-256
  `46e4f0fe75b17a6a16db2ace92c30bff00320193564ce1f722618c57e805c13d`.
- `git diff --check` PASS for the full final range.
- Exact full-range review: `P0=0 P1=0 P2=0`.

Evaluation governance remains
`blocked/non_fabricated_elapsed_cohorts_unavailable`; this Code Gate does not claim
proven future returns.
