# Decision Log: source-led-opportunity-engine-v3

## 2026-07-18 — Replace full-market-primary discovery

- Decision: approved sources create the primary candidate pool.
- Reason: full-market deep analysis is costly, noisy and contrary to the user's intended information edge.
- Preserved boundary: market-wide aggregates and Top-20 movers remain non-promoting context/audit inputs.

## 2026-07-18 — Preserve formal recommendation safety, separate action

- Decision: formal research evidence remains strict; bounded event/starter actions are a separate typed result.
- Reason: relaxing evidence and demanding more buy labels are different product decisions.

## 2026-07-18 — Models remain challengers

- Decision: FinBERT/BGE/time-series models may be evaluated offline only.
- Reason: current repository output is heuristic and has no registered artifact or out-of-sample evidence.

## 2026-07-18 — No artificial turnover target

- Decision: measure source-link recall, entrants/exits and justified stasis; do not force daily replacement.
- Reason: forced turnover would optimize UI movement instead of opportunity quality.

## 2026-07-18 — V3 checkpoint remains research shadow

- Decision: reject `authoritative` mode in this checkpoint; V3 actions are research-only and cannot write legacy recommendation/strategy/alert state.
- Reason: session freshness is appropriate for research ranking but cannot silently weaken the approved one-hour publication gate.

## 2026-07-18 — Official point-in-time identity and sector authority

- Decision: use approved alias rows and official TWSE/TPEx sector assignments; hard-coded aliases/free-form sector text are non-authoritative.
- Reason: quota ownership and entity linking must be reproducible for symbols outside the current fixed seed set.

## 2026-07-18 — High-upside verification is hash-bound, not capped

- Decision: legitimate >80%/>150% formula outcomes may clear review only through a fresh allowlisted human verification bound to exact inputs and independent evidence; values are never rewritten to pass.
- Reason: fail closed on implausible valuation while preserving genuinely exceptional opportunities.

## 2026-07-18 — Frozen common-cohort evaluation

- Decision: compare V3 primary momentum/swing ordering with a precisely frozen legacy visible-union order, enter strictly after cutoff, and require deterministic human-reviewed link precision/recall.
- Reason: prevent look-ahead and ranking-selection bias from manufacturing improvement.

## 2026-07-19 — Exact point-in-time authority and daily evaluation slots

- Decision: every identity, publisher-verification, scoring-reference, valuation-approval and evaluation input is cutoff-visible and manifest-bound; quality evaluation uses one server-owned 16:00 Taiwan slot per distinct date.
- Reason: later approvals, live reference populations and duplicate same-date runs must not rewrite historical research quality.

## 2026-07-19 — Typed public derivations over generated prose

- Decision: expose conserved stage counts plus typed source-summary and invalidation parameters, with exact health/cutoff derivation.
- Reason: the UI can render readable text without making generated prose or implicit counters part of decision authority.

## 2026-07-19 — Separate static verification policy from daily authority

- Decision: bind cutoff-valid publisher rows in a point-in-time manifest/idempotency input, but bind only the exact static verification-policy preimage in comparable-lineage identity.
- Reason: an approval or validity-row change must create a new immutable run without making otherwise equivalent daily score snapshots incomparable.

## 2026-07-19 — Make every manifest and authority interface executable

- Decision: close market/mover/outcome/evaluation/link-sample native tuples, add exact FK/RPC/grant ownership, and use one signed point-in-time assistive-artifact registry.
- Reason: a universal page/root envelope is not sufficient when an independent implementation cannot reconstruct native rows, schema relationships or artifact selection without convention.
- Preserved boundary: mover reference remains aggregate/audit-only, assistive artifacts remain zero-influence, and no migration or implementation is authorized by this amendment.

## 2026-07-19 — Bind native time, revocation and database interfaces

- Decision: persist provider `sourceTimestamp` independently for financial facts; collapse each of seven mutable authority streams to its latest cutoff-eligible event before terminal status classification; expose only the exact named PostgreSQL types, 31 RPCs, typed completion counts and database-clock reaper; map blinded failure collisions through one closed SQLSTATE/API precedence.
- Reason: an independent implementation must not invent a financial timestamp, revive revoked authority, choose SQL payload/count shapes or leak sample/principal state through inconsistent failures.
- Preserved boundary: history remains append-only, point-in-time manifests bind revocations, failed blinded calls write no label/audit row, and this Sol amendment authorizes no implementation, migration or production binding.

## 2026-07-19 — Close source admission and blinded operation atomicity

- Decision: require every discovery identity UUID to be non-null; let the source-revision RPC accept only the current authority UUID, derive its identity/source key and enforce the exact triple with one immediate composite FK. Move blinded-route nonce insertion inside the one assignment/submit RPC transaction and collapse every authentication failure to `authentication_rejected`.
- Reason: authority-ID membership alone could authorize a revision claiming another identity/key, while a separately committed nonce violated the zero-write failed-call invariant and exposed an incomplete authentication oracle.
- Preserved boundary: successful requests still consume nonces and retain immutable audit history; every failed invocation rolls back its own nonce/label/audit writes; no implementation, migration, binding, scheduler, merge, push or production mutation is authorized.

## 2026-07-19 — Compose governing auth and close service-client precedence

- Decision: every V3 human-authority route must pass both the unchanged repository `requireInternalAuth()` bearer guard and the independently signed `internal-principal-v3.2` actor/role guard. The four blinded routes expose one combined authentication oracle. Every human route acquires the dedicated V3 service-role client only after body validation and before any nonce/RPC work.
- Reason: the earlier separation contradicted the repository rule that all Supabase writes pass through `requireInternalAuth()`, and omitted the observable outcome when service-role configuration was unavailable between body and RPC processing.
- Preserved boundary: neither credential can act alone; client acquisition failure is canonical 503 with no database call, nonce or durable write and no anon fallback. No implementation, migration, binding, scheduler, merge, push or production mutation is authorized.

## 2026-07-19 — Close HTTP authority, dedicated-client and publisher-policy lineage

- Decision: `internal-principal-v3.3` introduced exactly eleven human-authority paths, the no-fallback URL/project-ref/service-key/approved-digest tuple and the offline-versus-remote rejection boundary; the later `internal-principal-v3.4` decision below supersedes its incomplete remote call/write-position wording. `publisherVerificationPolicyHash` is now an exact `source-dataset-v3.1` header/root and enrich upstream equality member.
- Reason: client construction otherwise required invented URL/key/role validation; conflicting or unnamed paths prevented exhaustive dual-control tests; and an old-policy source success could be reused or false-collide under a new publisher policy.
- Preserved boundary: the approved digest/production secret binding remains a later checkpoint; no legacy fallback, anon access, implementation, migration, binding, scheduler, merge, push or production mutation is authorized.

## 2026-07-19 — Close exact authority wire families and credential-rotation positions

- Decision: `internal-principal-v3.4` fixes `v3_internal_request_rejected` to the seven non-blinded routes and `link_audit_request_rejected` to the four blinded routes for every failure stage. It retains the two-call non-blinded protocol and explicitly distinguishes rejection on the nonce call from rejection on the append call after nonce commit.
- Reason: one route cannot have two byte-exact error bodies, and credential revocation between two PostgREST calls cannot truthfully be described as one call with zero writes.
- Preserved boundary: the blinded combined RPC still rolls back every invocation write; a second-call non-blinded rejection retains only its already committed replay nonce and writes no authority/audit row. The RPC count/schema remain unchanged, and no implementation, migration, binding, scheduler, merge, push or production mutation is authorized.

