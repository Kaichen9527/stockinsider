# 台股策略研究工作區

本輪是離線研究；不呼叫正式資料庫、不發布文章、不部署、不改目前模型資格。使用者已授權在 Chat 完成研究程式與反覆驗證，Contabo 擴容延至最後評估。

## 現在有哪些策略

| ID | 假說 | 第一輪狀態 |
|---|---|---|
| S1 | 量增突破 | 可執行研究訊號；與既有 TypeScript 公式做一致性測試 |
| S2 | 多頭回測確認 | 可執行研究訊號；與既有 TypeScript 公式做一致性測試 |
| S3 | 每週相對強勢 | 可執行固定 panel 比較；至少五個完整樣本，尚非歷史產業輪動 |
| S4 | 波動收斂後突破 | 可執行研究訊號 |
| S5 | 營收成長加速 | 缺歷史實際發布與更正流水，維持 blocked |
| S6 | 多頭中的短期急跌反轉 | 可執行研究訊號 |
| S7 | 券商 EPS／評等修正 | 缺授權 PIT 事件資料，維持 blocked |

可執行不代表獲利已驗證。第一輪固定五套价格規則，每套三個成本／資金情境，不搜索參數。2018 暖機、2019–2023 開發；2024 年起不下載、不開啟、不運算。半年窗口是同一投組資金曲線的描述性切片，不冒充獨立樣本外回測。

原始 panel：2330、2317、1216、2882、2603、6488、5347、8069。這是今天選定的倖存樣本，**不是 App 當年的完整篩選名單或全台股母體**。價格／日曆缺口與未完成建模的公司行動會事先排除並留下八檔原分母。完整歷史名單、下市處置、公司行動、資料授權與分鐘成交仍是後續驗收項目。

## 可重跑命令

在 repository 根目錄執行，Python 3.11+，不需新增 Python 套件。訊號一致性測試另使用 repo 的 Node 22 runner。

```bash
python -m unittest discover -s research/tw-strategy-lab -p 'test_*.py'

python research/tw-strategy-lab/official_data.py \
  --root /tmp/stockinsider-official-research \
  --cache /tmp/stockinsider-official-research/cache \
  --output research/tw-strategy-lab/data/normalized

python research/tw-strategy-lab/run_research.py \
  --data research/tw-strategy-lab/data/normalized \
  --output research/tw-strategy-lab/results/official-development-v1

python research/tw-strategy-lab/report_events.py \
  --input research/tw-strategy-lab/sources/broker-source-audit.json \
  --cutoff 2026-09-25T01:30:00Z
```

資料擷取最多兩個並行連線、每秒一個新請求、逾時十五秒、最多兩次重試。684 個基礎來源涵蓋行情、含息指數與公司行動，另有有界的權息詳表。URL、實際取得時間、SHA256、數值單位與缺漏均保留。公開歷史 API 的完整再散布授權未確認，原始 cache 及完整 normalized 資料不推送 GitHub；數值研究結果與來源 manifest 可供檢查。

`preregistration.sha256` 鎖住首次績效運算之前的規格。Runner 核對 registry、實際假設、資料 hash、期間與樣本；每次必須使用新輸出目錄，保留全部情境、blocked 與失敗紀錄。不要為了覆寫舊結果而刪除輸出目錄或改 checksum。修正缺陷必須留下新 source commit 與新 run，原結果標示失效原因。

`wait_and_run.py` 可在已啟動的 downloader 完成後接續跑一次研究（預設最多等待兩小時）；它不會自行下載、修改策略、commit 或部署。Chat 排程負責查看真實結果、審查與提交。

## 成交與資金限制

