# Industry-only source ingestion — batch A

Base: `7c05e7c6bdc491dad4671b0341c384d35fed0c07`.

This batch lets an authorized reader retain an industry article that mentions no company. It does **not** establish a researcher-to-company association, nominate a new company, change research scores, produce orders or forecasts, or permit an industry-only citation in a company article. Those require the separately reviewed B/C integration.

## Input and identity

The existing `POST /api/internal/research-inbox` remains unchanged and authenticated. Its existing `buildResearchInboxRow` projection now carries `metadata.subject_scope` and `metadata.industry_terms`.

```json
{
  "subjectScope": "industry_context",
  "symbols": [],
  "industryTerms": ["CPO", "光學測試"]
}
```

These fields extend a complete existing `ResearchInboxItem`; this fragment is not an importable source record. No source date, content, rights receipt or live observation was invented or imported for this change.

- `industry_context` means no company is directly mentioned in this batch, so a nonempty `symbols` array rejects. Truly company-specific content uses `company_mentions`.
- Legacy omitted scope defaults to `company_mentions`. Explicit default and omitted default retain the same historical content hash. The legacy fixture remains `d66bdf1a8282409b0b70b275b8ea1cf465e57465f983ea564de7816efd50b84c`.
- Industry terms require 1–12 strings, each 1–80 JavaScript string characters, already trimmed, with no control characters or NFKC/case-insensitive duplicates. Unknown item and timed-excerpt fields reject. Numeric company symbols reject rather than coercing to strings.
- Industry scope and sorted terms enter canonical revision identity. A changed term creates a different content hash and `#si-revision-…` URL. Term ordering alone does not create a revision. Root URL and original observation stay separate from content identity.
- Row semantics remain the existing `editorial_discussion` or `metadata_only` enum; no schema change is needed.
- Inbox validates real calendar instants and source-clock order, rejecting observations after the server clock. Controller validation uses its explicit cutoff through `validateResearchInboxItemAt`. The original one-argument validator remains safe as the route's `Array.every` callback.
- Authenticated content remains bounded summaries; private timed excerpts and credential-looking fields/text reject. This is defense in depth, not an automated determination of copyright permission or semantic truth.

For the referenced InvestAnchors CPO testing article, the allowed source-layer representation is an actual reviewed summary, its real dates and rights, `industry_context`, and empty symbols. Do not insert `2409`, an invented order, or a company-benefit hypothesis into the source author's claim. This change did not fetch or import that article.

## Existing database path

`research-inbox/route.ts` still validates each item, builds source rows and upserts with `onConflict: platform,document_url` and `ignoreDuplicates: true`.

- `20260315_research_system_v2.sql` declares `source_raw_documents.symbols JSONB NOT NULL DEFAULT '[]'` without a minimum-cardinality constraint.
- `20260901_source_research_shadow_v2.sql` restricts `content_semantics` to its existing enum. The new classification therefore lives in metadata.
- `20260906_source_identity_v4.sql` supplies canonical content hash and stance fields used by the projection.
- Production release/lease/principal writer fencing remains intact. Local schema probes do not certify a deployed release, live lease or production import.

No route change, SQL migration, database-cap relaxation, production connection or production write was performed.

## Validation

Acceptance IDs IS01–IS09 map to the named tests in `research-inbox.test.ts` and `research-source-attempt-controller.test.ts`.

```sh
node scripts/run-node22.js --experimental-strip-types --test \
  web/src/lib/research-inbox.test.ts \
  web/src/lib/research-source-attempt-controller.test.ts \
  web/src/lib/research-source-extensions.test.ts \
  web/src/lib/research-deep-article.test.ts \
  scripts/research-source-controller.test.mjs
```

Result: **55 passed, 0 failed, 0 skipped**. This includes the actual compiled inbox POST handler with a controlled persistence adapter, both a valid two-item batch and rejection before persistence. It does not claim a live PostgREST request.

Three additional disposable local PostgreSQL probes passed:

1. Applied the actual source table CREATE statement plus its source-semantics and source-identity ALTER statements; inserted the builder's industry-only row with empty symbols and metadata intact.
2. Duplicate upsert retained one row; changed terms appended a different revision while preserving the first.
3. Executed the actual `research_source_heads_page_v1`: a fresh industry-only root stayed empty. Introducing a synthetic previously company-tagged revision reproduced the known historical-symbol union limitation below.

The disposable database was stopped and removed. These probes used no production credentials and did not alter migrations.

Final sequential checks after the last source change passed: `npm run typecheck`, `npm run lint` (0 errors, 33 existing warnings), and the ordinary Mac `npm run build`. Logs are `/tmp/stockinsider-industry-{tests,typecheck,lint,build}.log`; they contain synthetic test/build results, not production acceptance. `git diff --check` also passed.

The first isolated build attempt rejected a `node_modules` symlink outside Turbopack's root; replacing that development-only symlink with a local APFS clone allowed the ordinary build to run without product configuration changes. An initial parallel precheck collided while creating generated authority files; the final checks ran sequentially.

## Open limitations and next ownership

- **B/C not connected:** independent association proof, bounded source-head resolution for older referenced articles, factor binding and company-article citation support remain pending. An industry-only document alone cannot pass existing company-source qualification.
- **Historical misclassification is not repaired:** `research_source_heads_page_v1` unions symbols across eligible revisions/reposts of a root. A new empty-symbol revision cannot erase an older false company tag. Do not use this batch to claim old contaminated roots are repaired or no longer counted; fix that lineage/association boundary separately.
- **Reviewed company mentions remain input claims:** legacy company items do not include independently machine-verifiable mention spans. Changing the scope to `company_mentions` is not proof that the original author named that company.
- **No activation:** public-site access, article rights, connector health, automatic imports and company associations still need their own observed receipts. No platform is marked enabled by this change.
- **Independent review pending:** maker tests are not reviewer approval, protected attestations or permission to push, merge or deploy.
