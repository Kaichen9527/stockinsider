# AUO 2409 source and valuation canary

Generated: 2026-09-19 (Asia/Taipei)

## Result

The bounded AUO canary completed without a full-market refresh or production
write. It combined the existing validated eight-quarter ledger with fresh TWSE
OpenAPI balance-sheet and company-profile receipts, then ran the new
method-specific forward common-income and forward BVPS × P/B model.

- Required quarterly facts: 32
- Available quarterly facts: 32
- Required historical P/B observations: 48
- Available historical P/B observations: 59
- Latest official financial period: 2026-06-30
- Latest market session in the ledger: 2026-09-18

## Official anchor

- Common equity attributable to owners: TWD 154,397,339,000
- Issued common shares: 7,547,098,972
- TWSE reported BVPS: TWD 20.46
- Reconciled BVPS: TWD 20.4578
- Current price: TWD 30.35
- Recomputed current P/B: 1.48x

The equity/share reconciliation differs from the reported BVPS by less than
TWD 0.01 per share.

## Forward valuation

The model uses the eight reported quarters to project common income, adds that
income to common equity, holds unverified future dividends and capital/OCI at
an explicit zero assumption, and applies the observed five-year P/B
distribution.

| Scenario | Forward BVPS | P/B | Target |
|---|---:|---:|---:|
| Bear | 19.8335 | 0.70x | 13.88 |
| Base | 20.6933 | 0.80x | 16.55 |
| Bull | 21.7014 | 0.91x | 19.75 |

Probability-weighted target: TWD 16.69. Base upside from TWD 30.35 is -45.45%.
The evidence-backed canary therefore does not support a new entry at the
current price. This is a model output from official and validated inputs, not
personalized investment advice.

## Evidence

The machine-readable receipt hashes, source URLs, model assumptions, bridge
inputs, and valuation output are stored in
`.agent/reports/2026-09-19-auo-source-canary.json`.

No production database row was changed by this canary. The branch also adds a
writer-guarded, lease-guarded, symbol-scoped internal endpoint so the same
calculation can be published for only 2409 after the protected release gate
accepts the revision.
