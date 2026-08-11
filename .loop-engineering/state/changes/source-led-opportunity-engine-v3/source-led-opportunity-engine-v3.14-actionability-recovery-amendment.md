# Actionability Recovery Amendment — V3.14

Status: implementation subject; fresh Requirements and Architecture review required.
Amendment version: `source-led-opportunity-actionability-v3.14.0`
Authority: `source-led-opportunity-actionability-v3.14.0`

## Objective

StockInsider SHALL keep trustworthy research visible even when action authority is
unavailable. Research ranking and buy-like decisions are separate contracts. Neither
contract creates a daily recommendation quota.

## AR-001 — Production RED baseline and release truth

The 2026-08-11 production audit is canonical:

- V3.13 Web consumed a V3.12 projection from producer commit
  `184390953048209730c22828548858c28fa3b6b7`;
- the stored last-good projection contained 30 source signals, 12 early-watch cards
  and 4 hot cards, while the public response exposed zero stock cards;
- `tw_trading_sessions_v3`, V3 financial facts, prices and exchange valuations were
  empty, and the V3.13 decision/source tables did not exist;
- the 2026-08-10 producer run terminalized `data_integrity_failure` because the
  `unchanged` discovery branch omitted `seedMembership`; and
- Threads/YouTube credentials were absent and metadata-only Podcast/YouTube rows
  could not establish thesis authority.

Loop status, PR body, runtime manifest and public health SHALL report this state. A
manually deployed consumer tree is never evidence that its producer or migration is
active.

## AR-002 — Projection health and research visibility

`ProjectionHealthV314` has four independent dimensions:

```text
integrityStatus = valid | conflict | missing
freshnessStatus = fresh | stale_readonly | unavailable
researchVisibility = live | last_good_readonly | none
actionAuthority = enabled | disabled
```

Missing calendar authority, an old schema or stale evaluation disables action
authority but does not erase a checksum-valid stored projection. Every retained card
is transformed to read-only and exposes its prior action only as `lastKnownAction`.
Only checksum conflict, invalid stored bytes or a genuinely missing projection may
set `researchVisibility=none`.

V3.12 last-good cards are accepted only through a versioned compatibility adapter.
They receive blocker `legacy_schema_without_v314_decision_authority`, never a new
decision, and cannot navigate to an independently recalculated detail.

All public counts, badges, deltas, reports and rendered cards derive from the same
post-policy projection. The product cannot show zero source signals while separately
claiming a positive added-source count.

## AR-003 — ResearchRankingEnvelopeV314

The research envelope controls visibility and ordering only. It never supplies an
action, target, entry or position size.

```text
valuation              0.30
fundamentalQuality     0.25
momentumTechnical      0.20
sourceCatalyst         0.15
marketLiquidity        0.10

coverage = sum(weight for trustworthy axes)
rankingScore = clamp(0, 100,
  sum(weight * axisScore for trustworthy axes) - 20 * (1 - coverage))
```

Missing axes contribute zero and are not renormalized. Removing an axis cannot raise
the score. `near_buy` requires score at least 70, coverage at least 0.75, trustworthy
valuation/fundamental/technical axes, no conflict and at most one soft blocker.
`waiting` requires score at least 60 and coverage at least 0.60. A credible source
signal below those thresholds remains `research_pending`.

BIAS is timing/risk evidence, not a value claim. `below_support` remains
`wait_reclaim`; BIAS above the stock's p90 or more than two ATR above MA20 is
`avoid_chase`. Sixty through 251 official multiple sessions may create a provisional
relative display only. They cannot authorize `research_starter`.

## AR-004 — DecisionEnvelopeV314

The sole action enum is:

```text
buy | accumulate | research_starter | wait_value | wait_market |
wait_breakout | wait_reclaim | avoid_chase | avoid | unavailable
```

Formal risk-on authority retains Base upside at least 15%, reward/risk at least 2,
complete valuation, quality, market and geometry gates. `buy` requires
`breakout_confirmed`; `accumulate` requires `at_support`. Conditional research retains
252 official sessions, at least eight same-session peers, at least 15% discount and
passing quality/market/technical gates.

Selective market authority replaces the opaque research-score gate with Base
upside/discount at least 20% and reward/risk at least 2.5. A defensive market yields
`wait_market` only after every stock-specific gate passes.

When formal margin or reward/risk is the sole failed gate, `wait_value` exposes the
tick-rounded maximum entry:

```text
min(baseTarget / (1 + requiredMargin),
    (baseTarget + requiredRewardRisk * stop) / (1 + requiredRewardRisk))
```

`avoid` requires affirmative negative evidence. Missing, stale or conflicting
authority is `unavailable`. A missing cited brief downgrades only that card and cannot
abort projection publication.

## AR-005 — Producer, authority and diagnostics

Every linked discovery disposition, including `unchanged`, carries symbol,
`seedMembership` and the frozen legacy seed-set hash. The 2026-08-10 immutable input
must replay to 60 terminal ledger outcomes without a constraint failure.

Failure diagnostics are append-only and contain only allowlisted structured members:
run/job/stage/kind, failure code/origin, invariant code, SQLSTATE, constraint name,
item ordinal, field path, input hash, producer commit and recorded time. Raw SQL
messages, connection URIs, payloads, credentials and source text are forbidden.

The official bootstrap supplies at least 300 completed exchange sessions, 130
adjusted sessions for each deep candidate and benchmark, 252 official multiple
sessions plus eight same-session peers for conditional authority, and four consecutive
quarters for the ordinary financial bridge. Source acquisition terminalizes all
17-by-3 attempts; absent OAuth is truthful `auth_failed` and cannot block the official
market/fundamental research plane.

## AR-006 — Product and rollout

Landing sections are `現在可行動` (6), `接近買點／等待條件` (12) and
`新來源／資料待補` (12). A collapsed card contains at most six numeric values:
current price, three valuation points, trigger and invalidation. Detail remains bound
to the exact immutable decision revision.

Radar schema advances additively to `legacy-radar-v3.14.0`; V3.13 is read-only
compatibility and V3.12 is last-good compatibility only. The full
`/api/opportunity-v3` route remains disabled. LINE, dispatch, automatic trading,
model influence and Promotion remain out of scope.

Rollout is two-stage: first restore checksum-valid last-good research as read-only;
then apply the additive migration, bootstrap official authority, run the reviewed
producer twice to terminal success and enable action authority only for a fresh,
compatible release identity. Rollback restores the Web alias and runtime manifest,
stops the scheduler and retains additive database objects.

## Executable acceptance

The canonical acceptance inventory is `1.46.0`, 320 IDs, partitioned as
272 product/runtime, 28 model-runner and 20 evaluation-governance cases. The twelve
`REC-001..REC-012` cases are first-class product/runtime owners.

The V3.14 acceptance owners SHALL cover projection compatibility, count consistency,
monotonic missing-axis ranking, all ten actions, provisional relative valuation,
BIAS/ATR safety, unchanged-seed persistence, typed redaction, single-card brief
downgrade, full acquisition-to-Web publication, migration rehearsal, two-run
idempotency and production browser cardinality. Any skipped owner blocks Code Gate.
