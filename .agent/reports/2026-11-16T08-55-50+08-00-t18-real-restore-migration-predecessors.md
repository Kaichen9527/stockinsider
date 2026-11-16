# T18 正式備份的遷移前置驗證

Contabo 隔離 staging 使用同一份 2026-09-19 正式備份及可信交接，執行固定 staging commit `e088f2aa623a756ef7ec1792758953028bf34b3c`。PostgreSQL 17.11 engine 還原並驗證 288 個外鍵、193 張 RLS 表。新榜單回 `SCHEMA_MISSING`，此走讀以退出 3 保存資料缺口。尚未安裝新遷移或啟動新 App。最低磁碟 16.15 GiB、可用記憶體 4.10 GiB。正式服務、資料庫相關服務、排程、release 簽章前後一致，隔離程序及此輪三個準備用的副本皆清理，參考封裝與原備份保持。

## 實際前置資料

- 10 項已存在或相符。舊 V3 owner 屬性、交易日曆、價格觀測、公司行動、刷新佇列與私有 artifact receipt 表存在。backend request guard、artifact register guard 和 production writer fence 的定義及屬性符合新 CSV migration 固定的 predecessor 檢查。
- 11 項尚未通過。包括 vNext owner、核心、worker、catalog canonical、四種來源／研究／交易／公司行動資格、原生 CSV ACK、榜單與成效投影。這些是明確 catalog 條件，其中大部分為物件存在與否。未據此推定舊遷移 ledger 或付款／資料授權狀態。

## 已驗過的起點與順序

- 在另一個原生 PostgreSQL 17.11 私有環境用確切的 9/11 writer fence 定義安裝 `20261022_stockinsider_vnext_20_v1.sql`。結果為 14 張庫表由固定 owner 持有並啟用 RLS、14 個 writer fence，mode 初始關閉，佇列與發布資料為空，anon 與 service_role 都無直接表讀取權。移除前置 writer fence 的對照組安全拒絕，角色變更一併回滾。這次 DDL 驗證使用獨立小型測試環境。
- 核心之後的 `20261022_vnext_legacy_mode_fence_v1.sql` 提供 catalog canonical，且會核對待包裝舊 routine 的實際內容與 overload。下一次真備份演練需先比對這些定義，不能從物件名稱直接推定符合。快速啟動 worker 會依賴核心定義和已上鎖 legacy fence。thesis audit 會改寫核心和 worker 的指定前置定義，須保留順序。
- `20261115_vnext_launch_source_facts_v1.sql` 必須先於 `20261115_vnext_launch_ranking_v1.sql`，即使檔名排序相反。榜單還要求來源政策、business、交易資格與公司行動條件已就緒。後續成效與圖表須各自驗證 schema、版本與資料。現有 V3 財務安裝及 publication tail 使用以 10/11 catalog 為基準的工程驗收，不能以該 fixture 推定 9/19 已通過完整鏈。
- 另以真正三個 9/11 guard DDL 和當前 CSV migration 固定摘要驗證正例。更換同名 writer 或改變原 search path 會使精確檢查保持 false。

下一步是在同一驗證流程的可拋棄真實副本安裝固定核心，先核對舊 routine 是否符合 legacy fence 的已固定定義，再決定需補的前置 migration。真資料生產者、相鄰兩收盤、新版真榜單回滾、獨立審查和發布門檻仍開放。PR #384 保留 HOLD。

- [staging PR #406](https://github.com/Kaichen9527/stockinsider/pull/406)
- [固定 catalog 程式與隔離驗收](https://github.com/Kaichen9527/stockinsider/blob/e088f2aa623a756ef7ec1792758953028bf34b3c/docs/operations/2026-11-16/vnext/2026-11-16T08-38-19%2B08-00-t18-clone-migration-inventory.md)
