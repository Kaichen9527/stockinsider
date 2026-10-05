# Industry association receipts v1

Approved batch B; base `62d9d9aaa7c45a802dee3270a6e60ccfe84e67f9`.

## Requirements

- An industry source that never named a company may support a researcher's separately identified `industry_hypothesis`. It must not acquire company symbols, count as an independent company mention, change attention/quality scores, satisfy direct factor bindings, alter Top 20, promote a queue disposition, or create a first-discovery/price record.
- Extend the existing exact-bearer `POST /api/internal/research-priority-run` assessment with an optional associations array. The previous request and response stay compatible when none are provided; no public API or schema is added.
- Allow at most 3 raw associations per company, 50 per run, 12 company-basis document IDs per association and 100 distinct source/basis IDs globally. IDs are UUIDs; source hashes are lowercase SHA-256; root URLs are clean canonical HTTPS links. Exact input shape and bounded researcher-authored text reject caller authority/status flags and credential-like data.
- Resolve IDs directly from `source_raw_documents` using an explicit finite column projection, independent of the rolling discovery window. Every SELECT and evidence-head RPC batch is at most 50. Enforce an abortable 15-second total read deadline, per-response and aggregate decoded data bounds, and bounded per-root revision audits.
- Bind requested document ID, canonical hash and original root to database values and `research_evidence_heads_v1` at the original data cutoff. A valid industry source has explicit industry scope and no symbols; company-basis documents have direct-company scope and the exact company's symbol. Each must have valid publication/first-observation/revision/collection clocks, rights and current identity. Do not accept future evidence, denied or withdrawn claims, a different current head, unresolved repost parent, metadata-only material, or ambiguous same-clock revisions.
- A company-basis match is still not an independently validated industry-to-company relationship. Status remains `hypothesis`; absence of company evidence remains `needs_evidence`. Finite proof, current gaps and hash are saved in the existing immutable run rows and returned to the authorized caller.
- The association is newly observed by the server in this run: `associationObservedAt`, `researchObservedAt` and `availableAt` use the server clock. The original `dataCutoff` remains explicit and `usableAtCutoff` is always false. Writer `associatedAt` never establishes historical availability. No global first association time or cross-run historical knowledge is invented. The server clock participates in the hash.
- Preserve failure/retraction/supersession receipts. Database read failures are unavailable research, not no-news claims; raw database messages never leave this route.

## Acceptance coverage

| Area | Tests |
| --- | --- |
| Old source, missing basis, independent-review status, legacy no-op | IA01–IA03, AR02 |
| Bounds, exact keys, IDs, text and secret rejection, same-root dedup | IA04–IA05, IA23, AR01, AR03 |
| Server clocks/hash and zero ranking/discovery influence | IA06–IA07, AR02–AR03, AR08 |
| Denial, withdrawal, supersession, missing/future/reversed clocks | IA08–IA12, IA27, AR04 |
| Parent lineage, conflicting/legacy/malformed heads and history bounds | IA13–IA16, IA25 |
| Company scope and bounded rights | IA17–IA19, IA26 |
| Failures, deadlines, response bounds and escaped queries | IA20–IA24, AR05–AR07 |

## Non-goals

No new source fetches, historical backfill, research score/weight changes, deep-job nomination changes, article citation permission, strategy/trade changes, production imports, deployment or protected approvals. This batch makes hypotheses accountable and visible in internal run receipts; consuming them in deep research or article paragraphs requires separately reviewed integration.
