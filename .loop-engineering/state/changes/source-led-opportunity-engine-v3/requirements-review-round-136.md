# StockInsider V3.14 — Fresh Requirements Gate Round 136

## Subject identity

- Subject commit: `50dac5c3619704b7b7256043d7e86b5ac8e745c4`
- Subject tree: `13740c8595afebce7dc00da53ebc928fc8b3d86e`
- Direct parent: `0ae3fbc3ed3ddcbe6a142cd082fabf386c47c326`
- Initial and final review worktree/index: clean

## Verdict

`CHANGES_REQUIRED P0=0 P1=2 P2=0`

The complete exact-tree product trace executed all 272 registered cases. All twelve
REC owners passed; two structural authority roots remain stale.

## Findings

1. **P1 — V3.14 active-graph expansion is not sealed by GOV-004.** The catalog now
   contains 50 active files and 40 owners with 5,484 bytes/SHA-256
   `5ea7a1c6411f9f9447098bcd63c9cf96ddc182aa2918bab84f2de51bc98bc5ef`,
   while the oracle and canonical design/evidence tags still bind 49/39 and the old
   5,258-byte catalog. GOV-004 and HYB-007 both fail closed.
2. **P1 — the executable script registry does not match the reviewed package
   command.** Product correctness now correctly uses `--test-concurrency=1`, but
   `acceptance-tests.json.scriptValueRows` and its hash retain the concurrent value.
   GOV-001 therefore fails before verifying package equality.

## Required closure

Update the catalog byte/hash/topology authority tags and oracle together; update the
exact product-correctness script row and recompute its canonical hash; then recompute
the full 50-file active-graph digest. Rerun the six structural cases and the complete
272-case trace on a new immutable tree.

No production state changed and Architecture remains ineligible.
