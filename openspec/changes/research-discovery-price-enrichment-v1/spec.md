# Discovery price shadow enrichment v1

Base `54edb2cdf04498914446229b451ee2d96810d3a4`, branch
`codex/discovery-price-enrichment-oct05`. This is the delegated isolated batch,
not strategy approval or independent release review.

## Result and authority

Every official candidate already accounted by `research-priority-run` receives a
`priceContext` in immutable evidence rows, input hash and response. The original
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

The fixed production adapter reads only `tw_trading_sessions_v3` and
`official_price_history`, with cutoff-visible source/collection/recording clocks,
official provider/path/market/integrity checks and price availability after the
completed calendar close. Tied latest calendar heads must agree. Missing volume
does not manufacture volume. Raw quotes are not adjusted returns.

Admission is deterministic symbol order, independent of selection: <=5000
candidates/retained records, <=32 new reads, <=15 seconds including registry IO,
124 calendar rows (sentinel rejects truncation), two quote rows, <=8 MB registry
JSON and <=64 KB per calendar/quote response, AbortSignal on every query. Every
candidate still receives a result when admission, time, authority or IO fails.
Response limits are validated on decoded DB responses, not a new streaming DB
transport guarantee. No concurrent request can mutate this reader's input.

Completed rows alone cannot prove a later absent session/holiday. Unless the
latest ledger completion is on the cutoff's Taipei civil date, the production
adapter marks latest-session freshness unverified; it does not infer a weekend,
holiday or missing scheduled day. The raw quote retains its exact session.

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
| DR01 | Actual route exact-bearer rejection before DB reads |
| DR02 | HTTP/model price-context/verified-flag injection rejected |
| DR03 | All price contexts stored/hashed/returned with unchanged queue |
| DR04 | Price changes hash, not scores/nonempty queue |
| DR05 | Impossible cutoff rejects before acquisitions |

DE tests: `web/src/lib/research-discovery-evidence.test.ts`.
DP tests: `web/src/lib/research-discovery-price-enrichment.test.ts`.
DR tests: `web/src/app/api/internal/research-priority-run/route.contract.test.ts`
execute the actual transpiled route with synthetic controlled dependencies.
Existing source-extension/priority/root checks are separate regression cases.
Actual official DB/live acquisition, full build and independent integration are
separate gates; synthetic cases cannot satisfy them.
