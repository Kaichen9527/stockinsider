# Taiwan strategy lab — robustness-v2 specification review

Reviewed at: 2026-09-25T05:48:36Z  
Proposal SHA256: `94fd91733a0474a2ed65e5c96fc1c2bad4559a68354dfba4b2f57e980ddfbac5`  
Decision: `revision_required_not_authorized`

## Scope

This review did not execute a new backtest, change a parameter, download data, or access the 2024+ holdout. It checked whether the finite `robustness-study-v2.json` contract can be computed deterministically from the retained development evidence. The proposal is result-informed, so even a fully specified calculation would remain diagnostic rather than independent validation.

## S3 deterministic diagnostic

Using completed-trade `net_pnl` and `net_return`, the baseline has 36 completed trades, median net return -1.96%, profit factor 1.58, largest-winner share 42.21%, and terminal return excluding unavailable receivables +5.01%. Cost stress has profit factor 1.31 and terminal return excluding unavailable receivables +2.54%.

Two unambiguous R2 gates fail: median trade return is not positive and the largest winner contributes more than 25% of all positive realized trade profit. S3 therefore remains exploratory regardless of the unresolved symbol-concentration definition.

The symbol gate is materially ambiguous. Interpreting “share of realized gross profit” as positive profits by symbol divided by all positive profits assigns 8069 a 64.87% share and fails the 50% gate. Netting losing 8069 trades in the numerator while retaining all positive profits in the denominator produces 31.51% and passes. The proposal does not choose between those formulas, so this gate has no formal result.

## Registry blockers

R1 needs a canonical comparison projection for “bit-for-bit” equality, including exact field ordering and named exemptions. R2 needs exact formulas and zero-win/zero-loss behavior. R4's ten registered paths are only correct for five strategies times two dividend paths under baseline alone; all three execution scenarios would create thirty. R4 also must place the optimistic cash release before or after opening-order sizing.

R3's two thresholds times three scenarios is a clear six-trial count, but it remains a result-informed hypothesis and is not authorized while normalized replay inputs and the amended contract are unavailable.

## Conclusion

The original proposal is retained byte-for-byte and is not silently rewritten. No work item is authorized. A separately hashed amendment must resolve the blockers and receive review before any new run. The complete machine-readable receipt is `research/tw-strategy-lab/proposals/robustness-study-v2-review.json`.
