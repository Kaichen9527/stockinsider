# Financial evidence completion — implementation and release hold

## Latest fact-scoped follow-up (code commit `5000964`)

The initial all-or-nothing canary below is retained as audit history. The follow-up does **not** certify any invalid document: it retains every source/extracted error and admits only exact `VALID`, non-dimensional occurrences unaffected by fact/context/unit/concept/tuple/continuation/calculation rejection closure. Unknown, ambiguous, duplicate-ID and damaged-DTS errors remain document-fatal. Exact source IDs and logical tuple paths prevent equal-valued occurrences from being swapped during extraction.

Four unchanged actual official 2026Q2 filings were rerun through the pinned offline CLI, Node admission, semantic mapping and local accounting functions on code commit `5000964`:

| Issuer | Structural eligible / rejected | Semantic mapped | Local accounting pass / reject | Error records retained | Document status |
| --- | ---: | ---: | ---: | ---: | --- |
| 2330 | 11 / 22 | 11 | 11 / 0 | 1,030 | partial |
| 2892 | 0 / 21 | 0 | not run | 1,239 | partial, fatal duplicate-ID / tuple ambiguity |
| 2002 | 11 / 22 | 11 | 11 / 0 | 6,615 | partial |
| 2332 | 11 / 22 | 11 | 11 / 0 | 2,527 | partial |

These are fact occurrences, not counts of unique metrics. The additional error records include the second instance validation, calculation inconsistencies and explicit duplicate-fact checks. Equity and ProfitLoss remain rejected. All formal database-accepted counts are **0**: no production write or structural/accounting receipt was created. The 11 eligible occurrences in each nonfatal file still await database receipts; none of the four files supplies a complete valuation. Local checker success does not substitute for a database receipt or complete financial model.

Exact CLI elapsed times were 14.06 / 11.48 / 14.21 / 14.04 seconds respectively, retaining the original 20-second CPU, 25-second subprocess and 2 MiB response limits. The socket parent now owns child `TMPDIR`, so a killed/timed-out child cannot leave a 49 MiB taxonomy copy behind. Raw dateTime periods are rejected rather than incorrectly moved to the previous calendar day.

The follow-up also closes PDF-as-Arelle forgery, requires cutoff-aware structural proof for legacy issuer-document reads, preserves full partial-document status after accounting checks, and labels raw YTD/discrete-quarter/instant contexts without converting their values. EPS × diluted weighted shares must reconcile with common income under frozen `diluted-eps-common-income-v1`; the normalized route requires 20 actual reconciled discrete-quarter triads. Missing operands may remain reported facts, but cannot become model-complete inputs.

Final verification: aggregate **377/377** (39 + 207 + 42 + 86 + 3), Python **20/20**, product **151/151**, migration **79/79**, legacy **2/2**; zero skips. ESLint, TypeScript and production build pass. Same-code full output: `/tmp/stockinsider-fact-scope-exact-full.log`; canary summary: `/tmp/stockinsider-fact-scope-final-summary.json`; build: `/tmp/stockinsider-fact-scope-exact-build.log`. Independent PostgreSQL acceptance includes 22 rejection vectors and 12 availability-cutoff fields each for v8/v10 evidence.

One conservative operational gap remains: the validation worker's raw peer set can still include unproved historical issuer rows, potentially rejecting an otherwise proved new value. The published PIT reader excludes unproved rows, so this is a false-negative/backlog risk, not permission to use unproved values. It is not represented as solved by this draft.

Append `20260911_05_financial_fact_isolation_v10.sql` **after** the previously reviewed history-v1 migration; preserve all prior ordering. The PR remains draft pending integration onto the post-PR210 main graph and exact review. Provisioning, backlog draining, 2892's authoritative document alternative, PDF semantic extraction and automatic issuer guidance remain unfinished; do not claim full source or valuation completion.

## Scope and identity

- Clean independent checkout: `/tmp/stockinsider-financial-completion-20260911`.
- Base: PR #210, exact `a00ab5aa6551c47621148373c8fc1b695e39d2c2`.
- Branch: `codex/financial-evidence-completion`; integration commit `a8c43b2`.
- Incorporated the reviewed parser work from PR #215. The frozen PR #210 checkout was not modified.
- PR #210 now points to `8b79c30f2369a8268afd0ccc4207a691a235276a`; this branch and its test evidence still start from the explicitly assigned `a00ab5aa6551c47621148373c8fc1b695e39d2c2`. This stacked draft is not merge-ready. After PR #210 lands, rebase or cherry-pick onto the new main and repeat exact-commit tests and review; the results below do not certify that future integrated graph.
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

## Initial global-document canary — historical audit, superseded by the scoped follow-up above

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

1. Review the scoped admission path above; it still rejects 2892 and all affected Equity/ProfitLoss facts. Resolve missing financial inputs through authoritative evidence, not suppressed structural errors.
2. Review and apply migrations in explicit order: manifest v8 → fairness 02 → document links 03 → Taiwan refresh queue 04 → history v1. Lexical filename order is not valid.
3. Provision the exact reviewed public taxonomy and compatible parser/socket code together. Historical taxonomy versions needed for earlier filings remain a verification prerequisite.
4. Establish 1,320 actual database-authoritative completed trading sessions, then drain bounded history batches and verify remaining field/period/month coverage. A single nightly batch cannot establish deep-history completion.
5. PDF financial semantic extraction remains explicitly unsupported by the v8 authority contract. A locator is not a financial fact.
6. Automatic issuer-guidance acquisition is not implemented. The deterministic company-fact projection and typed guidance boundary do not supply missing customer, shipment, capacity, yield or ASP evidence.
7. Complete exact-commit review and protected checks before any merge or deployment. The draft is not a claim of completed financial coverage, and the fatal 2892 result cannot be relabelled successful.
