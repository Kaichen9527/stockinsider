# Fixed object-bound region diagnostic

## Preserved actual evidence and exact staging delta

Before publication, GitHub staging head was verified at
`77593746d1ba30e0b33321d4e296d81a841c777e`. Its added sanitized receipt
`contabo-t18-historical-detail-object-count.json` has Gitblob
`dacd892082474beb257850086f498e535a6e04cd`; this change preserves it byte-for-byte
in the parent tree. Runtime baseline is `7c2cdbe9daf3c41cfaa8b9458cc985c0359e3a0a`.
That real run observed BOUNDS / BOUND_EXCEEDED / OBJECT_COUNT, with
rawFactUrlPolicy=NOT_OBSERVED. Its actual object region is still UNKNOWN. Previous
DB/old Next A/B/A success and detail-HTTP NOT_RUN remain separate evidence.

Use `t18-detail-object-region-stage-manifest.json`: replace only
`deployment/staging/vnext/t17_keyfd/t18_detail_read_adapter.py`; 51 verified runtime
blobs remain 51. No root orchestration, units, fixed mounts, FD contract, lock,
key handling, asset pin or production package byte changes. Source-only test code
is not included in the host runtime manifest. No new native run was done by Cloud.

## Same rejection point and traversal

Only an existing OBJECT_COUNT rejection adds optional `boundRegion`, alongside
the existing BOUNDS / BOUND_EXCEEDED / OBJECT_COUNT fields. Closed values:

| Enum | Fixed scope of rejected object |
| --- | --- |
| METADATA_DATASET_MAP | The exact metadata.datasetCompleteness object itself |
| METADATA_OTHER | Other metadata objects, including map entries and descendants |
| DETAIL_PROVENANCE | Detail provenance and descendants |
| DETAIL_VALUATION | Detail valuation and descendants |
| DETAIL_TECHNICAL | Detail technical and descendants |
| DETAIL_SECTIONS | Detail sections and descendants |
| FACT_PROVENANCE | A fact record's provenance and descendants |
| FACT_DERIVATION | A fact record's derivation and descendants |
| OTHER | All other objects |

The implementation carries compiled states only during the original recursion.
It does not build or retain raw paths, keys, indexes, values or sizes. The original
count check still runs before visiting children; each original key check precedes
its child. No second scan or SQL query is added. Context is restored on every
exit. Nested lookalike names cannot restart root classification. A wrong-shaped
list at datasetCompleteness has no object count of its own; its object descendants
are METADATA_OTHER. Review caught and corrected that diagnostic edge case.

All original thresholds, predicates and traversal remain. The other five subtype
outputs are unchanged. An AST comparison with public baseline blob
`50bfcc3d9d76758741e6c18981c0cd568d044c95` removes only diagnostic state/scope and
keywords and verifies the original bound function. Eight SQL/query/size constants
also compare identical. Duplicate JSON-key rejection and URL rules remain.

The projector accepts region only with the exact category, reason and OBJECT_COUNT
subtype, with exact string enum membership and no extra fields. Legacy two/three
field diagnostics remain readable. No raw key, path, count, data, URL, identifier,
SQL, exception or stack is exported. URL policy remains NOT_OBSERVED after any
bound rejection. No adapter capability or detail HTTP execution follows the GAP.

## Source-only metadata composition design

The public `tw-market.ts` blob is independently pinned to
`d98636ebceeb53899f133bb8729cd899becc292c` in BOTH fixed releases
`169aad1b6cfa747f78ae3464b614f43c0749d806` and
`dd59817f750684b093965f539dd4de466be13077`.
`scripts/tests/t18_metadata_semantics_composition.cjs` extracts only the fixed
dataset constant and resolveTaiwanFinalPublicationSemantics with TypeScript AST,
then executes those declarations as a synthetic oracle without application
imports. The candidate is test-only, never imported or staged for restore.

The fixed consumer uses Object.entries enumeration order, without sorting. It
matches exact daily_price / daily_valuation or case-sensitive prefix plus colon;
empty and repeated-colon suffixes also match. No match means missing. All complete
means complete; otherwise conflict takes priority, then stale, then the FIRST
noncomplete terminal, falling back to missing. That first position must be latched
separately from truthiness: terminal=[] coerces to an empty string and cannot be
replaced by a later timeout. Entry and terminal coercion are preserved. Exact
phase 'final' and finite Number(percent) clamped to 0..100 control confirmation;
missing datasets cannot become complete. shadowEligible is not consulted.

The source-only reducer summarizes these semantics into two fixed dataset entries
over its finite supported terminal profile; unknown terminals return a fixed GAP.
It retains other allowed metadata fields. It is NOT a privacy, JSON, collision,
bound or runtime admission validator. Some synthetic JS cases deliberately cover
NaN/Infinity outside finite JSON to check consumer coercion. The original live
map of more than 128 entries still rejects, including in actual PG regression.

Poisoning tests show sorting, dropping a prefix conflict, synthesizing a missing
dataset or replacing percent changes the frozen consumer result. Permanent tests
also cover first-empty-string/later-timeout, malformed entries, suffix/case
matching, clamp, phase, unknown terminal and unknown metadata field refusal.
Independent review additionally compared 3,456 deterministic synthetic cases.

If onsite later identifies METADATA_DATASET_MAP, a separate reviewed compatibility
change would need an exact public schema/terminal allowlist for ALL retained and
discarded entry fields, original collision checks before reduction, bounded
storage/work and proof against the frozen consumer. Consumer equivalence alone
cannot authorize discarding an unreviewed field or bypassing the current cap.
No such production/runtime composition is enabled here. A different observed
region requires its own consumer/schema investigation. No actual entry, count or
cause is inferred from this synthetic design.

## Verification boundary

Public synthetic fixtures test exact map versus descendants, wrong-shaped list,
nested collision names, first-failure insertion order, container-before-child,
context reset, strict output projection and canary non-disclosure. Actual owned
nonroot PostgreSQL17.11 uses Unix sockets and synthetic rows to exercise all nine
regions, verify original rows/catalog/grants and denied original RPC execution,
and prove the URL probe is not called. Independent review repeats primitive and
actual PG cases. Test counts/timing/build limitation are in the source receipt.

The isolated checkout's required web build attempt verifies its five canonical
bridge modules, then exits 127 because its Next executable is absent. Cloud
component/source tests use the existing dependency tree explicitly; they are not
a native packaged Next/true-backup detail-HTTP acceptance. HOLD, formal/site/new
radar gates, fixed SQL, URL, roles/grants, original RPC restriction and production
remain unchanged. Coordinator may separately perform exact staged onsite replay.
