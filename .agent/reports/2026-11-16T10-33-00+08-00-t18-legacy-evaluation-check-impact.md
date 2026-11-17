# 正式備份已安裝 v3.20 評估約束

使用同一 9/19 正式備份的隔離複本。在 PostgreSQL 17.11 的 `REPEATABLE READ READ ONLY` 交易，以固定 SQL 導出的兩個舊條件查核 72 筆評估。v3.14 會拒絕 36 筆；v3.19.6 仍拒絕 6 筆。只回傳計數及 catalog 雜湊。

所得 72 筆包括 v3.14 36 筆、v3.19 30 筆，沒有空標籤。複本已有經驗證的同名約束。另用不含備份資料的原生 PostgreSQL 17.11 比對三個版本的 `pg_get_constraintdef` 雜湊。唯一相符的是 `20260828_kol_first_runtime_recovery_v3_20.sql` 的定義，容許的第六個標籤為 v3.20，因此其餘 6 筆可由已驗證約束及前五類計數確定。

財務與發布遷移均未提交。修復要保留這個已存在、精確且較新的 v3.20 約束，同時保留空白或其他先前 schema 的既有遷移行為。修復後需要重跑整條財務與發布遷移，並核對新版 Next.js 真實資料回滾。正式簽章一致，暫存及獨立實例已清理。

[去敏資料](../../docs/operations/2026-11-16/vnext/contabo-t18-legacy-evaluation-check-impact.json)
