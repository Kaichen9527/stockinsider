# Requirements Gate Round 29 — `source-led-opportunity-engine-v3`

## Verdict

**CHANGES_REQUIRED**

| Severity | Count |
|---|---:|
| P0 | 0 |
| P1 | 5 |
| P2 | 0 |

PASS requires `P0=0` and `P1=0`. Five material requirements defects remain. This was a Requirements Gate only; no Architecture Gate was performed.

## Frozen evidence and range shape

- Immutable baseline: `12c131aa50ca53268878e9f025973533ac100c49`
  - Tree: `c90ff9b693a6c8e0acb3d23b7068a231347e318c`
- Immutable reviewed HEAD: `bc2746d6ff85d567b29265ecc3dd9a6590abff43`
  - Tree: `052d8a548e19cd753dfd0d303f759badbb5c98b0`
- Exact range: `12c131aa50ca53268878e9f025973533ac100c49..bc2746d6ff85d567b29265ecc3dd9a6590abff43`
- Merge base: exactly the immutable baseline.
- Range shape: 32 commits, zero merge commits.
- Diff: 70 files, 5,777 insertions; 69 change-state files plus the constitution, with no implementation path.
- Round 28 repair delta from `c679820dbc8012ffaf23b98b3171ae78192d39be`: two commits, 17 files, 334 insertions and 98 deletions.
- Evidence was read through the explicit worktree Git directory and immutable Git objects. Worktree state was not treated as authority.
- The HEAD change directory contains 69 objects. All current normative artifacts were inspected; historical Requirements reports rounds 1–27 were path-excluded and not opened. Round 28 and Architecture rounds 1–2 were read only for the requested re-audits.
- Governance was applied from `AGENTS.loop-engineering.md`, `LOOP_ENGINEERING.md`, policy/profile, and the constitution. Policy permits zero blocker/high findings ([policy.yaml:6](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/policy.yaml:6>)); the constitution requires explicit workload bounds and executable acceptance ([constitution.md:7](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.specify/memory/constitution.md:7>), [constitution.md:23](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.specify/memory/constitution.md:23>)).
- Review activity was static and read-only. No implementation, migration, build, lint, test, network access, repository write, merge, push, deployment, or production mutation occurred.

Line links below are convenience anchors; the reviewed bytes are those at immutable HEAD.

## P1 findings

### P1-1 — The official stock-price plane has no closed provider, correction, or raw-scan authority

Multiple normative computations require cutoff-visible, official, corporate-action-adjusted TWSE/TPEx prices. The mover audit requires them across the roster ([requirements.md:106](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/requirements.md:106>)); factor scoring delegates adjusted close, volume, and turnover to `market-contract.md` ([scoring-contract.md:38](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/scoring-contract.md:38>)); sector benchmarks require the same official observations ([sector-benchmark-contract.md:7](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/sector-benchmark-contract.md:7>)).

The storage contract, however, only declares an append-only price table, a broad `provider` field, an immutable identity that includes `recorded_at`, and two indexes ([storage-schema-contract.md:81](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/storage-schema-contract.md:81>)). Its input accepts the general `market_provider_v3` enum—including TAIFEX and global providers—not a price-specific exchange/provider authority ([postgres-type-contract.md:25](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/postgres-type-contract.md:25>), [postgres-type-contract.md:149](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/postgres-type-contract.md:149>)).

The 18-row provider allowlist applies to fact/scope/unit market observations, not stock-price observations ([market-contract.md:15](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/market-contract.md:15>)). No active contract defines:

- eligible owner and fallback providers for a TWSE or TPEX stock price;
- cutoff ordering across `source_timestamp`, `collected_at`, `recorded_at`, source reference, and corporate-action version;
- byte-equal versus differing greatest ties;
- which correction wins when several rows bind the same stock/session authority;
- a finite raw revision cap or `bound+1` sentinel for that identity.

The terminal mover manifest is roster-bounded ([market-contract.md:124](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/market-contract.md:124>)), but that does not bound or resolve the raw price rows needed to construct each terminal row. The current indexes likewise do not constitute a price-provider/correction contract.

Acceptance `MKT-014`, `MKT-015`, and `EVAL-007` cover terminal rows, interruption, and generic corrections, but no case establishes the missing provider allowlist, exact correction precedence, per-identity raw sentinel, or indexed sparse/conflicting-history plan ([acceptance-tests.json:175](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/acceptance-tests.json:175>), [acceptance-tests.json:199](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/acceptance-tests.json:199>)).

