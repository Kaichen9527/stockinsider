# V3.15 Opportunity-Recovery Amendment

## RED baseline

Observed on production on 2026-08-13:

- the Web consumer is V3.14 while the last-good producer is V3.12, so action authority is disabled;
- the V3.13/V3.14 financial, price, valuation and decision planes are absent or empty;
- the public projection can retain 30 source cards, but every card is legacy
  `valuation_review` and neither the action nor near-action bucket has a valid member;
- 8299 has an official current TPEX close, valuation and monthly revenue, yet the
  loader returned zero history because it sent a ROC month to a Gregorian endpoint
  and omitted `sourceUrl` from the parser authority;
- TPEX history volume and turnover were stored in lots/thousands instead of
  shares/TWD; compact ROC dates in two corporate-action feeds rejected the complete
  range; a single transient range timeout discarded all 260 action snapshots;
- current candidate discovery is source-led only. A stock must first be mentioned by
  an approved source before official financial and market authority can be loaded;
- the installed legacy writer emits nearly identical technical histories across
  unrelated stocks. Those values are not eligible for V3 action authority.
- the first reviewed production bootstrap staged 5,530 official rows, but the
  terminal completion attempted to append every row inside one REST transaction.
  A 200-row financial or price chunk exceeded the database's 120-second statement
  bound, so the producer failed at `facts_refresh` and never published a projection.
- after bounded pre-application was deployed, production applied all five trading-
  session chunks and then received a transient PostgREST failure. The adapter erased
  the HTTP retryability signal, classified every rejected transport as data-integrity
  failure, and did not retry the already-idempotent official chunk. Rollback-only
  production probes showed the same 20-row financial chunks complete in 12.8 seconds
  and the first 20-row price chunk in 12.2 seconds, excluding the chunk bound and
  official row contract as the cause.
- two reviewed production invocations then reproduced the failure at the first
  financial REST chunk. A no-write reconstruction captured the exact 20 official
  rows; 20/20 passed the production financial authority individually, the whole
  ordered set passed in one rollback-only transaction, and JavaScript/PostgreSQL
  canonical hashes matched. The database transaction took about 13 seconds, while
  the PostgREST path rejected the request. Therefore the remaining defect is the
  gateway-safe request bound, not a financial fact or valuation-integrity exception.
- the gateway-safe producer then applied 960 trading sessions, 506 financial facts
  and 2,820 adjusted price/benchmark observations before the third official valuation
  chunk failed. A no-write reconstruction proved the row was 1711 with official PE
  305.38 and valid PB 2.44. The V3.13 append contract rejects PE above 200, but the
  stream did not clear the invalid PE and preserve the still-authoritative PB, so one
  provider outlier rejected the whole five-row transaction.
- the repaired producer then persisted every official chunk and terminal marker after
  a process-boundary resume, but facts completion returned typed `PT403`. Later-stage
  legacy claims intentionally omit `authority_hash`; the fresh REST adapter process
  had not retained the exact run authority identity returned by lease acquisition.
- the authority-resume repair advanced the reviewed production run through facts and
  created its analysis job, but analysis completion rejected a 3,893,236-byte result
  against the closed 3,145,728-byte durable-result envelope. The result duplicated
  each complete immutable fact payload beneath both `decisions.analysisRevision` and
  `decisionPayloads`, and copied complete calendar/coverage rows even though the next
  stage consumes only their authority hash and bounded coverage summary.
- a read-only replay of real official filings found that otherwise complete income
  bridges were still rejected when MOPS published cumulative diluted EPS but omitted
  a standalone diluted weighted-share concept. The universal bridge also required
  PE-irrelevant PB/balance inputs, and historical valuation acquisition discarded
  every rostered peer that was not itself a deep candidate. These two implementation
  roots made formal and relative valuation operationally unreachable despite valid
  point-in-time authority.

The production read-only official scan proves this is infrastructure failure rather
than an empty market: 1,977 active common stocks resolve, 1,971 have current official
valuation, 1,958 have current official revenue, and hundreds satisfy a coarse
research threshold. This observation is research supply, not proof of future return.

## Contract

1. Candidate discovery has two bounded entrances: source evidence and official
   whole-market factors. Both feed the same 60/30/20 funnel. The factor entrance can
   rank research but cannot mint an action.
2. The coarse factor score uses fixed, non-renormalized weights and smooth bounded
   transforms for relative valuation and revenue change. Missing inputs cannot raise
   the score. Extreme low-base revenue or peak-cycle PE cannot dominate by clipping.
3. Only the existing `DecisionEnvelopeV314` can authorize `buy`, `accumulate`,
   `research_starter` or wait/avoid actions. Formal actions still require point-in-time
   official financial, adjusted-price, peer and market authority.
4. Official ingestion persists monthly revenue as a typed monthly fact and preserves
   its filing date, period, unit and source. TPEX history is normalized to shares/TWD.
5. Corporate-action acquisition is complete for both exchanges and 130 completed
   sessions per market; retries are bounded and terminal. Missing snapshots keep
   technical authority unavailable rather than using unadjusted or synthetic prices.
