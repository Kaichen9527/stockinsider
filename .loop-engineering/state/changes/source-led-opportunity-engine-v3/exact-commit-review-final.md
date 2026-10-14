# Exact historical-cash code integration review

Result: `PASS`

P0=0 P1=0 P2=0

- Final reviewed repair/tree: `b7796da8a92b99284b133a7a622e490a23bad11b` / `78bd213468fa08354ede8d213dfd6e76af0d380e`
- Full final range: `69b9734c5766b2e196e8133d63df1f1148959046..b7796da8a92b99284b133a7a622e490a23bad11b`
- Active graph: `c8576f1b60613ab0b424c9a6315ee64dee9c3d14d81c49dae10834bd66bc7e0a`

Reviewed at 2026-10-14T05:57:27Z. This is an unsigned, independent model-agent code-integration review of the exact six-file range. It is not a human or third-party signature, an attributed model identity, formal research author/reviewer execution, protected gate PASS, migration authority, release permission or publication approval.

## Requirements review — scoped integration PASS

The stated increment is a fixed calculation leaf for AUO 2409 and EMC 2383 historical half-year cash operands, plus diagnostics and an explicit handoff. I freshly read the complete six-file base-to-subject diff, all 493 fixture lines and the full resulting ordinary workflow, and checked the actual merge base equals the specified approved base. The change adds five files and four path-filter lines, 785 insertions and no deletions. There is no runtime caller of calculateHistoricalCash outside its new test; no product adapter is silently declared complete.

The core accepts exactly 52/33 named two-period operand pairs, signed TWD-thousands, consolidated half-year cumulative flow and the closed AUO June30 capital tuple. It neither mixes standalone Q2 with H1 nor treats instant equity/shares as flow. It does not calculate or substitute EPS. Historical issued common shares are distinguished from weighted/diluted or October outstanding shares; treasury share count, current PB and target price remain unknown/null.

The constitution's evidence-before-recommendation, finite-workload and research/action separation remain intact. The existing financial-data contract's source clocks, authoritative admission and bounded fact-plane obligations are not discharged by this arithmetic leaf. The handoff explicitly defers the byte-bound v3 projector, source/clock authentication, schema/mapping, old-v2 replay, citation consumers, guarded integration and formal author/reviewer reservations. These are remaining work, not missing claims concealed by this PASS.

## Architecture review — scoped integration PASS

The new module has no imports or file/network/database/model operations. Closed records reject extra keys, symbols, unexpected record prototypes and accessors; fixed two-value tuples are copied. Safe-integer operands and BigInt intermediate sums avoid intermediate precision loss and reject unsafe final outputs. Group-profit ratios retain typed zero-denominator unavailability. The return is recursively frozen and does not alias caller operand arrays.

AUO noncash and working-capital components, EMC reported subtotals, pretax/generated-CFO, consolidated owners+NCI profit, net borrowing, cash movement and capital/par/equity bridges are explicit. Negative NCI remains signed. PPE/intangible acquisition-cash proxies exclude disposal proceeds, M&A and ROU cash; lease-principal sensitivity and EMC ROU are separate. These proxies are explicitly not IFRS FCF, FCFE, maintenance capex or forecasts. EMC named AR/inventory/AP components are only partial coverage; changing a partial component without changing reported totals need not fail this leaf. A future projector must authenticate every row. Self-consistent fabricated operands can pass arithmetic and are not financial evidence.

All verification, dispatch, research qualification, strategy, entry and publication flags remain false; forecastCash is null. This is bounded plain-data validation, not an in-process JavaScript Proxy sandbox claim.

The separate arithmetic workflow uses hosted Ubuntu, five-minute timeout, contents:read, pinned checkout/setup-node and Node22.14.0, no persisted checkout credentials, no dependencies or secrets. The existing ordinary workflow adds exactly four positive path filters. Removing them restores byte-identical approved-base workflow bytes; its original jobs, commands, permissions, inherited action tags, manual-only evaluation and manually gated self-hosted model track are unchanged. No protected/oracle/authority path was altered.

## Independent code review and evidence

Earlier independent review actually executed the 14-case suite, 170-cell original packet equality, four-period independent BigInt/rational checks, 94 supplemental boundary/accessor/alias checks and strict module-only TypeScript5.9.3 checking. The core, fixture, test and arithmetic-workflow Git blobs are unchanged at this subject; those checks were not rerun here. The two original reports are retained at /tmp/stockinsider-historical-cash-core-independent-review-b89e3dde-oct14.md (SHA256 bbca3d9267806385021d9cbb7ca9de99835a8c50c50e285c74f5a79a0572e5f7) and /tmp/stockinsider-historical-cash-core-followup-review-b7796da8-oct14.md (SHA256 6c20f63950b04c30fbb22a65f93ae4d4fdf37e9c80b40857065527ce1186e32c). Their prior pending-CI conclusions are historical, not silently rewritten.