**Required repair:** define a versioned price-specific provider/exchange authority, exact cutoff/correction/tie/corporate-action rules, matching storage/index shapes, a finite raw sentinel before manifest construction, and executable conflict/overflow/sparse-history/catalog cases.

### P1-2 — Post-collapse source and authority limits still permit unbounded raw revision scans

The source adapter explicitly says: “No cap or page limit is applied to raw revisions before family collapse” ([source-adapter-contract.md:17](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/source-adapter-contract.md:17>)). The `LIMIT 1000001` sentinel is applied only after collapsing all revisions to one row per family. A single family can therefore contain arbitrarily many cutoff-visible corrections that must be examined before the post-collapse limit is meaningful. The catalog supplies indexes but no raw revision bound ([storage-schema-contract.md:22](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/storage-schema-contract.md:22>)).

The seven mutable authority families have the same gap. Their declared limits apply to selected streams only after latest-event collapse ([authority-supersession-contract.md:9](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/authority-supersession-contract.md:9>), [authority-supersession-contract.md:23](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/authority-supersession-contract.md:23>)). Line 33 asserts that stream-leading indexes prevent application-memory history loading, but neither it nor the storage catalog limits database rows examined while enumerating and collapsing an arbitrary correction history ([authority-supersession-contract.md:33](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/authority-supersession-contract.md:33>)).

`SRC-013`, `SRC-012`, `AUTH-001`, and `PEER-007` exercise corrections and post-collapse sentinels, but none places a valid bounded terminal population behind an over-bound same-family or same-stream revision history and proves a finite raw indexed plan ([acceptance-tests.json:160](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/acceptance-tests.json:160>), [acceptance-tests.json:163](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/acceptance-tests.json:163>), [acceptance-tests.json:186](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/acceptance-tests.json:186>)).

**Required repair:** place a finite database-enforced bound on raw revisions/events per source or authority stream, or introduce a bounded materialized stream-head authority. Define the exact sentinel, failure, index, zero-write behavior, and `EXPLAIN` acceptance for deep correction histories.

### P1-3 — Artifact and historical market selectors cap outputs but not rows examined

Two further selectors rely on small outputs without bounding their raw work:

1. Assistive-artifact selection groups all cutoff-valid registrations by artifact hash, collapses/revokes them, joins evaluation manifests, sorts by evaluation terminal time, and only then retains three ([storage-schema-contract.md:71](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/storage-schema-contract.md:71>), [storage-schema-contract.md:73](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/storage-schema-contract.md:73>)). No registration-count or per-hash revision bound exists, and none of the three indexes matches the final joined `evaluation_manifest.terminal_at` ordering. `MOD-004` proves at most three outputs but supplies no raw boundary or sparse revocation-history plan ([acceptance-tests.json:178](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/acceptance-tests.json:178>)).

2. Market z-scores select the “most recent 252 available” normalized observations and require at least 60 ([market-contract.md:76](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/market-contract.md:76>)). The per-date 64-revision cap does not bound how many conflicted or unavailable historical dates may precede the 60th or 252nd usable value. No raw date/history sentinel is stated. `MKT-011` covers values at 60/252, but not an over-bound sparse/conflicted prefix or its indexed plan ([acceptance-tests.json:130](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/acceptance-tests.json:130>)).

These are constitutional workload-bound defects, not P2 performance suggestions.

**Required repair:** provide finite raw candidate/date bounds and matching indexed orders, or bounded precomputed authorities, before top-three artifact truncation or “available observation” counting. Acceptance must distinguish output limits from maximum rows examined.

### P1-4 — A valid two-stage label plan can exceed the manifest conservation bound

The repaired label selector correctly caps raw score identities at 30,241 and terminal identities at 20,001 ([shadow-evaluation-contract.md:26](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/shadow-evaluation-contract.md:26>), [shadow-evaluation-contract.md:28](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/shadow-evaluation-contract.md:28>)). It requires one conservation row per `(inputEnrichRunId,maturityHorizon)`.

The manifest contract independently caps `outcome_input.conservation` at 1,000 ([manifest-storage-contract.md:29](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/manifest-storage-contract.md:29>)). That cap is lower than a constructible plan accepted by both label sentinels.

