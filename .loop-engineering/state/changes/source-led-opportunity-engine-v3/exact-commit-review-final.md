# V3.20 exact-commit closure review — acceptance registry repair

Date: 2026-08-29

Review authority: exact-range closure review after the protected product/runtime
gate rejected an inconsistent V3.20 suite registry. No production database,
runtime, Vercel project, provider, LINE, dispatch, auto-trading or Promotion
setting was mutated.

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Protected base: `6aaa017618f15a0082efb2cafe8c08b32947be1c`
- Final reviewed repair/tree: `4ed704106bd3cc2715da27c865a88b114609831d` / `ef308be684cc3c62d281995332d2fc91d1d91402`
- Full final range: `6aaa017618f15a0082efb2cafe8c08b32947be1c..4ed704106bd3cc2715da27c865a88b114609831d`
- Active graph: `5f985e391799fd8332df16c2151f75cc95dfb643a087912d92df2845a435016e`

## Closure conclusion

The protected worker ran the V3.20 KOL-first regression suite, but the
immutable `scriptValueRows` registry still declared the prior V3.19 command.
That mismatch was correctly rejected as `GOV-001`; it was a release-contract
defect, not a runtime or nomination-authority defect.

The repair updates the exact registry value and its canonical SHA-256 beside
the package script. The traceability owner continues to require byte-for-byte
equality, so deleting the V3.20 suite, adding an unregistered suite, or
altering the command will now fail. The implementation tree retains the
expired-lease recovery, KOL-only nomination authority, five-connector outcome
matrix, 2605 false-positive rejection, read-only stale cards, and revision-safe
details reviewed in V3.20.

The repair-closure Requirements and Architecture envelopes are carried in the
subject solely for the protected base's fixed evidence locations. They do not
alter any active product artifact. The evidence ancestry bridge preserves the
existing refs without force-pushing or bypassing the active ruleset. Exact-range
review and the focused PCR execution found no remaining P0, P1 or P2 finding;
`git diff --check` passes.

## Executable evidence

- PCR fulfillment: `31/31` PASS on the code-identical final product tree.
- V3.20 registry traceability: PASS after the repaired registry digest.
- Prior V3.20 suite, migration, runtime, legacy, performance, typecheck, lint
  and production-build evidence remains applicable; protected Code Gate must
  still execute its owned product/runtime and model-runner tracks.

Evaluation governance remains `blocked/non_fabricated_elapsed_cohorts_unavailable`.
