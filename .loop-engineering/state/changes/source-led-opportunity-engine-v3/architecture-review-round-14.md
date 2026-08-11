# StockInsider V3.13 — Architecture Gate Round 14

## Subject identity and cleanliness

- Commit: `df2e210a3f883070ee42f947c78388164f024e4c`
- Tree: `659e3543c9e8abb452a05c31de054fb0d5964837`
- Parent: `800c50891b1f78bfeccebac74477802cb598a9d1`
- Requirements carrier: `790f2d63cee6d85a6a4823f0bdf6203d8c930f02`
- Requirements Round 130: `PASS P0=0 P1=0 P2=0`
- Index/worktree clean; untracked files: none.

## Verdict

`CHANGES_REQUIRED P0=0 P1=1 P2=0`

This was an independent, read-only, offline Sol XHigh architecture review. It did
not run tests, mutate the repository, or authorize any production operation.

## Finding

### SI-V313-AG14-P1-001 — Detail publication does not enforce the closed unavailable/read-only state

The amendment requires incomplete Decision Briefs to make detail typed unavailable,
and stale revisions to expose only read-only state plus `lastKnownAction`, never the
historical buy action. Runtime constructs the exact source-only blocker
`insufficient_cited_decision_brief`, but Web and PostgreSQL accepted arbitrary
non-empty reasons. The TypeScript card omitted the unavailable union. The JSON
deep-dive route ignored both brief unavailability and `projectionReadOnly`, always
returning cacheable `status:'ready'` with the historical envelope; insight inherited
that behavior. React checked brief unavailability before stale-readonly precedence.

Consequence: a source-only revision could be described as ready; a stale revision
could publish and cache its historical buy-like envelope; malformed blockers could
cross the SQL trust boundary. React and JSON clients therefore did not share one
authoritative detail state.

Exact closure: define one closed `available | unavailable | stale_readonly` detail
result across Runtime, TypeScript, Web, SQL, React, deep-dive and insight. Enforce the
exact blocker; resolve stale before rendering; stale may expose only
`lastKnownAction`; non-ready responses are `no-store`; add negative tests for
source-only, stale-buy and invalid-blocker cases.

## Round 13 closure status

- P1-001 source-only Decision Brief: partially closed and mapped to AG14-P1-001.
- P1-002 analysis/disclosure identity: closed.
- P1-003 future reported periods: closed.
- P1-004 gate precedence and malformed envelope: closed.
- P1-005 negative half-tie rounding: closed.

No additional P0, P1 or P2 findings were identified.

## Limitations and authority

Recorded tests remained historical evidence for this read-only review. It grants no
V3.13 Web deployment, database migration, runtime activation, credential, source
write, V3 activation, LINE/dispatch or ranking-promotion authority.