## 2026-07-19 — Make the durable graph, stored types and RLS model constructible

- Decision: add `opportunity-job-graph-v3.0` as the sole deterministic bootstrap/successor/payload/result/worker authority. Begin inserts the first job plus immutable payload, each successful predecessor inserts exactly one successor plus payload in the same transaction, manifest pages advance only from a database-owned cursor and bounded selector recheck, and finalization is a leased job. Keep the public catalog at exactly 31 RPCs; two private owner-only helpers receive no client grant.
- Decision: close every durable discriminator and payload through `opportunity-postgres-types-v3.3` and `opportunity-storage-v3.2`, including run/manifest input roles, source/link/candidate/status/horizon enums, job payload/output kinds, connector accounting counts, exact normalized columns, immutable payload/result relations and per-output staging bodies.
- Decision: every V3 table uses enabled, non-forced RLS. The NOLOGIN/NOBYPASSRLS RPC owner owns every V3 table except the migration-owner principal-binding relation; exactly one SELECT-only policy permits that owner's binding lookup. The pre-existing `service_role` must have BYPASSRLS, receives closed reads plus 31 RPCs and no DML; migration preflight fails closed rather than changing its role attributes.
- Reason: Architecture Gate Round 2 showed that the prior prose could not independently create a durable job graph, could not construct several stored rows/types and would deadlock security-definer functions under forced RLS with no owner policy.
- Preserved boundary: source-led bounded discovery, shadow-only output, immutable authoritative history and the closed public RPC set remain unchanged. This material Sol repair invalidates Requirements Round 22 PASS and authorizes no implementation, migration, binding, scheduler, merge, push or production mutation.

## 2026-07-19 — Close bootstrap, mover-audit creation and worker-wire execution

- Decision: version the graph as `opportunity-job-graph-v3.1`. The existing private successor helper accepts SQL NULL only from `begin_opportunity_run_v3` for a locked new-run bootstrap; every other call requires the exact succeeded predecessor. The enrichment plan is topological: sector valuation precedes candidate financial, and mover price/audit precedes market reference.
- Decision: keep the public catalog at 31 RPCs. The one-through-five recent-session mover-price root branches of `complete_opportunity_manifest_v3` are the sole deterministic audit writer; every root commits its immutable audit/ranks, ordinal zero binds the selected audit, and only the final root creates the dependent market header. Pending and matured cutoffs are distinct append-only snapshots.
- Decision: `opportunity-postgres-types-v3.4` separates four outcome maturities from three scoring lanes and separates deep candidate/success/failure counts. Worker remote credential rejection after claim returns canonical 503, preserves only already committed lease/staging state and delegates recovery to the database reaper.
- Reason: Requirements Gate Round 23 found that the prior graph could not bootstrap through its own helper, two manifest dependencies were reversed, mixed batches and four maturities were unrepresentable, no existing function owned audit creation, the knowledge-time oracle contradicted tuple shapes and post-claim route failures lacked exact outcomes.
- Preserved boundary: knowledge-time filtering remains mandatory even when an exact domain tuple intentionally omits `recordedAt`; no new public RPC, candidate promotion, implementation, migration, binding, scheduler, merge, push or production mutation is authorized.

## 2026-07-19 — Close control-plane, calendar and worker-call authority

- Decision: `opportunity-control-v3.0` is the sole six-route begin/status/cron HTTP catalog, including exact query/body/auth/client/call/write precedence and canonical response bytes. No selector is ignored and no additional run-control route is implementation-selected.
- Decision: `tw-trading-calendar-v3.0` is the sole point-in-time completed-session authority. Independent TWSE/TPEX append-only streams collapse at cutoff before status, form a composite session only on matching completed schedules, and bind session/window/recent-plan hashes through factor, sector, mover/audit, outcome and evaluation evidence.
- Decision: version the graph as `opportunity-job-graph-v3.2`; workers perform exactly one job-bound finite read for each read-bearing payload and acceptance injects credential plus non-credential failure at every numbered call ordinal.
- Reason: Requirements Gate Round 24 found that run control, official-session corrections/cancellations and later worker call positions still required implementation convention despite otherwise closed prose.
- Preserved boundary: the public RPC catalog remains exactly 31; calendar rows/results are append-only; V3 remains research shadow; no implementation, migration, binding, scheduler, merge, push or production mutation is authorized.

## 2026-07-19 — Align cron knowledge time and bound valid-maximum worker data

- Decision: `opportunity-control-v3.1` separates lexical cutoff validation from database-time authority and maps the exhaustive begin exception catalog to exact HTTP bytes and zero-write rollback. Cron alone passes a server-owned expected Taiwan-session hash into the existing begin RPC identifier.
- Decision: `tw-trading-calendar-v3.1` resolves every cron-view row at its own returned 16:00 cutoff, never returns that row before the cutoff and makes begin re-resolve/hash-check it before any durable write. Statement-time corrections after that cutoff cannot enter the historical run.
- Decision: `opportunity-job-graph-v3.3` makes each parse job own one revision and replaces full connector/benchmark worker reads with bounded database-computed accounting, outcome and evaluation projections. Generic benchmark manifest rows receive database-derived symbol/session lookup columns so a 5,000,000-row manifest remains indexed without adding a dedicated sector-manifest table.
- Reason: Requirements Gate Round 25 showed that future-cutoff/bootstrap errors lacked a total wire, statement-time cron authority could disagree with historical resolution, and valid maximum normalized populations could not fit one worker response/staging envelope.
- Preserved boundary: the public RPC count remains 31, normalized/manifests remain immutable and point-in-time, workers still make one job-bound read, V3 remains research shadow, and no implementation, migration, binding, scheduler, merge, push or production mutation is authorized.

## 2026-07-19 — Move begin lineage identity into the database and unify authority failures

- Decision: `opportunity-control-v3.2` and `opportunity-runtime-v3.5` reduce begin to one non-overloaded five-argument RPC. Under the global lineage-lock, derived-preparation-lock and run-lock order, database begin selects the complete ordered mode input set and derives both comparison and preparation keys; HTTP/PostgREST supplies no key or input ID. `source_scan` owns an exact empty input set, enrich owns the typed zero/one/multiple source branch, and empty label/evaluation inputs are explicit valid plans.
- Decision: `opportunity-storage-v3.6` makes every absent, inactive, expired or conflicting greatest-time principal binding fail solely as `PT403/principal_role_unavailable`; the prior `principal_binding_integrity_failure` identity is forbidden. `tw-trading-calendar-v3.2` and storage share exactly three index shapes and forbid the alternate market-leading close index.
- Reason: Requirements Gate Round 26 showed that a caller could not construct a preparation key containing lineage selected only inside begin, the zero-upstream source branch was uncallable, one authority state had conflicting observable errors, and independent migration implementations could choose different calendar indexes.
- Preserved boundary: the public RPC catalog remains exactly 31, acceptance inventory is `1.26.0` with 207 exact JSON/Markdown cases, and the change remains architecture-only. No App code, migration, binding data, scheduler, merge, push or production mutation is authorized.

## 2026-07-19 — Preserve Requirements Round 27 blockers before Architecture review

