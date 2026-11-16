# 固定候選版在 9/19 正式備份的重跑

GitHub 候選版 `ae07f61be555d01b9ba5dc61ff8cf557bf35b749` 加入已驗證 v3.20 約束的保留路徑。只有精確定義與已驗證狀態吻合時，才在交易中鎖住表並確認同一約束 OID。三份具名來源的受影響 DDL 在這個路徑保留現有約束，既有遷移檔及其他 SQL 仍沿用。Contabo 原生正反例和 schema-only 全鏈在 C.UTF-8 與 C 均通過，production build、typecheck 及 lint 退出碼為零。GitHub 上的三個程式檔與測試時的位元組一致。

用原保管流程還原的 9/19 真實備份已經越過 8/11 的評估約束。重跑停在稍後的 `20260827_runtime_diagnostic_contract_v3_19_1.sql`，PostgreSQL 回報 `23514`，受影響的是 `legacy_runtime_failure_diagnostics_v3_14_invariant_code_check`。回滾後獨立讀取確認 72 筆評估內容及已驗證的 v3.20 約束 OID 相同，財務交易未提交。

掃描 49 個固定遷移的 18 個具名 `ALTER TABLE ... ADD CHECK` 宣告，有兩條具名檢查的較晚版本增加了允許值。第一條為已修的評估約束。第二條為這次停下的診斷約束，v3.20 的來源多允許 `lease_expired`。這是原始碼盤點，仍需從真實備份核對此約束的精確 catalog 定義及受舊條件影響筆數。動態及其他樣式的 SQL 仍由實際遷移驗證。

正式簽章一致，暫存及隔離工作已清理。新網站的真實資料回滾與發布待完成，HOLD 維持。

[去敏重跑及來源盤點](../../docs/operations/2026-11-16/vnext/contabo-t18-v320-coded-replay-real-backup.json)
