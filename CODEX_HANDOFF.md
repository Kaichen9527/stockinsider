# StockInsider：Codex 接手唯一入口（2026-09-27）

> **這是交接資料分支，不是已批准的部署版本。** 先讀本檔，再讀指定來源的 AGENTS／Loop 規範。
> 不需要重讀整段 Chat。不要部署本交接分支、不要把既有綠燈套到不同 commit。

## 1. 先確認哪個版本才是來源

| 用途 | 分支／PR | 本次確認的完整 commit |
|---|---|---|
| 受保護 main | main | `169aad1b6cfa747f78ae3464b614f43c0749d806` |
| 產品、研究、營收簡報 | PR #284 / codex/tw-strategy-lab-v1 | `54a45ef7095d61e928b7e23bcd0d8961a505acee` |
| 新版簽章執行器候選 | PR #285 / codex/host-v319-compatibility-20260926 | `a42a11af7cf6a829209b7127962e01bfe969b143` |
| 原31組研究實際運算來源 | 歷史已審查來源，不是最新部署版 | `c3522eac9ec9f5712ae094c3864b1da50664e829` |
| #284 精確審查三份證據 | evidence/source-led-opportunity-v3-exact-review-54a45ef7095d61e928b7e23bcd0d8961a505acee | `00cdb03ceac34e2a6e35f98c02d64d61fa2b01eb` |
| 31組完整結果／log | evidence/chat-20260926-c3522ea-results | `797e6f9f5492f568f1200b4660ee49594459c6c2` |
| 授權後兩PR審查／PCR觀察包 | evidence/chat-owner-authorized-20260926 | `cc4accce53704dd0dcef5162607efd5edcf9d4f8` |
| 上輪受保護檢查最終紀錄 | evidence/chat-protected-progress-20260927 | `2917f8468e34f003e99d782f135096c422886af9` |

開始工作時以 GitHub live refs 重查是否有其他人推進；不要 reset 或覆蓋既有未提交工作。
本檔下方證據只適用於它原來綁定的 source/base/tree，內容拷貝不等於核准效力更新。

## 2. 已經完成，不要重做

- PR #284 全範圍原生 CODE review：5325215908 / inline 4110740313，綁定54a45ef。
- 未修改的 protected run **36229829342 attempt 2**：Requirements、Architecture、Exact CODE review，以及 **272/272 product/runtime** 均通過；0 fail/skip。
- #284 的240項研究測試，以及32編輯、20候選、6子程序測試；實際PCR suite38項涵蓋31個PCR。
- #285 候選 CODE review：5325343295 / inline4110852975；a42a11a，P0/P1/P2均0。新版隔離與精確版本設定已寫好，但未正式啟用。
- R1–R4固定31組研究完成：15組完整R1 result/signals/ledger相等。原始input hash未變，全部49檔及6份原始log已保留。**R2只過5/8，不代表獲利能力已驗證。** 未開2024+holdout、未選策略贏家、未實盤交易。
- 220份逐股2026年8月營收事實簡報：`research/current-editorial/reports/20260926-terminal-220/`；不是220篇完整投資分析。
- parser、進場計畫、AUO整合與封存修復已有實作。不要從零再造一套。

## 3. 真正還没完成（依這個次序處理）

### A. 信任復原與模型軌 → 受保護合併

#284的 model-runner job **108520396537** 真實失敗：
`spawnSync /Applications/ChatGPT.app/Contents/Resources/codex ENOENT`。
aggregate job108523276285因必備模型軌失敗拒絕，main未合併。

原base先用已被App更新移除的`.16.3`執行器啟動sandbox，之後才可能讀oracle reuse。
新版a42a11a候選釘選的是 `codex-cli 0.158.0-alpha.2.1`，原生路徑：
`/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex`。
主機再次更新時必须重新量測；不要把shell wrapper、其他版本或符號連結當作同一原生身分。

獨立架構評估5328334770 / inline4113600036確認當前base沒有已核准的另一條復原入口。
本次規則快照20177392要求integration15368的`stockinsider-v3-gate-root`，沒有bypass actor。
「使用者已授權繼續」不會自動讓GitHub接受失敗檢查；也不是要求偽造證據或停用保護。