- Decision: accept the independent Round 27 `CHANGES_REQUIRED` verdict with six P1 findings and keep Architecture Gate locked. The next amendment must separate database `principal_role_unavailable` from its public authentication envelope, choose one partial-evaluation manifest rule, publish byte-exact comparison/preparation/final key schemas, bind enrich purpose compatibility, distinguish calendar supporting indexes from constraint indexes and bound label-input selection before bootstrap.
- Reason: the Round 26 repair closed its four named seams but exposed cross-contract decisions that an implementation could otherwise resolve differently or without a finite pre-bootstrap bound.
- Preserved boundary: source-led discovery, additive/shadow-only writes, the five-argument begin interface and the no-implementation/no-migration checkpoint remain in force. Architecture review cannot start until a fresh Requirements Gate reaches zero P0/P1.

## 2026-07-19 — Close Round 27 execution identity, partial evidence and finite begin

- Decision: `internal-principal-v3.5` keeps `PT403/principal_role_unavailable` as the sole database binding identity and maps it only at the HTTP boundary to `authentication_rejected`. `source-led-eval-v3.3` and `opportunity-manifest-storage-v3.4` make exact 252-roster evaluation manifests complete at actual `backtestCount=0..120` and `liveCount=0..20`, with null metrics and explicit fail-closed facts until 120/20.
- Decision: `opportunity-runtime-v3.6` is the sole byte authority for 34-member static identity plus tagged comparison, preparation and logical RFC 8785 arrays. `market-context-v3.3` additionally freezes the 18-row provider/field preimage and required digest, splits TWSE/TPEx breadth and flow inputs before deterministic combination, binds three concrete global provider identities and gives their session selection a finite indexed boundary. Enrich lineage is same-purpose only. Label begin uses the native ordered indexed selector with `LIMIT 20001`; overflow is zero-write `PT409/bound_violation`. Calendar v3.3 distinguishes its three non-constraint supporting indexes from primary/unique backing indexes.
- Reason: every run identity, cardinality, error and catalog assertion now has one independently reproducible schema or bounded sentinel instead of an implementation-selected convention.
- Preserved boundary: source-led bounded discovery, five-argument begin, exact 31 public RPCs, shadow-only promotion and no App/migration/production action remain unchanged. The material repair requires fresh Requirements review before Architecture review.

## 2026-07-19 — Preserve Requirements Round 28 blockers before Architecture review

- Decision: accept the independent Round 28 `CHANGES_REQUIRED` verdict with six P1 findings and keep Architecture Gate locked. The next Sol amendment must bind acceptance and mode-owned evaluation-lock identity into run keys, make trend/breadth inputs constructible, bound global distinct-date authority and label raw candidates, remove the remaining exact-120 contradiction, and close the active version graph.
- Reason: the Round 27 forms are byte-exact but still omit identity-bearing values; provider facts cannot reproduce required trend/coverage evidence; two selectors bound outputs rather than all rows examined; and stale normative wording permits incompatible implementations.
- Preserved boundary: the provider allowlist digest, same-purpose lineage, database/public auth separation, constraint-aware calendar catalog, source-led discovery, additive/shadow-only writes and no-implementation/no-migration checkpoint remain in force. Architecture review cannot start until a fresh Requirements Gate reaches zero P0/P1.

## 2026-07-19 — Close Round 28 identity, market authority and finite raw scans

- Decision: `opportunity-runtime-v3.7` adds acceptance version to the 35-member static tuple and the purpose-owned evaluation dataset lock to preparation/logical keys. `market-context-v3.4`/`market-provider-v3.2` replace opaque trend scalars with exact 60-session close/MA authority, bind breadth numerator/coverage/roster evidence, derive one caller-absent authority date for every observation stream and cap global distinct-date selection at 64 revisions per date plus a 193-row raw sentinel. `source-led-eval-v3.4` bounds label inputs with a current-lock/two-purpose/252-session 30,241 raw-score sentinel before the 20,001 terminal sentinel.
- Decision: version storage/types/manifest as v3.8/v3.9/v3.5, make `252/0..120/0..20` the sole partial-evaluation grammar, close every active contract reference and version the exact JSON/Markdown inventory as `1.28.0` with 216 cases.
- Reason: every reuse identity and provider-derived value now has one reproducible input authority, every session/global/non-session revision cap has a database-derived indexed stream key, and large duplicate-date, irrelevant-history and sparse-result populations stop at explicit indexed `bound+1` limits rather than relying on output limits.
- Preserved boundary: source-led candidate discovery, full-market aggregate-only context, exact 31 public RPCs, additive immutable shadow writes and no App code/migration/production action remain unchanged. Fresh Requirements review is still mandatory before Architecture review.

## 2026-07-19 — Preserve Requirements Round 29 finite-authority blockers

- Decision: accept the independent Round 29 `CHANGES_REQUIRED` verdict with five P1 findings and keep Architecture Gate locked. The next Sol amendment must close stock-price provider/correction authority, raw revision/history bounds for source/authority/artifact/z-score streams, the constructible outcome-conservation maximum and every active version reference.
- Reason: terminal output/page limits cannot bound the raw histories needed to resolve price, source, mutable authority, artifact or normalized market evidence; the current outcome manifest can reject a plan that passed both begin sentinels; and two live delegations still point to superseded contracts.
- Preserved boundary: all independently confirmed Round 28 repairs remain in force, including exact run identity, market-observation and label sentinels, partial evaluation, source-led discovery, shadow-only output and no implementation/migration/production authority. A fresh Requirements PASS remains mandatory before Architecture review.

## 2026-07-19 — Close Round 29 price and finite-history authority

- Decision: `market-context-v3.5` separates stock-price authority from the fact provider enum with the exact 161-byte `market-price-provider-allowlist-v3.0` preimage, digest `b3e51c4782012a3dbcb5fafda46fa583aa61f0de5601d12699e27280b642df74`, `price_provider_v3`, literal corporate-action algorithm, owner/fallback/tie rules and a 64/65 price-stream bound. Every price-consuming manifest binds `priceProviderAllowlistHash`, which is the new 36th static identity member.
- Decision: `source-adapter-v3.2` and `authority-supersession-v3.1` cap every exact source revision/authority stream at 64 immutable rows under its stream lock and indexed `LIMIT 65`. Artifact registration takes registry then hash locks, permits at most 1,000 hashes and 64 revisions/hash and selects through raw `LIMIT 64001`; market z-score history freezes 512 dates and reads at most 32,769 raw rows per concrete provider stream. Non-blinded overflow retains only its already committed nonce and adds no domain/RPC-audit row.
- Decision: `source-led-eval-v3.5` emits exactly four conservation rows for each of at most 504 input runs, making 2,016 the constructible maximum. Runtime/storage/types/manifest/calendar/internal-principal advance to v3.8/v3.9/v3.10/v3.6/v3.4/v3.6; the exact JSON/Markdown inventory is `1.29.0` with 223 cases, including a mechanical active-version-graph oracle.
- Reason: every Round 29 selector now bounds rows examined rather than merely outputs, every correction/provider choice has one closed authority, and every begin-valid label plan has representable conservation evidence.
- Preserved boundary: this is architecture-only Loop work. No App code, migration, runtime write, build, merge, push, deployment or production mutation is authorized; Architecture remains locked until fresh Requirements Gate Round 30 passes.

## 2026-07-19 — Preserve Requirements Round 30 authority blockers

