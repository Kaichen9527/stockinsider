# 名冊修正前應驗的讀取上限與時序

讀取產品分支固定兩個 Git blobs 並核對物件雜湊。在 Contabo 的非 root Node 程序重播現行篩選 adapter；資料列與 Supabase 傳輸為合成，樣本量取自另外一次正式庫唯讀 SQL。這是正常路徑的程式界線測試，未啟動或改動正式研究。[固定程式與收據](../../openspec/changes/stockinsider-vnext-20/evidence/2026-11-15-t06-roster-refresh-read-bounds.json)

- 實庫的 220 檔取樣中，按代號及 stock identity 各有 880 筆既有歷史。按同一組規模擬一次每檔追加，歷史為 1,100。固定實作在 880 筆可處理全部 220 個身分；adapter 兩個讀取其中任何一個超過 1,000 筆即整批回 `shared_roster_cache_unbounded`。控制組重播時 220 檔全部 deferred。
- 同一身分原以 TPEX 存在時，歷史 cutoff 能用當時名冊。加入一筆 cutoff 後才知道的 TWSE 版本，即使舊列仍有效，回讀舊 cutoff 變成 clock gap；新 cutoff 則正確選 TWSE。這是目前 adapter 在存取層未使用 cutoff 的可重現結果。
- 另以正式庫唯讀 SQL 先按來源／記錄時鐘限制 cutoff，再按 stock identity 和 symbol 排最新記錄，保留同時間並列。880 筆可知輸入產出 220 個成對的 head，該取樣沒有跨範圍或同時衝突。這一查詢證實讀取形狀與數量，名稱與類型仍依真實名冊核對。

修正應以同一讀取交易中的截止版身分投影，按截止時間先選最新版，再驗普通股、上市狀態和業務有效區間。保留每個有效 stream 的同時並列及跨 symbol／stock ID 檢查；個股排行 SQL 目前另有 100 筆歷史上限，也應限制在可知的 head／身分檢查。原歷史不因新事件改寫。身分不明、未有雙市場的完整來源時繼續回缺口。對已驗的最新符號異動，使用正式生效和實際觀測時間產生附加更正。

另有一條實作分支的 `research_observed_roster_v1` 可分辨 TWSE 普通股和 TDR，但固定版本會拒絕曾登錄公司更換交易市場／名稱，且回傳 `entryEligible=false`。可重用其來源分類和可知時鐘，更新仍經既有 `stock_instruments_v3` authority 路徑；保留目前授權、writer、歷史封存與尚待補的發布審查。

重播程式收到的兩行輸入依序為 `preparation-trading-identity.ts`、`screening-instrument-identity.ts` 原始 bytes 的單行 Base64 `gh api git/blobs` 輸出。執行 Node 22.23.1，由程序核對上述兩份 Git blobs。程式只對標準輸入和人工資料有依賴。正式業務接線、實際匯入及兩場次榜單未在此輪執行。[重播程式](../../docs/operations/2026-11-15/launch-radar/replay-roster-refresh-read-bounds.mjs)
