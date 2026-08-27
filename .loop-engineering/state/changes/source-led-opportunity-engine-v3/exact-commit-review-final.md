# V3.19.11 exact-commit review — complete retained candidate restoration

Date: 2026-08-28

Review authority: independent exact-range review of the immutable V3.19.11
candidate-retention successor. The review did not mutate the production
database, runtime, Vercel projects, source providers, LINE, dispatch,
auto-trading or Promotion.

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Protected base: `c2ec07fa02b19136e8e8cad749af5ec76e178953`
- Initial implementation/tree: `924dff5536c28374959f756fb1354bfb1d08a163` / `7e5652d604c726791d9f8b8d4bfd98d08b9d029f`
- Final reviewed repair/tree: `924dff5536c28374959f756fb1354bfb1d08a163` / `7e5652d604c726791d9f8b8d4bfd98d08b9d029f`
- Repair range: `924dff5536c28374959f756fb1354bfb1d08a163..924dff5536c28374959f756fb1354bfb1d08a163`
- Full final range: `c2ec07fa02b19136e8e8cad749af5ec76e178953..924dff5536c28374959f756fb1354bfb1d08a163`
- Active graph: `4baf35c1a17cc7c7cd451e71b29e34e9b83c90ee03ca18822fcf4f7f47b19a7b`

## Root cause and diff review

V3.19.7 replaced the public claim wrapper to rebind reused provider
acquisitions to the current run. That replacement bypassed the V3.18 wrapper
which loaded the complete terminal candidate objects from the exact preceding
successful run. V3.19.10 correctly recovered immutable discovery authority,
but it could only enrich the partial objects handed to it and therefore could
not restore citations, evidence summaries and research-only detail.

V3.19.11 selects exactly one successful candidate-funnel result from the
exact preceding successful run, retains its complete bounded candidate array,
and enriches only the authority fields from exactly one discovery-ledger row
for the same run and stock. Missing, duplicate or conflicting authority fails
closed. It preserves all non-authority candidate fields, restores the current
run's source-availability calculation, rehashes the canonical claim payload,
and retains the 3 MiB boundary.

The new helper and every renamed base remain `SECURITY DEFINER` with an empty
search path and are private from `service_role`; only the current wrapper is
executable. Schema CREATE is revoked after installation. The reviewed apply
postconditions inspect the actual current wrapper and private helper instead
of an obsolete wrapper layer. No destructive SQL, public mutation surface,
secret handling change or production action activation is introduced.

Exact SQL/data-safety, privilege, cardinality, ordering, completeness and
retry-determinism review found no P0, P1 or P2 issue. No repair commit was
required. `git diff --check` passes for the full range.

## Executable evidence

- Final exact product correctness: `140/140` PASS; zero failed, cancelled,
  skipped or todo. Result SHA-256:
  `276a260b85b491631657359badd73161b8dd4da061795c3ac8145498b6c052de`.
- Final migration contract: `70/70` PASS; the additive chain applies twice and
  verifies the full-result source, exact-run authority, private helper,
  current wrapper, grants and schema-owner boundary.
- Migration plan: V3.19.11 is the final additive migration.
- Exact-range SQL/data safety, privilege, cardinality, determinism and
  completeness review: PASS.
- Full-range `git diff --check`: PASS.

The exact range authorizes the protected Code Gate and, only after that gate
passes, the reviewed production migration, runtime and Web release from this
same source tree.
