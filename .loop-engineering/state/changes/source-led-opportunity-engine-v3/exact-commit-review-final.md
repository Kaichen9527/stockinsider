# Exact implementation review — Taiwan final publication gate v12

Date: 2026-09-14

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `449effb60d4138ca8a8982942264d7220faf7f69` / `8bb71e302da9def7337f6bbf43f9d70574cbd080`
- Full final range: `60099865f8a217740d89aab36e5def979c1c0ea6..449effb60d4138ca8a8982942264d7220faf7f69`
- Active graph: `c563d77e416fdc2284b7aba50ca2eb03fd5f4cbed44f4edb1c918c63db96e3a2`

## Scope reviewed

- Monthly revenue is removed from the market-close preliminary and final schedules. It remains supported by the provider boundary and is acquired per issuer by candidate research through MOPS and the identity-bound official TWSE InfoHub fallback.
- Global final-publication semantics now require the candidate close-price and valuation planes. They no longer treat issuer-period revenue as one market-wide component.
- The retired 30-day global Shadow flag is no longer read as a publication prerequisite. Price, valuation, market, research, confidence, actionability, and two-session candidate gates remain unchanged.
- The provider contract advances to v12 so the next registered refresh replaces the stale v11 scope and its failed aggregate monthly-revenue key without mutating historical attempts.

## Production evidence reviewed

- The TWSE aggregate monthly-revenue OpenAPI and official CSV return an HTTP-200 security-block HTML document to the Contabo address; that response remains invalid evidence and is not relabelled successful.
- The official TWSE InfoHub company endpoint is reachable from Contabo and validates the returned company code plus aligned period/revenue arrays before persistence in candidate research.
- The current candidate research run completed 284 terminal results with zero runtime failures. Company-specific revenue, history, earnings, or valuation gaps continue to remain partial per stock.
- The current market-evidence snapshot is complete; no market component is inferred from monthly revenue.

## Security and correctness reasoning

- No proxy, cookie, private endpoint, browser scraper, credential, or unofficial source is introduced.
- The scheduling change reduces redundant provider traffic and does not erase historical provider failures or source receipts.
- A company without admissible monthly revenue still cannot receive a fabricated forward bridge, target price, or promotion.
- Contract-version replacement is bounded by the existing registered-scope, queue-key, sole-writer, and canonical-persistence controls.

## Verification

- Focused provider, scheduling, and publication tests: 68 passed, 0 failed.
- Full product-correctness suite: 154 passed, 0 failed; captured output SHA-256 `10953e37b5c35f0369af2165c1d3299430b772eafab61011ad788661eda81001`.
- TypeScript passed.
- ESLint passed with zero errors.
- Production build passed.
- `git diff --check` passed.

This review covers the exact implementation commit. Merge, deployment to Contabo, systemd reload, contract-v12 refresh, and production canary remain separate rollout gates.
