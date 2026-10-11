# Discovery price shadow enrichment handoff

Recorded 2026-10-05 Asia/Taipei; Node 22.14.0, Next 16.3.8, Linux Cloud.
Current branch `codex/discovery-price-supplements-oct05`, exact approved base
`23dffca8633f0ccfc799d45b47b4ad29dea54124` (not the root integration/main branch).
Final worker reply supplies the full pushed SHA. Source chat reports independent
APPROVE of this base (49/49), integration `d96649cee3aa6d05ce84a51a984b6a54b10142e9`
with 169 research tests and normal Mac lint/build. Those results are for the root
integration, not this new branch. This supplementary batch needs independent review.
Earlier enrichment base was `54edb2cdf04498914446229b451ee2d96810d3a4`;
review repairs on `8613458a57502e387f0569a4c499a2148b09a293` produced approved23dffca.

## Responsibility and behavior

Owned files only:

- `web/src/lib/research-discovery-evidence.ts` and new `.test.ts`.
- New `web/src/lib/research-discovery-price-enrichment.ts` and `.test.ts`.
- `web/src/app/api/internal/research-priority-run/route.ts` and new `route.contract.test.ts`.
- This handoff and `openspec/changes/research-discovery-price-enrichment-v1/{spec,plan,tasks}.md`.

No existing migration, protected runner, package/lockfile, source controller,
strategy parameter, unrelated file or production state is changed. No PR is
opened, branch merged, site published, schedule enabled or actual API run invoked.

The original selector creates the scores/Top20 queue first. Every candidate then
gets a `priceContext` in immutable run rows/input hash and response, plus a context
hash. Response now includes `inputHash`, price-enrichment bounds/accounting and
all symbol contexts. Price cannot silently affect ranking or authorize a trade.
The existing exact internal bearer remains required before every read; unknown
request/assessment fields reject, including model price contexts/verified flags.

An existing first-discovery record retains its original quote/gap and snapshot
hash at its own `first_seen_at`. No later quote query fills its gap. If registry
reads fail, the worker does not assume a new first discovery. Otherwise the new
read cutoff is earliest actual source `firstSeenAt`, not today's run time. Missing
discovery, admission/deadline, data/official failure all get explicit receipts.

The legacy capture omits provider, integrity and market validation evidence.
Its `priceStatus:official_quote` label is not verification. A safe time-valid raw
historical quote projects as `unverified_historical_raw`, with
`historical_raw_quote_unverified`; the snapshot bytes/hash stay unchanged. Even a
row rejected by the strict reader cannot become `official_raw_quote` merely by
appearing in the registry on a later run. No current quote query upgrades it.

The unchanged `capture_research_first_discoveries_v1` still freezes its own raw
quote/gap, null returns and unknown phase. Additional context lives in immutable
linked run rows. This batch does not rewrite the first-capture function/table or
backfill historical snapshots; any persistence extension belongs to root review.

## Current-run supplementary observations

Each immutable run evidence row and API priceContexts entry now has a separate
`supplementaryObservation` with its own `observationHash`. Existing `priceContext`,
first-seen time, frozen quote/status and snapshot/context hash remain unchanged for
retained first captures. Weak old raw quotes stay `unverified_historical_raw` even
when the new receipt has `official_raw_quote`. First missing remains missing.
The canonical capture still performs its separate DB lookup; an admission gap in
run context alone never proves that capture's quote is absent.

Selection finishes before read admission. Server queue order (up to general15 +
emerging5), then remaining actual queued/running research symbols in symbol order,
then eligible outside symbols in lexical order consume **32 total adapter calls**.
The active set comes from the existing server DB queue, not model inProgress.
Priority symbols may receive current reads without first discovery evidence.
All candidates have an explicit current receipt, including admission/deadline/data
failure. The32-call limit counts current and earlier-first reads together; a same-cutoff read is
reused, and any additional historical first read can only spend the remaining
budget after current admission. It never reuses a later-cutoff result as first data.
Frozen first records are not read again for historical context.

