# 定位 9/19 正式備份的 v3.14 財務遷移錯誤

依原保管流程在 Contabo 隔離 PostgreSQL 17.11 資料庫還原正式備份，核對 288 個外鍵。以 256 的鎖表容量重跑既有財務安裝器。診斷僅以 SQL 本體對應固定遷移檔，並比對 PostgreSQL 回報的公開資料表與約束名稱。

`23514` 確定來自 `20260811_actionability_recovery_v3_14.sql` 重建 `legacy_decision_revision_evaluations_v3_13.legacy_evaluation_schema_v314_check`。8/11 的約束接受 v3.13／v3.14；後續 8/28 的 v3.19.6 遷移接受同表的 v3.17／v3.18／v3.19。財務遷移交易未提交，發布遷移及新版 Next.js 真實資料回滾尚未執行。獨立複本與執行器均已清理，正式簽章一致，HOLD 維持。

下一步用固定來源導出的兩條條件在真實備份上做唯讀計數、辨認備份已有的有效約束，保留後繼資料以供有序升級。避免使用原始列內容判定或保存驗收證據。

[去敏追蹤紀錄](../../docs/operations/2026-11-16/vnext/contabo-t18-real-legacy-check-location.json)
