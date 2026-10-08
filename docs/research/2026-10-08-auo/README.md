# 友達：新證據如何改變假設

示範研究輸入，未發布、未匯入正式資料、未通過研究內容審查。24個月營收由 root hosted reader 讀取；八季損益核心欄位及2Q26資產負債表由 root Mac 公開 reader 視覺核對後 relay，VM 負責計算。VM 唯一 PDF GET 被代理 CONNECT403 拒絕，沒有 fetch/render 成功；不以此把已由 Mac 核對的數字改成缺值。

## 基線已從「只有 EPS」變成可拆解的獲利橋

單位：新台幣百萬元；EPS 為元／股。每季保留來源 URL、原 PDF byte hash（Mac 提供，非 VM 重新驗證）、P1頁次及 observedAt。來源為 [2Q26](https://www.auo.com/upload/media/ir/Financial_Information/2Q26_Finance_Statement_English.pdf)、[1Q26](https://www.auo.com/upload/media/ir/Financial_Information/1Q26_Finance_Statement_English.pdf)、[3Q25](https://www.auo.com/upload/media/ir/Financial_Information/3Q25_Finance_Statement_English.pdf)、[4Q25](https://www.auo.com/upload/media/ir/Financial_Information/4Q25_Finance_Statement_English.pdf) 的本季／比較季欄。

| 季度 | 營收 | 營業利益 | 淨業外 | 歸母淨利 | 基本EPS |
|---|---:|---:|---:|---:|---:|
|2024Q3|77,748|-310|-285|-926|-0.12|
|2024Q4|68,692|-3,323|6,342|1,619|0.21|
|2025Q1|72,102|1,141|3,347|3,294|0.43|
|2025Q2|69,237|1,504|630|1,948|0.26|
|2025Q3|69,908|-1,806|738|-1,280|-0.17|
|2025Q4|70,142|-1,893|4,782|2,882|0.38|
|2026Q1|69,031|-636|134|-1,144|-0.15|
|2026Q2|70,891|218|2,533|1,343|0.18|

八季中五季營業虧損，因此正 EPS 不能直接代表核心營運改善。2Q26營業利益218加淨業外2,533成為稅前2,751，扣所得稅631成為合併淨利2,120，再扣NCI777成為歸母1,343；不是把歸母淨利與營業利益的差額全部認成一次性。季度營收年增約2.39%，但營業利益從1,504降至218，歸母淨利從1,948降至1,343。ADLINK合併口徑改變，這些是未調整的合併數字，不能當有機成長。

## 月額／累計／季度資料各自保留

24個月連續涵蓋2024-10至2026-09。2026前九月月額和206,797，相較2025同期211,246約減2.11%；9月年減約4.26%。2026Q3月額和66,876、同比月額和約減4.34%，仍是未經查核月營收推算，並非尚未公布的Q3財報實績。

2026H1月額和139,921與累計139,923差2；Q2月額和70,890、累計差額70,892，而季度報表印值70,891。均保留，以每一原值各自四捨五入的區間比對，不用固定1百万元上限、不改成一致。8季橋中的9個印值算式差異亦保留為±1百萬元；局部區間相容不是已證明全部差異由四捨五入造成，也不驗證未讀附註。

## 帳面價值與技術題材仍有界限

P3總權益166,902扣NCI12,505得共同股東權益推算154,397；股東權益組成項目和154,398的1百萬元差異另留區間比對。缺期末流通普通股數（扣庫藏股）及核對行情，BVPS與P/B皆為null；EPS平均股數7,547及股本金額不替代分母。Balance relay原估計秒数留作追溯，recordedAt按來源更正為2026-10-08T07:02:59Z，actualRenderTime與精確observedAt為null。

以上改變的是財務基線與待驗證問題，不證明Intel訂單、CPO量產、光互連客戶驗證或新增收入。先取得淨業外明細、稅／NCI與分部獲利，才能討論可持續獲利；diluted EPS、完整附註、公司行動及normalized earnings仍缺。沒有目標價、買賣或策略批准。

## 可重算與時點限制

執行 `python3 docs/research/2026-10-08-auo/recompute.py`，再以Node22及 `--experimental-strip-types` 執行同目錄 `hash-receipts.mjs`、`verify-evidence.mjs`。109個數值／來源格式／精度檢查及38個檔案／canonical hash檢查通過；六個輸出重跑bytes一致。這些是資料檢查，不是新產品tests。可選 `arithmetic-companion.ipynb` 供檢視；VM沒有notebook kernel，實際執行的是獨立腳本。

[dataset.json](dataset.json)、[source-ledger.json](source-ledger.json)、[calculation-results.json](calculation-results.json) 與 [hash-manifest.json](hash-manifest.json) 提供逐點、逐季收據。日期若只來自URL或簡報標示，並非精確發布時刻；mutable PDF只確定目前reader可見，所有歷史PIT eligibility皆為false。不能把2025文件中的2024比較欄倒填成2024已知。保留既有403／hosted reader失敗，不宣稱全來源啟用或完整研究完成。
