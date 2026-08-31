# Exact implementation review — candidate historical-price access guard

Date: 2026-08-31

Review authority: read-only review of the complete immutable implementation
diff, candidate-cycle terminal states, pipeline failure isolation, scheduler
configuration validation, documentation, and focused regression coverage.

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `c89c7884387f83878eb77bfbbf4b22c977510374` / `73d76a564eae34776e7ad677955eb5296ec32b49`
- Full final range: `ee93e4dc94e5393a06be495bfe3fdd62e78bca0a..c89c7884387f83878eb77bfbbf4b22c977510374`
- Active graph: `329de76e514164f7ebd1905708491aa15e80c9ce34eb0fb7be3eb03786cdcf64`

## Review result

- The explicit `CANDIDATE_HISTORICAL_PRICE_ACCESS_ENABLED` capability is fail-closed: a VPS without authorised 520-session official history records `official_historical_price_access_unavailable` rather than manufacturing technical features, a valuation target, or a stage promotion.
- A blocked candidate cycle creates one terminal ledger run with the candidate count and remediation detail, but does not create per-stock failures. Existing `found` source cards and the last-good public Radar snapshot continue to publish, so a historical-price outage cannot erase valid discovery evidence.
- The core pipeline records this as a failed `candidate_research` step while preserving the real blocked result. It therefore cannot create a qualifying shadow session or conceal the operational problem behind a successful-empty result.
- The VPS installer requires an explicit true/false setting, documents the remediation boundary, and does not introduce a scraper, a CDN-protection bypass, unlicensed price data, credentials in unit files, or Threads into the scheduled scope.
- Focused candidate/shadow contract tests, TypeScript, lint with zero errors, production build, full product correctness, migration, legacy-regression, performance suites, and diff hygiene passed on the exact subject.

## Closure

No P0, P1, or P2 code finding remains. This is a safety and observability repair only: live shadow progress remains real-time evidence, and enabling historical research still requires an authorised point-in-time feed on the VPS.
