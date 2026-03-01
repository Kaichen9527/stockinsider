# StockInsider Release Note Template

## 1. Release Meta

- Version:
- Date:
- Environment: `staging|production`
- Change scope:

## 2. Included Changes

- Data sources:
- Pipeline/runtime:
- API/contract:
- Monitoring/alerting:

## 3. Risk & Mitigation

- Known risks:
- Current safeguards:
- Rollback trigger:

## 4. Rollback Plan

1. Disable Vercel cron (`/api/internal/pipeline-run`, `/api/internal/monitoring-check`)
2. Revert deployed web version
3. Mark unstable sources as `blocked` in `source_registry`
4. Re-run `/opsx:test --quick` to confirm baseline health

## 5. Post-release Verification

1. `pipeline_runs` has successful daily run
2. `recommendations` blocked ratio below threshold
3. `line_alert_events` sent/skipped are expected
4. No critical alert from monitoring webhook in 24h
