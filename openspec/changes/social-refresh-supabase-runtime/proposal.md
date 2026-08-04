## Why

StockInsider now depends on fast-moving social and KOL evidence, but the runtime truth is split across local `.agent/*` files, launchd logs, Vercel status-only attempts, and Supabase research tables. This makes the product hard to trust: a connector can run without writing usable citations, a Vercel status-only attempt can look like a real failure, and session/cookie health is invisible to production.

We need one durable runtime source of truth in Supabase and a clear 6-hour social refresh SLA for the visible + deep-dive universe.

## What Changes

- Add a 6-hour `social-source-refresh-6h` worker job for Threads, InvestAnchors, Instagram, Telegram, Podcast, and YouTube/KOL scans.
- Keep the local Mac launchd worker as the canonical browser connector runtime; Vercel serverless remains status-only for Playwright-backed sources.
- Store worker state, route-level job runs, runtime artifacts, lightweight logs, and encrypted social sessions in Supabase.
- Change source health UI/audits to read Supabase runtime state instead of local `.agent/*` files.
- Ensure each terminal social run records attempt time, success time, records written, affected symbols, and connector-specific failure reason.

## Impact

- Backend/data model: adds Supabase tables for worker states, job runs, runtime artifacts, logs, and encrypted source sessions.
- Runtime: adds one social refresh job scheduled at `00:00 / 06:00 / 12:00 / 18:00 Asia/Taipei`.
- Security: session/cookie payloads are encrypted before being written to Supabase and must only be accessed with service-role/local-worker credentials.
- Product: homepage source health can explain whether a source is fresh, stale, auth-degraded, runtime-degraded, or had no matches.
