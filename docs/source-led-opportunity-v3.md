# Source-led Opportunity V3

V3 是獨立、唯讀、sizing-free 的 verified-change 影子研究面。它不會修改既有
V1/V2 推薦、排序或資料，也不會自行部署、套用 production migration、啟用排程或
把模型輸出帶入投資決策。

## 本機快速開始

需求：Node `22.14.0`（`.nvmrc`）、npm，以及 PostgreSQL 的 `initdb`、`pg_ctl`
與 `psql`。

```bash
npm ci
npm --prefix web ci
npm run v3:doctor
npm run v3:help
npm run db:v3:plan
npm run verify:source-led-opportunity-v3
```

`v3:doctor` 只輸出設定是否存在與 SHA-256，不輸出 secret。完整驗證會建立一次性
本機 PostgreSQL cluster，migration 套用兩次後驗證 catalog、RLS、grants、DAG 與
negative probes；完成後刪除暫存 cluster。它不會連 production。

## 環境契約

公開面預設 `disabled`。只有明確設定
`SOURCE_LED_OPPORTUNITY_V3=shadow` 才開放 `/opportunity-v3` 與其 read API。
`drain` 只允許既有 worker/status 收斂，不開放公開面。

Shadow 讀取還需要：

- `SUPABASE_URL`
- `OPPORTUNITY_V3_SUPABASE_PROJECT_REF`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPPORTUNITY_V3_SERVICE_ROLE_KEY_SHA256`

URL 必須精確對應 project ref；service-role key 必須符合預先核准的 SHA-256。
V3 使用獨立、fail-closed 的 server client，不會回退到公開 anon client。

## 操作者工作流

1. `npm run db:v3:plan` 固定 migration 路徑、bytes、hash 與 additive-only 結果。
2. `npm run db:v3:verify` 在 disposable PostgreSQL 驗證，不寫遠端。
3. `npm run v3:shadow:fixture` 驗證四種 mode 的空集合 DAG 都能正常收斂。
4. production migration、shadow scheduler、homepage promotion 各自需要新的明確授權。

## Reviewer 工作流

Review 與 Verification 必須依下列順序執行，不能以較早的 review 或另一條 track
代替：

1. 先確認 Requirements fresh review 為 `PASS`，且 P0/P1 為零。
2. 再做 Architecture fresh review；Requirements 未通過時不得開始。
3. 建立單一 implementation commit，記錄完整 40 字元 commit OID。
4. 只對該 OID 與其第一父提交做 diff review；禁止把後續 worktree 修補混入原 verdict。
5. 修完 review findings 並重新 build 後，才進 repair Verification Gate。
6. Verification 各 track 分開記錄 `pass|blocked|fail|not_run`。`blocked` 不等於
   `pass`，特別是尚未成熟的 evaluation cohort。

PR 可以在上述證據完成後建立，但本工作流不授權 merge、production migration、
scheduler 或正式部署。

## Readiness matrix

| Track | 本機命令 | 可通過的必要條件 | 目前不可借用的證據 |
|---|---|---|---|
| `product_runtime` | `npm run verify:source-led-opportunity-v3:product-runtime` | 型別、lint、case ledger、fresh PostgreSQL、production build 全綠 | evaluation 日期、runner host |
| `evaluation_governance` | `npm run verify:source-led-opportunity-v3:evaluation-governance` | 真實 252 日 roster、120 回測日期、20 個成熟 live 日期與所有 promotion conjunct | synthetic 日期、product-runtime 綠燈 |
| `model_runner` | `npm run verify:source-led-opportunity-v3:model-runner` | exact macOS/Node/Git/Codex host pin、隔離與 journal tests | Linux CI、product/evaluation 結果 |

## Operator diagnostics

所有診斷都必須使用 internal route 的 exact bearer，且只回傳 bounded、非秘密資訊：

- `POST /api/internal/opportunity-run`：建立或重用 attempt，回傳
  `runId`、`attemptRunId`、`status` 與 `statusRef`。
- `GET /api/internal/opportunity-run/status/{runId}`：只回傳 run status、
  failure code 與 canonical run ID；不回傳 owner token、payload 或原始證據。
- worker lease/heartbeat/failure 由 `/api/internal/opportunity-worker-v3` 管理；
  lease 逾期交由 reaper，操作者不應直接改資料列。

遇到問題時依序記錄 doctor JSON、migration plan hash、attempt ID、status/failure code
與三條 track 的獨立結果。若狀態為 `provider_unavailable`、elapsed cohort 不足或
production authority 未授予，下一步是等待/補齊外部證據，不是放寬 Gate。

已知 run 可用下列唯讀診斷：

```bash
OPPORTUNITY_V3_APP_URL=http://127.0.0.1:3000 \
OPPORTUNITY_V3_RUN_ID=00000000-0000-4000-8000-000000000000 \
INTERNAL_API_KEY='由 secret manager 注入' \
npm run v3:status
```

輸出只保留 run/status/failure/canonical ID 與下一步，不會列印 bearer。

## 安全的 request 範例

以下只示範 shape；請從 secret manager 注入 token，不要把 token 寫進 shell history
或文件：

```bash
curl --fail-with-body \
  -X POST \
  -H "Authorization: Bearer ${INTERNAL_API_KEY}" \
  -H "Content-Type: application/json" \
  --data '{"mode":"source_scan","sourceCutoff":"2026-07-24T08:00:00Z"}' \
  "http://127.0.0.1:3000/api/internal/opportunity-run"
