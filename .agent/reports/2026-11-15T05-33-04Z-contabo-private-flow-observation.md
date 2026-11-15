# 上市法人金額備援的兩次私有觀測

證交所商品說明同一交易日有 14:50 與 19:40 兩個產製版本，後者含綜合帳戶及鉅額。政府目錄存在民眾的開放建議，這次仍未取得可當成 BFI82U 開放授權的相應資料集。在供應商免費非商業範圍內，僅於 Contabo 隔離 staging 觀測 FinMind 同一 dataset，不使用既有 token、付費額度或正式 writer。原始回應如符合當日條件，僅保存在動態身分的 0700 目錄。供應商不回傳交易市場、定案版本及版本發布時間，因此即使 21:30 前已有結果，也只確立當時實際取到的回應。不得將它標為 TWSE 19:40 版本，或將原始資料提供到網站、API 或 Git。 [證交所版本說明](https://eshop.twse.com.tw/zh/product/detail/d31c1b9570ae47058ec83a0bb1ffa419) · [政府資料開放建議](https://data.gov.tw/suggests/44238) · [FinMind 使用範圍](https://finmind.github.io/Pricing/)

- 11/13 事後原生回應共十日完整，每日五個法人類別和一筆 total，分別重算買進與賣出合計都一致。這輪回應沒有被存成 11/13 即時樣本。11/16 的模式提前啟動會在 HTTP 之前拒絕。
- 兩個一次性 timers 分別已排到 11/16 與 11/17 台北 21:27，使用動態非 root 身分、最高 96 MiB、40 秒上限。現有正式排程狀態指紋未變；已排的 21:26 及 21:28 官方採集並行且各自保留收據。現地紀錄不代表已取得這兩日資料。
- 收盤後依正式市場日曆核對完整交易窗、當日確切可知時間及來源版本。待上市市場範圍與生產權利明確前，榜單依原契約顯示缺口。無新增訂閱。

[排程收據](../../docs/operations/2026-11-15/launch-radar/contabo-private-vendor-market-flow-schedule.json) · [正式採集範圍及歷史比對](https://github.com/Kaichen9527/stockinsider/commit/59e151e50cc3f07023b2a9290bf00c32a37cdf57)
