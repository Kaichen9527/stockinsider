# T06 and T10 corporate actions in breadth comparisons

Validated 2026-11-15T13:40:57Z in a temporary network-isolated PostgreSQL 17 cluster on Contabo staging.

The technical breadth diagnostic can compare the latest twenty accepted closes through a pure cash dividend, a standalone reduction, or a par-value change when the official exchange references reconcile exactly with the existing issuer action terms. TWSE publishes distinct formulas for ordinary cash dividends, reductions and compound corporate actions. [Ex-dividend reference](https://www.twse.com.tw/zh/announcement/ex-right/twt49u.html), [Trading-resumption reference](https://www.twse.com.tw/zh/announcement/reduction/twtauu.html)

The comparison requires one presently eligible terms receipt bound to the frozen exchange snapshot, ordinal, session and source row. The accepted preceding close must agree with the pre-action reference. Pure cash dividends additionally require the immediately preceding venue session. A standalone reduction can use the last accepted pre-halt close in the selected window when it agrees with the published pre-halt reference. The check uses TWD and cross-multiplies the exact recorded decimal references and share counts. It records a diagnostic gap when subscription cash, mixed terms, missing observations or a reference mismatch prevent an exact calculation.

The isolated check ran the registered-roster and supported-feed regression suites, 15 factor vectors, and two integrated synthetic cases with fourteen variations. The integrated cases execute the real breadth SQL against disposable price and exchange snapshots with a fixture issuer receipt provider. They confirm that close-to-MA20 comparison changes as expected, unknown terms remain gaps, and the helper is private. The catalog patch checks the predecessor, successor and unchanged routine metadata.

The result remains private and covers registered issuers and supported exchange feeds. Full market completeness is still false and market risk remains unknown. An authoritative exchange-wide roster, broader corporate-action coverage, licensed whole-market cash flows, and real source and session acceptance still need evidence. Valuation targets and simulated returns continue through their existing paths. Production and the original PR #384 remain behind their existing release gates.

[Regression vectors](../../web/scripts/launch-breadth-cash-action-vectors.sql) · [Structured evidence](../../openspec/changes/stockinsider-vnext-20/evidence/2026-11-15-t06-reconciled-breadth-cash-actions.json)
