# Requirements Gate Review — Round 13

- Reviewer: fresh independent `gpt-5.6-sol`, `xhigh`, read-only session
- Reviewer session: `019f76f0-0ade-7861-ba3f-87b34a9d024e`
- Date: 2026-07-19 (Asia/Taipei)
- Reviewed range: `12c131aa50ca53268878e9f025973533ac100c49..d1218f5df708df995f5888e0f677641266f48024`
- Verdict: `CHANGES_REQUIRED`
- Counts: `P0=0 P1=3 P2=0`
- Worktree at review: clean
- Architecture Gate performed: no

## Findings

1. **P1 — `createdAt` historical visibility lacks exact executable boundary coverage.** The contract requires `createdAt <= C`, but `API-019` creates every attempt before C and crosses only seal, terminal and warning-job times. Add attempts created at C-1s, exactly C and C+1s, query after all work finishes, and prove equality visibility, post-C invisibility and exact cold-start/nonmatch/active/failure precedence.
2. **P1 — Large authority/reference manifests lack one deterministic resumable canonical-hash protocol.** Alias, peer and factor families can contain 100,000–240,000 rows, but the artifacts do not give every potentially large family exact section keys, page/root preimages, first/last identities, root-to-final-hash derivation or interruption coverage. `OPS-017` also omits maximum alias, discovery/publisher authority, reviewer and peer-authority builds.
3. **P1 — The additive DDL contract is not one internally consistent executable schema authority.** Global immutability conflicts with `building -> complete|failed` manifest transition; design/named contracts mention dedicated sector manifest tables while storage defines only generic manifests without a declared mapping; and link-audit label `sample_id` has no valid unique FK target. `MIG-002` therefore cannot assert one exact catalog.

## Independently Confirmed Closed

- Strict valuation-verification expiry and the exact before/equality/after fixture are closed.
- Except for the missing `createdAt` acceptance boundary, public cutoff state reconstruction, convergence, warning facts, stored available bytes and unavailable cutoff serialization are exact.
- Requirements Round 11 registry, policy-hash, alias authority, prepare/seal convergence, valuation selection, warning authority and three-horizon detail repairs remain closed.
- Immutable pre-truncation revisions, knowledge time, signed principals/no anon fallback, READ COMMITTED recovery, shadow-only authority and no legacy detail side effects remain closed.

## Inventory Validation

- Canonical version: `1.12.0`
- Declared/actual/unique cases: `168/168/168`
- Structurally complete records: `168`
- Duplicate, malformed, empty, missing/extra-field or semantically skipped/todo cases: `0`
- Version mirrors: consistent

Structural validation passed. Semantic one-to-one executable coverage failed on the three findings above. Architecture Gate remains locked pending repair and another fresh Requirements Gate.

## Governance Path Note

The repository's Loop instructions designate `.specify/memory/constitution.md`; `.loop-engineering/constitution.md` does not exist at either reviewed endpoint. The designated versioned constitution was read completely.
