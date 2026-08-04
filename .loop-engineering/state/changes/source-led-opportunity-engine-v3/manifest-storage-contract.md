# Canonical Manifest Storage Contract: source-led-opportunity-engine-v3

Version: `opportunity-manifest-storage-v3.10`

This contract is the single physical paging, hashing and lifecycle authority for every V3 dataset/authority manifest. Domain contracts continue to own native row tuples, eligibility, ordering, conservation and semantic header fields; this contract owns how those exact ordered values become durable pages and one named manifest hash. No domain manifest may hash an unbounded monolithic row array or invent another page/root shape.

## Closed kinds, headers, sections and bounds

`manifestKind` is exactly one row below. `header` contains every listed field as `[fieldName,value]` pairs sorted by ASCII field name. Counts/reason maps listed by the domain contract remain header values and must agree with section rows. Sections occur in the exact listed order, including an empty section. A combined bound applies across the named sections; observing one more native row fails the domain's existing overflow/bound code before any successful root.

| manifestKind | contractVersion | Exact header fields | Ordered section keys and maximum rows |
|---|---|---|---|
| `source_eligible` | `source-adapter-v3.3` | `sourceKey,sourceCutoff,registeredFamilyCount,eligibleCount` | `rows` <=1,000,000 per connector after registry-first 1,000,000-family and database-enforced 64-revision/family bounds |
| `source_identity_allowlist` | `source-identity-allowlist-v3.1` | `sourceCutoff,rowCount` | `rows` <=10,000 |
| `publisher_verification_allowlist` | `source-publisher-allowlist-v3.0` | `sourceCutoff,rowCount` | `rows` <=10,000 |
| `instrument_roster` | `tw-instrument-roster-v3.0` | `rosterVersion,sourceCutoff,rowCount` | `rows` <=20,000 |
| `alias_authority` | `alias-normalization-v3.0` | `algorithmVersion,sourceCutoff,rowCount` | `rows` <=100,000 |
| `taxonomy_assignment` | `tw-sector-taxonomy-v3.0` | `sourceCutoff,taxonomyMapHash,rowCount` | `rows` <=20,000 |
| `peer_reviewer_allowlist` | `peer-reviewer-allowlist-v3.0` | `sourceCutoff,rowCount` | `rows` <=1,000 |
| `peer_authority` | `peer-authority-v3.0` | `sourceCutoff,rosterManifestHash,publisherVerificationAllowlistManifestHash,peerReviewerAllowlistManifestHash,scannedRowCount,exclusionReasonCounts` | `selected_rows`, `excluded_rows`; combined <=100,000 |
| `source_dataset` | `source-dataset-v3.3` | `sourceCutoff,sourceFunnelPolicyHash,sourceIdentityAllowlistManifestHash,sourceAdapterRegistryHash,publisherVerificationPolicyHash,publisherVerificationAllowlistManifestHash,instrumentRosterManifestHash,aliasManifestHash,taxonomyMapHash,taxonomyAssignmentManifestHash` | `connector_roots` <=20, `selected_revision_rows` <=20,000, `connector_conservation` <=20 |
| `candidate_financial` | `candidate-financial-v3.0` | `sourceCutoff,orderedSymbols,financialContractVersion,sectorValuationReferenceManifestHash` | `selected_facts`, `excluded_facts`; each <=4,000, `conservation` <=20 |
| `factor_scoring_reference` | `opportunity-features-v3.2` | `sourceCutoff,featureVersion,providerFieldAllowlistHash,priceProviderAllowlistHash,rosterManifestHash,taxonomyMapHash,taxonomyAssignmentManifestHash,tradingCalendarWindowHash,coverageDecisions` | `included_rows`, `excluded_rows`; combined <=360,000, `conservation` exactly 18 |
| `sector_scoring_reference` | `sector-reference-v3.1` | `sourceCutoff,rosterManifestHash,taxonomyMapHash,taxonomyAssignmentManifestHash,providerFieldAllowlistHash,priceProviderAllowlistHash,corporateActionVersion,financialContractHash,tradingCalendarWindowHash` | `market_benchmark_rows` exactly 2, `sector_aggregate_rows`, `sector_aggregate_exclusions`; combined <=350, `aggregate_evidence_rows` exactly `10*K+2*U` and <=200,000 under the sector-reference v3.1 reuse equation, `sector_excess_included_rows`, `sector_excess_excluded_rows`; combined <=40,000, `conservation` exactly 10 |
| `sector_valuation_reference` | `opportunity-financial-inputs-v3.3` | `sourceCutoff,financialContractVersion,methodVersion,rosterManifestHash,taxonomyMapHash,taxonomyAssignmentManifestHash,priceProviderAllowlistHash` | `included_rows`, `excluded_rows`; combined <=20,000 after roster-first four-series selection with at most 128 immutable facts per series, `aggregate_rows` <=160, `conservation` exactly 7 |
| `bias_reference` | `opportunity-factor-correctness-v3.11.6` | `sourceCutoff,asOfSession,priceProviderAllowlistHash,corporateActionVersion,rosterManifestHash,taxonomyAssignmentManifestHash,tradingCalendarWindowHash` | `current_rows`, `excluded_rows`; combined <=40,000, `sector_rows` <=200, `conservation` exactly 3 |
| `technical_history_reference` | `opportunity-factor-correctness-v3.11.6` | `sourceCutoff,asOfSession,orderedDeepSymbols,priceProviderAllowlistHash,corporateActionVersion,tradingCalendarWindowHash,biasReferenceManifestHash` | `market_benchmark_rows` <=122, `raw_adjusted_rows` <=31,940, `history_rows` <=15,160, `excluded_rows` <=20, `conservation` exactly 2 |
| `reported_pe_reference` | `opportunity-financial-inputs-v3.3` | `sourceCutoff,asOfSession,orderedDeepSymbols,rosterManifestHash,taxonomyAssignmentManifestHash,financialContractVersion,tradingCalendarWindowHash` | `own_history_rows` <=25,200, `sector_current_rows` <=20,000, `excluded_rows` <=20,020, `sector_rows` <=200, `conservation` exactly 3 |
| `market_reference` | `market-context-v3.6` | `sourceCutoff,providerFieldAllowlistHash,priceProviderAllowlistHash,rosterManifestHash,taxonomyAssignmentManifestHash,orderedCandidateSymbols,moverAuditId,moverPriceReferenceManifestHash,tradingCalendarWindowHash,recentSessionPlanHash` | `included_rows`, `excluded_rows`; combined <=1,024, `conservation` <=64 |
| `mover_price_reference` | `mover-audit-price-v3.3` | `sourceCutoff,auditedSession,auditedSessionAuthorityHash,previousSession,previousSessionAuthorityHash,recentSessionPlanHash,instrumentRosterManifestHash,priceProviderAllowlistHash,corporateActionVersion,rosterCount` | `included_rows`, `excluded_rows`; combined <=20,000, `conservation` exactly 1 |
| `sector_benchmark` | `sector-benchmark-v3.1` | `sourceCutoff,canonicalSector,entrySession,entrySessionAuthorityHash,tradingCalendarWindowHash,rosterManifestHash,taxonomyAssignmentManifestHash,priceProviderAllowlistHash,corporateActionVersion` | `entry_rows` <=20,000, `evaluation_rows` <=5,000,000, `session_conservation` <=250 |
| `outcome_input` | `source-led-eval-v3.7` | `sourceCutoff,runPurpose,evaluationDatasetLockHash,comparisonContractKey,tradingCalendarWindowHash,priceProviderAllowlistHash` | `input_rows`, `excluded_rows`; combined <=20,000 after the exact 30,241 raw-score sentinel, `conservation` exactly four rows per ordered input run and <=2,016 |
| `evaluation_input` | `source-led-eval-v3.7` | `evaluationCutoff,evaluationDatasetLockHash,comparisonContractKey,tradingCalendarWindowHash,priceProviderAllowlistHash,backtestCount,liveCount` | `attempt_roster` exactly 252, `backtest_rows` <=120, `live_rows` <=20, `cohort_rows`, `exclusion_rows`; each <=20,000, `conservation` <=140; header counts equal the two actual sections |
| `link_audit_sample` | `source-led-eval-v3.7` | `evaluationManifestHash,allocationVersion,populationCount,sampleSize,stratumCount` | `strata` <=400, `samples` <=400 with one <=384-byte private review-context slice per sample |
| `link_audit_resolution` | `source-led-eval-v3.7` | `evaluationCutoff,sampleManifestId,sampleManifestHash,resolvedCount,unresolvedCount` | `resolved_rows`, `unresolved_rows`; combined exactly the bound sample count and <=400; `evaluationCutoff` must byte-equal this manifest's non-null generic `sourceCutoff`, its owning evaluation run cutoff and the bound `evaluation_input` cutoff |

