# T18 還原副本的遷移前置盤點

9/19 正式備份曾成功還原，新的榜單讀取回報缺 schema。新版固定封裝只在隔離還原副本的 `SCHEMA_MISSING` 回執新增 14 項 catalog 標記。固定 SQL 查詢 writer fence、舊 V3 行情／公司行動、vNext core／worker、來源與研究資格、官方 CSV、榜單和成效讀取等物件是否存在，及舊 V3 owner 的基本身分屬性。這些標記僅反映目前副本的物件，不推定已套用哪支 migration，也不證明 schema、ACL 或函式定義等同。

PostgreSQL 17.11 私有測試以還原 callback 的原始 psql 參數驗證全部缺失、部分舊物件已在，以及回執拒絕多餘欄位／非布林值。測試函式一旦被呼叫即拒絕，確認此步只查 catalog。APP／REST 未啟動、資料列未改動。保留 schema 缺口的退出 3。

後續以正式備份重跑並取得 catalog 標記，再比對現有財務 schema／publication tail 的固定來源、相依與 postcondition。遷移相容、真實榜單、獨立審查及部署仍待驗收。
