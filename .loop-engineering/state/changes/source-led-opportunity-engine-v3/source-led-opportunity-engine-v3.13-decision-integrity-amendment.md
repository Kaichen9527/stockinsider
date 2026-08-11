# Decision Integrity Amendment — V3.13

Status: implementation subject; fresh Requirements and Architecture review required.
Amendment version: `source-led-opportunity-decision-integrity-v3.13.0`
Authority: `source-led-opportunity-decision-integrity-v3.13.0`

## Closed supersession scope

This amendment is the active owner only for the disabled legacy-product projection,
Landing/detail, tracked legacy producer and V3.13 release-candidate behavior listed
below. It does not change the shadow V3 Promotion contract. The following older clauses
remain historical compatibility inputs but are superseded for every V3.13 output:

| Older active owner / clause | V3.13 owner | Closed effect |
|---|---|---|
| `requirements.md` R9 five-action allocation and portfolio-capacity language | DI-004 | No portfolio quota or independent action allocation; the eight-action envelope is sole authority. |
| `data-contract.md` five legacy action values and independent card action fields | DI-004 / DI-007 | Legacy fields are compatibility mappings of one mandatory envelope only. |
| `decision-contract.md` five-action decision and sizing behavior | DI-004 | Applies only to the pre-V3.13 shadow contract; disabled legacy-product output uses `DecisionEnvelopeV313`. |
| `v3-detail-contract.md` latest-snapshot detail selection | DI-006 | V3.13 Landing/detail select one immutable `decisionRevisionId`; FULL null and provenance remain authoritative. |
| `valuation-contract.md` earlier readiness minimum | DI-002 | Formal V3.13 readiness requires the complete official bridge and reconciliation defined here. |
| `storage-schema-contract.md` PE-only/non-null reported-multiple row | DI-002 | V3.13 adds nullable PE plus nullable positive PB with at least one metric, an expression-unique immutable source tuple and the audited typed append authority below. |
| `postgres-type-contract.md` PE-only reported-valuation input | DI-002 | The predecessor remains valid for PE-only shadow writes; V3.13 legacy-correctness production uses `exchange_reported_valuation_input_v3_13` and no direct table DML. |
| `auth-principal-contract.md` PE-only price-authority branch | DI-002 | `append_exchange_reported_valuation_v3_13` is the sole V3.13 PE/PB writer, requires exact runner authority and appends an `append_price_authority_v3` audit atomically. |
| `analysis-revision-contract.md` predecessor material/display identity | DI-001 / DI-006 | V3.13 excludes heartbeat-only time from material and binds displayed identity to symbol, analysis revision, envelope, supported brief and provenance. |
| `legacy-radar-correctness-contract.md` wall-clock projection availability | DI-001 | V3.13 uses cutoff-visible exchange-session freshness and typed public degradation. |
| `product-correctness-runtime-amendment.md` 297-ID / 249-product acceptance clauses | DI-001..011 | Superseded by the canonical `1.45.1` 308-ID / 260-product inventory. |
| `hybrid-product-amendment.md` 297-ID partition and acceptance-version clauses | DI-001..011 | Superseded by the same counted protected inventory; Promotion partition semantics remain unchanged. |

No implementation may select between these clauses. For V3.13 fields, this table is
exhaustive and this amendment wins; for untouched V3 shadow behavior the older owner
continues unchanged.

## Objective and invariant

StockInsider MUST present one point-in-time decision for one stock revision. Discovery,
valuation, technical timing, compact projection, Landing and detail MUST NOT calculate
independent actions. Missing authority means `unavailable`; it never means “already
priced”, “avoid”, or a fabricated target. The product has no daily buy quota.

## Reproducible RED baseline

The 2026-08-09 read-only production audit established all of the following:

- `/` returned HTTP 500 and `/api/radar/daily|hot|weekly` returned HTTP 503
  `radar_projection_unavailable`. The newest producer evaluation was more than 24
  hours old. Web rejected it at 24 hours while doctor still called it fresh for 36.
- The newest 20 of 20 deep candidates lacked revenue, gross profit, operating income,
  pretax income, attributable net income and diluted-share bridge authority. All 30
  source cards were compatibility-written as `valuation_review`, while an independent
  `opportunityAction` still emitted `setup_ready` for one card.
- `mergeDeepDiveWithLightSnapshot` spread LIGHT over FULL and restored only selected
  narrative members. `targetSnapshot`, `valuationPanel`, `tradeDecision` and
  `technicalEntrySignal` could therefore be replaced by null or a conservative LIGHT
  action. Production-shaped 4760 and 6285 examples reproduced the loss.
- Threads had no new acquired document in seven days, Podcast had zero authoritative
  transcript, and most YouTube/KOL records were metadata only. Existing labels could
  imply content understanding despite missing transcript/caption authority.
