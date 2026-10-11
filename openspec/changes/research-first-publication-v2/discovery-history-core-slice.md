# Discovery historical authority core — bounded implementation slice

## Purpose and exclusions

The approved three-stage plan needs real current-run relative returns and price
phase. Today the producer mixes historical authority with next-session execution
calendar. This slice extracts shared historical and raw-signal calculations only;
it does not enable discovery windows, change ranking/first-discovery, publish,
claim strategy effectiveness, acquire forward calendars, or alter formal entry.

## Contract

1. Add `loadTwEntryHistoricalAuthority(client, request, options)` backed by the
   same selected-head/action/price validation used by `loadTwEntryPlanAuthority`.
   Return 240 adjusted bars, selected completed calendar rows/sessions, price basis,
   actual participating evidence manifest and availableAt, dataset revision and
   gaps. No invented next session. Existing plan adapter still runs the same
   forwardCalendar check and keeps its existing source revision/hash/anchor output.
2. Shared authority core gains an optional AbortSignal and an overall 15-second
   deadline and 16-MiB serialized selected/read-row budget. Every page/query uses
   the shared signal; all parallel feed/event pages charge one shared byte meter.
   Paginated row limits remain, and response rows beyond the requested page fail.
   Explicit abort must not reuse a cached promise belonging to another signal;
   historical extraction bypasses the process-level shared cache. Existing calls
   retain their cache and contract; their new resource exhaustion fails closed.
   Abort stops query dispatch and races pending queries so a noncooperative mocked
   or provider query cannot keep the request open. Timers/listeners clean up.
3. Export a pure fixed-window `calculateTwEntryRawSignals(bars)` from the existing
   entry module; return existing MA/ATR/trend/resistance/support/volume baseline,
   threshold and two signals/reasons. Use exactly last240 bars, original Wilder
   seed, original prior20 (excluding current) and same tick threshold. Validate
   finite OHLCV/session sequence before calculation, no missing data coerced.
   `buildTwEntryPlans` consumes this helper after its unchanged full authority
   validation; its IDs, structure, entry/stop/expiry/formal/liquidity gates and
   existing output bytes remain identical for existing valid fixtures.
4. Historical core is server input, not independent proof or model input; exported
   data does not authenticate caller-provided rows. No public endpoint/database
   migration/receipt is added here. A follow-up independently reviewed current-only
   receipt/window adapter will preserve actual validatedAt separately from source
   cutoff and must not backfill first-discovery or alter Top20.

## Acceptance

- Existing authority/entry/monitor tests remain green and existing plan fixture
  outputs remain equal across extraction.
- Historical success without forward calendar; original full adapter still rejects
  the same request when forward authority is absent.
- TWSE and TPEX, selected price/action/calendar evidence clocks/hash bindings,
  missing action/feed/price/head conflict and future input fail as before.
- Shared abort before/during pending query, byte/page/global row caps and no query
  after abort. Independent calls do not inherit an aborted cached promise.
- Raw helper parity with full entry raw signals, exactly240 seed, extra older bars
  unchanged, current volume/high excluded from prior20, malformed/short input gaps.
- Type/lint/build and scoped independent review. These isolated fixtures are not
  production database completeness or deploy readiness.
