# Financial evidence completion — implementation and release hold

## Scope and identity

- Clean independent checkout: `/tmp/stockinsider-financial-completion-20260911`.
- Base: PR #210, exact `a00ab5aa6551c47621148373c8fc1b695e39d2c2`.
- Branch: `codex/financial-evidence-completion`; integration commit `a8c43b2`.
- Incorporated the reviewed parser work from PR #215. The frozen PR #210 checkout was not modified.
- No production ingestion, database migration, deployment, scheduler activation, secret modification or main-branch push was performed.

## Implemented

1. Official filing downloads now create immutable private document receipts; a download or regex match cannot directly become a validated financial fact. Clean Arelle manifests bind document hash, issuer, period, concept, context and unit before the existing accounting validator.
2. Exact official attachment transport repair handles the observed empty MOPS media type only for a matching issuer/quarter attachment with standalone UTF-8 XHTML and an inline-XBRL namespace. Explicit MIME mismatches and preview wrappers still fail. Original MIME is retained; download time is not recorded as a claimed historical publication date.
3. Immutable receipt-to-job links make new and replayed uploads reconcilable. Required fields and immutable validation receipts must be satisfied before completion. Queued parsing, missing evidence and retries are not success.
4. Field/period acquisition is bounded and issuer-fair, with a durable last-attempt cursor. Financial, brokerage, cyclical and general-company requirements share the relevant taxonomy; current TPEx summaries use the latest normally due quarter rather than a merely closed quarter.
5. Monthly official history checkpoints and attempts support 1,320 trading sessions and 60 valuation months. Writes and checkpoint completion are atomic, preserve first availability, and verify concurrent winners. Conflicts are sticky and block valuation/promotion, including on subsequent clean or repeated runs. FinMind observations are not relabelled official.
6. New daily price ingestion is a bounded append through the same atomic boundary. Research no longer rewrites all historical price/multiple availability timestamps.
7. Forward earnings scenarios reconcile reported revenue, margins, expenses, common income and diluted shares. Reported facts, model assumptions, optional issuer guidance and derived values remain distinct, with fact IDs and sensitivities. Missing optional disclosure context does not veto otherwise complete required financials; actual contradictions still fail.
8. Missing loss-company investigation remains incomplete rather than a completed no-valuation-method conclusion. Per-stock execution, fact completeness and model completeness are separate.
9. Taiwan data refresh no longer hard-fails above 280 stocks or selects every historical stage. A PIT, paginated active/recent universe registers its entire expected scope before bounded enqueue. Missing/in-flight work and market-wide failures block research; terminal individual-price gaps remain visible without vetoing other stocks. Strict `dataComplete` remains separate from `researchReady`.
10. A guarded operator-only `POST /api/internal/candidate-history-backfill` drains one bounded batch independently of research/publication. Defaults are 80 requests / 4 per stock; permitted caps are 400 / 12. Its `batchComplete` does not mean `universeCoverageComplete`.

## Verified real-document blocker — not a completed ingestion

Four actual 2026Q2 official FileDownLoad attachments were tested locally with pinned Arelle 2.44.7 and the exact SHA-verified official 2026 taxonomy, without parser network access.

| Issuer | HTTP | Structural/tuple/dimension errors | Typed candidates | Accepted / mapped facts |
| --- | --- | ---: | ---: | ---: |
| 2330 | 200 | 893 | 33 | 0 |
| 2892 | 200 | 1,075 | 21 | 0 |
| 2002 | 200 | 6,075 | 33 | 0 |
| 2332 | 200 | 2,252 | 33 | 0 |

These are genuine failed canaries, not synthetic tests and not proof that the underlying company numbers are wrong. The current document/schema compatibility boundary cannot certify them. No validation gate was disabled and no candidate facts were promoted.

Local replay evidence: `/private/tmp/stockinsider-official-canary-20260911.uk3jAk/canary-summary.json`; unchanged attachments and the verified public taxonomy are retained in that temporary directory. It contains public official documents, not credentials or user-uploaded private research.

Two separate deployment prerequisites were also confirmed:

- The VPS parser runtime has no installed `taxonomy/current` or XSD assets. An enabled socket is not taxonomy readiness.
- The installer previously required nonexistent `tifrs-ci-basi-2026-03-31.xsd`; the pinned archive contains `tifrs-basi-cr-2026-03-31.xsd` and `tifrs-basi-ir-2026-03-31.xsd`. The filename check is fixed, but the installer was not executed against the VPS.

## Validation

- TypeScript and repository ESLint passed.
- Production build passed. Existing `research-v2.ts` dynamic filesystem tracing warning remains; no new build error.
- Product correctness: 151/151 passed.
- Migration contract: 79/79 passed.
- Legacy regressions: 2/2 passed.
- Candidate revision history: 8/8 passed.
- Final aggregate: 345/345 passed (evidence recovery 35, runtime 204, contracts 42, financial boundaries 64), with zero failures and zero skipped tests.
- Exact migration-inventory, queue-readiness and price-provenance acceptance amendments were made and verified by a separate acceptance owner, preserving previous authority and fail-closed requirements.
- Real temporary PostgreSQL tests cover fair concurrent claims, immutable receipt replay, lock ordering, conflicting price/multiple writers, sticky quarantine and complete refresh-scope accounting. They do not use a production URL.
- Pinned parser tests use real local Arelle rather than skipping the dependency. Synthetic contract tests are not substituted for the failed actual issuer canaries above.
- Final combined financial/runtime test output is retained at `/tmp/stockinsider-financial-completion-full.log`.

## Required before production completion

1. Resolve the real official-document/schema incompatibility through a reviewed authoritative extraction/validation path. Do not accept the typed-but-unvalidated candidates or suppress structural errors to manufacture success.
2. Review and apply migrations in explicit order: manifest v8 → fairness 02 → document links 03 → Taiwan refresh queue 04 → history v1. Lexical filename order is not valid.
3. Provision the exact reviewed public taxonomy and compatible parser/socket code together. Historical taxonomy versions needed for earlier filings remain a verification prerequisite.
4. Establish 1,320 actual database-authoritative completed trading sessions, then drain bounded history batches and verify remaining field/period/month coverage. A single nightly batch cannot establish deep-history completion.
5. PDF financial semantic extraction remains explicitly unsupported by the v8 authority contract. A locator is not a financial fact.
6. Automatic issuer-guidance acquisition is not implemented. The deterministic company-fact projection and typed guidance boundary do not supply missing customer, shipment, capacity, yield or ASP evidence.
7. Complete exact-commit review and protected checks before any merge or deployment. The draft must remain on hold while the genuine financial canaries are failing.
