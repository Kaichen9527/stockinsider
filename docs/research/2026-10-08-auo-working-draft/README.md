# AUO 手動實質研究稿（未發布）

入口：[article.md](article.md)。目前七章正文4420漢字、28個標記段落、24個研究引用代號；附表由同份已審金融／市場dataset產生。歷史checkpoint exact `a38ccf9a831fce46d7bd4385acba397d735816ca` 正文4222漢字，原61項驗收未改其文章bytes（SHA256 `30f4bd5c12199c1b48730a4697dfc6a6832deb494c5fe4c75e37d029ccfaca3e`）。本次純文案後繼Article SHA256 `90309611783a5d6ce3e2c7fc59eafa2e9cae864a9abb56fda924c1b9fce76168`。

這是 `draft/incomplete`，不是合法prepared-job產物或已通過candidate-deep-research-v1 validator。來源日期／時區未知保持未知；無虛構UUID、fact ID、股數、租約或量產數量。新單筆0.4元股利不重寫marketdataset，也不把1.45元raw價格差全當除息。Visteon launch更正在追加relay中留原貌。

[source-ledger.json](source-ledger.json)保存58個有限來源／歷史事件定位（不是58個独立消息），含既存28市場ledger；[content-validation.json](content-validation.json)記錄61組輕量核對，四次PE敏感度用既有valuation-engine-v2函式回驗。測試倍數未校準、沒有目標價或稀釋股數。TTM是2025Q3–2026Q2四個已公告季印值和，非年度／NTM／normalized。原Financial/marketdataset及程序bytes對base一致。

首次驗收parser只認ASCII括號而忽略中文章節括號，失敗log保留；修驗收工具後61/61、0fail/skip，沒有修稿或鬆動判定。私有0700目錄、0600create-only/fsync匯出九檔，再由新程序核對bytes/hashes；它是普通manual export，不冒稱controller receipt、跨任務持久性或live handoff。

本輪純稿件／資料／文件，未新增repo計算或App code，依授權不重跑無關heavy suite/build。去密收據`.agent/reports/2026-10-08T082600Z-auo-working-draft-validation.json`，SHA256 `cb7ee222325b6f92dd80019c819fff459fcbf458b516db5250e4159191dae5b9`。VM工具子程序峰值GNUtime 53297152bytes、100ms PGID sampled 40222720bytes；task磁碟峰值30658560bytes，可用27356250112→27355795456bytes。資源准入只看VM，不看VPS；無paid model、正式寫入、PR建立、部署、排程或策略批准。Root已建立PR307；本次文案後繼待Astra對exact差異審查。

純文案後繼：[editorial-validation.json](editorial-validation.json)實際23/23、0fail/skip，73行Markdown表格逐字不變、引用代號不變且存在，金融／市場輸入與原核算保持原樣。Q126−636→Q226＋218是季度轉盈的真實改善；同比下降與TTM虧損尚未證明持續性。資產／景氣交叉檢查與條件式遠期EPS／PE並存，未填目標價。內部契約詞移至文末方法與交接。

本次輕量驗收先因工具錯用a38作後增content-validation.json的比較基底而停止；改用已提交16562c1保存的原驗收檔後通過，錯誤與修正保留在新收據。這次手動編輯續接超過原30分鐘工程回合，並非自動模型預算验收；未重跑App build或舊346整合測試。原a38收據／私有匯出未覆寫，新文章尚未通過獨立稿件審查。
