# Exact commit review: bounded candidate research, verified GDELT discovery and transient retry

Result: `PASS`

P0=0 P1=0 P2=0

## Scope reviewed

- Exact implementation range `bdbcaff1396afcca568e5add5741bbaa3b022a4c..9c4599db02ad286f11479340b0b6d0c44c707645` and reviewed tree `8fdf79218415b17cdf8c703bcaf5b32206c6e715`.
- Paginated stock/calendar/source authority, bounded fundamental-history UUID filters, GDELT Taiwan-market entity matching and candidate eligibility.
- Fail-closed handling for valid stocks with short price history and rejection of symbols absent from the point-in-time official stock master.
- Authenticated successor-release lease cleanup after the sole VPS web process is restarted.
- Bounded per-stock retries for transient 429/5xx, timeout and network failures while preserving fail-closed treatment of evidence and authority errors.
- Candidate/Shadow contracts, full product correctness, TypeScript, ESLint and the production Next.js build.

## Findings

- No P0/P1/P2 findings remain.
- Production exposed two transport defects: PostgREST's 1,000-row response cap and an oversized `stock_id in (...)` URL. All affected authority reads are now bounded and fully paginated.
- A live canary then exposed 6,771 GDELT metadata mentions mapped to 965 Taiwan symbols by generic names. Legacy rows remain auditable but are ineligible; new matches require explicit ticker syntax or Taiwan-market context plus a complete name token and carry a versioned eligibility marker.
- GDELT now reads all official stock-authority pages instead of silently truncating the roster.
- A valid stock with fewer than 240 genuine sessions publishes a found-stage research result with `insufficient_history`; incomplete technical evidence is stale/fail-closed and cannot promote the stock. A symbol absent from official authority is excluded.
- A new release activation clears only a lease left by a different, already-stopped release before registering the successor, preventing a killed canary from blocking the scheduler for its full TTL.
- A live 107-stock canary exposed one Supabase 520 response. The final tree retries only transient infrastructure failures at the idempotent stock-task boundary, at most twice; deterministic evidence failures are never retried or hidden.
- No scoring threshold, valuation formula, target price, market regime, actionable quota or historical Shadow observation is loosened or fabricated.

## Verification

- Candidate, market, source, valuation and Shadow tests: 52/52 passed.
- Candidate/shadow contract tests: 17/17 passed.
- Focused GDELT and source-semantics tests: 11/11 passed.
- Product correctness: 150/150 passed.
- TypeScript and production Next.js build: passed.
- ESLint: passed with only the repository's pre-existing warnings.

## Evidence

- Final reviewed repair/tree: `9c4599db02ad286f11479340b0b6d0c44c707645` / `8fdf79218415b17cdf8c703bcaf5b32206c6e715`
- Full final range: `bdbcaff1396afcca568e5add5741bbaa3b022a4c..9c4599db02ad286f11479340b0b6d0c44c707645`
- Active graph: `1c32b707a2e3d36e0ca01b4e78b9c20fa5bcef5eb34dce486063d9f694a2c9fc`
