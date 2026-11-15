# 研究與公開榜單的財務欄位原生重播

使用 15 個核對過的固定 Git blobs，在 Contabo 非 root Node 22.23.1 重播引擎既有作者／審查器及公開 reader。11 項合成控制符合觀測。雜湊、結果和可重跑程式均已保留。沒有呼叫模型、正式資料庫或發布介面。[原生結果](../../openspec/changes/stockinsider-vnext-20/evidence/2026-11-15-t07-t08-research-financial-contract-native.json) · [重播程式](../../docs/operations/2026-11-15/launch-radar/replay-research-and-ranking-financial-contract.mjs)

| 路徑 | 量測結果 |
| --- | --- |
| 作者送出無估值日期、或缺財務／估值段落 | 兩個格式分別拒絕。有完整段落外殼且只引用行情時，任一不晚於已知日期的有效曆日可通過；本輪實測 11/01 accepted，行情 11/13。 |
| 審查 `valuationChecked` | 只核到人工行情引用，設定 true 時結構仍通過；明示 false 不能批准。原始證據 hash 不符時正確拒絕。 |
| 公開榜單與詳情 | `financial=null`、`valuation=null` 及 `chart=null` 通過。加入各分項的任一非 null 物件，包含綁定原 revision 的示例，既有 reader 會拒絕整個回應。固定 SQL 也寫入上述 null。 |

新版作者資料須可明示已證實的缺口，從同一凍結版本區分財務支持、不可用與在有效資料上不適用。審查對真實估值或已查證缺口應有可稽核的分支，並驗同一準備資料、來源覆蓋、原始證據 hash 和獨立身分。舊資料仍使用舊契約。新 writer／API／頁面一次接通符合新版的資料，讓合法的 0、缺欄及來源不符明確區別。圖表另須綁同榜單的價格版本及交易日。所有新資料亦應有同一輪真實正例、缺料及反證，後台資料源中斷時維持前版日期。

保留原來源/資格 gating；固定排行 SQL 的原始來源條件仍為 null。此次驗證的是程式的資料形狀及證據綁定，真實獨立審查、可用市場資料和發布均未完成。[作者驗證](https://github.com/Kaichen9527/stockinsider/blob/f8be9f28bcaf9f4e2d1e8257bad8d7d201b30a43/web/src/lib/vnext/research.ts#L16) · [現有 rank writer](https://github.com/Kaichen9527/stockinsider/blob/f8be9f28bcaf9f4e2d1e8257bad8d7d201b30a43/migrations/20261115_vnext_launch_ranking_v1.sql#L1089) · [公開詳情解析](https://github.com/Kaichen9527/stockinsider/blob/f8be9f28bcaf9f4e2d1e8257bad8d7d201b30a43/web/src/lib/vnext/launch-ranking-read.ts#L180)

重播程式接受其 pins 清單順序的 15 行 Base64 Git blob 標準輸入，按原生 Git SHA-1 驗證各模組後執行，不載入服務環境或應用依賴。
