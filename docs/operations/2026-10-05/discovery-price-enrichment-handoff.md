# Discovery price shadow enrichment handoff

Recorded 2026-10-05 Asia/Taipei; Node 22.14.0, Next 16.3.8, Linux Cloud.
Branch `codex/discovery-price-enrichment-oct05`, exact base
`54edb2cdf04498914446229b451ee2d96810d3a4` (fetched from
`codex/source-controller-integration-oct05`, not stale main).
Final worker reply supplies the full pushed SHA.

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

The unchanged `capture_research_first_discoveries_v1` still freezes its own raw
quote/gap, null returns and unknown phase. Additional context lives in immutable
linked run rows. This batch does not rewrite the first-capture function/table or
backfill historical snapshots; any persistence extension belongs to root review.

## Available production source interface and remaining data gaps

The fixed read-only adapter uses existing service-side
`tw_trading_sessions_v3` and `official_price_history` with concrete selected fields,
cutoff filters for every knowledge clock, official provider/URL/exchange/integrity,
completed close and raw price availability validation. It selects only necessary
provenance scalars, not entire provider metadata. It does not fetch today's HTTP
data, call paid APIs or run arbitrary URLs. It returns actual raw quote/volume or
missing; raw quotes never become adjusted relative returns.

Bounds: <=5000 candidates/first rows, <=32 lexically sorted new read admissions,
<=15 seconds including registry IO, <=124 calendar rows (sentinel rejects), <=2
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
other consumers; the new adapter invokes `requireComplete61:true` unconditionally.
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

43 named cases executed: **30 new** (7 DE, 18 DP, 5 actual-route contract cases),
**13 existing** source-extension/priority/root regressions; 43 pass, 0 fail, 0 skip.
Route contracts execute the actual transpiled POST with controlled synthetic DB
dependencies, including a nonempty queue. They prove quote evidence changes the
immutable input hash while the exact scores/queue remain identical.

```sh
node scripts/run-node22.js --experimental-strip-types --test \
  web/src/lib/research-discovery-evidence.test.ts \
  web/src/lib/research-discovery-price-enrichment.test.ts \
  web/src/app/api/internal/research-priority-run/route.contract.test.ts \
  web/src/lib/research-agent-priority.test.ts \
  web/src/lib/research-source-roots.test.ts \
  web/src/lib/research-source-extensions.test.ts
cd web
npm run typecheck
npm run lint
DATA_MODE=demo RADAR_PUBLIC_SNAPSHOTS_ENABLED=disabled NEXT_TELEMETRY_DISABLED=1 npm run build
DATA_MODE=demo RADAR_PUBLIC_SNAPSHOTS_ENABLED=disabled NEXT_TELEMETRY_DISABLED=1 npm run build -- --webpack
```

Full lint: zero errors, 33 unchanged baseline warnings.
Full tsc/build acceptance is **not passed**. Default Turbopack cannot bind its
internal processing port (`EPERM`), even with allowed escalation. Supported webpack
compiles, then reports existing generated-route export errors:
`app/layout.tsx` exports `CANONICAL_APP_URL`; `app/opportunity-v3/page.tsx` exports
`OpportunityV3Page`. The same errors were reproduced in the earlier pristine
`3b448b...` archive; both route files and web dependency locks are unchanged at
this exact `54edb2c...` base. Current tsc reports those same two errors and no owned
file errors. Root owns any unrelated route corrections.

Local logs retained outside the checkout:
`/workspace/discovery-price-tests-final-v2.log`,
`/workspace/discovery-price-typecheck-final-v2.log`,
`/workspace/discovery-price-lint-final-v2.log`,
`/workspace/discovery-price-build-final.log`,
`/workspace/discovery-price-build-webpack-final-v2.log`.

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
