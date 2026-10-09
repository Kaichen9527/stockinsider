# Author reservation handoff — bounded continuation

Continue b8c3df4d's immutable private author result through the existing marker2
model-reservation endpoint and exact author credential. Add a distinct
x-research-author-handoff-action discriminator: handoffAuthorResult or
readAuthorHandoff. Closed body: action,input,inputRevisionId,inputHash,resultId,
resultHash. Both have the original8192-byte streamed strict JSON limit, depth12,
invalidUTF8/duplicate-key rejection, cancellation and single10s FinancialDeadline.
Existing assignment/packet/result/v1 paths keep their parsers and behavior.

This slice completes only the original company_research reservation against the
exact immutable result. It does not reserve/dispatch a reviewer, extend a job or
reservation, publish, qualify, grant entry or assert provider attestation. The
stored observation remains a trusted controller report, not proof of actual model
execution. Real adapter dispatch, independent review and publication remain required.

Add a scoped private handoff context over the immutable assignment, result,
complete revision and preparation. Acquire the original source then global-deep
locks; require READ COMMITTED, exact canonical request/revision/result IDs/hashes,
server-resolved author principal, sealed source assertion, and original observed
claim reader's run/roster/admission/mapping/attempt/owner/job validation. Recheck
finite original assignment/reservation/job clocks, unchanged original job and
reservation payloads, exact company/snapshot/preparation lineage, and current
compiled calculator mapping at the application boundary. The assignment/result/
revision/preparation remain immutable. Source changes/expiry/takeover invalidate
read and handoff. Private context is not a public/audit reader.

Before completion, retain existing read_research_author_result_v2 as an additional
live fence. After completion this original active-work reader deliberately still
rejects; the additive context accepts only a completed row with exact original
owner, outcome completed, result_hash equal to stored validatedArticle.articleHash,
and original finite finished_at within reservation/job deadlines and after result
receipt. Never delete a completion, bypass the old reader, or temporarily restore
active status. Handoff response carries the original completion row as receipt.

Application reads this context, validates the complete revision against the
compiled mapping, re-executes the actual business calculator and article validator
using immutable server-resolved source descriptors, and compares the entire
validated snapshot/hash to the saved result before first completion or replay.
ReadAuthorHandoff returns null receipt before handoff, original receipt after it;
both still validate live context. No new financial file reads or altered dates.

A private commit helper, owned by existing research_observed_rpc_owner, calls the
context under the same locks and directly inserts research_model_completions_v1.
Do not call generic finish_research_model_v1: its SECURITY DEFINER owner would
violate the original observed completion trigger. Grant only the needed helper
execute rights; no new table mutation grants for service/anon/authenticated, and
no weakening of the trigger/RLS or formal-v1 gate. Context is owned by existing
input-preparation owner with private read rights. Exact replay returns original
receipt; conflicting completion rejects. Final SQL clock recheck before return
rolls back if expired. Concurrent exact commits create only one completion.

Completion releases the global active slot, never refunds original1800 seconds;
no other job/status/reservation/input/result/budget/qualification/outbox writes.
Uncertain write responds409 with readAuthorHandoff reconciliation; no new claim,
clock renewal or automatic model dispatch. All research/entry capability flags
stay false. Controller-only status is visible.

Acceptance: strict body/auth/identity/clock/result mismatch; both companies actual
pure recalculation with labelled synthetic upstream/controller fixtures; real PG
original scoped claim reader and completion trigger, immutable result/revision;
null-before, commit/replay/read/restart exact receipt, concurrent one insert,
changed completion/source withdrawal/expiry/takeover denial, old active-work read
still rejects after completion, no refund/no extra reservation/no publication.
Native HTTP, independent exact code review, type/lint/normal build required before
integration. Synthetic acceptance cannot be reported as genuine product authorship.
