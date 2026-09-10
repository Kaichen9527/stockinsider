# User-approved implementation amendment — 2026-09-10

Status: implementation authorized; independent review, migration and release evidence pending.
This record does not assert a protected gate PASS or authorize bypassing one.

## Delivery boundaries

1. Continue PR #210: fix real offline financial validation, persistent method/period
   acquisition and truthful research completeness. A valid parser result is not an
   accounting validation receipt or completed issuer valuation.
2. Separate subsequent platform PR: move StockInsider only to dedicated Contabo
   PostgreSQL/private PostgREST, private immutable documents and encrypted provider
   credentials. Preserve RPC/RLS, principal checks and the sole-writer fence. No
   TaskBuddy/BabyCalendar changes, no shared database/volume reuse, no new member Auth.
3. Separate subsequent product PR: cream/dark/orange compact three-stage scanner;
   complete-snapshot filters; revision-bound detail and honest historical charts;
   versioned local-only watchlist, simulations and decisions. No broker execution.

## Product and data requirements

- All valid seven-day mentions remain visible. Waiting/actionable keep the approved
  individual valuation, confidence, technical, market and two-adjacent-close gates.
  Global Shadow has no publication, classification, UI or health authority; old
  observations remain audit-only. No quotas and no fabricated targets or evidence.
- Details bind the clicked candidate revision, not silently the newest revision.
  Monthly series use actual last trading dates and explicit frequency. Do not
  synthesize MA, historic PE for losses, or trading days from calendar month ends.
- Forward valuation requires a company-specific sourced operating/earnings bridge;
  TTM multiples are reference only. Unknown facts stay unknown. Method/field/period
  queues must progress across all candidates with durable cursors and full pagination.
- Separate 12-month valuation from 1–3-month entry observations, valuation RR from
  trade RR, and model risk states from actual user holdings/exposure. Local decisions
  never write shared research or modify classification. No unsupported win-rate or
  real-time claims; no InvestAnchors paid content reuse.
- Threads uses the official API only. Valid credentials with empty search remain
  search-unverified. Activation requires non-self public-post discovery, stock linking,
  deduplication and subsequent scheduled ingestion. In-app KOL tracking is not an
  account-follow operation. Other source retirement/licensing policies are unchanged.

## Cutover and cost gates

- Review the new backend identity/migration/principal contracts; do not loosen the
  Supabase hostname guard in place. Internal services/API remain loopback-only.
- AES-256-GCM token envelopes bind identity/key version; systemd encrypted credentials
  hold root keys, with offsite recovery escrow. Refresh/revoke use atomic generation
  checks. Transfer secrets only in a restricted process's memory, never logs or env files.
- Hash-addressed immutable files live outside releases; preserve receipt references
  and reject traversal, symlinks and overwrites. Preserve signed HTTPS Meta callbacks.
- Rehearse schema/roles/extensions/RPC/RLS/documents/credentials, capacity and restore.
  Reserve at least 15 GiB throughout; warn below 20 GiB and pause resumable backfills
  near 15 GiB. Do not delete other sites' files or upgrade the VPS without cost review.
- Superseding user decision: do not purchase B2. Store encrypted backups in the
  existing local StockInsider project root's `backup/` directory (not filesystem
  `/backup`). Keep it private and excluded from Git/deploy tracing. Initial local
  budget is 25 GiB; retention must be measured rather than assumed to fit.
  RPO <=24h, RTO <=4h and tested restoration remain goals. Local backup is not
  geographically independent protection; separately recoverable keys and a full
  system restore remain unverified until actually tested.
- After rehearsal, use a 60-minute maintenance window, frozen old writers and last-good
  read-only pages. Verify the final consistent transfer before enabling the one new
  writer and resuming schedules. Validate short-lived IP HTTPS auto-renewal/alerts.
- Keep the old Supabase database read-only seven days, unrelated to stock Shadow.
  Application rollback keeps the new database. Database rollback requires frozen
  writes and verified reverse migration of new records, tokens and cursors.
- Retire the exact old StockInsider project/cancel Pro only after both other apps are
  confirmed moved, independent restore passes, seven-day observation completes and
  StockInsider works with old Supabase egress denied. Already incurred charges remain.

## Acceptance evidence

Require failing-then-passing parser/consumer regression tests, accounting and PIT
contracts, full unit/integration checks, lint/TypeScript/build and independent exact
commit review. Public card/detail/chart/citation versions must agree. Required external
canaries: p95 warm TTFB <=2s, home <=200KB, Radar <=150KB, no overflow at 360px and no
regression for other VPS sites. Report acquisition/validation/valuation/research status
per issuer; command success is not business completion. No production migration,
deployment, purchase or cancellation is claimed by this document.
