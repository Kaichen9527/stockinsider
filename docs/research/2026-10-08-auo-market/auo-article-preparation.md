# AUO 真實研究稿：下一輪 VM 有界工作準備

狀態：證據／章節與缺口整理，`draft/incomplete`。不是已驗證的 `candidate-deep-research-v1` article payload，不建立虛構 sourceDocumentId、officialFactId、job、reservation 或 prepared-input hash。來源均沿用既存 relay/dataset；本次沒有新增取得、模型工作或文章審查。

使用既有 `web/src/lib/research-deep-article.ts` 的七章順序及已批准 `openspec/changes/evidence-valuation-research-v6/auo-deep-research-template.md`。文章中分清 `reported`、`rumor`、`inference`、`scenario`；來源真實性及引用資格不能只由模型標記成 `verified`。下表的文件路徑和 URL 是研究定位，不是正式資料庫 citation ID。

| 既有章節 key | 已可整理的真實內容／證據定位 | 寫稿仍須保留的缺口 |
|---|---|---|
| `market_expectation` | 市場 dataset 的 268 根原始價量／TAIEX；10/8 收36.60，高於 MA20/60/240、低於 MA5，5日相對回報為負、20/60日為正。不能寫成「尚未上漲」。 | 原始價未調整；X不比價、公司行動、正式交易日曆／最新完成 session 及籌碼未核對。價格不是成交或市場共識證明。 |
| `industry_position` | 友達8/31官方正文 relay 區分 Micro LED 短距光互連與玻璃核心基板/RDL；Intel2023玻璃基板官方材料與專利 US20240079530A1 是技術／競爭脈絡。 | 同技術方向不等於友達客戶驗證、Intel訂單或商業量產；缺最新競爭者、客戶採用、產品經濟與分部毛利。Intel一般技術材料只能標 `industry_context`；不能移作 company-order 引用。 |
| `rumors_and_orders` | CNA 9/21及經濟日報具名記者轉述匿名業界合作說法；報導當時 Intel不予評論、友達稱共同研發但未具名。PC Gamer明確引用經濟日報，保留同一新聞根源。 | 傳聞仍是 `rumor`，不丟棄也不升為已確認訂單；轉載不增加独立root。未核對當前合作／否認與授權專利版本，不能把報導當時說法擴成10/8現況。 |
| `earnings_transmission` | 金融 dataset 24月合併營收、8季損益核心欄位。2Q26 op218＋net nonop2533＝pretax2751，tax−631→net2120，NCI777→owners1343；基本EPS0.18。8季有5季營業虧損。 | 只是8季核心損益，非8季完整附註。淨業外不等於全一次性；缺業外明細、稅/NCI可持续性、稀釋股數、ADLINK合併可比口徑、四個未發布季度預測及2026/2027 normalized earnings。 |
| `valuation` | AUO已批准的 `cyclical_asset` 路徑；2Q26共同股東權益推算154397百萬元，保留印值1百萬元差異與來源精度區間。 | 缺期末普通股淨庫藏股、forward common-equity/OCI/dividend橋、48個月歷史PIT BVPS/PB、倍數依據及正反估值。不得以EPS平均7547百萬股或總權益含NCI替代。BVPS/PB/目標價仍null。 |
| `entry_conditions` | 既有 technical-features-v3.1.0、tw-entry-plan-v0.1；只描述 raw exploratory 指標及量比0.542。原門檻不改。 | 正式 phase=unknown、relative=null；缺調整價、日曆、相鄰official close確認與已批准策略/研究資格。指標不形成自動進場、用戶持倉或成交。 |
| `next_evidence` | 將原來缺資料縮小為具体問題：淨業外來源、期末股數、公司行動、客户商業證據與下一次正式財報。 | 2026Q3月額和66876不是Q3財報實績；10/29法說在既存index relay是預定，未到時不提前當實績。缺資料／403要列取得失敗，不寫無相關消息。 |

## 可追溯材料

- 財務：`../2026-10-08-auo/dataset.json`、`source-ledger.json`、`calculation-results.json`；data commit `debed842cbc432ef62f8915eea085d6d9f1b66fe`，unsigned scoped資料核對不涵蓋附註、論點或發布。
- 市場：本目錄 `dataset.json`、`root-market-relay.json`、`source-notes-relay.json`、`vm-canary.json`；exact `c16bc52271eaf733b7ca69d0cc747d123a5d2ad6` 收到 unsigned scoped資料／算式approval，追溯見 `unsigned-exact-market-review-relay.json`；不涵蓋文章論點。原始28 HTTP檔仍留Mac；VM只有必要欄位relay與實際403失敗。
- 公開正文摘要及失敗歷史：`../../operations/2026-10-08/deep-private-draft-public-preparation-relay.json`、`deep-private-draft-relay-followups.json`。AUO正文 URL `https://www.auo.com/zh-TW/News_Archive/detail/News_Archive_Product_20260831`；新聞root `https://money.udn.com/money/story/5612/9766808`。不複製媒體全文。

## 下一輪30分鐘 VM工作的最小交付

先從上述不可變資料與來源 clocks 建立一份人可讀的AUO實質研究草稿，依七章排列，每個段落附實際文件定位／URL、證據類型、觀察與發布精度、根源及可反證條件。對缺口可寫明「未知」，不可捏造商業量產季度、數量、稀釋股數、稅率或情境EPS來湊契約。

現有 article validator 要求七章、至少一個有引用的catalyst、固定三種情境 `existing_business`／`conditional_commercialization`／`delay_or_failure`，以及有算式支持的 baseline bridge 和股數；段落來源須為正式可用ID，source clock須符合cutoff。現有relay沒有正式ID或精確publication clock；財測亦未完備。因此本輪準備不能宣稱 validator 已通過。AUO主要P/B模型也不能用通用PE情境替代。

若下一輪仍缺上述輸入，交付真實内容的 `draft/incomplete` 與逐段缺口即可，不造fixture文章、不建新發布系統。已存在的private draft controller只能在真实原job/owner/attempt/reservation、可信prepared hash及当前租約條件下接收產物；沒有合法prepared input時只保存普通私有研究稿，不假裝正式handoff。完成後再安排獨立budgeted review；maker GPT-6.1 Sol High／independent reviewer GPT-6 Astra High 的amended分工保持不變。

VM准入只看VM實測資源與有界單重型工作；VPS不足僅限制VPS重型作業／正式交付，不能阻止VM寫稿、資料驗證或隔離功能工作。本文件沒有授予模型呼叫、策略批准、發布、部署或排程。
