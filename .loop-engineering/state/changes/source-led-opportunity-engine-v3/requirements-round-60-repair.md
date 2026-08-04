# Requirements Round 60 Repair

Round 60 reviewed immutable tree `61f8370492a6e09712bd3597770217bbbbb661ca` and returned `CHANGES_REQUIRED` with `P0=3 P1=0 P2=0`. The local repair closes the three Round 60 blockers before sealing a new immutable tree for Round 61:

1. `AUTH-009` no longer uses direct header scans or raw peer event counts. Runtime header/preflight construction now goes through `opportunity_authority_selected_stream_count_v3_internal(...)` for all seven authority families and `opportunity_peer_authority_header_counts_v3_internal(...)` for peer authority headers. Peer exclusion reasons are populated from the bounded native peer relationship semantics, and count conservation fails closed as `PT409/conservation_failure`.
2. Taiwan calendar v3.4 now rejects completed/completed TWSE/TPEX schedule mismatches as `PT409/authority_revision_conflict` instead of silently filtering them out. `CAL-001` ownership now maps to the exact two-authority schedule resolution and begin-time re-resolution behavior.
3. The parent `opportunity_manifests_v3` catalog now matches the v3.14 contract shape with `manifest_kind`, `manifest_hash`, `created_at`, lifecycle nullability checks, complete-manifest uniqueness and append-only lifecycle triggers across parent/page/row tables. The obsolete parent `logical_key`, `header_hash` and `root_hash` columns are gone.

Local evidence before the fresh Round 61 tree:

- `node --check scripts/opportunity-v3/migration-contract.test.mjs`
- `node --check scripts/opportunity-v3/acceptance-traceability.test.mjs`
- `node scripts/run-node22.js --experimental-strip-types --test --test-name-pattern='manifest v3.14|Taiwan calendar|authority registries|nonempty source-identity' scripts/opportunity-v3/migration-contract.test.mjs` → `4/4 PASS`
- `node scripts/run-node22.js --experimental-strip-types --test scripts/opportunity-v3/migration-contract.test.mjs` → `20/20 PASS`
- `node scripts/run-node22.js --experimental-strip-types --test --test-name-pattern='canonical acceptance inventory' scripts/opportunity-v3/acceptance-traceability.test.mjs` → `1/1 PASS`

Fresh Requirements Round 61 remains mandatory over the newly sealed immutable tree. Architecture remains locked until Requirements passes.
