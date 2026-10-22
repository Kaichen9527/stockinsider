# Design and execution order

1. Typed versioned policies/snapshots, deterministic null-preserving scoring, source rights/freshness and acceptance inventory.
2. Durable atomic admission/day-attempt authority with explicit scope, lifecycle, idempotency, global concurrency and route closure; install only in disposable verification. Keep source->global lock order and legacy contracts; enabled vNext must not catch to legacy on errors.
3. Shared point-in-time market snapshot, deterministic conservative risk overlay and bounded rights-aware discovery cache. Real foreign provenance or explicit unavailable.
4. Exact research revisions, distinct review and publish-time membership/input revalidation; fail closed when formal external prerequisites absent. Deferred discovery does not veto admitted coverage.
5. Two-block opt-in UI plus detail/history, truthful dates/gaps/state. Default-off preserves rollout safety.
6. VM serial resource-monitored test/type/lint/build/browser and isolated integration; staging externally gated; normal PR with exact receipts and outstanding items.

Implementation model requested: GPT-6.1 Sol via explicitly selected implementation executor. Coordinating session cannot attest a self model switch. Root controls environment/evidence/integration and reviews implementation independently of authoring executor. No changes in historical checkouts. Existing module APIs should be reused; avoid a second source authority or generic execution framework.

Resource policy: /workspace and/tmp free>=8589934592 during heavy work, sampled process-treeRSS<8589934592, one heavy workload at a time; no deleting cache/raw/tmp/history or stopping others to meet floor. Node22.14.0 from VM's existing pinned binary, frozen npm locks. Secrets/environment files untouched. Native test environment must be explicitly disposable; database schema must never be applied to production. Dependencies and generated assets reside only in the new checkout.

Legacy change map is in acceptance.md. Candidate migration is source-only until locally installed through an isolated reviewed harness. All external integration calls use isolated injected configuration or deterministic test doubles explicitly labeled; doubles do not establish real credentials/source acquisition/model or publication execution.
