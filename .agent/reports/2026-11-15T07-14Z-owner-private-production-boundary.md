# T02 Contabo 正式版私人研究邊界查核

2026-11-15 07:09–07:14 UTC，以唯讀交易與 Nginx loopback 匿名 GET 查核目前 Contabo 正式版。資料庫查核取得角色、權限和筆數，HTTP 查核只保留狀態、標頭和三種標記的判定值。正式服務與設定均未變更。

## 實際結果

- PostgreSQL 17 的四張來源或私人資料表均啟用 RLS，目前各有 0 條 policy。八組 `anon`／`authenticated` 與資料表組合，表級與欄級檢查均無 SELECT 或所查的寫入權限。表與欄也沒有對 `PUBLIC` 的授權。
- 兩個所查既有來源函式均無 `PUBLIC` EXECUTE，也未向 `anon` 或 `authenticated` 授權。定錨修訂 ID 的函式只向所查五個角色中的 `legacy_correctness_rpc_owner` 開放。現有 API 角色與該函式的權限分界有實機查核依據。
- 定錨來源目前有 2 筆內容欄位非空的修訂，兩筆都綁有來源身分授權紀錄。此次只計算筆數。來源身分紀錄與上游內容存取或展示的許可是兩個待個別驗證的條件。
- 匿名 `/` 與 `/stock/5274` 回 200。`/candidates`、`/private-research`、`/api/owner/session`、`/api/owner/research` 回 404。六個回應都含 `no-store`、均無 `Set-Cookie`，也未找到所檢查的會員文章連結、owner cookie 名稱及私人表名標記。此結果涵蓋這次指定的正式版匿名回應。
- 開發版固定 commit 的登入後研究 handler 現在回 `missing_data`、空列表與兩個實際缺口。實際登入後讀取資料的路徑仍待完成。[固定版本 handler](https://github.com/Kaichen9527/stockinsider/blob/f8be9f28bcaf9f4e2d1e8257bad8d7d201b30a43/web/src/lib/vnext/owner-oidc.ts#L228)

## 交付條件

須建立僅供 owner session 使用的最小欄位伺服器端讀取，依逐來源許可判斷可展示資料，並維持現有公開資料庫角色的權限。建立實際 HTTPS 網址與精確的 OIDC callback 後，在隔離 staging 驗證允許帳號、非允許帳號、登出後直接 API 請求及共用快取行為。本次查核涵蓋的舊版匿名回應與資料庫權限可用作部署前比較基準。
