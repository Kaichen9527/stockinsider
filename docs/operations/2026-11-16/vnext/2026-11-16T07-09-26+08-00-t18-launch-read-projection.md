# T18 新版榜單 staging 唯讀代理

Codex Cloud 用量限制仍在。本次使用 Contabo 獨立測試空間、私有網路和非特權的應用程式、資料庫、REST 身分。實際執行 PostgreSQL 17.11、PostgREST 16.3，以及之前已逐檔核對的 Next.js 16.3.4 封裝 `f67548d87f2563608aa1469c14e6976d52a866cc`、`948bb9e448eda468bb618f78ec6b0ca1d691d0d5`。

- 代理新增明確選項，預設沿用舊路徑。啟用時只接受兩個固定公開投影、staging token 及明確的 UUID、股票代號 JSON 參數，以 GET 轉給固定 loopback PostgREST。保留上游回應、大小與時間限制。代理移除上游錯誤細節，只保留可辨識的 schema 缺項代碼。
- 用現行應用程式遷移的確切兩個投影函式、成效序列化與圖表讀取的正式 SQL patch，在臨時產生的最小 schema 驗證。資料庫角色只獲兩個指定函式的 execute，查無廣泛 service role、私有表讀取、schema 建立或表格寫入權。原生 REST 實測 anonymous、私有表、其他 RPC、寫入被拒。代理另有 10 種請求被拒且未送往上游。
- 兩個真實 Next 封裝皆從原生空資料庫讀得首頁榜單 API 200 `not_published`、指定缺失 run／股票 404 `not_found`，回覆皆 no-store。成效對不存在版本回 null；對合成會員回 `not_started`，成效資料表筆數維持 0。這些不是實際榜單或真實股票成效驗收。
- 舊代理回歸與新增代理權限測試 11/11。隔離資料庫、程序、掛載與臨時憑證已清理。本次未存取真備份或正式資料庫。

此分支只提供可審查的代理程式，保留原復原入口的固定版本、權限和預設關閉行為。正式備份上的同環境 A/B/A 尚需在隔離還原副本核對 schema、權限和真實資料，使用既有可信金鑰交接，再接合角色與受限路徑。沒有新的 release 或解除 HOLD。

- [先前舊代理拒絕新版讀取的證據](https://github.com/Kaichen9527/stockinsider/issues/403#issuecomment-6902805093)
