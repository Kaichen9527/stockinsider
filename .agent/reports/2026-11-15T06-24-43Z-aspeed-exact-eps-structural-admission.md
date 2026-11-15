# T07 5274 正式 iXBRL 的兩輪驗證與 TypeScript 准入

固定產品 `f8be9f28bcaf9f4e2d1e8257bad8d7d201b30a43`，在 Contabo 的隔離非 root 程序以 115 秒 CPU、1,280 MiB 位址空間與 142 秒子程序 wall 限額重播同一份信驊 2026 年第三季申報。這些限額只作用於個別診斷程序；以單一 CPU、低優先權執行。首次程序開始前可用記憶體 4,023,976 KiB，根分割區可用 25,960,684 KiB。未呼叫正式 socket、資料庫、writer 或 credential；沒有更改 service unit 或部署。原件 SHA-256 跟 [前次重播](https://github.com/Kaichen9527/stockinsider/commit/59a90bef13658ac343c16b37f26460e030a7c5bd) 相同。

兩次重播的 Arelle 2.44.7 均完成原件與抽取 instance 的獨立離線驗證。保留 200 筆有明確作用範圍的錯誤，無整份文件致命錯誤，驗證 manifest 完整，文件狀態為 `partial`。兩次的 manifest SHA-256 與抽取 instance SHA-256 相同。Arelle 保留 11 筆通過結構檢查的事實與 33 筆定位。解析 wall 時間 79.725–81.989 秒，最大 RSS 1,013,280 KiB，約 990 MiB。實際耗量仍超出正式每層 25 秒 wall 預算及 parser 原 768 MiB 位址空間預算；這是單檔量測，未演練正式 cgroup 或併發容量。

使用固定 TypeScript decoder 與 mapper 對第二次的原始 bytes 和完整 manifest 直接重播，11 筆事實全數產生欄位投影。單季與累計同為 9/30 截止，但映射保留 period start、不同 period semantics 和四個不同的事實來源鍵。更改一個原始 byte、股票代號、要求季末或 manifest 均被拒絕。

| 2026 年申報期間 | period semantics | 基本 EPS | 稀釋 EPS | 歸母淨利 |
| --- | --- | ---: | ---: | ---: |
| 07/01–09/30 | `discrete_quarter` | 48.13 元 | 48.09 元 | 2,001,401,000 元 |
| 01/01–09/30 | `year_to_date` | 126.41 元 | 126.28 元 | 5,256,542,000 元 |

數值與 [正式 PDF](https://github.com/Kaichen9527/stockinsider/commit/019432593cdc157429c6cdc47ecb4d826864e512) 一致。另讀同一原件的 XML 宣告核對 2025 年追溯比較數字（單季 29.21／29.15，累計 65.67／65.51）。該查核只確認文件中有這四筆，固定 2026-09-30 准入不會為它們發出 2025 事實；尚待保存可驗證的重編／公司行動關聯。

後續需在 Codex VM 修正雙階段驗證的資源和 socket 取消，並以固定檔驗證容量、相同四筆 EPS、11 筆投影及錯誤範圍。完成實際 SQL receipt、會計驗證、財務橋接、估值、作者與獨立審查後，才能把這檔列為基本面完整正例。本次去敏證據包含執行計時、宣告與事實結果，未記錄原件或完整 manifest。兩次的觀察時間均為 11/15 UTC，不能回填更早 cutoff。
