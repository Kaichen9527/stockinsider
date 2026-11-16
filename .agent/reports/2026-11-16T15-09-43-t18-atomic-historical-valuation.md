# T18 隔離還原的估值遷移與擴充套件比對

已實作原發布交易內的隔離估值步驟。只接受 9 月 7 日已知的三條舊約束或完整的 9 月 20 日新版本。固定 SQL 更新後再次核對定義、驗證狀態與列數。未知或混合約束拒絕。原發布校驗與 26 個遷移清單維持原契約。

以 9 月 19 日正式備份在 Contabo 隔離 staging 重跑。新步驟更新三條約束，原發布校驗拒絕時確實回滾，26 個發布遷移仍待執行。加入兩個擴充套件的額外物件身分已核對完畢。實際副本的 `pg_stat_statements` 1.11 和 `uuid-ossp` 1.1 涵蓋額外 13 個函式、2 個關聯及 4 個型別。包含前一輪尚未核實的 `uuid_ns_x500()`。角色及權限的完整目錄仍待比對與審查。

22 項 PostgreSQL 原生及發布校驗測試通過，Next.js 正式建置通過。正式簽章一致，隔離暫存已刪除，HOLD 及新版回滾驗收維持待處理。

[隔離步驟](../../docs/operations/2026-11-16/vnext/T18-HISTORICAL-VALUATION-BRIDGE.md) · [實機驗收](../../docs/operations/2026-11-16/vnext/t18-atomic-historical-valuation-and-extension-members.json)
