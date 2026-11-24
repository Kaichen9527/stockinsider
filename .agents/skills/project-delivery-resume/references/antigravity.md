# Antigravity 接手與事件連線

查核：2026-11-22。Antigravity 是客戶端／執行平台，不是固定模型名稱。先辨識 App、CLI、IDE、SSH 自有 Linux host 或 Google-managed Remote Agents，再記實際 model、host、repo、tools 和授權。沒有觀測就用 unknown；不把 Gemini、Claude 或 Codex 平台與底層模型混為一欄。

## 共用規則與 Skill

App／CLI／IDE 的專案 Skill 共用 `.agents/skills/project-delivery-resume/SKILL.md`。根 `AGENTS.md` 放短入口與既有規則，Claude 使用 `.claude/skills` 的相對連結。不要複製四份會分岔的核心，也不要把其他專案 profile 都裝進每個 repo。Antigravity rules 不向下遞迴找 workspace 子目錄；開正確 repository root。安裝完成後用實際 Customizations 或明確讀 SKILL.md 查核，不把 ZIP 附件當完成安裝。

五模式沿 `lifecycle-and-decisions.md`：new、resume、change、triage、closeout。既有半成品預設 resume；只核現有前沿與本次剩餘範圍，不重新 grill 整個已批產品。接續已確認的同一範圍不用再問一次。

## Site MCP

先讀 `client-connection.md`，核對目前 App／IDE／CLI 版本與它真正載入的設定，不假定所有入口讀同一份檔。App 與舊 IDE 並存時，有界檢查個人 `~/.gemini/config/mcp_config.json` 及舊版 `~/.gemini/antigravity/mcp_config.json`；先解析 symlink／檔案身份，兩個名稱若指同一檔，只合併 canonical target 一次並保留連結。專案 `.agents/mcp_config.json` 只在該版本確實使用時檢查。既有同服務 entry 應重用；只對需要修正的 entry 做最小合併，保留其他 server 和有效選項，不另增重複連線。私人端點與認證留個人範圍，不提交產品 repo。

平台原生 plugin 的 `/mcp` 與外部 client 的服務認證入口可能不同。客戶端支援 Streamable HTTP／OAuth，不代表某個私人 Site 接受它的 OAuth token；不得把沒有認證的 `serverUrl` 當作已接通，也不能照抄 Claude 專屬的 `headersHelper` 設定。先驗證本 client 實際支持的傳輸與該服務認證方法，不為相容性改公開網站、偽造訪客身份或輪換憑證。

當服務採動態受保護認證，而本 client 沒有已核實的相容 header helper 時，使用私人交付材料中已檢查的 stdio bridge。個人 MCP entry 的 `command` 指向實際核對過的 Python，`args` 指向已安裝 bridge 的絕對路徑；移除該 entry 不再適用的 remote URL／header 欄位。bridge 在本機讀作業系統憑證庫並轉接固定、已授權的服務路由，秘密不能放在設定、argv、環境變數、repo 或 log。這是 MCP 傳輸橋接，不是產品 writer、常駐心跳或自動派工器；它不需要 Codex、Claude 或另一個 Antigravity CLI，App 正在運行但 CLI 不在 PATH 不是接線失敗。

配置改好後，讓目前 Antigravity 入口重新載入既有 server，先核對 `initialize`／`tools/list`，再由這個會話實際呼叫 `get_portfolio`、`get_workspace_coordination`。本機 bridge 檢查成功、另一 client 成功、已登記工作區與目前對話能使用工具是不同證據。沿真 host／realpath 重用既有 workspace；未驗結果保持 pending。沒有可用 MCP 時，沿原授權做獨立產品工作與 GitHub checkpoint，明列 office telemetry pending，不能用偽造事件填地圖。

修接線不更換 writer。現有會話沿原 session／run／task、WIP、原 tracker／memory、attempts、deadline、容量與平台／發布 Gate；有有效 lease 就核實／續租。先前未受租約保護的 writer 只能由本人在安全切片點核實後領第一份權利，不能由修連線的輔助會話代領或取得競爭 lease。技術修正沿既有授權，只有真正欠缺的帳權、成本或破壞性選擇才需人類處理。

## 有限事件回報，不強制續跑

官方 `.agents/hooks.json` 提供 SessionStart、PreToolUse、PostToolUse、PreInvocation、PostInvocation、Stop。payload 有 `conversationId`、`modelName` 等資訊；只有真正收到才能標為 observed。工具完成不是功能驗收，Stop 的 `fullyIdle=false` 也不是所有背景工作已結束。

觀測 adapter 僅送去敏短事件。不要回傳 Stop `decision: continue` 或 PostInvocation `force_continue` 來做「自動督促」，這會延長執行並可能重建本案的迴圈。既有 runner、attempt ledger、時間／輸出／磁碟限制優先。Hook 缺席或 collector 掉線時顯示未觀測，不能模擬活躍。

Site 事件的 provider 表示工具平台；本案 Antigravity 使用 `provider=antigravity`、`client=antigravity`。model 為實際回報值或 null。sessionId／agentId／runId 分別使用實際身分；同角色可有多個 run，但不得同時擁有同檔。讀實際 MCP schema 再傳 camelCase 欄位，不把通用概念 JSON 直接當可用 API。

傳輸橋接不會自動轉換 hooks。未實作並驗證 task binding、sequence、錯誤處理與 lease proof 的 mapper 前，使用本會話的明確真實回報。先取 portfolio 返回的 taskRevision 與既有 roleId；實際接續本段任務才發 `task_started`，事件 sequence 遞增，有 lease 時附有效 proof。`progress` 要有真 GitHub 證據；註冊、健康檢查與畫面開著不是工作進展。結束／等待如實回報，不回填未觀測的過去活動；office 的本案／全部專案篩選也不會產生活動。

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
