# Independent F/G/E source review — request changes

Subject `1a0043f2656b63d54062224d1befeab761f554a3`, tree `548ec17b1d8801ecb7f2e4c5635199aacd9989b2`, base `169aad1b6cfa747f78ae3464b614f43c0749d806`. PR361. This is an unsigned source review of F45/G5/E34 (84 paths), not complete main approval or release authority.

## P2: delayed paper session cannot catch up

`web/src/app/api/internal/research-paper-session/route.ts:115` invokes the live entry-plan authority for a historical required paper session using today's annual calendar. `web/src/lib/tw-entry-plan-authority.ts:288` allows the next calendar day only when holiday/scheduled. After that next trading day closes, its legitimate completed status causes `official_next_calendar_invalid` and zero bars. Held positions or an eligible old entry keep the chronological book stuck; skipping the required session is rejected.

The independent exact-source synthetic probe used signal2026-09-24 / next2026-09-28 / cutoff2026-09-29. Its expected processable result is RED; original TAP is retained at `/tmp/stockinsider-full-review-fge-oct11-catchup-probe.tap`. This is a module/integration-path proof, not a production HTTP claim.

Minimal fix: separate settlement authority from future-entry authority. Reuse proved historical bars/action hashes, validate the complete past official calendar, return completedSessions and immutable anchor action proof (including verified explicit no-event context). Keep inception, ordered sessions, frozen pre-open entry qualification/approval/liquidity, held position rules and corporate-action reconciliation. Do not directly swap in the existing weaker historical reader. Update authority/route regression tests and regenerated source identity; old strategy approval must not transfer. Root has been notified and owns repair.

## Coverage and evidence

All84 final blobs/SHA256 values were independently matched to the candidate inventory. Inspected qualification/review/strategy role boundaries, source/clock/provenance, benchmark formulas, costs, board lots, volume limits, frozen per-position exits and cash/exposure sequencing; inspected installer atomicity, finite ownership profiles, successor rejection, public catalog/type/ACL fingerprints, transport and packaging. No second reproducible P1/P2 was established in this scope.

Independently verified20 packaged research files,73 migration profile hashes and all3 captured catalog stages. Source release --check passes in focused tests; its11 selected database functions have no unqualified custom-function call omitted by the current traversal.

Focused first run140TAP (130pass/10 extraction failures); exact dependencies and official bridge restored40/40. Extra32TAP (30pass/2 environment failures); exact status extraction closes planner failure and plan tests4/4. Native HBA test lacked pg_config before any cluster creation and was not rerun; reused exact installer22/22 raw only within its reviewed increment. Offline artifact audit21/21; synthetic auth aliases4/4. These overlapping runs are not summed into a misleading unique total. One independent paper catch-up regression remains RED.

Per-path coverage and exact raw hashes: `/tmp/stockinsider-full-review-fge-oct11-coverage.json`; full scoped verdict: `/tmp/stockinsider-full-review-fge-oct11-review.json`. Original red logs are retained.

## Limits

A–D remains another reviewer's scope. No live provider/auth/prod/runtime, no source mutations, no signing, no activation. No fresh heavy PG/build/PCR/browser suite or advisory vulnerability audit; maker evidence is not substituted for independent execution. Captured schema is not current production/data proof. Real source completeness, exact strategy adoption, true PIT/holdout/forward profitability, held company-action entitlements and five trading days remain separate gates. Root's Linux Chromium403/0tests is not a browser pass.
