# Requirements Review — Round 54

Date: 2026-07-26
Immutable tree: `9b0b7fe6aa619ce12e84f16d7b4fd75e58ce867d`
Base: `1fe429d3a91359cd2d6d07c89441ebb66d9ccc5d`
Verdict: `CHANGES_REQUIRED`
Counts: `P0=2 P1=1 P2=0`

This was an independent fresh read-only Sol xhigh review of only the named immutable Git tree in an isolated archive. It did not inspect or modify the mutable worktree, index or untracked files.

## Findings

1. `P0` — The 117 suite-backed acceptance cases have non-null executors, but many unrelated IDs still alias one broad cached source/test-name string. A synthetic case-ID evidence suffix does not prove case-specific semantic ownership or independent execution.
2. `P0` — The permission probe uses `spawnSync`, so both post-spawn and completion pin checks occur after completion. The host oracle also lacks the required no-follow ancestor walk and cross-check stability comparison.
3. `P1` — Cross-field request validation is incomplete: instant financial facts must permit `periodStart=null` while other duration kinds must reject it; estimate kind/horizon/fact combinations are not enforced; corporate-action input lacks exact feed order/provider/version/count/event/order/positive-price constraints.

## Independent execution evidence

- Typecheck passed.
- Product acceptance passed `176/176`.
- Applied migration passed `16/16`.
- Model runner passed `14/14`, including the real pinned-host/profile probe.

The passing suites do not clear the findings because the acceptance owner aliases and the omitted temporal/cross-field boundaries are exactly what the current suites fail to prove.

Architecture remains locked pending repair and a brand-new Requirements review over a new immutable tree.
