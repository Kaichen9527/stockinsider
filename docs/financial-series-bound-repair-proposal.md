# Financial history admission: unresolved bound and proposed amendment

Status: design proposal, not a production migration or completed repair (2026-10-04).

`prepare_opportunity_financial_fact_series_v3()` enforces 128 stored facts for a stock/fact/duration/kind/horizon series across all periods and providers. Recollection timestamps also participate in fallback identities. A lifetime storage bound is different from the bounded reader needed for reliable requests. Deduplicating repeated observations delays exhaustion but does not allow new genuine periods indefinitely.

The observed production fallback failure for 2330/2605 is therefore left visibly failed. This implementation does not raise 128, delete financial history, change availability dates or report the October 2 official refresh as complete.

The proposed separately reviewed repair has three identities:

1. Economic slot: issuer, fact, period start/end, duration kind, currency, unit and accounting scope.
2. Claim revision: economic slot plus provider, original document, statement/restatement identity and normalized value. A changed value is a new revision, even if its source URL is unchanged.
3. Observation: claim revision plus collection receipt and actual observation time. Repeated retrieval adds provenance without creating another economic revision. An undated fallback is available no earlier than its real collection time.

Preserve existing immutable fact IDs and observations in an append-only lineage map. Readers page a deterministic cutoff-visible window with a sentinel/bound; historical storage grows through separately budgeted partitions/indexes. A source-reference-only lookup must not return an obsolete value/unit/restatement. Provider agreement is not independent confirmation when both derive from the same filing.

Required amendment acceptance: more than 128 genuine periods admitted without loss; repeated collection idempotent; changed value/unit/restatement retained; historical cutoff cannot see a later revision; provider disagreement remains visible; existing immutable references and EPS reconciliation still resolve; failed batches remain failed until every expected issuer is accounted for. Measure indexes/storage and production query plans before selecting the window/partition policy.

Apply only through the existing reviewed migration path after the exact schema amendment, independent review and capacity admission. Do not run raw SQL against production as an emergency workaround.
