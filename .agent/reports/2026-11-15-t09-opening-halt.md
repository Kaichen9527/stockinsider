# T09｜開盤停牌證據

候選讀取器核對下一個市場交易日的開盤時間是否落在官方暫停／恢復交易的區間。首次開盤停牌就記為無法成交，即使當日較晚恢復也不改選進場時間。資料不足則保留未知。讀取器拒絕晚於決策截止才取得的證據，也拒絕與全日停牌矛盾的日 K。

證交所的開放 CSV 將暫停和恢復放在同一列。櫃買中心 API 可拆成兩列，因此按股票及時間配對。讀取器校驗來源網址、原始位元組雜湊以及取得、記錄和截止順序。沒有停牌紀錄或只有日 K 時，無法由這兩個來源判定開盤買單能否成交。

## 實際來源重播

Contabo staging 使用官方機器資料和成效評估器重播以下歷史事件。榜單訊號與價格用測試資料。每筆回放都驗證晚取得的公告無法用於事件當日的歷史截止。

| 市場 | 股票 | 開盤日 | 結果 |
|---|---|---|---|
| 上市 | 2314 台揚 | 2026-11-10 | 暫停與恢復資料成對，開盤無法成交 |
| 上櫃 | 1788 杏昌 | 2026-06-18 | 分列資料配對，開盤無法成交 |
| 上櫃 | 4174 浩鼎 | 2026-11-13 | 該次 API 擷取只有暫停列，保留開盤證據不足 |

櫃買中心另有浩鼎的恢復交易公告，該公告尚未接入候選讀取器。[官方公告](https://dsp.tpex.org.tw/web/announcement/announcement_detail.php?content_file=MTE1MDIwMzE2MjEuaHRtbA%3D%3D&content_number=MTE1MDIwMzE2MjE%3D)

5 個 Node.js 測試及 TypeScript 5.9.3 相關檔案的嚴格型別檢查通過。補丁套用及檔案雜湊已核對。收據保留公開事件欄、來源、時間與原始回應 SHA-256。重新擷取時，來源可能已提供不同日期或內容。

上市、上櫃開盤採集合競價。成交正例仍須可驗證的撮合資料及策略可用的委託範圍。已核對兩家交易所的資料商品，這次沒有購買。〔[證交所交易制度](https://www.twse.com.tw/zh/products/system/trading.html) · [櫃買中心交易制度](https://www.tpex.org.tw/zh-tw/mainboard/trading/rules/system.html) · [證交所歷史交易資料](https://eshop.twse.com.tw/zh/category/sub/8) · [櫃買中心委託檔](https://eshop.tpex.org.tw/zh/product/detail/2c92e0139984eab70199893c14a00007)〕

後續需要把收據接到既有官方資料流程及盤後 worker，並驗證可使用的開盤成交正例。歷史停牌重播不列入指定的兩個真實相鄰交易日端到端驗收。正式服務未變更。

來源與授權見政府開放資料平台。〔[證交所資料集 11677](https://data.gov.tw/dataset/11677) · [櫃買中心資料集 48665](https://data.gov.tw/dataset/48665) · [櫃買中心 API 文件](https://www.tpex.org.tw/openapi/)〕

[候選補丁](../../docs/operations/2026-11-15/launch-radar/cloud-wip-recovery/outcome-evaluator/launch-outcome-opening-halt.patch) · [去敏驗證](../../openspec/changes/stockinsider-vnext-20/evidence/2026-11-15-t09-opening-halt.json)
