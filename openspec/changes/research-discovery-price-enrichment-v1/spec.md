# Discovery price shadow enrichment v1

Supplement batch base `23dffca8633f0ccfc799d45b47b4ad29dea54124`, branch
`codex/discovery-price-supplements-oct05`, after independent APPROVE of the49-case
repair. Earlier enrichment base was `54edb2cdf04498914446229b451ee2d96810d3a4`.
This is the delegated isolated batch,
not strategy approval or independent release review.

## Result and authority

Every official candidate already accounted by `research-priority-run` receives a
`priceContext` and independent `supplementaryObservation` in immutable evidence
rows, input hash and response. The original
selector runs before enrichment; its scores, Top20 queue and lane rules remain
unchanged. Price phase is a research observation, never research qualification,
entry permission, a prediction or a claim that the price has not risen.

The endpoint retains `requireExactInternalBearer` before any read. JSON/model
requests cannot provide windows, price contexts or arbitrary verified flags.
Only existing request/assessment fields are accepted. There is no new public
read endpoint, source URL dispatcher, paid API, live backfill or scheduler.

## First observation and bounded reads

Read the immutable first-discovery registry at `asOf`. If an existing record is
present, project its frozen quote/gap at `first_seen_at`, preserving its snapshot
hash. Do not re-read newer data to fill or overwrite that gap. If the registry is
unreadable, do not guess that no prior capture exists. Invalid records remain
explicitly missing. New observations read only at `firstSeenAt`, not today's
`asOf`. A missing discovery/source gets an explicit missing context.

Legacy first capture omits provider/integrity/market verification. Its existing
`official_quote` label cannot authorize a verified projection. A safe historical
raw price remains `unverified_historical_raw`; no later registry read promotes a
row previously rejected by the strict reader. Preserve the original snapshot hash.
If first capture is missing after bounded admission/acquisition, that first-known
gap remains frozen. Separate supplementary research receipts for later knowledge
are implemented only in each new priority-run evidence row; no later data may
rewrite the original discovery.

The fixed production adapter reads only `tw_trading_sessions_v3` and
`official_price_history`, with cutoff-visible source/collection/recording clocks,
official provider/path/market/integrity checks and price availability after the
completed calendar close. Tied latest calendar heads must agree. Missing volume
does not manufacture volume. Raw quotes are not adjusted returns.

Read one latest cutoff-visible calendar session/head first, then query that
session's exact recorded-time ties only. Do not apply an all-history limit that
normal accumulated history always exhausts. Validate status/close after selecting
the newest head: newer cancellation or close correction cannot resurrect an old
completion. Same-time semantic conflict or excessive ties still fail closed.

Strict URL validation matches collector endpoints: TWSE monthly STOCK_DAY has
exact stockNo/date/response keys; TPEx tradingStock has exact code/date/response
keys and YYYY/MM/DD date syntax. Bind stock and date (session or month-start for
monthly data); daily TWSE MI_INDEX requires exact session/type=ALLBUT0999/JSON.
Duplicate, missing/extra keys, wrong stock/date/market/host or credentials reject.
Unsupported parameterless/legacy endpoints cannot issue verified quote results.

Current admission occurs after selection: server queue order, then remaining DB
active research symbols in symbol order, then eligible outside symbols lexically.
The32 total read budget includes current and new historical-first queries. A
same-cutoff result may be reused; a later-cutoff read may never fill an earlier
first context. Retained first context is never re-read or promoted. The original
selector/Top20 receives no price input. Bounds: <=5000
candidates/retained records, <=32 new reads, <=15 seconds including registry IO,
one calendar head and 124 head-tie rows (sentinel rejects truncation), two quote rows, <=8 MB registry
JSON and <=64 KB per calendar/quote response, AbortSignal on every query. Every
candidate still receives a result when admission, time, authority or IO fails.
Response limits are validated on decoded DB responses, not a new streaming DB
transport guarantee. No concurrent request can mutate this reader's input.

