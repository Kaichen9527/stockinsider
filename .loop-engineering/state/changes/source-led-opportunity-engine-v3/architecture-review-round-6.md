# Architecture Review — Round 6

Date: 2026-07-26
Immutable tree: `2fe7ae8d6e7c0a79a92952495ac41d25512ba099`
Base: `1fe429d3a91359cd2d6d07c89441ebb66d9ccc5d`
Verdict: `PASS`
Counts: `P0=0 P1=0 P2=0`

This was an independent fresh read-only Architecture Gate review of only the named immutable Git tree. Requirements Round 62 PASS was incorporated into this tree before review.

## Evidence reviewed

- Confirmed the reviewed object is a Git tree and repo `HEAD` remained the stated base commit.
- Confirmed Requirements Round 62 PASS evidence is incorporated and status marks Requirements passed with Architecture Round 6 required.
- `AUTH-009` architecture is coherent: `opportunity_authority_selected_stream_count_v3_internal(...)` covers all seven authority families with registry-first bounded enumeration and per-stream `LIMIT 65`; `opportunity_peer_authority_header_counts_v3_internal(...)` calls the selected-stream helper and fail-closes on selected/scanned conservation mismatch; tests cover helper routing, peer header reasons, future-only cases and boundary races.
- Taiwan calendar v3.4 architecture is coherent: effective sessions resolve at each row's exact 16:00 Asia/Taipei cutoff; completed/completed schedule mismatches and semantic ties raise `PT409/authority_revision_conflict`; begin re-resolves expected cutoff/hash; tests cover cancelled exclusion, mismatch rejection, bad hash, noncanonical cutoff and ties.
- Manifest v3.14 architecture is constructible: parent `opportunity_manifests_v3` has `manifest_kind`, `manifest_hash`, lifecycle status/nullability, complete-manifest unique index and no stale parent `root_hash`; page/row tables and immutable triggers are present; create/append/complete RPCs lock leased jobs, validate canonical bytes/hashes, write parent/page/row records and register completed manifests as run inputs.
- Evaluation governance is coherent: verifier uses `m.manifest_hash` for all three manifest attestations; missing real elapsed evidence remains `blocked: non_fabricated_elapsed_cohorts_unavailable` and substitute/fabricated cohorts are not accepted.
- Model-runner host pin remains coherent with the fixed `codex-cli 0.146.0-alpha.3.1` graph and tests reject loose `0.146.0-alpha.3`.
- Product/runtime activation remains fail-closed: `.env.example` defaults `SOURCE_LED_OPPORTUNITY_V3=disabled`; public/internal routes and crons gate before V3 load; generic `npm run db:migrate` excludes the V3 migration.

## Findings

None.

Implementation exact-commit review and Verification Gate may proceed from the Architecture Gate perspective.
