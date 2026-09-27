# 2026-09-27：真正的受保護審查進度

## 實際版本與範圍

產品來源仍為 `54a45ef7095d61e928b7e23bcd0d8961a505acee`，tree `b70674b657f9e2242d0ca538b77c22169cd94f5c`；主機候選仍為 `a42a11af7cf6a829209b7127962e01bfe969b143`。main `169aad1b6cfa747f78ae3464b614f43c0749d806` 未更新。本目錄保存觀察，不是新的根信任、通過狀態或財務批准。容量、部署、正式寫入均未執行。

## 本輪已完成：三份正式受保護審查證據

既有原生 CODE review5325215908/comment4110740313 已忠實編譯成原流程指定的三份檔案，並重新核對原生帳號、原始commit、完整base/head/tree與決定。PCR原始stdout/stderr依其明示base64編碼解碼，逐一核對原hash、38個通過測試及31個PCR名稱，沒有把編碼文字當原始輸出。

證據 commit `00cdb03ceac34e2a6e35f98c02d64d61fa2b01eb` 是54a45ef的唯一直接子commit，只新增exact-commit-review-final.md、pcr-fulfillment-record-v1.json、runtime-review-attestation.json三個指定檔案。已推送到 `evidence/source-led-opportunity-v3-exact-review-54a45ef7095d61e928b7e23bcd0d8961a505acee`。CODE範圍、原審查者無法於其環境建置的限制、另行CI建置證據均保留；沒有改寫成完整模型或財務批准。

未修改的 protected workflow36229829342 attempt2 已自行驗證並發布：

| 檢查 | 真實job | Artifact | 結果 |
|---|---:|---:|---|
| Requirements | 108520354543 | 10919955867 | pass |
| Architecture | 108520354432 | 10919229286 | pass |
| Exact CODE review | 108520354524 | 10919488571 | pass |

三份ZIP已下載；ZIP雜湊、envelope內resultSha256、來源commit/tree、base、issuer與exact-review證據commit均核對一致。它們是GitHub既有受保護流程發出的真實leaf，不是一般CI綠燈或作者自行建立的check。詳見protected-artifacts.json。

## 剩餘的真實信任啟動阻塞

同一次執行的model-runner job108520396537已通過checkout與prepare，於2026-09-27T00:52:47.918853Z失敗：

```
protected external gate worker failed: spawnSync /Applications/ChatGPT.app/Contents/Resources/codex ENOENT
```

不再是缺exact-review分支。既有base worker仍必須先啟動已移除的舊執行器，才可能進入model oracle reuse。獨立架構評估5328334770/comment4113600036亦確認目前base沒有已核准的另一條復原路徑。

重新讀取ruleset20177392：active、required check為integration15368的stockinsider-v3-gate-root、bypass_actors為空、current_user_can_bypass為never。因此「擁有者可在不改規則的情況直接合併失敗的bootstrap」不是目前可執行的GitHub操作；已請獨立審查者釐清該說法。不能改預設分支、偽造同名check、假裝舊binary仍在、取消必備檢查或把candidate自我登記成根信任。

已確認相關Sparkle快取目錄沒有舊安裝包，tmutil未列出本機快照；未聲稱搜尋了所有外部備份。進一步查找舊App的工具請求被平台攔截，沒有改工具或變形重試。真正可行的後續必須是恢复原核准驗證環境，或由擁有者另行明確批准、獨立審查且可稽核的管理員信任復原例外。廣泛任務核准不能被編譯成不存在的檢查結果。

產品受保護job108520396582在本紀錄建立時仍執行中，不計為pass；其最終結果以同run的GitHub原始紀錄為準。即使該項成功，model leaf失敗仍禁止aggregate與main合併。

## 財務工作：取得來源與環境，但沒有虛報驗收

已重新取得2330、2409的2026Q2官方MOPS附件，保留真實URL、時間、Content-Disposition、bytes及SHA256。2330新下載的SHA與先前保留的官方canary一致。另從官方取得指定2026分類標準zip，精確核對原釘選SHA，再做成員、路徑、非symlink及總大小檢查後解壓至隔離工作目錄。沒有在正式機安裝。

隔離Python3.12環境已安裝原requirements指定的Arelle2.44.7/pdfplumber0.11.8。之後的既有財報解析器執行請求被Chat平台在程序啟動前攔截，沒有產生本輪解析、結構驗證或會計驗收結果；沒有以其他工具重送同一個被攔截操作。Raw XML欄位觀察不是validatedFacts，未據此補EPS、股數、估值或發布文章。

先前220筆固定批次的11,560個財務欄位/期間缺口未由本輪宣告補完；這不是對目前整個正式資料庫的新計數。完整投資文章未驗收、未發布。來源下載成功、taxonomy核對成功與金融事實通過驗收仍是不同狀態。

## 接續準則

不要重跑已完成31組研究、不要重做parser/entry plan/AUO整合、不要重新製造已通過的三個審查leaf。保留產品與主機候選的原生審查版本。本次未合併main，未改GitHub保護，未開始容量或正式部署。所有未執行項目仍保持未完成。