Completed rows alone cannot prove a later absent session/holiday. Unless the
latest ledger completion is on the cutoff's Taipei civil date, the production
adapter marks latest-session freshness unverified; it does not infer a weekend,
holiday or missing scheduled day. The raw quote retains its exact session.

## Independent current knowledge receipt

Every candidate has a current receipt even if first capture is missing, weak or
unreadable. Queue/active priority is passed by the server only after the existing
selector finishes. Model/API prioritySymbols, supplementaryObservation, price
contexts, serverClock and arbitrary verification flags are rejected. Model
inProgress does not control the actual DB active set. Missing evidence outside
priority, excess32, deadlines and source failures are explicit missing reasons.

Store origin=current_run_observation, knowledgeScope=current_cutoff_only, cutoff,
serverClock, attempted, quote/provenance/status/gaps and observationHash in the same
immutable evidence row beside the first priceContext. Bind the stock/market,
provider/integrity and endpoint contract. Quote as_of supplies publishedAt;
available_at supplies observedAt/availableAt with explicit
observedClockBasis=persisted_available_at. This is a persisted clock contract,
not independent website publication evidence or proof of historical process reads.
Completed close <= published <= observed <= available <= asOf <= actual serverClock.
Future source clocks/session or mismatched provenance cannot verify a quote.
The15-second AbortSignal budget covers registry and adapter queries; discard reads
that finish too late. Current windows are disabled; relative returns and phase
remain null/unknown regardless of optional adapter window contents.

The new receipt and hash participate in existing priority inputHash. A later
physical serverClock creates a new immutable receipt/run, not same-request replay
across invocations. No new table, RPC or migration is introduced. Never alter
firstSeenAt/firstPrice, frozen status or snapshot/context hash of retained first
knowledge. Verified current knowledge does not promote weak old knowledge.
Outside priority admission remains lexical without durable fair resume. More than
32 active/Top20 symbols or a failed deadline/source can still leave missing current
observations; do not claim all candidates were read or all platforms activated.

## Relative returns and phase

Enrichment requires the same complete **61 official trading sessions** for stock,
benchmark and calendar. Each bar, calendar close/availability, corporate-action
price basis and actual official-validation record must be known at cutoff and
time-consistent. Dataset hashes bind those inputs. Ratios are
`(stock_end / stock_start) / (benchmark_end / benchmark_start) - 1`, with 5/20/60
session differences, never civil days or interpolated data. Any incomplete,
misaligned, future, failed or unverified required input makes returns unknown.
The legacy standalone helper keeps its shorter-window call contract; this new
enrichment always invokes its strict `requireComplete61` path.

The approved server-adapter contract includes actual validation record/evidence
hash, recorded time and dataset binding, not an HTTP boolean. A hash does not
independently prove official acquisition. The production raw-quote adapter
cannot issue these records. The current legacy fact-plane RPC's benchmark tuples
omit per-row availability/validation, so that RPC is not promoted into a complete
window. Adjusted-history, aligned-benchmark and phase-metadata adapters remain
explicitly unavailable; production returns/phase stay null/unknown until connected.

Phase metadata must bind the same session, dataset and existing entry ruleset,
and be available after validation and before cutoff. Reuse existing overheat
predicates (RSI >=75 or close >MA20+2ATR), and already confirmed breakout/pullback
metadata. RSI outside 0–100, absent metadata or conflicting triggers are unknown;
no new strategy threshold is introduced. Established breakout still requires
independent research evidence. Future sessions/availability, impossible civil
dates, timezone-free/24-hour clocks and invalid prices reject.

The canonical existing first-capture RPC is unchanged: it still freezes raw
quote/gap and null returns/unknown phase. This batch stores additional shadow
context in its immutable linked run; it does not upgrade old first snapshots or
alter the capture migration.

