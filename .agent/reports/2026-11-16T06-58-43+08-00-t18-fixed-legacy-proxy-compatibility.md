# T18 新版 Next.js 與舊備份讀取門檻

Contabo 上使用此前逐檔驗證的兩個 Next.js 16.3.4 封裝。實際的 Next.js 程序使用非 root 身分、唯讀 release 掛載，經既有 T18 固定代理連到獨立 loopback。這次使用探測用孤立憑證及同一代理核心，沒有建立或連上上游資料庫。代理使用預設快照模式。另檢查歷史詳情模式的固定 adapter，它只另外接受舊台股發布 metadata 的指定 RPC，未開放新版的兩個投影。

| 固定版本 | 榜單旗標 | 榜單 HTTP | 榜單指定版本及股票 HTTP | 代理計數 |
| --- | --- | --- | --- | --- |
| `f67548d87f2563608aa1469c14e6976d52a866cc` | 啟用 | 503 `unavailable` | 503 `unavailable` | 2 拒絕、0 上游 |
| `948bb9e448eda468bb618f78ec6b0ca1d691d0d5` | 啟用 | 503 `unavailable` | 503 `unavailable` | 2 拒絕、0 上游 |
| `f67548d87f2563608aa1469c14e6976d52a866cc` | 停用 | 503 `launch_ranking_disabled` | 未執行 | 0 請求 |

四個啟用結果都帶 `no-store`，沒有榜單快照或詳情。這與停用控制組的明確錯誤不同。各次啟動前檢查最低可用磁碟 24.36 GiB、可用記憶體 4.37 GiB。獨立程序、掛載與臨時憑證已清理。未開啟正式備份、未讀取還原金鑰，未連上或修改正式服務。

## 同一備份演練需要的讀取契約

目前網站榜單／指定版本詳情呼叫 `vnext_launch_ranking_read_v1(uuid,text)`。有版本綁定詳情時另讀 `vnext_launch_outcome_public_v1(uuid,text)`。兩者在現行遷移是 `STABLE SECURITY DEFINER`，通用 `PUBLIC`、anon 和 authenticated 無執行權，專用 T18 reader 也沒有獲授。既有 T18 代理只傳固定快照查詢及受控舊 metadata。佈建新路徑需以隔離還原版核對函式、相依 schema 和實際資料，再用只具必要投影權限的短效身分、明確參數與唯讀交易連接，維持既有拒絕寫入及任意 RPC。歷史備份若缺新版 schema 可用獨立副本驗證遷移。若缺真實排名與版本相符的資料，報告資料缺口並接續真實收盤觀測。歷史資料或測試資料不算新版實際榜單驗收。

真備份還原與兩個新版封裝的同環境 A/B/A、真實榜單及發布 HOLD 仍開放。

- [舊固定代理](https://github.com/Kaichen9527/stockinsider/blob/41cb7855a6374abf3cd49525bd1a77a98f18f46c/deployment/staging/vnext/t17_keyfd/fixed_read_proxy.py)
- [舊詳情 adapter](https://github.com/Kaichen9527/stockinsider/blob/41cb7855a6374abf3cd49525bd1a77a98f18f46c/deployment/staging/vnext/t17_keyfd/t18_detail_read_adapter.py)
- [榜單讀取](https://github.com/Kaichen9527/stockinsider/blob/1a0dbbb416d3edd87ca6dd030be46322c249c0d0/web/src/lib/vnext/launch-ranking-read.ts)
- [成效投影](https://github.com/Kaichen9527/stockinsider/blob/1a0dbbb416d3edd87ca6dd030be46322c249c0d0/web/src/lib/vnext/launch-outcome-public.ts)
