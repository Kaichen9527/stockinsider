# StockInsider Operations Runbook

## 1. Daily Job Sequence

1. Apply migrations when schema changes:
   - `npm run db:migrate`
2. Verify target DB schema/indexes (staging/prod):
   - `npm run db:verify`
2. Run ingestion pipeline:
   - `python3 scraper/ingestion_pipeline.py`
3. Run recommendation + strategy transitions:
   - `python3 scraper/strategy_engine.py`
4. Dispatch pending LINE alerts:
   - `python3 scraper/line_dispatcher.py`

### Vercel Cron Sequence (staging/prod)

1. `/api/internal/pipeline-run` (daily) with `Authorization: Bearer $CRON_SECRET`
2. Retry windows via cron:
   - `+1 min`: `/api/internal/pipeline-run?retry=1`
   - `+5 min`: `/api/internal/pipeline-run?retry=2`
   - `+15 min`: `/api/internal/pipeline-run?retry=3`
2. `/api/internal/monitoring-check` (every 15 min) with same auth

## 2. Failure Handling

### Ingestion failure

- Check `pipeline_runs` latest `run_type=ingestion`.
- If source issue is transient, rerun ingestion.
- If source stale beyond 1 hour, recommendations will be blocked by freshness gate.
- Check governance tables:
  - `source_registry` for blocked/review status
  - `source_review_queue` for pending manual review
  - `source_health_checks` parse ratio and freshness pass rate

### Recommendation failure

- Check `pipeline_runs` latest `run_type=recommendation`.
- Verify `stock_signals` and `market_snapshots` have fresh data.
- Confirm strategy rows in `strategy_actions` were upserted.

### LINE dispatch failure

- Check `pipeline_runs` with `run_type=line_dispatch`.
- Inspect `line_alert_events` statuses (`pending|failed|skipped`).
- Verify `line_subscriptions` preferences and throttle settings.
- Check alert webhook status (`ALERT_WEBHOOK_URL`) if monitoring alerts are expected.

## 3. Freshness Gate Policy

- Critical inputs: `market_snapshots`, `stock_signals`.
- Threshold: 1 hour (`SIGNAL_FRESHNESS_THRESHOLD_SECONDS=3600`).
- If stale: set recommendation `is_blocked=true`, keep `block_reason`.

## 4. Suggested Monitoring Queries

- Pending line events:
  - `select count(*) from line_alert_events where delivery_status='pending';`
- Blocked recommendations today:
  - `select symbol, block_reason from recommendations r join stocks s on s.id=r.stock_id where as_of=current_date and is_blocked=true;`
- Latest pipeline runs:
  - `select run_type,status,started_at,finished_at from pipeline_runs order by started_at desc limit 20;`
- Source governance status:
  - `select source_key,source_type,status,risk_level,updated_at from source_registry order by updated_at desc limit 50;`
- Source review queue:
  - `select source_key,reason,state,created_at from source_review_queue where state='pending' order by created_at desc;`

## 5. Test Commands

- Python unit/smoke tests:
  - `PYTHONPATH=scraper python3 -m unittest discover -s scraper/tests`
- Frontend lint/build:
  - `cd web && npm run lint && npm run build`
- Unified release gate:
  - `npm run opsx:test`
