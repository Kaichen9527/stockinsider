# 強勢發動雷達個股圖表驗收

2026-11-16，台北時間。執行於 Contabo 隔離 staging。檢查前可用磁碟 25,142 MiB，可用記憶體 4,034 MiB。只使用暫存工作區、非特權執行身分及獨立的 loopback 網路。正式服務、資料庫、排程及發行版本未被操作。Codex Cloud 當時仍受使用量限制。

| 項目 | 結果 |
|---|---|
| 原始碼 | `d18875eaaf5d8d304f5e2634d2f0772ffae78660`，13 個變更後程式與測試檔案的 Git blob 與執行輸入一致 |
| 型別與排程相容性 | 全站 typecheck 通過。BigInt 與每週審查 writer 租約修正另存 `0568b53f46ac9a7dd38cdae11fd979f701a18500` |
| 單元及來源契約 | 圖表與榜單 24 通過。定錨、上市名冊、法人資金、上櫃狀態及每週審查 45 通過 |
| Lint | 圖表 DTO 與兩個顯示元件通過 |
| 建置 | Next.js 16.3.4 production build 通過，92 頁完成靜態產出 |
| 瀏覽器 | Chromium 桌機及手機各兩項通過。以實際 standalone 發行版搭配合成唯讀 RPC，驗證綁定個股路徑、價格缺口、日／曆週／曆月切換、沒有額外 RPC 及畫面寬度 |

首輪瀏覽器測試的 RPC 替身缺少早盤背景及個股成效兩個已存在的唯讀入口。因仍有未預期請求，記為四項失敗。補上兩個精確唯讀路徑後在 standalone 發行版重跑，四項均通過。

三年圖表後端仍未接上實際榜單 writer。公開的日資料已確認有 OHLCV 欄位及開放授權。歷史按月下載端點的公開使用範圍及與榜單價格的逐日一致性仍需另行核對。接續以官方交易日曆、公司行動、暖機與歷史行情作為發布時的凍結輸入。正式 RPC 目前仍回傳 `chart: null`。真實來源與連續收盤驗收未在這次測試中執行，PR #384 持續等待審查。

- [上市日成交資訊，資料集 11549](https://data.gov.tw/dataset/11549) · [證交所歷史查詢](https://accessibility.twse.com.tw/zh/trading/historical/stock-day.html)
- [上櫃收盤行情，資料集 11371](https://data.gov.tw/dataset/11371) · [櫃買中心歷史查詢](https://www.tpex.org.tw/zh-tw/mainboard/trading/info/stock-pricing.html)
