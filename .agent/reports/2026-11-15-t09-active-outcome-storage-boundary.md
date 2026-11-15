# 強勢雷達成效追蹤的正式資料基準與接線驗收

2026-11-15 以 PostgreSQL 17 唯讀交易核對正式環境。既有 `opportunity_score_snapshots` 與 `opportunity_outcomes` 的實際筆數都是 0。舊成效表唯一鍵為 `(score_snapshot_id, maturity_horizon)`，外鍵指向舊分數快照和產業基準。受檢正式 schema 尚無強勢雷達排名或追蹤表，systemd 列表未發現專用 outcome／label timer。本次只查 pg_catalog 與筆數，未觸發內部排程端點。

舊版標註函式讀取進場收盤、整段最高／最低與產業相對報酬，輸出最大有利／不利波動及評級。舊內部排程會提交 `label_outcomes` 工作。強勢雷達應保留此既有用途，用新的凍結排名身分接續原 queue 和 writer。[舊函式](https://github.com/Kaichen9527/stockinsider/blob/f8be9f28bcaf9f4e2d1e8257bad8d7d201b30a43/web/src/lib/opportunity-v3/outcomes.ts) · [內部排程入口](https://github.com/Kaichen9527/stockinsider/blob/f8be9f28bcaf9f4e2d1e8257bad8d7d201b30a43/web/src/app/api/internal/opportunity-run/cron/label-outcomes/route.ts)

固定產品版本已有 `(ranking_run_id, symbol)` 成員鍵，並凍結 `session_date`、`input_cutoff`、`published_at` 及價格／行事曆／公司行動引用。這些可接追蹤身分和重播。發榜日期和可公開讀到的時間應各留原值，缺料保留前榜的重跑不產生新訊號。[固定榜單契約](https://github.com/Kaichen9527/stockinsider/blob/f8be9f28bcaf9f4e2d1e8257bad8d7d201b30a43/migrations/20261115_vnext_launch_ranking_v1.sql#L52-L82)

## 實作後的驗收

| 輸入狀態 | 預期結果 |
|---|---|
| 同一發布重跑或缺料沿用前榜 | 維持原排名及追蹤身分。其後實際新榜的重複上榜次數另列。 |
| 按交易所曆查次一交易日 | 交易日或開盤資料尚未取得時保持 pending 或缺口。有官方證據確認不能成交時記無法成交，持續保留該日。 |
| 日 K 同觸 +20% 和 −15%，開在兩界內，無逐筆時序 | 記順序不明，成功計數維持 0。若可信開盤本身已越過一界，可另記已知第一個市場價格。是否能以該價成交需獨立判斷。 |
| 先前有價檔缺日、較晚才觀察到觸界 | 保留可見觸界和缺日，首次先後維持未知。20／60／120 日期限由市場曆計算。 |
| 行情或公司行動後續更正 | 新觀測綁定更正版本，留存原觀測與同一訊號身分。公開整理保留研究價格、成交模擬、費率版本及成熟度的區別。 |

一般交易同日若確認有效上下界各約 ±10%，可用官方兩個限價先檢查是否有足以同時觸及 +20%／−15% 的價格區間。掛牌無漲跌幅、價格基準例外或當日限價未明時仍依實際價檔與許可的序列處理。此為既有規則與工程驗收設計，無新增產品交易規則。[證交所營業細則第 63 條](https://twse-regulation.twse.com.tw/tw/law/DOC01_print.aspx?FLCODE=FL007304&FLNO=63)

本次未實作追蹤 writer、產生歷史訊號、發榜或建立交易成效樣本。
