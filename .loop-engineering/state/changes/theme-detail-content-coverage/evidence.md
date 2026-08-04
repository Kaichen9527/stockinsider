# Evidence: theme-detail-content-coverage

## Baseline

- `/api/themes/quartz-frequency-components` returned a `theme_heat` row but `opportunities=[]`, `supportingStories=[]`, and `reports=[]`.
- Homepage radar showed Quartz symbols `3221 / 3042 / 2484 / 8183`, while detail API only had `3221 / 3042 / 2484`.
- Source search for Quartz found PTT coverage, but theme detail did not convert it into readable story or source matrix content.

## Implementation Notes

- Added registry-derived fallback fields and UI sections.
- Kept registry-derived content as candidate / pending verification only.
- No migration or deployment performed.

## Verification

- `cd web && npm run lint` passed with 4 pre-existing warnings in `research-v2.ts`.
- `cd web && npm run build` passed.
- `npm run audit:theme-detail-coverage -- --base-url http://127.0.0.1:3012` passed.
  - Report: `.agent/reports/theme-detail-coverage-audit-2026-06-28T08-43-02-259Z.json`
- `npm run audit:theme-source-coverage -- --base-url http://127.0.0.1:3012` passed.
  - Report: `.agent/reports/theme-source-coverage-audit-2026-06-28T08-42-47-247Z.json`
- `npm run audit:theme-symbol-consistency -- --base-url http://127.0.0.1:3012` passed.
  - Report: `.agent/reports/theme-symbol-consistency-audit-2026-06-28T08-43-02-925Z.json`
- `npm run audit:radar-live-availability -- --base-url http://127.0.0.1:3012` passed.
  - Report: `.agent/reports/radar-live-availability-audit-2026-06-28T08-43-33-770Z.json`
- `npm run audit:global-theme-lead-lag -- --base-url http://127.0.0.1:3012` passed.
  - Report: `.agent/reports/global-theme-lead-lag-audit-2026-06-28T08-43-34-928Z.json`
- `npm run audit:source-health -- --base-url http://127.0.0.1:3012` passed.
  - Report: `.agent/reports/source-health-audit-2026-06-28T08-43-35-282Z.json`
- `PLAYWRIGHT_SKIP_WEBSERVER=1 E2E_BASE_URL=http://127.0.0.1:3012 npm exec playwright test e2e/investor.spec.ts e2e/deep-dive-story.spec.ts e2e/radar-layering.spec.ts --reporter=line` passed: 5/5.

## Smoke Result

`/api/themes/quartz-frequency-components` now returns:

- `contentStatus=complete`
- related symbols `3221 / 3042 / 2484 / 8183`
- `trackedSymbols=4`
- `opportunities=4`
- `supportingStories=10`
- `reports=5`
- `sourceCoverage=5`
- `evidenceMatrix=8`
- `nextRefreshPlan=4`
