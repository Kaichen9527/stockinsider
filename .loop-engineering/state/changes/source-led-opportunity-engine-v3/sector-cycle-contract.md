# Sector Cycle Contract: source-led-opportunity-engine-v3

Version: `sector-cycle-v3.0`

Sector cycle is context for timing and exposure, not a valuation input. All point-in-time reference observations must be at or before `sourceCutoff`.

## Inputs

- `levelScore = mean(PCTL(sector median monthly revenue YoY), PCTL(sector median quarterly EPS YoY))`.
- `changeScore = mean(PCTL(latest monthly revenue YoY - prior-three-month mean), PCTL(latest quarterly operating-margin YoY delta))`.
- `marketScore = mean(PCTL(sector excess return 20d), PCTL(sector excess return 60d), PCTL(sector advance/decline breadth 20d))`, where each sector-excess value is the sector equal-weight adjusted return minus the exact full-roster equal-weight market return at identical sessions from `sector-reference-contract.md`.

Constituents, coverage, adjusted returns, breadth and financial medians come exactly from `sector-reference-contract.md`. Percentiles use `scoring-contract.md` over at least eight complete non-unknown canonical sector aggregates. A group needs all listed subinputs. Revenue is fresh at 45 days, quarterly fundamentals at 135 days, and market inputs through the next Taiwan close. Missing/stale groups or fewer than eight reference sectors produce `unknown` with unavailable market-sector subfeature status.

## First-match Classification

1. Any group unavailable -> `unknown`.
2. `levelScore <45` and `changeScore <50` -> `contraction`.
3. `levelScore <55`, `changeScore >=60` and `marketScore >=55` -> `early_recovery`.
4. `levelScore >=55`, `changeScore >=50` and `marketScore >=50` -> `expansion`.
5. `levelScore >=55` and either `changeScore <50` or `marketScore <50` -> `late_expansion`.
6. Otherwise -> `unknown`.

Matched-rule serialization is exact: step 1 -> `unavailable`; steps 2..5 -> `contraction`, `early_recovery`, `expansion`, `late_expansion`; step 6 -> `no_rule_match`. Step 6 is the only `unknown` state whose complete numeric inputs remain available to `marketSectorFactor`; step 1 is unavailable and contributes zero.

The result stores and serializes the exact `SectorCycleV3` shape in `data-contract.md`: all three scores, exactly seven enum-ordered inputs with nullable value/timestamp/ref and explicit fresh/stale/missing status, the matched rule and missing reasons. Candidate evidence, mention volume and assistive-model output cannot alter the state.