- 訊號收盤後形成，隔一個官方市場交易日才可成交；限價、股數、現金預留都在看到开盤之前固定。
- 買入限價可能成交於 entry lower 下方，必須承擔跳空；不利用開盤後資訊假裝回到同一開盤下單。
- 賣出遵循收盤觸發、下次可交易開盤執行；排隊與特殊漲跌幅無法由日 K 證實，全部標為 daily auction proxy。
- 每邊佣金 0.1425%、最低 20 元；賣出稅 0.3%；每邊滑價至少 10 bps 或一個合法 tick。另做雙倍摩擦與 100 萬資金情境。20 元是本次模型假設。
- 每股上限 10%，整張 1,000 股，買入規模限制為前二十日成交金額中位數的 1%。不能使用同一開盤賣出後尚未確定的所得先買入。
- 只處理已核實的純現金股利；缺入帳日的股利是不可再投入的應收款。持股與未成交不能因不利於績效而消失。
- TAIEX 含息指數不含本研究費稅且全額投入，不能拿簡單報酬差宣稱 alpha；另列同完整 panel、每股初始 10%＋餘額現金的同成本持有參考。

## 每個篩選標的與文章

`article_builder.py --snapshot SNAPSHOT.json --research RESULTS.json --output-dir NEW_DIRECTORY` 對每個輸入候選產出歷史研究稿、`coverage.json` 和不可直接執行的 `update-queue.json`。

Snapshot 必须有 revision、帶時區的 as_of、complete、expected_count、candidates；每股需 symbol、name、revision、common_stock、TWSE/TPEX 及 authority_ref。完整度未知就標 blocked，不能用公開首頁可見清單冒充全部資料庫候選。每股七套策略必須各有 terminal；沒有個股績效就不從組合績效推算。`preview_ready` 僅代表稿件可審閱，queue 永遠 dry_run／publish_allowed=false。

真正更新所有線上文章仍要取得完整候選快照，在受保護 pipeline 完成 authority 補齊、重新研究、儲存 revision 與逐股對帳。本輪不改寫歷史決策、不宣稱正式文章已更新。`candidate-dossier-bundle` 的 GET 會寫入資料，不能當成唯讀匯出。

## 後續 Chat 接續檢查點

### 最新：2026-09-25 第一輪 CI 成果已核對

研究 run `36081668572` 已於 `2026-09-25T01:35:22Z` 完成；執行 source 仍為 `e1fb505a894105e05fb08aa28fd0fb8ad8e520fa`，不是本次成果匯入 commit。原始衍生檔完整保留於 `results/github-36081668572-1/`，核對收據為 `results/github-36081668572-1-audit.json`；詳細解讀見 `.agent/reports/2026-09-25T0148-tw-strategy-ci-review.md`。

684/684 基礎來源與 5 份詳表取得，不代表八檔都可回測。完整 cash-only 子樣本為 **1216、2330、5347、6488、8069**；2317、2603、2882 因公司行動／交易日缺口排除。十五個固定情境均執行，另保留 S5/S7 blocked；S4 三情境零訊號、零交易。沒有新增參數、改 freeze、開啟 2024+ 或重跑下載。

基準淨年化：S1 **0.02%**、S2 **-1.03%**、S3 **1.23%**、S4 **0.00%（零交易）**、S6 **-0.10%**。同樣本買入持有參考為 **13.83%**，但曝險不相等，不能宣稱 alpha。這不是已找到「好策略」；下輪優先審查零訊號、成交拒絕與資料缺口，不用事後調參製造目標報酬。

`results/public-article-preview-2026-09-25-v3/` 將實際結果接到原來 40 檔舊公開候選，逐股七策略 terminal 與稿件雜湊核對完成。只有 2330、5347、6488 與研究 panel 重疊；40 篇仍全為 blocked，正式文章更新 **0**。舊 v1/v2 均保留。完整 authoritative snapshot、逐股 authority、其餘 156 個舊公開卡片及當前全候選仍未取得。

此核對只獨立重算衍生曲線與 fills；CI 未保存原始／normalized CSV，因此 manifest hash 可核對，但不能聲稱本地重新驗證其原始位元組或完整重播資料。後續可先完成獨立來源／引擎審查；不要把此收據當成 exact-review attestation 或部署許可。以下是保留的歷史起始紀錄。

### 2026-09-25 訊號與成交漏斗診斷

`results/github-36081668572-1-diagnostics.json` 與 `.agent/reports/2026-09-25T0250-tw-strategy-signal-diagnostics.md` 保留第二個有界迭代。沒有新回測或參數變更。

