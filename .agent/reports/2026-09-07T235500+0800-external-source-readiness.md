# External-source readiness implementation report

Date: 2026-09-07 (Asia/Taipei)

## Implemented

- Threads official API authority is pinned to
  `https://graph.threads.com/v1.0/keyword_search` across legacy and tracked
  runtimes. Search uses `RECENT`, a seven-day window, three bounded pages, and
  no cookie or Instagram fallback.
- Added an internal OAuth start route, public state-verified callback, direct
  Vault persistence, 30-day refresh, 14-day expiry warning, and an internal
  canary that only passes after observing a non-self public post. Responses and
  receipts never contain a token, username, query, or raw post ID.
- BullTalk is blocked by default and activates only with a signed-scope
  reference, real-sample SHA-256, and authorized HTTPS feed. The adapter accepts
  JSON/CSV only and rejects HTML.
- Podcast RSS indexing is independent from content analysis. Podcast Namespace
  transcript/chapters references support alternate namespace prefixes,
  preserve timecodes, reject unsafe XML and unsupported artifacts, and never
  download or copy RSS audio enclosures.
- Source ledger semantics explicitly separate index refresh, analyzable content,
  and valid stock matches.

## Verification

- `npm run typecheck`: pass
- `npm run lint -- --quiet`: pass
- `npm run build`: pass
- focused TypeScript tests: 20 pass
- V3.20 source-acquisition acceptance: pass
- V3.18 Threads topic-scope acceptance: pass

## External checkpoints (not performed)

- User creates/confirms the dedicated StockInsider Meta App and completes
  Tester, OAuth/2FA, identity/business verification and App Review.
- User configures secrets through the deployment secret manager and completes
  the OAuth consent; no credentials were written by this implementation run.
- User runs and reviews the non-self public-post canary before activating the
  Threads source.
- User supplies contact details and authorizes any BullTalk/CMoney outreach,
  pricing, contract, licensed scope, and real sample.
- User establishes analysis/display/retention rights for the 股癌 transcript
  pilot before content processing.

No production schedules, deployment, database migration, form submission,
account creation, contract acceptance, or push was performed.
