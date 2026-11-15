# PR #384 受保護審查與 PostgreSQL 品質工作定位

2026-11-15 查核 GitHub 規則、原始 Actions 日誌及固定版本來源。PR head 為 `cbb581662e72942610ff85b0bf5e7e47ddddfa46`，base 為 `93e44475cbb0c27beb26e4dcb68e382096a4e212`。PR 仍為 blocked 草稿。預設分支的有效 repository ruleset 20177392 要求 `stockinsider-v3-gate-root`。[PR #384](https://github.com/Kaichen9527/stockinsider/pull/384) · [分支規則](https://github.com/Kaichen9527/stockinsider/rules/20177392)

## 受保護審查

- Bootstrap 成功。Requirements、Architecture 與 exact-review 三個工作均在共同的 Git fetch 階段遇到同一個 `couldn't find remote ref`。欠缺的 ref 為 `refs/heads/evidence/source-led-opportunity-v3-exact-review-cbb581662e72942610ff85b0bf5e7e47ddddfa46`，查核時 GitHub 仍回 404。Requirements 和 Architecture 的 graph-bound refs 皆存在。
- Base 端的 worker 會一起取得這三個 ref，exact-review ref 依實際 subject commit 決定。三個工作均未發布 envelope，product-runtime 與 model-runner 被跳過，gate root 因先決工作缺失而失敗。存在的兩個 refs 尚未經這次工作驗證。[受保護工作](https://github.com/Kaichen9527/stockinsider/actions/runs/39996616648) · [固定版本 worker](https://github.com/Kaichen9527/stockinsider/blob/93e44475cbb0c27beb26e4dcb68e382096a4e212/scripts/opportunity-v3/protected-external-gate-worker.mjs#L410-L427)

## 原生品質工作

品質工作實際 checkout 的合併測試 commit 為 `a8fbdfdbf55d77d2928a9134a396091001994769`，父 commits 為上述 base 及 subject。Types、lint 和一般 build 有成功紀錄。以下兩項失敗後，使用同一 build 的桌機及手機驗收被跳過。[品質工作](https://github.com/Kaichen9527/stockinsider/actions/runs/39996620417/job/120561693293)

| 失敗 | 重跑入口與查核範圍 |
|---|---|
| All-active 論點稽核與修正後的事實 ID | `scripts/vnext-thesis-postgres.test.mjs`。前 3 個子測試成功，在第 4 個子測試失敗。去敏日誌未提供失敗斷言，保留既有安全過濾。 |
| 研究準備 HTTP 讀取及已提交回應遺失的恢復 | `scripts/vnext-preparation-resource-run.py` 執行 `scripts/vnext-preparation-http.test.mjs`。在 `preflight` 發生 `ERR_ASSERTION`，未達任何有名稱的 HTTP／資料庫驗收點。從兩個固定 commit 讀出的 SQL 文字，重算的 15 個函式片段與遷移檔校驗均相符。實際建置身分、fixture 安裝及啟動仍需用同一組建置產物在 VM 重跑。 |

延續分支 `f8be9f28bcaf9f4e2d1e8257bad8d7d201b30a43` 是 PR head 的後代，前進 81 個 commits。論點測試檔已變動，準備 HTTP 測試與其資源 runner 內容相同。查核時該版本的 GitHub check-runs 清單為空。先在 Cloud VM 原生重現並修復，完成同一 build 的桌機及手機驗收。實質修正後固定最終 PR head，取得對應的獨立審查證據，再啟動既有受保護工作。
