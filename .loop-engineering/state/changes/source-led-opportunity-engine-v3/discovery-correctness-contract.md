# Discovery Correctness Contract: source-led-opportunity-engine-v3

Version: `stock-discovery-v3.11.1`

This contract closes the V3.11 full-universe, pagination, identity and terminal
disposition rules. It is additive to the document/claim/mention accounting in
`requirements.md` R1; it does not rename those lower-layer outcomes.

## Point-in-time universe

The coarse universe is exactly every `effective_active` TWSE/TPEx common-stock row in
the frozen `tw-instrument-roster-v3.0` manifest at `sourceCutoff`. ETFs, ETNs,
warrants, preferred shares, depositary receipts, bonds, other instruments, suspended
and delisted rows receive their existing typed roster exclusions. Sort the eligible
universe by exchange enum order `TWSE,TPEX`, symbol ASCII ascending, stock UUID
ascending. Page it with literal `LIMIT 501`; a returned page contains at most 500 and
the 501st row is only the continuation sentinel. The cursor is canonical base64url
without padding over RFC 8785
`["tw-universe-cursor-v1",rosterManifestHash,exchange,symbol,stockId]`.
Cursor/root mismatch, malformed base64/JSON, unknown exchange or a tuple not present
in the frozen manifest fails `invalid_universe_cursor`; it never restarts at page one.

The production origin is `official_roster`. Seed symbols are admitted only under
`NODE_ENV=test` as `test_fixture`, or after every official roster connector has one
terminal `provider_unavailable` result as `total_outage_fallback`. A fallback run is
health-only: it may exercise deterministic code and report outage evidence, but it
publishes zero recommendation/source-signal cards and cannot produce formal status,
target, action, notification or dispatch. Thus `official_roster` is the only public
production origin.

## Ordered source pagination and the 1,000 cap

The immutable eligible-set root for one source run is
`sourceDatasetManifestHash` from the existing source contract. The producer reads
complete manifest pages in the already fixed post-family-collapse order:
`publishedAt DESC NULLS LAST,collectedAt DESC,stableConnectorDocumentId ASC,revisionId ASC`.
Each call is bound to one `sourceKey` and uses literal `LIMIT 201`; at most 200 rows
are returned and row 201 supplies the next cursor only. The cursor is canonical
base64url without padding over:

```text
["source-page-cursor-v1",sourceDatasetManifestHash,sourceKey,
 publishedAtOrNull,collectedAt,stableConnectorDocumentId,revisionId]
```

The first page has null cursor. Retries present the exact prior cursor and return
byte-identical page rows/next cursor. Cursor/root/source mismatch, a missing cursor row
or ordering inversion fails the connector `invalid_source_cursor`; an adapter/provider
error is `source_unavailable`; neither branch becomes `[]`. No OFFSET, `.limit(500)`,
front-page truncation or `catch { return [] }` is allowed.

The existing per-connector rule remains authoritative: after full eligible-family
accounting, only its first 1,000 rows are `selected`; every later eligible row is
`deferred_due_scan_cap` and is not parsed. `eligible=selected+deferred` still holds.
PCR-007's 2,549-row golden fixture is distributed over three connectors in registry
order as `850,850,849`; therefore every fixture row is selected without superseding
the 1,000-per-connector cap. Rows 501 through 2,549 must reach their ordinary terminal
document/claim/mention and candidate-disposition logic. A separate `1,001`-row
single-connector fixture must produce exactly 1,000 selected and one deferred.

## Identity joins and layer-separated outcomes

`stock_id` is a UUID foreign key, never a symbol container. A source entity joins by
its explicit UUID to exactly one cutoff-visible roster row; the row's stored symbol is
the only symbol. When no UUID exists, the existing entity-link contract resolves a
canonical symbol/alias first and then binds its exact roster UUID. Code may not slice,
decode, regex or hash a UUID into a ticker. Unknown names, unknown symbols, ambiguous
aliases and missing roster authority remain typed rejections.

Document, claim and mention outcomes remain exactly:

```ts
type DocumentOutcomeV3 =
  'duplicate_document'|'expired_document'|'parse_failure'|
  'processed_no_claim'|'processed_with_claims';
type ClaimOutcomeV3 = 'unique_claim'|'duplicate_claim';
type MentionOutcomeV3 =
  'linked_new'|'linked_refresh'|'linked_duplicate_claim'|
  'ambiguous_symbol'|'rejected_low_confidence'|'unsupported_instrument';
```

V3.11 adds a distinct post-link candidate ledger:

