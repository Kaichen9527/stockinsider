# Explicit observed research scope v1 — proposed, architecture review required

## Problem and boundary

The existing formal priority route correctly409s when candidate_research_stock_authority_page returns empty. Current1978 observed ordinary-equity rows are useful research coverage but do not carry formal instrument/sector/principal authority or historical PIT. Adding them to stocks would expose them to loadTwStockAuthority, runRevenueIngestion, runThesisRefresh, runThesisRank and getRadarPayload; the direct-stocks proposal is withdrawn and must not be implemented.

This increment adds an explicit research-only identity/roster path to the existing controller/inbox/priority/deep-author pipeline. It does not fall back silently, change15+5 queue weights, fill Top20, grant qualification or create another publication system. Omitted scope retains current formal behavior.

## Stable independent company identity

Add research_observed_companies_v1, with a DB-generated UUID, market TW and stable four-digit symbol identity. Included ordinary members must supply their observed exchange/ISIN classification; contradictions in symbol/exchange/issuer identity reject atomically. A later name or classification observation cannot silently replace an established issuer. Snapshot rows preserve observed names/sector text; sector remains descriptive and does not create formal sector authority.

Never INSERT/UPDATE stocks from observed intake. An existing stocks UUID may be recorded only as an optional validated mapping after matching stable TW symbol/issuer; it grants no eligibility. New/unmapped companies use the independent research-company UUID throughout. Mapping is an immutable receipt/lineage, not overwriting a company or a past snapshot. Name/sector of existing stocks remain byte-identical.

## Immutable guarded snapshot admission

Add research_observed_roster_snapshots_v1 and members_v1. Existing requireInternalAuth protects POST /api/internal/research-observed-roster; a restricted security-definer atomic admit RPC is its only writer. PUBLIC/anon/authenticated table access and direct service writes are denied; UPDATE/DELETE are denied even through the writer. Pin schema/classifier version+SHA, canonical classification SHA, bounded selected packet bytes/hash, included/excluded reasons and counts. Persist each public source's exact URL, acquisition observer, actual observed clocks, attributed raw-byte length/SHA and rights/transport status. Server DB received_at is independent of source observation; no invented publishedAt or historical PIT.

Reuse the reviewed bounded classifier and current relay schema, with an explicit closed HTTP shape and no caller-provided trusted/classification overrides. Selected packets remain2MB; raw-reference exception12MB is solely the fixed complete official CFI surface, not a larger live HTTP grant. Raw references remain attributed Mac reads when raw bytes are not present in VM. New1978 snapshot is distinct from immutable1946 evidence. All source observedAt and DB received_at must be<=priority asOf; server recomputes counts/digests and rejects future inputs. Same hash/different canonical bytes is an error; exact replay returns the original receipt and mappingDigest without replacing received_at or first observation. Concurrent identical admissions yield one snapshot/membership set.

## Explicit priority scope and atomic persistence

research-priority-run accepts a closed discriminated scope: omitted/formal uses the existing official roster; research_observed_v1 requires snapshotHash and its immutable server receipt. Unknown scope, extra fields, cross-snapshot or future receipts reject. All1978 included members are accounted; outside assessed coverage remains needs_evidence, price unknown. Source-head and rights/association logic remains the existing pipeline; snapshots are membership context, never evidence or qualification.

InputHash includes scope, schema/classifier hash, snapshot receipt, mappingDigest and existing immutable evidenceRows/sourceAttempts. Current supplementary price context is scope-bound and cutoff-bound. Published legacy candidates cannot silently enlarge the observed snapshot. Preserve existing scoring,15general+5emerging selection and incomplete counts; three industry-only summaries do not create company mentions or20jobs.

Run persistence, scoped first-discovery capture and enqueue occur in one restricted transaction/RPC, rollback as a unit. Formal symbol-PK research_first_discoveries_v1 is never populated/overwritten by observed runs. Add a research-company-keyed observed first-discovery namespace with original firstSeenAt/firstPrice/status/hash immutable; a new snapshot or later mapping appends lineage, does not reset initial observation. Missing first price stays missing; later supplementary receipt is explicitly current knowledge. Different scopes cannot share a first-discovery row accidentally.

## Jobs, quota and legacy compatibility

Add typed scope/lineage columns to research_deep_jobs_v1: scope, research_company_id, observed_snapshot_hash/member binding, optional validated stocks mapping. Formal branch requires stock_id nonnull and no observed membership; observed branch requires a valid research-company/member/snapshot lineage and may have stock_id null. Enforce closed two-branch CHECK plus DB trigger/FKs, not merely DROP NOT NULL. Optional stock_id never turns observed work formal. Old v1 enqueue/claim/publication entry points must remain formal-only and reject or exclude observed rows explicitly.

