# T07 部分 MOPS 申報的逐筆財務證據

續作版本 `793ddce9a24ffa3224ebf10e698fa33e7c52b12a`。Codex Cloud 用量限制期間，使用 Contabo 隔離 staging。正式服務、資料庫、排程與 release pointer 維持原設定。

- 重新取得信驊 5274 2026 Q3 MOPS 申報，觀察時間 2026-11-15T20:15:18.331Z，原檔 SHA-256 `aca323d959623ca8d954f93b04a99fff3cd200733da5ee4d51a662f35e0503a0`。用 Arelle 2.44.7 執行來源及抽取 instance 的離線驗證，耗時 86.788 秒。實際 Node 解碼、財報映射及會計驗證函式逐筆接受 11 筆。新投影綁定 11 筆原始收據和 10 筆當前事實。單季基本／稀釋 EPS 為 48.13／48.09，前三季為 126.41／126.28。四筆各自有原期間，股數基準均維持 null，原文件維持 `partial`。
- PostgreSQL 17.11 使用真實 MOPS 內容衍生的原始事實、結構 proof 和 TypeScript 會計驗證結果，寫入隔離測試的資料表及會計收據。正式會計寫入 API 未在這輪重跑。還原實際 v10 結構讀取、as-of 及既有研究指令後，舊 SQL 拒絕該封包，新 SQL 接受。拒絕控制涵蓋缺少文件部分涵蓋標記、舊版或致命 manifest、其他公司來源、已拒絕文件、截止後的會計驗證與其後的撤回。權限保留原版，只有隔離測試的已授權作者可經工作脈絡讀到支援旗標。
- 最終 SQL SHA-256 `c81a65c78e0ec5ea5f37defde088951d49c1d0a862bedd169e0ab98fabaa40f8`。第一輪重播的測試程式替不同事實使用相同記錄時間，觸發既有 revision conflict 防護。調整測試依照實際 append 的逐筆時鐘後，檢出原 descriptor 為 SECURITY INVOKER，修正 migration 前置檢查以保留實際執行權限。撤回檢查在獨立 SQL statement 執行，使用新的 statement timestamp。
- 35 項 Node 測試、變更檔案 lint、TypeScript、Next.js production build 與 92 個靜態頁面通過。快取準備只容許與實際通過的部分收據相連的 queued job。其他 queued job、running job、舊資料庫與支援旗標中途移除仍拒絕寫入。待補工作的狀態維持 queued。
- 實際準備 HTTP 路徑與完整 staging migration 套用、可比股本和財務期間依據、P/E 情境、作者與獨立審查、正式榜單仍待驗收。PR #384 維持 HOLD。
