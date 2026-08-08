# StockInsider Staging Rollout Checklist

## Environment

- [ ] `INTERNAL_API_KEY` and `CRON_SECRET` configured
- [ ] Supabase staging credentials configured (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`)
- [ ] DB connection vars configured (`SUPABASE_PROJECT_REF` + `SUPABASE_DB_PASSWORD` or `SUPABASE_DB_HOST`)
- [ ] `ALERT_WEBHOOK_URL` configured
- [ ] `LINE_CHANNEL_ACCESS_TOKEN` and `LINE_CHANNEL_SECRET` configured
- [ ] `SIGNAL_FRESHNESS_THRESHOLD_SECONDS=3600`

## Database

- [ ] `npm run db:migrate`
- [ ] `npm run db:verify`
- [ ] `source_registry`, `source_health_checks`, `source_review_queue` exist

## Scheduler

- [ ] `web/vercel.json` cron deployed
- [ ] `/api/internal/ingestion-run` receives authorized cron calls
- [ ] `/api/internal/pipeline-run` receives authorized cron calls
- [ ] `/api/internal/monitoring-check` runs every 15 minutes

## Release Gate

- [ ] `npm run opsx:test` pass #1
- [ ] `npm run opsx:test` pass #2
- [ ] `npm run opsx:test` pass #3
- [ ] Optional non-dry-run smoke enabled (`OPSX_MUTATING_SMOKE=true`) and verified

## LINE

- [ ] `POST /api/line/bind` works in staging
- [ ] `POST /api/internal/line-dispatch` dry-run returns sent/skipped summary
- [ ] `POST /api/internal/line-dispatch` non-dry-run records `sent|failed|skipped`
- [ ] Gray rollout list prepared (5% -> 20% -> 50% -> 100%)
