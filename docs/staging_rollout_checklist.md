# StockInsider Staging Rollout Checklist

## Environment

- [ ] `INTERNAL_API_KEY` and `CRON_SECRET` configured
- [ ] Supabase staging credentials configured
- [ ] `ALERT_WEBHOOK_URL` configured
- [ ] `SIGNAL_FRESHNESS_THRESHOLD_SECONDS=3600`

## Database

- [ ] `npm run db:migrate`
- [ ] `npm run db:verify`
- [ ] `source_registry`, `source_health_checks`, `source_review_queue` exist

## Scheduler

- [ ] `web/vercel.json` cron deployed
- [ ] `/api/internal/pipeline-run` receives authorized cron calls
- [ ] `/api/internal/monitoring-check` runs every 15 minutes

## Release Gate

- [ ] `npm run opsx:test` pass #1
- [ ] `npm run opsx:test` pass #2
- [ ] `npm run opsx:test` pass #3

## LINE

- [ ] `POST /api/line/bind` works in staging
- [ ] `POST /api/internal/line-dispatch` dry-run returns sent/skipped summary
- [ ] Gray rollout list prepared (5% -> 20% -> 50% -> 100%)
