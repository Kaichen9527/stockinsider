# T18 真實還原的權限來源與擴充套件

Contabo 隔離 staging 匯入 9 月 19 日正式備份。建立空資料庫時便有 `PUBLIC USAGE`，bootstrap、備份匯入及相容處理後都仍有該權限。備份有一個 `public` schema 權限項目，還原清單確實保留。各階段的結果相同，尚未判定該項目是否重新授權。

同一份真正備份副本的交易演練證實，9 月 20 日估值 SQL 更新三條約束後符合審查基準，兩張表的列數一致。撤回 `PUBLIC USAGE` 後原發布校驗仍因完整物件目錄差異拒絕。交易已回滾，原約束和權限恢復。

隔離 PostgreSQL 17 原生對照核對到 `pg_stat_statements` 的兩個額外關聯和四個型別。12 個已記錄的額外函式指紋皆對上它及 `uuid-ossp`。真實報告前次只列 12 個範例，第 13 個名稱仍待核實。此證據也未驗證真實擴充套件的完整權限或定義。

正式簽章一致，HOLD 及 26 個發布遷移仍待解除。新版 Next.js 回滾尚未執行。本次 staging 暫存已清除，Contabo 剩餘約 24.3 GiB。

[可機讀驗收](../../docs/operations/2026-11-16/vnext/contabo-t18-authentic-restore-acl-and-extension-provenance.json)
