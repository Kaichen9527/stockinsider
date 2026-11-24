# 大型素材與 GPU 執行契約

v6.6 · 2026-11-23。這份通用契約隨本案套件提供，沿原任務與狀態入口使用；不建立第二份待辦清單，也不表示雲端服務或協調器已安裝。

## 範圍與來源

承接本案已授權的素材保存、運算與交接範圍；由 Agent 完成可執行的準備，只在真正缺少登入同意、來源或重要決策時提問。

先讀原規格、task／revision、驗收條件、既有記憶、有效證據及剩餘預算。固定程式／notebook 版本、輸入 manifest、模型／依賴版本及參數；依原前沿執行，不能因新 GPU 擴張產品範圍。

實際私人資產資料夾由已授權的私人設定解析；公開套件不含帳戶身份、私人 Drive IDs、服務端點或其他專案資料。查到既有綁定就沿用，不反覆建立同名資料夾。

## 資產保存與容量

程式、設定、notebook、決策與小型 manifest 留在原版本庫；大型原件、候選與必要 checkpoint 存在指定資產倉庫。共用不可變模型按版本、雜湊與授權索引，各案引用；可變輸出按 run 隔離。

每個資產記錄：task／revision、asset ID、實際檔案 ID、SHA-256、位元組大小、內容版本、來源／授權、候選或已接受狀態及核驗時間。索引由單一整合者更新。

分別量來源主機、下載／解壓、運算 scratch、雲端目的地的空間；每個寫入卷都須滿足「新增峰值＋原保留量」。峰值包含同時存在的封包、展開內容、中間檔與上傳暫存；帳戶總容量不等於剩餘容量，也不擴大 VM 磁碟或 VRAM。

只取本輪必要素材。大量小檔以有界封包傳送、在執行主機解開；不要把即時 Git 工作樹、資料庫、build／依賴 cache 或大量生成中的 frames 放在 Drive 掛載／同步目錄。

先複製，再核對上傳完成、大小及內容雜湊，最後更新 manifest。未知結果先查同一 operation／upload／file，依原有限重試處理，不重複建立工作或假定成功。

不能刪唯一原件換空間；上傳授權不等於清除原件授權。保存失敗標 `checkpoint_pending` 並保留唯一來源，停止超出預算的重型輸出。

使用者 Mac 容量不足時，依自身專案清理 → iCloud → 已驗掛載外接碟 → 私人設定指定的 Google Drive 評估；不是每次都搬完四階段。iCloud 僅使用已完整上傳且可還原的冷素材／封存，以受支援的移除下載釋放本機副本；不做同步刪除。未接上的磁碟不算容量，Drive 帳號須核對指定身份與剩餘 quota，不默認改用別的帳號。清理專用情境量測後結束，不因此啟動 GPU／開發。詳細條件讀 project-storage-guard 的 mac-capacity-recovery 參考。

## 有限 GPU 工作

2026-11-22 的[台灣 Google AI Pro 官方方案](https://one.google.com/intl/zh-TW_tw/about/google-ai-plans/)列出每月 200 Colab 運算單元；實際帳戶權益、剩餘單位、GPU 型號與 VRAM 仍須當場核實。以同一帳戶查看 Colab Settings → Subscription，分開記錄儲存、運算單元及其他服務點數。

先用一個代表樣本或仍有效的既有量測，取得耗時、峰值記憶體、暫存、輸出量與單位消耗，再決定本輪數量。設定輸入／輸出、影格或音訊長度、時間、日誌及重試上限，保留原更嚴限制。

使用可中斷的 notebook 批次；GPU／runtime 持續性不保證，不用 keepalive、帳戶輪換或無限重連規避配額。依實際方案與政策使用遠端控制／WebUI，不能把一般 notebook 當作全天候服務。

每個有效切片保存真正的成果與可恢復 checkpoint，再接原 scope 內的下一項。只有 notebook 存檔不能證明影片、權重、運算記憶體或訓練狀態已保存；只對實際匯出並可還原的狀態宣稱可續跑。

中斷後先查舊程序與最後核驗成果，僅接續未完成部分；沿同 task／revision、attempts、失敗指紋與原 deadline。原程序不可達時將未觀測內容標 UNKNOWN，不直接重開重複作業。

## 分工與寫入權

Coordinator 定義輸入、輸出、責任與 Gate；writer 或 GPU worker 產出候選；reviewer 審固定內容；單一 integrator 更新共同狀態並採用成果。這是角色／SOP，不代表另有框架常駐運行。

任何寫入或恢復後的副作用前，重新核實真 host、resolved path、舊 writer／子程序、當前 lease 與共享資源。相同路徑及同主機父子路徑重疊都須處理；不同 worktree 仍須隔離可變輸出。

確認舊 writer 停止並保全 WIP，再取得本輪唯一寫入權。租約過期與模型額度用盡不代表程序停止；未接入的 IDE 不受合作式網站租約強制攔截。

## 收據與後續接入

沿原 tracker／memory 保存固定候選、資產 IDs／hashes、已驗／未驗、累計嘗試與消耗、剩餘預算及下一動作。小型來源／紀錄依授權 push 並讀回 SHA；大型成果以真資產收據連結，避免重複完整輸出。

實際開始、進展、受阻或停止才回報已連線的狀態服務。候選仍須原產品、人類、資料與發布 Gate；GPU 完成或上傳成功都不能替代驗收。

未來可接入薄層狀態協調器、持久 checkpoint 與各供應商 SDK／CLI／API adapter；重播須冪等且重核所有權。未完成一個真實的啟動→保存→交接流程前，明列未接入，不宣稱自動切模型、跨 IDE 控制或背景同步。

官方操作邊界：[Colab FAQ](https://research.google.com/colaboratory/faq.html)、[Drive 檔案限制](https://support.google.com/drive/answer/37603?hl=en)、[Drive 續傳](https://developers.google.com/workspace/drive/api/guides/manage-uploads)。實際設定前核對相關版本及帳戶適用條件。
