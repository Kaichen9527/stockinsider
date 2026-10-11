# Recover a deep research claim without spending another reservation

This source change supplies the real reservation behind an existing deep-study
claim. It has not been deployed or accepted against production.

The trusted controller calls `POST /api/internal/research-deep-job` with the exact
internal bearer. Keep that credential out of Cloud work packets and journals.

```json
{"action":"claim","owner":"controller-author-01"}
```

A confirmed claim returns `ok:true`, `context`, `gap:null`, and the original
`job` and `policy` fields. The context's `modelReservation.startedAt` and
`modelReservation.leaseExpiresAt` are the original server values for a model
packet; never replace them with the time the response was received. Preserve
`job.leaseExpiresAt` independently for the complete workflow. If
`modelCompletion` exists, its model invocation has already completed; this is
accounting evidence, not a stored draft or a publication receipt.

An empty claim returns `job:null`, `context:null`, `gap:no_claimable_job`. That
does not establish whether the queue is empty or budget/concurrency prevented
claiming. No reservation is manufactured locally.

After a lost response or HTTP 409 with `outcome:uncertain`, do not repeat claim.
Read the original owner's active job:

```json
{"action":"status","owner":"controller-author-01"}
```

If the job identity was saved, require its exact pair:

```json
{"action":"status","owner":"controller-author-01","jobId":"11111111-1111-4111-8111-111111111111","attempt":1}
```

Status returns `ok:true,context:null,gap:no_active_owned_job` when there is no
matching active owned job. This is not permission to rerun an earlier model or
publish its result. A context verification failure returns the fixed
`research_deep_status_context_unavailable` error. Investigate the existing
fence; status never changes a deadline, attempt, reservation or daily budget.

The snapshot uses finite owner/job/attempt/work-key queries, validates the
immutable attempt deadline and rereads the active job. It is not a transactional
lock: subsequent mutations must still pass their existing server lease checks.
The author/reviewer/publication workflow remains bounded by the first deep-job
deadline, and the reviewer requires a separate role credential and budget slot.

This interface returns no evidence content. A dossier's official facts/source
links are not a raw-document or rights-aware research packet. Authenticated
summaries remain ineligible as public citations under the existing source
validator. New message industry-to-company mapping remains unimplemented here.

Local validation passed: 25 targeted tests with zero skipped, type checking,
targeted ESLint, and the production build. Independent exact-source review and
actual controller integration remain pending in the accompanying OpenSpec
execution ledger. No production call, schema change, deploy or push was performed
for this change.
