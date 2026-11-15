# T09｜凍結榜單的成效追蹤訊號

## 候選實作

新增一份待審 SQL。凍結榜單在既有 writer 交易寫入排名成員時，訊號列固定同一榜單、股票、正式收盤價、交易日、資料版本與第一筆上榜識別。未排入 Top 10 的候選和空榜不建訊號。連續上榜沿用第一筆識別，真正出榜後再進榜建立新識別。資料不足而延後發布不會改動現有序列。舊榜單只供追溯第一筆識別，安裝時不回填訊號。

資料表沿用既有 writer fence。訊號寫入與榜單發布同一交易，榜單或價格核對失敗會一起回滾。API 角色沒有直接存取訊號表的權限，且已建立的訊號不可改寫。候選 SQL 保留在 `.sql.txt`，仍需完整 writer、來源及審查驗證才可進入正式遷移。

## 隔離驗證

使用 Contabo staging 的單次 PostgreSQL 17.11 無監聽執行。測試取用固定版本排名表 DDL，搭配合成的官方觀測、帳號和 writer fence fixture。正式資料庫、服務與排程未改動。

- 兩個舊快照可追溯連續上榜，沒有自動回填歷史訊號。
- 一檔、十檔、空榜和重新入榜案例共建 12 筆訊號。重複寫入不增加紀錄。
- 錯誤收盤價、缺排名、失效的 writer 租約均使同交易回滾。
- 16 次直接角色操作遭拒，已寫訊號更新遭拒。
- Node.js 22.23.1 使用實際測試輸出的訊號銜接 T09 評估器。評估器辨認連續上榜，等待下一個交易日開盤。此測試尚無後續行情資料。

[候選 SQL](../../docs/operations/2026-11-15/launch-radar/cloud-wip-recovery/outcome-evaluator/launch-outcome-signal-ledger.sql.txt) · [去敏機器收據](../../openspec/changes/stockinsider-vnext-20/evidence/2026-11-15-t09-launch-signal-ledger.json) · [T09](https://github.com/Kaichen9527/stockinsider/issues/394)

## 重跑方式

在隔離 Linux staging 使用 Python 3 執行 runner，依序傳入 `signal-ledger-stage-setup.sql.txt`、`launch-outcome-signal-ledger.sql.txt`、`signal-ledger-stage-probe.sql.txt`。Runner 需要 PostgreSQL 17、至少 2.5 GiB 可用記憶體及 15 GiB 可用磁碟，並使用 `unshare` 和 `setpriv` 建立沒有網路的非特權 PostgreSQL 程序。三份輸入按原順序合併的 SHA-256 為 `46578cb73b28940ccef92fdf11783456ce2f303f299fd4509019970276991368`。

完整 writer 與真實資料接線、後續行情版本及 20／60／120 日結果寫入、排程、介面和審查仍待驗證。此證據不解除既有 HOLD。
