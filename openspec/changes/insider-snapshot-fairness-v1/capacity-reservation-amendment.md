# Pending amendment: durable acquisition reservations

Status: unsigned independent requirements/design pass of proposal a006d60bc63235d0959f73dbaa8f42af70017827 reported by root on2026-10-09; implementation authorized. This is not protected release authority or maker approval. The frozen implementation subject is4b3c85580e753d88220ff8384ffa6b1981b5389e (code9b3058200954fdd135c2b57d7fcfd7e5361a0ea2). Existing128MiB/32snapshot/128run/640member caps do not change.

## Reachable defect in the frozen candidate

The candidate checks actual admitted bytes/records only. Assume completed evidence already occupies112MiB, with enough record slots. RunR starts with no active snapshots. Its first dataset admits12MiB, leaving4MiB. The next valid12MiB response fails capacity. R cannot freeze all five real snapshot IDs; read/commit requires a frozen run. Its first admitted snapshot is now active but cannot progress. Saving the partial map is insufficient.

Checking future worst-case capacity only once while holding a transient advisory lock is also insufficient: another request may spend that unrecorded headroom after the lock releases. Capacity promises must remain database state, survive restarts and participate in every admission.

## Proposed state and ownership

A new private acquisition-token relation stores at most one pending token per fixed dataset. Consumed tokens remain immutable replay identities linked to their real snapshot; only pending tokens are charged reserved capacity. All token/member tables are RLS-protected with no PUBLIC/anon/authenticated/service_role direct mutation or read grants; only the narrow existing service RPCs may use them. A token is an opaque UUID **reservation identity, never a source hash, snapshot ID, acquisition clock or evidence**. Each pending token reserves12MiB and one snapshot slot. Multiple runs waiting for the same dataset may reference the same token, so it is charged once.

Use the existing run-member relation as the subscription map, with exactly five rows installed atomically at run initialization. Each member is either:

- bound to an actual existing snapshot ID (active reuse or immutable completed replay); or
- bound to a durable pending-acquisition token, with snapshot ID null until actual admission.

A pending→actual transition is permitted exactly once, under the admission transaction. Run ID, dataset, token and any already resolved snapshot ID cannot be changed. Frozen maps still contain five real immutable snapshot IDs; pending tokens never satisfy page/commit bindings. This changes the current insert-only member trigger to an explicit one-way binding trigger and requires independent exact review.

## Atomic transitions

1. `begin_run`: global budget lock first, dataset locks ascending0–4 second. Existing run returns its original map. A new run resolves each dataset to its current active snapshot, otherwise a shared pending token, otherwise a newly created pending token. Calculate actual admitted bytes/records plus **all distinct durable pending token reservations**, including proposed tokens. Reject the entire initialization if either cap would be exceeded. Insert the run and five bindings only after the check, in one transaction. The128run/640member limits still apply. No source fetch precedes successful initialization.
2. `acquire`: caller reads its actual/pending bindings. Fetch only unresolved tokens, carrying the exact run/dataset/token identity. Network/schema failure leaves the token unchanged. A stale request cannot allocate under another token.
3. `admit`: global then dataset lock; require the exact unresolved token or return its already resolved original snapshot. Recompute raw bytes/hash/schema/rights/clocks as before. Within one transaction consume the token's12MiB/1slot reservation, insert the real snapshot/progress and resolve **every subscribed member of that token** to the same snapshot. Mark the token resolved only in the same transaction that resolves all subscriptions. Keep the token row and snapshot binding permanently; it is no longer charged reserved bytes/slots. Never delete a consumed token or reuse its identity for a newer acquisition. Actual≤reserved, so total actual+reserved cannot increase. Freeze each run whose five members now contain real IDs. Lost responses reconstruct these actual bindings; no second fetch/admission.
4. `page/commit`: unchanged exact five-real-pin binding and document-before-CAS. Completion releases only the active slot. It never deletes retained raw bytes or reopens resolved members.
5. `new independent run`: may reuse current active snapshots; if a previously completed dataset needs fresh acquisition, it needs a pending token and budget. Existing frozen/partial runs retain their original subscriptions. No later acquisition may consume another token's reserved capacity.
6. **Cancellation is not implemented in this slice.** There is no cancel RPC, expiration cleanup or automatic release of unresolved subscriptions. Any future cancellation/abandon policy requires a separate reviewed amendment; it cannot be inferred from the optional alternative in the original proposal.

## Failure and retention boundary

Once a run holds any actual snapshot, its unresolved subscriptions remain a durable bounded liability until successful explicit resume. Automatically releasing them would recreate starvation and contradict the promise that already admitted evidence can continue. No reservation timeout can safely imply that the source will never recover or that no caller is still in flight.

A permanently unavailable or schema-incompatible source may therefore retain up to the remaining worst-case acquisition reservation. This is an explicit capacity-stopped state with run/dataset/token/budget diagnostics, not an unreported leak or completion. Releasing a partially acquired set would require a separately reviewed terminal-abandon/archive policy which preserves raw evidence and defines whether its active snapshot can ever resume. That policy is outside this amendment; no automatic deletion, fabricated empty snapshot or false five-pin completion is permitted.

## Required acceptance

- Reproduce112MiB retained +12MiB first admission +4MiB remainder stranded state on4b3 (actual PG witness separately queued). The new begin must reject before any fetch/admission rather than create an unfinishable set.
- Exact actual+reserved128MiB and32slots accepted; +1byte/+1slot rejected. Initialization rollback leaves no run/member/token when reservation cannot be made.
- After successful reservation, another run cannot spend that headroom; concurrent runs waiting for the same missing dataset share one token/charge and one admitted snapshot.
- Crash before/after fetch, before/after admission commit and lost response retain identical tokens or resolved IDs; no double charge or ghost capacity release.
- Empty datasets consume a real raw snapshot and resolve the same token; completed replay does not reserve or reacquire them.
- Partial initialization/source failure retains reservations; an existing frozen run continues at full capacity. Diagnostics distinguish source-blocked reserved capacity from retained actual raw.
- No cancellation endpoint or automatic token reclamation exists. Consumed token replay returns its original snapshot after a newer pending token exists for the same dataset; old tokens cannot be admitted against a new run/token binding.
- Five-real-pin page/CAS, rights drift, source clocks, exact persisted documents and all previous bounds remain unchanged.

Rollout remains blocked on independent exact-code review and VM actual transport/PG acceptance. The reported unsigned requirements/design pass authorizes this bounded implementation only. Default source scheduling remains unchanged.