接續只可評估真正恢復原核准環境，或提出狹義、可審查、可稽核的管理員信任復原方案。
需要變更治理規則時，須明示具體變更、風險、回復方式並取得對應授權；不可把一般任務授權當作不存在的通過狀態。
不可用改default branch、retarget PR、建立同名check、取消必備測試等手段迴避原規則。
修復後重跑真正模型軌與aggregate，按當時有效的base/head完成必要整合審查再合併。

關鍵實作：
- `scripts/opportunity-v3/protected-external-gate-worker.mjs`
- `.github/workflows/source-led-opportunity-external-gate.yml`
- `.loop-engineering/state/changes/source-led-opportunity-engine-v3/external-gate-harness-contract.md`
- PR #285 的 `docs/engineering/host-v319-20260926/`

### B. 財務補件、解析、會計驗證與完整文章

固定批次5159a811-dd93-48cb-a172-619ea4db486e有220筆；舊缺口表記錄11,560個欄位／期間，
其中6項segment期間是symbolic label。這不是本次重查全DB的計數，不能任意補日期。

前次2026Q2取得結果：141份符合公司／季度身分的原始財報、78筆HTTP200無預期附件、1筆502。
缺附件不等於公司未申報，也不確定是限流。停止時session exit未驗證正常成功，220筆收據仍逐筆保留。
本次沒有重抓來源；先用已留存141份，缺件只循合法、有界的來源補件流程，不以繞限或密集重試補齊。

原Chat的parser請求被平台於程序啟動前攔截，故那一輪結構／會計驗收均為0；下載成功不是validatedFacts。
接手環境須遵循自身權限與批准機制正常驗證，不能以換工具或關安全限制來冒充原操作已成功。

依既有 `docs/operations/candidate-financial-document-parser.md`、
`scripts/candidate_financial_document_parser.py`、`scripts/candidate_financial_fact_scope.py`、
`web/src/lib/candidate-financial-documents.ts`、`web/src/lib/official-financial-validation.ts` 處理。
原釘選Arelle2.44.7、pdfplumber0.11.8及分類標準SHA保持；不可用regex候選事實冒充結構／會計收據。
先在隔離、非正式環境核對；只有通過原來的來源、principal、revision與會計規則才能走受保護寫入。
EPS×股數、離散季度／YTD、股權、重編、segment與利潤欄位不可混用。歷史可得時間不等於今天取得時間。

完整文章需逐股處理論點、來源、財務、估值、風險與行情，並經原有版本／編輯驗收。
目前完整投資文章驗收0、發布0；營收簡報與原始財報不能直接標成可發布投資報告。
S5/S7合格歷史與授權缺口另列，不偽造資料、不保證統計檢查一定轉為通過。

### C. 最後才做正式容量處置與部署

本次使用者只要求整理交接並查詢容量；未授權本次刪檔、擴容採購、資料庫遷移或部署。
**2026-09-27 10:00:39（Asia/Taipei）唯讀量測：**
- 同一filesystem總計71.607GiB，可用 **12.911GiB**。
- 15GiB是所有同時工作用量扣除後仍須保留的硬底線；20GiB以下另有warning。
- 零工作用量已差 **2.089GiB**；實際還要加部署、回填、文件、WAL、索引與暫存的同時預算。
- 當時MemAvailable約2.575GiB；工具另要求工作後保留1.5GiB。swap接近用滿只是風險提示，不能從單次量測斷言持續記憶體壓力。
- `/`、`/opt/stockinsider`、`/var/lib/postgresql`是同一filesystem，不能相加可用容量。

原始讀值見 `docs/handoff/20260927/capacity.json`。這是快照，不是拿鎖後的部署准入。
正式部署前，重讀 `deployment/vps/CAPACITY_AND_BACKUP.md`、
`scripts/contabo-host-resource-check.mjs`、`deployment/vps/run-heavy-operation.sh`，
在原本兩把heavy-operation鎖下用實際workload重做檢查。保留current、previous及其他App／DB／備份。
不要執行泛用docker prune、rm備份或清掉其他App來硬湊空間。

