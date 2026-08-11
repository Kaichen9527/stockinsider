# Fresh Requirements Gate Review — Round 117

Subject commit: `93db3334e23b5a00dbd163b6adc977d7ec4e36be`
Subject tree: `6010aa36e8a66ba40e8ba26a63a1205edc9fc6a6`
Baseline commit: `773bc1155902ba5f2af0bbec5b392b97d20131c8`
Baseline tree: `7d63c15e18f129dce69d2b905e40e50e3d75f0e2`
Reviewer: independent read-only `gpt-5.6-sol` / xhigh process
Verdict: `CHANGES_REQUIRED` (`P0=0`, `P1=3`, `P2=0`)

## P1 findings

1. Calendar and reported-valuation history bounded raw observation revisions rather
   than first enumerating session identities. A revision-heavy newest session could
   hide 251 otherwise valid sessions, a cutoff-ineligible 513th calendar identity
   could evade the sentinel, and the global peer date could cross exchanges.
2. Equal-head reported-valuation disagreement still selected and exposed a source-ref
   winner. The public result also lacked the required closed unavailable current,
   own-history and sector branches.
3. A normalized-shares conflict could be erased by order-dependent last-write-wins
   runtime deduplication when candidate-history and peer rows shared stock/session.

## Required closure

- Enumerate raw session identities before cutoff eligibility, bind a literal 1261
  session-member sentinel, resolve an explicit exchange calendar interval with the
  513/512 sentinel, and select the peer current session per candidate exchange.
- Aggregate equal-head semantics before any UUID or source-ref selection. A conflict
  terminal retains only its stock/exchange/session identity; valuation values and
  publication/source/collection/source-ref lineage are null.
- Produce one canonical SQL row per stock/exchange/session and independently make the
  runtime grouping order-insensitive with conflict precedence. Serialize the complete
  unavailable current/history/sector/relative-multiple union.

## Confirmed closure and residual blockers

The completed same-exchange official PE/PB append and exclusive SQL-derived
candidate/peer exchange/taxonomy plus rejected compatibility `valuationInputs` are
closed. The active graph independently matched
`c238284b0a9b1a09ada2d974b7429b10da82bd68e21d31919bc07b78d8190e73`;
acceptance `1.45.1` remained 308 unique cases partitioned `260/28/20`.

Fresh typecheck passed and lint had zero errors. Read-only sandbox filesystem denials
prevented an independent applied-PostgreSQL run and were not treated as product
findings. Evaluation governance remains honestly
`blocked/non_fabricated_elapsed_cohorts_unavailable`. No production migration,
runtime activation, deployment, dispatch or promotion was authorized or performed.
