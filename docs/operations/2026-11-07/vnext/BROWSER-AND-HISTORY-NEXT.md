# Browser and chart checkpoint — 2026-11-07

## Same-VM browser is now usable

Read-only checks on this same selected VM found an installed Debian Chromium. This is a new observation; it does not rewrite the prior missing-binary/official-download403 failure.

- `/usr/bin/chromium`: SHA256 `2c8d32d29dc6781c35ae196ea83299d507ac88fc339301abe74672feda299779`.
- Actual ELF `/usr/lib/chromium/chromium`: SHA256 `d387400aaf740ccb75e5e996a34aa0940e6e97683a4eabd6ae34c1eed6804723`.
- `dpkg-query` reports `chromium`, `chromium-common`, `chromium-sandbox` version `151.0.7922.173-1~deb13u1`, installed.
- `/usr/bin/chromium --version`: `Chromium 151.0.7922.173 built on Debian GNU/Linux 13 (trixie)`.
- Existing repository Playwright, pinned Node22.14, explicit `executablePath:'/usr/bin/chromium'`, headless launch and an in-memory local HTML page: PASS. Browser closed in `finally`. This proves local launch capability only, not desktop/mobile application acceptance, screenshot review or real-source acquisition.

No browser/package download, system install, credential file read, remote-desktop/Mac action or network policy mutation occurred. The apt archives directory has no cached `.deb` files. The incomplete project-local Playwright download directory is not used as a trusted binary.

An additional network draft is not required for this installed-browser path. If a future supported check requires the exact Playwright-managed revision, propose only the official hostname `cdn.playwright.dev`, preserving every existing configured domain/preset. The observed denied official URL was the Chrome Headless Shell145.0.7632.6 linux64 archive. Do not propose wildcards, alternate download mirrors, tunnels or credential domains. The current tool catalog exposes environment_status but no request_changes/draft mutation tool. In that case the owner must add the exact hostname in supported environment settings and actually Save/Publish as applicable; a text proposal alone is not an applied network change. Refresh status for the same environment and require observations_current=true, desired/observed revision match and network_policy=enforced before one fresh official download. Add any redirect hostname only after an observed supported redirect and separate narrow review; never silently broaden access. No such change or download was attempted in this checkpoint.

## Bounded chart product change

`StockChart` previously grouped fallback weekly/monthly data into arbitrary five/21-row chunks. The new pure calendar helper groups supplied sessions by Monday-start Taiwan calendar week, calendar month, quarter, half-year and year. `BusinessDay`/strict YYYY-MM-DD labels remain session dates; numeric epoch timestamps use Asia/Taipei. It retains observed first-open/max-high/min-low/last-close and sums optional volume only when every component provides volume. Missing volume is null, known zero remains zero.

Fallback output dates are the actual last supplied session, never synthetic month ends. The helper rejects invalid/conflicting OHLC/date/volume and future sessions relative to a supplied cutoff. It copies output data/source-date metadata rather than sharing mutable input. Historical periods are only closed in calendar time; no official-session coverage, suspension, listing age, split adjustment or company-action terms are inferred. On selecting fallback week/month, the UI labels the current period provisional and explicitly states that historical periods need not have complete transaction-day data. Supplied server timeframeCharts retain their existing path; this patch cannot certify their aggregation semantics.

This slice does not alter raw prices, source/corporate-action revisions or existing240/1320/520 gates. The original `candidate-history-backfill` supports1320 official sessions and bounded month work; `dailyCandidatePrices` currently exposes only260 daily rows while its monthly projection carries60 months. The existing main domain still builds supplied timeframes with five/21/63/126/252-row chunks. Thus this bounded fallback fix is not the complete three-calendar-year-plus-warmup/volume/history integration. A next reviewed integration must pass actual daily OHLCV and source/action lineage into the same calendar helper, preserve enough warmup, publish explicit coverage gaps and use the active-admission ledger before acquisition. It must not invoke backfill from public GET or relax the existing gates.

## Checks and retained first failures

Focused synthetic helper suite:6PASS,0FAIL,0skip. Cases cover week/month/year boundaries, holiday/missing-row grouping, knownzero/null volume, Taiwan midnight/leap-day dates, period provisional status, conflicting duplicate prices/volume, invalid bars, future sessions, no input mutation and calendar quarter/half-year/year boundaries. These are engineering fixtures, not real trading-session acceptance.

The first lint invocation from repository root failed because the config is in web/. The corrected-cwd lint then found the initial setState-in-effect implementation. The source was substantively repaired to capture the cutoff in the existing timeframe-selection event, without disabling any lint rule. Final lint/types and build evidence must bind the final source commit; no database/native HOLD was retried here.

## Independent review follow-up

Reviewer found an inherited supplied-timeframe branch would display daily bars when weekly/monthly data was empty. This has now been repaired: a missing selected non-daily timeframe remains empty with a matching period-specific gap message; only daily may use the original daily fallback. A seventh focused negative tests all five missing non-daily periods despite available daily bars. Supplied weekly/monthly series now explicitly display that completion/transaction-day coverage metadata was not provided; the UI does not infer completeness from their presence. This does not certify or rewrite supplied historical aggregation.
