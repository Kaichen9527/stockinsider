# T07 與 T10 結構化財報解析時間及收據租約

整合版本 `8a442968b52d56c186a51eef9e40cc826c12b32f`。Codex Cloud 用量限制期間，在 Contabo 隔離 staging 驗證。真實申報測試使用離線非 root 程序及自建 Unix socket。原生 SQL 測試使用獨立 PostgreSQL socket 與合成周邊資料。正式服務、資料庫、排程及發行指標未操作。

- 用信驊 5274 正式 2026 Q3 iXBRL 原件重播，469,661 bytes，SHA-256 為 `aca323d959623ca8d954f93b04a99fff3cd200733da5ee4d51a662f35e0503a0`。Arelle 2.44.7 在 80.333 秒完成來源及抽取檔的離線驗證。文件仍為 `partial`，11 筆通過結構驗證。單季基本與稀釋 EPS 為 48.13、48.09，前三季為 126.41、126.28。保留各自起訖日期。同一 listener 在客戶端中途斷線後仍能回應下一個請求。PDF 或缺公司／期間的請求無法選擇延長設定。[先前原件與解析驗證基準](https://github.com/Kaichen9527/stockinsider/commit/6d841b229aace69e4a02595ecfa1c4019f13fea2)
- PostgreSQL 17.11 以實際準備 RPC 及嘗試資料表定義驗證 claim。修正前置 migration 兩個未括住的 CASE 條件造成的編譯錯誤。結構化 MOPS 嘗試與原收據同為 180 秒，原有嘗試、PDF、下載的 90 秒範圍通過。延長 PDF 時間的直接資料修改被約束拒絕，前置函式內容漂移時整份 migration 回滾。新 SQL 的 SHA-256 為 `79b3cf0f3cd1009af6cf7bc9e5c4a473721bd9fe5cd9a62da52bc0f60a69b520`。
- Python 22 項通過。Node 35 項通過，另有一項直接啟動 Arelle 的測試因未配置該測試專用的環境變數而跳過。實際 Unix socket 重播有另外執行。以最終 SQL 檔重跑 9 項靜態契約檢查均通過。第一次 web 建置發現 MOPS 下載前置回呼須回傳 void。調整後重跑 lint、Next.js production build 和 TypeScript 通過，共產生 92 個靜態頁面。
- 延長設定只供有效的結構化文件準備 claim 選擇。更新部署 unit 的記憶體上限至 1,536 MiB，尚未啟用新 unit 或驗證新 cgroup 的混合流量。原始文件的 `partial` 狀態與會計驗證門檻仍適用。實際準備 API、整套 migration 套用順序及真正備份重播仍待驗證，亦未完成基本面完整公司、作者、獨立審查與網站正例。PR #384 維持 HOLD。
