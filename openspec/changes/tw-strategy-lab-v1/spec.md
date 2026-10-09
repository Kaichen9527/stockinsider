# Taiwan strategy lab — frozen research contract

Status: implementation and offline research authorized by the user's 2026-09-25 request for a bounded ten-hour strategy study. This document records scope; it is not a Requirements, Architecture, exact-review, release or profitability PASS.

Baseline: `169aad1b6cfa747f78ae3464b614f43c0749d806` on `main`; working branch `codex/tw-strategy-lab-v1`.

## Authority and isolation

The lab is Python research under `research/tw-strategy-lab/`. It may obtain public official data into its own files, compute offline, test, and prepare reviewable research drafts. It must not call application refresh, publication, broker-order or other mutating endpoints; write a production database; change secrets; purchase capacity; delete host data; merge; or deploy. An internal endpoint is not a read-only export merely because it accepts GET: `candidate-dossier-bundle` writes bundle/outbox rows on GET and POST and is excluded.

Existing `tw-entry-plan-v0.1`, formal classification, liquidity, market, valuation, adjacent-close and publication rules remain authoritative and unchanged. A research signal or favorable backtest cannot grant formal eligibility. Lab results use `research_only`, disclose their actual evidence quality, and do not imply personal holdings or fills. The retired global Shadow machinery may support audit comparisons but cannot become a V6 promotion gate.

## Finite preregistration

Freeze `research/tw-strategy-lab/preregistration.json` and record its SHA-256 before computing development results. This round has exactly seven primary hypotheses, five executable price configurations and no strategy-parameter variants. Each price configuration has three preregistered execution scenarios: baseline, cost stress and small capital, for 15 full-development runs, plus the two blocked hypothesis records. These scenarios test fixed cost/capital assumptions; they are not additional signal thresholds or a search for the best strategy. The five configurations, position rules, fees, sell tax, slippage, execution assumptions, ranking/tie rules, benchmark and missing-data rules must be finite, explicit registry inputs before their results are observed. Do not search additional thresholds after seeing results. A later experiment requires a separately recorded scope and registry; it cannot replace this round's failed trials.

| ID | Hypothesis | This round |
|---|---|---|
| S1 | Closing breakout | One frozen price configuration |
| S2 | Pullback in an established upward trend | One frozen price configuration |
| S3 | Relative momentum within the supplied panel | One frozen price configuration; not whole-market or sector-relative momentum |
| S4 | Price/volume contraction followed by expansion | One frozen price configuration |
| S5 | Revenue acceleration | Blocked without point-in-time revenue releases and revisions |
| S6 | Price reversal | One frozen price configuration |
| S7 | Broker estimate/recommendation revision | Blocked without point-in-time broker events and revision lineage |

S5 and S7 remain in every hypothesis summary with explicit missing inputs. Prices, present-day fundamentals, article text, synthetic events or a proxy indicator cannot silently substitute for their missing event history. Blocked and zero-trade outcomes are findings, not trials to omit.

## Dates and population

- `2018-01-01` through `2018-12-31` is warmup only. A window still lacking the required history remains blocked; the year boundary does not waive a 240-session requirement.
- Development observations are `2019-01-01` through `2023-12-31`. This round has no fitting or performance-based selection: ten fixed half-year windows describe one continuous development portfolio path with positions/cash/receivables carried across boundaries. These are descriptive windows, not independent walk-forward or out-of-sample tests. Signal formation uses only preceding observations. A future fitting study would require a frozen purge/embargo and selection policy; this round cannot claim that later validation has occurred.
- `2024-01-01` and later is a locked holdout. This round does not download, open, compute, chart, rank with, or select parameters from that holdout. A later decision to unlock it must first freeze the chosen development specification and evaluation procedure. The ten-hour deadline does not unlock it.
- The initial eight-stock panel is a supplied survivor panel. Freeze its exact symbols in the registry. It is not the historical App universe, a point-in-time market roster, or proof that all screened stocks have been evaluated. Survivorship and selection bias remain prominent limitations.
- The complete current candidate roster needs a guarded, genuinely read-only export with snapshot identity, cutoff and declared count. Until supplied and reconciled, complete App coverage and updated production articles must not be claimed.

## Data and execution contract

Keep requested date ranges, exchange, source URLs, retrieval times, raw response hashes, parser version, row counts and failures in a manifest. Official origin does not alone establish adjusted prices, dividend total returns or historically knowable revisions. Record raw versus adjusted basis and action/calendar evidence separately. Missing adjustment, trading-status or knowledge-time authority limits the corresponding claim; never relabel retrospective raw-price exploration as an authority-qualified point-in-time backtest.

