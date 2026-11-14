# T06 籌碼備援 FinMind 實機對照

2026-11-15 台北清晨，由 Contabo 用官方文件提供的 v4 公開 GET，各查 2330、5274、6488 一次。未登入、未提供 token、未購買或使用付費方案。本次定位為個人研究取證。沒有結果資料寫入、榜單發布或公開再散布 FinMind 原始回應。原始 bytes 只在主機記憶體用來比較，收據保留資料集、檢查結果、時鐘與 SHA-256。

期間 2026-10-14 至 2026-11-13，三件回應皆 HTTP 與 API 200，每件五類共 105 列及完整相同的 21 個交易日期。兩項計分所需分類逐日唯一，買與賣均為非負整數。外資取 `Foreign_Investor`，排除 `Foreign_Dealer_Self`；投信取 `Investment_Trust`。淨額等於買進減賣出。按正式來源及日期保留法人分類定義，跨早年制度變更不能無條件向前套用。

| 公司 | 對照 | 通過／總數 | 擷取時間 UTC | bytes | SHA-256 |
| --- | --- | ---: | --- | ---: | --- |
| [2330](https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockInstitutionalInvestorsBuySell&data_id=2330&start_date=2026-10-14&end_date=2026-11-13) | 21 日逐日外資及投信淨股數對 TWSE T86 | 42/42 | 2026-11-14T21:49:36.590909+00:00 | 9,602 | `690ff881dd047cc8952bf613632e92c4af7a808f3d27cbc9bcc5d6f25ac257d9` |
| [5274](https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockInstitutionalInvestorsBuySell&data_id=5274&start_date=2026-10-14&end_date=2026-11-13) | 兩個截止日期 × 5／20 日 × 外資／投信淨股數對 TPEx | 8/8 | 2026-11-14T21:49:36.852559+00:00 | 9,289 | `4ae6478fcc71da4869e3140c7ad4b3e321544496b3b08a0336ffab245c2de384` |
| [6488](https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockInstitutionalInvestorsBuySell&data_id=6488&start_date=2026-10-14&end_date=2026-11-13) | 兩個截止日期 × 5／20 日 × 外資／投信淨股數對 TPEx | 8/8 | 2026-11-14T21:49:36.961629+00:00 | 9,503 | `baab99bac8f5f2f6c84539a14dac5192a4413ce583f6793c3aff0746586a6aa6` |

[2330 的 TWSE 官方收據](https://github.com/Kaichen9527/stockinsider/commit/06e172b085e29e270a9720b80580d92e56c3baf3) · [5274、6488 的 TPEx 官方收據](https://github.com/Kaichen9527/stockinsider/commit/20c961ba458428800d4234e7c33d92ebf06228a0) · [FinMind 籌碼資料規格](https://finmind.github.io/tutor/TaiwanMarket/Chip/#taiwanstockinstitutionalinvestorsbuysell)

## 產品時鐘及取用範圍

FinMind 文件列平日約 20:00 更新，也說明盤後定價及鉅額等補列可能更新買／賣總數，官方沒有固定最終定案時間。本次全部為事後擷取；數字相符不建立 11/12、11/13 原發榜截止時刻的可知版本。若有經審查的接入權限，應守住 21:30 截止時實際已收集的精確回應和來源版本，後續補列為新版本。缺同市場、同日且同交易範圍的官方成交量，保留籌碼評分缺值。任何備援接線均應獨立記錄 provider、來源權限、時鐘和欄位異常，不將聚合商冒充交易所原始發布管道。

截至取證，FinMind 方案頁把個股日法人列入 Free，未註冊標示每小時 300 次。個人、學術等非商業用途適用免費授權，商業用另有 Sponsor Pro。使用範圍仍取決於具體方案與來源機關規定。其 2026-10-31 授權說明未授予原始資料外部再散布，對外公開及第三方用途應確認來源機關要求和適當標示。現有財報備援 token 不能證明使用者目前方案或 FinMind 本資料集和 StockInsider 公開衍生分數的權利。本輪無新增花費，公開發榜維持既有權限門檻。

[FinMind 方案及使用授權](https://finmind.github.io/Pricing/) · [FinMind 資料授權說明](https://finmind.github.io/Disclaimer/)
