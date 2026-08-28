# StockInsider Operations Runbook

> Sections 1–5 document the legacy V1/V2 runtime only. They are not an
> activation procedure for V3.14. In particular, cookie, login-wall,
> watchlist-seed and public mutating-endpoint workflows below must not be used
> to claim V3.14 source acquisition success.

## V3.14 reviewed release and activation

V3.14 is installed only from one clean exact-reviewed commit plus its direct-child
attestation commit. Repository-owner authority for Web deployment, additive
migration, tracked runtime, credentials and source writes is recorded in the Loop
status. V3 activation, LINE/dispatch, automatic trading and ranking promotion remain
unauthorized.

The previously exposed database password has already been rotated. Do not rotate it
again for this release. The tracked producer and doctor use the Supabase HTTPS REST
boundary, so store only `stockinsider-runtime:supabase-url` and
`stockinsider-runtime:supabase-service-role-key` in Keychain. Never print either
value. Record the current Vercel alias, runtime active pointer, scheduler plist hash
and database migration plan as rollback targets.

The pre-activation sequence is:

```bash
npm ci
npm --prefix web ci
npm run diagnostic:source-led-opportunity-v3:product-runtime
npm run verify:source-led-opportunity-v3:model-runner
npm run db:v3:plan
npm run agent:runtime:prepare -- --source-commit <reviewed-40-hex-commit>
```

`db:v3:plan` and `agent:runtime:prepare` are read-only. The plan must list base,
V3.12, V3.13, V3.14 and V3.15 in that order and report `applyAuthorized:true`. After the
exact review attestation exists, apply only through:

```bash
npm run db:v3:apply-reviewed -- \
  --source-commit <reviewed-commit> \
  --attestation-commit <direct-child-attestation-commit>
```

The command requires a clean exact HEAD, a valid review attestation, the recorded
V3.14 migration authority and the Keychain database reference. It acquires one
database advisory lock, accepts additive migrations only, applies the reviewed
five-file chain and verifies the V3.15 REST bridge without logging connection details.
Additive objects are retained on rollback.

The tracked worker accepts only these credential references; raw credential
environment variables are not the V3.14 contract:

- `STOCKINSIDER_SUPABASE_URL_REF=keychain:stockinsider-runtime:supabase-url`
- `STOCKINSIDER_SUPABASE_SERVICE_ROLE_KEY_REF=keychain:stockinsider-runtime:supabase-service-role-key`
- `INTERNAL_API_KEY_REF=keychain:stockinsider-runtime:internal-api-key`
- optional Keychain references for `threads-access-token`, `youtube-api-key`
  and `youtube-oauth-token`, resolved by the tracked credential resolver.

Every one of the 17 approved profiles must terminate all five connector
attempts (`threads`, `podcast`, `youtube`, `telegram`, `investanchors`), producing
exactly 85 attempt rows. Only KOL-authorized material may nominate a candidate:
official exchange data enriches and vetoes it but never creates one. Telegram is
limited to public `t.me/s/...` channels; InvestAnchors accepts only an authorized,
bounded structured claim and never stores member article text.
Allowed terminal statuses are `items_found`, `successful_empty`,
`metadata_only`, `missing_endpoint`, `auth_failed`, and `provider_failed`.
Threads uses the Meta OAuth keyword-search endpoint; Podcast uses an approved
RSS origin and creator-provided `podcast:transcript`; YouTube uses the official
Data/Captions APIs. Metadata alone is never transcript evidence.

Prepare and install the tracked runtime from the same reviewed commit. Before the
production Web build, set these existing-project Production values to the exact
release tuple (never to a branch name or `VERCEL_GIT_COMMIT_SHA`):

- `STOCKINSIDER_REVIEWED_RELEASE_SHA=<reviewed-commit>`
- `STOCKINSIDER_RUNTIME_MANIFEST_SHA256=<prepared-runtime-manifest-sha256>`

Deploy the same reviewed commit, activate the tracked scheduler, then run the
producer twice. Both runs must terminate successfully; the second must prove
no-change idempotency. Action authority remains disabled until the projection is
`legacy-radar-v3.20.0`, producer commit and runtime manifest exactly match the two
Web values, migration level is `kol-first-runtime-recovery-v3.20`, and freshness is `fresh`.
Inspect the 17×5 terminal matrix and KOL-nomination coverage waterfall. Missing OAuth is
an honest `auth_failed`, never a synthesized success.

On any smoke failure, stop the scheduler, restore the prior runtime pointer/plist and
Vercel alias, and keep additive database objects. Do not trigger LINE, dispatch,
ingestion, pipeline or ranking promotion during smoke.

## 1. Daily Job Sequence

1. Apply reviewed legacy migrations when schema changes:
   - `npm run db:migrate` (closed legacy allowlist; never applies V3-family migrations)
   - V3 changes require `npm run db:v3:plan`, an exact reviewed chain and separate production authority.
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

## 3. Legacy Night-Shift Research Runtime (ai-night-shift; not V3.13)

以下是舊系統排程，只供 V1/V2 維護；不得用於 V3.13 acquisition、shadow 或 promotion 證據。
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