S1/S2 原始 signal count 含不可下單的 `avoid_chase`，實際可下單為 76/162，不是 146/225；引擎只處理 eligible，績效未受影響，但報表語意需在未來新 runner 修正。S3 的 170 次可下單中 101 次因已有持倉而略過；正報酬高度集中於一筆 8069 大贏家。S6 勝率 60% 仍因平均虧損幅度而呈負總報酬。

使用已保存的 155/684 checkpoint、未新增連線，檢查 1216/2330 的 2019 全年與 5347 至 2019-11-29：704 個有效視窗中，S4 的凍結 ATR5/ATR20 ≤0.60 壓縮門通過 0；最低值約 0.656，所有其他門都通過的最近候選約 0.731。程式、registry 與合成測試一致，尚無程式缺陷證據。任何放寬都是新假說，必須另開 registry／run，不能覆寫本次零訊號結果。

### 2026-09-25 公司行動與股息會計核對

使用者保存 checkpoint 的 `corporate_actions.csv` 與 CI manifest 記錄的 14,538-byte 輸出 SHA256 完全相同。本輪因此獨立核對 69 筆公司行動：所有 74 個 source/detail hash 引用都可回連到 CI source manifest；五檔完整子樣本合計 47 筆均 resolved、`share_factor=1`、`cash_return=0`。2317、2603、2882 的七筆 unresolved 公司行動及兩檔交易日缺口亦與 `blocked_symbol_years`、coverage 一致。詳細收據在 `results/github-36081668572-1-corporate-action-audit.json` 與 `.agent/reports/2026-09-25T0351-tw-strategy-corporate-action-review.md`。

63 筆正現金股利均缺實際付款日；引擎在除息日將權利列為應收資產，但不讓未知付款日的款項再投入。S1／S2／S3 期末應收款分別為 NT$29,543／18,000／127,285；只做終值拆分、扣除應收款後的總報酬為 -0.19%／-5.22%／+5.01%，不是重跑後的反事實績效。同樣本買入持有期末應收款為 NT$1,375,039，說明其基準亦非完全再投入版本。

新增 `proposals/robustness-study-v2.json` 但狀態為待審、未執行，SHA256 鎖定為 `94fd91733a0474a2ed65e5c96fc1c2bad4559a68354dfba4b2f57e980ddfbac5`。它只有限登錄報表修正、S3 集中度檢查、兩個結果知情的 S4v2 候選與股息可用日敏感度；不改 v1 freeze、不挑開發樣本最佳值、不動 2024+。完整 normalized prices 與獨立審查未補齊前不啟動。

### 2026-09-25 成交時序與 tick 審查

`results/github-36081668572-1-execution-audit.json` 與 `.agent/reports/2026-09-25T0452-tw-strategy-execution-review.md` 留下第三個有界審查。官方 TPEx 普通股表確認現有 tick schedule 正確；TWSE 多商品寬表的純文字欄位錯位曾形成候選 finding，但在交叉核對後否決，沒有誤改引擎或宣告舊 run 失效。

15 份固定情境共 851 筆成交、615 個訊號及 1,446 個非空訊號價位通過 22,744 個針對性 assertions：非法 tick、非整張、非隔日買進、同開盤賣後買回及負現金均為 0。新增一項 engine/strategy tick 邊界一致性測試，不改策略或績效。仍缺逐日官方競價基準、處置／特殊交易狀態與委託簿，故 fills 只可稱保守 proxy；付款順序、費稅整元及重複公司行動防線列為低度後續。第一輪績效目前不失效，但也沒有升格。

### 2026-09-25 robustness-v2 規格審查

`proposals/robustness-study-v2-review.json` 與 `.agent/reports/2026-09-25T0548-tw-strategy-robustness-review.md` 對鎖定的 v2 提案做可計算性審查；沒有執行新試驗、改參數、連線或讀取 2024+。原提案 SHA256 維持 `94fd91733a0474a2ed65e5c96fc1c2bad4559a68354dfba4b2f57e980ddfbac5`，狀態改由審查收據阻擋，不回寫原檔。

