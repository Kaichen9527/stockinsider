# Bounded R1-R4 implementation

This implements the frozen v2.1 candidate without altering its original bytes or
historical artifacts. It is not independent approval, historical replay completion,
production publication or a protected release gate.

## Default: inspect existing evidence, no new simulation

```sh
python3 research/tw-strategy-lab/run_robustness.py --output /tmp/tw-v21-inspection-new
python3 -m unittest discover -s research/tw-strategy-lab -p 'test_*.py' -v
```

The source implementation passes 183 local research tests, including 31 new tests
for canonical replay equality, metric edge cases, two fixed variants, next-session
pre-open dividend cash, review admission and all 31 retained synthetic paths.
Synthetic path execution is not a historical market study.

## Exact input and independent review requirements

`replay_inputs.py` accepts only all three original table hashes and byte sizes.
A new acquisition manifest is preserved separately. A new download with a different
hash does not become the frozen input by renaming it.

An actual independent GitHub review (not the author's comment) must bind the exact
implementation head and contain the acceptance line below, only after the reviewer
has genuinely accepted the contract and clarification. The CLI retrieves that
review itself from the fixed GitHub API; it does not trust a local review JSON.

```
ROBUSTNESS_V2_1_ACCEPTED 4379960b4d1406bee97fcf54fa0f99e832abdefa1ed9a5111d04f2d25748270a f44e230f54a13251c51c6919aea7e78088d7ecc6508bb51a3c4a2a88e430d8af
```

The clarification resolves actual independent review #5319012346, comment
4105628954: no losses means null profit factor, including no trades/all-zero PnL;
null fails the gate. The immutable original proposal is not rewritten. The marker
is a proposed machine-readable receipt format, not a request to rubber-stamp.

```sh
python3 research/tw-strategy-lab/run_robustness.py --execute \
  --data /path/to/exact/recovered/tables --review-id ACTUAL_ACCEPTING_REVIEW_ID \
  --output /tmp/tw-v21-execution-new
```

This must run in a clean, actual Git checkout. No arbitrary source SHA, substitute
PIT data, author approval, inferred reviewer acceptance or 2024+ data is admitted.

R1 retains 15 canonical full-object, signal-array and ledger comparisons. All 16
new R3/R4 paths remain as blocked records if R1 fails. R3 contains only .70/.75
S4 thresholds and three scenarios each; R4 contains exactly five strategies times
two cash-availability assumptions, baseline cost only. Default v1 results retain
the same object shape and execution semantics. Every zero-trade/failed path remains
visible. There is no optimizer, winner selector, live order router or publisher.

R2 merely re-reads pinned historical results. Its S3 diagnostics fail three of eight
frozen checks: median completed-trade return, single-winner concentration and
single-symbol concentration. This is not an out-of-sample claim, and passing code
checks cannot make these investment diagnostics pass.
