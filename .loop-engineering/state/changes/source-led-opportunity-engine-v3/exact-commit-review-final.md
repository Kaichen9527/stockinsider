# V3.19.4 exact-commit review — successor-aware reviewed migration replay

Date: 2026-08-28

Review authority: independent, read-only exact-range review of the immutable
V3.19.4 migration-release repair. No runtime, database, Vercel or source
mutation was performed by this review.

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Protected base: `461b09e5b6a41dfcd934a2b4ec2f9571ec0953b8`
- Final reviewed repair/tree: `afe7acdba33896397d61e92f9dcb6cfbbe219429` / `9537aed5b97e1297b039adf71355dc062b13e288`
- Full final range: `461b09e5b6a41dfcd934a2b4ec2f9571ec0953b8..afe7acdba33896397d61e92f9dcb6cfbbe219429`
- Active graph: `4baf35c1a17cc7c7cd451e71b29e34e9b83c90ee03ca18822fcf4f7f47b19a7b`

## Diff review

Production already contains the stronger V3.19.3 decision-identity contract.
The reviewed full-chain CLI nevertheless replayed V3.19.2 and then inspected
the V3.19.3 guard on a compatibility wrapper rather than on the authoritative
completion function. This made the exact production migration postcondition
fail even though the installed successor shape was correct.

The repair recognizes only the closed V3.19.2 migration as superseded, and
only when the pre-replay authoritative function contains all three independent
V3.19.3 markers: the dossier object guard, cyclic identity-field removal and
the decision identity conflict guard. Detection is frozen immediately after
the advisory lock and before any older migration can temporarily replace the
function body. No unrelated migration may be skipped.

The release-reconciliation postcondition now inspects
`complete_legacy_producer_job_authoritative_v3_19`, the function that owns the
same-run successor guard. The result records every skipped predecessor in
`supersededMigrations`; fresh databases still apply V3.19.2 before V3.19.3.

No valuation, ranking, recommendation, source selection, action threshold,
public API, database credential or runtime mode changes. LINE, dispatch,
auto-trading and Promotion remain disabled. Evaluation governance remains
`blocked/non_fabricated_elapsed_cohorts_unavailable`.

## Executable evidence

- Full product correctness: `138/138` PASS; zero failed, cancelled, skipped or
  todo. Result-summary SHA-256:
  `62422196e0351f8fc0bf193693b321fc94909731e5efe1ede5b807a497124e65`.
- Reviewed migration apply-twice suite: `66/66` PASS.
- Focused V3.19 reconciliation suite: `8/8` PASS.
- Typecheck, lint, production build and `git diff --check`: PASS.

The final exact range has no P0, P1 or P2 finding. An initial pre-commit review
found that successor detection occurred too late in replay; the implementation
was repaired before the immutable subject was created, and the regression now
requires pre-replay freezing. This evidence authorizes the protected Code Gate
and, only after that gate passes, the exact reviewed production migration and
runtime activation sequence.
