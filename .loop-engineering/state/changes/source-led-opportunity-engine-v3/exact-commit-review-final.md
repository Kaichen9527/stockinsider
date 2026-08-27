# V3.19.3 exact-commit review — bound dossier decision identity

Date: 2026-08-28

Review authority: independent, read-only exact-range review of the immutable
V3.19.3 decision identity repair. No runtime, database, Vercel or source
mutation was performed by this review.

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Protected base: `e26793a0d2a9c1dc0c1ca345592178d14819b76f`
- Final reviewed repair/tree: `eda018648d050f20176e96095c31cf741d72f4bc` / `c6cc2ea78e1cb10571f27874fd3a19f358262965`
- Full final range: `e26793a0d2a9c1dc0c1ca345592178d14819b76f..eda018648d050f20176e96095c31cf741d72f4bc`
- Active graph: `4baf35c1a17cc7c7cd451e71b29e34e9b83c90ee03ca18822fcf4f7f47b19a7b`

## Diff review

The worker computes a decision revision identity before binding the cyclic
`decisionRevisionId` and `dossierId` fields into the final research dossier.
The JavaScript identity bundle deliberately removes those two derived fields.
The PostgreSQL completion function retained them while reconstructing the same
identity, so an otherwise valid immutable decision failed closed as
`decision_revision_identity_conflict`.

The repair rewrites only the closed identity reconstruction expression in
`complete_legacy_producer_job_authoritative_v3_19`: when `researchDossier` is
an object, PostgreSQL removes `dossierId` and `decisionRevisionId` before
hashing it. The persisted dossier remains complete, card/detail revision
binding is unchanged, and no valuation, ranking, recommendation, source
selection or action threshold changes.

The migration acquires temporary CREATE only for the existing function owner,
rejects every unexpected predecessor shape, restores the executor role and
revokes CREATE before commit. It creates no public RPC, preserves SECURITY
DEFINER ownership, applies twice idempotently and has an explicit
production-shaped regression for the bound dossier identity.

The reviewed migration plan, apply postcondition and both closed migration
registries include V3.19.3. LINE, dispatch, auto-trading and Promotion remain
disabled. Evaluation governance remains
`blocked/non_fabricated_elapsed_cohorts_unavailable`.

## Executable evidence

- Full product correctness: `137/137` PASS; zero failed, cancelled, skipped or
  todo. Result-summary SHA-256:
  `6da0a2b48db84356aa3d8c80966784abf2a254389b347a54fe88ceefaf827095`.
- Reviewed migration apply-twice suite: `66/66` PASS. The new fixture first
  reproduced the production P0001 identity conflict, then passed with the
  exact repair.
- Focused V3.19 reconciliation suite: `7/7` PASS.
- V3.16.21 release recovery suite: `10/10` PASS.
- Typecheck, lint, production build and `git diff --check`: PASS.

The exact range has no P0, P1 or P2 finding. It authorizes the protected Code
Gate and, only after that gate passes, the reviewed production migration and
runtime activation sequence.
