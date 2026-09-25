# Taiwan strategy lab — task checkpoint

Source baseline: `169aad1b6cfa747f78ae3464b614f43c0749d806`.
Working branch: `codex/tw-strategy-lab-v1`.
Continuation deadline: `2026-09-25T18:48:00+08:00` (`2026-09-25T10:48:00Z`).

This is a task ledger, not test or gate evidence. Check an item only after recording its actual artifact/command/result in `research/tw-strategy-lab/README.md` or a uniquely named results record. The hourly automation resumes these tasks and never merges or deploys.

## Frozen scope

- [x] Read repository AGENTS, Loop policy and engineering constitution.
- [x] Record seven hypotheses, five executable price trials, no parameter variants, survivor-panel limitations and locked 2024+ holdout in `spec.md`.
- [x] Record offline article coverage and the production/deployment boundary.
- [x] Freeze `preregistration.json`, exact panel, chronological folds and cost/execution assumptions before computing results; record its hash. (LAB-01, LAB-07)

## Data and engine

- [x] Finish bounded 2018–2023 official-data acquisition with source manifests and coverage/exclusion counts. CI run 36081668572: 684/684 base + 5 details; only five cash-only stocks eligible. Original derived evidence and scope-limited audit imported without rewriting source identity. (LAB-04, LAB-11)
- [x] Verify 2018 warmup handling and hard rejection of 2024+ inputs. (LAB-02)
- [x] Implement and test deterministic cash/position engine, next-session orders, gap/ambiguity handling and exit timing. (LAB-03, LAB-05)
- [x] Implement and test fees, sell tax, slippage, cash conservation, net metrics and same-filled-share cost-addback diagnostics and zero-trade cases. (LAB-06)
- [x] Implement S1/S2/S3/S4/S6 and retain S5/S7 as blocked without invented events. (LAB-01, LAB-04, LAB-08)
- [x] Execute the five price configurations in three fixed execution scenarios (15 registered development runs) and retain descriptive half-year windows, all attempts, failures and exclusions. Run a9123545831d8ee1a39b231c has 15 exploratory records plus two blocked event hypotheses; S4 has zero trades. These are not OOS folds. (LAB-03, LAB-07, LAB-08)

## Drafts and review

- [x] Explicitly record absence of the complete candidate snapshot. The bounded public observation below is incomplete and is not a guarded database export. The writing dossier GET endpoint was not called. (LAB-09, LAB-10)
- [x] Implement offline preview_ready/blocked drafts and a non-executable dry-run queue; synthetic-fixture tests run via `python3 -m unittest discover -s research/tw-strategy-lab -p 'test_article_builder.py' -v`: 17 tests passed. This is implementation evidence, not full-roster publication. (LAB-09, LAB-10)
- [x] Produce exactly one blocked article and dry-run queue entry for each of the 40 actual supplied public observations; retain the missing-export blocker. The other 156 entries counted by the old public snapshot and the complete current App roster remain unobserved. (LAB-09, LAB-10)
- [ ] Review engine, data assumptions, full trial ledger and draft coverage independently; resolve all high/blocker findings. (LAB-04–LAB-11)
- [x] Run focused tests, relevant regressions and `cd web && npm run build`; record actual results and any unresolved environment failures. (LAB-12)
- [x] Produce a development-only research report with all seven hypotheses, survivor bias, adjustment/PIT limitations, missing event history and no profitability guarantee. See results/github-36081668572-1/report.md and .agent/reports/2026-09-25T0148-tw-strategy-ci-review.md. (LAB-08, LAB-11)

## First CI evidence checkpoint — 2026-09-25 01:48 UTC

The earlier in-progress/never-computed status below is historical. Run 36081668572 completed successfully at 01:35:22 UTC, but research remains exploratory, not approved for trading. Exact code/registry/archive/manifest identities and all 18 strategy/reference outputs were checked; original normalized CSVs were not included in the artifact, so raw-data replay remains unverified. No engine or parameter changes were made. Full independent component review remains unchecked above.

Article v3 consumes actual results and the same incomplete 40-row observation. All 40 drafts remain blocked; 40 queue entries are non-executable, hashes match, seven terminal rows are present per draft, and production updates remain zero. Three observed symbols overlap the research panel; no portfolio performance was imputed to individual stocks.

