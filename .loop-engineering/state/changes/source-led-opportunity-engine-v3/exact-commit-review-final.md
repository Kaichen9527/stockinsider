# Exact implementation review — current SOHO rollback retention set

Date: 2026-09-13

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `6a4330b09b745bb0f248b73931685b602e090089` / `2ae776f28355388a978169d1653cf03debacee5c`
- Full final range: `9bbfd190c48796544e232f45421f2f879fab8e92..6a4330b09b745bb0f248b73931685b602e090089`
- Active graph: `c563d77e416fdc2284b7aba50ca2eb03fd5f4cbed44f4edb1c918c63db96e3a2`

## Scope reviewed

- The policy records the 13 exact image identities currently serving SOHO production, staging, and canary after the latest rollout.
- Exactly one prior generation per environment remains protected as the ten-ref rollback set.
- Only the preceding ten unreferenced rollback tags become archive candidates; the read-only remote helper binds every tag to its full image identity.
- Documentation and contract cardinalities now match the reviewed ten-image archive set.

## Security and correctness reasoning

- The archive candidate set is disjoint from every current and retained rollback identity, and full image digests are checked both before and after export.
- The exporter can inspect and save only the fixed production host and reviewed refs; it has no remove, retag, prune, volume, container, or database operation.
- Production deletion remains a separate operation that requires encrypted export, isolated Docker restore verification, a fresh no-container/no-build reference check, and exact non-force tag removal.
- The active product graph is unchanged, so the closed 31-case PCR result remains graph-identical; the full product-correctness suite was rerun on this subject and passed.

## Verification

- `node --test scripts/soho-docker-image-backup.test.mjs` — 3 passed, 0 failed.
- `npm run test:source-led-opportunity-v3:product-correctness` — 154 passed, 0 failed.
- `node -e "import('./scripts/soho-image-policy.mjs')..."` — 10 candidates, 23 protected refs, valid policy SHA.
- `git diff --check 9bbfd190c48796544e232f45421f2f879fab8e92..6a4330b09b745bb0f248b73931685b602e090089` — passed.

The reviewed commit only refreshes the immutable cleanup authority after an independently completed SOHO deployment. It does not mutate production or weaken any capacity, backup, restore, or protected-branch gate.
