# StockInsider

StockInsider 是一個以 Supabase + Next.js + Python pipeline 為核心的投資訊號與提醒系統。
主要流程：

`ingestion -> recommendation -> line-dispatch`

- `ingestion`：寫入 `market_snapshots` / `stock_signals` / `institutional_signals` / `social_signals`
- `recommendation`：產生 `recommendations` 與 `strategy_actions`
- `line-dispatch`：依訂閱偏好派送 LINE 事件（`sent|failed|skipped`）

## 1. 先決條件

- Node.js 20+
- npm 10+
- Python 3.9+
- Supabase 專案（含 Service Role Key）
- LINE Messaging API Channel
- (選配) Vercel for deployment

## 2. 環境變數

複製範本：

```bash
cp .env.example .env
```

### Required（blocking）

- `APP_ENV`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_PROJECT_REF` 或 `SUPABASE_DB_HOST`
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_DB_USER`
- `SUPABASE_DB_PORT`
- `SUPABASE_DB_NAME` / `SUPABASE_DB_DATABASE`
- `LINE_CHANNEL_SECRET`
- `LINE_CHANNEL_ACCESS_TOKEN`
- `INTERNAL_API_KEY`
- `CRON_SECRET`
- `SIGNAL_FRESHNESS_THRESHOLD_SECONDS`

### Optional（non-blocking）

- `ALERT_WEBHOOK_URL`
- `OPENROUTER_API_KEY`
- `PREFECT_API_URL`
- `OPSX_MUTATING_SMOKE`

### 變數用途

- `INTERNAL_API_KEY` / `CRON_SECRET`：保護 `/api/internal/*` 端點
- `OPSX_MUTATING_SMOKE=true`：讓 `opsx:test` 額外跑 non-dry-run smoke

## 3. 安裝依賴

```bash
# root
npm install

# web
cd web
npm install
cd ..

# python scraper
python3 -m venv scraper/venv
source scraper/venv/bin/activate
pip install -r scraper/requirements.txt
```

## 4. 資料庫初始化與驗證

```bash
set -a
source .env
set +a

npm run db:migrate
npm run db:verify
```

## 5. 本機啟動

### 5.1 建議：一鍵啟動 + 刷新 live 資料

```bash
cd /Users/kaerchen/Desktop/20_stock/StockInsider
PORT=3000 ./scripts/local-live-up.sh
```

- 若你要用其他 port（例如 3010）：

```bash
PORT=3010 ./scripts/local-live-up.sh
```

這個腳本會自動做：
- 載入 `.env` 並強制 `DATA_MODE=live`
- 啟動 `web` 開發伺服器
- 檢查 `/api/internal/health-check`（必須 `fallbackUsed=false`）
- 執行 `report-ingest -> thesis-refresh -> thesis-rank -> research-report-build`
- 驗證 `radar daily/hot/weekly` 為當日資料

### 5.2 手動啟動（進階）

```bash
cd /Users/kaerchen/Desktop/20_stock/StockInsider
set -a
source .env
set +a

cd web
npm run dev -- --port 3000
```

開啟 `http://localhost:3000`

如果你用 3010：

```bash
npm run dev -- --port 3010
```

排錯重點：
- 同一個 port 只能有一個 `next dev`；若 port 被舊程序佔用，會看到空白或舊資料。
- 檢查 `http://127.0.0.1:<PORT>/api/internal/health-check`：
  - `dataMode` 應為 `live`
  - `fallbackUsed` 應為 `false`
  - `env.SUPABASE_URL` / `env.SUPABASE_SERVICE_KEY` 應為 `true`

## 6. LINE Webhook 設定（Local + Production）

### Local（用 tunnel）

1. 啟動本機 server（上一節）
2. 開 tunnel（例如 ngrok）

```bash
ngrok http 3000
```

3. 取得 HTTPS URL，組成：

`https://<your-ngrok-domain>/api/webhook/line`

4. 到 LINE Developers Console（Messaging API）設定：
- Webhook URL
- 開啟 `Use webhook`
- 按 `Verify`

5. 在 LINE app 對 bot 測試：
- `/help`
- `/bind 2330,2454,NVDA`

### Production