S3 的 36 筆 baseline 完成交易中，單筆淨報酬中位數為 **-1.96%**，profit factor 為 **1.58**，最大贏家占所有正獲利 **42.21%**；成本壓力 profit factor 為 **1.31**。扣除未知付款日應收款的終值拆分仍為 baseline **+5.01%**、成本壓力 **+2.54%**。中位數與最大贏家兩個明確門檻已失敗，因此 S3 維持 exploratory。

正式 R2 決策仍被單一股票集中度定義阻擋：以正獲利交易按股票加總，8069 占 **64.87%**；若先把同股票虧損互抵再除以全體正獲利，則為 **31.51%**，會導致相反 gate 結果。另 R4 的十條路徑未說明是否只跑 baseline（若三個情境全跑應為三十條），也未固定次日股息是在開盤下單前或後可用；R1 的 bit-for-bit 比較欄位亦未完整列舉。故 R1–R4 均未授權執行，需另建有新雜湊的修訂案再審。

### 2026-09-25 robustness-v2.1 契約修訂

新檔 `proposals/robustness-study-v2.1.json` 沒有改寫 v2；SHA256 為 `4379960b4d1406bee97fcf54fa0f99e832abdefa1ed9a5111d04f2d25748270a`，狀態為 `review_candidate_not_executed`。`proposals/robustness-study-v2.1-validation.json` 的 42 項結構斷言全數通過，但這只是契約完整性，不是回測或獨立審查證據。

R1 固定五策略乘三情境共 15 次重播，完整舊 result object、原 signal rows 與六欄 ledger projection 必須 canonical equal；新增計數只能放在分離的報表物件。R2 明定 concentration 只加總各股票的正 `net_pnl`，不以同股虧損互抵，並固定零勝／零損處理。R3 仍是 0.70／0.75 乘三情境的六個結果知情假說。R4 明定只跑 baseline，五策略乘兩路徑為十條；樂觀路徑在次一交易日開盤下單 sizing 前釋放現金。

完整執行需 15 + 6 + 10 = **31 條新模擬路徑**；R2 只讀兩份登錄診斷資料、不新增模擬。現仍缺另一位審查者接受精確 v2.1 雜湊，以及 dataset hash `a89bf8e5cbcfc464463a53c29f1f5f68f6419d72f2a06befcaeb008e3cff5cca` 對應的 exact normalized inputs，故 execute 仍為 false；不能執行 S4v2、發文、合併或部署。

### 2026-09-25 券商因子授權 fail-closed 修復

`results/broker-factor-rights-fix-2026-09-25.json` 與 `.agent/reports/2026-09-25T0750-broker-factor-rights-fix.md` 記錄一項正式程式的高嚴重度缺陷及修復。舊 mapper 可把 `manual_pdf/manual_csv/imported_pdf` 視為 lawful，且 `lawful=true` 可能蓋過 `blocked`；三個未授權來源因而可能拿到完整券商證據分數。

新 mapper 只接受明確 `licensed`／`permitted`，`blocked`／`unknown` 必定先拒絕；手動或匯入模式只保留為 provenance。snapshot rebuild 也明列 `license_status=unknown` 及 `source_mode_is_not_factor_use_grant`。專項 Node 測試 **8/8**、TypeScript、Next production build（91 pages）通過。

UBS／2454 仍為 metadata-only、usable feature 0，S7 仍 blocked；第一輪價格策略 run 未使用券商因子，故不失效。本修復尚未部署或改正式資料。未來經審查部署後仍須以 guarded pipeline 重建 snapshots，且沒有獨立 factor-use grant 的舊資料繼續不得計分。

### 2026-09-25 當前篩選標的發布完整性修復

`results/screened-publication-coverage-fix-2026-09-25.json` 與 `.agent/reports/2026-09-25T0850-screened-publication-coverage-fix.md` 記錄一項高嚴重度缺口。舊流程雖將當前篩選標的納入研究 ledger，發布核對卻只檢查已存在的 stage cards；只由篩選命中、沒有近期來源提及的 found 標的可能沒有公開卡片，仍不會形成 mismatch。

