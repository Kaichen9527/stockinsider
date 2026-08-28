# V3.19.12 exact-commit review — deterministic retained candidate JSONB

Date: 2026-08-28

Review authority: independent exact-range review of the immutable V3.19.12
database compatibility successor. The review did not mutate the production
database, runtime, Vercel projects, source providers, LINE, dispatch,
auto-trading or Promotion.

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Protected base: `1c5b7bfa3020edde1117719976d7ec03f7b43514`
- Initial implementation/tree: `289866f9a62d433be916645a1baad3d4651c4e48` / `c6d83aa847684aa0e689ba36bf8d31e390735a64`
- Final reviewed repair/tree: `289866f9a62d433be916645a1baad3d4651c4e48` / `c6d83aa847684aa0e689ba36bf8d31e390735a64`
- Repair range: `289866f9a62d433be916645a1baad3d4651c4e48..289866f9a62d433be916645a1baad3d4651c4e48`
- Full final range: `1c5b7bfa3020edde1117719976d7ec03f7b43514..289866f9a62d433be916645a1baad3d4651c4e48`
- Active graph: `4baf35c1a17cc7c7cd451e71b29e34e9b83c90ee03ca18822fcf4f7f47b19a7b`

## Root cause and diff review

The V3.19.11 production claim path exposed two independent defects. Replacing
the public claim wrapper had removed the least-privilege runtime role's direct
EXECUTE grant, so the worker first failed with SQLSTATE 42501. After a bounded
operational grant restored that boundary, the retained-candidate lookup failed
with SQLSTATE 42883 because PostgreSQL does not define `max(jsonb)`.

V3.19.12 replaces the invalid aggregate with an ordered, bounded `jsonb_agg`
selection whose first element is the exact latest successful candidate result.
The private helper requires exactly one result and a bounded candidate array,
preserving fail-closed behavior. The additive migration also reconciles the
production runtime role only when its exact non-privileged flags match: it
revokes obsolete wrapper/helper grants and grants only the current public claim
wrapper. The helper remains private and schema CREATE remains revoked.

The production-shaped regression creates the exact runtime role, preloads the
eight existing operational RPC grants plus the current claim wrapper, applies
the V3.19.10–V3.19.12 chain twice, inserts a real successful prior candidate
barrier/result, invokes the helper, and verifies the retained candidate plus
the exact 9/9 direct EXECUTE boundary. No destructive SQL, credential change,
public mutation surface or production action activation is introduced.

Exact SQL/data-safety, privilege, cardinality, ordering, idempotency and
compatibility review found no P0, P1 or P2 issue. No repair commit was required.
`git diff --check` passes for the full range.

## Executable evidence

- Final exact product correctness: `140/140` PASS; zero failed, cancelled,
  skipped or todo. Result SHA-256:
  `82c2b4f9cf7fde6591da0091f5c8bb59cd79038f6a86e261c85ee090c20f28ca`.
- Final migration contract: `72/72` PASS, including double apply and the
  production-shaped runtime-role/cardinality regression.
- Migration plan: V3.19.12 is the final additive migration.
- Exact-range SQL/data safety, privilege, cardinality and determinism review:
  PASS.
- Full-range `git diff --check`: PASS.

The exact range authorizes the protected Code Gate and, only after that gate
passes, the reviewed production migration, runtime and Web release from this
same source tree.
