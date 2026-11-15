# Contabo staging 兩場收盤觀測的重開機保全

2026-11-15 查核 11/16、11/17 的六個唯讀觀測全部已載入，台北 21:26、21:27、21:28 各一個。它們原本是暫存 systemd timer，採集程式也在 `/run`，主機若提前重開會一併遺失。

已把相同六組 unit 名稱寫入 Contabo 的磁碟啟動設定，三個採集腳本以原 SHA-256 複製到磁碟，保留原 DynamicUser、唯讀系統防護、時間和記憶體上限。啟動連結指向同名 unit，因此只有一個 systemd 身分。現有 live timers 的來源、狀態、下一次時間均逐一確認一致。此次未重新載入 systemd、啟動觀測、重開主機或改正式服務行程。

12 份磁碟 unit 均通過 `systemd-analyze verify`。逐份驗證 boot symlink、腳本路徑及雜湊。以 systemd 日曆從各日 13:00 UTC 計算，仍排在同日 13:26、13:27、13:28 UTC。從 13:30 UTC 計算，六個一次性時刻的下一次皆為 never，`Persistent=no` 保留，不會把錯過的採集補記成截止前證據。這是檔案、unit 與日曆驗證，未實際重開。

## 同版保全

本提交的 `deployment/staging/vnext/close-observers-202611` 收錄 15 個精確操作檔案，合計 34,832 bytes。三個 Python 檔案在 Contabo 位於 `/var/lib/stockinsider-stage-close-observers-202611/`，root 擁有、檔案唯讀。各 timer/service 位於 `/etc/systemd/system/`，六個 timer 以同名相對連結掛在 `timers.target.wants`。未收錄任何當場行情、私人 vendor 原始回應、憑證或使用者資料。

此設定僅保存實際收盤的來源可知時間與限定資料工件。21:30 正式發榜、writer、資格與市場兩場驗收仍依正式發布門檻。
