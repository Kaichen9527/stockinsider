# Antigravity 接手與事件連線

查核：2026-11-22。Antigravity 是客戶端／執行平台，不是固定模型名稱。先辨識 App、CLI、IDE、SSH 自有 Linux host 或 Google-managed Remote Agents，再記實際 model、host、repo、tools 和授權。沒有觀測就用 unknown；不把 Gemini、Claude 或 Codex 平台與底層模型混為一欄。

## 共用規則與 Skill

App／CLI／IDE 的專案 Skill 共用 `.agents/skills/project-delivery-resume/SKILL.md`。根 `AGENTS.md` 放短入口與既有規則，Claude 使用 `.claude/skills` 的相對連結。不要複製四份會分岔的核心，也只安裝本案 profile，不將其他案資料裝進本repo。Antigravity rules 不向下遞迴找 workspace 子目錄；開正確 repository root。安裝完成後用實際 Customizations 或明確讀 SKILL.md 查核，不把 ZIP 附件當完成安裝。

五模式沿 `lifecycle-and-decisions.md`：new、resume、change、triage、closeout。既有半成品預設 resume；只核現有前沿與本次剩餘範圍，不重新 grill 整個已批產品。接續已確認的同一範圍不用再問一次。

## Site MCP

依本機官方設定，在現有 `.agents/mcp_config.json` 的 `mcpServers` 中合併一筆；不可覆蓋其他 entries。範例中的 URL 必須換成使用者批准的私有端點，且不要提交 token：

```json
{"mcpServers":{"delivery-office":{"serverUrl":"https://YOUR-PRIVATE-OFFICE/mcp"}}}
```

Antigravity remote MCP 使用 Streamable HTTP，支援具條件的 OAuth PKCE。依實際 OAuth 流程授權後先呼叫 `get_portfolio`；真讀成功才說已連線。端點存在、配置存在或別的 client 成功，不能證明此 client 相容。不得為相容性把私有 Site 改成公開。無 MCP 時透過同一 GitHub 狀態接力，明列 office telemetry pending，不阻塞其餘已授權產品工作。

## 有限事件回報，不強制續跑

官方 `.agents/hooks.json` 提供 SessionStart、PreToolUse、PostToolUse、PreInvocation、PostInvocation、Stop。payload 有 `conversationId`、`modelName` 等資訊；只有真正收到才能標為 observed。工具完成不是功能驗收，Stop 的 `fullyIdle=false` 也不是所有背景工作已結束。

觀測 adapter 僅送去敏短事件。不要回傳 Stop `decision: continue` 或 PostInvocation `force_continue` 來做「自動督促」，這會延長執行並可能重建本案的迴圈。既有 runner、attempt ledger、時間／輸出／磁碟限制優先。Hook 缺席或 collector 掉線時顯示未觀測，不能模擬活躍。

Site 事件的 provider 表示工具平台；本案 Antigravity 使用 `provider=antigravity`、`client=antigravity`。model 為實際回報值或 null。sessionId／agentId／runId 分別使用實際身分；同角色可有多個 run，但不得同時擁有同檔。讀實際 MCP schema 再傳 camelCase 欄位，不把通用概念 JSON 直接當可用 API。

## 分工與遠端界線

App 支援 SSH 到符合條件的 Linux host；先查版本、64-bit Linux、工具與隔離 dev 根目錄。這可以配合已授權 Contabo fallback，但仍要同卡、同 attempts、同研究時計與唯一 writer。子代理不承接父對話全文，委派必須帶 task/revision、AC、base SHA、owned files、依賴、驗證命令及停止條件；工具名以實際可用名稱為準，官方明載錯誤名稱可能使子代理卡住。

Google-managed Remote Agents 是不同環境。官方明列本機安裝的 MCP servers、plugins、skills 不直接可用；遠端可另外連 Marketplace plugins。不能推論本機 hook、自訂 MCP、外接磁碟或 SSH 設定已同步。先驗證遠端可讀 repo 內指令，否則以完整 Prompt 明示規則。未觀測的能力保留 unknown。

CLI 在本機／自有 host 可用 `agy -p "..." --output-format stream-json`；managed remote 目前不支援 print mode。不要複製這個命令到 remote 並反覆重試。原生 Antigravity 代理訊息能管理其原生團隊，不代表 Site 能喚醒任意 Codex／Claude 對話。

官方來源：

- https://antigravity.google/docs/skills
- https://antigravity.google/docs/rules
- https://antigravity.google/docs/mcp
- https://antigravity.google/docs/hooks
- https://antigravity.google/docs/subagents/
- https://antigravity.google/docs/ssh
- https://antigravity.google/docs/remote-agents/
- https://antigravity.google/docs/cli/headless/
