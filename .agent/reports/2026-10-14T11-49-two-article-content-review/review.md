# Independent bounded content review — AUO / EMC cash-flow successors

Verdict: AUO scoped PASS; EMC scoped PASS. No material P0/P1/P2 finding established in the reviewed article/model content. This is an unsigned conversational content review, not a formal publication signature, investment recommendation, strategy approval, or historical-PIT admission.

## Exact subjects and custody

- Source commit: `15d4ef54ec3f0fc8ab0e5c71111ed2baf2843ccb`.
- Evidence commit: `ae8bb71744587a57cf49fbd82809d391d9f64169`.
- Inspected detached checkout: `/tmp/stockinsider-discovery-snapshot-root-review-oct14`; clean before and after review. No source edits.
- Source/evidence diff has no changes within either company-model directory or the cashflow-capital-addendum directory.
- AUO article SHA-256: `accb32669966843b008a345bfe732a13d41af3b008fcbfe2f716d6d580c8cda2`; Git blob `2095c675e31848810368e0a69aa7a74360a5e60e`.
- AUO model canonical hash: `cf7419b2204419dc1aca590bc355df36bb19600c5beaf2905c6819f5a040b57d`; Git blob `63e0191dcfae38a16de4e069d7a0dc37206576c2`.
- EMC article SHA-256: `65a5c805e45487dfa6daa91d5c8d7f5d5aae4a10ed7f6aa250cb6b11710b3064`; Git blob `50d0f673c0051e1bd5d15eeddcf448bdea23f33c`.
- EMC model canonical hash: `d10858110edee1dd2760791e00c8b0eea3dc4a80b6d643db70b62216541dc879`; Git blob `42d02610e0657637a61eeb1645a8ece8537c51ee`.
- Canonical hashes independently recomputed using the implemented canonical body (excluding top-level canonicalHash and compatibility inputManifest); duplicate top-level and canonically bound nested manifests agree. No recurrence of the previously reported binding issue was established.
- Original AUO and EMC Q2 PDFs independently rehashed to the supplied `94d74c75...dcdb2` and `245b41f9...e0f20` respectively. No new source observation or market retrieval was made.

## Original material read

Page references below are PDF file pages, not necessarily printed page numbers.

- AUO Q2 PDF: pages 6–9 (income/equity/cash flows), 30–31 (BVXM and Darwin disposals), 38 and 40 (capital and 2025 treasury cancellation), 52 (EPS), 68–69 (four segments and non-restated 2025 comparison). Cash-flow page 8 was also rendered and visually inspected.
- AUO 2025 annual PDF page 9 and 2025 Q3 PDF page 6: operating-profit amounts used to verify the Q4 flow subtraction and TTM bridge.
- EMC Q2 PDF: pages 5 and 7 (income and cash flows), 25–26 (basic/diluted numerator/denominator and product revenue). Cash-flow page 7 was also rendered and visually inspected.
- EMC retained July presentation text: Q1 basic EPS, infrastructure growth, and the dated 2024–2028 capacity schedule.
- Retained official AUO August 31 technology HTML and Intel patent application HTML: selected original text concerning MicroLED integration, Corning/RDL/TGV, and visual/status-indication embodiments.
- Retained Uanalyze/Cnyes October 5 HTML: M7+ mix, M9 timing, 2027 38% gross-margin and EPS187–226 media estimates, and distinction between EMC and downstream PCB maker Gold Circuit.
- Both full articles, recompute logic, model outputs, metadata, source ledgers, cash packet and relevant financial/context relays were examined.

## Independent arithmetic

Calculations used separate Node hashing and Python Decimal arithmetic, without executing maker recompute entrypoints or rewriting outputs. This was a targeted content check, not a rerun of CI or the previously completed framework tests.