```

`sourceCutoff` 必須是整秒且不可在未來。任意 query string、未知 member、錯誤 method
或錯誤 bearer 都 fail closed。human-authority routes 另需 role-bound signed
principal 與 nonce；不要用 begin route 的 bearer 取代簽章。

精確、closed 的 request/response schema bundle 可直接檢視：

```bash
npm run v3:schemas
```

human-authority request 必須簽署「實際傳送的同一組 body bytes」。以下範例不會輸出
HMAC key 或 bearer；`signed-request.json` 只包含衍生的 header：

```bash
printf '%s' \
  '{"sampleManifestId":"00000000-0000-4000-8000-000000000000","sampleId":"sample-001"}' \
  > /tmp/opportunity-v3-review.json

OPPORTUNITY_V3_PRINCIPAL_HMAC_KEY='由 secret manager 注入' \
npm run v3:sign-request -- \
  --path /api/internal/opportunity-link-audit-v3/reviewer-assignment \
  --key-id reviewer-key-01 \
  --principal-id 00000000-0000-4000-8000-000000000001 \
  --body-file /tmp/opportunity-v3-review.json \
  > /tmp/opportunity-v3-signed-request.json

curl --fail-with-body -X POST \
  -H "Authorization: Bearer ${INTERNAL_API_KEY}" \
  -H "Content-Type: application/json" \
  -H "x-stockinsider-key-id: $(jq -r '.headers[\"x-stockinsider-key-id\"]' /tmp/opportunity-v3-signed-request.json)" \
  -H "x-stockinsider-timestamp: $(jq -r '.headers[\"x-stockinsider-timestamp\"]' /tmp/opportunity-v3-signed-request.json)" \
  -H "x-stockinsider-nonce: $(jq -r '.headers[\"x-stockinsider-nonce\"]' /tmp/opportunity-v3-signed-request.json)" \
  -H "x-stockinsider-signature: $(jq -r '.headers[\"x-stockinsider-signature\"]' /tmp/opportunity-v3-signed-request.json)" \
  --data-binary @/tmp/opportunity-v3-review.json \
  "http://127.0.0.1:3000/api/internal/opportunity-link-audit-v3/reviewer-assignment"
```

請勿把 key、bearer、完整 principals registry 或含秘密的 shell history 寫入 evidence。

## Production boundary

正式環境可用性檢查僅能以 HTTP 讀取既有 URL/route。看到首頁 `200` 不代表 V3 已
部署；必須分別檢查 `/opportunity-v3` 與 `/api/opportunity-v3`。本次核准的
Vercel Web deployment 仍不授權 merge、套 migration、寫 principal bindings、
啟用排程或變更 `SOURCE_LED_OPPORTUNITY_V3`。

目前沒有提供會直接套用 V3 production migration 的 npm 指令；這是刻意的權限邊界。
通用的 `npm run db:migrate` 也會明確略過
`20260724_source_led_opportunity_engine_v3.sql`；未來若取得 production mutation 與
target pin 的獨立授權，必須另建專用 apply 路徑，不能解除這個通用指令的排除規則。

## 三條 Verification track

- `product_runtime`：domain、DB、API、UI、build 與 preview HTTP。
- `evaluation_governance`：point-in-time outcome/evaluation；需要真實時間成熟資料。
- `model_runner`：固定 macOS/Codex host 的隔離、journal、recovery 與 trusted Git。

三條 track 各自回報，不能互借 evidence。真實資料尚未成熟或尚未獲 production
authority 時，狀態必須是 `blocked`，不得視為 pass。
