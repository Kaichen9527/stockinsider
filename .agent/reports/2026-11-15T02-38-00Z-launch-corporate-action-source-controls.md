# Corporate-action source controls

An unprivileged Contabo request sampled five exchange routes without credentials, writes to the active database, or model calls. Receipts record timestamps, body hashes and selected comparison fields. The requested dates are part of the control and do not assign an earlier observation time.

| Control | Result |
|---|---|
| TWSE open advance dataset 89748 (TWT48U_ALL CSV) | 53 advance rows. For 2026-11-18, 2344 reports TWD 2 cash per share; 5434 reports a cash subscription ratio of 0.01288606 and TWD 400 subscription price. Blank ratios have their original representation. |
| TWSE TWT48U website date-range request | The 2026-11-02 to 2026-11-13 request included forward rows through 2026-12-30. Thus the returned list cannot prove historical advance-feed coverage or what was published on an earlier date. |
| TWSE TWT49U report and licensed TWSE dated closes | 6165 had a 2026-10-30 close of TWD 47.90 and a 2026-11-02 close of TWD 40.50. The exchange lists TWD 42.90 as the ex-dividend and opening reference for 11-02 after TWD 5.00 distribution, with official limits TWD 47.15 and 38.65. Raw close-to-close is −15.45%, against the −15% stop; the close against the official reference is −5.59%. These are price comparisons, and neither establishes outcome ordering or defines the tracking policy. |
| TPEx open reference dataset 11633 (catalog CSV and OpenAPI) | Both returned 10 records dated 2026-11-16 at collection. For 5475 both gave prior close TWD 211.00, theoretical reference 204.88, start-of-trading reference 211.00, and limits 232.00 / 184.50. OpenAPI also discloses 12,000,000 subscription shares and TWD 140.00 subscription price. Use each named source field for its purpose; do not infer limits from the ex-rights reference. |

An advance notice, observed next-session exchange reference, original company evidence and historical immutable terms are distinct. Record effective day, observed time, source identity, action kind and named price/term separately. A reference-to-close ratio cannot create old/new share counts, all cash/rights terms, or an approved tracking adjustment. An absent row in either current snapshot cannot prove absence on a historical date. Continue to report an incomplete economic-price path when necessary action terms are missing. Treat the listed TWT49U website observation as a comparison pending explicit source rights for ongoing ingestion or public reuse; the catalog covers the advance route and the exchange separately sells reference data.

No runtime/source configuration was enabled. The action controls are not either live 21:30 ranking acceptance session and do not satisfy the native workflow or tracking gates.

[Listed notices and license](https://data.gov.tw/dataset/89748) · [Licensed dated closes](https://data.gov.tw/dataset/11764) · [Listed calculation report](https://www.twse.com.tw/rwd/zh/exRight/TWT49U?response=json&startDate=20261102&endDate=20261113) · [TWSE separate reference product](https://eshop.twse.com.tw/zh/product/detail/000000006f6a5e3401702cea7ba20041) · [OTC references and license](https://data.gov.tw/dataset/11633).
