進度室：使用本次私人指令或個人設定中的入口。

# StockInsider｜本案採用材料

**v6.6 · projectId=stockinsider**  
原進度入口：`GitHub Issues #385 and linked tracker`。

## 使用者怎麼開始？

在進度室選本案 →「開始與交接」→ 選目前情境和工具，再貼一份完整指令。離線總包解壓在產品專案外；不用手動搬 kit、執行 Python 或填路徑。

一般選「接手／接續專案」，停止一半用「中斷續作／補完待辦」；規劃、容量整理、需求變更與驗收各用對應情境。多 IDE 選共同協作後再選統籌／分工／唯讀驗收。只升版不開產品工作選「只更新規則」。另一位 writer 正在工作時，交原 owner 採用，不由新對話改他的資料夾。

## 當班 Agent 的採用契約

生成 kit 含 `install.py`、`manifest.json`、`workspace_probe.py`、`payload/`。先核本案、真 Git root、原規則、WIP、舊 writer 與必要資源。取得相應所有權後 preview；相容才 apply，再讀回 hash。相同內容跳過，v6.1～v6.5 官方 baseline 只允許精確匹配檔案升版；自訂差異保留並做有限合併，不刪原檔硬裝。

採用位置仍是 `.agents/skills/` 與 `docs/delivery-v6/`；Claude 使用兩個同源相對入口。八種情境與四種工具存於 `docs/delivery-v6/scenarios/`，五種相容模式仍在 `docs/delivery-v6/modes/`。唯讀 reviewer 不執行產品內 installer；joining worker 先取得其分派的隔離工作樹，不能先在原 writer 目錄做設定寫入。

私人 Hub 只保留一份 core；本目錄只有 README 時，由 Agent 使用 builder 的單案模式準備外部 kit。尚非 Git 的來源先依原授權保全並核實正確 repo；保存受阻維持 checkpoint_pending，不以登記冒充備份。

## 更新後還要明確讀取

共用 Skill 更新不會自動修改這個 repo 或其他主機。採用後在目前對話明確重讀 delivery、storage 及本次相關 references；原 state entry 留來源版本、實際 hash、採用／合併／延後與載入時間。看見目錄或版本字樣不等於已載入；一個工作區成功不代表其他工作區也完成。

## 續作與並行

續作／中斷復原／協作統籌情境每個 checkpoint 接下一張已批准且依賴滿足的卡；單卡受阻時仍做其他可行工作。保留原 scope、期限、累計嘗試、預算與驗收。停止時記真原因、已保存候選、剩餘可行卡與下一動作；分工者交回固定候選後，統籌者繼續整案。

多 writer 必須不同卡、獨立 worktree／branch、分開修改範圍與資源；同一卡可有唯讀分析／QA。一位協調者維護共同 state 並在交回後整合；網站協作檢查不等於 OS 寫入鎖，也不會自動換供應商。原生 Goal 僅在真 client 支援且仍有原預算時使用。

**本案原門檻：** 沿 Issue #385 與 linked tracker；保留原 review／CI HOLD，不自動部署。公開 repo 僅採用本案可公開規則。

大型素材依本案受保護資產設定與 `docs/delivery-v6/ASSETS_AND_COMPUTE_ZH.md` 取必要批次；上傳後讀回核對才記完成。完整總包、私人端點、Drive 綁定、他案 profile 與私有收據留在產品外。這份材料不證明已採用、已連線、產品開工或素材已搬移。

Mac 容量不足依序評估本案可重建輸出、iCloud、已驗外接碟、指定 Drive。單獨容量整理不啟動開發；恢復原任務的容量阻塞才接回原卡。私有帳號綁定只從受保護設定取得。
