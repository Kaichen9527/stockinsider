# AUO real-evidence four-segment working model

Current observed research, unpublished/incomplete. Exact approved upstream evidence subject1b25393ad4b3790e6ca427bb3f6ab93fc622abd1 was cherry-picked without input modification. No new App/API/schema or protected policy changes.

Read [article.md](article.md): 4,063 main-body Chinese characters, generated actual/annual/18-quarter tables. [model-results.json](model-results.json) retains full precision and scenario assumptions. All displayed forecasts are conditional hypotheses, not issuer guidance, calibrated fair values or independently approved research.

Reproduce with existing Node22:

```sh
node --experimental-strip-types docs/research/2026-10-08-auo-four-segment-model/recompute.mjs 2026-10-08T10:20:00Z
node --experimental-strip-types --test scripts/research-auo-four-segment-model.test.mjs web/src/lib/auo-deep-dive-model.test.ts
python3 docs/research/2026-10-08-auo-four-segment-model/verify-output.py
```

The new calculator reuses existing calculateQuarter, requiredEarningsAtMultiple and commercialization-missing-input behavior. Independent Python Decimal verification does not import that JS helper. Publication metadata/rights/source custody stay separate from model parameters; a citation never supplies invented UUIDs or lease identity.

Forecast mechanics: Q3 revenue is anchored to the three published rounded monthly values66876m, interval[66874.5,66877.5). Qualitative July guidance starts research mix weights; all three scenarios scale to the known total, with reconciliation differences visible. Quarterly segment revenue -> assumed gross margin -> assumed expense allocation -> OP; interest/finance/other/equity/FX -> pretax -> positive-profit tax or assumed tax floor -> NCI -> owners -> assumed diluted denominator. No segment gross margin is claimed disclosed. No new CPO/GCS revenue or asset-sale gains enter forecast quarters; unknown commercialization inputs stay null/incomplete, not fabricated zeros.

2026 combines actualH1 with forecastH2 and retains historical reported oneoffs. 2027 is four forecasts; forward four unreported seasons are2026Q3–2027Q2. Future denominators and tax/NCI are assumptions, not actual shares or current P/B. Actual Q2/H1 four-segment totals includeOther. Original Q1 OP attribution differences[363974,-546733,182759,0]thousands and nonrestated2025 classification remain; Q1 note nonop/pretax+1thousand versus income statement also remains in the original relay.

Gain sensitivity: two held-for-sale pretax gains863.731m and1127.507m, separately weighted and taxed. June30 ownership does not establish transaction-date attribution; no exact normalized EPS asserted. Contract asset consideration is not gain. TestPE10/15/20/30 is not calibrated; no target or approved entry.

Old32.2/36.6 paper references are preserved with raw daily first-target observation9/22 and no reactivation. This does not certify original publication, complete frozen-volume/invalidation metadata, corporate-action adjustment, fills or holdings. A no-hit adverse case cannot create a terminal date. EMC remains the next different-industry increment; overall Goal not complete.

## 2026-10-08 修訂

Independent Astra 對 eed55b15 指出反稀釋及引用錯向，原版本/原收據保留於 Git。新模型區分 ordinary / potential shares；potential 是無分子調整獎酬敏感度，不是已發行新普通股。虧損或零收益排除潛在股，年度與四季各自以整期利益及加權潛在股判定；issued ordinary 股數即使虧損仍按在外期間納入。未來實際股份/轉換工具與 numerator adjustment 仍未核實。專利、FY/Q3及每項海外/媒體線索已拆成原始連結。native8e0437已正常 merge，Astra unsigned scoped code approval（非protected），本次另重跑 native。
