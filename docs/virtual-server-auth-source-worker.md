# Virtual Server 全量回補 + Auth Source Worker 歷史方案

> **不是目前正式 runtime 的授權安裝路徑。** 本文描述 V3.11 前的 Linux
> worker，不得從 mutable checkout 安裝或啟用現在的 producer。目前唯一可用的
> preparation 是 `npm run agent:runtime:prepare -- --source-commit <sha>
> --attestation-commit <sha>`；正式 activation 仍須另行取得 platform scheduler、
> rollback package 與 doctor 的 production authority。

這份文件是給 Linux Virtual Server 用的。

目標：

1. 先做一次完整資料回補，重抓 `threads / investanchors / instagram / telegram / podcast / thesis / report`
2. 再把 Threads、定錨、KOL、discovery 更新改成 `systemd` 常駐 worker

本文假設：

- 專案目錄：`/opt/stockinsider/StockInsider`
- Node.js 20+
- Linux 發行版支援 `systemd`
- `.env` 已準備好 `SUPABASE_* / INTERNAL_API_KEY / THREADS_* / INVESTANCHORS_*`

## 1. 前置準備

```bash
sudo mkdir -p /opt/stockinsider
cd /opt/stockinsider

# 如果你是 git clone
git clone <YOUR_REPO_URL> StockInsider
cd /opt/stockinsider/StockInsider

# 或者你已經把 repo 放上去，就直接 cd 進來
pwd
```

確認必要環境：

```bash
node -v
npm -v
python3 --version
systemctl --version
```

建議至少：

- `node >= 20`
- `npm >= 10`
- `python >= 3.9`

## 2. 準備 `.env`

```bash
cd /opt/stockinsider/StockInsider
cp .env.example .env
```

至少要填：

```bash
APP_ENV=production
DATA_MODE=live

SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_PROJECT_REF=...
SUPABASE_DB_HOST=...
SUPABASE_DB_PASSWORD=...
SUPABASE_DB_USER=...
SUPABASE_DB_PORT=6543
SUPABASE_DB_NAME=postgres
SUPABASE_DB_DATABASE=postgres

INTERNAL_API_KEY=...
CRON_SECRET=...

THREADS_USERNAME=...
THREADS_PASSWORD=...
THREADS_SESSION_STATE=/opt/stockinsider/StockInsider/.agent/vendor/threads-session.json

INVESTANCHORS_ACCOUNT=...
INVESTANCHORS_PASSWORD=...

TELEGRAM_BOT_TOKEN=...
OPENROUTER_API_KEY=...
OPENAI_API_KEY=...

SOURCE_WORKER_SYMBOLS=2454,2379,2337
THREADS_STOCK_REFRESH_INTERVAL_MINUTES=45
INVESTANCHORS_STOCK_REFRESH_INTERVAL_MINUTES=180
KOL_CONTENT_REFRESH_INTERVAL_MINUTES=240
INDUSTRY_DISCOVERY_REFRESH_INTERVAL_MINUTES=240
AUTH_SOURCE_WORKER_POLL_SECONDS=60
```

重要注意事項：

- `THREADS_*` 請用 namespaced 設定，不要只靠 legacy `sessionid / csrftoken`
- `THREADS_SESSION_STATE` 建議固定指定，避免不同 runtime 用到不同相對路徑
- 如果 `.env` 裡還保留 legacy Meta cookies，health-check 會顯示 warning；這不會擋住流程，但要知道現在 Threads auth 仍可能受 Meta 反自動化影響

## 3. 安裝依賴

```bash
cd /opt/stockinsider/StockInsider
npm install

cd web
npm install
cd ..
```

如果你要跑 scraper test 或部分 Python 流程，也一起準備：

```bash
python3 -m venv scraper/venv
source scraper/venv/bin/activate
pip install -r scraper/requirements.txt
deactivate
```

## 4. Database verify

```bash
cd /opt/stockinsider/StockInsider
set -a
source .env
set +a

npm run db:migrate
npm run db:verify
```

## 5. 建立 production build

```bash
cd /opt/stockinsider/StockInsider/web
set -a
source ../.env
set +a

npm run build
```

## 6. 建立 `stockinsider-web.service`

建立 service：

```bash
sudo tee /etc/systemd/system/stockinsider-web.service >/dev/null <<'EOF'
[Unit]
Description=StockInsider Next.js Web
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/stockinsider/StockInsider/web
EnvironmentFile=/opt/stockinsider/StockInsider/.env
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/env bash -lc 'npm run start -- --port ${PORT:-3000}'
Restart=always
RestartSec=5
TimeoutStartSec=120

[Install]
WantedBy=multi-user.target
EOF
```

啟用與啟動：

```bash
sudo systemctl daemon-reload
sudo systemctl enable stockinsider-web
sudo systemctl restart stockinsider-web
sudo systemctl status stockinsider-web --no-pager
```

確認 health-check：

```bash
curl -sS http://127.0.0.1:3000/api/internal/health-check | python3 -m json.tool
```

你要看到至少：

- `ok = true`
- `dataMode = live`
- `fallbackUsed = false`
- `env.SUPABASE_URL = true`
- `env.SUPABASE_SERVICE_KEY = true`

## 7. 一次性全量回補

先載入變數：

```bash
cd /opt/stockinsider/StockInsider
set -a
source .env
set +a

export BASE_URL="http://127.0.0.1:3000"
export AUTH_TOKEN="${INTERNAL_API_KEY}"
```

### 7.1 先做 Threads auth debug

先清掉舊 session：

```bash
rm -f .agent/vendor/threads-session.json
```

跑 auth debug：

