# T18 還原副本的遷移前置盤點

9/19 正式備份曾成功還原，新的榜單讀取回報缺 schema。新版固定封裝只在隔離還原副本的 `SCHEMA_MISSING` 回執新增 21 項 catalog 標記。固定 SQL 查詢 writer fence、舊 V3 行情／公司行動、vNext core／worker、來源與研究資格、官方 CSV、榜單和成效讀取等物件是否存在，及舊 V3 owner 的基本身分屬性。其中三個正式 source CSV guard 與 catalog canonical 查核沿用該 migration 的原始函式屬性和雜湊。其他標記只觀察物件是否存在。這些值不推定哪支 migration 已套用，也不能當成安裝或授權證據。

PostgreSQL 17.11 私有測試以還原 callback 的原始 psql 參數驗證全部缺失、部分舊物件已在，以及回執拒絕多餘欄位／非布林值。同名但內容不同的 writer fence 未通過正式 guard 驗證。測試函式一旦被呼叫即拒絕，確認此步只查 catalog。APP／REST 未啟動、資料列未改動。保留 schema 缺口的退出 3。

後續以正式備份重跑並取得 catalog 標記，再比對現有財務 schema／publication tail 的固定來源、相依與 postcondition。遷移相容、真實榜單、獨立審查及部署仍待驗收。
