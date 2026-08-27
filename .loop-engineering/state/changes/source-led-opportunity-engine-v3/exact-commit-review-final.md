# V3.19.10 exact-commit review — retained candidate authority restoration

Date: 2026-08-28

Review authority: independent exact-range review of the immutable V3.19.10
candidate-retention repair, rerooted without content change onto the protected
PR #128 merge tree. The review did not mutate the production database,
runtime, Vercel projects, source providers, LINE, dispatch, auto-trading or
Promotion.

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Protected base: `fbc3f8ea8a5ce81ebabe891cfb4ec63dc52c3466`
- Initial implementation/tree: `fe2f3e5d70a9f2b2e681637662bd13dd3e271e67` / `57be211fd110e084547757b552b2f22a794661c8`
- Final reviewed repair/tree: `5523347605e1c040e0e08ec8409734c0fe975d1b` / `b5866ad1b001efefef749ff6a65a6b42b0495ca8`
- Repair range: `fe2f3e5d70a9f2b2e681637662bd13dd3e271e67..5523347605e1c040e0e08ec8409734c0fe975d1b`
- Full final range: `fbc3f8ea8a5ce81ebabe891cfb4ec63dc52c3466..5523347605e1c040e0e08ec8409734c0fe975d1b`
- Active graph: `4baf35c1a17cc7c7cd451e71b29e34e9b83c90ee03ca18822fcf4f7f47b19a7b`

## Root cause and diff review

The V3.19.9 producer correctly reached `candidate_funnel`, then failed closed
because a retained historical candidate carried only stock identity and a
material hash. The immutable discovery ledger for the exact preceding
successful run contained the missing source, research and seed authority, but
the public claim wrapper did not rebind those fields before persistence.

V3.19.10 enriches only from the exact prior successful run and requires one
and only one matching discovery-ledger row per retained stock. Missing,
duplicate or conflicting authority raises a typed terminal failure. Existing
nonempty candidate fields must equal the ledger; citations and all other full
candidate fields remain unchanged. The wrapper remains `SECURITY DEFINER` with
an empty search path, its base stays private, schema CREATE is revoked, the
canonical payload is rehashed, and the existing 3 MiB bound remains enforced.

The initial exact review found one P1 in the operator postcondition: it checked
the V3.18 retention contract on the V3.19.7 wrapper base. Repair commit
`5523347605e1c040e0e08ec8409734c0fe975d1b` points that check to the real
V3.18 base and adds a regression. Repair-range and full-range closure found no
remaining P0, P1 or P2 issue. The reroot preserved both implementation trees
byte-for-byte and made the subject descend from the protected merge base.
`git diff --check` passes for both ranges.

## Executable evidence

- Final exact product correctness: `140/140` PASS; zero failed, cancelled,
  skipped or todo. Result SHA-256:
  `2f793f2b6275377cbea69801cdcc21b723c97d602eb4cbbe8a1c4e3fd0f0e8fd`.
- Final migration contract: `69/69` PASS; migration applies twice and verifies
  the private base, current wrapper, grants and schema-owner boundary.
- Migration plan: 28 additive-only files; V3.19.10 is last; ordered-chain
  SHA-256 `feb962262f090b0ca2aa954733dfb9e058e4c2aee76e27189f375fb5878607a1`.
- Exact-range SQL/data safety, privilege, cardinality, determinism and
  completeness review: PASS.
- Repair-range and full-range `git diff --check`: PASS.

The final exact range authorizes the protected Code Gate and, only after that
gate passes, the reviewed production migration, runtime and Web release from
this same source tree.