Next bounded work: inspect S4 zero-signal mechanics and recorded rejection reasons without changing thresholds; review source/corporate-action evidence; determine a rights-safe reproducibility path for normalized data if needed. New actual code repairs require new commit/run and old evidence retained. No duplicate research download was launched by this evidence-only checkpoint.

## Signal and execution diagnostic checkpoint — 2026-09-25 02:50 UTC

- [x] Reconcile raw confirmations, executable signals, baseline fills, completed trades, open positions and skip reasons for S1/S2/S3/S4/S6 without rerunning the study.
- [x] Diagnose S4 against the preserved partial local checkpoint without network retries. Its preregistered compression gate passed 0/704 inspected basic-valid windows; no wiring defect was demonstrated.
- [x] Record trade distribution and concentration: S3's largest 8069 winner supplied 42.2% of realized gross profit; S6's 60% win rate still had negative average trade return.
- [x] Identify a medium reporting ambiguity: `signal_count` combines eligible and avoid-chase confirmations for S1/S2. Simulation remains correct; a future output-schema repair requires a new commit and new run.

Next bounded work is source/corporate-action review and a preregistered proposal for a genuinely new robustness experiment. Do not execute new parameters until its finite registry, multiplicity accounting and review rules are committed. Full normalized CI inputs are unavailable in the artifact; do not claim full gate-level replay from the partial checkpoint.

## Corporate-action and dividend-accounting checkpoint — 2026-09-25 03:51 UTC

- [x] Prove the saved corporate-action checkpoint is byte-identical to the CI manifest output: 14,538 bytes and SHA256 `6642de0cd619c1b5fc61e4220a7603d851fc9849e7487cd57f0d525246d5e8d5`.
- [x] Reconcile all 69 action rows and 74 source/detail hash references; zero referenced hashes are absent from the 689-source manifest.
- [x] Verify the five included symbols have 47/47 resolved cash-only rows and no non-unit share factor or cash-return event.
- [x] Reproduce the seven unresolved action rows and calendar-gap evidence supporting exclusion of 2317, 2603 and 2882.
- [x] Decompose terminal dividend receivables without presenting the subtraction as a counterfactual portfolio path.
- [x] Record a finite robustness-v2 proposal as review-required and not executed; retain 2024+ holdout lock and identify result-informed S4v2 candidates as hypothesis generation only.

Next bounded work: independently review engine order timing and price/tick handling, or review the proposed registry. Do not execute robustness-v2 until exact normalized inputs are available to the isolated runner and the finite registry is independently accepted.

## Execution timing and price-grid checkpoint — 2026-09-25 04:52 UTC

- [x] Cross-check common-stock opening order type, ordinary 10% limits and tick schedule against current TWSE/TPEx primary pages; reject a false positive caused by flattened multi-product table columns.
- [x] Check 615 signals, 1,446 non-null signal prices and 851 fills across all 15 result files: 22,744 assertions passed with zero illegal ticks, non-lot fills, late/early buys, same-open reentries or negative cash rows.
- [x] Confirm pre-open sizing and reservation occur before opening-bar reads and do not reuse same-opening sale proceeds or gap savings.
- [x] Add one synthetic regression keeping duplicated engine and signal tick functions aligned at every common-stock boundary; this is test-only and does not change v1 performance.
- [x] Preserve residual limits: no per-session official auction-reference/disposition-status history or order book, conservative dividend-payment sequencing, fractional fee/tax rounding and no engine-level duplicate-action rejection. The v1 action input itself has unique keys.

No high/blocker defect was demonstrated, so run 36081668572 is not invalidated or rerun. Its fills remain proxies and its performance remains exploratory. Next bounded work is independent review of the finite robustness-v2 proposal and whether each declared metric can be computed deterministically before any new trial is authorized.
- [ ] At the deadline, record completed/blocked work, exact artifact identities and next steps; holdout stays locked. (LAB-02, LAB-10)

## Operational work deferred to the final phase

