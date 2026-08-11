# Fresh Requirements Gate Review — Round 106

Subject commit: `aa80352a5ccdcb65e0c6f5ead222e5713b3fd7dd`  
Subject tree: `03505c453c8e736f442eb929710b60e66089e462`  
Baseline commit: `1b714a4303c2a97ebb913dced8d9d607a4ac8951`  
Baseline tree: `463cdf53127a38553ecba80f31ad8cddb28ff6f1`  
Reviewer: independent read-only `gpt-5.6-sol` / xhigh process  
Verdict: `CHANGES_REQUIRED` (`P0=0`, `P1=5`, `P2=0`)

## P1 findings

1. A no-change evaluation heartbeat retained the same decision revision ID while
   changing the persisted card through heartbeat-only provenance timestamps, so the
   immutable decision checksum conflicted.
2. Exact symbol/revision detail performed the immutable table lookup and then required
   the newest home projection to still contain that revision, making historical links
   unavailable after rollover.
3. The valuation history selector bounded observation revisions at 253 before the
   application deduplicated sessions; official corrections could therefore hide an
   otherwise complete 252-distinct-session history. The contract requires the bounded
   1,261-revision selector.
4. The five additive V3.13 relations did not enable the mandatory RLS/no-force boundary
   and did not explicitly close public/anonymous/authenticated privileges.
5. Official financial facts were inserted directly by completion, bypassing the typed
   audited append authority. The required immutable financial-series registry,
   deferred consistency constraint and 128-row per-series bound were also absent from
   the migration and append function.

Round 105 classes 2, 4, 6, 7 and 8 are closed. Classes 1, 3 and 5 remain open through
findings 1–3; findings 4–5 are new independent blockers. The active-graph oracle,
typecheck, lint and legacy regression passed. Two PostgreSQL-backed diagnostic cases
could not start because the independent read-only sandbox denied temporary-directory
creation (`EPERM`); this environmental limitation was not counted as a product finding.

Architecture review remains blocked. Repair must form a new immutable tree and obtain
another fresh independent Requirements review with `P0=0` and `P1=0`.