- Decision: accept fresh Requirements Gate Round 30 `CHANGES_REQUIRED` with `P0=0 P1=4 P2=0` and keep Architecture Gate locked. The next Sol amendment must define exact point-in-time corporate-action adjustment authority; bound global source and seven-authority key enumeration before eligibility collapse; reconcile nonce, RPC-audit, route and role durable effects; and remove every stale active-version edge.
- Reason: the Round 29 repair closes provider precedence, per-stream revision bounds, artifact/z-score selectors and outcome conservation, but it still permits caller-supplied adjusted prices, unbounded cutoff-ineligible populations, contradictory nonce-audit outcomes and a version oracle that fails on the current normative corpus.
- Preserved boundary: source-led discovery, shallow aggregate market context, additive immutable shadow design and the no-App-code/no-migration/no-production checkpoint remain in force. Architecture review cannot start until a fresh Requirements Gate reaches zero P0/P1.

## 2026-07-19 — Close Round 30 corporate-action, enumeration, nonce and version authority

- Decision: retain raw TWSE/TPEx OHLC as a bounded provider-tier stream, but remove every action/adjusted field from that input. `market-price-provider-allowlist-v3.1` now binds raw tiers plus three compiled owner-only official action feeds per exchange. One immutable exchange/session snapshot seals all three complete responses and normalized event rows; only its selected complete absence derives factor one, while event factors are database-derived post/pre ratios and every 0..252 action day enters adjusted-price evidence.
- Decision: retain exactly seven machine-ingestion routes and 31 granted RPCs by making the price-authority wire one exact discriminated raw/snapshot union. Runner calls never use a nonce. Human nonce consumption and its audit commit atomically in call one; call-two failure retains exactly those two rows and no append audit, while call-two success adds one append audit. Blinded calls remain one-transaction rollback on failure.
- Decision: source and all seven authority families register immutable keys under family-wide locks and enforce family bounds before cutoff, authority, publication, validity or status filters. Source selection enumerates at most 1,000,001 registry keys then 65 revisions per key; authority selection enumerates each tabled bound-plus-one registry then 65 events per key. The active version graph is mechanically single-valued and acceptance remains exactly `1.30.0` / 227 mirrored cases.
- Reason: official exchange action sources publish sparse event result sets rather than explicit per-stock no-action rows. A complete three-feed daily snapshot makes absence constructive, removes mirror/caller authority and preserves official adjustment for dividends, capital reductions and par-value changes. Registry-first selection and separated call transactions close the other Round 30 execution contradictions.
- Preserved boundary: this is architecture-only Loop work. No App code, migration, runtime write, build, merge, push, deployment or production mutation is authorized. A brand-new Requirements Gate must PASS before a fresh Architecture Gate may start.

## 2026-07-19 — Preserve Requirements Round 31 version-edge blocker

- Decision: accept fresh Requirements Gate Round 31 `CHANGES_REQUIRED` with `P0=0 P1=1 P2=0` and keep Architecture Gate locked. The only formal blocker is two active prose delegations to `runtime-transaction-contract.md v3.8` after the owner advanced to v3.9.
- Reason: the mechanical `GOV-004` oracle must reject a stale contract-name/version edge even when every underlying behavior and all other catalogs agree; implementation may not infer that two version labels are equivalent.
- Preserved boundary: Round 31 independently closed all four Round 30 substantive blockers and found no other P0/P1/P2 issue. The next Sol repair is architecture documentation only and authorizes no App code, migration, runtime write, merge, push, deployment or production mutation.

## 2026-07-19 — Close Round 31 version drift and summary seams

- Decision: change the two active runtime owner edges from v3.8 to v3.9 without advancing a contract version or acceptance inventory. Synchronize the design's observation-plane list with the already normative corporate-action snapshot/feed/event relations and its source-dataset summary with the already normative `registeredFamilyCount` root/conservation members.
- Reason: these are non-semantic reference and summary repairs to existing owners. They remove the sole formal Round 31 blocker and prevent Terra from implementing a stale abbreviated tuple or omitting action evidence tables.
- Preserved boundary: canonical preimages, the 36-member static tuple, 19 manifest kinds, 31 RPCs, route catalogs and exact `1.30.0` / 227-case inventory remain unchanged. No implementation, migration, binding, scheduler, merge, push, deployment or production mutation is authorized; fresh Requirements Round 32 must PASS before Architecture review.

## 2026-07-19 — Preserve Requirements Round 32 mover acceptance blocker

- Decision: accept fresh Requirements Gate Round 32 `CHANGES_REQUIRED` with `P0=0 P1=1 P2=0` and keep Architecture Gate locked. Repair only the mirrored `MKT-012`, `MKT-014` and `MKT-015` mover version literals from v3.2 to their existing v3.3 owner semantics, then require a brand-new Requirements Gate Round 33.
- Reason: canonical executable acceptance cannot prescribe a v3.2 root/audit identity while `mover-audit-price-v3.3`, the runtime static member, manifest `contractVersion` and deterministic audit UUID preimage require v3.3. JSON/Markdown parity mirrors but does not cure the conflict.
- Preserved boundary: Round 32 independently confirmed every Round 31 repair and all other active catalogs, bounds, authority, durable effects, RLS/grants and job/evaluation design. No implementation, migration, binding, scheduler, merge, push, deployment or production mutation is authorized.

## 2026-07-19 — Close Round 32 mover acceptance version drift

- Decision: replace only the six mirrored v3.2 mover literals in `MKT-012`, `MKT-014` and `MKT-015` with their already normative `mover-audit-price-v3.3` root and, where applicable, `opportunity-mover-audit-v3.3` audit-ID owner names.
- Reason: the repair makes executable acceptance select the same manifest contract version and deterministic UUID preimage as every current owner without changing test behavior or advancing the inventory.
- Preserved boundary: acceptance remains exactly `1.30.0` / 227 mirrored cases; all canonical preimages, contracts, schemas, RPCs and route semantics are unchanged. Fresh Requirements Round 33 must PASS before Architecture review, and no implementation or production action is authorized.

## 2026-07-19 — Preserve Requirements Round 33 worker-view authority blocker

- Decision: accept fresh Requirements Gate Round 33 `CHANGES_REQUIRED` with `P0=0 P1=1 P2=0` and keep Architecture Gate locked. Repair the sole job-bound worker view so it can read both bounded registries through controlled owner authority while continuing to forbid direct `service_role` registry SELECT.
- Reason: a security-invoker view evaluates underlying ACLs as `service_role`; BYPASSRLS cannot replace a withheld table-level SELECT. The current sole read path therefore cannot construct source or authority manifest pages.
- Preserved boundary: Round 33 independently closed the mover drift and found no other issue. The repair may not add a route/RPC, expose a registry, weaken job/input/read-kind filters, change the 31-function catalog or authorize App code, migration, merge, push, deployment or production mutation.

## 2026-07-19 — Close Round 33 worker-view authority seam