```bash
curl -sS -X POST "${BASE_URL}/api/internal/threads-auth-debug" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  --data '{"forceLogin":true,"ignoreFallbackCookies":true,"persistOnSuccess":true}' \
  | python3 -m json.tool
```

理想結果：

- `sessionModeAfter = fresh_login`
- `hasSessionFile = true`
- `validatedSearch = true`
- `validatedAuthorPage = true`

如果 Threads auth 失敗：

- 不要中止整輪回補
- 把它視為 `Threads degraded`
- 紀錄 `failureReason`
- 繼續跑其他 connector

### 7.2 逐一跑 source-sync

```bash
for connector in \
  investanchors \
  threads \
  instagram \
  telegram \
  ptt \
  bulltalk \
  googlenews \
  anue \
  udn \
  mobile01 \
  twse_insider
do
  echo "=== source-sync:${connector} ==="
  curl -sS -X POST "${BASE_URL}/api/internal/source-sync" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${AUTH_TOKEN}" \
    --data "{\"connector\":\"${connector}\",\"dryRun\":false}" \
    | python3 -m json.tool
done
```

Threads 觀察重點：

- `sessionMode`
- `matchedDirectHits`
- `matchedIndustryHits`
- `degradedReason`

定錨觀察重點：

- `errorCode = symbol_search_no_hit` 視為無命中，不是站點壞掉
- 不應再是 timeout

### 7.3 跑 podcast / discovery / story / thesis / report

```bash
for route in \
  podcast-sync \
  podcast-transcribe \
  source-discovery \
  theme-scan \
  story-scan \
  story-verify \
  thesis-refresh \
  thesis-rank \
  research-report-build \
  report-build
do
  echo "=== ${route} ==="
  curl -sS -X POST "${BASE_URL}/api/internal/${route}" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${AUTH_TOKEN}" \
    --data '{"dryRun":false}' \
    | python3 -m json.tool
done
```

## 8. 建立 `stockinsider-auth-source-worker.service`

建立 service：

```bash
sudo tee /etc/systemd/system/stockinsider-auth-source-worker.service >/dev/null <<'EOF'
[Unit]
Description=StockInsider Auth Source Worker
After=network.target stockinsider-web.service
Requires=stockinsider-web.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/stockinsider/StockInsider
EnvironmentFile=/opt/stockinsider/StockInsider/.env
ExecStart=/usr/bin/env bash -lc 'npm run worker:auth-sources'
Restart=always
RestartSec=10
TimeoutStartSec=120

[Install]
WantedBy=multi-user.target
EOF
```

啟用與啟動：

```bash
sudo systemctl daemon-reload
sudo systemctl enable stockinsider-auth-source-worker
sudo systemctl restart stockinsider-auth-source-worker
sudo systemctl status stockinsider-auth-source-worker --no-pager
```

## 9. 驗證常駐 worker

看即時 log：

```bash
journalctl -u stockinsider-auth-source-worker -f
```

預期會看到這四類 job 輪流執行：

- `threads-stock-refresh`
- `investanchors-stock-refresh`
- `kol-content-refresh`
- `industry-discovery-refresh`

也可以看 web：

```bash
journalctl -u stockinsider-web -f
```

## 10. 驗證 API 與頁面

```bash
curl -sS "${BASE_URL}/api/radar/daily" | python3 -m json.tool | sed -n '1,120p'
curl -sS "${BASE_URL}/api/stocks/2337/deep-dive" | python3 -m json.tool | sed -n '1,200p'
```

至少確認：

- `/api/radar/daily` 可讀
- `/api/stocks/2337/deep-dive` 可讀
- deep-dive payload 有 `targetSnapshot` / `reportSnapshot`

## 11. 常見排錯

### 11.1 Threads auth 失敗

先看：

```bash
curl -sS -X POST "${BASE_URL}/api/internal/threads-auth-debug" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  --data '{"forceLogin":true,"ignoreFallbackCookies":true,"persistOnSuccess":true}' \
  | python3 -m json.tool
```

重點欄位：

- `loginStage`
- `failureReason`
- `hasSessionFile`
- `validatedSearch`
- `validatedAuthorPage`

如果看到：

- `invalid_credentials`
  - 檢查 `THREADS_USERNAME / THREADS_PASSWORD`
- `home_page_still_login_wall`
  - Meta/Threads 端仍擋 web session，先視為 degraded
- `rate_limited`
  - 等一段時間再重跑

### 11.2 定錨沒有資料

若回：

- `symbol_search_no_hit`
  - 表示這次沒直接命中，不代表壞掉
- timeout 或 500
  - 看 `journalctl -u stockinsider-web -f`

### 11.3 worker 沒有動

先確認：

```bash
systemctl status stockinsider-web --no-pager
systemctl status stockinsider-auth-source-worker --no-pager
```

如果 worker 起來但沒成功：

```bash
journalctl -u stockinsider-auth-source-worker -n 200 --no-pager
```

### 11.4 手動單次跑 worker smoke

```bash
cd /opt/stockinsider/StockInsider
set -a
source .env
set +a

npm run worker:auth-sources:once
```

### 11.5 只看 worker payload 不真的送 API

```bash
cd /opt/stockinsider/StockInsider
set -a
source .env
set +a

npm run worker:auth-sources:dry
```

## 12. 建議日常操作

### 重新部署 web

```bash
cd /opt/stockinsider/StockInsider
git pull

cd web
npm install
npm run build
cd ..

sudo systemctl restart stockinsider-web
```

### 重新跑一次完整回補

照著第 7 節再跑一次。

### 只重跑 Threads auth

照著第 7.1 節重跑。
