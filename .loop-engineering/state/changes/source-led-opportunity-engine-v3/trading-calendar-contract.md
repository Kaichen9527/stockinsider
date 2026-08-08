# Taiwan Trading Calendar Authority Contract

Version: `tw-trading-calendar-v3.4`

This contract is the sole point-in-time authority for the words “completed Taiwan trading session” in V3. A weekday calculation, runtime holiday package, current provider calendar, price-presence inference or legacy date list is forbidden.

## Immutable market-session streams

One append-only authority stream has identity `(market,sessionId)`, where market is `TWSE|TPEX` and `sessionId` is the Asia/Taipei civil date. Its exact row is:

```text
[sessionAuthorityId,sessionId,market,openAt,closeAt,status,provider,
 sourceTimestamp,collectedAt,sourceRef,recordedAt]
```

Provider is exactly `twse` for `TWSE` and `tpex` for `TPEX`. Open/close are real ISO instants on the stated Asia/Taipei date with `openAt < closeAt`; source/collection time obey `sourceTimestamp <= collectedAt <= recordedAt`. Source ref is opaque and 1..120 characters. Status is `completed|cancelled`. A completed event can become effective only at a cutoff at/after its close; a cancelled event may become effective before the scheduled close. Caller-supplied UUID/recorded time is forbidden.

`append_trading_session_v3` locks the stream, captures one database `recordedAt`, and appends a generated lowercase UUID event. An exact duplicate semantic payload in that stream is idempotent and returns the retained ID/time. A correction, cancellation or reactivation is a new event; no row is updated. The input provider/market/timestamp/date mismatch fails before session/audit insertion.

At cutoff C, first keep rows with `sourceTimestamp <= C`, `collectedAt <= C` and database `recordedAt <= C`. Per stream choose greatest `recordedAt`. Equal-time rows collapse only when every semantic member other than ID/recorded time is byte-equal, retaining lowest UUID; a differing tie is `authority_revision_conflict` for the consuming run and cannot be hidden by provider/source-ref order. The selected latest event alone owns status, so cancellation never revives an older completed row and reactivation requires a later completed event.

The selector reads at most 1,025 stream events after the indexed cutoff filter. The 1,025th event fails `bound_violation`; it never truncates. In addition to indexes owned by the primary-key and byte-semantic unique constraints, the table has exactly these three non-constraint supporting indexes: `(market,session_id,recorded_at DESC,session_authority_id)`, `(recorded_at,market,session_id)` and `(status,close_at DESC,recorded_at)`. `storage-schema-contract.md` names the same three supporting shapes; no additional non-constraint index and no alternate market-leading close index exists. Catalog acceptance joins `pg_index`/`pg_constraint`, excludes `indisprimary` and every index backing a constraint, then compares these three column/direction sequences byte-for-byte. Unique semantic identity prevents byte-identical duplicate appends from creating two retained events.

## One composite Taiwan session

Resolve TWSE and TPEx streams independently at the same cutoff. A date is `effective_completed` exactly when both latest events are `completed` and have byte-equal `openAt` and `closeAt`. Either missing/cancelled side makes the date non-completed; differing completed schedules are `authority_revision_conflict`, not a selectable date. A later cancelled date is not a reason to discard an earlier legitimately completed date when asking for the greatest completed session, but that cancelled date is retained in the bounded terminal calendar evidence and can later be reactivated only by a newer completed event.

The exact composite tuple is:

```text
[sessionId,openAt,closeAt,
 [twseAuthorityId,twseSourceTimestamp,twseCollectedAt,twseSourceRef,twseRecordedAt],
 [tpexAuthorityId,tpexSourceTimestamp,tpexCollectedAt,tpexSourceRef,tpexRecordedAt]]
```

`taiwanSessionAuthorityHash = SHA256(UTF8(RFC8785(["tw-trading-session-v3.0",compositeTuple])))`. Completed sessions order by `sessionId` ascending; an immediately previous/next session means adjacency in that exact completed list. A consumer names its required newest/oldest session or exact offset count and selects only that bounded interval; unrelated older database history is never part of its sentinel. One requested window may contain at most 512 composite sessions and has `tradingCalendarWindowHash = SHA256(UTF8(RFC8785(["tw-trading-calendar-window-v3.0",sourceCutoff,orderedCompositeTuples])))`. Query the requested interval with limit 513; a required 513th member fails `bound_violation`, while the mere existence of older sessions outside the requested interval does not. A correction changes the applicable session/window hash but never mutates an already sealed manifest or result.

For enrich planning, take the one-through-five newest completed members in descending session order after resolving the same bounded window. `recentSessionPlanHash = SHA256(UTF8(RFC8785(["tw-recent-session-plan-v3.0",sourceCutoff,[[ordinal,sessionId,taiwanSessionAuthorityHash],...]])))`; ordinal starts at zero and the array length is exactly `min(5,completedSessionCount)`. Every mover root in the plan carries the same hash. Zero completed sessions is `provider_unavailable` before any mover header.

