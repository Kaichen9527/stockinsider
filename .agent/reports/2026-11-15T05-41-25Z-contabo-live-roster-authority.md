# 普通股與市場身分的 Contabo 實際差異

分別讀取政府登錄的集保證券基本資料、上市與上櫃公司基本資料、兩市場收盤，以及證交所最近掛牌資料。六份 CSV 記錄原始雜湊及實際擷取時鐘。11/13 的兩市場收盤資料是 11/15 取得，不能追認為當日可知。公司清單報表日為 11/14。集保 11425 的市場欄可輔助交叉核對，但 145,052 筆還含終止上市櫃、ETF、特別股及存託憑證，無普通股型別欄。11/13 的上市收盤裡，四碼但不在同版公司資料的八檔含 ETF。反過來，即使同時在三個來源出現，也不能確立是普通股，9105 是反例。[集保登錄](https://data.gov.tw/dataset/11425) · [上市公司資料](https://data.gov.tw/en/datasets/18419) · [最近掛牌資料](https://data.gov.tw/dataset/11542)

Contabo 正式資料庫唯讀實測 `stock_instruments_v3` 共 7,914 筆。最新來源日期為台北 08/15，最後寫入 08/16，9 月以後為零。11/13 cutoff 與此次觀測的可見普通股 active 計數相同，上市 1,089、上櫃 890。這兩個計數包含已知錯誤，不能作廣度分母的正例。

| 作為重驗對照 | 正式公告與現有 authority 的實際差異 |
| --- | --- |
| 9103、9105、9110、9136 | 證交所列為 TDR，但既有 authority 列為 active common stock。 |
| 8908 | 10/16 自櫃轉市。11/13 的交易所成交、11/14 MOPS 與 11/15 TDCC 均屬上市，authority 留於上櫃。 |
| 7812、6908 | 7812 於 09/22 創新板上市，現有 authority 無對應；6908 有普通股在創新板的正式資料。創新板標籤本身不排除股票，其他資格仍照規格。 |
| 6757 | MOPS 沿用最初上市日，正式公告另有 2024-11-29 改列一般板。改列是商業事件，不會重設當時的普通股存在日期，也不會自動觸發首五日規定。 |
| 1589、3714 | 1589 停止買賣、11/18 預定終止上市，現行 authority 仍 active；3714 的 11/13 無當日列，交易所另有 11/16 減資恢復參考。只有官方事件能決定實際狀態，缺報價本身沒有確切原因。 |

[證交所 TDR 對照](https://wwwc.twse.com.tw/zh/focus/links.html) · [正式掛牌資料](https://wwwc.twse.com.tw/zh/listed/listed/new-listing.html) · [6908 普通股公告](https://www.twse.com.tw/zh/search.html?f=&q=6908) · [6757 改列公告](https://wwwc.twse.com.tw/staticFiles/news/news/tsecnews/8a8216d6933460a40193723f7325022d.pdf) · [1589 交易公告](https://investoredu.twse.com.tw/FileSystem/FileUpload/d0048d9a-e912-42ee-9c32-7a5bbff1d010.pdf) · [3714 復牌參考](https://www.twse.com.tw/exchangeReport/TWTAUU?response=html)

接線應以前置 cutoff 內有權使用的逐證券身分、公告有效交易日、兩市場共同身分及實際收到時間，走既有 owner-scoped 名冊入口。分類先於活躍普通股選擇。同一證券轉板或跨市場，須用同一 stock 身分附加新版、正確結束前市場有效期並保留歷史。未應用和晚觀測的更正不能人工改寫歷史 cutoff。當日交易證明與型態暖機需要自己的版本，市場轉換前的股數與市場相對強度不能混用。

產品分支已有 ISIN 帶 CFI 的 observed roster migration，但目前執行中的正式庫無該表；該 migration 本身也不會更新既有 `stock_instruments_v3`。測試需覆蓋已證實的 TDR 排除、跨市場新版與舊版並存、創新板普通股、實際停止狀態、完整覆蓋與已發榜後更正。維持原 95% 門檻和獨立 review。此次未寫入任何正式或 staging 資料庫，亦未改排程或發布狀態。[去敏資料收據](../../openspec/changes/stockinsider-vnext-20/evidence/2026-11-15-t06-live-roster-instrument-mismatches.json)
