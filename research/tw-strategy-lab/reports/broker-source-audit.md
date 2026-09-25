# 券商研究來源稽核

稽核時間：2026-09-25 00:50:18 UTC。狀態：`research_only / metadata_only`。
本次沒有取得任何資料供應商合約、券商再利用授權或登入凭證，也沒有啟用正式資料接入。

## 已核查的引用鏈

[旺來個股頁](https://wowwow3100-ctrl.github.io/daily-report/stocks.html)明示其文件是公開新聞摘要，非原始券商研究。[9/24 聯發科摘要](https://wowwow3100-ctrl.github.io/daily-report/個股/聯發科2454/260924_瑞銀_聯發科2454.html)引用[經濟日報文章](https://money.udn.com/money/story/5607/9776183)。已閱讀媒體原文並核對具名券商、分析師、目標價前後值及兩個年度的 EPS 上修。這證明的是「媒體報導這項券商觀點」，沒有取得瑞銀原始文件，原報告日期、正式散布時間、EPS 會計基礎及目標期限仍未知。

`sources/broker-source-audit.json` 只保存來源索引和一則少量結構化、具歸屬的研究事實；不保存全文、付費文件或轉貼段落。新聞發布時間保留為 2026-09-24 19:16:37 +08:00，系統首次觀察與記錄時間保守採本次稽核完成時間；不能把新聞時間視為系統在昨日已取得資料。

## 旺來 repository 的可用性與限制

讀取固定 commit [`7d8ac61311a9eb2953ce0d6c375b407820a5b3e2`](https://github.com/wowwow3100-ctrl/daily-report/tree/7d8ac61311a9eb2953ce0d6c375b407820a5b3e2)。GitHub metadata 顯示 repository 於 2026-09-19 建立且 `license=null`；未發現可據以複製其程式或整套資料的開放授權。`stocks.json` 當時含 218 個股票資料夾。

- `sync_reports.py` 將本機 CSV 同步、DOCX 摘要轉為 HTML。
- `backfill_stocks.py` 由 CSV 重建歷史個股頁；`rec` 是最新紀錄日期，不是首次可取得時間。
- `wl-consensus.js` 以 CSV 最大日期形成 30/60 天視窗，文字辨識上修與目標價，同日資料取決於列順序。它不是不可變事件帳本。
- 資料夾同時存在 `中砂1560` 與 `中砂1650`，必須先以官方股票主檔查核代號及名稱，不能直接接受檔名映射。
- 原始券商、匿名法人及共識調查要分開分類。同一報告被不同媒體引用，不能當成多家獨立券商支持。

可借鏡來源索引及閱讀介面；接入應自行實作、追到可核查來源，且先確定使用權限。舊檔名或 Git 作者時間均不構成舊時點可取得證據。

## 原始來源與授權供應商

| 來源 | 已核查的邊界 | 接入方式 |
|---|---|---|
| [DBS 官方研究 PDF](https://www.dbs.com/content/article/pdf/CIO/2025/202505/CIOIndustryGuide_May2025.pdf) | 有原始分析師、評等、目標價；第65頁有完成及散布時分秒，也有限制複製及散布的條款。TSM 範例是美元美股標的。 | 可追溯原始出版資訊；正式取用／儲存／展示應依相應授權，不轉貼 PDF。 |
| [富邦投顧](https://fubonresearch.fubon.com/Research/Home/) | 公開日期與標題；多數個股全文須登入。標題旁股價不能逕當目標價。 | 官方索引與深連結；會員閱讀權不自動含 App 再利用權。 |
| [永豐投顧](https://scm.sinotrade.com.tw/) | 提供會員研究；[證券網站](https://www.sinotrade.com.tw/Stock/Stock_3_1/Stock_3_1_2?ticker=4533)明示未經授權禁止轉載節錄。 | 與提供者確認研究資料及公開展示權限。 |
| [FactSet Estimates](https://developer.factset.com/api-catalog/factset-estimates-api) | 有估計資料 API 及獨立 [PIT 共識產品說明](https://insight.factset.com/resources/at-a-glance-factset-estimates-point-in-time-consensus?hs_amp=true)。方法文章的覆蓋數字為2019年資料。 | 確認現行台股覆蓋、PIT版次、券商明細權限、內部運算與外部顯示範圍後再接 provider。 |
| [LSEG I/B/E/S](https://www.lseg.com/en/data-catalogue/company-data/ibes-estimates/broker-estimates) | 有來源、期間、幣別及正規化欄位；[產品文件](https://www.lseg.com/content/dam/data-analytics/en_us/documents/brochures/data-for-quant-research-brochure.pdf)區分PIT、當期與一般歷史資料。 | 不把一般歷史資料端點當成PIT保證；依實際資料合約實作。 |

## 研究模組接口

`report_events.py` 僅使用 Python 標準庫，不抓網路、不寫正式資料库。輸入為有界、結構化事實及來源。`normalize_report_event(raw)` 封存 `event_id/content_hash`；修改既有已封存事件會失敗，更正應以 `supersedes_event_id` 建立新事件。`append_report_events(existing, incoming)` 對相同重試保留一筆。

`evaluate_report_events(events, cutoff=..., symbol=..., rights_grants=..., max_age_days=60)` 回傳 `summary`、逐事件 `records`、`metadata_events`、`revision_features` 及 `eps_revision_breadth`。所有輸出為研究資料，不輸出買賣指令或績效主張。預設無授權，只有 metadata，不產生可用因子。

有效 `rights_grants` 是由外部經授權操作者提供的獨立紀錄：`grant_id/status/known_at/expires_at/evidence_url/permissions/broker_ids/source_types/source_domains`。必須包含 `factor_use`，且來源、券商及截止時間符合。明確 blocked 優先；`manual_pdf`、公網 URL、會員帳號與軟體 license 都不能代替權利依據。測試中的 grant 全部是合成 fixture，不能套到真實文章。

```bash
python research/tw-strategy-lab/report_events.py \
  --input research/tw-strategy-lab/sources/broker-source-audit.json \
  --cutoff 2026-09-25T01:00:00Z --symbol 2454
python -m unittest discover -s research/tw-strategy-lab -p test_report_events.py
```

時點採嚴格系統回放：取 first_seen、recorded、發布時間及 availability evidence known_at 的最晚值。資料沒有可取得證據時不進因子；今日補入舊報告不會進入昨日 cutoff。要做歷史市場知識重建需另行設計授權 PIT 歷史資料流程，不能降低本檢查。

報告新鮮度另採預先固定的 60 日視窗；API／CLI `--max-age-days` 可明確指定 1–365 的整數，必須在分析前決定。先取原報告發布時間，其次媒體發布時間，再其次報告日期；只有日期時從台北當日 00:00 保守計齡，不能用首次抓取時間讓舊報告重新變新。剛好視窗邊界仍有效；超窗或完全沒有發布日期，只保留 metadata，不產生因子。輸出 `age_policy` 及每筆 `records.freshness` 可供稽核。已知撤回或更正先套用，即使其報告日期過舊，也不讓被撤回的舊版本復活。這只是研究資料可用性檢查，沒有啟用 S7 策略。

EPS 只比較同財年、同會計基礎、同貨幣與每股單位。零基期、虧損或轉盈保留方向及轉換類別，不硬算一般成長率。新聞只寫上修百分比而未給前值時，保留 `reported_change_pct`，不反推出看似精準的舊數字。目標價期限或股票基礎未知會標成不可用；首次覆蓋及重申不算升等。各財政期間與基礎分開計算券商集團廣度；報告轉述先去重，同時點相互衝突則排除因子。

## 正式程式後續修復項目

本次只改研究目錄。現有 `web/src/lib/candidate-factor-builder.ts` 的 `brokerEvidenceRowsFromSnapshots()` 可因 manual/import 模式認定 lawful，即使沒有明確 grant，甚至 blocked 亦可能被模式覆蓋。此處應另立正式修復與回歸測試；不在本次研究模組內偷偷修改。

正式接點仍是 `broker_consensus_snapshots` → `brokerResearchFactor()`。現有來源覆盖分與本模組的預期變動是不同指標，不能把媒體篇數直接加到來源廣度，更不能用目標價驗證自身策略的真實收益。