`source_dataset.connector_roots` contains the ordered `[sourceKey,registeredFamilyCount,eligibleCount,sourceEligibleManifestHash]` values for attempted registry keys. The source-eligible root is therefore reused rather than embedding up to one million rows again, while its header proves that cutoff-ineligible families were included in the prefilter bound. `source-adapter-contract.md`, `market-contract.md` and `shadow-evaluation-contract.md` are the executable native-row authorities for `source_dataset`, the two market kinds and the four evaluation kinds respectively. Calendar tuples remain bounded embedded evidence owned by `trading-calendar-contract.md`; they do not create another manifest kind. `mover_price_reference` repeats exactly once per available member of the five-most-recent completed-session list, ordinal zero newest; every instance retains the row bound above, so one run processes at most 100,000 mover terminal rows across resumable pages and never one unbounded request. A mode that cannot consume a kind stores no input binding for that kind; it does not create an empty invented manifest.

The R14 kinds use the following exact native rows. `bias_reference.current_rows` are
`[stockId,symbol,canonicalSector,asOfSession,bias20Pct,bias20Atr,ma20,atr14,
adjustedPriceEvidenceRef,corporateActionVersion]`, ordered sector/symbol/stock ID;
the final literal is exactly `tw-corporate-action-v3.1`, while the preceding ref is
the complete adjusted-price evidence ref whose hash-bound payload carries every
selected raw-price and corporate-action snapshot identity;
`sector_rows` are `[canonicalSector,asOfSession,count,p10,p25,p50,p75,p90]` in
sector order. `technical_history_reference.market_benchmark_rows` are the latest at
most 122 cutoff-valid completed-session TAIEX observations
`[session,close,sourceRef]`, ordered oldest-to-newest. The technical consumer requires
the exact 122 sessions aligned with its selected stock window; a missing or mismatched
row closes as `taiex_reference_unavailable` and is never substituted.
`technical_history_reference.raw_adjusted_rows` are
`[symbol,anchorBlockOrdinal,anchorSession,sessionOrdinalWithinBlock,session,
adjustedOpen,adjustedHigh,adjustedLow,adjustedClose,adjustedPriceEvidence,
adjustedVolume]`, ordered
symbol/block/session ordinal, with both ordinals oldest-to-newest.
`adjustedPriceEvidence` is the full nested
`adjusted-price-evidence-v3.1` tuple from `market-contract.md`; an adjacent block may
repeat the same session only with its own distinct complete anchor evidence. Every
history endpoint uses the 120 chronological rows ending at that endpoint, including its
final 20/60/120 close windows and 14 true-range terms plus the preceding close; it is
therefore reproducible without a live adjustment lookup. `history_rows` are
`[symbol,endpointOrdinal,session,bias20Pct,bias60Pct,bias120Pct,
bias20Atr]`; they sort ordered deep symbol then endpoint ordinal, while the history
endpoint is strictly before `asOfSession`. `reported_pe_reference`
`own_history_rows` are `[stockId,symbol,exchange,session,sessionAuthorityId,reportedPe,
close,sourceRef,publishedAt,sourceTimestamp,collectedAt,recordedAt]` and deliberately
contain no shares field; they sort ordered deep symbol then descending completed-session
ordinal. Its `sector_current_rows` are `[stockId,symbol,canonicalSector,exchange,
asOfSession,sessionAuthorityId,reportedPe,close,sharesOutstanding,sharesPeriodEnd,
sharesSourceRef,sharesSourceTimestamp,peSourceRef,peRecordedAt]`, sorted sector/symbol/
stock ID. Shares are non-null only in this sector-current row and are the separately
selected historical official fact. `sector_rows` are
`[canonicalSector,asOfSession,count,p25,p50,p75,capWeightedAggregate]`. Excluded rows
carry the domain's closed reason. A page cursor is the complete native row plus ordinal;
it cannot be caller-selected or regenerated from a live table. Every conservation
section records all required included/excluded totals, including zero.

