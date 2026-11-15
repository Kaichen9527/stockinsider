# T09｜每日研究循環的成效追蹤

候選補丁將成效追蹤接入現有的 21:30 盤後研究循環。同一個受保護的 operator 入口沿用既有 exact internal bearer 和 writer 租約。呼叫者只提供原有的 cycle 動作。資料庫決定當輪的截止時間與可評估的凍結訊號，也在該時間以前套用過的交易日曆收據中選出交易日版本。成效環節使用官方行情讀取器、固定評估器與原有版本寫入候選實作。

榜單在 21:30 之後才實際發布時，該筆新訊號從下一個符合條件的交易日開始評估。同一截止時間已有成效的訊號不會重算。日曆收據衝突會延後該市場。透過既有循環執行，不用新增 cron、queue 或研究額度扣款。

每次最多嘗試 16 筆，回報待處理筆數與延後原因。候選選擇每天移動起點，以便下次接觸其他訊號。滿載時的追蹤延遲需要用實際 Contabo 流量驗證。成效寫入延後時，榜單發布收據仍有效。

## 驗證

- 隔離 PostgreSQL 17.11 通過截止時間、已完成同次工作排除、當日較晚發布排除、日曆版本、衝突延後、候選輪換、存取權限及批次上限測試。
- 隔離 Node.js 22.23.1 通過 22 個測試，其中四個涵蓋 worker 使用同一截止時間、計算寫入、追蹤延後的原因及作者角色拒絕。相關 worker 與官方行情讀取檔案通過 TypeScript 5.9.3 嚴格型別檢查。補丁通過套用及雜湊驗證。
- PostgreSQL 的排程截止與已套用的日曆收據是 fixture。Node.js 用合成官方行情與模擬的 RPC 連線。完整的 HTTP、writer、資料庫與實際交易日仍需在 Cloud CI 及 staging 串接驗收。

## 套用與重跑

先在固定基準套用評估器及官方行情讀取補丁，再套用 `launch-outcome-cycle.patch`。資料庫候選 SQL 順序為訊號表、版本寫入、`launch-outcome-cycle-batch.sql.txt`。

`outcome-cycle-batch-stage-run.py.txt` 重用成效版本 staging 測試的前九份輸入。第六個輸入請改用同目錄的 `outcome-cycle-batch-evaluator-fixture.mjs.txt`。第十個輸入是 `outcome-cycle-batch-stage-calendar.sql.txt`，第十一個是 `launch-outcome-cycle-batch.sql.txt`。測試以獨立 PostgreSQL data directory 與 Unix socket 執行並回收，無 TCP 監聽。

正式服務未變更。開盤成交證據、網站成效讀取、完整部署驗收和首版發布 gates 仍待完成。

[候選補丁](../../docs/operations/2026-11-15/launch-radar/cloud-wip-recovery/outcome-evaluator/launch-outcome-cycle.patch) · [機器驗證](../../openspec/changes/stockinsider-vnext-20/evidence/2026-11-15-t09-outcome-cycle.json)
