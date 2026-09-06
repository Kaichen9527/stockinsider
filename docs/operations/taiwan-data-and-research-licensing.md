# 台股資料、研究文章與授權 Runbook

更新日：2026-09-06（Asia/Taipei）

## 決策摘要

StockInsider 本版的正式資料主線是 TWSE、TPEx、MOPS 與發行公司 IR。FinMind 只在已記錄的官方來源缺口後，作為保留真實 provider 的 mirror/corroboration；不得標成交易所或申報權威，也不得把原始回應做成公開鏡像。Arelle 是 Apache-2.0 的 XBRL 解析／驗證工具，不是資料供應商。TEJ 與 FinLab 在取得符合本產品公開使用情境的書面商業授權前，不接入 production，也不進 dossier bundle。

| 選項 | 本版狀態 | 可以做 | 不可以做／啟用前條件 |
|---|---|---|---|
| TWSE／TPEx／MOPS／公司 IR | 採用，primary | 擷取指定公司、指定交易日／報告期的官方結構化事實；保存來源、時間、locator 與 response hash | 不把成功 HTTP 當成功資料；schema、期別、公司、availability 或保存未驗證即 fail closed |
| FinMind REST API | 條件採用，fallback | 官方缺口後，以 token、明確 dataset、公司代號與有界日期查詢；保留 `provider=finmind` 與原始機關標示 | 不算第二個獨立官方確認；不公開即時 raw rows、不轉售、不鏡像；上 production 前須確認所用方案及原始資料機關授權 |
| FinMind 官方 MCP | 僅 operator research／診斷 | 本機 agentic 查詢與交叉檢查；MCP server 軟體為 Apache-2.0 | 不是 production ingestion 的資料授權替代品，不把 token 寫入 repo/log/bundle，也不把自然語言摘要直接當正式 fact |
| Arelle | 暫不在本版 runtime 使用 | 日後可解析／驗證已合法取得的 XBRL、iXBRL；可透過 CLI、Python 或 Web Service 整合 | 不會取得 MOPS 文件、不授予文件資料權、不自動解決台灣 taxonomy／欄位 mapping；須另有 acquisition、mapping、fixture 與 point-in-time gate |
| TEJ API | 不採用 | 取得商業合約後可評估完整財務、交易與衍生欄位 | API key／訂閱本身不代表可對外重製或公開傳輸；未取得涵蓋 SaaS/public display/derived output 的書面授權不得接入 |
| FinLab API／資料 | 不採用 | 適合內部量化研究與回測評估 | 官方條款禁止未經書面授權串接 API 作商業應用；不得把網站文章、策略或資料複製進本產品 |
| InvestAnchors 會員內容 | 禁止 acquisition/storage | 操作者未來只能提交有權使用、自己撰寫的 bounded structured claim、citation 與 rights attestation | 不抓、不存、不轉述會員原文；本版 bundle／文章／公開頁一律拒絕名稱、URL 與內容 |

## 官方依據

