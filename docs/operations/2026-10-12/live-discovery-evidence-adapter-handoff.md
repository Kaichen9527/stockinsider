# Live discovery evidence adapter — bounded legacy row audit

Base main8bcd18e77fee8e43c1a936cd4b3834c7bff5dd14. Ownership:new adapter/tests, existing loadCandidateStageCards projection, one additive optional card type. No source writer, SQL, API, scheduler, scoring, strategy, admission threshold or collector state changes. AUO article demo flags unchanged.

## Existing contracts and unavoidable gaps

`20260830_source_ranking_v2.sql` candidate_source_mentions has row UUID, stock UUID, nullable raw-source FK, mentioned_at/as_of/available_at/created_at and provenance. `20260901_source_research_shadow_v2.sql` adds publisher_key/name; these are legacy keys, not cross-platform identity authority. New PTT provenance v1 retains stock-local reply parent/index/local author/bounded excerpt/hash and read status. Body is not retained, replies are partial.

Reviewed opportunity-v3 source_document_revisions_v3 has separate approved identity/revision/family lineage. A raw FK or legacy mention is not that normalized revision. Revision family is not proof of an independent news root. No verified mapping from these legacy rows to complete approved publisher/news-root/withdrawal heads is available in the existing stage-card read. No root is invented from URL, content hash, publisher_key or conversation parent.

The source-admission policy remains unchanged. General two-resolved-publisher/two-independent-root admission and the one-article twenty-code-explicit-reply exception are NOT live enabled by this increment. No low-volume event authority is invented. Full original stock-bearing PTT body and its current revision/withdrawal binding are missing, so even twenty retained code-explicit authors are only a diagnostic lower bound. A local author is not a resolved cross-platform creator.

## Implemented boundary

The server audits its existing complete seven-day mention pages BEFORE eligibility filtering, source dedup or eight-link display truncation. Pagination remains750 with100000-row hard bound/requireComplete; stable available_at/id order is retained. New select fields are existing id/raw FK/as_of/created_at. HistoricalOnly's limit5000 rows are deliberately not treated as the current complete window. No extra DB query is introduced. Full rows grouped once by stock, avoiding per-card full-plane scans.

Adapter TW four-digit stocks only:512 rows per stock,8192 selected logical-view bytes per row,1048576 aggregate selected logical-view bytes. Unknown metadata is not serialized/read by getters. These are adapter logical projection bounds, NOT HTTP/raw-table storage bounds. Overflow returns unsupported with explicit examined/unexamined accounting; never truncated-success. Each row has a disposition and scoped candidate-mention UUID. Raw FK is never substituted for normalized source identity. Database created_at/available_at/as_of/mentioned_at are independently checked against explicit cutoff with microsecond precision, preserving input clock strings; publisher precision is not guessed. Mutable legacy rows cannot prove historical snapshot contents, recorded explicitly.

PTT diagnostic grouping uses conversation URL only to prevent cross-post pooling, never as an independent root. Counts require the actual bounded excerpt ticker with alphanumeric boundaries, exact SHA, local-match basis, matching symbol, parent/index/fragment, author and successful bounded body read. Reactions/emoji/title-only/name-only/foreign-stock/hash mismatch do not count. Repeated authors are deduped within one post. Withdrawn mention excluded; unknown raw/root withdrawal heads prevent any admission.

Every mapped DiscoveryEvidence remains complete:false/pttArticles:null for this actual legacy contract, with concrete missing-head/body/root reasons. This is data-backed unsupported, not a fabricated usable null/stub. Server projects only a compact discoveryEvidenceAudit (counts/cutoff/gaps), not private identities or retained text.

## Not yet integrated / next dependency

RadarTabs still uses admissionForLegacyCard; no UI/policy threshold was changed. Existing server cards now carry measured gaps/accounting, but the client does not consume this new audit yet. Root must review a supported immutable source/revision-to-creator/news-root mapping and full-head withdrawal reader, plus a retained stock-bearing parent-body basis, before complete:true/live candidate admission is possible. Current read is not an atomic immutable historical source snapshot. No Top20 selection/scheduling/budget job is newly implemented. Per-policy15+5 and weekly5 remain untouched.

Acceptance:synthetic rows generated through the actual PTT helper plus the actual server initializer extracted via TypeScript AST; no live crawl/DB/write/HTTP. Original main sources and prior RED receipts remain. Independent review pending.
