# TWSE liquidity and source-time controls

A read-only Contabo check fetched the official per-stock monthly reports for 4 issues × 3 months. The returned September, October and November partitions contained 20, 19 and 10 rows per issue. We required original report month, symbol, the ten named fields including remark, nonduplicate dates, positive amounts and coherent OHLC. The first strict check detected the extra remark field and refused the unexpected schema. The rerun retained the remark field in validation and used only explicit traded value and prices. The exchange defines the report's trades as including regular, odd-lot, fixed-price after-hours and block transactions, with auctions excluded.

| 11/13 control | 11/13 TWD traded value | Exact 20-session TWD average | Liquidity |
|---|---:|---:|---|
| 4763 | 143,913,112 | 199,552,035.40 | eligible on this criterion |
| 3004 | 67,480,469 | 49,008,363.50 | known exclusion on this criterion |
| 1476 | 1,536,518,054 | 790,141,521.45 | eligible on this criterion |
| 4771 | 21,527,404 | 51,418,169.75 | eligible on this criterion |

Use exactly 20 official market sessions and compare the sum against TWD 1 billion. The single-day value changes the decision for 3004 and 4771. Close times volume is not the published turnover for any of the sampled windows. The 3004 author observation remains a candidate-page control with a known liquidity exclusion. The PTT 4763 and author 1476/4771 references were published after the 11/13 cutoff and cannot populate that ranking. 1476 closed above the preceding 25-session raw high, without establishing an action-adjusted and volume-confirmed launch.

Independent primary-endpoint checks found 8/8 matched closes with dated open data 11764 and, on 11/13, 24/24 matched shares, turnover and OHLC fields with the licensed latest-day 11549. Exact dates and source SHA-256 values are in the JSON receipt. Matching values on one day do not prove historical coverage, rights for the monthly website route or date-of-cutoff availability. Use this as a manual witness and retain the missing listed turnover authority in the current SQL writer instead of reusing its OTC coverage token. No source configuration, SQL writer or production service was changed for this check.

[Official TWSE individual-trade report](https://www.twse.com.tw/zh/trading/historical/stock-day.html) · [Open dataset 11549](https://data.gov.tw/dataset/11549) · [Dated dataset 11764](https://data.gov.tw/dataset/11764) · [Existing SQL comparator](https://github.com/Kaichen9527/stockinsider/blob/f013b5b/migrations/20261115_vnext_launch_ranking_v1.sql#L987).
