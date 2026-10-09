# Independent reviewer result and atomic completion — bounded continuation

Continue exact7f6259e8's private reviewer assignment and public-only packet through
existing model-reservation marker2 routing. New explicit review-result header
selects receiveReviewerResult/readReviewerResult. Separate exact reviewer Bearer,
current configuration-derived author principal, original source→global locks,
original immutable author result/handoff, reviewer assignment/active reservation,
job owner/attempt/lease and complete input/calculator fences remain mandatory.
Reject mixed author/review-assignment/result headers. Receive closed body contains
action,input,inputRevisionId,inputHash,resultId,resultHash,review,observation;
read omits review/observation. Wire bounds1MiB/8192B, strictUTF8/duplicates/depth12,
single10sdeadline/cancellation; review max65536 UTF8 bytes, envelope max1MiB.

## Review meaning and closed contract

Review output is research-editorial-review-v2 with articleHash,reviewPackHash,
reviewedAt,decision,checks,findings,strongestCounterEvidence. Article and packet
hashes must match the exact stored author result and server-rebuilt current packet.
Decision accepted/revision_required/rejected. Eight exactly-once checks: source_support,
rumor_staging,financial_recalculation,periods_and_dilution,competitive_alternatives,
valuation_assumptions,counterevidence,entry_separation. Each check contains category,
status(pass/concern/fail),rationale(20–2000 chars),paragraphIds(max30, unique, existing
summary/section IDs). Findings max30, each severity(blocking/major/minor),paragraphId
(existing or null),issue(20–2000 chars),sourceIds(max30 unique selected source IDs).
Strongest counterevidence20–4000 chars. accepted requires all checks pass and no
blocking/major findings; revision_required/rejected require at least one non-pass
check or blocking/major finding. Neither structural pass nor controller acceptance
proves factual semantic support. All result capabilities remain false; this is a
private review report, never an investment/strategy approval or publication receipt.
Reject secret patterns/control text as the article contract does; bounded data
only. No private principal/owner/job/reservation/provider observation is in prose.

Resolve exact expected observation from server-loaded reviewer assignment,
reconstructed packet hash, immutable author observation/thread/invocation and
article hash. validateResearchExecutionObservation authenticates reviewer;
requires distinct principal/thread/invocation, dispatch after assignment and
author article/end, review reviewedAt inside observed execution, completion before
receive and both original deadlines. No caller expected identity/fingerprint,
model-generated thread identifiers or retrospective engineering receipts count
as actual execution. Provider observation is still controller-reported only;
actual cross-chat tool journal remains separately required before publication.

## Persistence, uniqueness, atomic completion and exact recovery

Create private immutable reviewer results table, one per reviewer assignment,
result/envelope hash/logical bytes/receivedAt. Under original source→global locks,
first receive validates active reviewer context and saves exact review envelope
then inserts original reviewer model completion completed with review envelope
hash in the SAME transaction. Owner research_observed_rpc_owner satisfies existing
completion guard; do not call generic finish that changes definer owner. No job
completion/renewal/refund/new reservation/source changes/publication. Injected
failure after result insert rolls both writes back. Conflict cannot supersede an
accepted result or charge another reservation. All decisions finish that exact
review run; revision/rejection does not silently grant another attempt.

Global author/reviewer invocation uniqueness must work in both insertion orders.
Add private immutable invocation registry keyed exact invocationId; lock author
results during additive migration, backfill existing author results and install
BEFORE INSERT trigger on BOTH original author and new reviewer tables. Trigger
records table role/resultID/invocation and immutable payload hash atomically;
unique violation rolls back result/completion. Existing author runtime/results
cannot mutate, all original successful/negative tests remain. Registry SELECT
only for trusted context owner, no service direct writes or mutation. Backfill
existing author entries must not fabricate new model observations. Migration
must reject conflicts, not discard rows. No completion-only result can be adopted.

New private result context calls original author handoff context with current
configured author principal and checks current reviewer principal against stored
reviewer assignment. Validate exact role/workkey/owner/job/attempt/input/result,
reservation starts/expiry/assignedAt/original job deadline and original author
completion before review. If no review result, require original active reviewer
context and no completion. If result exists, require exact stored original
completed receipt binding envelope hash, finishedAt>=receivedAt, original clocks
and before both exclusive deadlines. Conflicting/missing/failed completion rejects.
This narrow completed-context recovery is only for original result; original
reviewer assignment/packet reader STILL rejects after completion. No generic
expired job reader or new lease. Read/replay/restart supported only inside original
job and review deadlines, with current source/lineage/credential/hash fences.

Application reconstructs and validates review packet BEFORE first receive. Save
its public-only payload and hash inside immutable envelope with raw review,
validated review and controller observation. For completed replay/read, rebuild
current packet deterministically using private original-context projection
without making old public active-work reader accept completion; reuse pure packet
projection. Require exact saved packet, actual compiled calculator/entire article
snapshot, exact raw/validated review, canonical envelope hash/byte count and
original observation. Revalidate caller replay against same expected identities
and compare complete envelope; changed output/invocation/packet/fingerprint rejects.
Final serialization/time checks remain inside original10s and both leases.

Acceptance: strict body/deadline/cancel/roles; actual fixed AUO/EMC calculation
with synthetic upstream/prose/controller fixtures; missing handoff/assignment,
rotation/self-review/same thread/invocation/before-author/late execution reject;
real PG original locks/budget/claim/completion trigger, atomic failure and one
concurrent exact result+completion; registry blocks cross-role invocation reuse
in both insertion orders and preserves backfill; private ACL/immutability;
read/replay/restart stable, changed source/review/packet/calculator/expired job or
reservation/conflicting completion reject; old reviewer active reader rejects
completion; no publication/qualification/strategy/job-state change. Independent
design/code review, related tests/type/lint/normalbuild and native HTTP required.
This slice does not complete genuine author/reviewer execution or publication.
