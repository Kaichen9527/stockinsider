# T07／T08 信驊真實財報的研究投影門檻

延續 [隔離會計收據](https://github.com/Kaichen9527/stockinsider/commit/df88766b86c3175a09e08a5af3422e7c3e070742)。重取同 SHA-256 的 5274 2026Q3 MOPS 申報（觀察 2026-11-15T06:39:14Z），以固定 `f8be9f28bcaf9f4e2d1e8257bad8d7d201b30a43` 的 Arelle、TypeScript、SQL 在 Contabo 非 root 暫存環境重播。11 筆通過會計驗證，原文件收據仍為 `partial`。用原生資料庫 as-of 事實、收據、證據、關聯及 provenance 直接呼叫目前 `projectFinancialEvidenceSources`。既有 SQL 測試表略去部分欄位，本次只在投影輸入補實際來源、觀察時間、同一原件身分及測試 provenance ID；沒有改原生 receipt 狀態。原件與完整清單未提交。

| 驗證場景 | 投影結果 |
| --- | --- |
| 收集前 cutoff | 0 筆觀察，0 筆證據。 |
| 會計驗證前 cutoff | 保留 11 筆觀察；全部以 `validated_original_fact_required` 暫緩，0 筆證據。 |
| 隔離 SQL 已驗證，原文件仍為 `partial` | MOPS URL 通過目前網址規則。11 筆會計通過的事實都保留觀察，來源收據、研究證據均為 0；全部以 `immutable_source_receipt_missing_or_conflicting` 暫緩。 |
| 只在記憶體把測試輸入的 receipt 狀態改為 `accepted` | 11 筆來源收據、10 筆頭部證據（相同現金概念的多筆記錄只投影最新一筆）。四種 EPS 都有各自期間及文件 SHA。分母仍為 null，四筆 EPS 均無可比較的財務期間／股本依據，結果帶 `missing_sql_financial_interval_basis_parity`。此控制無資料庫寫入，也不會讓真實文件獲得 accepted。 |

現行卡點是來源投影的全文狀態檢查。要把同一批事實供研究使用，需以 SQL 已核對、在 cutoff 前可知的個別 fact/provenance/evidence/receipt 版本來綁來源，並反向測試其他文件、帶錯誤的事實、錯誤時間或驗證 principal 無法借用任何證據。保留原文件的 `partial` 狀態、重編／股本依據、財務比較一致性、估值、作者及獨立審查 gates。此輪只重播隔離環境，暫存來源與 cluster 已移除，正式 web、資料庫與 worker 仍 active。[固定產品投影](https://github.com/Kaichen9527/stockinsider/blob/f8be9f28bcaf9f4e2d1e8257bad8d7d201b30a43/web/src/lib/vnext/financial-evidence-sources.ts)