Preserve global5jobs/week, same-stock/week dedup, active job exclusion, daily/role budgets, three-attempt limit and original30-minute deadlines. Lock/order and durable uniqueness use stable TW issuer/symbol identity across formal and observed scopes and later mappings, not stock UUID alone. The existing global enqueue/claim locks are reused; any additive quota identity records cannot reset usage. Concurrency and later mapping cannot permit a second job/budget for the same issuer/week. No principal/permission/release rows are minted.

### Authoritative admission week (architecture amendment)

Within the existing global enqueue lock, capture one PostgreSQL clock_timestamp() and derive the current Asia/Taipei admission week (Monday 00:00 inclusive, next Monday exclusive). Persist this admission clock/week with the charge. Data asOf, observedAt, historical evaluation dates and caller-supplied run weeks never choose the quota week. Formal and observed enqueue routes must use this same authoritative clock and shared current-week five-job limit plus stable issuer/week uniqueness. Historical evaluation may retain its data cutoff, but a new job submitted today consumes today's admission week, or evaluation runs without enqueue.

Migration cannot reset existing consumption: preserve prior charge identities, and reconcile every already admitted job's original server admission/creation clock into the shared ledger under the same global lock before permitting new admission. Ambiguous legacy accounting fails closed rather than receiving fresh capacity. Existing active-job exclusion remains in force. Exact replay reuses the original job/charge/week even across a week boundary and never charges again; a new admission captures the DB clock only after obtaining the lock, so a waiter crossing Monday is charged to the new week. Do not alter any data PIT cutoff while correcting admission accounting.

Required regressions: today's concurrent submissions with different past-week asOf values collectively admit at most five across both scopes; same issuer cannot evade uniqueness through a past cutoff or later mapping; replay before/after Monday preserves its original charge; lock acquisition across the Taiwan Monday boundary charges the actual admission week; legacy usage survives migration and ambiguous usage rejects.

## Closed v2 claim and author input

Existing authenticated research-deep-job route gains explicit scoped v2 claim/context/input using the existing reservation and author-input components. Closed v2 hashes bind scope, researchCompany UUID, snapshotHash, mappingDigest, priority run, original job/owner/attempt/reservation and original clocks. V1 contexts remain formal-only; an observed v2 packet cannot be downgraded to v1 or stripped of scope. Validate current job/reservation expiry honestly;120-second input freshness is preparation evidence, not permission to extend a lease. Recheck the same binding before private draft save/handoff.

bundleId:null is allowed for genuine scoped author input and incomplete private draft with explicit financial/publication gaps. Source documents come from actual guarded inbox UUIDs, not fabricated fact IDs. Apple EP8 description is a historical published description observed now, not audio/transcript, current catalyst or past PIT signal. It directly mentions5347/6531; company assessment reasons must remain explicit and independently attributable.

Unmapped/observed work cannot claim publication/outbox/submission or satisfy completed by manufacturing stage/detail/bundle rows. Missing lawful published revision remains awaiting/not-submittable; lease expiry cannot be relabeled active or extended. Detailed additive awaiting lifecycle may be a separately reviewed slice. Later optional stock mapping plus a legitimate published revision may enter a controlled reconciliation to the original publication outbox; this scope creates no alternate publication pipe. No observed writes to story/thesis/recommendations/strategy_actions/stage/qualification/paper tables.

## Required executable acceptance

1. Real guarded HTTP/PostgREST/PG admits1978 current packet; exact replay/concurrency yield one immutable receipt, all included/excluded rows accounted; old1946 bytes unchanged. Anonymous/future/secret/unknown schema/wrong counts/reused hash with different bytes/UPDATE/DELETE reject.
2. Formal omission still409official_roster_missing with empty authority; explicit observed run200 with complete accounting and original weights, no forced20. Instrument/sector/principal/formal stocks unchanged.
3. Ingest actual Apple EP8 company descriptions through existing inbox and retain DOM publication precision and Oct8 first observation. At least one honestly assessed company can enqueue a real research-only job; if evidence fails, preserve zero with explicit reason rather than fake success.
4. Company absent from stocks can priority→job→claim→prepared input using independent UUID. Existing stock name/sector unchanged. SQL branch checks/FKs/trigger reject formal-nullstock, observed-withoutmember, foreign company/snapshot, crossscope downgrade and optional mapping contradictions.
5. Concurrent/formal/observed/later-mapped same issuer shares global weekly and daily budgets; no duplicate issuer/week or reset firstSeenAt/lease. Rollback leaves no orphan run/discovery/job.
6. Real job/owner/attempt/reservation and v2 input hash binding; stale/future/replayed/mutated scope or mapping rejects. No model call required for compatibility; preparation/private draft may remain incomplete.
7. Unmapped paper/pub/outbox/submission denied; no fakepublished revision or completed receipt. Formal records remain identical. Restart retains snapshot/company/discovery/job lineage and dedup.
8. Necessary focused/adversarial integration/types/lint/normal build and bounded VM resource receipt. Independent architecture and exact code review; no protected attestation or publication approval implied.
