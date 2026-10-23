# Taiwan strategy lab — robustness-v2.1 contract

Created at: 2026-09-25T06:48:36Z  
Proposal SHA256: `4379960b4d1406bee97fcf54fa0f99e832abdefa1ed9a5111d04f2d25748270a`  
Status: `review_candidate_not_executed`

## Outcome

The original v2 proposal and failed review remain immutable. The new v2.1 candidate resolves the four material contract findings without executing a strategy, changing v1 evidence, making a network request, or reading the 2024+ holdout.

R1 registers exactly 15 reporting-repair replays and now defines equality at the complete existing trial-result object, original signal-row array and six-field trial-ledger projection. Only a separate reporting object and named identity/timestamp fields may differ. Any portfolio, fill, cost or signal-row difference invalidates the repair.

R2 defines every formula and edge case. Symbol concentration is positive trade PnL aggregated by symbol without netting the symbol's losing trades. This makes the earlier observed 8069 share 64.87%, but that number remains a result-informed development diagnostic. S3 already fails the median-return and largest-winner gates.

R3 remains exactly two ATR-ratio hypotheses (0.70 and 0.75) across three scenarios, six trials total. They cannot be selected or promoted from development output.

R4 is now explicitly baseline-only: five strategies times two paths equals ten. The optimistic path releases the entitlement on the next recorded session before opening-order sizing, so it may fund that opening. Cost-stress and small-capacity interactions are excluded and would need a separate registry.

## Validation and boundary

A structural validator passed 42 assertions. The finite work count is 15 R1 replays + 6 R3 trials + 10 R4 paths = 31 new simulation paths; R2 reads two registered diagnostic datasets without a new simulation.

Execution remains disabled. A separate reviewer must accept the exact hash, and the isolated runner still needs the exact normalized inputs identified by dataset hash `a89bf8e5cbcfc464463a53c29f1f5f68f6419d72f2a06befcaeb008e3cff5cca`. This contract does not authorize article publication, merge, deployment or holdout access.
