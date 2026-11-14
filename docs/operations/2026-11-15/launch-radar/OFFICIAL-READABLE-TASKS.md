# 官方樣本：可讀任務、目的地與精確最小輸入

已測程式版本：**e4bd698aa0ae716a193354db1a41b5335f240ace**，Node22.14.0。CLI 是**離線私有原始資料解析器**，不擷取、不啟動服務、不連 DB、不執行 writer、不讀環境憑證。完整閉合 schema 與64個已知端點／原觀測 hashes／時鐘見 [consume contract](../../2026-11-14/launch-radar/PUBLIC-EXCHANGE-HANDOFF.md)。名稱中的 `public` 指交易所來源，**不代表原始資料可公開重製**。

## 可直接供協調端執行的最小讀取任務

先做A即可驗真正 TWSE bytes 的 parser；B需要另有私有研究／staging用途權限，絕不以可公開存取推定重製權。

| 任務 | 固定端點／期間 | 上限 | 可驗內容與未涵蓋事項 |
| --- | --- | --- | --- |
|A：一份TWSE指數月報 |`https://www.twse.com.tw/rwd/zh/TAIEX/MI_5MINS_HIST?response=json&date=20261001` |1response，500,000bytes |原始bytes/hash、日期、收盤指數schema；不足200日，不算完整市場分 |
|B：一份TWSE法人日報 |`https://www.twse.com.tw/rwd/zh/fund/T86?date=20261113&selectType=ALL&response=json` |1response，5,000,000bytes／50,000rows |2330唯一列，外陸資排自營／投信六個買賣淨欄與整數算式；不足20日，不能接精確成交量分母／CA資格 |
|C：一份TPEX指數月報 |`https://www.tpex.org.tw/www/zh-tw/indexInfo/inx?date=2026%2F10%2F01&response=json` |1response，500,000bytes |日期／收市schema；不足200日 |
|D：一份TPEX法人日報與群組表頭 |`https://www.tpex.org.tw/www/zh-tw/insti/dailyTrade?date=2026%2F11%2F13&type=Daily&response=json&sect=EW`，另下列官方HTML |JSON500,000bytes／5,000rows；HTML500,000bytes |6488與完整25欄群組綁定；2/3→4及11/12→13買賣淨算式。無完整HTML群組證據維持gap |

D的schema來源固定為 `https://www.tpex.org.tw/zh-tw/mainboard/trading/major-institutional/detail/day.html`。只保留實際HTML bytes；若表頭只在動態渲染或其他文件，不能把自行製造的HTML或caller欄號當作官方群組證據。原先觀測摘要沒有raw bytes，不能從hash反推。

每個最小任務最多一次讀取；HTTP／平台拒絕或來源不合schema即留FAIL/BLOCKED，不換主機、不去掉代理、不改TLS、不自動重試／改日期。A–D只在協調端已獲准的隔離來源環境讀取；Cloud目前沒有成功取得官方raw，本文件不改其網路或身份。擷取使用既有官方URL helper／來源程式，真實記錄使用的source版本與complete-body capture clock，不能以檔案mtime或重播時間代替原取得時間。

## 合規目的地

- **現有受限隔離staging的私有暫存／tmpfs**：在已批准用途內進行離線解析；使用全新0700工作目錄、0600資料檔，不連正式DB／服務，不接正式secret。這可沿用協調端剛完成PTT重播的隔離流程，無需把raw送到Cloud。
- **本repo公開Git／公開Actions artifact**：只放去敏URL／hash／真實時鐘／判定。T86原始資料公開重製未核實，**不得放raw**；私有PTT亦不得放入。公共repo的artifact不可當作私密儲存。
- **政府開放CSV**：11755／11391／11856的授權、原resource完整URL、顯名與CSV表頭需獨立綁版本。既有JSON不因數值相同或`open_data`參數繼承該授權。此版只解碼上列JSON，未實作CSV decoder；不要拿CSV冒充JSON bytes。核對後的CSV最小樣本可走相應授權允許的目的地，需另一明確decoder版本。

若有**已核准私有傳輸目的地**，才考慮正常artifact/file工具交換，先提供repo/run/artifact/source/digest與用途權限，禁止傳signed URL／token／password。現在未配置這種私有raw傳輸，不能要求把未授權內容放公開GitHub來補缺口。不產生任何金鑰或新grant。

