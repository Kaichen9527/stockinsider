# T16 Mac 專案資料與本機佔用盤點

2026-11-16 台北時間。以專案 checkout 內的檔案 metadata 與 APFS volume 可用空間為範圍。盤點時 Mac 內碟剩 4.12 GB，`du` 顯示此 checkout 配置約 952 KiB，當時沒有掛載 `SAN_128GB`。

| 範圍 | 邏輯大小 | 個別檔案配置空間 | 與保留／復原的關係 |
| --- | ---: | ---: | --- |
| `backup/` | 16.54 GB | 0 B | 259 個檔案皆為 dataless。逐項保留至已有清單、獨立下載雜湊及還原驗證。 |
| `.agent/` | 13.27 GB | 16 KiB | 可能含回報、WIP 或證據，尚未逐件驗證引用及保留期限。 |
| `.codex-worktrees/` | 9.38 GB | 0 B | 尚未核對各 worktree 最新 GitHub 對應和未推版本，保留。 |
| `.git/` | 1.25 GB | 48 KiB | Git 歷史和可能未推物件，保留。 |
| Node 建置／相依資料 | 18.12 MB | 80 KiB | 典型可重建資料，仍無值得清理的居民空間。 |

邏輯大小包含同步佔位檔。配置統計可能包含共享或壓縮檔案的區塊，不能當成刪除後可回收額。盤點沒有下載備份、讀取備份內容、寫入新的本機專案檔或刪除既有資料。一開始嘗試讀 Git 狀態時遭遇長時間等待，看到 pack 多為 dataless 後已終止該查詢，後續只使用 metadata 和 GitHub，未依本機 Git 狀態推定 worktree 安全。此次回收為 0 B。

接續使用 Codex VM 和 Contabo staging。iCloud 的大檔仍等待在已登入的 Cloud Desktop 下載，之後以可信清單做雜湊、解密和必要還原驗證。專案路徑以外的 Mac 檔案不在此次盤點範圍。