- The prior request path treated null target as a negative investment conclusion and
  card density hid the missing valuation blocker.

This baseline supersedes any interpretation that V3.12 production smoke proved product
decision correctness.

## DI-001 — Schedule-aware projection health

`contentAsOf`, `evaluatedAt`, `publishedAt` and `nextExpectedAt` are distinct. Web,
doctor and authenticated health use the same versioned policy and cutoff-visible TWSE
calendar. Within two hours of the expected run is `fresh`; one or two missed expected
runs are `stale_readonly`; three are `unavailable`. Weekends and exchange holidays do
not count as missed runs. A no-material-change run publishes a new evaluation heartbeat
without rewriting immutable analysis content.

The exact V3.13 material preimage is the nine-member canonical array already fixed by
`analysis-revision-contract.md`: tag, symbol, source evidence, normalized financial
facts, price-trigger bucket, technical state/levels, valuation-input hash, risk bucket
and factor-correctness bucket. Run cutoff, raw current price within the same bucket,
`evaluatedAt`, `lastEvaluatedAt`, `publishedAt`, `nextExpectedAt`, `contentAsOf`,
`noChangeMessage`, `analysisGeneratedAt` and derived decision IDs are absent. A source
timestamp remains material only where the predecessor contract explicitly places it in
a normalized financial-fact row. Material revision reasons are the predecessor's seven
closed per-member reasons and exist only when the corresponding member changes; the
initial migration revision records all seven because every member is newly established.

`stale_readonly` returns last-good research, marks it visibly stale and disables every
buy-like compatibility surface. It MUST retain the immutable decision envelope and
`decisionRevisionId`, exposing the prior action only as `lastKnownAction`.
`unavailable` returns a bounded typed empty/degraded projection and never crashes the
Landing page. Equal-precedence checksum disagreement remains fail-closed.

## DI-002 — Official point-in-time finance and valuation authority

The tracked worker acquires fixed-host TWSE/TPEx income and balance statements and
persists revenue, gross profit, operating income, non-operating income, pretax income,
tax, net income, attributable income, diluted EPS/derived diluted weighted shares,
cash, debt, assets, equity and book value with unit, period, source, publication,
collection and cutoff authority. Flow facts require four consecutive reported quarters;
one quarter cannot become TTM.

Basic EPS is never stored as `quarterly_diluted_eps` and can never derive diluted
weighted shares. Absence of the filing's explicit diluted-EPS field fails the diluted
bridge closed.

Current and historical exchange-reported PE/PB use official same-session close. Formal
relative authority requires 252 cutoff-visible sessions and at least eight same-session
canonical-sector peers. Instrument and sector membership always selects the newest
cutoff-eligible event before applying active/validity classification; an older active
event cannot reappear after an inactive or future superseding event. Candidate scenarios
are Bear/Base/Bull with source and as-of.
Candidate symbol, exchange and sector are exclusively the cutoff-resolved instrument
and taxonomy rows. Caller JSON cannot supply a default market, a peer observation must
match its selected instrument exchange, and any legacy `valuationInputs` member is
rejected rather than merged with database authority. Calendar consumers request one
explicit civil-date interval, enumerate at most 513 distinct session streams through
the market/session index, and fail on member 513 before resolving the at-most-512
streams; an unrelated older history scan or silent window truncation is forbidden.
NAV and EV histories select exactly one cutoff-visible metric fact as of each exchange
session; they never copy a latest-cutoff maximum backward. Readiness counts distinct
session identities, not observation revisions.
Conditional publication binds the current observation, the exact ascending 252-session
same-stock membership and the exact sorted same-session/same-exchange/same-sector peer
membership to `official-relative-pe-evidence-v1`. The four SHA-256 identities are the
current-observation root, history-membership root, sector-membership root and the root
of the complete tagged evidence preimage. Counts equal those exact memberships; they
are not lower bounds. At completion SQL reconstructs every member from the same
cutoff-resolved official plane supplied to the worker and compares both raw multiples,
both counts and all four roots. Rebinding only the decision/disclosure hashes cannot
authorize altered official evidence.
Positive-EPS general/cyclical/semiconductor candidates use normalized PE and, where
available, EV/EBITDA; financials use PB/ROE; asset cases use NAV; loss cases suppress PE
and use EV/Sales or EV/EBITDA. Conflict, missing units, future facts or insufficient
authority cannot publish a formal target. The 2337 one-quarter EPS 30.04 path is rejected.

## DI-003 — Constructible adjusted technical history

For at most four incomplete deep candidates per run, the tracked worker fetches seven
bounded monthly official raw OHLCV responses. It appends at most 800 raw observations
through the existing runner-only price authority. Raw rows are never presented as
adjusted rows in the same run.

