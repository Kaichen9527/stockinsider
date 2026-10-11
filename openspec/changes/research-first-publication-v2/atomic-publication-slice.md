# Atomic research publication v2 — implementation boundary

Base50d340f56965722c0578ecea5a963279f9cbc1f4. This implements the already approved first-publication-v2 transaction; it does not adopt a strategy, grant research qualification or configure role authority. Earlier inert bundle/outbox lineage and saved-observation validation remain prerequisites, not completed publication.

## One existing guarded publication path

Add a closed marker2 publication action to the existing internal deep-job route. Authenticate the actual publishing author-controller bearer and resolve the current configured author/reviewer pair. Do not synthesize another role's Request. Body carries only action, the original complete input request, inputRevisionId/inputHash, authorResultId/authorResultHash and reviewerResultId/reviewerResultHash. No caller-supplied article, accepted flag, model, URL/path, SQL, principal or lease duration. Use the existing10-second reader deadline,8192-byte body/depth limit and exact header/key/type checks. Do not add a public API or a second queue.

Before first publication, use the existing private reviewer-result context and source readers. Bind both configured principals to the original immutable assignments. Re-execute complete input/business article/calculators and rebuild the exact reviewer packet; revalidate saved author and reviewer observations with their ORIGINAL received_at and both original completion receipts. Reviewer start must follow author end; reviewedAt must fit the reviewer observation. Raw review must pass all eight editorial checks and explicitly decision=accepted; contract_valid_only is not acceptance. Recompare the complete saved envelope hashes and logical bytes, not a caller assertion. This remains controller-observation authority; synthetic test reports never prove actual model work.

The final SQL submission consumes exact immutable result IDs/hashes and the same bounded server-derived article projection hash. It independently reloads saved rows, reruns SQL editorial validation/hash/shape/clock/lineage checks and rejects any changed saved result or packet. Source liveness and original current lease are checked inside the transaction, not merely in TypeScript.

## Existing storage, explicit exclusive branches

Extend candidate_research_dossiers and candidate_dossier_submission_receipts with revision_kind default legacy_detail_v1 plus v2 input/company/snapshot, exact author/reviewer result references and source_seal_id. Existing v1 detail_snapshot_id/revision_id FKs and required fields stay required in that branch. Only research_input_v2 permits legacy IDs NULL and requires every v2 identity; all CHECKs test NOT NULL explicitly. Bind original company/snapshot/input/job/attempt/result/seal with restrict FKs and exact tuple checks, not nullable equality. Add v2 partial uniqueness; existing v1 indexes and writers remain unchanged. No stock/detail/published-stage row is fabricated.

Keep narrative_kind=codex_enriched and a closed content discriminator for the v2 article. is_deep_research remains derived from deepResearch content and is not publication/qualification authority. Preserve the existing paid-content regex literally, including new v2 rows; no escaping or exemption to evade it. Content contains only validated publishable prose, paragraph references, same computed tables/valuations and explicit dates/gaps. Never publish controller principals, work owner, private execution observations, credentials or member/private raw text. Old AUO/EMC working drafts retain original demonstration flags and hashes.

v2 completion gets its own explicit reviewer-result FK; do not repurpose legacy completion_review_id semantics. Original job records retain receipt/completion bindings. Dossier and receipt stay append-only, with an RC/fresh-snapshot/RLS-visible TRUNCATE fence equivalent to existing v2 bundle/outbox protections. No new publication table or result ledger.

## Single transaction and least privilege

Require READ COMMITTED. Lock shared source fence(610091002), existing global deep lock(2409,6002), original deep job FOR UPDATE, original outbox and bundle in that order. This fence is the same namespace used by corrections, new source revisions and rights changes. Reload original live attempt/owner, input and source seal after locks; a lease that expires while waiting must reject, with no extension.

On first publish, create/get the exact existing v2 bundle through a narrowly granted research_input_preparation_owner_v2 helper (preserving its existing owner guard and exact inert payload). The outer research_observed_rpc_owner writer creates/locks the same v2 outbox, transitions queued→running with the ORIGINAL job owner/deadline and then accepted in the same transaction. Replace only the v2 inert update guard with closed writer-only transitions, immutable identity and an exact accepted receipt dependency; ordinary/v1 claims/writers are unchanged. No generic privileged status setter.

Insert exactly one immutable dossier and existing submission receipt, bind the original source seal as its durable publication dependency, accept that outbox, then complete the original job against that receipt. All are one transaction; any error, constraint violation, lease expiry or injected insertion failure rolls back every effect. Existing author/reviewer reservations are already completed and remain unchanged; no new reserve, finish, refund or renewal. Recheck the transaction's original live deadlines before final effects.

The submission hash uses a distinct domain and the full versioned lineage including company/snapshot/input/bundle, both results and the exact public projection; different inputs cannot collide through a reused article hash. No payload supplied by the caller can replace saved prose/review.

## Stable replay and source withdrawal

Exact completed replay uses a separate immutable completed-publication reader. It verifies the original stored canonical request, caller identity/current configured role assignments, exact input/results/article/submission/bundle/outbox/receipt/job bindings and returns the original immutable receipt. It cannot use a live-work claim helper that rejects completed jobs. No new rows, model charges, lease time or replacement source seals. A different request or competing attempt fails.

Historical accepted receipt remains accepted after source invalidation, supersession or deadline expiry. Separately computed current research state becomes withdrawn/needs_review from the original seal dependency and existing atomic source invalidation events. Source-first commit must prevent the first publication; publication-first then withdrawal must preserve original bytes and expose the withdrawn state. Repeated source events, restart and replay cannot erase invalidation or create duplicate publication. This first slice requires durable dependency plus a private bounded read projection; shared desktop/mobile renderer integration follows against exactly this public shape, not a static duplicate article.

## Executable acceptance

Use actual original migrations, original job/reservation/assignment/result pipeline and independent role fixture keys in disposable PostgreSQL. Explicitly label synthetic controller/model reports. Native HTTP acceptance is separate from deterministic SQL/unit tests.

- Positive original reserved author→completed handoff→reserved independent reviewer→accepted saved review→one existing bundle/outbox/dossier/receipt/job completion. Both model charges/completions, source/input rows and all formal catalogs/qualification/strategy/paper ledger unchanged.
- Wrong/mixed/null v1/v2 lineage, ordinary claim, direct role/table writes, unaccepted editorial decision, altered article/table/hash, old review, role swap/rotation, missing completion, used invocation and missing/stale source reject atomically.
- Concurrent duplicate first publication returns one receipt; exact dropped-response/restart replay returns original bytes with no charge. Conflict replay or takeover fails; expired original live lease while waiting cannot publish.
- Inject failures after each durable insert/update and verify no partial bundle/outbox/dossier/receipt/dependency/job state. Add real two-session source-first/publication-first, newly inserted revision and rights-ABA tests, plus repeatable-read/truncate defenses.
- After withdrawal, original receipt/rows are unchanged and projection explicitly withdrawn; no active-claim requirement for historical read or exact replay. Public projection contains no private sentinel/principal/owner/observation.
- Legacy v1 outbox/dossier/deep-publication tests remain green; negative EPS/periods/calculator reexecution and paid-content check remain enforced. Related tests/types/lint/build and independent exact review required. No protected release, actual model execution, formal qualification, deploy or profitability claim follows solely from synthetic acceptance.
