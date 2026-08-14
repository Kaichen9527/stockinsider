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
8. Official ingestion chunks that contain per-stock append work are capped at 20
   rows and are applied transactionally before terminal completion. An immutable
   application ledger binds run, job, ordinal, hash, producer and cutoff. Completion
   remains conservation-gated but performs constant work for already-applied chunks;
   retries cannot double-apply or silently skip a chunk.

## Acceptance

- fresh PostgreSQL applies the complete migration chain twice and all catalog/RLS/
  append-only tests pass;
- official 8299/TPEX history returns real sessions with base units, and compact ROC
  corporate-action dates are accepted;
- a source-empty funnel admits at least one out-of-seed official factor candidate,
  preserves `seedMembership`, and creates no action field;
- the REST adapter maps canonical bytea, carries authority cache, and redacts provider
  failures without exposing credentials;
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
