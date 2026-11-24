進度室：使用本次私人指令或個人設定中的入口。

# StockInsider｜接手／接續專案｜Antigravity

v6.6 · scenario=resume · projectId=stockinsider · client=antigravity

本案來源：https://github.com/Kaichen9527/stockinsider。原進度入口：`GitHub Issues #385 and linked tracker`。目標 root 由目前真正工作區核對，不請我填路徑。

本工具能力：核實本機 IDE、Remote Agent 或 Remote Control 的真正執行主機、workspace、終端、Git 與 MCP 能力。遠端不繼承本機檔案／登入／Skill；依實際可讀材料採用同版規則，不自稱已接管其他 IDE 的會話。

本案邊界與歷史定位（開工核最新狀態）：先保全唯一來源包和未推 WIP，沿 Issue #385 與 linked tracker 有限解除移交缺件；保留原 review／CI HOLD，不自動部署。public repo 不帶私人 Hub／Site 端點、他案資料或私有收據。

## 本次任務：接手或接續半成品

這次請接續原已批准範圍，不重開全產品規劃。先用通常 10–20 分鐘內的有界盤點，讀最新原 tracker／memory、來源／候選、WIP、已驗證據、未完成依賴與目前 owner。無法讀取的事實標 UNKNOWN。

將真實完成、未完成、卡點及下一張可做卡簡短說明。使用者已指示接續或同範圍已批准，就直接依原預算執行；只就欠缺的實質決策提問，不要求再批准一次已授權續作。換模型先查舊 writer 與子程序已停及 checkpoint，再按正常交接取得工作權。

沿原 task ID 與 AC 做第一個可觀察切片，按需派真實需求／UIUX／開發／QA 子代理。每個有效 checkpoint 後重新選下一張依賴就緒的卡，持續到原有限 scope 完成或真停止條件；一張外部等待不阻止其他獨立卡。保留已通過證據，不重做完成項。

需要跨回合時先檢查既有 Goal 與實際原生能力，沿用相容者及原 deadline／attempt ledger；普通文字不代表已啟動 Goal。有效停止理由為 scope_done、all_frontiers_blocked、budget_reached、ownership_unresolved、provider_or_runtime_error 或 user_pause。停止前保存可接手 checkpoint、剩餘可行卡及下一動作。

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
