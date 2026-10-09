# 台股策略開發樣本研究

Run: `a9123545831d8ee1a39b231c`

**這是固定倖存股票樣本的探索研究；未通過正式策略驗收，未更新線上文章。**

資料：2018 暖機，2019-01-01 至 2023-12-31 開發；2024 年起保留資料未讀取。
完整可執行樣本：1216, 2330, 5347, 6488, 8069；原始研究 panel：2330, 2317, 1216, 2882, 2603, 6488, 5347, 8069。

| 策略 | 狀態 | 基準情境淨年化 | 最大回撤 | 完成交易 |
|---|---|---:|---:|---:|
| S1 breakout | exploratory | 0.02% | -3.09% | 33 |
| S2 pullback | exploratory | -1.03% | -6.22% | 79 |
| S3 panel_relative_momentum | exploratory | 1.23% | -4.60% | 36 |
| S4 contraction | exploratory | 0.00% | 0.00% | 0 |
| S5 revenue_acceleration | blocked | — | — | — |
| S6 short_term_reversal | exploratory | -0.10% | -1.66% | 25 |
| S7 broker_revision | blocked | — | — | — |

## 資料與解讀限制

- Fixed surviving panel selected today; no historical App-screen membership.
- Complete cash-only subset excludes unresolved share changes before inspecting performance.
- Development results are not out-of-sample validation. 2024 onward remains locked.
- No original broker PIT feed, monthly revenue release ledger, historical sector membership or live candidate export.
- Daily auction fills/limits are a conservative proxy; exact queue and exceptional limit rules unavailable.
- Unknown dividend payment dates reduce reusable cash; entitlements remain in equity.
- No statistical alpha claim or production promotion from this exploratory run.

## 排除與尚待補齊

```json
{
  "2317": [
    "missing_explicit_cash_or_share_factor",
    "price_gap_needs_suspension_or_listing_evidence",
    "stock_and_benchmark_sessions_differ",
    "unresolved_corporate_action"
  ],
  "2882": [
    "rights_subscription_cashflow_unmodeled",
    "unresolved_corporate_action"
  ],
  "2603": [
    "missing_explicit_cash_or_share_factor",
    "price_gap_needs_suspension_or_listing_evidence",
    "rights_subscription_cashflow_unmodeled",
    "share_distribution_delivery_date_missing",
    "stock_and_benchmark_sessions_differ",
    "unresolved_corporate_action"
  ]
}
```

全部成本／容量情境與失敗試驗保留在 results.json、trial-ledger.jsonl；沒有挑選績效最佳參數。