遵循既有standalone打包、精確source/packager commit、受審查遷移、兩次idempotent producer、正式站／Safari smoke與rollback驗收。
`AGENTS.md`頂部還有歷史Vercel/Supabase描述；部署目的地應用上述現行Contabo規範及實際runtime確認，不依舊段落重建Vercel部署。
**不要直接執行`git pull main && deploy`，也不要部署本handoff分支。**

## 4. 交接檔案都在哪？

| 類別 | 位置 |
|---|---|
| 兩個候選PR、程式與歷史研究JSON | GitHub各完整commit；表1列出 |
| 八份既有GitHub原始artifact ZIP的逐byte鏡像 | `docs/handoff/20260927/assets/` |
| Artifact id/run/source/原保存期限/ZIP SHA256 | `docs/handoff/20260927/assets-manifest.json` |
| 最新狀態與容量快照 | `docs/handoff/20260927/status.json`、`capacity.json` |
| 220筆財報取得plan／來源收據／停下摘要 | `docs/handoff/20260927/financial-source-receipts/` |
| 141份原始財報與官方分類標準ZIP | 同一Mac的 `~/Documents/StockInsider-Research-Inputs/20260927-q2-220-captured/` |
| 本機原始檔案SHA256與大小 | `docs/handoff/20260927/local-inputs.json` |
| SSH金鑰、tokens、資料庫憑證、真實.env／備份 | 原已授權的本機／伺服器秘密管理；**不在GitHub，也不印出值** |

八份鏡像包含四份正式gate證據、31組完整研究、兩PR審查觀察包、原研究輸入、官方營收來源。
原Actions artifact有保存期限；這些Git副本在分支／repo保留期間可重取，但不延長原批准有效期。
原核准worker若要求GitHub原始run/artifact，不可把鏡像裝成新的原生artifact或新的通過結果。

本repo是PUBLIC。141份完整第三方財報與分類標準ZIP未公開上傳；只是把它們的來源與雜湊指引放在Git。
完整財報權利與保密邊界要另行確認；雲端執行環境需要明確授權的私有檔案傳輸，不能假設能直接讀Mac。
分類標準已另保存至相同非暫存資料夾，避免只留在/tmp。沒有把任何credential檔納入交接。

## 5. 怎樣開始最省事

**建議：在目前這台Mac使用本機Codex，讀這份GitHub交接文件。** 這台Mac有141份原檔及既有SSH配置，
最少需要重新搬資料；repo存取不代表有部署權限，每一項主機檢查仍須真正通過。
雲端Codex可先讀repo、檢查程式／文件；本機路徑、macOS簽章主機与SSH憑證並不隨repo checkout自動帶入。

安全的交接檔案檢查（只讀，不抓網路、不解析財報、不跑研究、不部署）：

```bash
python3 docs/handoff/20260927/verify_handoff.py
# 同一已授權Mac才加這一行，僅檢查本機檔案SHA：
python3 docs/handoff/20260927/verify_handoff.py --local-inputs
```

複製給Codex的任務：

> 先讀本分支CODEX_HANDOFF.md及status.json，核對live #284/#285/main；保護既有未提交工作。
> 先處理真正模型信任復原與受保護合併，再完成財務補件／解析／會計與逐篇文章驗收。
> 四個已通過正式leaf、31組研究及完整封存不要從頭重做，不以更換環境或放寬規則掩蓋阻擋。
> 原始財報在本機local-inputs.json指定位置。容量與部署仍須最後獨立檢查；12.911GiB快照目前不合格。
> 如涉及管理員例外、刪檔、擴容費用或正式變更，明列所需具體操作再按批准程序執行；不可自創通過狀態。
> 每次回報實際commit、真實檢查、未完成內容與證據，不把這份handoff當發版批准。

## 6. 官方工具說明（僅使用方式，不是本專案驗收證據）

- Codex環境：https://developers.openai.com/codex/cloud/environments
- 本機／遠端工作：https://developers.openai.com/codex/remote-connections
- Artifact保存與下載：https://docs.github.com/en/actions/how-tos/manage-workflow-runs/download-workflow-artifacts

本次handoff只新增文件、唯讀完整性檢查與既有公開證據副本；不改產品／主機候選head、保護規則、憑證或正式服務。
