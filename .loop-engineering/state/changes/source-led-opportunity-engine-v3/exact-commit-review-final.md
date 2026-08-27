# V3.19.2 exact-commit review — compact projection dossier contract

Date: 2026-08-27

Review authority: independent, read-only exact-range review of the immutable
V3.19.2 projection persistence repair. No runtime, database, Vercel or source
mutation was performed by this review.

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Protected base: `6ba02b71190914e87ed8fa597fa30e591e47b4d2`
- Final reviewed repair/tree: `6dfbae6ce91f11935fcc93b1cf4b43cb6c92fbff` / `73a75149414711ebad01bc7242acb7d96a6c2aa7`
- Full final range: `6ba02b71190914e87ed8fa597fa30e591e47b4d2..6dfbae6ce91f11935fcc93b1cf4b43cb6c92fbff`
- Active graph: `4baf35c1a17cc7c7cd451e71b29e34e9b83c90ee03ca18822fcf4f7f47b19a7b`

## Diff review

The V3.18 projection contract deliberately removes the detail-only
`researchDossier` from compact Landing cards, while the immutable decision
revision retains it for the detail route. The production completion guard
still compared those two differently scoped JSON values byte-for-byte, so a
valid run failed closed as `decision_revision_projection_mismatch`.

The repair rewrites only the closed comparison expression in
`complete_legacy_producer_job_authoritative_v3_19`: the submitted full revision
is projected to its public shared material by removing `researchDossier` before
comparison. The persisted immutable revision is not altered, so detail pages
retain the dossier and resolve it by the same `decisionRevisionId`.

The migration acquires temporary CREATE only for the existing function owner,
is apply-twice idempotent, rejects every unexpected predecessor shape, restores
the executor role and revokes CREATE before commit. It creates no public RPC,
does not weaken SECURITY DEFINER ownership, and does not change valuation,
recommendation, source selection or action thresholds.

The reviewed migration plan, apply postcondition and both closed migration
registries include V3.19.2. LINE, dispatch, auto-trading and Promotion remain
disabled. Evaluation governance remains
`blocked/non_fabricated_elapsed_cohorts_unavailable`.

## Executable evidence

- Full product correctness: `136/136` PASS; zero failed, cancelled, skipped or
  todo. Result-summary SHA-256:
  `130f07141ef93f84f3959119c749d25447873734e2a4e6e3ed158c8732dd6f6e`.
- Reviewed migration apply-twice suite: `65/65` PASS, including a full decision
  revision with a detail dossier and a compact Landing card without it.
- Focused V3.19 reconciliation suite: `6/6` PASS.
- `git diff --check`: PASS.

The exact range has no P0, P1 or P2 finding. It authorizes the protected Code
Gate and, only after that gate passes, the reviewed production migration and
runtime activation sequence.
