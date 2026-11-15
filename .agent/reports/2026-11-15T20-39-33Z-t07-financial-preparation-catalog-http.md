# T07／T10 財報準備 migration 與 HTTP 認證

續作版本 `356ed575282b8075157e24247a9d7d0e90618460`。Codex Cloud 用量限制期間，在 Contabo 隔離 staging 使用固定 2026-10-11 工程 schema、既有受控 migration 及 PostgreSQL 17.11。schema 包含既有 DDL 與角色，實測工作資料與憑證均為隔離測試用。正式服務、資料庫、排程及 release pointer 維持原設定。

- 預估來源與公司行動的原 migration 對 catalog JSON 反覆執行逐列包含檢查，兩者都達原 30 秒上限而回滾。相同 PostgreSQL 設定下，預估來源原版量測 30.84 秒並逾時，改成雙向 `EXCEPT ALL` 後約 2.04–2.61 秒。公司行動以相同方式修改後約 1.83–2.30 秒。原 30 秒與鎖逾時繼續適用，原權限與允許差異清單均保留。更新兩份 source profile 的 migration 雜湊，既有函式前後態雜湊相同。
- 實際驗證的前置順序為 roster fence 後先執行 catalyst cancellation、business criteria，再執行 forecast sources、forecast active、target profiles 和 corporate action terms。測試曾依取檔順序執行，在精確前置檢查被拒絕。依既有 installer 補入 target profiles 並按相依順序執行後通過。
- 財報準備安裝原先要求會計驗證及失敗處理 RPC 的舊函式內容。依實際 catalog 改為已安裝的 text 狀態修正 `99b05c8c…` 與 v6 failure hotfix `a2135f31…`。既有 owner、SECURITY DEFINER 與運行角色檢查保留，無需新增權限。財報準備及 `_24`、`_25`、`_26` 三份 migration 在同一隔離 schema 連續通過。六張新增私有表均啟用 RLS。
- 初次用 schema-only snapshot 驗證 backend context 時缺少資料平面的 singleton 資料列，依預期拒絕。補入原 migration 建立的安全預設，再執行原 Contabo 啟用腳本。限定的 operator 與 backend 正例通過，錯誤 operator 或遺漏 backend 都被拒絕。隔離 PostgREST 憑證一次性產生，未導入任何正式憑證。
- 17 項 Node source contract 通過。固定 `eae8a1b0…` 的原 web 源碼以 Next.js production build 建置，TypeScript 通過。以隔離網路和私有 `/run` 掛載啟動真實 Next.js、PostgREST、原 HTTP 路由和同一原生資料庫。兩個路由各拒絕錯誤 bearer 與錯誤 payload，四案均在進入 PostgREST 前拒絕。兩個正確 operator 請求均回 200 及 `vnext_on`。空佇列下，財報嘗試、研究工作與遺留 writer lease 均為零。進程及暫存資料清理完成。
- HTTP 驗證涵蓋認證、空佇列和寫入邊界。帶信驊原件的 HTTP acquire／parse／會計收據、作者、獨立審查、榜單及發布仍待驗收。PR #384 維持 HOLD。