## Executable inventory

Each new ID maps to one non-skipped named `test()` case:

| IDs | Tests / acceptance |
|---|---|
| DE01 | Holiday short week: exact 5/20/60 session ratios |
| DE02 | Strict 61-window rejects incomplete/misaligned benchmark |
| DE03 | Real civil dates and explicit valid clock/timezone |
| DE04 | Future session/availability or pre-session availability rejects |
| DE05 | Invalid RSI, official failure, missing/conflicting triggers |
| DE06 | Existing overheating predicates outrank triggers |
| DE07 | Confirmed breakout/pullback/waiting remain research phases |
| DP01 | Synthetic approved-window calculation does not grant eligibility |
| DP02 | Misaligned benchmark, incomplete calendar or stale latest session |
| DP03 | Future sessions/availability/validation clocks fail closed |
| DP04 | Missing quote/actions or failed official validation |
| DP05 | Missing/future/wrong-rule phase metadata stays unknown |
| DP06 | Overheat, pullback and RSI invalidity |
| DP07 | Immutable original quote/gap survives later reads/firstSeen changes |
| DP08 | Success/failure/missing discovery each accounts one symbol |
| DP09 | Sorted bounded admission retains full symbol accounting |
| DP10 | Registry failure/deadline cannot fabricate a new first capture |
| DP11 | Fixed cutoff-bound raw quote reader; unavailable adapters visible |
| DP12 | Official conflicts, future quote availability and hostile URL |
| DP13 | No guessed holiday/weekend latest-session authority |
| DP14 | Calendar head conflicts and invalid clock sequence |
| DP15 | Exchange/provider/integrity conflicts |
| DP16 | Row before actual close fails even with rehashed dataset |
| DP17 | Invalid/future immutable capture is never replaced |
| DP18 | Registry sentinel bound returns complete missing accounting |
| DP19 | 124+ ordinary calendar history still admits latest session/head |
| DP20 | Latest-head conflicts, cancellation and bounded same-time ties |
| DP21 | Actual TWSE/TPEx collector URL constructors admitted |
| DP22 | Endpoint-specific stock/date/parameter/host mismatch rejection |
| DP23 | Strict rejected row remains unverified after legacy capture |
| DP24 | Immutable missing capture persists through later admission/data |
| DR01 | Actual route exact-bearer rejection before DB reads |
| DR02 | HTTP/model price-context/verified-flag injection rejected |
| DR03 | All price contexts stored/hashed/returned with unchanged queue |
| DR04 | Price changes hash, not scores/nonempty queue |
| DR05 | Impossible cutoff rejects before acquisitions |
| DS01 | Weak/missing first and current verified quote coexist without promotion |
| DS02 | Lexical-rear priority first32 and full45 candidate accounting |
| DS03 | Future source clocks/session and weak/mismatched provenance reject |
| DS04 | Registry failure cannot erase independent current priority read |
| DS05 | Shared32 historical/current budget; no later data enters first cutoff |
| DS06 | Invalid server clock/priority and deadline fail visibly |
| DS07 | Late completed read discarded from current and first receipts |
| DR06 | Actual route first immutable beside current verified raw |
| DR07 | Supplement changes inputHash, not first context, score or queue |
| DR08 | Actual server Top20 admission ahead of outside lexical candidates |
| DR09 | Actual DB predicates exclude later published/available rows |
| DR10 | DB active research priority, not model inProgress promotion |

DE tests: `web/src/lib/research-discovery-evidence.test.ts`.
DP/DS tests: `web/src/lib/research-discovery-price-enrichment.test.ts`.
DR tests: `web/src/app/api/internal/research-priority-run/route.contract.test.ts`
execute the actual transpiled route with synthetic controlled dependencies.
Existing source-extension/priority checks are separate regression cases.
Actual official DB/live acquisition, full build and independent integration are
separate gates; synthetic cases cannot satisfy them.
