# T18 正式備份還原的發布前校驗

使用 Contabo 隔離 staging 對 2026-09-19 正式備份完成兩次還原及財務交易，確認 288 項外鍵與 193 張 RLS 表。兩次皆在進入 26 個發布遷移前被原本的 PostgreSQL 結構校驗攔截。正式服務、資料庫、排程與 release pointer 的前後簽章一致。原發布校驗及 HOLD 保留。

## 已確認的差異

- PostgreSQL 原生對照切換到 staging 還原身分後，重現 `postgres` 的 139 項函式執行及 990 項表有效權限差異、`service_role` 在兩張表的 10 項權限檢查差異，以及兩條角色成員關係的轉移。空白對照資料庫需要一次原始 seed，真實備份保留既有的完整 seed。
- 三條估值 CHECK 的定義雜湊與驗證旗標全部相符。真實備份是 9 月 7 日版本，發布基準是加入 `forward_bvps_pb` 的 9 月 20 日版本。9 月 20 日 SQL 不在此次先行的 49 個遷移中。
- 真實還原的 `public` schema 含直接授予 `PUBLIC` 的 `USAGE`，20 個受比較角色多出該權限。此差異未在更換還原身分的對照出現，仍需追查來源。

正式備份與金鑰均保留在原處。清除本次暫存後 Contabo 可用磁碟約 24.3 GiB。待評審隔離環境校正後重跑原校驗，通過才繼續此次固定 Next.js 版本的回滾。

[分項驗證結果](../../docs/operations/2026-11-16/vnext/contabo-t18-post50-catalog-field-difference.json)
