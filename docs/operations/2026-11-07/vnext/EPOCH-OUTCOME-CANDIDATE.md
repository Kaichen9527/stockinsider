# Immutable candidate outcome / epoch — SOURCE CANDIDATE / INCOMPLETE

Source **170e5a93265d1a7d61dfc26e1ba25ecd463f82ae**, runtime web tree **81f907ddff58ace41693d416d6992edf21f8ba56**, continues protection checkpoint3b39764636d43c0e4d02267b643c19781ddd6718 on the same development VM. GPT-6.1 Sol High authors and separate readonly engineering reviewer were explicitly selected. Original PR384 head remains cbb581662e72942610ff85b0bf5e7e47ddddfa46. No formal A1/reviewer attestation is issued.

**No actual mutation path writes this journal.** The SQL candidate is not applied or registered, its private append helper unconditionally raises hooks_not_connected before the algorithm, and the pure runtime read boundary is always Disabled. This batch supplies reviewable storage/append source, fixture projection and exact source negatives; it does not enable a complete historical catalog or persistence in production.

## Source candidate and retained lineage

[Design and precise future insertion points](../../../../openspec/changes/stockinsider-vnext-20/candidate-epoch-journal-design.md) and [complete mutation map](EPOCH-MUTATION-MAP.md) distinguish genuine formal paths from mutable snapshots/audit. Existing routines/pins/guards/roles/installer lists are unchanged. No trigger is attached to members, jobs, publications or audit. Only the proposed new private table has its own writer/immutability triggers in source.

The proposed table retains fixed schema/policy, immutable event ID, per-symbol bigint sequence/predecessor, nullable epoch/admission start, previous epoch, a closed outcome/state/reason and private request/cause/principal/input/proof/job/publication/session lineage. Composite self-FKs constrain same-symbol predecessor/epoch references; single genesis/successor and unique cause/sequence constraints are present. Job/publication/principal/session references are restrictive FK pins, with no cascade or historical deletion. Original writer fence, private RLS, app/public/sequence/execute revocations and immutable update/delete/truncate guards are specified.

The private SECURITY INVOKER helper is unavailable to PUBLIC/anon/authenticated/service_role and even its owner reaches the unconditional first-statement exception. There is no flag, GUC, metadata attestation or adapter which enables it. The code below that barrier describes bounded13-field input, fixed version/policy replay digest, original global ledger lock, exact id/cause replay before tail CAS/current-clock/reference checks, and internally generated sequence/record time. Same-cause conflicts and stale predecessors refuse; admission uses stable job.admission_hash rather than the input_hash later changed by preparation. These are unreachable source mechanics, not tested PostgreSQL transactions/concurrency.

Cause ID and proof hash are bounded opaque values, **not** immutable cause/proof FKs or verified rights evidence. The candidate does not implement actual original-writer causal/rights binding. A job/publication FK preserves reachability but cannot establish current source permission, independent review, financial/price qualification or entry eligibility. Future activation needs a separately reviewed source integration with those real bindings, not removal of one exception.

## Epoch and coverage semantics

Only a recorded admission may start an epoch; epoch ID is its admission event ID. Current members, old admitted_session, source screening, rank presence/absence, publication time or aggregate audit cannot create a prior epoch. A legacy first exit has null epoch/start and explicit pre-activation gap. Deferral concerns one request, retains only last journal-observed state or null, and does not prove never-admitted/current membership. An old unclosed epoch cannot silently close because a mutable row changed; readmission across an uncovered exit is refused. OccurredAt is the membership operation clock, not a rewritten source/news event date.

| Prospective source case | Designed outcome / public reason | Actual hook status |
|---|---|---|
| Core enqueue, genuine new admission/readmission after original gates and member/job write | admitted / admitted | NOT_CONNECTED |
| Exact per-symbol enqueue deferral | deferred / eligibility_evidence_missing, unchanged_input, daily_budget, active_capacity or work_in_progress | NOT_CONNECTED |
| Explicit proof-backed target-hit exit, after the existing target guard and original mutation | exited / target_hit | NOT_CONNECTED |

