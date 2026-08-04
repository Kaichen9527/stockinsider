# Requirements Round 61 Repair

Round 61 reviewed immutable tree `00c32c656f549555bd3c2bbf90c797fb8bcfbd90` and returned `CHANGES_REQUIRED` with `P0=0 P1=1 P2=0`.

The local repair updates the active evaluation-governance verifier to read `opportunity_manifests_v3.manifest_hash` instead of the removed parent `root_hash` column for all three manifest hash attestations:

- `evaluation_input_manifest_hash`
- `link_audit_sample_manifest_hash`
- `link_audit_resolution_manifest_hash`

Local evidence:

- `node --check scripts/opportunity-v3/evaluation-governance-gate.mjs` → PASS
- `rg -n "root_hash" scripts/opportunity-v3/evaluation-governance-gate.mjs scripts/opportunity-v3 migrations/20260724_source_led_opportunity_engine_v3.sql .loop-engineering/state/changes/source-led-opportunity-engine-v3` → no active code/test references; only Round 60 evidence text remains.

Fresh Requirements Round 62 remains mandatory over the newly sealed immutable tree. Architecture remains locked until Requirements passes.