- Decision: advance the storage owner to `opportunity-storage-v3.11`. Keep the calendar and status views `security_invoker=true`, but make the sole worker read projection an owner-rights `security_invoker=false`, `security_barrier=true` view owned by `opportunity_v3_rpc_owner`. It may enumerate the two registries only in exact job-bound manifest branches.
- Reason: table-owner rights over RLS-enabled, non-FORCE relations make the bounded projection constructible without granting `service_role` direct registry SELECT. Exact reloptions/owner, bound success, unbound denial and direct-table denial are migration acceptance.
- Preserved boundary: the storage member changes run identity, but the static tuple remains 36 members and acceptance remains `1.30.0` / 227 mirrored cases. No function, route, view grant, registry payload, App code, migration, merge, push, deployment or production mutation is added or authorized; fresh Requirements Round 34 must PASS before Architecture review.

## 2026-07-19 — Preserve Requirements Round 34 reloptions conflict

- Decision: accept fresh Requirements Gate Round 34 `CHANGES_REQUIRED` with `P0=0 P1=1 P2=0` and keep Architecture Gate locked. Repair only the stale job-graph phrase that still calls `opportunity_worker_read_units_v3` security-invoker, then require a brand-new Requirements Gate Round 35.
- Reason: the storage v3.11 owner-rights view is now constructible and preserves direct-registry denial, but one active owner still mandates its mutually exclusive prior reloption. Implementation cannot choose between normative contracts.
- Preserved boundary: Round 34 found no other issue. The owner, barrier, exact job/input/read-kind binding, registry-only manifest branches, indexed sentinels, byte caps, 31 RPCs, route catalogs and exact `1.30.0` / 227-case inventory remain unchanged. No App code, migration, merge, push, deployment or production mutation is authorized.

## 2026-07-19 — Close Round 34 worker-view reloptions drift

- Decision: replace the sole stale job-graph phrase with the exact storage v3.11 model: `opportunity_worker_read_units_v3` is owned by `opportunity_v3_rpc_owner`, is a barrier, and uses `security_invoker=false`; the calendar/status views alone are invoker views.
- Reason: this removes the mutually exclusive active requirement while retaining the already reviewed PostgreSQL-constructible owner-mediated registry path.
- Preserved boundary: `service_role` receives no direct registry SELECT and no alternate read surface. Exact job/input/read-kind binding, registry-only manifest branches, indexed sentinels, byte caps, contract versions, 31 RPCs, routes and `1.30.0` / 227 cases remain unchanged. Fresh Requirements Round 35 must PASS before Architecture review; no implementation or production action is authorized.

## 2026-07-19 — Preserve Round 35 immutable-evidence failure

- Decision: record the Round 35 fail-closed `CHANGES_REQUIRED` result as an infrastructure finding and keep Architecture Gate locked. Hydrate immutable Git objects and run a brand-new Requirements Gate Round 36 from scratch with `/usr/bin/git` and a sufficient bounded wait.
- Reason: the reviewer terminated the first object read at 10 seconds and therefore had no authority to verify or reject any active contract. The same read later succeeded; replacing the missing review with self-review would violate the fresh Gate requirement.
- Preserved boundary: no normative artifact, contract version, acceptance case, RPC, route, schema or product behavior changes. No App code, migration, merge, push, deployment or production mutation is authorized.

## 2026-07-19 — Preserve Requirements Round 36 GOV-004 oracle drift

- Decision: accept fresh Requirements Gate Round 36 `CHANGES_REQUIRED` with `P0=0 P1=1 P2=0` and keep Architecture Gate locked. Correct only the two mirrored canonical `GOV-004` storage literals from v3.10 to their existing `opportunity-storage-v3.11` owner, then require a brand-new Requirements Gate Round 37.
- Reason: Round 36 waited through immutable-object latency and independently closed Rounds 34 and 35. Its sole content finding is that the version-graph oracle itself contradicts the storage header, design root, runtime tuple and migration oracle.
- Preserved boundary: inventory `1.30.0`, 227-case content/order, contract versions, static-member count, RPCs, routes, schemas and behavior remain unchanged. No App code, migration, merge, push, deployment or production mutation is authorized.

## 2026-07-19 — Close Round 36 GOV-004 storage-version drift

- Decision: replace only the canonical `GOV-004` JSON and Markdown storage literals from v3.10 with v3.11, the already-approved active owner version.
- Reason: this makes the version-graph oracle test the graph that every owner and migration/runtime acceptance already requires; it changes neither the graph nor product behavior.
- Preserved boundary: acceptance remains exactly `1.30.0` / 227 cases with identical IDs, order and all other fields. No contract version, static tuple member, manifest, RPC, route, schema, App code, migration or production authority changes. Fresh Requirements Round 37 is mandatory before Architecture review.

## 2026-07-19 — Accept Requirements Gate Round 37 PASS

- Decision: accept the independent fresh Requirements Gate Round 37 `PASS` with `P0=0 P1=0 P2=0` and advance only to a separate fresh Architecture Gate.
- Reason: the reviewer proved the repair scope and immutable ancestry, closed the sole Round 36 oracle drift, recomputed all required catalogs/hashes/bounds, and found no remaining material unspecified or conflicting requirement across R1-R11 or Safety.
- Preserved boundary: Architecture has not yet passed. Implementation, App code, migration, merge, push, deployment, production mutation, scheduler enablement, homepage promotion and model influence remain unauthorized.

## 2026-07-19 — Preserve Architecture Gate Round 3 blockers

- Decision: accept the independent fresh Architecture Gate Round 3 `CHANGES_REQUIRED` verdict with `P0=0 P1=4 P2=0` and keep implementation locked. Repair all four findings as one Sol architecture amendment, then require a brand-new Requirements Gate and a different fresh Architecture Gate.
- Reason: the sector-reference manifest lacks a single bounded evidence representation; the blinded link-audit route withholds the evidence a human must label; the separately implied UUIDv5 helper contradicts the exact two-helper catalog; and the rollout has no executable rollback DAG.
- Preserved boundary: the repair is limited to Loop design, contracts, acceptance and checkpoint evidence. No App code, migration, runtime write, build, merge, push, deployment, scheduler, homepage promotion or model influence is authorized.

## 2026-07-19 — Close Architecture Round 3 constructibility and rollback gaps

- Decision: reuse sector-return evidence instead of duplicating benchmark rows, with exact `10*K+2*U <= 200000` conservation; freeze one <=384-byte mention context plus engine decision into every selected link-audit sample; compute job/page UUIDv5 inline from preflighted `pgcrypto.digest(bytea,text)` with no third helper; and make `disabled|drain|shadow` plus the additive-schema rollback/re-enable DAG the sole V3 deployment authority.
- Reason: each repair chooses one implementable representation and failure boundary. Market benchmarks now have one stored full-roster proof including `unknown`; reviewers receive enough immutable evidence to label without seeing another label; the exact two-helper catalog remains true; and a partial rollout has deterministic stop, drain, disable, retained-schema, legacy-verification and restart semantics.
- Acceptance: canonical JSON/Markdown advance together to `1.31.0` / 231 exact cases through `SCR-014`, `EVAL-014`, `MIG-005` and `OPS-040`; all 36 static members, 19 manifest kinds, 31 public RPCs and two private helpers remain closed.
- Preserved boundary: this is still Sol-only architecture work. No application code, executable migration, production binding, test/build execution, merge, push, deployment, scheduler enablement, homepage promotion or model influence is authorized. Requirements Gate Round 38 is mandatory before any Architecture re-review.

## 2026-07-20 — Preserve Requirements Round 38 principal-version blocker