For at most twenty missing exchange/session pairs per run, it queries all three fixed
official corporate-action feeds and appends one complete daily snapshot through the
existing authority RPC. The official TWSE reduction endpoint returns a blank CSV on a
valid zero-event date; therefore V3.13 replaces the unconstructible CSV-only adapter
rule with fixed-host, fixed-path, exact-session JSON. Success is only:

1. `OK` plus the exact feed-specific fields and complete rows; or
2. TWSE's exact typed `很抱歉，沒有符合條件的資料!` no-data terminal.

HTTP/schema/redirect/size/parse failure is unavailable, never zero events. Received
bytes, size and SHA-256 remain feed evidence; cross-feed duplicate symbols fail. The
database still recomputes event refs and the `tw-corporate-action-v3.1` snapshot hash.
Only the later cutoff-visible adjusted selector may produce the 122-session technical
history.

## DI-004 — One DecisionEnvelopeV313

The sole decision contract is:

```text
recommendationAuthority = formal | conditional_research | none
valuationReadiness = complete | relative_only | missing | stale | conflict
userAction = buy | accumulate | research_starter | wait_breakout |
             wait_reclaim | avoid_chase | avoid | unavailable
```

Formal `buy|accumulate` requires complete scenarios, Base upside at least 15%,
reward/risk at least 2 and passing quality/market/technical gates. `buy` requires
`breakout_confirmed`; `accumulate` requires `at_support`. `research_starter` requires
official 252-session and eight-peer relative discount of at least 15% plus passing
quality/market/technical gates, and is labeled research-sized rather than a formal
target. `below_support` is only `wait_reclaim`. Every long invalidation is below actual
entry. Known overvaluation, invalidation, negative reward/risk or conflict may be
`avoid`; missing facts are `unavailable`.

The envelope persists the unrounded threshold authority used to decide those gates.
Formal authority carries the raw Base target; conditional authority carries current
and reference multiples plus the exact history-session and peer counts. Runtime, Web
and SQL recompute thresholds from those inputs and never authorize an action from a
rounded display percentage or reward/risk. Exactly 15% and 2.0 pass; 14.99% and 1.999
fail even when their display values round up.

`entryPlan` is a closed discriminated union. `at_support` and `breakout_confirmed`
carry valid long geometry and no pending trigger. `breakout_pending` requires the
`breakout` trigger and valid long geometry. `below_support` and `reclaim_required`
require the `reclaim` trigger with null entry and invalidation; `extended` requires the
`pullback` trigger with null geometry; `invalidated` carries neither geometry nor
trigger. Numeric triggers, unknown kinds and every wrong state/kind pairing are
invalid in Runtime, Web and SQL. Missing quality or market authority may retain formal or conditional
valuation provenance, but its action is `unavailable` with a typed blocker and that
envelope remains persistable for explanation.

Legacy `newPositionAction` and `opportunityAction` are compatibility projections of
this envelope. They cannot run another heuristic.

## DI-005 — Source truth and conservation

Acquisition is distinct from analysis. A status-only call, touch or metadata upsert is
not a new acquisition. Exactly seventeen approved profiles each terminalize as
`fresh|unchanged|no_new_items|missing_endpoint|auth_failed|provider_failed`; every document reaches
`new_revision|unchanged|deferred|rejected` and later claim/entity stages retain typed
terminal outcomes. `fresh` requires at least one database-accepted authorized new
revision. `unchanged` requires at least one authorized unchanged revision and no
deferred row. `no_new_items` is the only successful zero-document terminal and never
claims a database revision. Any positive-document batch containing a deferred row
that is not already terminalized by provider/auth failure or `fresh` is
`provider_failed`; this includes all-deferred/rejected and mixed
`unchanged + deferred` batches. It is never `unchanged` or `no_new_items`.

At run creation, the database freezes every cutoff-visible active source identity for
the exact approved profile/source-key pair. Completion and append validation use only
that immutable run-owned authority set; an authority granted, revoked or renamed after
`source_cutoff` cannot change the occurrence or its retry. The append context is
database-owned and keyed by run, profile, source key, stable document, backend and
transaction, so an external caller cannot choose a historical cutoff. An equal-cutoff
authority conflict rolls back the run before any source revision or outcome can be
accepted.

The adapter emits exactly 51 typed connector attempts: one for each of the 17 approved
profiles and each of Threads, Podcast and YouTube. Each attempt is one of
`items_found|successful_empty|metadata_only|missing_endpoint|auth_failed|provider_failed`
and includes bounded response kind, HTTP status when present, response bytes, item
count and document count. `successful_empty` requires an observed 2xx response with
zero items and zero documents. SQL validates attempt/document/item conservation and
derives the profile terminal under a closed precedence; caller aggregate status or
reason is forbidden.

