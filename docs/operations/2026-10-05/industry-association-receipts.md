# Industry source to company hypothesis — batch B

Base: `62d9d9aaa7c45a802dee3270a6e60ccfe84e67f9`.

This batch lets an authenticated researcher attach an accountable, still-unverified company hypothesis to a stored industry source. It does not claim the original author mentioned the company. The server resolves the source itself, records what is missing and retains the association separately from direct-company discovery evidence.

## Existing route and stored shape

Use the existing `POST /api/internal/research-priority-run` with the exact internal bearer. Add `associations` to an existing assessment. No new API, table, migration, provider call or production import is introduced.

Each input has exactly these fields:

| Field | Meaning and bound |
| --- | --- |
| `relation` | Exactly `industry_hypothesis`. |
| `sourceDocumentId` | Existing source document UUID. |
| `sourceContentHash` | Exact lowercase 64-character canonical database hash. |
| `sourceRootId` | Exact clean HTTPS canonical root, not a fabricated company mention or a repost parent. |
| `hypothesis` | Researcher's possible company benefit, 4–600 characters. |
| `rationale` | Why that benefit needs investigation, 4–600 characters. |
| `strongestCounterEvidence` | Strongest limiting alternative or missing proof, 4–600 characters. |
| `companyBasisDocumentIds` | 0–12 distinct existing document UUIDs. An empty array remains `needs_evidence`. |
| `associatedAt` | Writer's claimed authoring time, a valid instant at/before the supplied data cutoff. It grants no historical availability. |

Text is trimmed, contains no control characters, and rejects credential-like fragments. At most 3 raw associations per company, 50 per run and 100 distinct source/basis IDs are accepted before database access. Repeated identical hypotheses for one company deduplicate by canonical input; duplicates still count against admission bounds. Identical original sources associated with multiple companies retain one root identity and contribute **zero** direct source roots to each company.

The route keeps the original ranking and price computation first. Association resolution then appends, only for companies that supplied associations:

- `sourceAssociations`: finite input, server-resolved proof/gaps and `associationHash` per association.
- `associationObservedAt`: the current run's server observation clock.
- `hasResearchCue`: whether usable source proof permits investigating this hypothesis now; not research qualification or a trade signal.

The response exposes the same associations. Stored rows participate in the existing immutable `input_hash`. When no associations are supplied, these fields and additional reads are absent. Original score, Top 20 queue, factors, first-discovery fields and price evidence are unchanged. A source-only cue does not automatically enqueue or promote a company.

## Source authority, cutoff and rights

The resolver reads `source_raw_documents` by exact IDs, projecting only `id, platform, document_url, published_at, collected_at, symbols, metadata, canonical_content_hash, content_semantics`. It never fetches or returns `content_text`, titles, source summaries, transcript excerpts or credentials. Metadata is used internally and only finite proof fields leave the resolver.

For each requested source and company-basis document:

1. The canonical hash, canonical root and revision URL must agree with the database. Explicit industry scope requires empty raw symbols. Basis documents must have direct-company scope and the requested issuer symbol; the official common-stock roster must contain the issuer.
2. Publication ≤ first observation ≤ revision observation ≤ collection ≤ original `dataCutoff`. Missing or malformed clocks remain gaps. This does not rewrite old document timestamps to get an old source into the rolling window.
3. `research_evidence_heads_v1` must identify that exact document as the cutoff-visible current head. The boolean `superseded=false` alone is insufficient: different `headId` still rejects. Same-row `claim_status=denied` is inspected directly because that RPC can return false booleans for it.
4. A bounded canonical-root audit also includes legacy `document_url` fallback rows across platforms. Every maximum-revision-time variant is checked for conflicting hash, claims, withdrawal, symbols, scope, content semantics or rights. Malformed same-group rows cannot disappear from this audit. Older requested revisions receive their own gap without erasing a valid current revision's receipt.
5. A self-parent is the same source root. Any nonself parent is conservatively `parent_unresolved`; one-level SQL lineage cannot establish a complete repost chain, so this batch does not infer it.
6. Rights must be explicit: `public` + `public_citation` with an allowed public/publisher/authorized acquisition, or `authenticated_summary` + `bounded_summary_only` + `authenticated_browser_summary`, research-summary form and no excerpts. Authenticated proof stays internal and never grants permission for article publication. Metadata-only items and chapter titles do not qualify.

