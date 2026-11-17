# TWSE dated daily price limits

Implement a private read-only replay in the existing launch pattern reader. The licensed CSV uses an explicit session and is checked against the declared date, column groups and same-security prices of TWSE's report. The binding requires known clocks and a matching completed-session selected bar. No price limit is derived from yesterday's close. The replay never grants ranking or publishing authority.

Taipei 2026-11-16, 23:16: across the 1,091 common four-digit rows, the undated CSV disagreed with November 16 on 1,053 current price-limit tuples and matched the November 17 CSV exactly. CSV and dated JSON agree for all November 16 current limits and references. The capture for 6614 reproduced 40.50 at every OHLC field with positive volume. The binder refused it at the already-passed 21:30 cutoff.

Next.js production build, TypeScript, targeted lint and 36 Node checks passed. The actual next pre-cutoff capture and production qualification stay open.

[Sanitized receipt](../../docs/operations/2026-11-16/vnext/t06-twse-date-bound-price-limit-replay.json)
