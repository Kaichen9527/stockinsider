# T18 同一正式備份的 PostgreSQL 角色對照

延用 9 月 19 日真實備份、固定還原工具與 Contabo staging 身分。測試時 SQL 使用 `postgres`，PostgreSQL 只接受該 staging 系統帳號透過指定 Unix socket 的 peer 映射。原生負例確認其他角色被拒，真實副本核對無密碼及無 TCP 監聽。這是一輪獨立比對，原本的正式備份還原驗收另有紀錄。

49 個財務遷移及所有權步驟完成後，30 個受校驗角色及 242 個函式全部對上。前次使用 staging 帳號作 SQL 初始化者時，分別有 12 個角色及 139 個函式不同。兩個 `service_role` 資料表權限差異也已消失。估值兩張表和 `public` schema 仍有既知差異。

完整物件目錄另剩四張資料表及 36 個擴充套件函式的 ACL 差異，以及已辨識的擴充套件額外物件。四張表的原基準 raw ACL 都是 null。原生對照證明從無額外權限的表撤權可改寫 ACL 表達但保留實際表權限，函式撤權則可能改變執行權。兩者各自需要在真實副本逐物件驗證。

正式簽章一致，隔離資源已清理。原校驗仍拒絕，26 個發布遷移及新版回滾待驗。

[可機讀驗收](../../docs/operations/2026-11-16/vnext/t18-authentic-canonical-postgres-peer-comparison.json)
