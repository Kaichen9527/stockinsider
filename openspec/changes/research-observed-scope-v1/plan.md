# Reviewed slices, single heavy job

Base7baa184cddc712110342a5ef79e4e79958d16558. This commit contains design only, no schema/API activation. Root/independent architecture review must cover the exact spec before additive SQL implementation.

Slice1: research-only company and snapshot/member schema, deny-mutation/RLS and atomic admit RPC plus requireInternalAuth route, existing classifier adapter. Real1978 HTTP/replay/concurrency/future/ACL tests. No stock mapping writes or formal catalog mutation.

Slice2: explicit priority scope loader and bounded run/discovery/enqueue transaction; observed first-discovery namespace, stable crossscope quota/dedup identity and strict job CHECK/FKs/trigger. Capture server admission clock under the shared lock; formal and observed share the current Taipei admission week, preserving existing server-timed consumption and replay charges independently of caller cutoff; ambiguous legacy admission fails closed. Existing formal v1 routes/routines remain formal-only. Real formal409/observed200/rollback/accounting, no score changes.

Slice3: scoped v2 claim/context/input and private draft binding; original leases/reservations/budgets. Actual EP8 description input5347/6531 plus reasoned assessment; no paid model needed for compatibility. Preserve missing financial bundle and lawful publication gaps. No alternate publishing endpoint.

Later slice: explicit awaiting/reconcile lifecycle only after independent contract review, using existing lawful revision/outbox gates. Queued TWSE/TPEX insider parser/coverage repairs are a separate bounded source increment and must remain visible.

Potential files: additive migration under migrations (new file only); observed contract/reader helpers; guarded observed-roster route; existing priority/deep-job routes and deep claim/author/controller helpers; existing shared budget/job routines via additive replacements preserving formal behavior; focused realPG/route tests; bounded harness profile; OpenSpec and sanitized receipts. Do not edit protected gate/allowlist, rootpackage, production configuration or strategy weights. Exact names/SQL signatures finalized in the reviewed slice, with no unrelated cleanup.
