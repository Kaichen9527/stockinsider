# 9/19 正式備份在 256 個鎖容量設定下重跑

用現有保管流程授權同一個 9/19 備份，在 Contabo 建立新的隔離 PostgreSQL 17.11 複本。只對該複本把 `max_locks_per_transaction` 由 64 改為 256，保留相同來源、原遷移腳本、檢查條件與版本。原有 10/11 schema-only 對照已驗證 256 可完整執行現有遷移鏈。

正式備份重跑仍核對 288 個外鍵及 193 張啟用 RLS 的表。財務遷移此次由原來的 `53200` 推進至 PostgreSQL `23514` 資料 CHECK 約束違反。財務遷移交易未提交，發布遷移尚未執行。vNext 核心 SQL 仍可獨立安裝並保持關閉。重跑只收集到 SQLSTATE 及階段，未收集約束名稱與遷移檔名。正式備份與較晚的 schema-only 測試有不同的資料範圍。

下一次先記錄固定遷移檔識別及公開 allowlist 中的 constraint 名稱，若需要資料成因，再對該精確條件做唯讀違規筆數查詢。維持原約束、保護及發布 HOLD，待釐清後再演練完整遷移。

重跑最低取樣可用磁碟約 16.15 GiB、記憶體約 4.14 GiB。正式服務、排程、資料庫與 release pointer 的前後簽章一致。獨立資料庫與暫存執行器已清理。

[去敏重跑驗收資料](../../docs/operations/2026-11-16/vnext/contabo-t18-genuine-legacy-migration-retry.json)
