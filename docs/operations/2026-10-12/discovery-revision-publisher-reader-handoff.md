# Frozen revision / publisher read projection — A slice

Base: `8bcd18e77fee8e43c1a936cd4b3834c7bff5dd14`. Ownership is the two new
`discovery-revision-publisher-reader` library/test files. No existing adapter,
server projection, workflow, policy, writer, SQL or API changed.

`readDiscoveryRevisionPublishers` is a pure, bounded projection of an injected
frozen read packet. Its snake_case projected columns come from the existing
`opportunity_runs`, `opportunity_run_manifest_inputs`,
`source_document_revisions_v3`, `source_identity_authorities_v3`,
`source_revision_family_registry_v3`, `publisher_verification_authorities_v3`,
`source_publication_verifications_v3`, `opportunity_manifests_v3` and
`opportunity_manifest_rows_v3` relations. See
`migrations/20260724_source_led_opportunity_engine_v3.sql` lines 244, 262, 284,
490, 838, 903, 1128, 1168, 1178; the existing publisher native layout at 9084,
root/page layout at 10360/15517/15654, and cutoff head pattern at 17476.
The existing `opportunity-v3/canonical.ts` supplies deterministic JSON hashing.

## Integrity versus authority

The count envelope is **new local read-input metadata**, not a DB relation,
role receipt, approved authority or production completeness attestation.
The upstream reader must supply exact total counts and sorted projected-row
hashes from one frozen read snapshot. The helper checks every count/hash,
run/cutoff equality, the complete publisher manifest row/page/root hash chain,
and equality with every retained publisher head. A page length or short page
never becomes a count receipt. Caller-provided counts/hashes cannot establish
that a live DB export actually included every row; hence every result retains
`live_population_verified:false`. There is no live reader in this slice.

Rows are projected metadata, not raw article text. A successful synthetic
binding only means that the injected retained verification matches its run,
revision, content hash, clocks, reviewed publisher head and frozen manifest.
It does not independently authenticate the injected authority row or recompute
article content whose raw payload is absent from this projection.

There is **no** inferred independent news root, cross-platform creator,
investment admission, source activation, rights grant or model role execution.
The output keeps these capabilities false/null. URL, document/family/content
hash, distribution identity and publisher UUID never become an independent
news-root decision. An inactive latest authority and incomplete latest revision
block prior rows; contradictory same-time heads fail closed. Conservatively,
different authority IDs at the same time also reject rather than UUID-tiebreak.

`candidate_source_mentions.source_document_id` references legacy
`source_raw_documents(id)` (20260830_source_ranking_v2.sql); its current writer
uses null. `legacy_source_document_persistence_v3_13` maps a different producer
run/stable connector namespace. Neither is an approved raw UUID -> normalized
revision bridge. Any request requiring legacy raw IDs returns explicit
`legacy_raw_revision_mapping_unavailable`; absence and ambiguity are not
resolved by URL/hash or UUID equality.

## Time, bounds and accounting

Cutoff comparisons retain all six PostgreSQL fractional digits and explicit
UTC offsets. Source publication/collection/recorded and authority approval/
recorded/valid-from clocks are checked before known identity/head selection.
Future rows cannot poison known UUIDs. Source clocks remain unchanged.
Verification/manifest sealing clocks may naturally follow source cutoff; these
are bounded by the separate read `snapshot_at`, not falsely backdated.

Caps: 4096 rows/table, 16384 aggregate rows, 4 MiB canonical input, 64 retained
rows per stream, 1000 output bindings, depth 12, 200000 structural nodes.
A preflight bounds strings/structure before canonical serialization. No
truncation is success. Every supplied row has a terminal accounting outcome;
preflight rejection uses aggregate deferred-uninspected accounting. Inspected
rows receive dispositions, stable hashes and deterministic sorting. Public
binding output excludes approving principal and private job/reservation IDs.

## Verification and remaining wiring

Tests are synthetic real-contract-shaped snapshots. They prove pure semantics,
not live publisher approval, DB/RPC/HTTP access or a real model execution.
Original test-fixture RED (35/37) and TS2345 union-array fixture RED remain in
receipts; the fixture corrections preserve all assertions. Initial fixture
`source_class:'news'` was subsequently corrected to the real `official` enum;
an explicit rejection regression now prevents that invented class.

Remaining: an existing guarded frozen-run reader must export exact populations
and count/digest evidence in a coherent snapshot, preserving terminal/missing
rows and DB-native clocks; the legacy raw mapping and independently reviewed
origin/creator decisions still need separate existing-contract work. This
slice is not connected to production candidate cards and does not change
PR374's incomplete mention-window audit or admission policy.
