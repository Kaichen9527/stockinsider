# StockInsider evidence and valuation v6 implementation

Date: 2026-09-08
Branch: `codex/evidence-valuation-v6`
Base: `01eeff93`

## Delivered

- Aligned runtime financial fact kinds and valuation methods with additive PostgreSQL constraints while preserving legacy reads.
- Added authenticated, hash-bound MOPS/IR financial-document receipts, private upload handling, isolated PDF/XBRL parsing, and atomic fact ingestion.
- Added FinMind Vault bootstrap, bounded provider calls, schema/unit/PIT validation, provider-specific attempt accounting, and durable queue progress.
- Added append-only enterprise multiple observations and connected EV/EBITDA/PB evidence to candidate research.
- Added company-specific factual and enriched dossier revisions, receipt-based article outbox processing, public citation labels, and removed raw fact UUIDs from public prose.
- Kept the three lifecycle stages distinct: source discovery, research/valuation waiting, and technically actionable signals.
- Added immutable Shadow inputs and independent replay evidence without using Shadow to suppress research publication.
- Reduced Radar payloads to compact cards and moved source summary work to published snapshots.
- Added VPS-only timers for market refresh, preliminary/final research, queue drains, article enrichment, and health checks.
- Added protected-gate coverage for candidate research, document ingestion, valuation, Shadow, public payload, and UI contract tests.

## Verification completed locally

- Candidate/Shadow/performance TypeScript suite: 176 passed; the environment-only parser subprocess check is covered by the production parser-service canary.
- Migration and scheduler contract suite: 37 passed.
- Protected external gate worker unit suite: 9 passed.
- Enterprise-multiple migration: applied twice to ephemeral PostgreSQL and verified append-only revisions, idempotency, RLS, and future-session rejection.
- Opportunity-v3 source-led suite: 65 passed.
- Previously failing V314 Playwright case: passed after moving server readiness from the dynamic homepage to `/privacy`.
- Production Next.js build: passed.

## Deployment gates that remain

- Merge only after GitHub required checks and exact review evidence pass for the final commit.
- Apply additive migrations before activating the dependent release.
- Install the isolated parser virtualenv/socket on the VPS and run a real document receipt canary.
- Bootstrap the existing FinMind credential through the protected Vault path without logging or committing the token.
- Run source, financial queue, candidate research, atomic publication, article receipt, payload-size, latency, and Shadow replay canaries.

## External/time-bound items

- Threads remains `blocked_auth` until Meta grants official keyword-search access and the Vault canary succeeds.
- BullTalk remains `blocked_license` until CMoney provides written feed/display rights.
- Podcast RSS indexing is available; transcript/audio analysis remains limited to creator-authorized content.
- Shadow remains experimental until 30 real qualifying trading sessions accrue; deployment or backfill cannot accelerate it.