For `source_identity_allowlist`, `publisher_verification_allowlist`, `instrument_roster`, `alias_authority`, `taxonomy_assignment` and `peer_reviewer_allowlist`, `rows` contains every post-supersession selected stream event from `authority-supersession-contract.md`, not only active membership. Each row carries the selected event's actual authority/listing status and its manifest `terminalCode` is exactly `effective_active|revoked_or_expired`; `rowCount` includes both codes and consumers admit only `effective_active`. For `peer_authority`, supersession occurs before the existing selected/excluded classification and inactive/expired latest events enter `excluded_rows`. `mover_price_reference.rosterCount` is the count of effective-active common-stock consumer members from the bound instrument manifest, not that manifest's terminal-row count.

## Canonical rows and pages

For every native domain row in its normative order, `rowOrdinal` starts at zero within the section. `payload` is that exact native JSON tuple/object. `payloadCanonical = UTF8(RFC8785(payload))` and `payloadHash = SHA256(payloadCanonical)` lowercase hex. `terminalCode` is the domain's included/excluded/reason code or null when its row shape has none. The exact row identity is:

```text
identityKey = SHA256(UTF8(RFC8785([
  "opportunity-manifest-row-identity-v3.3",
  manifestKind, sectionKey, rowOrdinal, payloadHash
])))
```

