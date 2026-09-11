# Implementation boundary reconciliation — 2026-09-10

Status: successor implementation prepared; independent requirements/architecture,
protected-base registration and exact review remain pending. This document is not
gate evidence or PASS.
Approved acceptance setup/expected behavior remains unchanged.

Independent inspection of subject `7bdddd5f71994b9ae900fd8a26bc97dd3b024cd6`
found seven boundary entries not supported by the declared production caller.
Passing the 150 runtime tests does not resolve those missing dependencies.

| PCR | Required reconciliation |
| --- | --- |
| 004 | Register actual TS runtime-health owner; execute health route and closed fail-closed reasons. |
| 008 | Connect authority resolution to actual source extraction and verify UUID/absent authority rejection through that caller. A direct helper test is insufficient. |
| 010 | Prove publisher seed-only exclusion and total-outage health-only behavior; lane limiting alone does not satisfy it. |
| 021 | Map actual public-union serializer and separately test disabled/drain query isolation, legacy byte identity, cross-run/config and stop geometry at the real boundary. |
| 022 | Record snapshot reader and legacy-wrapper chain; test new index/read bounds. Public snapshot misses must not execute research. |
| 023 | Register protected-base aggregate's actual verifier and execute the full mutation inventory. Never execute candidate-owned code in a credentialed protected worker. |
| 030 | Map actual publisher serializer, not a hash-validating immutable reader; test final published closed unions without reserializing stored authority. |

## Normal approval sequence

1. Repair caller behavior and integration tests; revise the versioned boundary
   catalog without reducing any acceptance expectation.
2. Freeze the successor active artifact graph including its approved amendment.
3. Obtain independent requirements and architecture evidence bound to that graph.
4. Register their immutable references through a separately reviewed bootstrap PR
   merged to protected base before the candidate uses it. No self-certification.
5. Freeze final implementation; run tests and independent exact review.
6. Create subject-addressed direct-child evidence containing only the prescribed
   review, runtime attestation and all 31 proven PCR fulfillment records.
7. Require all protected checks before merge/deploy. No disabled ruleset or fake
   fulfillment is permitted to bypass these steps.

## Current implementation delta

The successor boundary catalog is now `source-led-opportunity-pcr-boundaries-v3.20.1`.
It maps PCR-004 to the TypeScript health owner used by the real health route; PCR-008
to the production KOL extraction caller; PCR-010 to the compact publisher; PCR-021
and PCR-030 to the two-module publisher serializer chain; PCR-022 to the neutral
reader wrapper; and PCR-023 to a base-owned aggregate validator called by the
protected worker.

Executable diagnostics now invoke the real health route with a failed database,
exercise UUID/missing-authority outcomes through `extractRevisionCandidates`, prove
seed-only and authorised total-outage suppression at `publishCompactRadarProjection`,
exercise disabled/drain zero-query identity through the homepage layering boundary,
run the indexed projection performance oracle, and reject missing/reordered/failed/
unreviewed protected aggregate inputs. Existing mutation, browser and PostgreSQL
oracles remain required. These diagnostics do not constitute independent review,
protected registration, PCR fulfillment evidence or gate PASS.
