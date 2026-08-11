# StockInsider V3.14 — Fresh Requirements Gate Round 137

## Subject identity

- Subject commit: `14b32b18a68368a19730fd2b450bd15a8be56504`
- Subject tree: `0e79f47c8081f68b7e33c0b35e068beecf43d98d`
- Direct parent: `9445e1412e7026a7a96ef7edd988d2fd8273fdf0`
- Initial and final review worktree/index: clean

## Verdict

`PASS P0=0 P1=0 P2=0`

No remaining requirements-level contradiction, missing executable owner,
compatibility break, identity split, or unauthorized production claim was found.

## Independent recomputation and execution

- The canonical inventory is `1.46.0`: 320 unique cases partitioned as 272
  product/runtime, 28 model-runner and 20 evaluation-governance cases.
- The 50 active files and 40 owner rows independently recompute to active graph
  `685211645ee93d2f792254036c5c39271791c7c8f7ac3beec7d3b85e85430393`.
- The catalog is exactly 5,484 bytes with SHA-256
  `5ea7a1c6411f9f9447098bcd63c9cf96ddc182aa2918bab84f2de51bc98bc5ef`.
- The six structural meta cases passed on the exact subject tree.
- The complete exact-tree product/runtime trace passed 272/272 with zero fail,
  skip, todo or cancellation. All 12 REC owners, 31 PCR owners and the V3.13/V3.14
  executable owners ran rather than being inferred from file text.
- The runtime, detail serializer, comparison tuple and upgrade-safe SQL now share
  acceptance `1.46.0`; the comparison preimage remains 2,729 bytes and changes to
  SHA-256 `c81d16af92ec44fc2386165cd70f9665662e2052c680f831c78cf7d324020729`.
  Existing immutable 1.45.1 projection rows remain admissible only for audit;
  newly started, sealed and completed runs use 1.46.0.
- The V3.14 additive migration applied twice in the fresh PostgreSQL fixture and
  all 49 migration cases passed. Base runtime tests passed 61/61 and combined
  product correctness passed 75/75.

## Scope boundary

This PASS establishes Requirements eligibility for a new immutable Architecture
subject. It is not the protected external Code Gate, Shadow Activation Gate or
Promotion Gate. No production credential, database, runtime, scheduler, Vercel
alias, LINE/dispatch path or public ranking was changed during this review.
Evaluation governance remains honestly blocked until non-fabricated elapsed cohorts
exist.
