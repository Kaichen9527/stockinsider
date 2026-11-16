# T18 vNext 核心遷移與 legacy 前置核對

新版固定封裝在已驗證且可拋棄的還原副本發現缺 schema 時，只有加入兩個經 SHA-256 固定的遷移輸入後才可進本演練。先核對 Unix socket、`t17_restored`、原 9/11 writer guard／V3 owner、三個必要角色及全新 vNext schema，再執行原核心遷移。核心應保持 mode 關閉，14 張表均有 RLS 與原 writer fence，研究佇列與公開資料列為零。未啟動 REST 或 App。

Legacy fence 會要求 15 個既有研究函式的固定簽章與權限。讀取探針從雜湊固定的原 migration 提取同一 canonical 序列化與 catalog 查詢，分類缺失、overload、定義或權限差異、完全一致。探針的暫時序列化函式在同一交易回滾，核對回滾後無 legacy 指標或模式變動。此步不執行舊研究函式、不安裝 legacy fence。

在 Contabo 隔離 PostgreSQL 17.11 用確切 9/11 writer guard、新核心與原 legacy 來源測試。writer guard 缺失時保持原狀。正例安裝固定 14 張表及 14 個觸發器、空資料及停用狀態。生成的同名異版與 overload 都被辨識，另外 13 個未建立的函式回報缺失；暫存 helper 回滾，既有函式摘要相同，測試副本已清理。使用正式 callback 的 psql 參數。

這是生成 catalog 的原生機制驗證。正式備份副本的核心安裝與 15 個舊 predecessor 驗收另保留去敏結果。未通過獨立審查前不變更正式服務或 release HOLD。