The maker's original 8-pass/6-fail fixture-grain run remains RED history. The prior reviewer's alleged-overflow probe originally equaled MAX_SAFE_INTEGER and correctly did not throw; the corrected true-overflow probe passed. These were not hidden by changes to production validation or expected financial values.

The review skill's mandatory repository checklist is absent. Its workflow stopped at that prerequisite; this is a direct scoped manual-review fallback, not a complete gstack review. No review registry, acceptance expectation, policy or parser was weakened.

## Fresh ordinary execution evidence

I inspected the provided GitHub run/jobs JSON and actual ZIP member 1_product-runtime.txt for run 38516725401, product-runtime job 115697084421, attempt 1, source b7796da8a92b99284b133a7a622e490a23bad11b. Job completed successfully at 2026-10-14T05:35:18Z; the parent diagnostic run completed at 2026-10-14T05:35:24Z.

Actual output shows root/web npm ci, full app typecheck and lint, ordinary next build with Next16.3.4, canonical product correctness, migration82, legacy2, browser9 and performance5. The unmodified parent command uses && chaining, and the diagnostic step concluded success. Overlapping suites are not summed into a novel acceptance total. The separate evaluation-governance/model-runner jobs were skipped as designed for a PR; their status is not presented as executed PASS.

The timestamp-stripped canonical TAP section occurs exactly once in the raw combined product log, from TAP version 13 through its duration line. It contains 155 passed, zero failed/cancelled/skipped/todo and each acceptance PCR-001 through PCR-031 exactly once. Its SHA256 is 08b6a85c6deec2775b0b290a94cedfe8f934874b61a55b663da26202b6faccb2. The fulfillment record hashes those exact fresh combined-output section bytes, not a separately executed stdout stream. commandSha256 binds the displayed command name; the actual package command and its empty preimplementation/owner-child/case environment overrides were also inspected. No PR378 result is reused.

Run38516725449/job115697084786 independently shows the actual new arithmetic14 PASS; candidate run38516725320/job115697083974 shows164 PASS, both zero fail/skip/todo and this source head. Actual raw checkout lines identify PR merge c0e5468ffe45f29c8d7cb95ec97212f3448bd2f8, merging b779 into base69. Source tree 78bd213468fa08354ede8d213dfd6e76af0d380e was directly verified. The supplied quality-checkout-verification.json records that same complete merge tree. Limitation: the merge Git object is absent in the reviewer repository and a local lookup failed; no fresh remote Git/API read of that merge object was performed in this corrective turn. Thus the merge-tree equality receipt is supplied evidence, not falsely described as a fresh independent object fetch.

The current active graph and 101 distinct catalog/owner/caller paths were independently recomputed and proved byte-identical to approved base. Fulfillment fixture hashes and owner/caller fields are generated from current inventory and boundaries, not copied stale execution claims. The unchanged result-dependency metadata was checked against the prior record; all execution hashes and subject/range identities are fresh.

Original protected run38516725291 attempt1 remains failure: bootstrap succeeded; exact-review, architecture and requirements failed fetching the absent source-addressed exact-review ref, aggregate failed and product/model tracks skipped. That original RED is preserved. This evidence is not a protected envelope and does not impersonate stockinsider-v3-gate-root.

## Inherited financial binding and limitations

All SQL, default48 chain, financial49 tail, profile50 prelude and operator source files are unchanged in this range. Their current bytes were independently hashed using the original imported identity functions with network/PG connect guards; connectionAttempted was false. The first import attempt failed because this source checkout lacked a resolvable pg module; a second read-only attempt used the existing local pg8.18.0 through NODE_PATH, without installing or editing dependencies. The literals below bind inherited source identity only. They do not assert an actual private peer, HBA, production LOGIN6, capacity check, role mutation, migration or deployment.

Financial history ordered chain SHA256: cec630ce83aea1f7bdcafae815990e2e964ebbf599a3441e08d978e4427f46cd
Financial existing-schema ordered profile SHA256: acdee42a8ca130d259541b5c0b4b14e228c355528b60a2ac4ea3ef9633d611d9
Financial VPS operator prerequisite SHA256: 97697bc3f8a2c3c1bd4676c579eaa9b33e4273c9e98e0a0045998698b736a42b

## Scope incident retained

Before this corrective turn, context recovery drifted into official-document automation: SSH read release/service/file hashes and a loopback pending GET; only automation memory was appended locally. No upload, activation, worker, service/database mutation or facts completion occurred. That previous terminal response did not deliver code evidence and is not approval. The correction was received from source chat01a0b7b4-8534-7741-9de6-177edf929f58; this corrective turn read its sealed /tmp/stockinsider-pr379-independent-task-oct14.md scope and performed no new SSH/VPS/HTTP/queue or automation-memory operations.

This review's PASS is limited to the six-file code increment. Full v3 input integration, formal research review/publication and production acceptance remain pending. Source checkout/index/untracked files, Cloud-owned 26-tail work and Root's cashprojection work were not changed. No local heavy suite, PG server, build, CI rerun, ready/merge/deploy, protected signing or formal model execution was performed.