The adapter emits `accepted|deferred|rejected` for every selected document before the
database resolves accepted content to `new_revision|unchanged|deferred`. Bounded entity
overflow emits one explicit deferred terminal with its exact overflow count; no slice
may silently discard a selected entity.

Threads requires official Meta OAuth and an approved official search/profile endpoint.
Podcast accepts only creator RSS `<podcast:transcript>` content. YouTube accepts only
official Data API discovery and authorized captions/creator transcript. Metadata may be
shown as `metadata_only` but cannot supply a thesis. Entity linking requires official
TWSE/TPEx roster identity plus local stock/name context; naked years such as 2026 and
2019 do not link.

Cards retain source URL, profile/KOL, publication, collection and evaluation times.
Deduplication merges evidence instead of discarding later sources.

## DI-006 — Landing and detail information architecture

Landing owns three exclusive sections: `現在可行動`, `等待條件`, and `新來源待研究`.
The collapsed editorial card shows stock, authority/action, why it appeared, current
price, valuation range or relative band, trigger and invalidation. It contains no more
than six numeric values. Score, coverage/confidence, factor diagnostics, PE/BIAS/RSI and
source diagnostics remain in the disclosure layer. Missing data is `尚缺 N 項`.

Detail starts with one Decision Brief: action, authority, valuation/safety margin,
entry, invalidation, three thesis points, three risks and source dates. FULL is
authoritative even when its protected leaf is null; LIGHT may recursively fill only a
genuinely absent leaf and cannot replace valuation, decision, technical geometry or
provenance. Landing links carry `decisionRevisionId`; detail selects the same revision.
A null target displays its exact blocker and never “已反映”.

The user-approved V3.13 plan is also the acceptance-change authority for DI-004's
navigation semantics: when `decisionRevisionId` is absent, detail may select only the
current validated `DecisionEnvelopeV313` projection. It never falls back to an
independently calculated legacy action. The canonical JSON and Markdown inventory must
carry that identical sentence, and the exact DI-004 owner executes query parsing,
unique current-card selection, FULL/LIGHT authority and legacy-bypass rejection.

`decisionRevisionId` hashes the exact immutable disclosure card (including stock symbol,
displayed price/score/valuation/technical fields, complete DecisionEnvelope material,
the exactly supported Decision Brief and source provenance) after removing only the
identity field and evaluation-heartbeat leaves. Price-only movement does not rewrite the
analysis revision, but it does create a new disclosure decision revision so one ID can
never name two payloads. The worker supplies the exact canonical identity bundle; SQL
verifies its parsed preimage, SHA-256 and `decision-v3.13:<hash>` suffix before persistence.
A checksum-unique immutable decision row is persisted
at projection completion and detail performs an exact symbol+ID lookup; recent-projection
scanning is forbidden. Immutable decision material stores no projection heartbeat or
projection foreign key. Each evaluation heartbeat is append-only, carries a non-FK
projection UUID for audit only, is unique by decision revision and evaluation instant,
and rejects equal-instant correctness disagreement. Thesis/risk arrays contain exactly three cited
points or detail is typed unavailable—generic padding is forbidden. `stale_readonly`
classification happens before section placement and exact detail renders only a typed
readonly state plus `lastKnownAction`, never the historical buy action.

## DI-007 — Compatibility, bounds and rollout

Radar routes remain additive `legacy-radar-v3.13.0`, projection-only and at most 150 KB.
Homepage HTML remains at most 250 KB; warm p95 is at most 1.5 seconds, cold p95 at most
5 seconds and five parallel reads complete within 10 seconds. Sources/details paginate.
`/api/opportunity-v3` remains the exact disabled 404 and no public mutating endpoint is
added.

This amendment authorizes code, tests, immutable review evidence and a release
candidate. It does not authorize new V3.13 production migration, connector credentials,
tracked-runtime activation or source writes. Those require a new, exact production-
write authority after Code Gate. No LINE/dispatch/ranking promotion is in scope.
Evaluation governance remains honestly blocked until 120 point-in-time backtest dates,
20 elapsed live dates and the 252-attempt roster exist.

## Executable protected acceptance

The canonical `1.45.1` inventory contains 308 IDs: the 297 predecessor cases plus
first-class protected `DI-001..DI-011` owners. The V3.13 owners execute from
`scripts/opportunity-v3/v313-decision-integrity.test.mjs`, plus the
existing applied migration, product/runtime, legacy regression, Playwright and
performance suites. The eleven named semantic owners cover: eight actions/no quota;
four-quarter/2337 bridge; formal 252/eight-peer valuation; FULL/LIGHT authority;
calendar freshness; 17-profile transcript truth; official EPS/share derivation;
official close/raw OHLC geometry; naked-year rejection; corporate-action complete-empty
versus failure; and stale immutable decision identity. They belong to the counted
260-ID product/runtime partition. Any missing/skipped owner or
failed mandatory suite blocks Code Gate.
