# 定位來源授權種子重跑的權限缺口

同一個 9/19 正式備份在 Contabo 隔離複本通過 v3.20 評估與診斷約束。用固定候選 `14d568e` 重跑，並只在執行 `20260829_v320_kol_source_authority_seed.sql` 前取得已知角色及三張表的有限 catalog 權限。只輸出已知物件、函式名、SQLSTATE、行號和布林值。

PostgreSQL `42501` 來自 `seed_v320_kol_source_authorities` 函式第 29 行，讀取 `internal_principal_role_bindings_v3` 時被表級 ACL 拒絕。該函式在複本已有 `SECURITY DEFINER` 定義。遷移操作員為 `si-t18-db`，有效執行角色仍是函式 owner `postgres`。在這份還原複本，該角色沒有此表的 SELECT 或 INSERT，也沒有追加來源授權函式的 EXECUTE。以正式庫角色設定推論這組缺口之前，應先檢查可攜式還原角色與既有 seed 是否已完成。

本輪只加診斷，沒有授予權限或改寫 ACL。財務交易回滾，前兩條 v3.20 約束與資料比對一致。正式服務、資料庫、排程與 release pointer 的簽章一致。隔離複本與暫存已清理，HOLD 維持。

[去敏權限收據](../../docs/operations/2026-11-16/vnext/contabo-t18-kol-seed-permission-real-backup.json)
