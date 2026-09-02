# Exact commit review: hash-bound official calendar recovery

Result: `PASS`

P0=0 P1=0 P2=0

## Scope reviewed

- Exact implementation range `ffa3173c9973a4eb3a66bf87a2610c35800a2088..e5881a68d9dfcb3ae806becee0fd92b941187664` and reviewed tree `10193e4276dfe9847bcaac0e6d17ad64a82f89be`.
- Official TWSE and TPEx monthly calendar acquisition, raw-response hashing, strict origin/path/query validation, date parsing, cross-market intersection, and append-only session persistence.
- Sixty-seven calendar months of acquisition followed by a deterministic latest-1,320-session window, sufficient for five-year market and valuation inputs while remaining bounded.
- Internal authentication, active writer-release fencing, encrypted loopback tunnel enforcement, bounded request bodies, response-body timeouts, maximum response size, and restart-safe duplicate handling.
- The official price operator body-consumption timeout that prevents a server returning headers with a stalled body from hanging the complete candidate recovery run.

## Findings

- No P0/P1/P2 findings remain. A session is appended only when the same date is present in hash-bound official monthly responses from both TWSE and TPEx; one market cannot fabricate the other market's authority.
- The public VPS remains deny-all for `/api/internal/*`. Both recovery operators accept only `http://127.0.0.1:43100`, reached through an SSH-encrypted local forward, so the internal bearer is not sent over the public HTTP listener.
- The server independently validates exact keys, official HTTPS origins and paths, query identity, response SHA-256, calendar month, payload structure, writer identity, availability time, and existing authority rows before inserting.
- Re-runs are idempotent at the operator boundary: existing market/date authority rows are counted as duplicates and omitted from inserts. Partial monthly progress remains durable.
- Response bodies have an independent deadline and byte ceiling after headers arrive. A stalled or oversized official response is cancelled and cannot block later targets indefinitely.
- No scoring threshold, valuation value, target price, market regime, actionable quota, or unofficial market observation is introduced.

## Verification

- Product correctness acceptance cases: 150/150 passed.
- Calendar parser, trust-boundary, cross-market intersection, body deadline/size, official price parser, and pagination tests: 7/7 passed.
- TypeScript, ESLint, diff check, script syntax, and production Next.js build: passed.

## Evidence

- Final reviewed repair/tree: `e5881a68d9dfcb3ae806becee0fd92b941187664` / `10193e4276dfe9847bcaac0e6d17ad64a82f89be`
- Full final range: `ffa3173c9973a4eb3a66bf87a2610c35800a2088..e5881a68d9dfcb3ae806becee0fd92b941187664`
- Active graph: `1c32b707a2e3d36e0ca01b4e78b9c20fa5bcef5eb34dce486063d9f694a2c9fc`
