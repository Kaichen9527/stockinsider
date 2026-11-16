# T18 榜單投影的還原副本授權

在 Contabo 隔離 staging 使用 PostgreSQL 17.11、PostgREST 16.3 和暫存 schema。兩個投影來自現行版本 `33395e2945553340b9de624a95f99e245bbceeb0` 的實際 SQL，榜單定義含正式的圖表讀取 patch。完整 schema 與研究資料仍為隔離測試範圍。

- 舊角色 SQL 已逐 byte 比對，預設維持零個應用 RPC。新版在原本的角色與欄位檢查後、同一筆 clone-only 交易中核對 Unix socket、既有隔離資料庫名稱、definer 角色和兩個固定函式定義的 SHA-256。
- 符合固定定義才授權 staging reader 執行榜單與成效公開投影。驗收共 11 個原欄位、2 個指定投影、0 個寫入或其他執行權，authenticator 本身無投影執行權。
- 缺一個投影、定義異動或 definer 多出角色關聯時，三種驗證全拒絕，已建立的 staging 角色與 ACL 修改一起回滾。6 項角色回歸測試通過。
- 經新版代理、原生 PostgreSQL／PostgREST 和兩個已固定 Next.js 封裝，再驗證 200 尚未發布及 404 無指定版本，兩版都保留 no-store。資料庫拒絕私有表、寫入與其他 RPC。成效讀取沒有寫入訊號與版本表。暫存資料庫、程序、mount 及憑證均已清理。

本次固定兩個讀取函式的定義。正式備份的相依函式、遷移完整性、實際排名及真實同環境 A/B/A 另須核對。保留舊入口預設，尚未接入真備份演練啟用流程；正式服務與 HOLD 維持。PR #406 首輪 protected gate 於三個審查 job 取得 bootstrap 後，因缺少該舊 head 的 exact independent review ref 而中止，沒有審查回執。
