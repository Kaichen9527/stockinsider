# T18 在真實備份副本演練估值更新

Contabo 隔離 staging 重新還原 9 月 19 日備份並完成既有財務遷移。以固定 9 月 20 日 SQL 演練後，三條估值約束與發布基準完全相符，兩張表的列數一致。同一交易內撤回 `PUBLIC USAGE`，並驗證交易回滾恢復原約束和權限。

外層輸出漏了一組階段欄位。已修正並重跑，以辨別 PostgreSQL 的預設權限是否由備份繼承。原發布校驗依然擋下 26 個遷移，正式簽章一致，HOLD 保留，新版 Next.js 回滾仍待驗收。

[可機讀紀錄](../../docs/operations/2026-11-16/vnext/contabo-t18-valuation-migration-live-clone.json)
