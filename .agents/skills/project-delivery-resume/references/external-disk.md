# 外接磁碟核對與執行位置

使用者之後會接上外接硬碟，不表示目前已掛載、已授權格式化或已搬移工程。Mac 容量不足先依 companion storage Skill 的 `references/mac-capacity-recovery.md`：本案可重建輸出 → iCloud → 已驗外接碟 → 指定 Drive；本頁負責第三階段的實際磁碟核對。Mac 常態建置建議直接連接、供電與連線穩定的 SSD，並使用適合 Mac 開發的 APFS。選擇格式會影響其他系統相容性；實際格式化另需明確授權。不要把同名舊卡或未掛載資料夾當成新外接碟。

## 首次採用與每次重型作業前

1. 查實際 mount、Volume UUID、filesystem、可用 bytes 與使用者指定用途。核對解析後 workspace 路徑確在這個卷上，且不是符號連結回內部磁碟。不能先 `mkdir -p /Volumes/猜測名稱/...`，否則缺掛載時可能寫入內部磁碟。
2. 內部 Data 與外部工作卷分開算 reserve、當前占用、下一批 peak、cache／Git／解包／候選與 evidence。兩邊都合格才啟動。本案更高的原停止／恢復線保持有效。
3. 可用 `scripts/external_disk_preflight.py --help` 查看唯讀檢查。它不建立目錄、不搬檔、不格式化、不啟動 build；讀成功也不代表實際寫入或整個 build 已驗。執行前後與分批間要重查，防止拔除／休眠／掛載改變。
4. 外接卷缺席、UUID 不符、路徑落在錯卷或容量不足，停止這個外接作業並保存小型 checkpoint；不默默 fallback 到內部磁碟。已授權的 Cloud 工作可獨立續行。

## 安排資料

已核實外接碟可放具重建步驟的 checkout／worktree、有限 compiler cache、選定 build 輸出、必要保留候選。不要一次搬整個 home／Library，也不要搬正在寫的 DB、AVD、Simulator 或被另一 Agent 擁有的工作樹。有 linked worktrees 時先核共同 Git metadata，移動／刪除前保護所有關聯工作樹。

Xcode 可使用專案限定的 `-derivedDataPath`。Gradle 可設定 `GRADLE_USER_HOME`；它不會自動移走 checkout 裡的 `.gradle`／`build`。Android 官方支援 `ANDROID_HOME`、`ANDROID_AVD_HOME`，但搬 AVD 要先停止並核對相依 image／INI 與啟動結果。不要把新空白模擬器當成原驗收環境。

保留目前／rollback 候選、符號、唯一來源、未解失敗、正式資料與恢復字典；成功重複 log 可依既有批准政策留去敏摘要和必要失敗片段。藝術逐幀原畫、科研原始資料與金融收據不是一般 debug log，不因通用配額而刪。iCloud 同步與外接容量都不是內部工作空間的擴容。

## 執行地點

可攜工作先 Codex VM。一次有界診斷證明能力／容量／網路／額度缺件後，保存同任務狀態並改隔離 Contabo；使用者偏好已給，不再問一次。需要 Apple 平台或合適本機裝置時再使用具能力 Mac／已驗外接卷。不能把搬機當作清零 attempts 或重開研究時計。VM/Cloud 磁碟依實測，Mac 外接 SSD 不會自動出現在遠端。

官方參考（2026-11-22 查核）：

- https://support.apple.com/guide/disk-utility/file-system-formats-dsku19ed921c/mac
- https://developer.apple.com/documentation/xcode/distributing-documentation-to-other-developers.md
- https://docs.gradle.org/current/userguide/directory_layout.html
- https://developer.android.com/tools/variables
