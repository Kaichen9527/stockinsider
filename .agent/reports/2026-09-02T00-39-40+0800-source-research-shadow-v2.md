# StockInsider Source, Research and Shadow v2 verification

## Scope

- Source policy and ingestion: GDELT GKG cursor/backlog, Telegram metadata-only audit, PTT content semantics, licensed podcast RSS, explicit blocked/manual/retired states.
- Candidate research: PIT official authority, price/multiple/fact persistence, 17-symbol valuation policy, market evidence, detail revisions and balanced signal tracking.
- Shadow v2: immutable daily manifest, attempt ledger, operational completeness, publication-bound observation and replay-conflict semantics.
- Public delivery: compact Radar snapshot, source concentration, risk state and non-empty candidate detail pages.
- Production control: VPS writer identity/lease fence, zero Vercel write crons and canonical VPS redirect.

## Review findings fixed before commit

- Prevented Shadow replay conflicts caused by late source rows or a changed public payload outside the frozen manifest.
- Corrected GDELT GKG date-column parsing, official HTTP listing upgrade to HTTPS and 15-minute cursor backlog enumeration.
- Corrected healthy `successful_empty`/`duplicate_only` source runs that legacy status code marked red.
- Redacted rejected Codex dossier content and required valid fact IDs for the summary and every section.
- Added numeric-claim consistency checks against cited official fact values.
- Sanitized public official-fact links to HTTP(S) only.
- Exposed source concentration and daily risk action on candidate cards.

## Verification

- Candidate/Shadow tests: 57 passed.
- Source-ranking tests: 53 passed.
- Opportunity V3 product correctness: 150 passed.
- Opportunity V3 migration contracts: 78 passed.
- Opportunity V3 gate/runtime suite: 63 passed.
- Legacy V1/V2 regression: 2 passed.
- Additive migration applies twice and writer fence states pass on fresh PostgreSQL.
- ESLint: 0 errors, 31 pre-existing warnings.
- TypeScript: passed.
- Next.js production build: passed.
- `git diff --check`: passed.

## Deployment truth boundary

- Threads and BullTalk remain outside core completion while their official authorization/license is unavailable; neither is allowed to appear healthy.
- A stock with insufficient official valuation evidence receives an explicit terminal reason and remains `found`; no target is fabricated.
- Market evidence remains fail-closed unless both indices, breadth coverage and foreign-flow inputs are current and complete.
- `shadow-policy-v2` starts from real `0/30`; no historical date is backfilled as a live qualifying observation.
