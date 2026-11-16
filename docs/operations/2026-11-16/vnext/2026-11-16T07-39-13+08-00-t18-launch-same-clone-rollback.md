# T18 新版同一隔離副本故障回滾

新版固定封裝加入既有同一 clone 演練。還原引擎照原有 T17 條件完成後，辨識整組 immutable manifest。缺新版 schema、producer 尚未啟用、沒有榜單、Top 0 及不合法的名次資料仍回報資料缺口。觀察到有名次的凍結榜單後，從同一 clone 核對交易日、21:30 cutoff、run 與每檔研究／評分／資格版本，再套用固定 SQL、ownership 和兩個公開投影角色。根據已驗證的封裝組啟用 staging App 旗標。APP 和 REST 沿用原有 broker、唯讀代理、短效憑證和故障觀察。Legacy profile 不變。

## 實機驗收

在 Contabo 私有 loopback 以非 root 身分執行實際 Next.js 16.3.4、PostgreSQL 17.11 與 PostgREST 16.3。隔離 clone 使用生成的凍結排名、最小測試綱要與固定 SQL 查詢。兩個 entrypoint 確切定義經 role installer 驗證，幾個相依資料查詢使用測試輸入。使用暫時程序控制器啟動實際服務，沿用 runner 的 A → B → A、角色、代理、HTTP、故障檢查及收據驗證程式。正式三單元的 kernel／cgroup 准入證據來自前一輪，沒有把測試控制器當成實際 host admission。

| 步驟 | 固定來源 | BUILD_ID | 首頁、綁定詳情、靜態資產 |
| --- | --- | --- | --- |
| A | `f67548d` | `ax-PpYISKH9qBzNpA8JK8` | 200 / 200 / 200 |
| B | `948bb9e` | `G2grVK9zibGvacOqWUL65` | 200 / 200 / 200 |
| 回到 A | `f67548d` | `ax-PpYISKH9qBzNpA8JK8` | 200 / 200 / 200 |
| B 故障後自動回 A | `f67548d` | `ax-PpYISKH9qBzNpA8JK8` | 200 / 200 / 200 |

- 榜單原交易日全程 `2026-11-13`（生成資料）。凍結榜單與 API 詳情 SHA-256 跨版本一致，頁面出現綁定資料。B 的實際 Next 程序終止後健康檢查失敗，runner 自動啟動 A。
- 代理允許 30 次讀取，既有代理／REST 八項拒絕檢查維持，未為讀取寫入成效訊號。DB 凍結內容及約束位元保持相同。清理程序、連線和暫存資料。
- 37 項 staging 回歸測試通過，包括禁止在缺資料時啟動、原始日期／版本不一致拒絕，以及 B 凍結詳情不一致會拒絕驗收。

此收據僅證明以兩個真實封裝及生成資料重現回滾。目前未取得正式備份的可信金鑰交接，未在真正正式備份還原副本驗證新版。正式備份若沒有新 schema 或合格真實榜單，保留缺口。獨立審查、既有 HOLD 及正式部署條件保留。
