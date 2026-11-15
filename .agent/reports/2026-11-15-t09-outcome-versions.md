# T09｜成效追蹤版本寫入

新增待審的 SQL，使用既有 operator、官方來源授權、active writer release 和原 writer 租約，讀取凍結訊號或附加一筆成效版本。寫入前核對原榜單、股票、收盤價、版本與正式發布時間。每次寫入保存評估器的輸入、結果與雜湊，供後續重現。資料表限制直接存取與原地修改。

兩個連線同時提交同一觀測時間及內容時，只新增一筆。第二次取得原收據。同一觀測時間的不同內容被拒絕。較晚的觀測可以新增更正版並保留舊版，曾接受的舊版本仍可原樣重送。歷史回測資料無法寫進正式榜單成效表。

## 隔離驗證

Contabo staging 的 PostgreSQL 17.11 使用獨立工作目錄和 Unix socket，TCP 未監聽。Node.js 執行先前的成效評估器，用合成訊號產出「未到期」與「先觸及上界」兩個版本。測試驗證並行重送、一致收據、晚到更正、錯誤收盤價、早於榜單發布、舊時點新寫入、回測資料隔離，以及來源授權、角色、release 和 writer 租約的拒絕路徑。直接讀表與原地更新、刪除、清空均被拒絕。

隔離測試用了既有 SQL 的政策及租約核對函式。後端身分、來源授權和 lease 狀態由 fixture 提供，雜湊的 JSON 正規化在此測試使用 PostgreSQL jsonb 正規化替身。隔離結果證明版本寫入行為，完整部署仍需用正式的 canonical 函式及真實寫入憑證審查。正式服務未變更。

## 重跑

將下列九份檔案按順序傳給 `outcome-version-stage-run.py.txt`。需 PostgreSQL 17、Node.js 22、15 GiB 磁碟及 2.5 GiB 可用記憶體。執行會在 staging 建立並回收臨時叢集。

1. `signal-ledger-stage-setup.sql.txt`
2. `launch-outcome-signal-ledger.sql.txt`
3. `outcome-version-stage-auth.sql.txt`
4. `launch-outcome-versions.sql.txt`
5. `outcome-version-stage-seed.sql.txt`
6. `outcome-version-evaluator-fixture.mjs.txt`
7. `launch-outcome-evaluator.patch` 套用後的 `launch-outcomes.ts`
8. 固定基準的 `web/src/lib/vnext/policy.ts`
9. 固定基準的 `web/src/lib/vnext/evidence-clock.ts`

後續需要在共用佇列的受保護 writer 內接上此命令，使用凍結的觀測時間產生輸入，補齊成交證據、結果讀取與真實榜單驗收。

[候選 SQL](../../docs/operations/2026-11-15/launch-radar/cloud-wip-recovery/outcome-evaluator/launch-outcome-versions.sql.txt) · [去敏驗證](../../openspec/changes/stockinsider-vnext-20/evidence/2026-11-15-t09-outcome-versions.json)
