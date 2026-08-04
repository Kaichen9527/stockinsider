# StockInsider Operations Runbook

## 1. Daily Job Sequence

1. Apply migrations when schema changes:
   - `npm run db:migrate`
2. Verify target DB schema/indexes (staging/prod):
   - `npm run db:verify`
3. Trigger ingestion:
   - `POST /api/internal/ingestion-run`
4. Trigger recommendation + line dispatch pipeline:
   - `POST /api/internal/pipeline-run`
5. Run monitoring checks:
   - `POST /api/internal/monitoring-check`
6. Refresh canonical research memos for radar/deep-dive surfaces:
   - `POST /api/internal/report-build`

### Vercel Cron Sequence (staging/prod)

1. `/api/internal/ingestion-run` (daily) with `Authorization: Bearer $CRON_SECRET`
2. `/api/internal/pipeline-run` (daily) with same auth
3. Retry windows via cron:
   - `+1 min`: `/api/internal/pipeline-run?retry=1`
   - `+5 min`: `/api/internal/pipeline-run?retry=2`
   - `+15 min`: `/api/internal/pipeline-run?retry=3`
4. `/api/internal/monitoring-check` (every 15 min) with same auth

## 2. Failure Handling

### Ingestion failure

- Check `pipeline_runs` latest `run_type=ingestion`.
- If source issue is transient, rerun `/api/internal/ingestion-run`.
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
- Inspect `line_alert_events` statuses (`pending|failed|skipped|sent`).
- Verify `line_subscriptions` preferences and watchlist filters.
- Check alert webhook status (`ALERT_WEBHOOK_URL`) if monitoring alerts are expected.

## 3. Night-Shift Research Runtime (ai-night-shift)

夜間研究排程由 `ai-night-shift` 依以下順序呼叫（需帶 `Authorization: Bearer $INTERNAL_API_KEY`）：

```bash
POST /api/internal/source-sync       { "connector": "investanchors" }
POST /api/internal/source-sync       { "connector": "threads" }
POST /api/internal/source-sync       { "connector": "instagram" }
POST /api/internal/source-sync       { "connector": "telegram" }
POST /api/internal/source-sync       { "connector": "ptt" }
POST /api/internal/source-sync       { "connector": "bulltalk" }
POST /api/internal/source-discovery
POST /api/internal/podcast-sync
POST /api/internal/podcast-transcribe
POST /api/internal/thesis-refresh
POST /api/internal/research-report-build
POST /api/internal/report-build
```

**Connector 狀態確認**：

- Threads/Instagram：需設定 `.env` 的 Meta session cookies（`sessionid`, `csrftoken` 等）。若未設定，connector 自動降級為 watchlist seed 模式，並在 `source_credentials_registry` 標記 `status=missing`。
- Telegram：需設定 `TELEGRAM_BOT_TOKEN`；公開頻道可透過 `t.me/s/{channel}` HTML 直接抓取，無需 Bot。若無 token，public channel 抓取仍可執行。
- Podcast sync：從 `kol_profiles` (approved) 的 `metadata.youtubeUrl` 抓播放清單，或試 RSS。
- Podcast transcribe：對 `transcript_status='pending'` 的 episode 嘗試取 YouTube 字幕；若取不到標記 `transcript_unavailable`。

**失敗檢查**：

- `connector_runs`：查 `status != 'success'` 且 `started_at >= now() - interval '1 day'`
- `source_audits`：查 `status = 'failed'` 找問題 URL
- `source_credentials_registry`：查 `status = 'invalid'` 確認 cookie/token 是否過期

## 4. Freshness Gate Policy

- Critical inputs: `market_snapshots`, `stock_signals`.
- Threshold: 1 hour (`SIGNAL_FRESHNESS_THRESHOLD_SECONDS=3600`).
- If stale: set recommendation `is_blocked=true`, keep `block_reason`, and keep `published_at` null.

## 4. Suggested Monitoring Queries

- Pending line events:
  - `select count(*) from line_alert_events where delivery_status='pending';`
- Failed line events today:
  - `select id,event_type,payload->'dispatch_result' as dispatch_result from line_alert_events where created_at >= now() - interval '1 day' and delivery_status='failed';`
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
- Optional mutating smoke gate:
  - `OPSX_MUTATING_SMOKE=true npm run opsx:test`
