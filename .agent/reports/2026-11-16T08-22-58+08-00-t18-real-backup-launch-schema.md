# T18 正式備份的新版榜單條件驗收

2026-11-16 台北時間。使用原本已核對的 2026-09-19 正式備份及保管交接，在 Contabo 獨立 staging 隔離還原。沿用固定主機身分、信任的原 manifest、一次性標準輸入及唯讀密文保管。操作紀錄未包含金鑰或原始資料。

| 階段 | 結果 |
| --- | --- |
| 首次新版真備份試跑 | PostgreSQL 曾執行 `pg_restore`，DB 單元最後退出 2。照舊只取單筆的收據介面漏掉「摘要＋拒絕」，已另驗隔離單元停止和資源回收。 |
| 診斷重跑 `eca0ed1` | 取得完整拒絕摘要。金鑰驗證後於 `radar_readpoint` 退件，正式服務簽章一致，隔離資源清理完成。 |
| 本機制修正 `fb2683f` | 原生 PG 實測正式 callback 未加 `-q` 會輸出 `BEGIN` 和 `COMMIT`，三個固定查詢改用 psql QUIET，保持原 READ ONLY 交易。7 項角色／查詢測試通過，另用正式參數實測六種資料狀態及凍結綁定。 |
| 修正後同一正式備份 | `DB_VERIFIED_T18_GAP`，退出 3。真實 DB 還原並完成 engine 驗證，還原 2,258,785,971 bytes、288 個外鍵、193 張 RLS 表。新版讀取觀察為 `SCHEMA_MISSING`。新版應用與回滾階段 `NOT_RUN`。 |

修正後的執行最低可用磁碟 16.15 GiB、可用記憶體 3.87 GiB。正式服務、排程與 release 簽章前後一致。隔離 DB、APP、REST 單元清除後皆 inactive。此次另清理 3 個已核對的臨時來源與封裝副本，當下可用空間差約 199.5 MiB。既有備份與兩個參考封裝保留。

已在同一生成資料庫驗證兩個真正 Next.js 16.3.4 封裝的 A/B/A 和 B 故障自動回 A。正式備份的缺 schema 是獨立的真資料缺口。仍需在隔離副本驗證正式遷移、取得新版可用的真實榜單和綁定詳情，重跑同環境新版驗收。此證據維持獨立審查門檻和 PR #384 HOLD。

- [staging PR #406](https://github.com/Kaichen9527/stockinsider/pull/406)
- [正式 psql 參數修正](https://github.com/Kaichen9527/stockinsider/commit/fb2683f1de998f4a8712e2b7b69ae1d805b1a45e)
- [生成資料回滾實測](https://github.com/Kaichen9527/stockinsider/issues/403#issuecomment-6903383625)