- Independently rebuilt revenue paths from Q2 segment figures/Q3 monthly totals and declared growth assumptions; verified all 36 forecast-quarter gross-profit, operating-profit, tax, signed-NCI, parent-profit and EPS bridges.
- Checked 2026 H1 plus forecast H2, four forecast quarters of 2027, and 2026Q3–2027Q2 separately. Verified ordinary/potential share weights and exclusion of potential awards in loss aggregates. EMC 2026 retains the H1 0.176m potential-share amount at half-year weight; neither company sums rounded quarterly EPS to construct annual EPS.
- AUO 2026 / 2027 / forward-four EPS: bear −0.297471 / −0.556582 / −0.604448; base 0.059636 / 0.328069 / 0.155652; bull 0.328977 / 0.956076 / 0.712299. These round to article lines 86–88.
- EMC equivalent EPS: bear 91.512524 / 88.131672 / 92.244484; base 111.264759 / 149.399275 / 138.157690; bull 122.828684 / 197.167806 / 168.219940. These round to article lines 57–59.
- AUO four pillars: Q2 first three OP sum 427.985m; Other −209.656m yields consolidated 218.329m. 2025Q4 OP = −1,055.589m − 837.765m = −1,893.354m. TTM OP = −4,116.896m. Supports article lines 7–19.
- AUO disposal sensitivity = (863.731 + 1,127.507 × 0.4105) × 0.8 = 1,061.2580988m; hypothetical Q2 EPS 0.03734334 and H1 EPS −0.11417673. Article lines 43–45 properly retain the assumed tax/ownership status.
- AUO 2026H1 noncash adjustment sum 12,294.544m and working-capital cash effect −6,614.055m reconcile from pretax 2,249.593m to generated cash 7,930.082m, then CFO 6,877.414m. The disposal gain is reversed once in this bridge.
- Historical CFO less PPE and intangible cash outlays: AUO 2026H1 +1,134.612m / 2025H1 −5,692.596m; EMC −5,661.917m / −1,687.888m. All four match the article tables and independently computed CFO/group-net-profit ratios.
- 2026H1 cash changes: AUO 6,877.414 − 2,059.522 − 8,758.567 + 2,115.789 = −1,824.886m; EMC 5,044.825 − 10,851.462 + 7,632.127 + 734.456 = +2,559.946m. The financing/cash interpretation is supported.
- AUO June equity/issued-common-share calculation = 154,397,339 / 7,547,099 = 20.457839363 TWD/share. The article does not promote it to October P/B or substitute NCI equity.
- EMC EPS187/226 reversal with base share/tax/expense-rate assumptions: required parent profit 67,341.05714m / 81,385.44873m; required revenue 340,774.58064m / 411,849.43689m; alternatively required GM40.044152% / 46.831838%. Changing only GM to38% yields EPS175.254919. Matches article lines 102–107.
- Q3 monthly sums: AUO 20,370 + 23,102 + 23,404 = 66,876m; EMC 19,206.698 + 20,145.589 + 21,532.230 = 60,884.517m. Neither is represented as published Q3 EPS. Model price sessions remain October8. EMC raw MA5/MA20 independently reproduced at 5,766 / 5,236.5.

## Per-article assessment

### AUO — scoped PASS

No material finding. Four-segment Other is retained; the Q1 segment-allocation conflict and non-restated prior year are not used as comparable segment profit growth. Consolidated, parent-attributable, and NCI amounts are separated. Disposal sensitivity is clearly conditional. Forecast margins and tax floor are identified as research assumptions; no unsubstantiated new CPO/GCS revenue is inserted. Technical demonstrations, a patent application, media referrals and orders are distinguished. The cash proxy excludes disposal proceeds and does not claim future cash, FCFE, maintenance capex, current P/B, a target, or approved entry.

### EMC — scoped PASS

No material finding. Signed negative NCI is preserved, historical dilution notes are separated by period, monthly-versus-quarter financial discrepancies remain explicit, and product classes are not confused with M8/M9 grade economics. Capacity is a dated plan rather than delivered qualified output. The media EPS range is attributed and reverse-tested rather than adopted as company guidance or current consensus. Weak CFO relative to group profit, working-capital absorption, cash investment and borrowing support are consistently distinguished.

## Limits

- Original source evidence is retained historical material; this review does not establish present market conditions or validate original publication instants. October8 price/source observations and October14 cash extraction remain distinct.
- Not every historical financial-statement page, ownership chain page, media referral, Omdia/Visteon/Intel OCI source, or raw market row was independently reread. For those, assessment is limited to retained relays, explicit attribution and the absence of an unsupported upgrade in the article. RSI/ATR and the full corporate-action adjustment chain were not independently recalculated.
- Revenue growth, margin steps, tax/NCI, potential shares and commercial capture are conditional inputs, not validated forecast probabilities. Future cash, maintenance/expansion split, transaction-date attributable taxes, platform materials, firm orders and calibrated multiples remain unverified as the drafts state.
- No formal author/reviewer reservation, prepared input, job/lease, publisher approval or review RPC was created or inferred. Published/historical-PIT/strategy approval flags and target-price nulls were not changed.
- No HTTP, VPS, database, SQL, production document acquisition, merge, deployment, or CI rerun occurred. The shared source checkout remains clean.