Every native selector independently applies database knowledge-time eligibility `recorded_at <= sourceCutoff` before authority precedence, freshness, ordering, sentinel counting and paging. `recordedAt` is serialized and hash-bound only when the owning domain's exact native tuple lists that field; otherwise the manifest binds the selected value/source identity and the database predicate, not an extra implementation-invented tuple member. Later-recorded rows therefore cannot enter an earlier root, while a byte-identical eligible observation need not change a domain tuple that intentionally omits storage knowledge time. This rule is the sole interpretation of `OPS-014`; run/result `recorded_at` is never substituted for input eligibility.

Rows are greedily partitioned from the next ordinal into the largest consecutive page satisfying all of: `rowCount <= 2000`, canonical page byte length <=786,432 bytes, and total unencoded bytes of `pageCanonical`, canonicalized `pageJson`, all `payloadCanonical` values and all canonicalized `payloadJson` values <=3,145,728. This bundle rule is evaluated deterministically before transport; the encoded PostgREST request must also remain <=5 MiB. A single row that cannot fit fails `bound_violation`; rows are never split or truncated. `pageOrdinal` starts at zero. The exact page preimage is:

```json
["opportunity-manifest-page-v3.3",manifestKind,contractVersion,sourceCutoffOrNull,
 sectionKey,pageOrdinal,firstRowOrdinal,
 [[rowOrdinal,identityKey,terminalCodeOrNull,payload],...]]
```

`pageCanonical = UTF8(RFC8785(pagePreimage))` and `pageHash = SHA256(pageCanonical)`. `firstIdentity` and `lastIdentity` are the first/last row identity keys; both are null only for an empty section, which has no page. Page rows must be consecutive, identities and payload hashes must recompute, and the page's stored canonical/JSON copies must agree.

## Root and named manifest hash

The exact root preimage is:

```json
["opportunity-manifest-root-v3.3",manifestKind,contractVersion,sourceCutoffOrNull,
 [[headerFieldName,headerValue],...],
 [[sectionKey,totalRowCount,
   [[pageOrdinal,firstRowOrdinal,rowCount,firstIdentity,lastIdentity,pageHash],...]],...]]
]
```

Header pairs and sections use the exact orders above; pages use consecutive ordinal order. Empty sections appear as `[sectionKey,0,[]]`. `rootCanonical = UTF8(RFC8785(rootPreimage))`; the lowercase `SHA256(rootCanonical)` is both `manifestHash` and the domain's named hash (`aliasManifestHash`, `factorScoringReferenceManifestHash`, etc.). Domain references to a “manifest preimage” describe the header fields and native section row values, not a second monolithic hash. Static small hashes such as `sourceFunnelPolicyHash`, `sourceAdapterRegistryHash` and `taxonomyMapHash` remain exactly as their native contracts define.

Root completion rejects a missing/extra/reordered section, page gap, row gap, duplicate identity, count/conservation mismatch, header/count mismatch, page/hash mismatch, unknown kind/version/terminal code, non-finite payload or bound violation. It recomputes the root only from immutable stored page/row canonical bytes; it never queries live source tables.

## Durable lifecycle and resume

Owning-job payloads, output refs and successor descriptors are governed by `job-graph-contract.md`. Outputs are exact: header stores `SHA256(headerCanonical)`, page stores `pageHash`, and root stores `manifestHash`; each stores its parent manifest ref, the exact count composite from `postgres-type-contract.md` and one database terminal timestamp in the same lifecycle transaction. No worker or caller may supply the next cursor, page ordinal, section transition, root transition or successor job identifier.