Do not fabricate OHLCV, trading days, event availability or missing listings. Invalid/duplicate/conflicting bars, discontinuities, suspended/unobserved sessions and incomplete warmup have explicit per-window outcomes. Do not forward-fill missing prices into executable candles. Report omitted windows and why, including their contribution to the original denominator.

Features at session t can use only inputs available by their declared cutoff. Orders created from a closing signal first become eligible after that close. The engine must specify next-session execution, opening gaps, same-bar entry/stop ambiguity, stop gaps, holding limits, closing-signal exits, available cash, lot/rounding policy, concurrent positions and participation assumptions. An unavailable tradable session cannot become a fictional fill. Where daily data cannot prove execution, apply the frozen conservative convention and label it as an assumption.

Include disclosed fees, sell-side tax and slippage in each simulated fill. They are model assumptions whose dates/source must be recorded, not a claim of a user's actual broker charges. Portfolio equity must reconcile cash, marked positions and costs; report gross and net results, trade count, exposure, drawdown, and comparison on the same dates and panel. Unrealized end positions and fold-boundary handling must be explicit. Missing metrics remain null with reasons, not zero or infinity masquerading as a favorable result.

## Trial ledger and article coverage

Every attempted primary trial receives an immutable per-run record with source commit, registry hash, dataset hash, strategy ID, fold, execution assumptions, status and errors. Keep failed, blocked and zero-trade records. Repeated execution is identified as a repeat, not independent corroboration. Never overwrite prior results or report only the winner. Any development comparison describes observed results and uncertainty; no outcome guarantees future profit.

For each candidate in a supplied snapshot, produce exactly one symbol-specific article result with status `preview_ready` or `blocked`, source revision/cutoff where available, evidence links and reason codes. `preview_ready` means a complete candidate snapshot, readable development report and explicit per-symbol terminal coverage for all seven hypotheses support offline review; it does not mean actionable, publishable, profitable, or formally verified. A blocked S5/S7 terminal is disclosed, not upgraded. Missing per-symbol coverage blocks the draft even when shared portfolio metrics exist. Shared portfolio returns never become individual-stock performance. All drafts distinguish historical research dates from the current candidate snapshot and state that they supply no current entry point. Missing or conflicting symbol/revision/data inputs block that row rather than inventing prose, prices or reasons. Reject ambiguous duplicate roster identities and reconcile declared input count, distinct candidates, article outcomes and dry-run queue entries. Do not turn an eight-symbol research panel into an assertion of full current-candidate coverage.

Every candidate result also has one dry-run queue record. It records the proposed draft/status and no production publication receipt. Actual site articles and stored decision revisions remain unchanged. Frozen decisions cannot borrow the newest research under their old revision identity.

## Bounded continuation and acceptance

The existing automation is scheduled hourly, at most ten occurrences, with stop time `2026-09-25T18:48:00+08:00` (`2026-09-25T10:48:00Z`). Each continuation first reads the branch checkpoint, registry and these tasks; it resumes bounded pending work and checkpoints observed results. The schedule is not evidence that ten hours of computation ran or that every occurrence succeeded. At the stop time, record completed, failed and blocked work; do not widen the trial registry, open holdout or trigger deployment.

Acceptance IDs below must be linked to real executable cases and observed artifacts in the implementation checkpoint before being marked complete:

| ID | Required observation |
|---|---|
| LAB-01 | Registry lists S1–S7, exactly five executable configurations and three fixed execution scenarios, and its hash is bound to every run |
| LAB-02 | Warmup/development boundaries enforced; 2024+ is rejected and never evaluated |
| LAB-03 | Same input manifests produce the same ordered results; prior run records cannot be overwritten |
| LAB-04 | Future signal/event inputs, short warmup, duplicate/conflicting data and missing authority have explicit blocked outcomes |
| LAB-05 | Next-session execution, gaps, same-bar ambiguity and exit timing follow frozen conservative rules |
| LAB-06 | Cash/positions/costs reconcile; gross and net metrics distinguish zero-trade and unavailable results |
| LAB-07 | Descriptive chronological windows, continuous boundary handling and benchmark dates are fixed before results; no false OOS claim |
| LAB-08 | All five price configurations across the three scenarios plus blocked S5/S7 are reported, with all attempts and exclusions retained |
| LAB-09 | Every supplied candidate has exactly one article outcome and one dry-run queue entry; duplicates/missing inputs cannot disappear |
| LAB-10 | No research or article path invokes production writes, model promotion, purchase, cleanup or deployment |
| LAB-11 | Official source manifests and survivor-panel limitations are present in the final report |
| LAB-12 | Focused tests, relevant regressions, required web production build and independent review have recorded outcomes |