Current quote provenance must match candidate stock/market, known official provider,
valid integrity and collector URL. `publishedAt` is the persisted quote `as_of`
clock, not independently verified publication on a website; `observedAt` and
`availableAt` use persisted `available_at` (explicit
`observedClockBasis:persisted_available_at`), not a claim that this process read
it in the past. They satisfy completed close <= published <= observed <= available
<= run cutoff <= serverClock. serverClock is sampled by the actual server after
selection, never accepted from HTTP/model. Historical cutoff is retained unchanged.
`knowledgeScope:current_cutoff_only` says only cutoff-visible information; the
receipt does not assert first-discovery knowledge or a fresh source acquisition.
A read completing after the15-second deadline is discarded. Supplementary windows
are intentionally disabled even for a future adapter: returns remain null and
phase unknown in this batch. Only fixed existing DB surfaces are used.

The receipt, including serverClock, participates in the existing inputHash before
run insertion; no new table is needed. Consequently a later invocation with a new
serverClock makes a new immutable run/hash even with the same asOf and quotes.
The existing uniqueness/replay behavior still applies to identical full receipts;
this change does not claim same-request replay across different physical clocks.
No old run, snapshot or registry record is overwritten.

**Remaining fairness limitation:** outside the priority set, admission remains
lexical with no durable cursor/fair resume. Excess active research (>32 including
Top20) is also explicitly bounded. No claim that all candidates eventually get a
read, nor that every Top20 read succeeds when DB/calendar/deadline authority fails.
The goal addressed here is removing permanent first-missing as an obstacle to
subsequent Top20 current reads, while retaining that original missing knowledge.

## Available production source interface and remaining data gaps

The fixed read-only adapter uses existing service-side
`tw_trading_sessions_v3` and `official_price_history` with concrete selected fields,
cutoff filters for every knowledge clock, official provider/URL/exchange/integrity,
completed close and raw price availability validation. It selects only necessary
provenance scalars, not entire provider metadata. It does not fetch today's HTTP
data, call paid APIs or run arbitrary URLs. It returns actual raw quote/volume or
missing; raw quotes never become adjusted relative returns.

Calendar reads now select **one newest cutoff-visible session/head**, then query
only that session's exact `recorded_at` ties (<=124-row sentinel); 200+ older rows
do not consume this bound. Clock filters and AbortSignal apply to both queries.
Status/close are validated after head selection so a newer cancellation or changed
future close cannot resurrect an older completion. Same-time semantic conflicts
or an overfull tie set remain missing, not an arbitrary selected head.

URL contracts match the actual `tw-market.ts` collector constructor:
TWSE `STOCK_DAY` uses exactly `stockNo`, compact `date`, `response=json`; TPEx
`tradingStock` uses exactly `code`, slash-form `date`, `response=json`. Monthly
URLs must bind the candidate symbol and either its exact session or that month's
first day. TWSE `MI_INDEX` uses exact session date, `type=ALLBUT0999`, JSON response;
the selected DB row binds the symbol for that market-wide response. Duplicate,
missing/unknown parameters, wrong stock/month/day, market/host or credentials
reject. Parameterless APIs and legacy endpoint forms without this binding remain
outside the strict adapter; a frozen weak raw record may only remain unverified.

Bounds: <=5000 candidates/first rows, <=32 total current/historical read admissions,
<=15 seconds including registry IO, one calendar head plus <=124 head-tie rows
(sentinel rejects), <=2
quote rows, <=8 MB first-registry JSON, <=64 KB per calendar/quote JSON, AbortSignal
on queries. All candidates remain accounted even when not admitted. Decoded-response
size validation does not claim a new streaming database transfer bound.

The server-only approved-window interface requires stock, benchmark and completed
calendar on exactly the same 61 sessions, cutoff-visible row clocks, latest session,
company-action-adjusted price basis, an actual official validation record/hash and
dataset binding. Existing `read_legacy_candidate_fact_plane_v3_11` benchmark tuples
contain session/value/reference but omit required per-row availability/validation;
they are not silently marked verified. The production raw reader returns
`aligned_benchmark_adapter_unavailable`, `adjusted_history_adapter_unavailable`,
plus explicit validation/basis/window/phase gaps. Thus **production relative returns
remain null and price phase unknown** until an approved full adapter is connected.
No current adapter issues the pure evaluator's synthetic verification receipts.

The new enrichment always requires a complete aligned 61-session window for every
5/20/60 return. Formula is `(stock_end/stock_start)/(benchmark_end/benchmark_start)-1`.
The standalone helper retains its preexisting shorter-window calling contract for
other consumers; the full-window evaluator invokes `requireComplete61:true`; the raw-only
supplement never supplies a window.
Missing benchmarks, actions, official validation or latest session are unknown,
never a statement that price has not risen. No calendar-day interpolation occurs.

