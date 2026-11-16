# 櫃買整股開盤成交歷史重播

使用已取得存取權的櫃買 MTH 文字檔及櫃買中心 `dailyQuotes` 原始回應。成交檔須是單一股票和交易日，採驗證過的 CRLF 前 67 位元組格式。兩份日報分別對應訊號交易日及下一個完成的市場交易日。採用程式實際取得資料的 `observedAt` 及寫入封存的 `recordedAt`，禁止回填成歷史已知時刻。

```sh
node web/scripts/replay-tpex-opening-outcome.mjs packet.json tape.txt prior.json day.json
```

`packet.json` 包含既有 `LaunchOutcomeInput` 作為 `input`，其 `scope` 必須是 `historical_price_replay`，`signal.market` 必須是 `TPEX`，`opening` 必須是 `null`。另放 `receipts.tape`、`receipts.prior`、`receipts.day`。每筆收據需要 `observedAt`、`recordedAt`、原始 SHA-256，兩份日報還需擷取的官方 `url`。日曆及調整後行情沿用既有成效輸入契約。先把封存和收據存入 VM 或 Contabo 隔離環境的私有路徑。

程式依交易類型、時間與序號將同筆買賣兩側配對，全日唯一成交筆數及股數須完全對上官方日報。首筆整股撮合排除零股及盤後，只在普通開盤後兩分鐘內作模擬。櫃買將暫緩開盤訂為 09:02，成交檔缺少開盤或復牌標誌，因此到達暫緩開盤時點或其後的第一筆保留缺口。若首筆時間的合計股數至少 1,000 股，價格與當日開盤及指定價格版本一致，並低於前一市場日官方刊載的次日漲停價，結果可作為離線模擬成交。上限價或未滿一個標準整股交易單位維持 `opening_evidence_gap`。來源打包錯誤、缺列、價格或時點衝突直接拒絕。

此工具只輸出歷史重播報告。資料庫、正式日榜、帳務及現行正例資料供應各自維持原驗收流程。

[櫃買 MTH 產品及格式](https://eshop.tpex.org.tw/zh/product/detail/2c92e0139984eab70199892c78bf0004) · [櫃買交易制度](https://www.tpex.org.tw/zh-tw/mainboard/trading/rules/system.html)
