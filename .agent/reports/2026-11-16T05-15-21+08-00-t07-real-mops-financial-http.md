# T07 信驊正式財報的 HTTP 驗收

2026-11-16 Asia/Taipei。測試基準為整合分支 `d0854343415e515f656dced8351ae2ebe6fab64f` 加上本次兩項修正。Codex Cloud staging 聊天受使用量限制，本次在 Contabo 的隔離 staging 建置與測試。暫時 PostgreSQL 17.11 由歷史 schema-only 快照建立，實際套用相依遷移。Next.js 16.3.4、PostgREST、私有檔案存放及 Arelle 2.44.7 透過隔離的 loopback 與 Unix sockets 執行。

## 重現與修正

- 擷取信驊（5274、TPEX）2026 Q3 MOPS 原件，共 469,661 bytes，SHA-256 `aca323d959623ca8d954f93b04a99fff3cd200733da5ee4d51a662f35e0503a0`。網路邊界在比對精確 MOPS POST 方法與參數後，以同一原件回放回應。
- 第一次實際解析提交收到 PostgreSQL `PT422 invalid_authority_request`。財報來源識別碼有 145 字元，既有 append 邊界上限為 120。保留完整原件雜湊與結構定位，使用 156-bit 事實識別後綴。回歸測試於修正前確認 145 與 120 的差異，修正後 8 項文件映射測試全過。
- 來源識別修正後，解析提交進一步抵達 PostgreSQL `55000 record "receipt_result" is not assigned yet`。擷取與解析分支現在分別賦值給具明確型別的 UUID，再寫入提交收據。更新結構化解析遷移的函式雜湊，維持原有 catalog 檢查。

## 實測結果

- Next.js production build 與 TypeScript 通過，17 項既有契約測試通過。兩個 authenticated HTTP 路由經實際 PostgREST 通過空佇列檢查，4 個錯誤驗證或 selector 請求在 RPC 前拒絕。
- 擷取回應 `200 acquired_pending_parse`，只讀取一次原件，收據與雜湊一致。解析提交完成，11 筆會計驗證收據落庫。
- 真實帳證讀回單季基本及稀釋 EPS 48.13、48.09，年初至今 126.41、126.28，各自保留原起迄期間。收據為 `partial`，解析 `complete`，既有會計驗證狀態為 `validated`。
- 解析端點依現有契約以 HTTP 500 回報已保存的 `partial`，內文驗證為 `success`。呼叫端應辨識這個結果，確認定稿狀態與錯誤告警的後續契約仍待驗收。
- 重跑新增 claim、事實及額度為零。最終有 2 筆 attempt、2 筆 commit、2 筆 outcome、2 筆 knowledge，研究工作與未釋放寫入 lease 均為零。

研究池資格、操作者與測試 session 使用隔離 fixture。正式來源端點的回放只含真實公開申報原件。真實來源收集、模型、獨立審查、相鄰收盤、正式備份還原與發布仍各有自己的驗收。PR #384 HOLD 持續有效。正式服務、資料庫、排程與 release pointer 皆未改動。
