# Disabled candidate outcome / membership-epoch source candidate

Status: SOURCE DESIGN / NOT_APPLIED / NOT_CONNECTED / native HOLD. Engineering direction permits source code and fixture validation only. This is not formal approval, a new admission authority, an installed journal or an active public catalog.

## Scope and hard boundary

`migrations/20261107_vnext_candidate_epoch_journal_v1.sql` proposes one private append-only relation and one private SECURITY INVOKER helper under the existing sealed `stockinsider_vnext_owner`. All PUBLIC/anon/authenticated/service_role relation/sequence/execute privileges are revoked. No role, RLS exception on an existing relation, public read or append RPC, route, installer registration, schedule or existing function/trigger body is changed. The original writer fence also protects the new table.

The helper's first executable statement unconditionally raises `vnext_candidate_epoch_hooks_not_connected`, including for its owner. The prospective append algorithm below that statement is unreachable source design. No argument, GUC, feature flag, claimed role, client approval or metadata can remove the barrier. Future activation requires another source revision, exact independent review of original writer instrumentation, legitimate native HOLD release and catalog/ACL/transaction acceptance. Removing the barrier alone would be unsafe: the three-path subset does not cover the real membership state machine.

## Stored intent and public fixture contract

Each proposed row has a global identity ordinal plus `(symbol,sequence)` immutable chain. Same-symbol predecessor/epoch/previous-epoch composite foreign keys, a single genesis per symbol and a single successor per predecessor prevent cross-symbol links and branches. The fixed row schema is `vnext-candidate-epoch-event-v1`, with original policy `stockinsider-vnext-20-v1`. Actor principal, session, optional job and optional publication references are retained with restrictive foreign keys. Cause ids and proof hashes are bounded opaque private bindings, not foreign-key pins to immutable cause/proof rows and not independently verified cause authority. Referenced job/publication symbol and input lineage are checked explicitly; admission uses stable `job.admission_hash`, because preparation later changes `job.input_hash`.

Private fields are actor principal, input/proof/request hashes, operation cause id, job/session references and internal prior-epoch lineage. No raw source text, evidence array or free-form exit reason is accepted. Rights acquisition, current source permission, financial/price qualification and entry eligibility are not granted by a journal event or foreign key. Existing publication retention rules are retained; a reference does not make unpublished or withdrawn material public.

The separate pure fixture module uses only this DTO:

`eventId, symbol, sequence, previousEventId, epochId, epochStartedAt, kind, state, reasonCode, causePath, occurredAt, recordedAt, publicationRevisionId`.

Sequence is a positive decimal bigint string. Envelope `vnext-candidate-epoch-journal-fixture-v1` has fixed original policy, an explicit cutoff, at most200 retained fixture events, `activation:'disabled_not_connected'` and `coverage:{complete:false,preActivationHistory:'unavailable'}`. The projector reports `sourceCauseVerified:false` and `entryAuthority:false`. It validates intent; there is no adapter which converts that DTO into a formal write or authenticates a cause. This fixture envelope is not an SQL reader.

Exactly three prospective cause paths are described:

| Cause path | Kind | Public state | Closed public reason |
| --- | --- | --- | --- |
| `core.enqueue.admitted` | `admitted` | `researching` | `admitted` |
| `core.enqueue.deferred` | `deferred` | Last recorded journal state, or null; no current-row lookup | `eligibility_evidence_missing`, `unchanged_input`, `daily_budget`, `active_capacity`, `work_in_progress` |
| `core.exit.target_hit` | `exited` | `exited` | `target_hit` |

A deferred outcome concerns THIS request. It never proves a symbol has never been admitted, changes actual membership or starts an epoch. Unknown/unclassified reasons are not converted into approved events; unsupported paths remain gaps. No raw private reason is exposed.

Only a genuinely recorded admission creates `epochId=eventId` and `epochStartedAt=occurredAt`. A first deferred/exit observation for pre-existing membership keeps both null; neither a current row nor `admitted_session`, ranking absence, publication date, audit count or retrospective snapshot can bootstrap an epoch. An admission while the journal still records an active epoch is refused; an unrecorded exit cannot be inferred to close it. Exit ends the recorded epoch. A later actual recorded admission starts a new epoch; deferred events after exit keep the terminal state. No state-change event is manufactured to cover claim/publication/other paths absent from this subset.