## 任務A的精確manifest形狀

以下是**不可直接通過的佔位範本**；每個 `ACTUAL_*`、bytes、hash必須來自真正擷取。`sourceCommit`填實際capture使用的來源版本，不能把未執行的版本當作collector證據；CLI本身的replay版本另固定為e4bd698。非workflow來源使用三個null；不得虛構workflow run。

```json
{
  "schema": "launch-official-public-replay-v1",
  "parserContract": "twse-t86-taiex-and-tpex-dailytrade-inx-v1",
  "targets": [{"market":"TWSE","symbol":"2330"},{"market":"TPEX","symbol":"6488"}],
  "throughSessions": ["2026-11-12","2026-11-13"],
  "cutoff": "ACTUAL_ANALYSIS_CUTOFF_AFTER_CAPTURE_COMPLETION",
  "capture": {
    "repository": "Kaichen9527/stockinsider",
    "sourceCommit": "ACTUAL_CAPTURE_SOURCE_COMMIT_40HEX",
    "workflowPath": null,
    "runId": null,
    "runAttempt": null,
    "startedAt": "ACTUAL_CAPTURE_START_ISO",
    "completedAt": "ACTUAL_CAPTURE_COMPLETION_ISO"
  },
  "indexMonths": {"TWSE":["2026-10"],"TPEX":[]},
  "flowSessions": [],
  "responses": [{
    "market": "TWSE",
    "kind": "index_month",
    "requestKey": "2026-10",
    "sourceUrl": "https://www.twse.com.tw/rwd/zh/TAIEX/MI_5MINS_HIST?response=json&date=20261001",
    "observedAt": "ACTUAL_COMPLETE_BODY_OBSERVATION_ISO",
    "publisherPublishedAt": null,
    "httpStatus": null,
    "redirectCount": null,
    "contentType": null,
    "bytes": 0,
    "rawSha256": "ACTUAL_ORIGINAL_BYTES_SHA256_64HEX",
    "body": {"encoding":"file","path":"bodies/twse-index-202610.json"}
  }],
  "schemaEvidence": []
}
```

HTTP status／redirectCount／Content-Type有真正transport記錄才填，未知保持null。日期only報表的原發布時刻保持null。`startedAt <= observedAt <= completedAt < cutoff`，全部用真實時鐘；11/12、11/13僅為歷史session標籤，不能把之後下載時間回填為當時可知。

B在同一閉合形狀使用 `indexMonths:{"TWSE":[],"TPEX":[]}`、`flowSessions:["2026-11-13"]`，response的kind=`institutional_day`、requestKey=`2026-11-13`、上述T86精確URL及真實body描述。C改為TPEX單月。D另填schemaEvidence，欄位kind/sourceUrl/observedAt/bytes/rawSha256/body，kind=`tpex_flow_group_header`。缺任何raw／表頭時允許 `body:{"encoding":"absent"}`作metadata/gap輸入，**不能算真正raw parser正例**。

隔離程式副本的根目錄下，建立全新 `work/official-minimum`（0700）及 `bodies`（0700），放manifest與body（0600）。然後執行：

```sh
node --experimental-strip-types web/scripts/launch-official-replay.mjs \
  --root work/official-minimum \
  --manifest work/official-minimum/manifest.json
```

需要Node22.14.0與鎖定parse5/其entities依賴；不需production env。程式只允許該私有work根下已驗FD，拒絕符號連結、路徑越界、過量bytes、錯hash／日期／欄位／算式，錯誤訊息不帶原文。輸出是hash、筆數與缺口，沒有原價格／股數／正文。成功schema replay仍全為false authority，也不會自動送queue或發榜。

完整兩日資料再擴為各市場2026-01…11的11個月、10/14…11/13的21個**已觀測**法人日（精確日期與64URL在handoff），每次評估選自己的200／20視窗。全包含schema最多68pages／112MiB。來源日期仍須與真正已驗calendar、240價歷史、精確51日量能、三個CA feeds版本逐一綁定；6488的57筆exact-share摘要與2330雙源現金股利事實尚未建立raw／typed-event bridge，不解除現有拒絕。這不是兩個真實收盤榜單或runtime producer啟用驗收。