- Webhook URL 指向 `https://<your-domain>/api/webhook/line`
- 確認 bot 已加好友、可接收訊息
- 先在 LINE app 發送 `/help`，讓 webhook 自動同步真實 `source.userId` 到訂閱表
- `line_user_id` 應為 `U` 開頭且長度 33（例如 `Uxxxxxxxx...`）

## 7. API 驗收指令

先載入環境與 token：

```bash
set -a
source .env
set +a

export BASE_URL="http://127.0.0.1:3000"  # production 改成正式網域
export AUTH_TOKEN="${INTERNAL_API_KEY:-$CRON_SECRET}"
```

### 7.1 綁定 LINE

```bash
curl -sS -X POST "$BASE_URL/api/line/bind" \
  -H "content-type: application/json" \
  -d '{
    "lineUserId":"<LINE_USER_ID>",
    "watchlist":["2330","2454","NVDA"],
    "eventPreferences":{"hit_target":true,"hit_stop_loss":true,"daily_digest":true},
    "digestEnabled":true,
    "throttleMinutes":30
  }'
```

### 7.2 ingestion

```bash
curl -sS -X POST "$BASE_URL/api/internal/ingestion-run" \
  -H "authorization: Bearer $AUTH_TOKEN" \
  -H "content-type: application/json" \
  -d '{"dryRun":false}'
```

### 7.3 pipeline

```bash
curl -sS -X POST "$BASE_URL/api/internal/pipeline-run" \
  -H "authorization: Bearer $AUTH_TOKEN" \
  -H "content-type: application/json" \
  -d '{"dryRun":false}'
```

### 7.4 line-dispatch

```bash
curl -sS -X POST "$BASE_URL/api/internal/line-dispatch" \
  -H "authorization: Bearer $AUTH_TOKEN" \
  -H "content-type: application/json" \
  -d '{"dryRun":false}'
```

### Dry-run 範本

將 `"dryRun":false` 改為 `true`。

### 7.5 line-diagnostics（只讀）

```bash
curl -sS "$BASE_URL/api/internal/line-diagnostics?hours=24" \
  -H "authorization: Bearer $AUTH_TOKEN"
```

## 8. Production 部署流程（direct production）

1. `npm run db:migrate`
2. `npm run db:verify`
3. 部署 web（Vercel）
4. 打 internal endpoints smoke（ingestion/pipeline/dispatch）
5. 驗證 LINE dispatch 至少一次 `sent >= 1`

Rollback 參考：`docs/release_note_template.md`

## 9. 監控與查核 SQL

```sql
-- 最近 pipeline runs
select run_type,status,started_at,finished_at,details
from pipeline_runs
order by started_at desc
limit 20;

-- LINE 事件
select id,event_type,delivery_status,sent_at,payload
from line_alert_events
order by created_at desc
limit 20;

-- blocked recommendations
select s.symbol, r.block_reason
from recommendations r
join stocks s on s.id=r.stock_id
where r.as_of=current_date and r.is_blocked=true;

-- source health
select source_key,parse_success_ratio,freshness_pass_rate,checked_at
from source_health_checks
order by checked_at desc
limit 50;
```

## 10. 測試與驗收指令

```bash
openspec validate --all
npm run test:scraper
cd web && npm run lint && npm run build && cd ..
npm run opsx:test:quick
npm run opsx:test
```

## 11. 故障排除

### LINE 400（Push Message）

常見原因：
- `line_user_id` 不是 LINE 實際 user id（通常為 `U...`）
- 使用者未加 bot 為好友或已封鎖
- channel token/secret 錯誤或過期

排查建議：
1. 在 LINE app 發送 `/help`，讓 webhook 自動把 `source.userId` 寫回 `line_subscriptions`
2. 再插入一筆 `pending` 事件重跑 dispatch
3. 檢查 `line_alert_events.payload.dispatch_result`：
   - `error_summary`（錯誤主因）
   - `errors[].status`（HTTP status）
   - `errors[].details`（LINE 回應內容）

### API 401

- 檢查 `authorization: Bearer $AUTH_TOKEN`
- 檢查 `INTERNAL_API_KEY` / `CRON_SECRET` 是否與部署環境一致

### DB verify 失敗

- 確認 DB 連線參數正確
- 重跑 migration
- 檢查 required tables/indexes 是否存在

### 本機無法監聽 port（EPERM）

- 通常是 sandbox/權限限制
- 改在本機 terminal 直接執行，或換可監聽環境
