# T07 信驊正式財報的會計收據與可知時點

延續 [SQL 結構驗證](https://github.com/Kaichen9527/stockinsider/commit/b6986b6fa320144cf76aa5d7435a668821f8b4cf)。從官方端點重新擷取同 SHA-256 的 5274 2026Q3 iXBRL，保留實際收集時間 2026-11-15T06:33:38Z。在 Contabo 的非 root 隔離程序重播固定產品 `f8be9f28bcaf9f4e2d1e8257bad8d7d201b30a43`。固定 Arelle／taxonomy 與 TypeScript 將 11 筆事實寫入僅開啟私有 Unix socket 的暫存 PostgreSQL 17.11。資料庫 schema、收據識別及 service principal 前置條件由既有測試 fixture 提供。文件內容、解析結果、TypeScript `validateOfficialFinancialFact`、SQL 會計與 as-of 函式使用實際資料／固定產品程式。使用定向測試驅動讀寫，未呼叫正式 PostgREST、queue 或 worker。

- TypeScript 驗證器以 SQL 的實際事實欄位、官方來源及完整期間同儕計算。11 筆皆通過識別、單位、時點及重複一致性；現金與資產另外通過 `cash_not_above_assets`。11 筆的來源 SHA、v2 版本、固定測試 principal、驗證輸入雜湊和 SQL 保存結果均一致。以相同輸入重跑，收據仍是 11 筆。
- v8 finalizer 回傳 `validated|11|0|0`。文件仍為 `partial`，保留三個結構驗證 gap；不得用單筆資料的會計狀態提升全文資格。
- 錯誤來源 SHA、錯誤事實版本、錯誤 principal 三個 SQL 控制均被拒絕，未建立任何會計收據。用早於實際收集的時間呼叫 TypeScript，11 筆均為時點不合法。
- As-of 查詢用三個實際前後界線。收集前 0 筆；SQL 結構寫入後、會計驗證前 11 筆、已驗證 0 筆；會計驗證後 11 筆均已驗證。單季與累計仍有不同開始日。
- 這份 iXBRL 經結構篩選後無已驗證的稀釋加權股數，因此本輪未執行「稀釋 EPS × 加權股數＝歸母獲利」的產品算式。正式 PDF 另有人工核對依據，不能當作這個算式已由產品驗證。已驗證 11 筆也不代表收入全表、報酬或估值可用。

目前 vNext 研究證據投影仍要求原始文件 receipt 為 `accepted`；此實際文件為 `partial`。下一步需重播研究投影，釐清如何讓經雙輪驗證的個別事實帶著完整來源與可知時間進入研究，並保留全文不完整及估值缺口。產品仍需修復正式解析器資源與逾時處理，通過發榜、作者及獨立審查。暫存 cluster 與原件已清除，正式 web、資料庫與 worker 仍 active。[固定研究證據投影](https://github.com/Kaichen9527/stockinsider/blob/f8be9f28bcaf9f4e2d1e8257bad8d7d201b30a43/web/src/lib/vnext/financial-evidence-sources.ts)
