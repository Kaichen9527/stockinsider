# Deep research claim context

The approved research Agent plan needs the real author reservation before a
trusted controller can export a Cloud work packet. This change adds bounded
server reads to the existing internal deep-job route. It changes no schema,
reservation RPC, role, credential, model provider, scheduler or publication gate.

`claim` still invokes `claim_research_deep_job_v1` exactly once. After a selected
job, the server reads and validates its current owner/attempt, immutable attempt
deadline, and the single `company_research` reservation whose work key is
`deep:<jobId>:<attempt>`. It returns a projected context and retains the existing
job/policy response fields. An empty claim returns `context:null` with
`gap:no_claimable_job`; the RPC cannot distinguish an empty queue from budget or
concurrency denial. If claiming or subsequent verification is uncertain, return
HTTP 409, `research_deep_claim_context_unavailable`, `context:null`,
`outcome:uncertain`, `retryClaim:false`. Never automatically repeat the claim.

`status` requires the same exact internal bearer and owner. Optional `jobId` and
numeric `attempt` must be supplied together and match exactly. It only SELECTs
an active owned running job; no match returns `context:null` and
`gap:no_active_owned_job`. Multiple matches, missing/duplicate reservations,
identity mismatch, changed original deadline or invalid clocks fail closed with
HTTP 409 and `research_deep_status_context_unavailable`. Authentication precedes
JSON parsing and database access. Lookup errors never export database messages.

The context has exactly these fields:

```text
schemaVersion: research-deep-claim-context-v1
observedAt
job: jobId, symbol, priorityRunId, attempt, owner, leaseExpiresAt
modelReservation: reservationId, role=company_research, owner, workKey,
                  startedAt, leaseExpiresAt
modelCompletion: null | { outcome, resultHash, completedAt }
```

Validate UUIDs, owner, symbol, hashes, role/work-key identity, timestamp syntax,
chronology, an exact 30-minute model reservation and same Taipei day. Preserve
PostgreSQL timestamp strings and microsecond precision. The job and reservation
deadlines come from separate existing SQL clock calls and need not be equal;
both stay unchanged. Compare the current job deadline with the immutable
attempt's deadline and reread the job fence before returning. A runnable model
requires its lease to remain active. Handoff completion can be observed only
with its bound owner, hash and original completion time, while the deep-job lease
remains active. It does not mean a draft was saved or a publication was accepted.

This is an observation assembled from bounded reads, not a new transactional
lease or authority. Concurrent changes after observation remain protected by the
existing mutation fences. Recovery preserves the original attempt, deadlines
and consumed budget; it does not create a reviewer reservation. The whole deep
workflow retains its original deadline and review retains its separate slot.

No evidence acquisition endpoint is introduced. The existing dossier bundle
contains official facts and source links, not a guaranteed projection of raw
document IDs and bounded content. Industry-to-company mapping and source rights
remain separate work. Authenticated summaries retain their existing
`publicCitation:false` boundary. Production activation remains independently gated.

Acceptance: DCC-U1–U4 cover the pure context contract; DCC-RT-01–21 exercise the
actual route/auth/helper together for auth-first behavior, claim/status,
immutable clocks, owner/identity/duplicate rejection, uncertain claim recovery,
and preservation of existing handoff/finish/publication actions. Type checking
and the production build are required. No local result is a production review.
