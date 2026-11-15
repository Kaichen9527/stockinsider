# 名冊寫入介面在隔離 PostgreSQL 的九項對照

Contabo 以唯讀查詢取得實際 `append_instrument_roster_authority_v3` 函數及型別，函數 body MD5 為 `c86e788022a64ce35fd01ad71facc62b`。以同一函數在暫存、僅開私有 Unix socket 的 PG17.11 重播。支援資料表及 writer principal 用合成對照。九項斷言全部通過，暫存資料庫及 socket 已回收。[去敏收據](../../openspec/changes/stockinsider-vnext-20/evidence/2026-11-15-t06-roster-native-append-contract.json)

- 同一 stock identity 可追加 TPEX → TWSE，舊截止時間選原市場，新截止時間選新市場。TDR 更正可追加 `depositary_receipt`，保留以前的普通股紀錄與記錄時間。
- 重新送出完全相同的舊 packet 會回原 authority，新增一筆冪等 audit，兩個業務表沒有新增。錯誤的對照 principal 被拒絕。
- 將舊市場資料換成新的來源時間再送，會新增另一個 authority，最後之市場回到舊值。這不是市場真的轉回；receiver 需核對官方事件版本、業務生效及來源覆蓋，再決定追加。
- 同一 stock identity 有 64 筆不同的歷史時，第 65 次追加得到 `bound_violation`。既有 64 筆 authority／別名在拒絕後一致。相同事實每天重送因 source timestamp 不同會耗用版本上限。

新接線在私有來源收據記錄完整名冊版本及實際觀察時間。只有正式身分、證券種類、狀態、名稱或市場所屬發生有效變化，才經現有 writer 追加 authority。對同一來源事件重跑沿用原事件版本與時鐘。無法辨識的事件、漏交易所或異常時間均保留缺口。讀取層先按原 cutoff 選適用的最新紀錄，再作普通股與有效範圍驗證，延續前一輪的 220 身分收據。

此次為既有函數與資料庫規則的原生隔離對照。沒有取得正式 principal 或實際跑候選、榜單和審查，正式資料及服務未變更。執行 SQL 只能使用一個新建的隔離 PG17 資料庫。[原生重播 SQL](../../docs/operations/2026-11-15/launch-radar/replay-roster-append-authority.sql)
