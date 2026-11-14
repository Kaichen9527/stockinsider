# Contabo 私有檔案與收據關聯盤點

2026-11-15 台北清晨，從既有 pinned SSH 連線讀取 StockInsider 私有內容位址儲存的檔案 metadata，與 PostgreSQL 17 `stockinsider` 資料庫的實際收據比對。資料庫執行 `BEGIN READ ONLY`，檢查 `transaction_read_only=on`，各查詢限制 5 秒。第二階段使用 `REPEATABLE READ READ ONLY`。每階段在同一短時間內兩次核對檔案與 SQL 結果，兩次相同。個別雜湊、檔案內容、識別碼均未離開主機。未讀檔案正文，未改動正式服務或資料。

## 範圍及實際結果

| 分類 | 物件 | 表觀 bytes | 配置 bytes |
| --- | ---: | ---: | ---: |
| 全部私有物件 | 2,196 | 1,392,830,116 | 1,397,297,152 |
| 私有物件與財報文件收據均匹配 | 517 | 338,184,915 | 339,230,720 |
| 只有財報文件收據 | 8 | 10,550,883 | 10,567,680 |
| 兩個收據表均無匹配 | 1,671 | 1,044,094,318 | 1,047,498,752 |

初次取證 UTC 2026-11-14T21:44:46.159286Z。檔名與路徑前綴符合 SHA-256 結構，均為常規檔案，無其他結構或暫存項目。兩張核心收據表所有雜湊都有相應檔案、兩者所列長度與檔案 metadata 相同。8 件僅有文件收據的物件都有 issuer queue 關聯。這裡是 metadata 覆蓋核對，未重算檔案內容雜湊。

擴大取證 UTC 2026-11-14T21:45:50.986660Z。除兩張收據外另核對 parser 的文件、manifest 與 error-manifest SHA，issuer queue 文件 SHA，acquisition job response SHA、assistive artifact hash、runtime key／source path 的尾段 hash 及 legacy canonical content hash。這些直接欄位在上述集合之外未找到額外匹配。未檢查所有 JSON 內的引用、獨立冷封存、現行執行中工作或全部歷史檔案。含目錄與資料庫的兩次讀取總量有限並在主機完成。

| 無相符欄位引用的檔案修改時間 | 物件 | 配置 bytes |
| --- | ---: | ---: |
| 過去 24 小時 | 154 | 99,139,584 |
| 1–7 日 | 83 | 59,396,096 |
| 7–30 日 | 815 | 512,163,840 |
| 30 日以上 | 619 | 376,799,232 |

修改時間只供觀察，不能作建立時間或可刪證據。本輪已釋放 0 bytes。盤點前讀得檔案系統可用 26,585,575,424 bytes、MemAvailable 4,077,664 KiB。只是取證當下的數值，下一輪演練仍應量測容量峰值。

## 財報 queue 與留存的關聯

固定正式版 `dd59817` 的財報 queue 呼叫 `refreshCandidateOfficialFinancials`；此路徑可取得 job lease 並下載文件，但 route 沒有取得私有物件登記要求的 `production-data-plane` 寫入租約。寫入 helper 先持久化內容位址檔案、再呼叫 `register_private_artifact_receipt_v1`。SQL 先檢查 active backend 及有效租約，拒絕後 receipt 與 job reconciliation 均不能完成，私有檔案則可能已存在。不能把現有 1,671 件逐件歸因於這個原因。

在隔離 staging 重現原入口的無租約控制，再以同一路徑取得自己擁有的受限租約驗證正例與併發。沿用 job lease 和既有 writer 授權，避免以另一個執行中的全域租約當成自己的成功。持久化範圍須覆蓋 artifact receipt、文件 receipt 及 job reconciliation，重跑須重用相同內容位址。到期、失敗或第二個並行工作須明確回報並保留可安全重跑狀態。既有 upload／worker 的受控測試提供基礎，但歷史測試未涵蓋每日 queue。未有該版本或本輪的真實修正驗收。

接下來按 T16 保留現場檔案，待比對有效工作及冷封存 manifest。所有擬清檔都須由私人 manifest 指明、確認無現行依賴、並先在乾淨環境從獨立雲端複本還原。新版 queue 通過隔離驗收後才核對是否仍擴大。不得按修改日期清理或跟隨另一應用資產。

[正式 queue 入口](https://github.com/Kaichen9527/stockinsider/blob/dd59817f750684b093965f539dd4de466be13077/web/src/app/api/internal/candidate-financial-queue-drain/route.ts#L98) · [私有物件寫入](https://github.com/Kaichen9527/stockinsider/blob/dd59817f750684b093965f539dd4de466be13077/web/src/lib/candidate-financial-artifact.ts#L19) · [租約 SQL](https://github.com/Kaichen9527/stockinsider/blob/dd59817f750684b093965f539dd4de466be13077/migrations/20260911_contabo_data_plane_v1.sql#L257) · [既有受控驗收](https://github.com/Kaichen9527/stockinsider/blob/dd59817f750684b093965f539dd4de466be13077/docs/operations/2026-10-14/financial-document-owned-lease-handoff.md)
