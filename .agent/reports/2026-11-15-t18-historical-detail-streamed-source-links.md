# T18 同版歷史詳情的串流來源連結對照

2026-11-15 在 Contabo 以已發布歷史榜單的固定 revision 執行匿名 GET。API 與原始 HTML 均回 200，兩個完整回應的 SHA-256 與原先日期驗收收據相同。實驗只保留計數及 hash。[先前同版收據](https://github.com/Kaichen9527/stockinsider/commit/92a7f70fe5dccb40ecaf22444d90a6b1841a568c)

- API 有 10 筆 `sources`、1 筆 `sourceLinks`，另有 9 筆帶來源網址的事實。原始 HTML 中的實際 `a[href]` 含全部 11 次預期來源連結，逐一比對網址和重複次數相符。
- 剖析初始 HTML 時，「可追溯來源」區內當下只有 1 個 anchor。另外 10 個在 React 串流的隱藏片段內，找到對應主內容佔位符的替換指令。全部 11 個 anchor 的原始位置都曾在隱藏容器中。原始 section 範圍和完整 stream 各有其觀測範圍，仍須用實際瀏覽器核對完成後的位置與可見性。
- 同一份 HTML 在記憶體內只替換一個可定位 anchor 的 href，維持原標籤文字。網址比對抓到差異。這個控制沒有向替換的網址發送請求。

回滾驗收應先核對指定版 API 的每筆 fact URL 與獨立來源紀錄，再以桌機及手機實際瀏覽器完成串流處理，驗證可見的 href 與正確來源區域。資料副本的 FinMind URL 仍由現有 staging guard 拒絕，設定變更後的預期連結必須由固定原始快照與已審處理規則產生。不能以同標籤文字或 raw HTML 中找得到網址當作渲染證明。[現有驗證器](https://github.com/Kaichen9527/stockinsider/blob/1d957e28/deployment/staging/vnext/t17_keyfd/t18_detail_http.py)

此次未重跑正式備份、第二套 Next.js 版本、瀏覽器或回滾故障注入。