A conservative valid fixture is:

- exact 252-session window;
- both canonical purposes;
- one deep symbol, hence three score identities per run;
- 220 run dates mature for `session_20`, 180 for `session_60`, and 110 for `session_120`; no `session_250` rows are needed;
- all eligible outcomes remain unlabeled.

The resulting counts are:

- raw score identities: `252 × 2 × 3 = 1,512`, below 30,241;
- terminal identities: `(220 + 180 + 110) × 2 × 3 = 3,060`, below 20,001;
- required conservation rows: `(220 + 180 + 110) × 2 = 1,020`, above 1,000.

The plan therefore passes both zero-write begin sentinels but cannot complete its required manifest. Runtime also says no other mode bound exists ([runtime-transaction-contract.md:206](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/runtime-transaction-contract.md:206>)).

`EVAL-011`, `OPS-038`, and `OPS-039` do not exercise this cross-purpose/run/maturity conservation maximum ([acceptance-tests.json:176](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/acceptance-tests.json:176>), [acceptance-tests.json:219](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/acceptance-tests.json:219>), [acceptance-tests.json:220](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/acceptance-tests.json:220>)).

**Required repair:** derive and declare the actual maximum conservation cardinality under the 252-session/two-purpose/four-maturity grammar, raise or redesign the section bound accordingly, and add a maximal constructible cross-product case.

### P1-5 — Round 28’s active contract-version graph repair is incomplete

Two active normative references still name superseded versions:

- `control-plane-contract.md` delegates the six-step begin precedence to `runtime-transaction-contract.md v3.6` ([control-plane-contract.md:73](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/control-plane-contract.md:73>)), while the active runtime contract is `opportunity-runtime-v3.7` ([runtime-transaction-contract.md:3](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/runtime-transaction-contract.md:3>)).
- `trading-calendar-contract.md` says fact/scope mapping is closed by `market-provider-v3.1` ([trading-calendar-contract.md:54](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/trading-calendar-contract.md:54>)), while the current provider authority is `market-provider-v3.2` ([market-contract.md:11](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/market-contract.md:11>), [market-contract.md:19](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/market-contract.md:19>)).

This cannot be resolved by implementation convention because the design explicitly declares normative conflicts to be Gate failures ([design.md:26](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/design.md:26>)). Consequently, the claims that active references now match are false in both the gate summary and acceptance narrative ([gate-summary.md:32](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/gate-summary.md:32>), [acceptance-tests.md:3](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/acceptance-tests.md:3>)).

**Required repair:** update every active normative reference to the deployed tuple and add a mechanical active-reference graph oracle. If a canonical acceptance case changes, re-version and remirror the exact inventory.

## Complete focused system audit