修正後，當前篩選名單在排除 cutoff 官方普通股 master 之外的代碼後，會成為發布必需名單；stage projection 必須為每檔帶出卡片，且 publication gate 必須逐檔核對同輪 saved revision 與 compact trade-plan summary。缺卡、名單無效／重複、未進研究 roster、舊 revision 或摘要漂移均 fail closed。專項測試 **17/17**、TypeScript 與 Next production build（91 pages）通過。

這仍不是正式全量驗收：本輪沒有讀寫正式資料庫、沒有跑 guarded pipeline、沒有發布文章。既有 40 份 blocked 預覽與正式更新 **0 篇**均不變；完整 authoritative snapshot 和其餘舊公開候選仍缺。

### 2026-09-25 GitHub 遠端 source transport 修復

PR head `7810eae66561f100d77ae180d5fb852472fb7514` 的 product-runtime check 在 TypeScript 起點失敗：GitHub 上的 `web/src/lib/research-v2.ts` 被判定為 binary。`results/remote-source-transport-repair-2026-09-25.json` 與 `.agent/reports/2026-09-25T0948-remote-source-transport-repair.md` 核對到遠端 blob 只有 180,061 bytes、無法 UTF-8 讀取；本地已通過上一輪 typecheck/build 的正確檔案為 280,941 bytes，Git blob `bf1654ba05aa5728b47cbc2a9455df7f98d390c2`。

這是遠端傳輸損壞，不是策略或研究資料缺陷。修復必須以新 commit 上傳精確本地 bytes，保留 run `36115793913`／`36115791000` 的失敗紀錄並等待新 checks。Requirements／Architecture／Exact-review 另因最新 head 缺獨立 review branch 而失敗；不得用本修復假冒審查證據。

2026-09-25 01:12 UTC 的實際狀態：Chat 執行環境以 network policy 中止 TWSE 連線，下載已停止，留有 155/684 個基礎來源及 5 個詳表；本地 continuation 已停止，不能再描述為仍在背景下載。`sources/local-acquisition-checkpoint.json` 記錄此阻擋。

新增 `.github/workflows/tw-strategy-lab.yml` 使用 GitHub 的隔離研究 job，以唯讀權限、精確 PR head、90 分鐘上限執行同一份測試／bounded acquisition／固定研究。它是額外研究工作，不是現有 protected gate，也不授權 merge／部署；沒有正式 secrets、SSH、資料庫寫入或自動推送。只保存衍生研究結果與來源 manifest，不公開完整原始快取。需以實際 workflow run／artifact 確認是否成功，不能僅憑 YAML 存在宣稱已跑完。

公開日報舊快照目前只觀測到 40/196 個 found-stage 標的；其餘四次分頁讀取逾時，Hot／weekly 也未取得。`results/public-article-preview-2026-09-25-v2/` 的 40 篇均為 blocked 研究預覽，並列出 2026-09-12 內容日期；不是所有線上文章的完成更新。

1. 讀取 `openspec/changes/tw-strategy-lab-v1/`、本 README、最近 results 與 `results/job-status.json`（如果本地仍存在）。
2. 已有 downloader 或 continuation 在工作就接續觀察；不要重複下載或同時寫結果。缺少工作區時從本研究分支重建，使用 bounded downloader 的 cache 續傳。
3. 先完成固定的十五個開發情境，與指數、同樣本持有參考比較，保留所有不佳結果。修程式錯誤需要新 run／新紀錄，不透過提高回報來判定修復成功。
4. 如果要新增策略參數，先形成新的有限 registry 與研究次數紀錄；不能覆寫本次 registry，也不能開啟保留資料後繼續宣稱未看過。現階段不宣稱有 OOS 證據。
5. 審查結果、資料缺漏、文章實際覆蓋範圍與測試／建置；提交研究分支及草稿 PR，絕不 merge、部署、購買擴容或刪除正式機資料。
6. 十小時窗口結束彙整實際可重跑策略、淨績效、風險、未達門檻與下一步。不能保證週 5%、月 10%、年 50%，也不能把歷史獲利改寫成未來承諾。

部署前仍需精確來源審查、正式補資料及全候選驗收。最後才在 Contabo 實測容量；容量不足時先列出可核實的備份／回收或擴容方案，不繞过現有安全保留門檻。
