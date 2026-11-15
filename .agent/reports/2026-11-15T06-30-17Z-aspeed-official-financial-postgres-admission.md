# T07 信驊正式財報的 PostgreSQL 結構證據

延續 [雙階段驗證與 TypeScript 准入](https://github.com/Kaichen9527/stockinsider/commit/6d841b229aace69e4a02595ecfa1c4019f13fea2)，在 Contabo 非 root 暫存環境重播固定產品 `f8be9f28bcaf9f4e2d1e8257bad8d7d201b30a43`。正式來源為 5274 2026Q3 iXBRL，同 SHA-256 原件。Arelle 兩輪離線驗證後，把同一原件、原始完整 manifest 與 11 筆 TypeScript mapper 輸出送入可隨時刪除的 PostgreSQL 17.11 cluster。只有私有 Unix socket，沒有 TCP。fixture 只提供 SQL schema／測試身分及測試收據關聯；聲明數值、來源 bytes、Arelle 結果、mapper 與 v8/v9/v10 SQL 是實際 Git 版本。parser CPU、位址與 wall 預算仍為隔離重播專用。原始文件與完整 manifest 未寫進 Git。

| 驗證 | 結果 |
| --- | --- |
| 以 service_role 執行 v10 completion RPC | `validation_pending`，11 筆新增、0 筆重複。11 筆均以原文件 SHA-256、命名空間、單位與額外的開始日期匹配結構證據。 |
| SQL 重算 manifest 雜湊 | 與前兩次 Python／TypeScript 產生的雜湊一致。200 筆有範圍的錯誤保留，文件標示為 `partial`，全文就緒檢查回傳 false。 |
| 寫入後期別核對 | 4 筆 EPS 保留兩個不同開始日。單季基本／稀釋 48.13／48.09，年初至第三季累計 126.41／126.28。4 筆均維持會計驗證 `pending`。 |
| 拒絕控制 | 改原文件 SHA、改 manifest 未重簽、換單季 EPS 的開始日為年初，三者各以產品 SQL 的預期錯誤拒絕，任何 SQL 事實、證據或關聯都未殘留。 |
| Finalize 與重跑 | 缺 v2 會計收據時，finalizer 維持 0 通過、0 拒絕、11 pending。重新領取同一收據後，重跑新增 0 筆、辨識 11 筆重複；最後只有 1 份清單、11 筆事實、11 筆關聯。 |

暫時 cluster 及來源目錄已清除，正式 web、PostgreSQL 與 worker 均保持 active。新資料的觀察時間是 2026-11-15T06:28:50Z。此證據證明真實申報可跨過 SQL 結構證據邊界。基本面完整案例仍需原生會計驗證收據、財務橋接及估值、作者及獨立審查，也仍要修正式 parser 資源與斷線處理。