6. Production producer and doctor use allowlisted Supabase HTTPS REST credentials.
   The already-rotated database password is not reset or required. REST claim carries
   the same frozen authority hash as the PostgreSQL adapter.
7. The additive V3.15 migration is apply-twice safe, keeps RLS/immutable state, adds a
   bounded coarse-universe read and narrowly grants only the REST claim/health RPCs to
   `service_role`.
8. Official ingestion chunks that contain per-stock append work are capped at 5
   rows and are applied transactionally before terminal completion. An immutable
   application ledger binds run, job, ordinal, hash, producer and cutoff. Completion
   remains conservation-gated but performs constant work for already-applied chunks;
   retries cannot double-apply or silently skip a chunk.
9. Only official-ingestion chunk RPCs receive at most three bounded attempts with
   250/500 ms backoff, and only after a transport exception, HTTP 429, or HTTP 5xx.
   HTTP 4xx authority/integrity rejection is terminal on its first attempt. Error
   messages contain only RPC name and an allowlisted provider code, never response
   payloads, URLs, SQL, or credentials.
10. Any official chunk failure preserves the allowlisted dataset kind and chunk
    ordinal in the typed diagnostic. Transport/gateway rejection and semantic chunk
    rejection are distinct invariant codes; neither exposes the response payload.
11. Exchange valuation metrics are normalized before chunk hashing and persistence
    to the same V3.13 ranges: PE `(0,200]`, PB `(0,100]`. An out-of-range metric is
    cleared without discarding the other valid metric; an observation with neither
    metric is excluded from persistence and remains unavailable to decision authority.
12. Lease acquisition supplies the exact run authority identity for completion across
    a durable process resume. It does not populate the authority-page cache: claim page
    suppression remains permitted only after that process actually receives a non-empty
    page set with the matching hash.
13. The analysis durable result stores complete immutable decision facts exactly once
    in `decisionPayloads`. Projection decisions retain revision id, material-change
    hash, generation time and evaluation metadata but do not duplicate those facts.
    Official authority transport to compact projection is limited to calendar hash,
    completed-session count, readiness and at most twelve blockers; the complete rows
    remain immutable in the succeeded facts result. This compaction may not remove a
    decision, candidate, citation or source-evidence item.
14. Method readiness is method-specific. A complete normalized-PE income bridge does
    not require PB/NAV-only balance facts; present balance facts are still reconciled
    and any conflict remains terminal for that method.
15. When an official filing publishes cumulative attributable income and cumulative
    diluted EPS for the same point-in-time periods but no standalone weighted-share
    concept, the runtime may derive the implied year-to-date denominator and its
    day-weighted four-quarter denominator. The derivation is in-memory, source-ref
    bound to both official facts, never persisted as a reported fact, and any sign,
    zero, future-period or reconciliation conflict fails closed.
16. Historical PE/PB acquisition admits the exact bounded union of deep candidates
    and their same-exchange peer roster. A peer need not be a deep candidate, cannot
    become an action candidate through this path, and remains subject to the existing
    252-session/eight-peer authority gates.

## Acceptance

- fresh PostgreSQL applies the complete migration chain twice and all catalog/RLS/
  append-only tests pass;
- official 8299/TPEX history returns real sessions with base units, and compact ROC
  corporate-action dates are accepted;
- historical valuation retains a same-sector peer outside the deep-candidate set;
- an official four-quarter income bridge with cumulative EPS and no standalone share
  concept derives the bounded denominator and rejects future or conflicting periods;
- official attributable income plus total equity supplies fundamental ROE without
  inventing book value per share;
- a source-empty funnel admits at least one out-of-seed official factor candidate,
  preserves `seedMembership`, and creates no action field;
- the REST adapter maps canonical bytea, carries authority cache, and redacts provider
  failures without exposing credentials;
- an idempotent official chunk retries and succeeds after one HTTP 503, while an HTTP
  409/PT409 is attempted exactly once and its response message/credential is absent;
  per-stock financial, price, corporate-action and valuation chunks contain at most
  five rows, and failure diagnostics retain their kind and ordinal;
- two production producer runs terminate successfully; the second rereads persisted
  authority and proves idempotency;
- a rollback-only production rehearsal applies the chunk-application migration twice,
  and a terminal completion refuses any manifest with an unapplied non-terminal chunk;
- production projection identity, runtime manifest and Web release are the same
  reviewed commit; public action authority is enabled only if compatibility and
  freshness pass;
- 8299 and 2408 are visible when they meet research ranking, but no test or production
  quota requires either to be actionable. A technically extended stock must remain a
  wait/avoid-chase state even with strong revenue growth.
- the production-shaped 1711 case (`PE=305.38`, `PB=2.44`) persists as PB-only, while
  an observation whose PE and PB are both outside authority ranges is not emitted.
- a resumed facts job whose claim omits `authority_hash` completes with the hash from
  lease acquisition, while its first claim still requests authority pages with an empty
  page-cache hash.
- a production-shaped 20-decision/40-source analysis result is below 3,145,728 bytes;
  the equivalent duplicated representation is above that bound, all complete facts
  remain in `decisionPayloads`, and every decision, candidate and citation is conserved.