Claim/start, prepare/input changes, publication, failures/negative review/timeout, provider settlement delegation, swap's two atomic sides, other explicit exits, cancellation and future paths are unsupported by this producer candidate. Some return before audit; expire returns only counts; swap does not set its old member timestamp. No audit trigger or row hydration can repair these omissions. Even with three hooks, this subset would not be a complete workflow and must not be activated as one. Pre-activation and uncovered-path history remain unavailable; no backfill, full candidate history, source/industry or7/21 baseline is manufactured.

## Pure public projection / readonly paging

New `candidate-epoch-journal.ts` validates only the explicit fixture envelope/DTO agreed with the SQL design. It accepts at most200 events/256KiB and pages at most20 rows; validates exact version/policy, microsecond clocks, per-symbol sequence/predecessor, admission/terminal/readmission epochs, target publication identity, duplicate/cross-symbol/reused-epoch and unsupported cause/reason negatives. Decimal bigint strings avoid numeric rounding. No mutable membership/snapshot/audit is consulted.

Public fields are fixed event/symbol/sequence/predecessor/epoch identities and clocks, kind/state, closed reason/cause code and nullable publication revision; principal, cause ID, job/request/input/proof hashes, raw rights/evidence/body and free-form exit/error text are excluded/rejected. Epoch summaries are restricted to visible page epoch IDs and labelled as summaries at the frozen fixture cutoff. They are historical intent data, not current position/action authority.

The cursor binds immutable packet hash/cutoff, filter/page-size and exact tail. Reordering identical packet events preserves paging; replacing/appending to the packet cannot silently change an existing view. Resuming must use the original frozen packet. This is a pure bounded fixture keyset, not a newly installed database snapshot reader or retained production watermark. The existing `/candidates` route/RPC/UI remains unchanged and readonly, with all saved-snapshot gaps intact.

Every result retains incomplete coverage, pre-activation history unavailable, sourceCauseVerifiedfalse and entryAuthorityfalse. Production boundary rejects all caller adapters/activation options and performs no IO. Fixture metadata cannot establish actual source cause, permission, mutation completion or current qualification.

## Verification scope and gates

[Version-bound machine receipt](epoch-outcome-checks.json): **296 focused tests PASS /0fail /0skip**, types PASS, lint PASS (0errors/34existingwarnings), full ordinary `npm --prefix web run build` PASS. Installed Chromium151 actual local HTTP/SSR desktop/mobile: **14 PASS** with synthetic RPC23reads/0writes/0provider. The browser covers existing public-read regressions, not a new journal route or live journal acceptance. Source/harness/runtime tree are bound in its receipt.

New author checks are10pure intent cases and7source cases, overlapping the296 total; the latter inspect SQL/profile text and exact anchor-drift negatives without importing or executing the native fixture. They do not parse or execute PostgreSQL. Independent reviewer inspected source/contract and reported0open blocker/high in this explicitly disabled scope; the reviewer did not independently run final tests. Serial heavy checks kept the original8GiB workspace/tmp floor plus512MiB admission reference and8GiB sampled process-tree RSS guard, with no violation/deletion; samples are not instantaneous/cgroup maxima. Browser cleanup reports the test app exited and fixture bridge closed.

Review repaired SQL CHECK NULL escape, required target-exit publication ID, off-page epoch summaries and missing policy/version replay domain. Root also identified mutable job.input_hash versus stable admission_hash. Earlier draft pure10PASS preceded those changes; only the final frozen source receives the integrated receipt. No approved oracle, existing guards or original assertions were relaxed. All previous failures/279/14 evidence retain their original subjects; native HOLD was not retried.

Native SQL grammar/catalog/installation, ACL/RLS/writer behavior, causal/rights binding, actual append/replay/CAS/concurrency/rollback and live readonly journal acceptance are NOT_RUN. Source checks and synthetic intent validation cannot stand in for them. Full mutation coverage and a legitimate original-writer integration are still required, followed by protected exact-source/formal review and native admission through the existing process.

VN01–VN20, formal current qualification, real-source/distinct-author/reviewer website positive, actual adjacent post-close sessions, CI, staging/restore/rollback and release gates remain incomplete. Coordinator reports Cloud Key not set, no Tailscale devices and Contabo NeedsLogin. This executor performed no key/config/network/SSH/Contabo/newtask/rebuild, SQL/PG, writer/schedule, old VM/iCloud, merge or deployment action.0bytes reclaimed; verified archive location none.