- Decision: accept the independent fresh Requirements Gate Round 38 `CHANGES_REQUIRED` verdict with `P0=0 P1=1 P2=0` and keep Architecture Gate locked. Repair only the four active non-owning delegations from `auth-principal-contract.md v3.7` to their already-active v3.8 owner, then require a brand-new Requirements Gate Round 39.
- Reason: the principal contract header, design root and runtime static identity all own v3.8, while four delegations still prescribe v3.7. That competing version graph makes `GOV-004` unsatisfiable even though the reviewer independently closed all four Architecture Round 3 mechanisms.
- Preserved boundary: acceptance remains exactly `1.31.0` / 231 cases and no contract owner, behavior, schema, RPC, route, App code, executable migration, merge, push, deployment or production authority changes.

## 2026-07-20 — Close Requirements Round 38 principal-version drift

- Decision: replace only the four active non-owning `auth-principal-contract.md v3.7` references with v3.8, the already-declared principal owner.
- Reason: runner route, authentication, nonce and failure semantics now resolve through one version edge, so the active graph and `GOV-004` stale-reference oracle are satisfiable without changing their behavior.
- Preserved boundary: no owner version, acceptance case, static member, manifest, schema, RPC, route or product semantic changed; the inventory remains exactly `1.31.0` / 231 mirrored cases. Fresh Requirements Round 39 remains mandatory before Architecture review.

## 2026-07-20 — Accept Requirements Gate Round 39 PASS

- Decision: accept the independent fresh Requirements Gate Round 39 `PASS` with `P0=0 P1=0 P2=0` and advance only to a different fresh Sol Architecture Gate Round 4.
- Reason: the reviewer proved exact immutable ancestry and repair scope, closed every v3.7 principal edge, consumed all 32 active artifacts, reproduced every acceptance/catalog/hash/vector invariant and found no material unspecified or conflicting requirement across R1-R11 or Safety.
- Preserved boundary: Architecture has not yet passed. Implementation, App code, executable migration, merge, push, deployment, production mutation, scheduler enablement, homepage promotion and model influence remain unauthorized.

## 2026-07-20 — Preserve Architecture Gate Round 4 model-runner authority blocker

- Decision: accept fresh Sol Architecture Gate Round 4 `CHANGES_REQUIRED` with `P0=0 P1=1 P2=0`. Preserve its independent closure of all four Round 3 findings and repair only `ARC4-001`: the approved `model_runner_v3` macOS isolation amendment has no active owner in this change.
- Reason: Requirements Round 39 is valid for its 32-artifact corpus, but that corpus cannot tell Terra how to construct the sanitized view, custom permission profile, scratch boundary, prompt/result protocol or trusted apply handoff required by the user's separately approved runner amendment.
- Preserved boundary: implementation remains locked. No App/runner code, executable migration, build, merge, push, deployment, scheduler, homepage promotion or model influence is authorized. A brand-new Requirements Gate and different fresh Architecture Gate are mandatory.

## 2026-07-20 — Close Architecture Round 4 model-runner authority gap

- Decision: add `model-runner-contract.md` v3.1 as the sole active owner for local Loop execution. Its custom macOS profile is exactly root deny, minimal runtime read, sanitized-view read, private-scratch write and command network disabled; legacy `--sandbox` cannot compose or override it. The prompt forbids instruction to execute repository/prompt/patch code, while the hard claim is deliberately limited to external user/repository reads, authoritative writes and command network. Codex-private scratch and possible code execution inside the allowed boundary are not denied claims.
- Runner identity: the separate exact 13-member/596-byte canonical preimage hashes to `4179c04e52b14f0d8ab0a5fcc7638e11f399262db95e09876da76d44866a784e`. It does not enter the opportunity runtime's 36-member comparison tuple because development tooling is not a stock-model input; the acceptance version does advance that existing tuple.
- Acceptance: canonical JSON and Markdown advance together to `1.32.0` / 246 exact cases through `MR3-001`..`MR3-015`, covering non-Git sanitized view, prompt binding, profile precedence, external reads, authoritative writes, allowed scratch, network, zero injection, descendant inheritance, host/codesign pinning, replacement race, environment/FD isolation, sealing, trusted Git and domain-registration separation.
- Domain boundary: Loop patch/review/verify results never write Supabase or enter opportunity math. A separate offline domain artifact remains absent until signed human registration and is display-only with `influence:none` afterward.
- Preserved boundary: no implementation, App code, migration, test/build execution, merge, push, deployment, scheduler, homepage promotion or model influence is authorized. Requirements Round 40 must PASS before Architecture Round 5.

## 2026-07-20 — Preserve Requirements Round 40 runner-constructibility blockers

- Decision: accept fresh Sol Requirements Gate Round 40 `CHANGES_REQUIRED` with `P0=0 P1=5 P2=0`. Treat original `ARC4-001` as closed, retain the five replacement completeness findings and keep Architecture Round 5 and implementation locked.
- Reason: the new owner establishes the approved isolation direction, but Terra would still have to invent CLI/manifest/routing/status semantics, permanent prompt exclusions, a constructible scratch anchor, descendant FD closure, the executable/codesign oracle, JSONL/result bounds and deterministic Git/journal bytes.
- Preserved boundary: Sol may amend only Loop requirements, design, contracts, immutable fixtures, acceptance and gate evidence. No runner/App code, executable migration, tests/build, merge, push, deployment, scheduler, homepage promotion or model influence is authorized.

## 2026-07-20 — Close Requirements Round 40 runner-constructibility gaps

- Decision: advance the sole owner to `model-runner-v3.2` without opening V4. Freeze canonical manifest/task/path schemas; exact CLI-to-operation, Sol/Terra/waiver routing, state/status/exit and hash-chain journal protocols; permanent prompt exclusions; a repository-root trusted anchor; descriptor closure; the pinned JSONL/result matrix; and deterministic commit/ref/recovery bytes.
- Host compatibility: add canonical `model-runner-host-pins-v3.json`, 2,136 bytes before LF with SHA-256 `70eb964ca9cfc22e237dc9b041ff8c53604db84992f9a6fb06d583de4a963387`. It pins `/usr/local/bin/node` v22.14.0, Apple Git 2.50.1 and the currently installed signed Codex 0.145.0-alpha.18. The previous 0.144 pin cannot run after the host update and receives no fallback.
- Runner identity: the exact 18-member/883-byte canonical identity hashes to `6075dd8d58bb742e748e5c68e22891882b6dd6d0d0c4a688bfbb9dcb3672421f`. Canonical acceptance advances to `1.33.0` / 252 through `MR3-016`..`MR3-021`; the opportunity runtime tuple remains 36 members and changes only its acceptance literal.
- Preserved boundary: hard guarantees remain external-read, authoritative-write and command-network isolation, not absolute code-execution prevention. Scratch remains allowed and non-authoritative. No implementation, executable test/migration, build, merge, push, deploy, scheduler, homepage promotion or model influence is authorized before fresh Requirements and Architecture PASS.

## 2026-07-20 — Preserve Requirements Round 41 completeness blockers

- Decision: accept fresh Sol Requirements Gate Round 41 `CHANGES_REQUIRED` with `P0=0 P1=4 P2=0`; keep Architecture Round 5 and implementation locked.
- Reason: the host, trusted anchor, descriptor closure and prior ARC3 repairs are valid, but a reviewer/verifier sees only proposal hashes, permanent path exclusions still contain semantic gaps, task/resource recovery has no total cross-journal outcome, and empty maker output conflicts with mandatory Git apply.
- Preserved boundary: Sol may edit only Loop design, contracts, acceptance and Gate evidence. No runner/App code, migration, executable tests/build, merge, push, deployment, scheduler, homepage promotion or model influence is authorized.

