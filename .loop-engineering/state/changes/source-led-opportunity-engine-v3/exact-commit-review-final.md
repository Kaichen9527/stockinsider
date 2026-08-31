# Exact implementation review — official valuation history cache

Date: 2026-08-31

Review authority: read-only review of the complete immutable diff, official
valuation provenance, cache boundaries, latest-session freshness, regression
tests, and the unchanged product/runtime graph.

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `245a9d779c7936c380178ab673195cab125db19c` / `13ca9284cd0412683367affd1ff948edd06955e7`
- Full final range: `1ad1cfe1741f4ec5b8df193b081898be1ff521b3..245a9d779c7936c380178ab673195cab125db19c`
- Active graph: `329de76e514164f7ebd1905708491aa15e80c9ce34eb0fb7be3eb03786cdcf64`

## Review result

- The candidate cycle loads at most five years of persisted official PE/PB
  rows for its bounded universe before requesting exchange history. The query is
  bounded to candidate IDs, date range, ordering, and a 10,000-row ceiling.
- Persisted data enters the cache only when its source URL is an exact TWSE
  `BWIBBU_d`/`BWIBBU` or TPEx `peQryDate` endpoint. Publisher, arbitrary-host,
  malformed-date, and previously corrupt parser rows remain excluded.
- Every run still fetches the latest official session, so caching cannot make
  the actionable freshness gate pass on an older observation. Earlier months
  are fetched only when at least one requested symbol lacks that month.
- TWSE per-stock `BWIBBU` backfill is now accepted by the same official-source
  predicate during valuation calculation. This closes the mismatch where the
  backfill was persisted but then ignored on the next cycle.
- Existing and newly fetched rows are merged by calendar month after recovery;
  the latest same-month observation wins. TPEx remains on its official panel
  path and does not cross into the TWSE per-stock fallback.
- Per-stock historical recovery is capped at twelve missing months per cycle
  and uses one bounded request attempt per gap. A transient historical failure
  retries on the next daily cycle, while the current-session panel retains its
  stronger retry policy. The five-year distribution converges incrementally
  without overrunning the 19:00-to-20:00 production window.
- Missing history, missing earnings, stale current-session values, and fewer
  than eight valid multiple samples retain the existing fail-closed behavior;
  the cache does not manufacture a target or relax a stage gate.
- Regression tests cover the accepted official endpoints and reject a
  look-alike third-party URL. Candidate/shadow tests, all 150 product-correctness
  tests, TypeScript, lint, production build, and diff hygiene passed on the
  exact subject.
- The Opportunity V3 active graph is unchanged and all 31 PCR fulfillment rows
  remain bound to the reviewed tree.

## Closure

No P0, P1, or P2 code finding remains. The subject is ready for protected checks,
rebase merge, atomic VPS release, and a cached candidate research verification.
