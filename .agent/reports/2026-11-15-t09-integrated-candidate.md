# T09｜整合候選程式與驗證

此提交以 PR #384 已保存的 Cloud 續作 `f8be9f28bcaf9f4e2d1e8257bad8d7d201b30a43` 為直接基準。原草稿的 `cbb581662e72942610ff85b0bf5e7e47ddddfa46` 已包含於該基準。把五份候選補丁實體化為程式和測試，並依序加入訊號、不可變成效版本、盤後批次與公開讀取四份候選遷移。

Contabo 隔離 staging 從固定 GitHub 物件重建 19 個檔案，核對 SHA-256，相關檔案通過 TypeScript 5.9.3 嚴格檢查，39 個 Node.js 測試通過。另用同一個僅 Unix socket 的 PostgreSQL 17.11 臨時叢集，套用四份遷移並以合成榜單及官方資料格式驗證盤後選取、評估收據保存、同次重送和公開唯讀結果。這條路徑使用實際成效評估器。測試資料無法證明實際交易日的發榜或成交。

候選分支保留原本的正式發布 HOLD。待驗收包括開盤停牌資料供應接線、可成交正例、同市場超額報酬、首次與連續上榜分組彙總、滿載延遲、Cloud 整站品質檢查、桌機與手機及真實交易日。這次保全和驗證使用 GitHub 固定來源與 Contabo 隔離 runner。Cloud 路徑受用量限制，尚無新的 GPT-6.1 Sol High 實機測試收據。未套用正式遷移或變更正式服務。

[原證據分支的固定輸入](https://github.com/Kaichen9527/stockinsider/commit/9631b15498769d2a08ba4c810026cbfa7b9cc3d5) · [T09](https://github.com/Kaichen9527/stockinsider/issues/394)
