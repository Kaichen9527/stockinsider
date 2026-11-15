# T18 整合版實際封裝與隔離回滾

2026-11-15 22:39:21 UTC。Codex Cloud 受用量限制，本次使用 Contabo 隔離 staging。從 GitHub 取兩個固定 commit，以乾淨 Git checkout 建置 Next.js 16.3.4 及 TypeScript。使用 repo 既有 standalone 封裝和驗證器，逐一驗證 3,052 個成員。封裝／驗證器回歸測試 16／16。

| 版本 | 來源 commit | Manifest SHA-256 | Next BUILD_ID | 封裝成員 bytes |
| --- | --- | --- | --- | --- |
| A | `f67548d87f2563608aa1469c14e6976d52a866cc` | `a980d41f1f76c6e96a9dcb7349df129606ec37c234850933297dca7b9bac266a` | `ax-PpYISKH9qBzNpA8JK8` | 83,665,010 |
| B | `948bb9e448eda468bb618f78ec6b0ca1d691d0d5` | `7baa6bab4e6140c41b1fa7cb9ac96cac23e1746f2e017ef3be3291d42115b1be` | `G2grVK9zibGvacOqWUL65` | 83,669,223 |

## 切換及故障

- 用獨立網路及暫時 release pointer 執行真實封裝入口。A、B 和回復的 A 均從實際 Next HTTP 回 200，涵蓋首頁、榜單 API、版本綁定詳情及靜態資源。榜單 API 的凍結內容雜湊和原日期相同，資格逾期保留榜單並移除符合標示。
- 故障 B 使用隔離網路內無法連線的唯讀資料入口。榜單健康檢查實際回 503，演練流程把 staging pointer 切回 A。回復後確認 A 的 BUILD_ID、manifest、榜單和靜態內容雜湊均一致。
- 執行期間最低可用磁碟 21.32 GiB，最低可用記憶體 2.87 GiB。正式 release pointer 及五個相關 systemd 單元的設定簽章前後一致。暫時執行環境已清理。
- 供真備份演練續用，兩份封裝已逐檔核對後保存於 Contabo 的 `/var/tmp/stockinsider-t18-stage-948bb9e`，root 專用，合計 159.58 MiB（manifest 成員大小）。這些封裝屬 staging 候選。

榜單讀取使用受控唯讀 RPC fixture。既有 9/19 真備份已完成固定歷史版本回滾。此結果驗證新版封裝及故障切換，仍需把確切的新版封裝與真備份放在同一個隔離演練，在符合權限版本的 native producer 及審查後再完成正式發布門檻。正式資料庫、服務、排程和 PR #384 沒有寫入或啟用。
