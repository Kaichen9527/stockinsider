# 上線進度：2026-10-11 12:37 台灣時間

目前尚未完成正式上線。已修復可重現的問題並保存失敗資料，沒有繞過保護檢查。

| 範圍 | 最新可驗證成果 | 還缺什麼 |
|---|---|---|
| 一般 CI／打包 | PR359 舊 head e8c 的 product-runtime 與 diagnostic 成功；Linux 打包13/13。新版5e修正 umask 測試條件，Linux六檔81/81與6項PG案例通過，沒有弱化讀取器 | 完整Linux瀏覽器PCR尚未完成；保護gate尚未通過 |
| 原產品正確性 | Mac4ff155/155；Linux同源147/155，原8個失敗保留 | 6個PG PATH錯誤及2個瀏覽器錯誤須實證解決，不能把 Mac PASS 當 Linux PASS |
| 研究工作配額 | 真實雙連線 RR 反例重現；887修正9入口RC guard及函式屬性前置核對。maker21/21、獨立scoped CODE PASS與正常build成功 | 完整production安裝鏈整合；不是局部CODE PASS就能部署 |
| 文章發布 | 隔離 guarded HTTP／PG94案例與斷線恢復已實作驗證 | 真實可信作者、獨立審查執行及友達／另一產業文章；synthetic fixture不算內容完成 |
| 正式部署 | 凍結整合51a、正式main169維持不動，VPS擴容已實測 | installer缺原17個publication migration加新isolation successor；完整受保護審查及runner信任復原 |
| 策略／排程 | 原模組與失敗紀錄保留 | 完整母體、樣本外／前瞻驗證、使用者批准確切策略、排程及五實際交易日驗收 |

先收斂正式安裝與完整審查兩個發布必要條件，並行完成真實內容交接。來源／候選程式與文章測試完成，不代表已讀完所有平台或已找到有效獲利策略。短期不新增框架。

精確代碼、原始RED、PASS及限制見本次receipt。PR359修補不能直接視為main發布批准；新增隔離修補以獨立PR接續。部署後只保留持久歷史、證據與帳本，無引用可重建暫存才清理，這次沒有新確認可刪VPS項目。


## 工程接續狀態（2026-10-11T05:12:19.300096+00:00）

- PR359：`codex/research-package-linux-fixture-oct11`，exact5e3ee67bc2afe07ac7653743d227318aed77f6d8。一般CI成功；protected checks未完成。
- PR360：`codex/research-admission-isolation-oct11`，已推送進度與失敗證據；最終code887355ca0479d957d9b0472bba70ea4f8f9d5961已獨立scoped CODE PASS。這是development依賴PR，不是正式main發布批准。
- 既有Cloud聊天「Set up stockinsider」`01a106b8-a883-7185-9962-f7372109a093`／durable已接受一件Linux admission21案例驗收，最新狀態active，turn`01a1295f-0e2a-71be-906f-25e55fe21946`、cursor`fb0ce0df-ca49-43e0-99fc-e874b21fb53d:5`。勿重派或修改其精確source；先讀compact狀態。僅合成隔離PG，不部署。
- 下一個發布工程項目是installer完整18-successor清單／first-install／owner-ACL-trigger／rollback契約，依既有獨立migration設計接續，不能只追加路徑或移除TRUNCATE保護。
- 全main-to-final審查與外部runner信任復原仍獨立阻擋；不能用這次bounded21PASS替代。真正作者／獨立審查文章、正式策略與排程驗收維持未完成。
