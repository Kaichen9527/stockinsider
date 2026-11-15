# T07 信驊正式財報的下載與結構驗證

以固定版 `f8be9f28bcaf9f4e2d1e8257bad8d7d201b30a43` 的 Git blobs、現場安裝的 pdfplumber 0.11.8、Arelle 2.44.7 與核對過的 2026-03-31 taxonomy，在 Contabo 的隔離非 root 程序重播 5274 第三季官方申報。未呼叫線上解析器 socket、資料庫或正式 writer。只保存雜湊、階段及錯誤證據。前一輪從 PDF 核對的單季基本 EPS 48.13、累計 126.41 和同期追溯值仍是此案的比對基準。[原始財報期間與追溯調整證據](https://github.com/Kaichen9527/stockinsider/commit/019432593cdc157429c6cdc47ecb4d826864e512)

| 階段 | 結果 |
| --- | --- |
| 官方 PDF | 重新下載的 1,403,978 bytes 與前輪 SHA-256 相同。固定程式列出 49 頁、53 筆定位，其中 4 筆表格定位；第 7、32、33 頁皆能定位。缺少已驗證 PDF manifest 時保持 `partial` 並回傳 0 筆已驗證數值。刻意給錯 SHA-256 時，程式在解析前拒絕。 |
| 官方 MOPS iXBRL | 附件 `tifrs-fr1-m1-ci-cr-5274-2026Q3.html` 為 469,661 bytes。原始 HTTP 200 的 Content-Type 為 `; charset=iso-8859-1`，其中媒體類型為空；Python HTTP helper 顯示的 `text/plain` 是預設解析結果。以 Node v22.23.1 和目前產品的 POST、User-Agent、分類、MIME 正規化及格式驗證重播，精確 SHA-256 一致，分類通過並識別為 `xbrl`／`application/xhtml+xml`。 |
| Arelle 原程式 | 相同 bytes 的兩次重播皆以 SIGKILL 結束，未得到驗證輸出。含量測的原程式重播耗時 22.301 秒，user CPU 20.068 秒、system CPU 2.054 秒，峰值 RSS 439192 KiB。固定程式有 20 秒 CPU 硬上限，socket 與 Node 的時限各為 25 秒。查核時窗的 kernel journal 沒有 OOM 紀錄。 |
| Arelle 階段定位 | 另一次重播僅加 Arelle 入口計時，既有限額保留。CPU 約 7.74 秒時完成第一次 DTS 載入及進入第一次 validation。程序仍在第一次驗證時結束，尚未到抽取 instance 或第二次載入／驗證。這是效能限制的診斷，無法據此判定財報是否可驗證。 |

要修的第一個邊界是有官方 taxonomy 的 Arelle 第一輪驗證。下一版應先在隔離 Codex VM 對同一 SHA-256 用受控 CPU、wall、記憶體和併發配置量出兩次驗證的總成本，再決定縮短重複處理或採用單獨的背景工作預算。保留原件與抽取 instance 的兩次驗證、離線與 taxonomy 身分核對、數值 occurrence admission 和工作並行界線。

實際受驗驗收需回傳同 issuer、同期間的單季與九個月基本及稀釋 EPS，核對單位、合併範圍、追溯版本和來源可知時間，並完成 receipt、財務橋接、作者及獨立審查。此次無已驗證的 iXBRL 數值、receipt 或榜單更新。11/15 觀察結果不能用作 11/15 之前已收錄的研究版本。機器證據保存於同一 commit 的 OpenSpec evidence。
