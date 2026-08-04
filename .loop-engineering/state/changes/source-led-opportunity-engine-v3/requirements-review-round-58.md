# Requirements Review — Round 58

Date: 2026-07-26
Immutable tree: `629fedd329d8a03d195356df7b96a03b42418a8e`
Base: `1fe429d3a91359cd2d6d07c89441ebb66d9ccc5d`
Verdict: `CHANGES_REQUIRED`
Counts: `P0=1 P1=4 P2=0`

This was an independent fresh read-only Sol review of only the named immutable Git tree, exported at `/tmp/source-led-v3-req-fresh-629fedd.hUIpFF`. All earlier candidate trees were withdrawn and received no verdict. Architecture was not run.

## Findings

1. `P0` — The `MR3-007` / `MR3-009` security owners are false-green. The private-IP canary targets an unreachable address, process-group and setsid share the same launch, both owner tests rerun one no-model probe, and `MR3-009` never performs its required model attempt.
2. `P1` — HTTP and SQL count source text before BOM/newline/NFKC normalization. A 100,000-code-point compatibility character payload can expand to 400,000 normalized code points and bypass the canonical-workload bound.
3. `P1` — Official roster alias append/revocation uses only `lower(btrim(...))`, while the owner requires NFKC, whitespace collapse, ASCII lowercase and terminal Chinese corporate-suffix removal.
4. `P1` — Market append accepts a matching cancelled or superseded trading-session UUID because it does not require the latest cutoff-visible authority to be completed.
5. `P1` — Applied migration acceptance checks index names and a single duplicate/correction path, but not exact `pg_index` direction/order, constraint-backed exclusions, an indexed plan, per-stream/global 64/65 rejection or zero-write bound behavior.

## Verified closures

- `git diff --check`, typecheck, the 50 product-semantic cases, the 17 applied migration cases, the 15 model-runner cases and doctor all passed in the review export.
- Doctor confirmed deployment remained `disabled`.
- Legacy homepage/API layering is materially closed.
- Genuine 120-date backtest and 20-date live cohorts remain unavailable; this is an honest Verification blocker, not a Requirements defect.

Architecture remains locked pending a new immutable repair tree and a fresh Requirements PASS.
