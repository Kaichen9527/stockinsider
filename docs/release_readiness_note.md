# StockInsider Release Readiness Note

## Date
- 2026-03-04

## Completed In This Iteration
- Added internal ingestion endpoint: `POST /api/internal/ingestion-run`.
- Updated pipeline endpoint to run full chain: `ingestion -> recommendation -> line-dispatch`.
- Enabled real LINE push in dispatch flow (`@line/bot-sdk`) with `sent|failed|skipped` persistence.
- Added LINE webhook reply strategy for `/bind` and `/help` commands.
- Updated Vercel cron sequence to include ingestion before pipeline.
- Expanded release-gate smoke checks with ingestion and optional non-dry-run API validation.
- Updated canonical OpenSpec spec purposes and archived `stock-insider-mvp` change.

## Still Requires Ops Configuration
- Confirm staging/prod secrets in runtime:
  - `SUPABASE_SERVICE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`
  - `INTERNAL_API_KEY` and/or `CRON_SECRET`
  - `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET`
  - `ALERT_WEBHOOK_URL`
- Decide whether to enable mutating smoke in release gate (`OPSX_MUTATING_SMOKE=true`).
- Prepare LINE gray rollout subscriber list and percentage schedule (5% -> 20% -> 50% -> 100%).

## Recommended Staging Validation
1. `openspec validate --all`
2. `npm run test:scraper`
3. `cd web && npm run lint && npm run build`
4. `npm run opsx:test` three times (with stable env)
5. Manual check:
   - `POST /api/internal/ingestion-run` (dryRun=false)
   - `POST /api/internal/pipeline-run` (dryRun=false)
   - `POST /api/internal/line-dispatch` (dryRun=true then false)