The public Threads account name `investanchors` does not itself prove a paid member source. This resolver uses the stored rights tuple and only exports finite internal proof; it does not call or change the legacy dossier/article name-based member filter. No original article body is copied by this batch. Source rights and mention truth remain reviewed ingestion inputs, not conclusions the server can verify from missing original text.

## Time and evidence statuses

Every record remains `status: hypothesis`, `hypothesisOrigin: authenticated_research_submission`, `rankingInfluence: false` and `directSourceContribution: 0`. It never reports an official fact, confirmed customer/order or supported company thesis.

| Evidence status | Meaning |
| --- | --- |
| `needs_evidence` | Missing source/company evidence, wrong binding, future evidence, invalid scope/rights or another explicit gap. |
| `awaiting_independent_review` | Source and direct-company basis resolve; the relationship itself is still unreviewed. |
| `needs_update` | Superseded or conflicting revision, unresolved parent or incomplete bounded source history. |
| `invalidated` | A requested source/basis is denied or withdrawn. |
| `unavailable` | Database failure, response/identity bound failure or expired read deadline. |

`dataCutoff` retains the original request cutoff. `researchObservedAt` and `availableAt` use the current server clock; `usableAtCutoff` is always false. Even a backdated writer `associatedAt` cannot make a hypothesis historically known. A new run can consequently have a different hash at the same data cutoff because its observation clock is different. There is no cross-run first-association claim, historical association lookup or retrospective first-discovery price capture in this batch.

## Read and error bounds

- At most 100 distinct requested documents; exact-ID SELECT and RPC chunks at most 50.
- One canonical/fallback audit per distinct canonical root, at most 50 returned rows per audit. Exactly 50 means saturated and remains an explicit gap. The query uses quoted PostgREST values and an escaped anchored PostgreSQL regex, including URLs with punctuation and literal percent/underscore/asterisk characters.
- Every query carries an AbortSignal. A 15-second deadline applies to the entire association read operation; an unresolved adapter is bounded by a timer race too.
- Each decoded response is at most 128 KiB; aggregate decoded data at most 2 MiB. These bounds are checked after transport decoding; they are not a database response-byte quota.
- Read failures preserve a receipt for every submitted association but fail closed on all association proof for that run. Missing news is never inferred from failed reads. Immutable persistence and source-provenance operations keep bounded stable errors rather than database diagnostics.

## Validation and remaining work

Tests use synthetic source bodies and clocks; they do not establish that a real article was acquired, that any platform is enabled, or that production accepted an import.

**122 tests passed, 0 failed, 0 skipped** across the resolver, actual compiled priority route, priority algorithm, discovery evidence/price enrichment, source roots, inbox and source-attempt controller. This includes 27 new resolver cases and 8 new executable route contracts. The route comparisons prove the original queue, scores, factors, first-discovery state and price context stay unchanged with supplementary association receipts. A previous implementation weakness that let malformed same-clock metadata evade conflict checks was found independently and repaired with explicit regression tests.

```sh
node --experimental-strip-types --test \
  src/lib/research-source-association.test.ts \
  src/app/api/internal/research-priority-run/route.contract.test.ts \
  src/lib/research-agent-priority.test.ts \
  src/lib/research-discovery-evidence.test.ts \
  src/lib/research-discovery-price-enrichment.test.ts \
  src/lib/research-source-roots.test.ts \
  src/lib/research-inbox.test.ts \
  src/lib/research-source-attempt-controller.test.ts
```

Run from `web` with Node 22.14.0. The actual route uses a controlled database adapter rather than a live PostgREST service.

An independent disposable PostgreSQL 17.10 cluster loaded the repository's exact `research_evidence_heads_v1` function and passed **15 probes**, including older-than-14-day sources, same-row denial's false flags, retractions, a different equivalent head with false superseded, malformed legacy/null-identity siblings, and escaped canonical/fallback regex predicates. TCP was disabled; the temporary Unix-socket cluster was stopped and removed afterward. This verifies SQL predicates and generated quoting, not a live PostgREST server.

`npm run typecheck`, `npm run lint` (0 errors, 33 existing warnings), the ordinary Mac `npm run build`, and `git diff --check` passed. Logs are `/tmp/stockinsider-association-{tests,typecheck,lint,build}.log`. Dependencies were APFS-cloned into the isolated worktree for the normal build; no product configuration or lockfile changed.

Known limits: company-basis industry matching still needs independent review; transitive repost resolution and historical association reuse are not implemented; bounded saturated roots must wait for a later reviewed resolver; company article citation support is a separate batch C. No scoring, financial estimate, order stage, source first-seen history, strategy, public page or live database was modified.
