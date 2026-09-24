# Requirements review — V3.18 authority digest closure

Result: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Exact reviewed identity

- Final reviewed implementation commit/tree: `318a1f0a459a2ea553226404aac1f42e611968d0` / `a3154493c5b3e6f718ab4f8d572c21f098fc88c8`
- Full reviewed range: `c6818f0de43f68fe24deb486ff41795f7e946f8a..318a1f0a459a2ea553226404aac1f42e611968d0`
- Active graph: `722095adecd208b54cc794f72e262dd5b77ed970da80f0ab5771a55259651625`

## Assessment

The protected product-runtime run against PR #279 revealed that V3.18 changed the tracked active catalog and acceptance script rows while three catalog declarations and one script-row declaration still described V3.17 bytes. The source catalog remains 6,758 bytes with the same closed 55-file and 45-owner topology. Its actual tracked SHA-256 is `2045dcda35da1f5387a8451c0f38b5b5908ffb124d88be5a130007710d4c11bd`. The exact acceptance `scriptValueRows` array hashes to `b3ef11c01c20ee7f9308ac8aff297316cd2e761252ef16326a76f550ee9277ab`. This repair updates the declarations to those recomputed values; it does not change the rows, case count, classifications or required commands.

The structural oracle also still required the obsolete V3.17 host amendment and Codex version. It now requires the tracked V3.18 amendment and `codex-cli 0.155.0-alpha.16.3`. This preserves the exact host pin and fail-closed version check; it does not permit a version range or substitute executable.

The resulting active graph is registered to two exact evidence refs. No prior graph mapping is removed. The requirements source must remain a direct child of this reviewed implementation, and the PR subject must carry these bytes unchanged. This review checks the requirements and authority metadata repair; it does not replace PR #279's final product review, protected Code Gates or deployment checks.

## Verification

- The focused structural tests HYB-007, GOV-004 and GOV-001 passed after the digest and V3.18 pin corrections.
- Protected worker mapping tests passed 16 of 16.
- `git diff --check` passed across the reviewed range.

This review was performed in the same Codex session that prepared the metadata repair. The independently enforced protected worker and product Code Gate remain required before merge.