The completed ledger alone cannot rule out a later missing session or holiday.
Unless latest completion equals the cutoff's Taipei civil date, freshness stays
unverified, including holiday/weekend cases. The raw quote can still be shown with
its exact recorded session, but does not certify the latest completed session.
Full cutoff-visible schedule/holiday evidence is a remaining adapter responsibility.

Phase requires session/dataset/time/ruleset-bound existing breakout/pullback
metadata. It preserves RSI>=75 or close>MA20+2ATR overheat predicates, rejects RSI
outside 0–100 and missing/conflicting trigger metadata, and adds no strategy rule.
A confirmed initial breakout still states `researchEvidenceRequired:true`; it is
not proof that research is qualified or a buy is approved.

## Validation and reproducibility

61 named cases executed: all approved **49** plus **12 supplementary regressions**;
61 pass,0 fail,0 skip. Inventory: DE01–DE07 (7), DP01–DP24 (24), DS01–DS07 (7),
DR01–DR10 (10 actual-route cases), existing priority/source-extension regressions (13).
DS01 weak/missing immutable first beside verified current; DS02 lexical-rear priority
and32/all45 accounting; DS03 future clock/session/provenance rejection; DS04 registry
failure does not block independent current observation; DS05 shared historical/current
budget and no backward leakage; DS06 invalid server clock/priority and deadline;
DS07 late read discard. DR06–DR10 execute the actual route with synthetic DB query
filters: retained first/current coexistence, changed supplementary evidence hash
without ranking change, actual general15/emerging5 Top20 first admission, later
as_of/available_at exclusion, and DB active priority without model promotion.
All existing DE/DP/DR01–05 and13 regressions stay passing. These are synthetic
controlled DB reads, not actual official/production acquisition receipts.

```sh
node scripts/run-node22.js --experimental-strip-types --test \
  web/src/lib/research-discovery-evidence.test.ts \
  web/src/lib/research-discovery-price-enrichment.test.ts \
  web/src/app/api/internal/research-priority-run/route.contract.test.ts \
  web/src/lib/research-agent-priority.test.ts \
  web/src/lib/research-source-extensions.test.ts
cd web
npm run typecheck
npm run lint
DATA_MODE=demo RADAR_PUBLIC_SNAPSHOTS_ENABLED=disabled NEXT_TELEMETRY_DISABLED=1 npm run build -- --webpack
```

Full lint: zero errors, 33 unchanged baseline warnings.
Full tsc/build acceptance is **not passed**. This batch's webpack compilation
succeeded in6.6s, then reports the two existing generated-route export errors.
The earlier batch's default Turbopack run could not bind its internal processing
port (`EPERM`); this batch used webpack. Errors:
`app/layout.tsx` exports `CANONICAL_APP_URL`; `app/opportunity-v3/page.tsx` exports
`OpportunityV3Page`. The same errors were reproduced in the earlier pristine
`3b448b...` archive; both route files and web dependency locks are unchanged at
this exact `54edb2c...` base. Current tsc reports those same two errors and no owned
file errors. Root owns any unrelated route corrections.

Local logs retained outside the checkout:
`/workspace/discovery-price-supplements-tests.log`,
`/workspace/discovery-price-supplements-typecheck.log`,
`/workspace/discovery-price-supplements-lint.log`,
`/workspace/discovery-price-supplements-build.log`.

## Actual acquisition and independent review

**No live official price/database acquisition was performed in this batch.**
Successful complete-window and DB raw-quote cases are clearly synthetic fixtures.
No production credentials were obtained/read, and no network restriction was
bypassed. Live official/DB acquisition, approved full benchmark/action/calendar/
validation/phase adapters, release build and independent root integration remain
open. This branch is implementation evidence, not full live acceptance.

Prior artifacts stay unchanged:
Cloud acceptance receipt SHA256
`84fd8a78a4a7703cd0cd0e569016242a4d228d8e545b5359c35417bde384b008`;
Cloud source-failure receipt SHA256
`de8ab765fe736a0015ae4da675eea2b2c2a35b63463e5c1bd9b33c83e6b9f3b6`.
Source chat reports its separate Mac controller canary (four HTTP200, two bodies,
two metadata, zero summaries). Those are source-controller evidence, not price-
enrichment evidence, and do not replace the retained Cloud failures.