```ts
type CandidateDiscoveryDispositionV311 =
  'promoted'|'refreshed'|'unchanged'|'rejected';
type CandidateDiscoveryReasonV311 =
  'new_in_seed_symbol'|'new_out_of_seed_symbol'|'new_source_evidence'|
  'material_source_change'|
  'same_material_evidence'|'duplicate_claim'|'ambiguous_symbol'|
  'low_confidence'|'unsupported_instrument'|'missing_instrument_authority'|
  'source_unavailable'|'parse_failure'|'deferred_due_scan_cap'|
  'candidate_cap'|'shallow_cap';
type CandidateDiscoveryLedgerV311 = {
  sourceRunId: string;
  sourceKey: string;
  documentRevisionId: string|null;
  claimId: string|null;
  mentionId: string|null;
  stockId: string|null;
  symbol: string|null;
  disposition: CandidateDiscoveryDispositionV311;
  reason: CandidateDiscoveryReasonV311;
  researchDisposition:'deep_researched'|'source_signal_only'|'not_selected';
  researchReason:null|'candidate_cap'|'shallow_cap'|'deep_cap';
  seedMembership:'in_seed'|'out_of_seed'|null;
  seedSetHash:string|null;
  materialEvidenceHash: string|null;
  recordedAt: string;
};
```

Evidence disposition and research depth are separate; `deep_cap` never relabels fresh
evidence as rejected.

The reviewed `config/runtime/auth-source-dag.json` owns the exact 30-member
ASCII-sorted array
`["2301","2303","2308","2330","2337","2344","2345","2356","2379","2382","2408","2421","2449","2454","3008","3017","3034","3037","3189","3231","3324","3533","3711","4958","5347","5388","6230","6285","6415","6669"]`.
Its authority is diagnostic classification
only; it cannot admit a candidate, supply a roster row, influence rank, or provide a
financial/valuation fact. `legacySeedSetHash =
SHA256(UTF8(RFC8785(["stockinsider-legacy-seed-set-v1",legacySeedSymbols])))`.
The exact 247-byte preimage hashes to
`e6d9c09b8b552f5d9eaf389b76d2d90daa2d89578433d2a1ad63286888b3b743`.
Acquire persists the verified canonical config bytes, its file hash, the exact seed
array and this derived hash on the immutable producer run. Candidate append has no
caller-supplied membership/hash input: the security-definer function loads the
run-owned set, derives membership by exact
symbol equality; every connector/document-only rejection stores both members null.
Every linked ledger row stores the run hash and derived membership, and its
`new_in_seed_symbol|new_out_of_seed_symbol` reason must agree. The run/config/payload
and projection lineage bind the same seed-set hash, so a retry cannot change
classification. A missing, additional, reordered, malformed, cross-config or
mismatched seed set/hash fails before a producer run or ledger write.

Mapping and precedence are exact:

1. connector failure -> one connector terminal `source_unavailable` summary ledger,
   no fabricated document/claim/mention row;
2. `parse_failure` document -> one document-linked rejected ledger;
3. `deferred_due_scan_cap` -> one document-linked rejected ledger;
4. `ambiguous_symbol|rejected_low_confidence|unsupported_instrument` mention -> rejected
   with the matching first reason;
5. an otherwise eligible linked candidate ranked after 60 -> rejected/`candidate_cap`,
   `not_selected/candidate_cap`;
6. an otherwise eligible linked candidate ranked 31..60 -> rejected/`shallow_cap`,
   `not_selected/shallow_cap`;
7. `linked_duplicate_claim` -> unchanged/`duplicate_claim`;
8. `linked_new` absent from the previous successful public projection ->
   promoted/`new_in_seed_symbol` for `in_seed`, otherwise
   promoted/`new_out_of_seed_symbol`; when already present in that projection it is
   refreshed/`new_source_evidence` regardless of seed membership;
9. `linked_refresh` with a changed material evidence hash ->
   refreshed/`material_source_change`; otherwise unchanged/`same_material_evidence`;
10. for retained ranks 1..20 set `deep_researched/null`; for retained ranks 21..30
    preserve the evidence disposition and set `source_signal_only/deep_cap`.

`missing_instrument_authority` precedes every linked/cap disposition. Duplicate claims
reuse the owning candidate's research depth when present, otherwise
`not_selected/null`. Each selected evidence unit has exactly one terminal ledger row;
connector summaries are separate and never count as evidence units. Conservation is:

```text
selected_evidence_units =
  promoted + refreshed + unchanged + rejected
rejected = sum(rejected_reason_counts)
promoted + refreshed + unchanged =
  admitted_direct_candidates + duplicate_or_prior_candidate_observations
```

All counts include zero-valued closed reasons. Per connector, then aggregate, they are
safe non-negative integers. A row cannot be rewritten into another disposition.

## Coarse-first bounded funnel

Discovery admission requires source identity/evidence plus a roster identity, not a
valuation. Sort linked unique candidates by the existing source-priority order and
retain at most 60. Load only cheap price/liquidity/availability fields for at most 30.
Load source evidence, point-in-time financials, valuation and technical deep research
for at most 20. A new roster symbol with no complete valuation remains a
`researchMaturity='source_signal'` observation and receives null valuation targets and
`newPositionAction='valuation_review'`. It is projected through the bounded public
type in `legacy-radar-correctness-contract.md`; it is not silently dropped.

Every candidate reports one of `promoted|refreshed|unchanged|rejected`, and daily
projection summary separately reports entrants, exits, continuations and unchanged
reasons. Exits require an explicit reason
`evidence_expired|roster_ineligible|material_contradiction|ranking_cap`; absence from a
new query page is never an exit. A day with no material change may honestly retain the
same list, but must display the terminal unchanged reasons instead of rewriting prose.