- FinMind 的 [API/MCP 使用條款](https://finmind.github.io/PrivacyPolicy/) 說明資料授權依方案而定，禁止把即時資料直接放到 Web／App，亦禁止再散布 raw data 或建立鏡像。
- FinMind 的 [資料授權說明（2026-07-12）](https://finmind.github.io/Disclaimer/) 要求對外用途標示原資料提供機關；服務授權不含再散布、轉售或鏡像，關鍵用途應與原始來源核對。
- FinMind 的 [官方 MCP 文件](https://finmind.github.io/tutor/ai/Mcp/) 要求 token，並說明 MCP 實際呼叫 FinMind API；[官方 MCP repository](https://github.com/FinMind/FinMind-MCP) 的 Apache-2.0 只涵蓋軟體，不能擴張資料授權。
- Arelle [官方 repository](https://github.com/Arelle/Arelle) 說明其為 XBRL processor，提供 CLI、Python 與 Web Service API；[license](https://github.com/Arelle/Arelle/blob/master/LICENSE.md) 是 Apache-2.0。這支持採用 parser 的可能性，不代表取得或公開申報資料的權利。
- TEJ [REST API 文件](https://api.tej.com.tw/document_rest.html) 顯示 API key、table 與 `next_cursor_id` 分頁模式；TEJ [著作權聲明](https://eshop.tej.com.tw/E-Shop/copyright) 則限制未經書面允許的重製、公開傳輸、改作與散布。
- FinLab [文件](https://finlab.finance/docs/) 顯示其 SDK／資料／回測能力；[服務條款](https://studio.finlab.finance/terms) 明確禁止未經書面授權串接其 API 作商業應用，引用或轉載亦需事前書面同意。
- 政府資料開放平臺的 [上市公司基本資料集](https://data.gov.tw/dataset/18419) 標示政府資料開放授權條款第 1 版與 TWSE OpenAPI；實際使用每個 dataset 時仍須保存該 dataset 自己的授權與 attribution，不可用一筆 dataset 的授權推及全部資料。

## Production acquisition 流程

1. 建立 dataset registry：每一資料集固定 `datasetKey`、官方 primary、允許的 FinMind dataset、公司／市場範圍、預期 session/period、schema version、單位、precision、最大 bytes/rows/time 與授權註記。
2. 先查官方來源。只允許 allowlisted URL；response 必須通過 HTTP、大小、JSON/HTML、schema、公司代號、交易日／報告期、availability 與持久化驗證。
3. 官方回覆完整或具語意的 empty 時，不以 FinMind 覆蓋。只有 `timeout/http_error/schema_invalid` 等已保存缺口才允許 fallback。
4. FinMind request 必須限定一個 dataset、單一公司（若資料集適用）與單一交易日／有界日期窗。保留 FinMind 與 upstream source attribution；不得改標為 `twse/tpex/mops`。
5. 同一事實 owner 與 mirror 不一致時保留兩者、標記 conflict，阻擋受影響的估值／promotion；不可用 provider 順序靜默挑一個。
6. 每次 attempt 都留下 terminal disposition、HTTP status、response bytes/hash、fetched-at、provider usage（若 header 有提供）與安全的錯誤代碼；不得保存 token 或完整敏感錯誤回應。

Production REST adapter 使用 `FINMIND_API_TOKEN`。FinMind 官方 MCP 慣例使用 `FINMIND_TOKEN`；兩者都只能由 host secret store／環境注入，不得寫入 `.env*`、Git、報告、bundle、receipt 或 public payload。沒有 token 時應 terminalize 為 `not_configured`，不得假裝 empty/success。

## Dossier bundle、分頁與回執

- `sanitizeRevisionScopedDossierEvidence(detail, facts)` 是 worker egress boundary。只保留 detail revision `fact_ids` 採用、且 `stock_id` 相同的 facts；同一 fact ID 去重並固定排序。
- source link 只能是：(a) 與採用 fact 的 URL／fact ID 相交，或 (b) 已保存於該 revision、具 platform 與非未來 published-at 的 mention。無綁定 reading-list URL、未來 mention、跨公司 fact 與 InvestAnchors reference 都剔除。
- 游標順序固定為 `available_at DESC, id DESC`，游標包含兩者；consumer 必須逐頁提交，不能只處理第一頁。Malformed cursor fail closed，不能重回第一頁造成重複工作。
- 每個 bundle 由 canonical revision evidence hash 導出 deterministic `bundleId`。未採用 fact 不得影響 hash；任何已採用 detail/fact 變更必須產生新 hash/bundle。
- submission receipt 必須同時綁定 exact `revisionId`、`inputHash`、有效 `submissionId` 與 `dossierId`。`accepted/valid/ok=true` 必須沒有 rejection reasons；`rejected/rejected/ok=false` 必須有 reasons。retry 只接受同一 submission hash 的 `idempotentReplay=true`，不得把另一 revision 的成功回執當成完成。

## 公司特定研究文章 claim 契約

- 嚴格模式必須提供公司 `stockId` 及／或 `symbol/name`，文章全文至少出現正確公司名稱或具數字邊界的股票代號；不得用通用文章套到多家公司。
- summary、每個 section 與每個 `fact|guidance` claim 都引用本 bundle 允許的 fact ID；有公司 metadata 時必須與文章公司相同。跨公司 fact 直接拒絕。
- `fact`、`guidance`、`assumption`、`derived_calculation` 分開；假設要明示，衍生計算必須是 closed acyclic DAG。數值 fact 要有 metric、unit、period、locator 且數值與採用 fact 一致。
- 公司代號（例如 2330）、年份、季度與 citation 編號不是財務數值；validator 不可拿它們滿足 numeric fact，也不可誤報 numeric mismatch。
- 產品組合、客戶認證、產能、需求、ASP、指引與風險等公司敘述，只有語意相符的 official text/numeric fact 才能發布。社群 mention 只能解釋「為何研究這家公司」，不能證明營運事實。
- 無資料就寫明 missing/data gap。data-gap fact 不得作正面證據；付費 InvestAnchors 原文、摘要、名稱與 URL 一律拒絕並只保存 redacted rejection receipt。

## 啟用與日常檢查

1. 確認官方 primary 的當日／當期 fixture、schema 與 source URL 仍有效。
2. 若要啟用 FinMind fallback，由帳號持有人在 host secret store 放入 token，並保存「方案、資料集、允許用途、到期日、attribution、禁止事項」的權利證明；不要把證明中的 token/帳務資訊提交 Git。
3. 對一個 TWSE 與一個 TPEx 公司執行 bounded dry run；驗證 primary complete、primary semantic empty、primary failure + fallback complete、conflict、rate limit、auth failure 與 malformed response。
4. 跑 dossier contract/validation tests，確認跨公司、未採用、未來與付費來源都被拒絕；再跑完整 lint、tests 與 production build。
5. 觀察 terminal ledger、queue cursor 與 receipts。`auth_failed`、`usage_limited`、`schema_invalid`、沒有 accepted receipt 或仍有 next cursor 都不能回報完成。

## 需要人工作決定的最小事項

本版不需要購買 TEJ／FinLab 或安裝 Arelle。只有要啟用 FinMind production fallback 時，帳號持有人需：(1) 取得 token，(2) 確認所選方案及每個 dataset 的 public SaaS／衍生輸出用途，(3) 把 token 放進 host secret store。若 FinMind 無法書面確認用途，保持 `not_configured`，繼續以官方 primary 與明示缺口運作。