## 2026-07-20 — Close Requirements Round 41 proposal/path/recovery gaps

- Decision: advance the sole owner to `model-runner-v3.3`. Bind review, verify and repair make to a sanitized view of the exact proven proposal commit; freeze one lexical permanent-exclusion grammar with unconditional precedence; define one write-ahead dual-journal partial order plus exhaustive state/output/retry oracle; and reject every empty/no-op maker patch.
- Reason: each model operation now observes the bytes it judges or repairs, every forbidden path is mechanically decidable, every crash/cleanup combination has one durable outcome, and trusted Git has no invented no-op branch.
- Acceptance: add exact mirrored `MR3-022` through `MR3-025`; canonical inventory becomes `1.34.0` / 256. The separate 18-member/883-byte identity is SHA-256 `60175c63935fc0fc3176b1cac4cfd5d14c2a681fbaa4c277d2a3edc02a91f652`; the host fixture stays unchanged.
- Preserved boundary: hard claims remain external user/repository read, authoritative write and command network isolation; scratch and possible sandbox execution remain outside the denial claim. No implementation or production action is authorized before fresh Requirements and Architecture PASS.

## 2026-07-20 — Preserve Requirements Round 42 resource/recovery blockers

- Decision: accept fresh Sol Requirements Gate Round 42 `CHANGES_REQUIRED` with `P0=0 P1=2 P2=0`; keep Architecture Round 5 and implementation locked.
- Reason: a pre-`prepared` resource chain reused the unchanged operation-round key after cleanup, and the global primary-exit precedence contradicted the journal rule that cleanup failure ends as `IO_ERROR`/11.
- Preserved boundary: Sol may edit only Loop requirements, design, contracts, acceptance and Gate evidence. No runner/App code, migration, executable tests/build, merge, push, deployment, scheduler, homepage promotion or model influence is authorized.

## 2026-07-20 — Close Requirements Round 42 resource/recovery gaps

- Decision: advance the sole owner to `model-runner-v3.4`. Before any resource byte, exclusively persist one contiguous immutable reservation ordinal and derive `resourceAttemptKeySha256` from the unchanged operation key plus that ordinal. A cleanup-success pre-`prepared` failure creates no operation tuple, changes no task byte/counter and permits the next ordinal; no reservation or journal is deleted/reused.
- Cleanup authority: primary-cause precedence selects the would-have-been outcome. Cleanup success preserves it; cleanup failure universally returns `IO_ERROR`/11, records `recovery_required` and `lastExit=11`, emits no stdout plus one canonical stderr error, and retains the primary code/exit and every proven result/commit/ref for identical replay without model retry.
- Acceptance: add exact mirrored `MR3-026` and `MR3-027`; canonical inventory becomes `1.35.0` / 258. The 18-member runner identity stays 883 bytes and hashes to `8051f3c60d96217f48a188af2f8f3ee5140dcc9c4296e953afa491cbd46d96ea`; the host fixture stays unchanged.
- Preserved boundary: hard claims remain external user/repository read, authoritative write and command network isolation; scratch and possible sandbox execution remain outside the denial claim. Fresh Requirements Round 43 remains mandatory before Architecture review, and no implementation or production action is authorized.

## 2026-07-20 — Preserve Requirements Round 43 identity/output blockers

- Decision: accept fresh Sol Requirements Gate Round 43 `CHANGES_REQUIRED` with `P0=0 P1=2 P2=0`; keep Architecture Round 5 and implementation locked.
- Reason: the sole owner promised identity binding that its closed durable schemas and key preimages could not encode, left the attempt protocol unassigned, and called cleanup stderr canonical without prescribing its message bytes.
- Preserved boundary: Sol may edit only Loop requirements, design, contracts, acceptance and Gate evidence. No runner/App code, migration, executable tests/build, merge, push, deployment, scheduler, homepage promotion or model influence is authorized.

## 2026-07-20 — Close Requirements Round 43 identity/output gaps

- Decision: advance the sole owner to `model-runner-v3.5`. Add exact `modelRunnerIdentitySha256` members to request, status, reservation, every operation/resource journal line and attempt metadata; bind both key preimages to the same digest; assign `model-runner-attempt-v3.5`; reject missing/different durable identity as preserved `recovery_required` without replay or rewrite.
- Output authority: define the exhaustive nonterminal diagnostic code/exit/exact-message table. Every diagnostic is RFC-8785 UTF-8 plus one LF with no interpolated cause/path/identifier data. Cleanup failure always emits the exact `IO_ERROR` object and empty stdout; replay returns byte-identical output while retaining the primary pair and proven result/commit/ref.
- Acceptance: strengthen `MR3-024`, `MR3-026`, `MR3-027` and `GOV-004`; add `MR3-028`. Canonical inventory becomes `1.36.0` / 259. The 18-member runner identity stays 883 bytes and hashes to `ba56dd112ecf642696c443d1c55a1c025331f70b808fc73c784e6f1ab2d65ac1`; the host fixture stays unchanged.
- Preserved boundary: hard claims remain external user/repository read, authoritative write and command network isolation; scratch and possible sandbox execution remain outside the denial claim. Fresh Requirements Round 44 is mandatory before Architecture review, and no implementation or production action is authorized.

## 2026-07-20 — Accept Requirements Gate Round 44 PASS

- Decision: accept fresh Sol Requirements Gate Round 44 `PASS` with `P0=0 P1=0 P2=0` over immutable head `9bb4fb640a653e593fcbf493fab3304e034d2833`.
- Evidence: the reviewer consumed all 34 active artifacts, reproduced exact ancestry/scope/trees, `1.36.0` / 259 five-field mirror and digests, the 18-member/883-byte runner identity, unchanged host fixture, all catalog counts and every R1-R11/Safety and prior Architecture Round 3 mechanism. Both Round 43 blockers and all Round 42/41 findings are closed.
- Next gate: Requirements is passed. Only a different fresh Sol Architecture Gate Round 5 may now decide implementation readiness; Terra remains locked until that gate has zero P0/P1.
- Preserved boundary: no runner/App code, migration, executable test/build, merge, push, PR, deployment, scheduler, homepage promotion or model influence is authorized by this Requirements verdict.

## 2026-07-20 — Accept Architecture Gate Round 5 PASS and stop

- Decision: accept fresh Sol xhigh session `019f7c12-9e35-7201-89a7-cfb6f8bc5a84` Architecture Gate Round 5 `PASS` with `P0=0 P1=0 P2=0` and no `ARC5` finding over immutable head `4b6fb01bda2a7dc585c36e34163bf0929166e0cb`.
- Evidence: the reviewer consumed all 34 active artifacts, reproduced exact ancestry/scope/trees, `1.36.0` / 259 five-field mirror and digests, every catalog/version edge, the runner and host identities, R1-R11/Safety, all four Round 3 closures and the Round 4 runner-owner closure. It found `model-runner-v3.5` constructible under the approved relaxed isolation claim.
- Handoff: planning and design are complete. The user already approved the change, so the next permitted action is one Terra `$loop-next source-led-opportunity-engine-v3` implementation task. Luna is ineligible for runner, contract, critical, integration, review and verification work.
- Mandatory stop: no runner/App code, migration, executable test/build, merge, push, PR, deployment, scheduler, homepage promotion or model influence was performed in the Sol Gate sequence. Production mutation remains unauthorized.