`create_opportunity_manifest_v3` inserts `opportunity_manifests_v3` as `building` with immutable `manifestId,manifestKind,contractVersion,sourceCutoffOrNull,headerCanonical,headerJson,createdAt,recordedAt`; root/hash/count/terminal fields are null. It locks and validates the database-owned header descriptor, marks the one `manifest_header` job succeeded with all-zero counts, derives the first non-empty section by an indexed `EXISTS` query and atomically inserts exactly one deterministic page descriptor/payload or, when all sections are empty, the root descriptor/payload. `append_opportunity_manifest_page_v3` locks the live database-owned page descriptor, independently reruns its exact bounded selector after the stored cursor, requires caller rows to be the largest consecutive greedy page satisfying the count/byte boundary, commits complete rows and one page, marks the page job succeeded, then atomically inserts exactly one deterministic next-page, next-non-empty-section or root descriptor/payload. Exact same header/page canonical/hash plus owning-job result and successor is idempotent; a differing occupied header/page/job/successor is `data_integrity_failure`.

The page descriptor's `(sectionKey,pageOrdinal,firstRowOrdinal,previousPageIdOrNull,previousPageHashOrNull,afterIdentityOrNull)` is the sole continuation authority. For a non-first page the RPC re-derives the immediately preceding deterministic page, verifies those three predecessor members, loads its last stored native payload and applies the domain contract's exact comparator strictly after that payload; an identity hash alone is never used as an ordering cursor. Selection observes at most the next 2,001 native rows so the database can prove the 2,000-row limit and greedy byte boundary without an unbounded response. For `sector_valuation_reference`, deriving those next native rows first re-enumerates the complete bounded roster/series plane under `financial-data-contract.md`, sorts at most 20,000 terminals by the native comparator, then applies that strict cursor and `LIMIT 2001`; missing early series never authorize a roster-prefix shortcut or an underfilled intermediate page. A crash before a header/page transaction commits leaves neither its success nor its successor; a crash after commit leaves both. Resume therefore claims the already-created deterministic successor and never rebuilds complete pages or invents a cursor from live input.

Only `complete_opportunity_manifest_v3(jobId,ownerToken,manifestId,rowCount,rootCanonical,rootJson,manifestHash)` may perform the single `building -> complete` update. It locks the live root job and manifest/pages/rows, validates the supplied <=3,145,728-byte canonical root/JSON/hash against every stored page descriptor and all domain conservation, and atomically sets `rowCount,rootCanonical,rootJson,manifestHash,terminalAt,status=complete`, marks the owning `manifest_reference` job succeeded and inserts the exact next header, seal or post-seal/finalize descriptor/payload required by `job-graph-contract.md`. Only `fail_opportunity_manifest_v3(jobId,ownerToken,manifestId,failureCode)` may perform `building -> failed`, setting a closed failure code and terminal time without a hash while atomically failing its owning manifest job and parent run without a successor. A crash before root completion commits leaves none of manifest completion, job success or successor; a crash after commit leaves all three. The manifest lifecycle trigger permits exactly those field transitions while rejecting header/identity/recorded-time changes; after either terminal state every manifest/page/row rejects update/delete. Thus terminal manifests are append-only while incomplete construction remains resumable.

The generic `opportunity_manifests_v3`, `opportunity_manifest_pages_v3` and `opportunity_manifest_rows_v3` tables are the only physical manifest tables. Names such as `sector_scoring_reference_manifests_v3` and `sector_benchmark_manifests_v3` are logical manifest kinds, not additional physical tables or views. Every run input references the generic `manifest_id` and verifies the expected closed kind/version.

## Acceptance authority

Maximum fixtures build every kind at its valid bound where feasible, interrupt before and after every header/page/root transaction boundary, resume in a different worker schedule, shuffle insertion attempts, and require one deterministic successor plus identical rows/pages/root/hash. They prove a page job cannot skip, repeat or forge the database-owned cursor and that the greedy page boundary is rechecked from native rows. Sentinel-overflow fixtures fail before a complete root. Migration catalog acceptance proves the generic-kind checks, descriptor/payload ownership, lifecycle trigger/RPC grants, canonical byte columns, indexes and terminal immutability; no dedicated sector manifest table is expected.
