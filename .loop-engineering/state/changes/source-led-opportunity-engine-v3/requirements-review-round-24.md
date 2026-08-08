# Loop Engineering Requirements Gate — Round 24

## Verdict

**CHANGES_REQUIRED**

- P0: **0**
- P1: **3**
- P2: **0**
- Architecture Gate performed: **No**

Six of the seven Round 23 findings are closed. The worker-wire contract is closed in prose but not at every executable call ordinal, and the complete range still leaves the run-control HTTP interface and official trading-session point-in-time authority implementation-selected.

## Frozen Evidence

- Repository: `/Users/kaerchen/Desktop/20_stock/StockInsider-source-led-v3`
- Branch: `codex/source-led-opportunity-engine-v3`
- Reviewer session: `019f7835-d419-71c2-a770-d25baa96f947`
- Model/reasoning: `gpt-5.6-sol`, `xhigh`
- Baseline and exact merge base: `12c131aa50ca53268878e9f025973533ac100c49`
- Reviewed HEAD: `c8d3031d622e2727e737478e4ee55f9ce8cae8d4`
- Required range: `12c131aa50ca53268878e9f025973533ac100c49..c8d3031d622e2727e737478e4ee55f9ce8cae8d4`
- Range size: 22 commits, 63 paths, 4,529 additions and 0 deletions
- Scope: 62 files in this change directory plus `.specify/memory/constitution.md`; zero other paths
- Reviewer token usage: 392,020

Before and after review, HEAD and merge base were unchanged; staged, unstaged and untracked counts were zero. The reviewer inspected all range artifacts and performed only static repository inspection. It ran no application code, tests, build or lint; edited no file; accessed no network or production service; applied no migration; and performed no merge, push or deployment.

## Findings

### P1 — Run-control HTTP interface remains implementation-selected

The body `{mode,sourceCutoff}` is fixed, but `POST /api/internal/opportunity-run`, its status route and the GET cron mapping have no single exact request grammar, successful object, status/body/header set, failure mapping, precedence or database call/write oracle. `OPS-004` also permits either ignoring or rejecting arbitrary selectors.

Required repair: publish one closed control-route catalog covering begin, status and GET cron mapping; define exact method/query/media/raw-size/body/cutoff/auth/client/RPC rules, every begin/status branch and canonical response, and exhaustive acceptance coverage with no ignore/reject choice.

### P1 — Official trading-session point-in-time authority is not closed

`tw_trading_sessions_v3` permits multiple `(market,sessionId)` observations by source ref and exposes `completed|cancelled`, but no cutoff resolver closes corrections, cancellations, provider conflicts, tied knowledge times or the TWSE/TPEx-to-one-Taiwan-session projection. Mover roots, 72-hour audit windows, outcome maturities and evaluation all depend on that unresolved authority.

Required repair: define the exact stream identity, recorded/source/collection-time resolver, correction/cancellation/reactivation behavior, tie collapse/failure, bounds/indexes and composite Taiwan-session rule; bind the chosen evidence into mover/outcome/evaluation identities and add C-1/C/C+1 plus conflict/cancellation fixtures.

### P1 — Worker-wire acceptance omits later database-call ordinals

`job-graph-contract.md` governs credential rejection at any bounded read or continuation and requires coverage at every call position, while `OPS-029` injects only before claim, each first continuation and after staging. A payload performing multiple reads can therefore pass without exercising later positions.

Required repair: define a finite ordered per-payload database-call catalog and inject credential plus timeout/5xx/malformed/unknown failures at every ordinal, asserting exact HTTP bytes/headers/call counts and lease/staging/result/successor state. Version and recount the canonical inventory.

## Round 23 Closure Status

Independently confirmed closed:

1. null-predecessor bootstrap and deterministic first job;
2. topological manifest order;
3. mixed deep-batch conservation and exactly three scores per success;
4. independent four-value outcome maturity;
5. sole atomic mover-audit writer;
6. knowledge-time filtering without invented tuple fields.

Worker-wire prose is exact, but its executable oracle remains open under the third finding.

## Acceptance Inventory

- Version: `1.23.0`
- Declared / actual / unique: `197 / 197 / 197`
- Exact ordered five-field records: 197
- Missing, extra, duplicate, empty, malformed or semantic skip/todo cases: 0
- Semantic one-to-one traceability: **failed** for the three findings above

## Gate Consequence

Architecture Gate remains locked. Sol must repair the three findings, update the canonical inventory and submit the complete immutable range to a brand-new fresh Requirements Gate. This review authorizes no implementation, migration, production binding, merge, push or deployment.