## Prospective append mechanics — unreachable, not runtime acceptance

The bounded accepted request has exactly13 keys: event id, expected predecessor id, symbol, three-path cause, stable cause id, private principal, nullable input/proof/job/publication bindings, official session, operation occurrence clock and closed public reason. Caller epoch/sequence/recorded clock, evidence, coverage, activation and approval fields are rejected. Recorded time and sequence are generated internally. Actual event occurrence must fall within the original statement's clock interval; retrospective imports/backfills are refused.

Replay digest covers fixed schema/policy domain plus the entire accepted request, excluding generated ordinal/sequence/recorded time. Existing event id or `(symbol,causePath,causeId)` is compared against the complete digest before current-tail CAS, current bindings or clock validation. Conflicting cause reuse fails. An exact old replay can therefore retain its immutable result after later events without hydrating payload from changed current rows. A new append compares the exact expected predecessor under the original global ledger lock, checks microsecond clocks and reference bindings, and derives epoch values from already-recorded admission lineage only. None of this code is reachable in this source candidate; source checks are not PostgreSQL CAS/concurrency evidence.

## Precise future instrumentation points — all NOT_CONNECTED

No snippets below are installed or executed. They identify where a later original-body review would be required; source anchors do not prove a current installed body.

1. **Core enqueue admission**: original `20261022_stockinsider_vnext_20_v1.sql` membership upsert and immediately following job insert (`166–169`). Only after the existing source/eligibility/capacity/budget/idempotency checks and successful atomic membership/job mutation may an exact new-membership or exited-to-researching operation emit `core.enqueue.admitted`. An upsert of an already-active member is a substantive research update, not a new membership epoch; it is unsupported here. The original operation must capture its exact transition inside the guarded transaction; it cannot scan or import mutable rows later. Admission job id can supply durable cause identity; hook implementation must prove exact replay lineage.
2. **Core enqueue per-symbol deferrals**: original branches at `155–164` append actual per-request outcome reasons. A future hook must run at each exact branch, within the original transaction, without changing outcome/budget behavior. Cached-admission's earlier `current_resolved_source_receipt_required` outcome, empty scope, outer nontrading-day response, errors and unsupported swap returns are NOT this cause path and are not expanded into invented per-symbol events. Stable cause identity must come from the exact original request, not just a symbol or current row.
3. **Proof-backed explicit target exit**: original exit update at `338`, following target-proof equality validation added by `20261022_vnext_target_exit_v1.sql:178–190`. Current core was subsequently patched by preparation-read, trading-invalidity, roster and cancellation source profiles. A future hook must bind the original exact `targetProof`, publication/input/symbol, actor and official session inside that same guarded transaction and only for a genuine successful transition. It cannot reconstruct proof from the already-exited current member. Existing target exit lacks a separately persisted generic epoch-operation id; designing a durable stable cause/event identity is a remaining prerequisite. No other exit is relabelled `target_hit`.

Current retained core source-profile head is the cancellation profile successor `130fa80b87ece7cc9bfb59b5998078cfd76ebb852a12632706e3fc5cf7eefafb`. Existing profiles and original bodies remain unchanged. The source test checks original anchor uniqueness and that retained source-profile identity, with drift negatives; it does not reconstruct or authenticate an installed function.

## Coverage and activation prerequisites

The missing actual mutation paths are documented in `work/epoch-mutation-notes.md`: active-member updates/claim/prepare, publication waiting/eligible and cancellation exit, author/reviewer failure and expiration, all non-target exits, swap atomic incumbent exit/entrant admission, cached source deferrals and early-return paths. Until all required paths have exact transactional instrumentation or an explicitly accepted partial-observation contract, the subset cannot be presented as unbroken membership epochs or full candidate history. It is unsafe to activate it as a complete workflow.

No pre-activation backfill is proposed. Pre-activation history remains unavailable permanently for this candidate's claims. Full acquisition and never-admitted catalog coverage, source/industry metadata, real rights/current qualification, native ACL/RLS/writer/cause/replay/race/rollback and formal acceptance remain distinct prerequisites. Existing snapshot navigation remains the only actual `/candidates` read composition, unchanged by this work.