## 2026-07-24 — Authorize Codex host-pin compatibility amendment

- User authority: explicitly authorize rebuilding the immutable host pin for the currently installed Codex release. The requested `0.146.0-alpha.3` had already advanced at measurement time; the exact installed binary reports `codex-cli 0.146.0-alpha.3.1`, so the amendment pins `.3.1` and its measured bytes rather than inventing an unavailable identity.
- Decision: advance the sole runner owner to `model-runner-v3.6` and the fixture to `model-runner-host-pins-v3.3`. Keep every `v3.5` manifest, request/result, routing, permission, prompt, source-view, journal and trusted-apply protocol unchanged. This is an executable/codesign compatibility amendment only.
- New immutable identities: fixture pre-LF bytes `2,137`, SHA-256 `37f164d47cd110d7399b2b6e69eded5de627dc2e9573cd789a6292a8e91de4f0`; runner identity `18` members / `884` bytes / SHA-256 `7643c2eed2a62b1cefa20bde9d91c533b2309e55eda2541535d0f31f2e849e54`.
- Measured Codex identity: executable SHA-256 `a2b6198fd61327f54542716bd96e588c5b10789522fee4bbacaeff1aa7836efb`, executable CodeDirectory SHA-256 `b81d53d6df5ab26ce419cf2637a859d8c7f1f56e970a2e5945d884c6a398bdda`, bundle CodeDirectory SHA-256 `56572d4c92d53f0c09776d3654f86432716ca2f5419bdc1a6ec5867c3c8f4b5a`, Team ID `2DC432GLL2`, notarized Developer ID assessment.
- Acceptance: strengthen existing `MR3-019` and `GOV-004` without adding a new behavior case; canonical inventory becomes `1.37.0` / `259`.
- Preserved boundary: no production migration, scheduler, homepage promotion, model influence, merge, push or deployment is authorized. Fresh requirements and architecture review must confirm the active graph before this compatibility amendment can satisfy the final Verification Gate.

## 2026-07-24 — Approve hybrid product direction

- User authority: explicitly selected the mixed/hybrid option at the final autoplan approval gate.
- Decision: keep the complete V3 runtime repair scope, make a dedicated verified-change workspace the first product milestone, keep `model_runner_v3` on an independent release track and defer public position-sizing fields.
- Product contract: add `hybrid-product-amendment.md` as the active milestone owner with three decision lanes, one bounded immutable same-run `verifiedChangeBrief` per item and a non-authoritative official-only/source-led/hybrid bake-off.
- Preserved boundary: production mutation, principal bindings, schedules, homepage promotion, model influence and elapsed promotion evidence remain unauthorized. Exact-commit review must still precede the repair Verification Gate.
- Gate consequence: run a fresh requirements and architecture consistency review over the amended active graph before continuing implementation.

## 2026-07-24 — Close public selector and runtime identity amendment

- Decision: make `select_opportunity_public_projection_v3` the thirty-second and final granted RPC. It owns the one-statement, point-in-time cold/nonmatching/active/failed/success/tie selection and warning-authority projection; application-side prefiltering is no longer authoritative.
- Version consequence: advance data to `source-led-opportunity-v3.2`, job graph to `opportunity-job-graph-v3.7`, PostgreSQL types to `opportunity-postgres-types-v3.12`, runtime to `opportunity-runtime-v3.11`, storage to `opportunity-storage-v3.14`, and canonical acceptance to `1.39.0` / 266. The exact 37-member comparison preimage remains 2,435 UTF-8 bytes and now hashes to `75b1c30b06bdaa7354969cc6142d9a9745294aeea1e8e1cfabf32e255ebc6ea3`.
- Verification consequence: the product/runtime track executes only its 218-case partition, the model-runner track executes its separate 28-case partition, and the 20 evaluation-governance cases can no longer be reported as product-test passes. Missing non-fabricated elapsed cohort evidence remains a truthful blocked third-track result.
- Preserved boundary: the new selector is additive and read-only. No merge, deployment, production migration, scheduler change, homepage promotion, model influence or fabricated cohort evidence is authorized.

## 2026-07-24 — Close executable evaluation and bound-input identity amendment

- Decision: advance canonical acceptance to `1.40.0`, the job graph to `opportunity-job-graph-v3.8` and runtime to `opportunity-runtime-v3.12`. The database now selects and binds the bounded `outcome_enrich`, `evaluation_enrich` and `evaluation_outcome` run inputs before bootstrap; outcome workers accept only the exact database-computed fourteen-field result shape; evaluation algorithms execute deterministic Precision@20, NDCG@20, Type-7 MAE and conjunctive promotion logic while real elapsed cohort evidence remains fail-closed.
- Identity consequence: the exact 37-member comparison preimage remains 2,435 UTF-8 bytes and now hashes to `3f60303f8b6a455d585e78c363e34ddb1f690793bff388202594d8c9598d0058`. The 32-RPC catalog, 20-manifest catalog, storage `opportunity-storage-v3.14`, PostgreSQL types `opportunity-postgres-types-v3.12`, data contract `source-led-opportunity-v3.2` and host-pin fixture remain unchanged.
- Verification consequence: product/runtime, evaluation-governance and model-runner are three disjoint mandatory tracks. Executable evaluation semantics can pass independently, but the aggregate Verification Gate remains `BLOCKED` until a non-fabricated `120` backtest-date / `20` live-date cohort artifact satisfies the elapsed gate.
- Preserved boundary: no production migration, scheduler change, public promotion, model influence, merge or deployment is authorized. Historical review evidence is not rewritten; fresh Requirements and Architecture reviews must judge this amended active graph.

## 2026-07-26 — Close Round 49 manifest-authority and adjusted-factor repair amendment

- Decision: advance canonical acceptance to `1.41.0`, the factor-scoring owner to `opportunity-features-v3.1` and the job graph to `opportunity-job-graph-v3.9`. Candidate planning and factor populations now consume only the exact run-bound source-identity, roster and taxonomy manifests. Source parsing receives a bounded manifest-native candidate projection for exact ticker/name/alias plus typed fuzzy rejection, never fuzzy auto-link authority.
- Factor consequence: `factor_scoring_reference` derives MA20 and the SBL share-balance numerator from exact `adjusted-price-evidence-v3.1`; included native rows carry the complete ordered adjusted-price evidence array when the feature consumes adjusted close. The four chip inputs remain sourced only from `opportunity_stock_flow_observations_v3`.
- Catalog consequence: `append_stock_flow_observation_v3` makes the public catalog exactly 33 non-overloaded granted RPCs. The two successor helpers plus every other private helper remain ungranted. Acceptance, design, task and security catalog text is updated without rewriting historical review evidence.
- Identity consequence: the exact 37-member comparison preimage remains 2,435 UTF-8 bytes and hashes to `a6ff8fac6f49d59924fe589a001379c4373581c336c5fb8d048fa80595344738`.
- Preserved boundary: no fabricated elapsed cohort, production mutation, scheduler change, public promotion, model influence, merge or deployment is authorized. Fresh Requirements and Architecture reviews remain mandatory before an implementation commit and exact-commit review.