| Area | Result |
|---|---|
| Exact run identity | **Closed.** Independent parsing found exactly 35 unique ASCII-name-ordered static members, including `acceptanceVersion=1.28.0` ([runtime-transaction-contract.md:114](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/runtime-transaction-contract.md:114>)). |
| Evaluation lock lineage | **Closed.** Null exactly for `ad_hoc_shadow`, non-null and database-owned for all four daily purposes; included in preparation and logical identities and enforced across daily inputs ([runtime-transaction-contract.md:167](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/runtime-transaction-contract.md:167>), [storage-schema-contract.md:139](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/storage-schema-contract.md:139>)). |
| TAIEX/OTC close and MA authority | **Closed for market observations.** Exact contiguous 60-session close windows and MA20/MA60 formulas are constructible ([market-contract.md:47](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/market-contract.md:47>)). |
| Breadth authority | **Closed.** Numerator/observed/eligible counts and one roster ID/hash are required; combined breadth is count-weighted and requires 500/80% coverage ([market-contract.md:49](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/market-contract.md:49>), [market-contract.md:51](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/market-contract.md:51>)). |
| Public market keys | **Closed.** The market-reference families, key order, scope mapping, terminal rows, reasons, and conservation are explicit ([market-contract.md:61](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/market-contract.md:61>)). |
| Market authority dates and caps | **Closed for `opportunity_market_observations_v3`.** Session, global, and non-session authority dates are database-derived; `LIMIT 65` is driven by the universal stream index and global `LIMIT 193` by the matching partial index ([storage-schema-contract.md:83](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/storage-schema-contract.md:83>), [storage-schema-contract.md:85](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/storage-schema-contract.md:85>)). Stock-price and z-score selectors remain blocked under P1-1/P1-3. |
| Two-stage labels | **Selector repaired.** Current-lock/two-purpose/252-session raw `LIMIT 30241`, indexed exclusion of unrelated history, then terminal `LIMIT 20001` are explicit ([storage-schema-contract.md:143](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/storage-schema-contract.md:143>)). End-to-end constructibility fails under P1-4. |
| Evaluation grammar | **Closed.** Exact 252 attempt roster, `0..120` backtests, `0..20` live rows, complete partial manifests, and exact `120/20` promotion are consistent ([shadow-evaluation-contract.md:22](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/shadow-evaluation-contract.md:22>), [shadow-evaluation-contract.md:32](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/shadow-evaluation-contract.md:32>), [shadow-evaluation-contract.md:72](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/shadow-evaluation-contract.md:72>)). |
| Version graph | **Blocked by P1-5.** |
| Source-led/full-market boundary | **Closed behaviorally.** Full-market work is limited to shallow aggregate/reference/audit contexts and price movement cannot create or promote a candidate ([requirements.md:100](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/requirements.md:100>), [job-graph-contract.md:110](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/job-graph-contract.md:110>)). |
| Interfaces and failure precedence | **Otherwise closed.** The five-argument begin, six control routes, seven begin failures, transaction precedence, 31 RPCs, finite worker discriminator, and private helpers are explicit ([runtime-transaction-contract.md:204](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/runtime-transaction-contract.md:204>), [job-graph-contract.md:9](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/job-graph-contract.md:9>)). |
| Additive storage/RLS/grants | **Closed.** `ENABLE` without `FORCE`, NOLOGIN/NOBYPASSRLS owner, one binding policy, pre-existing BYPASSRLS service role, closed reads/31 RPCs, and no direct service-role DML are exact ([storage-schema-contract.md:259](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/storage-schema-contract.md:259>)). |
| Durable job graph | **Closed.** Bootstrap, deterministic successor, immutable payload/result, sequential manifest plan, worker call ownership, retries, and finalizer are constructible ([job-graph-contract.md:5](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/job-graph-contract.md:5>), [job-graph-contract.md:93](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/job-graph-contract.md:93>)). |
| Universal finite resource closure | **Blocked by P1-1 through P1-4.** |

## Round 28 six-item re-audit

| Round 28 finding | Round 29 result |
|---|---|
| 1. Run identities omitted acceptance version/evaluation lock | **Closed.** Exact 35-member tuple, acceptance `1.28.0`, purpose-owned lock nullability, preparation/logical inclusion, storage trigger, and mutation acceptance are aligned. |
| 2. Trend/breadth evidence was not constructible | **Closed for the finding’s market-observation scope.** Exact close/MA windows and count/roster-bound breadth now exist. P1-1 is a separate stock-price authority defect. |
| 3. Global distinct-date selector was unbounded/misindexed | **Closed.** Home-timezone provider dates, universal 64-revision cap, raw `LIMIT 193`, fourth-date sentinel, and matching global partial index are exact. |
| 4. Label `LIMIT 20001` did not bound the raw scan | **Closed.** The prior 252-session/two-purpose scan is current-lock indexed and capped by raw `LIMIT 30241`; unrelated/ad-hoc/old-lock history is predicate-excluded. P1-4 is a later manifest-cap contradiction. |
| 5. Partial evaluation grammar conflicted | **Closed.** The sole grammar is `252/0..120/0..20`; promotion remains exact `120/20`. |
| 6. Active version graph was inconsistent | **Not closed — P1-5.** Two active superseded references remain. |

Result: five of six Round 28 findings are closed; the version-graph finding remains open.

## Architecture Rounds 1–2 inherited-coverage audit

No Architecture Gate was performed. This section only checks whether their inherited blockers are covered by the present requirements system.

### Architecture Round 1

