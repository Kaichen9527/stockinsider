# 開盤成交來源與新版回滾套件查核

Contabo 直接驗證櫃買中心公開的 2023-09-15 成交檔範例。上市／上櫃的成交檔分開解析。上櫃樣本將同序號的買賣兩側核對後只計一次。3105 首次整股撮合為台北 09:00:14.019624，142.00 元、51,000 股。全日 4,582 筆與官方日報一致，成交股數也在報表仟股精度吻合。盤後及零股沒有列入開盤量。證交所範例僅 20 列，有兩組買賣側不齊，不能拿來建立完整成交紀錄。兩個範例均未寫入榜單或推估實際成交。

富果 WebSocket 有開盤及試撮標記，基本方案現有五個訂閱額度。依核准上限，日榜十檔共需核對涵蓋範圍與授權。歷史成交檔及券商逐筆資料也需先確認供應完整性及衍生發布權。未開通帳號、下單或購買資料。

已確認 staging 新套件 `948bb9e` 的 Next.js 16.3.4、manifest、BUILD_ID 及相關 Git 目錄。其 `web`、`migrations`、`deployment` 和根 lockfile 與現行整合分支相同。還原的真實副本仍缺經驗證的新版榜單，正式發布校驗與新版回滾保持待辦。

[櫃買中心成交檔](https://eshop.tpex.org.tw/zh/product/detail/2c92e0139984eab70199892c78bf0004) · [證交所成交檔](https://eshop.twse.com.tw/zh/product/detail/0000000063ce6ab00163d860b694000a) · [富果逐筆行情](https://developer.fugle.tw/docs/data/websocket-api/market-data-channels/trades/)