The migration creates security-invoker barrier view `opportunity_effective_taiwan_sessions_v3(session_id,open_at,close_at,taiwan_session_authority_hash,canonical_cutoff)`. For each candidate civil date it first derives `canonical_cutoff` as exactly `16:00:00 Asia/Taipei` on `session_id`, rejects the row unless that instant is `<=` the one database statement timestamp, and then applies the resolver with `C=canonical_cutoff`—never with statement time. It includes the row only when that at-own-cutoff resolution is `effective_completed`; a cancellation, correction or reactivation recorded after its own cutoff cannot enter it. The cron query requests `session_id DESC LIMIT 1`; before today's 16:00 boundary the view cannot expose today's row. A conflicting tie at the row's cutoff raises integrity failure rather than falling back.

The view is used solely by the cron control read. `begin_opportunity_run_v3` receives the selected row's hash as a non-request, server-owned nullable argument, re-resolves the greatest completed session at the exact supplied source cutoff inside the begin transaction, and rejects `calendar_authority_mismatch` before any durable write unless its cutoff/hash match the selected view row. Ad-hoc POST passes null and receives no cron assertion. Historical consumers execute the same resolver inside their owner RPC at their explicit source cutoff; they never use statement-time current authority. The view and storage schema expose exactly these five columns; exchange-specific authority IDs remain inside the hash-bound resolver tuple and are available only to owner-RPC historical selectors.

## Required downstream bindings

Every consumer applies the resolver at its own source/evaluation cutoff and stores hashes, never a naked inferred date:

- `mover_price_reference` header stores `auditedSessionAuthorityHash`, `previousSessionAuthorityHash` and the ordered one-through-five `recentSessionPlanHash`; every included/excluded row's dates must match those hashes.
- Mover audit header stores audited/previous session authority hashes; `auditWindowClosesAt` is the bound composite close plus exactly 72 hours.
- Factor, sector-scoring, market-reference and sector-benchmark headers store the exact `tradingCalendarWindowHash` covering every session their formulas consume. A sector benchmark additionally stores `entrySessionAuthorityHash`; each session-conservation row carries that session's authority hash.
- Outcome-input included/excluded rows carry entry and maturity session authority hashes or null alongside nullable dates. `opportunity_outcomes` stores both non-null hashes.
- Evaluation `attempt_roster` carries each trading-date authority hash; backtest/live/cohort rows carry entry and maturity authority hashes. The evaluation header stores the one 252-session `tradingCalendarWindowHash`.

Raw-price observations and complete corporate-action snapshots each store the exact `sessionAuthorityId` for their exchange and date. The append RPC requires that referenced market-session event match exchange/date and was cutoff-current when the authority was accepted; a later calendar correction requires newly bound raw-price and action-snapshot evidence before a later consumer can use it. Raw-price exchange/provider tiers, the three official action-feed identities per exchange, immutable complete daily snapshots and trusted adjusted-price derivation are closed separately by the byte-exact 313-byte `market-price-provider-allowlist-v3.1` preimage and its `priceProviderAllowlistHash` in `market-contract.md`; TWSE/TPEX raw owner/fallback and action-owner mappings cannot be inferred from the broader market enum. A market observation with non-null `sessionId` likewise requires a matching `sessionAuthorityId`; both are null together for non-session facts. `TAIEX|TWSE_ACTIVE_COMMON` require the TWSE member; `OTC|TPEX_ACTIVE_COMMON` require the TPEx member; `TAIFEX|SOX|NASDAQ|USD_TWD` have null session fields and their freshness is resolved from `observed_at` against the applicable calendar; `TW_ACTIVE_COMMON` is derived/output-only. This fact/scope mapping is closed by the byte-exact `market-provider-v3.2` preimage in `market-contract.md`; no other fact/scope pairing is valid. Thus a raw price, corporate-action snapshot or market row from a cancelled/superseded session cannot silently authorize a later manifest.

`tw-trading-calendar-v3.4` is a static comparison-contract member; applicable point-in-time session/window hashes are final logical-key/manifest members but not comparison-key members. Executable fixtures cover each market at C-1/C/C+1, missing peers, byte-equal and differing recorded-time ties, competing source refs, completed-to-cancelled-to-completed transitions, mismatched TWSE/TPEx schedules, the 512/513 window bound and propagation through mover, audit, outcome and evaluation identities. They also freeze statement time before/equal/after 16:00, append cancellation/reactivation before/equal/after that row's cutoff, and prove current-view cutoff/hash, begin revalidation and every downstream historical resolver are byte-identical for the run while later-cutoff runs may bind later corrections without rewriting prior results. Migration acceptance excludes constraint-backed indexes, compares all three supporting-index column orders/directions byte-for-byte and proves the bounded resolver uses an indexed plan.
