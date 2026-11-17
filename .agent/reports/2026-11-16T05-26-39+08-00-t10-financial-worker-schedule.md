# T10 財報排程保留已驗證的部分結果

2026-11-16 Asia/Taipei。基準 `881f876f4d7e2e34de9e3a4f87376733424ac289`。Codex Cloud staging 聊天受使用量限制，本輪建置與測試使用 Contabo 隔離 staging 的暫時檔案系統、loopback 及 PostgreSQL 17.11。正式服務與資料庫只進行唯讀盤點。

## 問題與處理

- 現行已載入的 Contabo queue-drain 服務使用同一把寫入鎖及同一序列呼叫器，先市場資料，再財報擷取（limit 240）及文件解析（limit 5）。兩個財報子步驟均配置 `continueOnError`。正式 timer 仍等待，現有服務最近狀態為 failed，最近 40 筆 journal 中有 4 筆匹配既有 lease 錯誤。數字計事件，與本輪部分結果分開。
- 文件 worker 會把已提交、經會計驗證且仍有缺項的財報回報為 HTTP 500、`ok:false`、`status:partial`。既有排程把整批記為失敗。
- 排程呼叫器只將精確文件 worker 的當前、已知時間有效、全部屬已驗證完成或已驗證部分結果的批次記作已保存，並明示部分結果警示。HTTP 回應內容、缺項、公開及排名資格照原契約。若同批有拒絕、延期、待處理、未驗證部分或 API 錯誤，排程仍記失敗。

## 驗收

- 原呼叫器在新增回歸案例中失敗。修正後 18 項呼叫／序列測試通過，含 8 個拒絕案例，確認下一個獨立步驟照原序列執行。
- Next.js 16.3.4 production build、TypeScript、17 項既有契約測試通過。
- 用 checked-in systemd 中的財報兩步與原參數執行實際序列和呼叫器，經 Next.js、PostgREST、獨立 PostgreSQL 與 Arelle。原件為信驊（5274）2026 Q3 公開 MOPS 申報，精確 POST 邊界回放原件，SHA-256 `aca323d959623ca8d954f93b04a99fff3cd200733da5ee4d51a662f35e0503a0`。候選資格與交易 session 為隔離測試建置資料。
- 擷取、解析各一件。排程序列 exit 0，保留 `partial` 與警示，11 筆會計驗證收據落庫。重新呼叫解析不增加 claim、事實、研究額度或未釋放租約。兩個端點都拒絕未授權及不合資料契約的請求。

此結果限財報兩步。每天 21:30／08:15 新正式路徑、兩個實際相鄰收盤、真實來源及模型仍待驗收。正式服務、排程、資料庫與 release pointer 無寫入，PR #384 HOLD 保留。