- [ ] Recheck required protected gates for the final reviewed implementation; do not reuse a predecessor's exact-review evidence.
- [ ] Re-measure Contabo capacity under existing locks with the declared workload; a past free-space number is not admission.
- [ ] Prepare a concrete capacity/deployment proposal and reviewed migration/backfill sequence only after research review. No purchase, deletion, merge or deployment is performed by this task list.
- [ ] Full App roster export, production article update and live authority acceptance remain unverified until actual guarded operations and receipts exist.

Latest acquisition constraint: Chat network policy stopped official downloads after 155/684 base sources and 5 detail sources; GitHub isolated research is prepared but requires an actual workflow run; the first study is eight survivors; S5/S7 lack point-in-time event history; full production candidate export is not supplied; production articles are unchanged; Contabo's last reported projected reserve was about 9.9 GiB, below the 15 GiB hard floor. These are starting facts to replace only with fresh evidence, not successful outcomes.

## Public article observation receipt — 2026-09-25

`research/tw-strategy-lab/sources/public-roster-observation.json` records a bounded unauthenticated GET to the canonical `https://stockinsider-three.vercel.app/api/radar/daily`, redirected to `http://5.104.83.211/api/radar/daily`. The 79,629-byte response returned HTTP 200. Its content date was **2026-09-12**, projection health was `stale_readonly`, and action authority was disabled. The observation request started at `2026-09-25T01:09:14.303451+00:00`; the response publication field was `2026-09-25T00:58:18.256+02:00`. Those clocks are distinct and do not establish fresh market content.

The default page supplied 40 distinct `found` stock cards, while the public snapshot advertised `found:196, waiting:0, actionable:0`. No extra pages were requested. Separate hot and weekly GETs each timed out after the single bounded attempt. Only symbols, names, public detail revision identifiers and read provenance were retained; no full article bodies, authentication or database credentials were read. This source declares `complete:false`, `expected_count:null` and no authoritative candidate snapshot. Security master authority is not inferred from public cards.

The first dry-run output remains at `research/tw-strategy-lab/results/public-article-preview-2026-09-25/`. The current preview revision is `research/tw-strategy-lab/results/public-article-preview-2026-09-25-v2/`; it explicitly separates the old source-content date from the observation clock in every article. Both have 40 articles and 40 non-executable queue entries, 40 blocked and zero preview-ready. Each missing S1–S7 record is explicitly `blocked`, with null signal counts and a missing-input origin; this is not a claim of seven completed backtests. All file hashes were checked against the queue. The prior output was retained, not overwritten.

Reproduction command for the current preview (use a new output directory on another run):

```sh
python3 research/tw-strategy-lab/article_builder.py \
  --snapshot research/tw-strategy-lab/sources/public-roster-observation.json \
  --reports research/tw-strategy-lab/reports/broker-events-2026-09-25.json \
  --output-dir research/tw-strategy-lab/results/public-article-preview-2026-09-25-v2
```

No research result bundle was supplied to this run. It therefore attributes no performance to these publicly observed stocks. `full_app_coverage_verified:false`, `production_updated:false` and `publish_allowed:false` remain explicit. Full current candidate coverage and production article updates are still blocked on the real guarded export and publication workflow.

### Bounded public pagination follow-up

`research/tw-strategy-lab/sources/public-roster-observation-complete-visible.json` retains the original 40 observed cards and records exactly four additional GET attempts for offsets 40, 80, 120 and 160, each with `limit=40` and the original `snapshotPublishedAt=2026-09-25T00:58:18.256+02:00`. Each request had a 15-second maximum and failed with a network timeout before returning a response body; no retry was made. No additional candidate was accepted and no snapshot versions were mixed.

The follow-up file name describes the attempted coverage, not its outcome: `public_stage_coverage.complete:false`, `observed_count:40`, `advertised_count:196`. Full candidate metadata still has `complete:false`, `expected_count:null`. The current v2 drafts remain the latest actual output; no 196-stock v3 was generated because the 156 remaining public rows were not obtained. A future attempt requires a new observation record and the same snapshot-consistency checks.

Initial engineering receipt: 102 tests passed before final public-article timestamp additions; final suite count is recorded in the initial report after rerun. Next production build passed with 91 static pages. Source/registry hash is frozen in preregistration.sha256; no real performance computation has occurred. Network failure and the separate permitted CI execution route are retained explicitly.
