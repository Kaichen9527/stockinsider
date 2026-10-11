# Corrigendum to independent d6 integration report

Original retained report: `/tmp/stockinsider-full-review-fge-oct11-integration-d6-report.md`
Original SHA-256: `4651a5097e5fcc184b722271a4858b5e00c191243779f9fa66a1a9e5e23a1756`

The evidence directory in the final section was incorrectly written as `openspec/changes/source-led-opportunity-engine-v3/`. The correct directory is **`.loop-engineering/state/changes/source-led-opportunity-engine-v3/`**, exactly as the trusted base `169aad1b6cfa747f78ae3464b614f43c0749d806` defines `changeRelative` at `scripts/opportunity-v3/protected-external-gate-worker.mjs:24`. Its exact three files are:

- `.loop-engineering/state/changes/source-led-opportunity-engine-v3/exact-commit-review-final.md`
- `.loop-engineering/state/changes/source-led-opportunity-engine-v3/pcr-fulfillment-record-v1.json`
- `.loop-engineering/state/changes/source-led-opportunity-engine-v3/runtime-review-attestation.json`

The line 616–626 exact-added-path rule, unique direct-child rule, unsigned canonical ten-key attestation, exact subject-addressed ref, and requirement for truthful completed dynamic PCR fulfillment remain unchanged. This corrects an operator handoff path; it creates no evidence commit or authority and does not alter the original report.

Separately, root has reported the d6 VM research suite finished with 818 tests, 816 pass, 0 fail, and 2 explicit profile skips. This corrigendum has not independently read the VM receipt and therefore does not upgrade that report to verified execution evidence.
