# Private staging market metadata compatibility

## Evidence and exact scope

The staging branch was verified at
`bf84f09651f5e21b5b183656aebd90bddd958627` before publication. Its receipt
`contabo-t18-historical-market-dataset-map-bound.json`, Gitblob
`ee29d3df2e8676632c21ea833a592bde7ae0eaf5`, records the actual first refusal:
METADATA_DATASET_MAP / OBJECT_COUNT. The raw keys, entry count and values were
not published. That evidence remains unchanged in the new parent tree. It proves
the first scope, not that raw entries satisfy the new source profile or that
subsequent URL/shape/detail HTTP checks will pass.

Runtime baseline is `539578407acf883e89922a23a2bb5cd0349b71bf`. Use
`t18-market-metadata-stage-manifest.json`: one adapter replacement, 51 runtime
blobs remain 51. No new native command, unit, identity, mount, FD, key, SQL, grant,
PostgREST permission, original RPC execution, URL rewrite or release byte change.
Only the existing private same-clone SQL adapter can use the projection. This
source/test receipt does not provide live authority. Cloud used synthetic data;
the true archive/key remain off Cloud. No Contabo action or HOLD retry occurred.

## Raw validation before reduction

The original SQL remains byte-identical: one repeatable-read, read-only transaction
checks the public table types, published stock/revision pin, single metadata row,
dates and fact closure, then selects the metadata for that same detail session
and final phase. No original RPC is executed. The SQL's raw projection cap stays
512 KiB. The adapter checks the existing 1 MiB envelope limit in actual UTF-8 bytes
before JSON parsing, also checking byte input length before decoding. UTF-16,
invalid UTF-8, malformed/deep/unparseable JSON, nonfinite constants and duplicate
decoded JSON keys refuse with a fixed exception. This cannot recover duplicates
already collapsed by historical JSONB storage and does not claim to do so.

The private raw metadata must have exactly the original five wire fields, correct
primitive types, final phase, numeric percentage in 0..100, a real Gregorian date
with explicit valid timezone, and a boolean shadow flag. Original accepted date,
phase, percentage and flag are preserved exactly as values; none are regenerated or
inferred from an example. Raw metadata is capped at 512 KiB; the exact map has a
separate 4,096-entry staging workload budget. That is a policy limit, not a claim
that a cumulative historical map is bounded by the 20,000-key registered scope.
The general object cap remains 128 everywhere else.

The supported staging timestamp profile limits offsets to ±14:00 and fractional
seconds to six digits. Registered contractVersion uses one to four digits after
the fixed provider-version prefix. These are explicit staging restrictions;
SQL source permits a broader value domain. Out-of-profile values refuse rather
than being normalized or silently accepted.

ALL raw entries are validated before ANY are omitted. Every raw entry undergoes
the original depth, object/array, key/string, JS-safe-number and sensitive-pattern
checks at its original depth. Keys must follow the supported source grammar:
the nine declared datasets, uppercase TWSE/TPEX, and optional four-digit symbol.
The old adapter's TPEx spelling is not the producer's TPEX value. Prefix lookalikes,
arbitrary suffixes, pollution names and unknown keys refuse, including entries
that the market reader would ignore.

Each dataset entry has exactly five required fields: terminal, actionEligible,
selectedProvider, selectedAuthorityTier, persistence. Types and fixed enums are
checked, including provider/exchange/authority pairing. Complete requires a
nonnull provider, persisted and true; noncomplete requires not_persisted and
false. The nine provider terminal enums plus the frozen consumer's explicit
conflict/stale states are supported; arbitrary strings/coercions refuse. The two
additional states are a named consumer compatibility profile, not an assertion
that the queue writer emitted them. Field validation does not attest an actual
historical acquisition, prove all per-dataset writer branches, or grant actions.

The only reserved raw entry is optional `_refresh_scope_v6`. Both historical
14-field and later 15-field shapes are checked exactly. Required count types,
partitions, retry bound and boolean equations must agree; scopeSource and original
timestamp/null semantics must match; only the later profile has contractVersion.
Unknown nested fields or pollution refuse. With this progress present, the saved
percentage must equal the known writer's result (exact nonnegative HALF_UP to two
places, incomplete clamp 99.99, empty 0, complete 100), and shadow must be false.
Values are checked, never replaced. No unsupported ordering between scope and
publication cutoff timestamps is invented. Legacy no-progress metadata retains
its validated percentage/flag; progress and monthly/candidate states cannot be
used to manufacture the two reader terminals.

## Closed output and frozen consumer equivalence

Only after full raw validation does the adapter emit two fixed dataset objects,
daily_price and daily_valuation, each containing one terminal enum. Raw metadata
is not mutated or forwarded; progress, symbols, provider and unused dataset fields
stay private. The resulting whole projection then passes the ORIGINAL generic
bounds and public-shape checks. Other data and URLs retain their existing rules.

The reducer preserves incoming enumeration order, with no sorting. For each fixed
dataset: absence -> missing; all complete -> complete; otherwise conflict, then
stale, then the first noncomplete terminal. Percentage and phase are preserved;
they are not recomputed from these terminals. A missing dataset cannot be filled
as complete. The runtime's strict raw profile excludes JS coercion-only malformed
entries; those remain covered by the earlier source-only consumer tests.

Both fixed releases bind `tw-market.ts` blob
`d98636ebceeb53899f133bb8729cd899becc292c`. The synthetic oracle extracts only the
dataset constant and resolveTaiwanFinalPublicationSemantics from that pinned
source. It compares validated RAW, previous source-only composition and actual
Python reduced output, including 274 order/terminal/absence/percentage/shadow
combinations. No source-only test function is imported by the staging runtime.

The raw validation stage intentionally precedes the unchanged generic stage and
URL observation. Existing invalid numeric map keys now receive source-profile
refusal; this is not permission to discard them. Other original generic bound
predicates/traversal remain proved by the existing AST differential test.

## Verification and remaining onsite work

Actual isolated nonroot PG17.11 fixtures exercise a large producer-shaped map,
both source profiles, original dates and identity, unchanged raw rows/catalog and
grants, duplicate metadata identity, wrong source column type, poisoned ignored
entry and private payload rejection. The real Supabase SDK and NextResponse run
over the existing private adapter using pinned source; this is a component test,
not a packaged native Next/detail HTTP acceptance. A synthetic valid map followed
by a disallowed fact URL is still rejected, with the original URL unchanged.

Source review and test counts/hashes are in
`t18-market-metadata-source-receipt.json`. The required isolated web build attempt
passes its five canonical bridge modules, then exits 127 because Next executable
is missing in this checkout. No complete web build is claimed.

Coordinator must stage the exact delta and separately verify the true clone. A
different raw schema, unknown field, unsupported provider state, contradictory
progress or next URL/shape failure remains a closed GAP. Do not publish raw keys,
counts, values, URLs or exceptions to investigate it. Actual detail HTTP, fixed UI
age/action gaps, site/new-radar and formal release gates remain separate. Original
backup, production service/data/credentials, evidence and HOLD remain unchanged.
