# T18 新版封裝的 Contabo 隔離主機驗收

2026-11-16 台北時間。Contabo 隔離 staging 比對既有 T18 主機來源與 GitHub 固定版 `41cb7855a6374abf3cd49525bd1a77a98f18f46c`，只在臨時副本切換 staging 資產目錄與成對固定版本。

| 版本 | Git commit | Next.js | BUILD_ID | 封裝 manifest SHA-256 |
| --- | --- | --- | --- | --- |
| A | `f67548d87f2563608aa1469c14e6976d52a866cc` | 16.3.4 | `ax-PpYISKH9qBzNpA8JK8` | `a980d41f1f76c6e96a9dcb7349df129606ec37c234850933297dca7b9bac266a` |
| B | `948bb9e448eda468bb618f78ec6b0ca1d691d0d5` | 16.3.4 | `G2grVK9zibGvacOqWUL65` | `7baa6bab4e6140c41b1fa7cb9ac96cac23e1746f2e017ef3be3291d42115b1be` |

- 每版逐項檢查 3,052 個封裝項目。舊固定版本表搭配新封裝被拒絕，可寫資產掛載也被拒絕。新版固定表、唯讀資產掛載與唯讀 Node 通過。
- systemd 三個鎖定身分各有獨立受限 cgroup，並確認共用隔離網路 namespace。資料庫、應用程式、REST 的記憶體上限為 768、512、256 MiB，swap 上限為 0。
- 最低可用磁碟 24.16 GiB，最低可用記憶體 4.09 GiB。暫存程序和路徑已清理，正式服務、排程及 release 指標前後簽章一致。

結果為 `HOST_PREREQUISITES_VERIFIED_ONLY`。這次沒有開啟備份、讀入金鑰、初始化加密工作磁碟，或啟動資料庫與 Next.js。新版的封裝回滾另用受控讀取資料完成。T18 尚需使用正式備份與同一還原後資料庫執行新版 A/B/A，並檢查真實資料詳情。保留既有 HOLD 和獨立審查門檻。

- [新版封裝回滾紀錄](https://github.com/Kaichen9527/stockinsider/blob/2bc46b0eb9f054cb1618494938a86f7a4d0ae509/.agent/reports/2026-11-16T06-39-21%2B08-00-t18-integrated-standalone-preview-rollback.md)
- [舊版真備份還原與回滾紀錄](https://github.com/Kaichen9527/stockinsider/blob/41cb7855a6374abf3cd49525bd1a77a98f18f46c/docs/operations/2026-11-15/vnext/contabo-t18-real-fixed-pair-detail-and-rollback.json)
