# Exact commit review: source truth and candidate research v3

Result: `PASS`

P0=0 P1=0 P2=0

## Scope reviewed

- Exact implementation range `1a1209022a729ab6d893f4e6fb31adbfb5c37d8a..6e5947fe376c9950baf5b89bcea6c1afaffab4f5` and reviewed tree `b6d584e63555f917c67b1b8a07d239d2a0612e2a`.
- Header-bound TWSE and TPEx PE/PB parsing, isolation of legacy TPEx rows whose yield was misread as PE, and additive audit-preserving migration behavior.
- Fully paginated stock authority, source coverage, PTT article/comment attribution, institutional-ranking exclusion, Telegram per-channel cursor recovery, GDELT validity, and explicit connector terminal states.
- Point-in-time MOPS fact acquisition, eight-quarter forward bridge, valuation-method labeling, evidence-backed factor construction, official market completeness, stage classification, and fail-closed prerequisite semantics.
- Append-only candidate detail facts and dossier revisions, exact bundle/fact binding, claim validation, risk episodes, immutable stops, drawdown, publication ordering, and Shadow policy v2 evidence.
- VPS-only writer and schedule boundaries, Threads authorization gating, source-center aggregation, public snapshot/detail interfaces, migration contracts, and production build output.

## Findings

- No P0/P1/P2 findings remain. TPEx valuation values are selected by explicit official headers; a yield column cannot enter the PE field, and previously contaminated rows remain auditable but are excluded from current authority.
- Candidate research reads complete paginated authority and persists a failed canonical research run before propagating an official-data prerequisite failure. Missing valuation, stale market data, missing evidence, or adverse market state cannot receive free score or promote a candidate.
- PTT institutional ranking rows remain stored as chip evidence but no longer create discovery candidates. Article and comment identities are separate, while Telegram cursors, message IDs, channel identities, timestamps, duplicates, misses, and unavailable channels retain distinct terminal evidence.
- Deterministic dossier claims are backed by typed facts. Positive operating claims cannot cite a data-gap fact or unrelated market-price fact, and only an exact hash-bound internal submission may replace a facts-only narrative.
- Shadow observations remain tied to one frozen manifest and successful publication. Historical runs, same-day reruns, partial research, or deployment cannot fabricate a qualifying trading day.
- Threads remains blocked until the official API token is present and validated; BullTalk and Podcast license/configuration blocks are preserved honestly rather than marked successful.

## Verification

- Protected product-correctness acceptance suite: 150/150 passed.
- Candidate, valuation, market, source, dossier, risk, migration, publication, and Shadow suites: 155/155 passed.
- TypeScript, ESLint (zero errors; pre-existing warnings only), diff check, and production Next.js build: passed.
- Independent exact-diff review of SQL safety, source identity, point-in-time cutoffs, trust boundaries, fail-closed stage promotion, append-only evidence, and public/private interfaces: passed.

## Evidence

- Final reviewed repair/tree: `6e5947fe376c9950baf5b89bcea6c1afaffab4f5` / `b6d584e63555f917c67b1b8a07d239d2a0612e2a`
- Full final range: `1a1209022a729ab6d893f4e6fb31adbfb5c37d8a..6e5947fe376c9950baf5b89bcea6c1afaffab4f5`
- Active graph: `1c32b707a2e3d36e0ca01b4e78b9c20fa5bcef5eb34dce486063d9f694a2c9fc`
