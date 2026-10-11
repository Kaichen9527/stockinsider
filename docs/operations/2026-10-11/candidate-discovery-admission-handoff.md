# Candidate discovery admission and dated card presentation

Base: main `169aad1b6cfa747f78ae3464b614f43c0749d806`. This bounded increment owns only the new pure admission library/tests, its SSR tests, and the existing `RadarTabs.tsx` candidate-stage presentation. Calendar backfill, inbox, SQL, ingestion, priority/controller, strategy parameters, existing positions, and budget admission are unchanged. Independent review is pending.

## Admission contract

General admission requires a pair with different canonical publishers/authors AND different independent news roots. Platform count is display information, never a hard gate. Same-platform original authors/roots qualify; one creator across platforms and multiple reposts of one root do not. Root/publisher identities must come from resolved lineage, not platform-prefixed legacy keys, source URLs, or content hashes. Current retracted roots are excluded conservatively.

The separate PTT exception requires one current stock-bearing article and at least twenty distinct reply authors whose actual text and verified mention symbols identify the stock. Bare reactions, unrelated replies, duplicate authors, and pooling replies across articles do not qualify. This implementation checks explicit ticker text as a conservative lower bound; company-name-only replies remain unsupported until a verified mention resolver supplies appropriate evidence. Total push counts are never inputs.

Reasoned new major official events or high-impact leads can occupy up to five low-volume slots, explicitly not multi-source confirmation. The pure projection preserves every input/audit, takes the existing input ranking unchanged, and selects at most fifteen general plus five low-volume candidates. `schedulingIntegrated:false` is intentional. Weekly five-new-deep-research policy is displayed but remains enforced by the existing guarded priority/budget pipeline; this library creates no queue, claims, reservations, or budget ledger.

## Actual main caller applicability

`page.tsx` uses persisted stage cards when available and renders `CandidateStagesView`. Its found-stage default is now research candidates, with an explicit all-clues toggle; waiting/actionable cards, saved positions, hydration, pagination and existing filters are retained. Current legacy cards carry at most eight display links and do not contain resolved root lineage or per-reply PTT evidence. Every such card therefore reports unsupported; no legacy card is silently certified by aggregate counts or truncated links. The empty research view explains the missing contract and directs users to all clues. This is an honest partial integration, not completed live research scheduling.

`candidate-research.ts` reads the full mention set before round-robin link truncation. Its `publisherKeyFor` uses platform-prefixed identity and `independent_content_hash` identifies content, not a proven news root. The next integration must project canonical creator/root identities and actual PTT reply evidence before truncation, preserve withdrawals and snapshot lineage, and connect the result to the existing priority controller. Reviewed pending `research-agent-priority.ts` at `75d91024ce365606989bfe42b2d7e6227b65044d` was inspected: its scoring weights and 15/5 accounting were not modified. No second queue was introduced.

All eight existing bounded display source links are shown, with real platform labels including Threads, Instagram and InvestAnchors when those inputs exist. This does not enable missing sources or claim the display links are exhaustive evidence.

## Quote and valuation applicability

Candidate-stage price is only positive finite `technical.close` with a valid civil `technical.sessionDate`; `valuation.currentPrice` is never a fallback. An explicit official latest-complete-session argument can distinguish older/current/future sessions. The current card contract lacks that authority, so the UI says latest session needs verification. No seven-day TTL, availableAt, wall-clock weekday heuristic, or hardcoded holiday date declares a current price. The Oct9 holiday/Oct8 latest-session example is tested as supplied authority, not inferred.

PB/TTM values are labelled historical references with method and unknown valuation-source date; stale/unbound targets and upside are hidden. No forward reasonable target or mixed-date upside is claimed. The older source-signal/stock-card fallback branches lack this stage contract and are outside this increment; further caller integration and dated valuation provenance remain required.

## Validation and limitations

Original main SSR against the new assertions is preserved RED (five failures). The corrected publisher/root policy, PTT thresholds, complete accounting, bounds, quote/valuation checks, actual main SSR, and adjacent unchanged pagination/transport tests are recorded separately. SSR uses actual component/rendering and pure libraries with explicit module-boundary mocks for unrelated dependencies; it is not a browser click/overflow or production-data test. Current input-bound limits are 512 sources, 64 PTT articles, 2,048 replies per article, 4,096 aggregate replies, and 5,000 cohort candidates; over-bound inputs fail rather than truncate. No source acquisition, live scheduling, transaction permission or production write was performed.
