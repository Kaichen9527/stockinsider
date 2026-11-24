# 本次工作方式：只更新規則

本次 executionMode=update_only。只取得本案新版材料、核對所有權、preview／相容 apply、讀回 hash 並在本對話明確重讀兩個 Skill 和必要 references；不開始產品任務或另啟 Goal。另一位 writer 活躍或不明時，將外部套件與具體 diff 準備好並標 adoption_deferred，交目前 owner 採用，不改他的工作樹。以原 state entry 留最小版本／loaded receipt；不把全站更新當八案均已採用。

---

[進度室](使用者私人 Site（來源由個人設定提供）)

# StockInsider｜只更新規則｜Claude

v6.6 · scenario=rules · projectId=stockinsider · client=claude

本案來源：https://github.com/Kaichen9527/stockinsider。原進度入口：`GitHub Issues #385 and linked tracker`。目標 root 由目前真正工作區核對，不請我填路徑。

本工具能力：先區分 Claude Code、具工具的 Claude 工作環境與純聊天。Code 核對目前 repo、CLAUDE／AGENTS 及 .claude/skills 同源入口，接線使用它自己的 MCP／已核實個人 profile，不依賴 codex CLI。當前若已是 writer 就沿原身份與有效 lease，不為修連線新增另一位 writer。純聊天無 coding host 時做可行協調並明列缺的執行入口，不假裝修改了 repo。

本輪只處理本案規則採用；原任務進度與產品功能不在本次修改範圍。

## 本次任務：只更新本案規則

取得這次來源版本，核對目前本案 kit／manifest 與已採用 provenance。只處理同版共用 Skill、必要參考、指令入口與最小採用收據；不改產品功能、不開始其他卡片或 Goal。

另一 writer 活躍或身分不明時，把套件與精確 diff 準備在產品外，標 adoption_deferred 交原 owner；不要為安裝搶工作樹。自己就是 owner 時沿原身份與有效工作權，preview／相容 apply 後讀回 hash。

保留既有 AGENTS／CLAUDE、自訂規則、tracker 與 WIP；自訂差異先最小合併，無法解消才提出具體選擇。官方同版內容相同就 no-op。完成後明確重讀本會話需要的規則，回報共用來源、本機採用、本會話載入及接線是否分別完成；不能說更新一案等於八案已全部更新。

## 共用核對：只服務本次情境

先遵守上方情境與角色的範圍、寫入限制及完成條件。規劃、容量整理、唯讀驗收、只更新規則各有終點，不因共用規則而開始全案開發。使用者已授權的同範圍工作直接執行；只問真正缺少的產品、成本、權限或不可逆選擇。

### 工作區、材料與版本

唯讀確認目前真正 workspace、Git origin／HEAD／dirty、適用 AGENTS／CLAUDE、原 tracker／memory、舊 writer 與子程序。歷史 branch、SHA、磁碟值只是定位；不 reset、clean 或切回歷史版本。最多核對本次給定解壓位置、repo 固定入口與已授權 Hub，不掃整個 Home／Desktop；每個來源最多一次取得及一次有新理由的修正重試。

使用同版總包／本案 kit，或交付來源定位指定的 Hub 固定 commit。需取 Hub 時先讀 AGENTS、registry 與本案入口，共用材料留在產品外；沒有預生成 kit 時依 tools/build_delivery_bundle.py 的實際介面產生單案套件。路徑與 ID 由真環境決定，不請使用者填佔位符。遠端 VM 不能把 Mac 的本地路徑當可讀位置。

讀 project-delivery-resume、project-storage-guard 及本案 profile；依 references/scenario-routing.md 只載入本情境所需參考。寫入前核實唯一 owner；已有 owner 沿同 session／run／task，不為升版新增 writer。worker 先取得真分派與獨立 worktree；reviewer 不安裝或改產品檔。別人的 writer 活躍／不明就唯讀準備，不能用租約過期代替停止證據。

有權限且本情境允許時，讀 manifest／install.py，preview 後相容 apply，精確升級 v6.1–v6.5；保留自訂規則、原 tracker、WIP 與相對入口。同版相同內容跳過；差異先讀 diff，不刪檔硬裝。採用後在本對話重讀兩個 Skill 與本情境參考，保存來源版本、本機實際 hash、本會話重讀及連線／owner 狀態。共用發布、本機採用與當前會話讀到分開記。

### 連線與真實狀態

依 references/client-connection.md 核對實際工具與私人設定。Claude 用自己的 MCP／既有 user-scope profile，不以缺 codex CLI 要求使用者換端；沿已驗 headersHelper，不輸出或保存憑證。端點取交付定位／受保護設定，OAuth metadata 存在不代表已認證。

已認證後先讀 Site schema，以同 host＋resolved path 沿用 workspace ID，必要時用 workspace_probe.py 有界探測並讀回。工具或認證缺失明列待完成，不造 ID／run／心跳。MCP 不可用時，只可沿已授權且核實的人工單 writer 流程工作；不能宣稱網站替未接入 IDE 鎖住 OS。實際開始／停止及真 child agent ID 才回報事件，安裝／盤點不冒充開發進度。

### 保存、資源與決策

保留原 task ID／revision、AC、累計失敗、deadline、剩餘預算、真機／provider／財務／資料／發布 Gate。同因失敗先診斷，無新證據不原樣重跑；換模型／worktree 不清零。共享 tracker 由統籌者更新，worker 回交候選與證據。子代理結束不等於產品驗收。

Mac 容量不足妨礙本次必要工作時，讀 storage Skill 的 references/mac-capacity-recovery.md，依序評估自身專案可重建輸出 → iCloud → 已驗外接碟 → 私人設定指定的 Google Drive。每步重測，夠用即停止搬動；不適合／未掛載／認證缺失就記原因移往下一步。全主機並行峰值＋reserve 要合格，低容量 Mac 同時一個重型工作。雲端容量不是本機建置空間，活躍 repo／DB 不移進同步目錄。單獨整理模式整理完就停；原任務因容量暫停時，解除阻塞才接回原卡。

只保存本案必要小型來源、規格、決策、短收據；大型素材／模型用已驗資產位置及 manifest。公開 repo 不帶私人 Hub／Site／Drive 帳號、端點與他案資料。按原授權提交所擁有檔案並 push／讀回 SHA；未推就明示 checkpoint_pending。交接前保全唯一 WIP、確認自己子程序停止再釋放工作權；額度用完不等於舊程序已停。

回報精簡：成果、原卡／固定候選、已驗與未驗、採用／連線、停止原因及下一動作。需求可在目前 ChatRoom 說，由 Agent 保存回原 authority，不要求使用者重抄另一張表。
