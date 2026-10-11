# 上線進度：2026-10-11 13:31 台灣時間

目前尚未完成正式上線。已修復可重現的問題並保存失敗資料，沒有繞過保護檢查。

| 範圍 | 最新可驗證成果 | 還缺什麼 |
|---|---|---|
| 一般 CI／打包 | PR359 舊 head e8c 的 product-runtime 與 diagnostic 成功；Linux 打包13/13。新版5e修正 umask 測試條件，Linux六檔81/81與6項PG案例通過，沒有弱化讀取器 | 完整Linux瀏覽器PCR尚未完成；保護gate尚未通過 |
| 原產品正確性 | Mac4ff155/155；Linux原147/155及8個失敗保留。exact5e獨立補跑6個原PG失敗案例6/6成功 | 完整Linux PCR尚未重跑，2個原瀏覽器失敗原因仍未證明；不能把局部補跑當整套通過 |
| 研究工作配額 | 真實雙連線 RR 反例重現；887修正9入口RC guard及函式屬性前置核對。maker21/21、獨立scoped CODE PASS、正常Mac build及Linux21/21成功 | 完整production安裝鏈整合；合成partial profile驗收不能代替正式安裝與發布審查 |
| 文章發布 | 隔離 guarded HTTP／PG94案例與斷線恢復已實作驗證 | 真實可信作者、獨立審查執行及友達／另一產業文章；synthetic fixture不算內容完成 |
| 正式部署 | 凍結整合51a、正式main169維持不動，VPS擴容已實測 | installer缺原17個publication migration加新isolation successor；完整受保護審查及runner信任復原 |
| 策略／排程 | 原模組與失敗紀錄保留 | 完整母體、樣本外／前瞻驗證、使用者批准確切策略、排程及五實際交易日驗收 |

先收斂正式安裝與完整審查兩個發布必要條件，並行完成真實內容交接。來源／候選程式與文章測試完成，不代表已讀完所有平台或已找到有效獲利策略。短期不新增框架。

精確代碼、原始RED、PASS及限制見本次receipt。PR359修補不能直接視為main發布批准；新增隔離修補以獨立PR接續。部署後只保留持久歷史、證據與帳本，無引用可重建暫存才清理，這次沒有新確認可刪VPS項目。


## 工程接續狀態（2026-10-11T05:31:00Z）

- PR359：`codex/research-package-linux-fixture-oct11`，exact5e3ee67bc2afe07ac7653743d227318aed77f6d8。一般CI成功；protected checks未完成。
- PR360：`codex/research-admission-isolation-oct11`，已推送進度與失敗證據；最終code887355ca0479d957d9b0472bba70ea4f8f9d5961已獨立scoped CODE PASS。這是development依賴PR，不是正式main發布批准。
- 既有Cloud聊天「Set up stockinsider」`01a106b8-a883-7185-9962-f7372109a093`／durable已完成這件Linux驗收，最新狀態idle，turn`01a1296c-8f2b-76fc-8a82-79bc1ef86687`、cursor`fb0ce0df-ca49-43e0-99fc-e874b21fb53d:8`。先讀compact狀態再派下一件，避免重複工作。
- 原Linux嘗試1e0c為4PASS/1FAIL/零skip，實際PG startup缺少username；保留31份原始紀錄，未改寫成成功。僅外部runner補入由OS帳戶取得的非秘密USER，exact887程式、SQL、測試、配額與時限均未修改；一次重跑21/21PASS、零skip。這21包含18個nested案例與3個parent，不能另計為21個獨立產品驗收條件。
- 新證據345a284cc7a12a923bc83f98aecc8188ea87138c已由root逐檔核對26raw／17,815bytes及source tree；無新依賴、build、模型呼叫或正式寫入。抽樣峰值RSS約295MB、可用磁碟10.08GB，自有程序已結束。收據`.agent/reports/2026-10-11T05-28-admission-isolation-user-linux-vm.json`，使用合成partial prerequisite profile，並非完整production安裝。
- 下一個發布工程項目是installer完整18-successor清單／first-install／owner-ACL-trigger／rollback契約，依既有獨立migration設計接續，不能只追加路徑或移除TRUNCATE保護。
- 全main-to-final審查與外部runner信任復原仍獨立阻擋；不能用這次bounded21PASS替代。真正作者／獨立審查文章、正式策略與排程驗收維持未完成。


## 完整資料庫安裝鏈接續（2026-10-11T06:45Z）

- 已補入18個遺漏 successor，維持48-file base原始SQL及digest；73個選定檔案實際套用72個，1個由既有superseded檢測跳過。
- 以實際VPS的schema-only dump在隔離PG17完整還原，沒有用stub取代prerequisite。完整安裝、真正最終postcondition、原子回滾、斷線、雙安裝程序競爭與catalog/owner/ACL/trigger/role mutation測試通過。
- 真實執行修復了最終verifier的括號語法、兩個歷史wrapper名稱及owner檢查；release manifest也補上V3.15原始DO-block resolver變更，沒有自動批准新策略。
- 獨立WIP審查另提出2個P2：pgpass回退和把HBA檔案當載入規則。已用拒絕密碼challenge callback、`system_user=peer:postgres`、實際runtime本地HBA拒絕探測及前後profile一致性修復。22/22測試、型別、lint、正常build通過；精確版本獨立複審與Linux新鏈驗證尚待執行。
- VPS唯讀探測確認peer及實際拒絕成立，沒有修改runtime角色或正式schema。舊空間不足不是此次阻擋。
- Cloud244eccba的27raw/44,875bytes逐一核對成功，原始empty-PG schema RED保留；該結果不表示正式VPS缺auth。
- 受保護發布仍缺真正完整main-to-final審查/PCR及trusted runner復原機制；此批安裝測試不會冒充合併/部署批准。具體交接見database-installation-handoff.md與本次receipt。
