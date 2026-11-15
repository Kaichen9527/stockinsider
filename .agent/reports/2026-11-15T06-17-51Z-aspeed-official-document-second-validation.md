# T07 官方 iXBRL 兩輪驗證與斷線邊界

以固定產品 `f8be9f28bcaf9f4e2d1e8257bad8d7d201b30a43` 和同一份 5274 第三季正式 iXBRL，在 Contabo 非 root 隔離程序重播。下載的 SHA-256 跟前一輪一致。只在診斷子程序把 CPU 硬上限從 20 秒調到 55 秒，保持 768 MiB 位址空間上限，限定一個 CPU、較低優先權及 72 秒 wall 時限。重播前可用記憶體 4,015,456 KiB，根分割區可用 25,960,964 KiB。正式服務、資料庫、writer、憑證及線上解析器 socket 均未參與。[基準與官方來源身分](https://github.com/Kaichen9527/stockinsider/commit/c30663887deefc48f720389e08382dee9281c0d7)

| 階段 | 診斷子程序累計 CPU 時間 |
| --- | ---: |
| 第一次 DTS 載入完成 | 7.216 秒 |
| 第一次 Arelle 驗證完成 | 40.682 秒 |
| 從原件抽取 instance | 40.755–40.862 秒 |
| 第二次 DTS 載入開始 | 40.961 秒 |
| 程序以 `MemoryError` 結束 | user + system 54.650 秒，wall 55.117 秒 |

峰值 RSS 764,144 KiB。第二次載入未完成，未得到第二輪驗證、可採用的 EPS、有效輸出清單或 receipt。第一輪本身也超出現行 socket 與 Node 分別設定的 25 秒 wall 時限。這份量測只適用於這個官方文件與固定 runtime。

另外，用固定 socket Git blob 在 Linux 以真實 AF_UNIX socket pairs 重播「客戶端已關閉才回錯誤」的情形。連線保持到回應時，第二個請求能收到其預期的格式錯誤；第一端提早關閉時，錯誤處理中的 `sendall` 引發 `BrokenPipeError` 並離開服務迴圈，第二端未被接收。測試沒有連正式 socket。

下一次產品修正須保留兩次離線驗證、taxonomy 及文件雜湊、相同 occurrence 與 error-scope 規則。優先在 Codex VM 驗證先收集第一輪需要的身分與錯誤定位，再釋放 DTS，以第二個受限程序驗證抽取的 instance，或證明其他作法可現地降低峰值。協調 Node、socket 和工作租約的時間界線，並用實際 socket 測試客戶端取消後下一請求仍能被服務。用同一正式檔案交叉驗證 PDF 的單季及累計 EPS，再進入 receipt、版本橋接和獨立審查。