| Inherited blocker | Current coverage |
|---|---|
| Immutable source revisions | Structurally covered by the additive revision ledger and pre-truncation adapters. Raw revision workload remains open under P1-2. |
| Database knowledge time | Covered: authority, observation, revision, run, manifest, and result rows have database `recorded_at`, with cutoff eligibility separated from business time. |
| Additive data plane | Mostly covered by the exact storage/type catalog. The inherited adjusted-price portion is not fully covered because P1-1 leaves its provider/correction authority open. |
| Transactions and crash recovery | Covered by runtime transactions and the deterministic durable job graph. |
| Principal binding and dedicated service role | Covered by dual authentication, database bindings, nonce protocol, exact failure mapping, and closed grants. |
| Bounded execution | Not fully covered: P1-1 through P1-3 leave raw selectors without finite database workload bounds. |
| V3 detail seam | Covered by same-run immutable detail projection and explicit prohibition on legacy lookup/refresh/write ([v3-detail-contract.md:7](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/v3-detail-contract.md:7>), [v3-detail-contract.md:22](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/v3-detail-contract.md:22>)). |
| Acceptance coverage | Not fully covered because the five current P1 defects lack executable semantic oracles. |

### Architecture Round 2

- Durable job creation and payload protocol: **covered** by `opportunity-job-graph-v3.4`.
- Exhaustive storage/type catalog: **covered for the enumerated Round 2 type/normalized-output defect**; P1-1 is a new semantic authority gap rather than the former missing-type catalog.
- Forced-RLS/owner contradiction: **covered** by explicit `ENABLE` plus `NO FORCE`, owner/policy behavior, BYPASSRLS preflight, and catalog acceptance.

The three specific Round 2 findings are repaired, but inherited Round 1 adjusted-price, bounded-execution, and acceptance coverage are not fully closed.

## Provider preimage and hash audit

The fenced provider preimage at HEAD was independently parsed and serialized canonically. Because it consists only of arrays, strings, and JSON null, compact UTF-8 serialization is unambiguous under RFC 8785.

| Check | Independent result | Contract |
|---|---:|---:|
| Provider rows | 18 | 18 |
| Canonical UTF-8 length | 1,645 bytes | 1,645 bytes |
| SHA-256 | `fe78e0f8c5b0846f822f72c6b2356cac35ed5c00dd0bcd06f9a75b7c5b21d3f7` | same |

The independent result matches [market-contract.md:43](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/market-contract.md:43>) and `OPS-036` ([acceptance-tests.json:216](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/acceptance-tests.json:216>)). No provider preimage byte/hash defect was found. The stale `market-provider-v3.1` reference remains separately blocked under P1-5.

## Acceptance inventory audit

Mechanical audit results:

- JSON parse: valid.
- Version: exactly `1.28.0`.
- Declared / actual / unique case IDs: `216 / 216 / 216`.
- Every JSON case has exactly the ordered fields `id, requirement, layer, setup, expected`.
- Empty canonical fields: 0.
- Markdown rows / unique IDs: `216 / 216`.
- JSON-to-Markdown exact five-field mirrors: `216 / 216`.
- JSON-only or Markdown-only IDs: none.
- Layer inventory:
  - unit 76
  - contract 48
  - integration 46
  - security 19
  - performance 7
  - governance 6
  - migration 5
  - migration/performance 3
  - regression 2
  - meta 2
  - performance/integration 2

The declarations are visible at [acceptance-tests.json:3](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/acceptance-tests.json:3>) and [acceptance-tests.md:3](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/acceptance-tests.md:3>).

Round 28 repair added `MKT-016`, `MKT-017`, and `OPS-039`, and removed no case. Those cases adequately cover the repaired market-observation and label-raw-selector boundaries. Mechanical inventory integrity therefore passes.

Semantic acceptance does not pass:

- no official stock-price provider/correction/raw-bound oracle for P1-1;
- no over-bound raw source/authority revision-history oracle for P1-2;
- no artifact or sparse z-score raw-scan bound for P1-3;
- no constructible outcome-conservation fixture above 1,000 for P1-4;
- no mechanical active-reference graph oracle capable of detecting P1-5.

`GOV-001` proves inventory mirroring, not completeness of these missing semantic cases ([acceptance-tests.json:221](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/acceptance-tests.json:221>)).

## Gate consequence

The Round 29 Requirements Gate is **CHANGES_REQUIRED**. The repository already records that Architecture remains locked until a fresh zero-P0/P1 Requirements PASS ([tasks.md:66](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/tasks.md:66>), [status.json](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/status.json>)).

Therefore:

- Architecture Gate remains locked.
- Implementation remains unauthorized.
- Migration, build, lint, tests, merge, push, deployment, and production mutation remain unauthorized.
- A new fresh Requirements Gate is required after all five P1 findings and their acceptance gaps are repaired.
