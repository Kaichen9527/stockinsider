# Same-task caller inventory clarification

Root's follow-up was independently checked at exact15d4 with `git grep -n runCompleteInput -- web/src` and the full author-assignment module read. Original report/receipt at92c4d8a0 remains unchanged.

There are four production caller modules, plus the declaration itself:

- `web/src/app/api/internal/research-deep-job/route.ts:26`: seal boolean depends on action.
- `web/src/lib/research-author-assignment.ts:33`: calls with `false` before assignment/read.
- `web/src/lib/research-author-packet.ts:130`: calls with `false` before packet.
- `web/src/lib/research-author-result.ts:39`: calls with `false` before result validation/read.

The latter three are currently read-only complete-input calls: they do not trigger financial file acquisition because `runCompleteInput:70` returns on `!seal`. Do not incorrectly claim they currently open files or charge a new preparation. They still require exact version dispatch, mapping validation and live lease/source fences. The assignment route also reaches packet/result/handoff handlers, so protecting only the deep-job HTTP route is not coverage of all consumers.

The proposed version registry belongs at the common complete-input service boundary used by every caller; the resource owner belongs below it at every actual filesystem acquisition entry, including direct `loadResearchFinancialSupplement` and both future fixed-profile facades. No caller may bypass that shared acquisition owner. DB-only replay should preserve its current no-files/no-recompute/no-charge semantics; merely adding a route mutex must not be presented as cross-version reader closure.

Exact SQL path is `migrations/20261009_research_complete_input_v2.sql`: read begins69, exact saved request/hash75, lease check76, old row return77; seal begins79 and returns valid existing sealed row at82. No `supabase/migrations` alias was used. Root's independent closure measurement corroborates this audit's own22-file match; it is not substituted for it.

This is a documentation-only same-task addendum, no new tests/runtime changes/approval. Implementation and version decision remain pending as in the original report.
