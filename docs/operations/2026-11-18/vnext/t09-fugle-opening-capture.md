# T09 富果開盤串流輸入檢查

此私有工具供 staging 驗收。比對完整的單一股票訂閱、實際開盤旗標、逐筆時間、交易單位與已選定的官方首個交易日行情；輸出只供獨立審查。程式無網路、資料庫或發布權限，原始行情與報告留在受限儲存空間。

在原有授權容許擷取及保留行情的前提下，用 Node 22 執行：

    node --experimental-strip-types web/scripts/check-fugle-opening-capture.mjs \
      /private/staging/receipt.json /private/staging/stream.json /private/staging/ticker.json

- `receipt.json` 含 `input`（同一榜單的 `LaunchOutcomeInput`，`opening: null`）及 `receipts`。後者的 `stream` 和 `ticker` 各保存來源 `url`、接收完畢的 `receivedAt` 與原檔 `sha256`。時間用完整 ISO 8601，保留原有微秒。
- `stream.json` 含 `subscription: {channel: "trades", symbol, intradayOddLot: false}`、不中斷接收至 `through` 的時間，以及依收到順序的 `frames`。每列保留 `receivedAt` 與封包 `message`。保留盤前訂閱確認、`snapshot` 和 `data`，不得把憑證、驗證交換或其他訂閱混進來。訂閱必須在開盤前被確認，資料至少涵蓋開盤後兩分鐘。
- `ticker.json` 保存同標的、同交易日正式盤中的 Intraday Ticker 原始 JSON。數量以 `boardLot` 轉成股數，並核對上市／上櫃普通股與當日漲停價。

`review_candidate` 表示封包及價格條件吻合，可交獨立審查。接入正式 worker 前，仍要驗證有權使用資料、訂閱不中斷且接收時間可信、來源原件雜湊、與正式 writer 選定的資料版本一致。工具輸出的 `insufficient_evidence` 保留未知；錯誤範圍或不一致的收據直接失敗。一般日 K、快照、試撮、延後開盤、逐筆交易旗標、收盤旗標、漲停價或未達最少成交量都不足以推出開盤模擬。

官方契約：[Trade flags](https://developer.fugle.tw/docs/data/websocket-api/market-data-channels/trades/) · [時間、交易單位及訂閱確認](https://developer.fugle.tw/docs/data/websocket-api/getting-started/) · [Intraday Ticker](https://developer.fugle.tw/docs/data/http-api/intraday/ticker/) · [行情使用範圍](https://developer.fugle.tw/docs/data/intro/)
