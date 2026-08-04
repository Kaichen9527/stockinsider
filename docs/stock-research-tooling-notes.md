# Stock Research Tooling Notes

這份筆記整理目前可以直接借鏡到 `StockInsider` 的 GitHub 專案，目標是補強台股資料、估值推論、以及用更像研究報告的方式輸出內容。

## 可直接沿用

- `node-twstock`
  - Repo: https://github.com/chunkai1312/node-twstock
  - 已經接進專案，適合繼續擴大使用 `quote / values / institutional / revenue / eps / dividends / shareholders`。
  - 下一步可補：
    - `dividends` 做股利與殖利率摘要
    - `shareholders` / `finiHoldings` 做籌碼面摘要
    - `marginTrades` / `shortSales` 做融資、融券、借券與券資比摘要
    - `historical` 做技術面與波段延伸計算

## 可移植邏輯

- `fundamental-analysis`
  - Repo: https://github.com/hjones20/fundamental-analysis
  - 可借鏡：
    - intrinsic value / margin of safety 的資料流
    - 穩定度篩選：EPS、ROE、負債、現金流等
  - 適合改寫成 TS 模組，不建議整包 Python 直接嵌進 web runtime。

- `tw_stocker`
  - Repo: https://github.com/voidful/tw_stocker
  - 可借鏡：
    - 台股歷史資料持續更新的資料表結構
    - 用 CSV / 時序資料支援技術面與報酬回測

- `VincentLiu3/TWSE`
  - Repo: https://github.com/VincentLiu3/TWSE
  - 可借鏡：
    - TWSE / TPEx 原始欄位對照
    - 台股代號 / 市場別格式整理

## 可借鏡資料與情緒設計

- `stocksight`
  - Repo: https://github.com/shirosaidev/stocksight
  - 可借鏡：
    - 新聞 + 社群 + sentiment 的合流方式
    - 關鍵字 / ticker 為核心的事件追蹤
  - 不建議直接搬整套，因為原始設計偏美股與 Twitter。

- `junhoyeo/threads-api`
  - Repo: https://github.com/junhoyeo/threads-api
  - 可借鏡：
    - Threads session/token cache 的設計方式
    - 查詢與貼文物件的欄位結構
  - 注意：
    - repo 已 archive，適合作為 auth/session 參考，不建議直接當 production runtime 依賴。

- `Danie1/threads-api`
  - Repo: https://github.com/Danie1/threads-api
  - 可借鏡：
    - cached token path 與重連策略
    - 用持久 token 減少實際登入次數
  - 適合拿來對照我們自己的 `threads-auth-debug / persisted session` 流程。

## gstack 可怎麼複製到這個 App

- `gstack`
  - Repo: https://github.com/garrytan/gstack
  - 目前最值得直接借用的不是 UI，而是 workflow：
    - `browse`: 真實打開頁面驗功能與內容
    - `qa`: 用使用者視角跑整段流程
    - `canary`: deploy 後做 smoke + regression
    - `design-review`: 驗 deep-dive 頁是否太亂、資訊密度是否失衡
  - 適合放進 `StockInsider` 的使用方式：
    - deploy 前固定跑 `lint/build/e2e`
    - deploy 後固定跑 `sources -> stock -> deep-dive` canary
    - 對 investanchors / threads 等易壞 connector 做定期 smoke
    - 對首頁分層做固定檢查：
      - `正式推薦` 與 `情境上行候選（非正式）` 不可混淆
      - 情境候選卡片必須明示 `Base 未過現價`
    - 對 deep-dive 主文做固定檢查：
      - 必須有 `焦點內容 / 投資建議 / 市場故事 / 主要財務數據及估值 / 風險與失效條件`
      - Appendix 必須仍保留技術面與完整來源

## 建議後續實作順序

1. 擴大 `node-twstock` 使用面，先補齊股利、董監持股、三大法人、股東結構。
2. 把 `fundamental-analysis` 的估值思路改成 TS 版：
   - EPS × PE
   - PBR 區間
   - margin of safety
   - bull / base / bear 三情境
   - 同時補 `故事 -> 變數 -> EPS / multiple -> 目標價` 的 valuation bridge
3. 把情緒與來源品質拆開：
   - 情緒只當輔助
   - 估值與目標價只接受官方 / 財務 / 高品質研究
   - `Threads / Telegram / PTT / BullTalk` 主要用來補：
     - 市場現在在交易什麼故事
     - 哪條敘事最早發酵
     - 市場情緒偏樂觀、保守，或分歧
   - 但它們不應直接決定 recommendation state 或 target price
4. 用 gstack 的 `browse/qa/canary` 固定驗：
   - 首頁百分比與 deep-dive 一致
   - deep-dive 有真實數字，不是「未知」
   - 主文有市場故事，不是欄位堆疊
   - Threads 沒有 direct-hit 時，不可把 login wall 或 author timeline 塞進主文
