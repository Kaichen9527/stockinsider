# 9/19 正式備份升級的 PostgreSQL 資源測試

沿用原保管方式驗證與還原 9/19 加密備份，在獨立 Contabo staging 複本核對 288 個外鍵、193 張啟用 RLS 的表及固定發布版本。這一輪首次呼叫原本的財務遷移檢查與安裝器。它在提交前回報 `53200`，財務及發布遷移均未提交。複本仍可通過 vNext 核心遷移的驗證，vNext 保持關閉。正式系統簽章一致，隔離資源已清理，HOLD 維持。

另以 10/11 的 schema-only 擷取、PostgreSQL 17.11、`C` 與同樣的四個連線上限做單變數對照。鎖表設定為 64 時，匯入 schema 遇到 `53200` 和 PostgreSQL 的 `max_locks_per_transaction` 提示。只將該暫時資料庫設定提高至 256 後，匯入、財務、發布與四個 vNext 遷移均通過。兩個測試都只透過獨立網路命名空間內的 Unix socket 操作。正式備份上的 `53200` 尚無細部提示，是否為同一原因以調整後的實際備份重跑確認。

[去敏驗收資料](../../docs/operations/2026-11-16/vnext/contabo-t18-legacy-upgrade-lock-control.json)
