# Targeted implementation review — 2026-09-25

Scope: independent review of `research/tw-strategy-lab/engine.py` and `run_research.py`, plus review of their consistency with the preregistration. This reviewer authored the signal module and registry, so this is **not** an independent review of those components. No real-data performance evaluation or holdout access was performed by this review.

## Findings and resolution

1. **High — opening-price look-ahead in share sizing. Resolved.** The engine now fixes lot quantities from the precommitted limit, preceding-close equity, previous-session turnover and pre-opening cash. It reserves all opening orders before observing fills, does not reallocate gap-price savings, and does not assume same-opening sale proceeds can finance buys. The regression changes only the opening gap and checks unchanged share quantity.
2. **High — one failed signal or benchmark could erase later registered trials. Resolved.** Signal generation failures receive three failed scenario records and do not stop the other strategies. Blocked hypotheses retain ledger records and per-symbol terminal coverage. Benchmark preparation and simulation errors are caught separately. The incremental trial ledger is written during execution.
3. **High — a registry hash did not enforce execution settings. Resolved for the frozen runner inputs reviewed.** The runner checks the freeze checksum and validates the hypothesis roster, panel, dates, baseline numeric assumptions, executable inventory, absence of parameter variants and scenario overrides. Tests separately reject a bad checksum and a changed commission even when that changed fixture has a matching checksum.
4. **High — known dividend payments outside market sessions remained receivables forever. Resolved.** Payments due on or before a session move to cash; same-day entitlements can be paid; payments before entitlement are rejected. Unknown payment dates remain explicitly non-spendable receivables.
5. **Registry/implementation inconsistency — window and benchmark definitions. Resolved before actual performance.** The registry now declares one continuous development portfolio with descriptive half-year slices, TAIEX total-return index as the non-risk-matched primary reference, and an additional initial same-panel allocation with matching frictions. No OOS claim or parameter selection is made. The correction is explicitly recorded in the preregistration.

The targeted review found no remaining high/blocker issue in these corrected paths. This conclusion is limited to the reviewed assumptions: retrospective fixed survivor panel, verified cash-only actions, daily auction execution proxy, and locked 2024+ holdout. It does not establish real auction fills, historical App membership, strategy profitability or production eligibility.

## Observed verification

Command, from `research/tw-strategy-lab/`:

```sh
python3 -m unittest -v test_engine.py test_run_research.py
```

Observed result: **19 tests passed**, comprising 13 engine regressions and 6 runner tests. The runner tests mock all data loading and simulation with explicitly synthetic fixtures, use isolated temporary registry/checksum files, and do not create or alter the real freeze checksum. They verify:

- Checksum rejection before data loading or simulation.
- Rejection of conflicting execution assumptions despite a matching fixture checksum.
- All seven blocked hypotheses and exactly seven terminal strategy records for each of eight panel symbols.
- Signal failure persistence, followed by continued evaluation of the other registered price hypotheses.
- Benchmark failure isolation without loss of registered strategy trials.
- Refusal to overwrite an existing output directory.

`git diff --check` also passed during this review. Required final full tests, web build, registry freeze and research execution evidence remain responsibilities of the integrating agent; this document is not an exact-review, release or profitability PASS.

## Reporting follow-up

The preregistration requests a same-filled-share-path cost-addback diagnostic. At the review snapshot, the engine reports net returns and separate costs but has not yet emitted that diagnostic. Emit it with the explicit non-counterfactual label or report it unavailable with a reason. Do not call it a separately simulated gross return.
