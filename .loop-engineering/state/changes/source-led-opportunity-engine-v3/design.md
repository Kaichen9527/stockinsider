# Design: source-led-opportunity-engine-v3

## Architecture Decision

Use a bounded source-led funnel. Discussion/research/event sources create candidates; market providers enrich those candidates. Full-market data never creates an actionable candidate in V3.

```text
approved source documents
  -> normalize + claim dedupe
  -> stock entity link / typed rejection
  -> source candidate ledger (max 60)
  -> eligibility + quota rank (max 30)
  -> market/fundamental/chip enrichment
  -> multi-horizon score + valuation (max 20)
  -> formal research status + action decision
  -> V3 radar (max 12 visible decisions)
  -> immutable outcomes and shadow evaluation

full-market aggregates/top movers
  -> context + missed-source audit only
  -X-> actionable/formal promotion
```

## Normative Contract Map

`requirements.md` defines scope and observable behavior.
`product-correctness-runtime-amendment.md` owns the V3.11 change classification and
authority boundary. `runtime-installation-contract.md`,
`discovery-correctness-contract.md`, `technical-decision-contract.md`,
`analysis-revision-contract.md`, `legacy-radar-correctness-contract.md` and
`acceptance-evidence-contract.md` are the closed V3.11 behavior owners.

`source-adapter-contract.md`, `source-matrix.md`, `instrument-roster-contract.md`,
`entity-link-contract.md`, `sector-taxonomy-contract.md` plus
`sector-taxonomy-map-v3.json`, `authority-supersession-contract.md`,
`financial-data-contract.md`, `trading-calendar-contract.md`,
`scoring-contract.md`, `market-contract.md`, `sector-reference-contract.md`,
`sector-cycle-contract.md`, `sector-benchmark-contract.md`, `valuation-contract.md`,
`decision-contract.md`, `portfolio-context-contract.md`, `data-contract.md`,
`v3-detail-contract.md`, `legacy-compatibility-contract.md`,
`shadow-evaluation-contract.md`, `auth-principal-contract.md`,
`control-plane-contract.md`, `postgres-type-contract.md`,
`manifest-storage-contract.md`, `job-graph-contract.md`,
`runtime-transaction-contract.md`, `storage-schema-contract.md`,
`model-runner-contract.md`, `host-pin-compatibility-amendment.md` and
`model-runner-host-pins-v3.json` define their named calculations, authorities,
execution boundary, persistence and serialized interfaces.

`source-adapter-v3.3` owns the non-null authority-derived revision identity/key,
registry-first 1,000,000-family bound and 64-revision family boundary;
`authority-supersession-v3.2` owns the seven global stream registries and 64-event
per-stream boundaries; `internal-principal-v3.8` owns the exhaustive eight
runner-ingestion and eleven human-route catalogs, including bounded hash-bound
link-review evidence, separated no-nonce versus signed-nonce effects, dual
bearer/principal control, finite-append error mapping and database-to-public
binding-error mapping; `opportunity-control-v3.3` owns the six begin/status/cron
route wires and closed begin-error mapping; `tw-trading-calendar-v3.4` owns
at-own-cutoff market-session supersession, cron assertion, supporting-index catalog
and composite-session evidence.

`market-context-v3.6` owns market fact authority, raw-price tiering, the three
compiled owner-only corporate-action feeds per exchange, complete daily snapshot
selection and trusted adjusted-price derivation; only a selected complete empty
snapshot may prove no action. `opportunity-manifest-storage-v3.10` is the sole
physical paging/root/lifecycle authority for every named dataset or authority
manifest; `opportunity-job-graph-v3.15` is the sole null-predecessor bootstrap,
successor, inline UUIDv5, immutable payload/result, mover-root audit, token-bound
database-computed read and finite worker call-plan authority; domain files own only
native rows/header semantics. `opportunity-runtime-v3.17`,
`opportunity-storage-v3.25` and `opportunity-postgres-types-v3.22` own byte-exact run
identity, transaction, physical and type closure.

`model-runner-v3.6` solely owns local Loop manifest/CLI/routing/status,
proposal-visible sanitized views, the lexical exclusion oracle, profile/scratch/FD
authority, sealed result handoff, deterministic trusted Git, identity-bound durable
pre-`prepared` resource-attempt reservation, total dual-journal recovery/cleanup
precedence and byte-exact diagnostic/replay output; the 2,143-byte host fixture is its
immutable executable/codesign oracle. It is not a production worker or domain
scoring/model-influence path. This design explains component ownership; it cannot
weaken those contracts. A conflict between normative files is a Gate failure and must
be amended rather than resolved by implementation convention.

### Mechanical active-version graph

`active-artifact-catalog-v3.json` is the sole exact file/owner edge oracle. The three
canonical authority tags immediately below are the only design-side declarations for
catalog identity, active-file topology and the shortened product-correctness owner.
Their JSON payloads use RFC 8785 key order and are permitted exactly once only.

<!-- GOV-004-AUTHORITY {"catalogBytes":6337,"catalogSha256":"a561a57b19f4d32b234fcc2f67451f5c79cda2f7d577d73a3c76a05e2711f6cb","kind":"design-catalog-identity"} -->
<!-- GOV-004-AUTHORITY {"activeFiles":55,"kind":"design-active-file-topology"} -->
<!-- GOV-004-AUTHORITY {"kind":"design-product-correctness-owner","owner":"product-correctness-runtime-v3.11.11"} -->

`GOV-004` parses every tag across the active graph, rejects a missing, repeated,
non-canonical or conflicting tag, and normalizes case, key order and punctuation before
pairing a PCR owner name and three-part version in either order, then rejecting any
untagged lexical declaration that claims one of these managed authorities. A literal
`v` version is authority-like. A bare three-part version is authority-like if and only
if a direct closed declarator (`=`, `:`, `is` or `equals`) joins it with the shortened
or full PCR owner in either order, or its bounded pair carries `authority`, `owner` or
`version` context. This closes bare PCR authority claims without treating date/activity
prose as ownership.
`GOV-004` parses that file, requires strict ASCII order and no duplicate/missing/extra
file or owner row, requires this `design.md` Architecture subject in the active graph,
then independently extracts every contract/amendment version/status
header, the exact runtime static tuple, the separate model-runner contract identity
and host-fixture identity, the exact `modelRunnerIdentitySha256` owner members in
request/status/reservation/operation-journal/resource-journal/attempt schemas and both
key preimages, every manifest kind/version row, every data/public acceptance literal
and every active prose contract-version edge. Extracted owners must byte-equal the
catalog and these current roots: `runtime-transaction-contract.md` v3.17,
`storage-schema-contract.md` v3.25, `postgres-type-contract.md` v3.22,
`manifest-storage-contract.md` v3.10, `job-graph-contract.md` v3.15,
`shadow-evaluation-contract.md` v3.7, `market-contract.md` v3.6,
`source-adapter-contract.md` v3.3, `financial-data-contract.md` v3.3,
`valuation-contract.md` v3.4, `decision-contract.md` v3.3,
`data-contract.md` v3.6, `v3-detail-contract.md` v3.3,
`legacy-compatibility-contract.md` v3.2, `runtime-installation-contract.md` v1.13,
`discovery-correctness-contract.md` v3.11.1,
`technical-decision-contract.md` v3.11.1, the tagged PCR owner,
`analysis-revision-contract.md` v3.11.2,
`legacy-radar-correctness-contract.md` v3.11.4,
`acceptance-evidence-contract.md` v3.13.0,
`factor-correctness-amendment.md` v3.11.6,
`authority-supersession-contract.md` v3.2, `auth-principal-contract.md` v3.8,
`trading-calendar-contract.md` v3.4, and `model-runner-contract.md` v3.6 with 885-byte identity SHA-256
`89c5fd414840e577729d55933fd0eef4a4cf8fdaa494feb6895d67ce895331e7`, host fixture
SHA-256 `bfa364974e14fb4b326d171be8db9d0ad09b7f9a9d698119d81ac5d553afbe9d`,
and acceptance `1.46.0/320`. Hash-preimage schema tags inside fenced canonical
preimages are data, not active contract references. Model-runner identity remains
independent of the opportunity runtime tuple.

Only `requirements-review-round-*.md`, `architecture-review-round-*.md`, dated `decision-log.md` entries, dated/round `gate-summary.md` evidence and `legacy-baseline-lock.json` are historical evidence excluded from the active graph. No other file, paragraph or stale literal may be allowlisted. `GOV-004` validates the canonical authority tags and order-/punctuation-independent lexical closure for catalog identity, graph topology and PCR ownership in addition to computing the graph digest. A byte mutation to this design must change the active-graph hash and invalidate an older Architecture result. Missing/extra files, unknown active prefixes, owner/header disagreement, a missing, repeated, non-canonical or conflicting tag, an untagged authority-like declaration, a stale manifest version, a non-ASCII-sorted runtime member or a JSON/Markdown acceptance mismatch fails the meta-test before implementation verification can pass.

## Components and Ownership

### V3.11 authority and execution seams

- launchd supplies cadence only. The legacy-correctness acquire function derives the
  scheduled occurrence, cutoff, trading date and session hash from database time and
  canonical config, so restart and retry cannot choose a new knowledge boundary.
- the separate legacy producer never starts or writes a V3 run. For a new occurrence,
  acquire inserts the immutable legacy run, calls the ungranted V3-owner read-only
  authority helper against that database-derived run, freezes compact paged
  roster/source manifest rows plus a root on the run and only then derives the
  source-sync payload/input/job identities. Raw revision text is not packed into the
  root. Source-sync creates deterministic one-revision parse shards; each shard claim
  uses a separate ungranted helper that validates the fresh lease token and frozen
  revision identity/hash before returning exactly one append-only raw revision.
  Completion persists bounded typed outcomes, and the final shard publishes only a
  compact conservation root to the candidate barrier. Failure before job creation
  rolls back the entire new run transaction, interruption resumes from immutable
  ordinals, and no login role can invoke or enumerate either helper.
- the main V3 worker has no owner-rights read view. Its fresh-token
  `claim_opportunity_job_v3` transaction returns the job payload and derived read
  bundle together; wrong-job/principal/token probes return no data.
- persisted commentary is rendered from typed claim/clause/unit/template authority.
  Model drafts are developer-only non-authoritative bytes and cannot enter a
  revision, hash or public projection.
- installation captures an exact scheduler rollback package before disabling any old
  owner. The phase journal restores the old plist bytes/states on first install as
  well as later rollback, independently of whether a prior tracked release exists.

### Source normalization and linking

- `SourceDocumentNormalizer` reads only cutoff-eligible immutable revisions produced by the closed registry in `source-adapter-contract.md`; it never treats a current, truncated or summary-only legacy connector row as V3 authority and never copies raw unbounded text into public payloads.
- `SourceClaimDeduper` applies distribution-scoped document identity and exact canonical claim IDs from `entity-link-contract.md`; it performs no semantic paraphrase guess. Reposts affect reach, not evidence-root independence.
- `StockEntityLinker` resolves explicit tickers, active aliases and stock-context names against the bound instrument-roster/alias manifests; `stocks` supplies only the bound internal ID/display projection. It emits a typed rejection instead of silently dropping ambiguous tokens.
- `SourceCandidateLedger` records document, claim and mention outcomes, applies TTL and source independence, and retains the top 60 direct candidates. The ledger is run-scoped and immutable after completion.

### Bounded enrichment and ranking

- `CandidateQuotaPlanner` walks source-priority order to select no more than 30 shallow candidates under the connector cap. After shallow features exist, it walks pre-research priority to select no more than 20 deep candidates under the sector cap. It never relaxes a cap and emits typed underfill.
- `CandidateEnrichmentService` loads price/liquidity, technical, institutional/chip, revenue/fundamental, thesis, broker and event data only for planned symbols.
- `MultiHorizonRanker` produces scores only for the deep 20 using `scoring-contract.md`. Missing features reduce availability/confidence and are never replaced by optimistic defaults. The remaining shallow candidates terminate as `enriched_observation` without formal/action output.
- `PeerComparisonExpander` applies the exact point-in-time peer authority and global traversal in R4, attaching at most three `comparison_only` peers per direct candidate and at most twelve unique peers per run.

### Market, valuation and decision

- `MarketContextEngineV3` follows `market-contract.md` and calculates completeness before regime. `unknown` is a first-class result with a null composite.
- `SectorCycleEngine` follows `sector-cycle-contract.md` and derives a timestamped state independently of the candidate's story score.
- `ValuationEngineV3` follows `financial-data-contract.md` v3.3 and `valuation-contract.md` v3.4, proves the operating bridge, selects one auditable primary method plus required cross-check, builds sourced Bear/Base/Bull, runs divergence/outlier invariants and keeps broker/model comparisons separate.
- `TechnicalDecisionEngineV3` follows `technical-decision-contract.md` v3.11.1 and emits only the cutoff-valid adjusted typed state/entry/invalidation result.
- `OpportunityDecisionEngineV3` follows `decision-contract.md` v3.3. It consumes immutable scores, completeness, market budget, valuation, typed technical decision and exposure inputs; it never changes valuation inputs or manufactures an action.

### Feedback and challengers

- `OpportunityOutcomeLabeler` labels matured immutable snapshots at trading-session horizons; it never recomputes historical features with present data.
- `AssistiveModelEvaluator` registers offline artifacts and metrics. Its outputs remain shadow-only in this change.

### Local Loop model runner

- `SourceViewBuilderV3` materializes a non-Git, read-only, hash-bound view from exact tracked blobs, excluding repository instructions, Codex control files, secrets and runtime state.
- `CodexAdapterV3` validates the pinned macOS host and custom permission profile, permits only private scratch writes and captures one bounded typed stdout result. It uses no legacy `--sandbox` flag and loads no user/project rules, hooks, MCP, plugins, apps or skills.
- `PatchParserV3` treats maker output as untrusted text, validates every path/hunk and creates one process-private seal. `TrustedGitV3` alone may apply that seal in a token-owned clean worktree and retain one deterministic single-parent result ref.
- The runner never becomes a Vercel/Supabase execution path. Offline domain artifacts still require the signed registration contract and remain `influence:none`.

## Candidate State Machine

```text
document_accounted
  -> claim_accounted
      -> mention_rejected
      -> linked
  -> rejected_ineligible
  -> candidate
      -> expired
      -> enrichment_planned
          -> enrichment_failed
          -> enriched
              -> comparison_only
              -> deep_research
                  -> actionable_now
                  -> waiting_trigger
                  -> valuation_review
                  -> avoid
                  -> archived
```

State transitions record run id, reason code, prior state, effective timestamp and source cutoff. `comparison_only` and `missed_source_audit` have no transition to actionable/formal without a new direct/verified event.

## Source Ranking

Initial source-quality priors are configuration, not hard-coded promotion truth:

| Class | Examples | Prior | Candidate effect |
|---|---|---:|---|
| official company/market | MOPS, earnings call, TWSE event | 1.00 | May create and verify a catalyst. |
| public research | named broker/public report | 0.85 | May create candidate; target remains comparison until consensus rules pass. |
| curated thesis | 定錨 / InvestAnchors, approved KOL/podcast | 0.70 | May create candidate and raise research priority. |
| community | Threads, BullTalk, PTT, Telegram, Instagram | 0.45 | May create discovery candidate; independence and corroboration raise priority. |

Source priority is the bounded formula below, not an unbounded mention sum. Reposts affect only the logarithmic reach term; independent source classes affect only their capped term. Source priors and TTLs are versioned in `source-funnel-v3.0`.

Deterministic candidate priority is:

```text
45 * strongest_unique_claim_prior
+ 20 * min(independent_source_classes / 3, 1)
+ 20 * recency_factor
+ 10 * min(log2(1 + deduplicated_reach) / 4, 1)
+  5 * link_confidence
```

`recency_factor` is taken from the strongest unique claim and decays linearly from 1 at publication to 0 at the source-class TTL. Ties sort by newest source timestamp, then ascending stock symbol. The connector quota is applied after source ordering; the sector quota is applied after shallow enrichment and pre-research ordering. Exact availability and confidence math is in `scoring-contract.md`.

## Market Context Contract

Normative group formulas, freshness, completeness and thresholds are in `market-contract.md`. Core groups are:

1. trend: TAIEX/OTC close vs MA20/MA60;
2. breadth: advance/decline, percent above MA20/MA60, new highs/lows;
3. flow: foreign/investment-trust cash flow and aggregate margin balance;
4. derivatives: foreign index-futures net open interest, put/call or Taiwan VIX;
5. global: SOX/Nasdaq, USD/TWD and sector peer baskets.

Regime needs fresh trend + breadth + either flow or derivatives. Otherwise:

```json
{
  "regime": "unknown",
  "completeness": "insufficient",
  "newPositionBudgetPct": 15,
  "missingGroups": ["breadth", "flow"]
}
```

No seed-coverage proxy may fill a missing core group. With incomplete core data, composite is `null`; diagnostic non-core group scores may still be returned.

## Valuation Design

`valuation-contract.md` is normative for method eligibility, point-in-time financial scenarios, reference samples, confidence, consensus and hard blocks. Market regime may be shown beside the distribution but never changes intrinsic-value inputs. Missing requirements produce `missing`; they are not synthesized from company profiles, current observed multiples, social targets or assistive models. Result:

```ts
type ValuationDistributionV3 = {
  status: 'normal' | 'missing' | 'stale' | 'outlier_review';
  method: 'pe' | 'normalized_pe' | 'ev_ebitda' | 'pb_roe' |
    'residual_income' | 'nav' | 'ev_sales' | null;
  p10: number | null;
  p50: number | null;
  p90: number | null;
  confidence: number | null;
  asOf: string;
  evidenceRefs: string[];
  verificationRef: string | null;
  referenceManifestRef: string | null;
  historicalSampleCount: number;
  peerSampleCount: number;
  historicalReferenceQuantiles: {p10:number;p50:number;p90:number} | null;
  peerReferenceQuantiles: {p10:number;p50:number;p90:number} | null;
  reasons: ValuationReasonV3[];
};
```

An outlier review blocks `starter_now` and `event_starter`, even if technical momentum is strong.

## Decision Precedence

`decision-contract.md` supplies separate, exhaustive first-match precedence for formal
status, new-position action and existing-position action. Data integrity precedes
valuation; any missing, stale or outlier valuation precedes market/action rules and
cannot reach `event_starter`, `starter_now` or technical-wait output. Portfolio
capacity is checked before a buy-like result. An eligible event starter is explicitly
non-formal but still requires normal valuation and a buy-eligible technical decision.
UI labels SHALL never collapse formal research status into action.

## Storage and Write Path

The complete additive logical DDL, indexes, foreign keys, append-only triggers, RLS, grants and canonical-byte rules are normative in `storage-schema-contract.md`. `postgres-type-contract.md` is the sole exact PostgreSQL enum/composite/RPC payload catalog, and `authority-supersession-contract.md` is the sole latest-event correction/revocation algorithm for the seven mutable authority families. The principal/signature/role boundary is normative in `auth-principal-contract.md`; no request-supplied actor is authority. The principal table families are:

- `source_document_revisions_v3`: complete or typed-failed immutable acquisition revisions from `source-adapter-contract.md`, recorded before any lossy legacy projection.
- `source_identity_authorities_v3`: point-in-time source/distribution approval independent of mutable legacy source-entity display rows.
- `internal_principal_role_bindings_v3`: non-secret, app-immutable principal/role authority owned only by the database migration owner; it is the database half of dual-control authorization and gives every caller-bound RPC an executable wrong-role oracle.
- `publisher_verification_authorities_v3`: point-in-time publisher/feed/institution authority from `source-matrix.md`.
- `stock_instruments_v3`: cutoff-valid official exchange/instrument/listing roster with a 2..120-code-point legal name, optional 2..40 short name and nullable database-generated public name from `instrument-roster-contract.md`; long legal-only names are retained but never truncated into aliases or display.
- `stock_aliases_v3`: point-in-time approved aliases and normalized identity authority from `entity-link-contract.md`.
- `stock_sector_assignments_v3`: point-in-time official one-sector mapping and taxonomy version from `sector-taxonomy-contract.md`.
- `tw_trading_sessions_v3`, `opportunity_price_observations_v3`, `opportunity_corporate_action_snapshots_v3`, `opportunity_corporate_action_feed_evidence_v3`, `opportunity_corporate_action_events_v3`, `opportunity_market_observations_v3`, `opportunity_financial_facts_v3`: append-only official observation plane populated before a run; raw prices and complete owner-exchange action snapshots are separate authority, `trading-calendar-contract.md` collapses session corrections/cancellations at cutoff and binds composite TWSE/TPEx session hashes, and full-roster context is never fetched during a V3 request.
- `opportunity_manifests_v3`, `opportunity_manifest_pages_v3`, `opportunity_manifest_rows_v3`: canonical-byte authority, bounded terminal rows and resumable page/root hashes for every dataset/authority manifest.
- `stock_peer_relationship_reviewers_v3`: immutable point-in-time reviewer-authority rows and bounded canonical allowlist manifest for peer approvals.
- `stock_peer_relationships_v3`: immutable UUID-keyed, point-in-time verified directed supply-chain authority rows binding exact supplier/customer instrument authorities and copied stock IDs; symbols are derived only from the separately frozen roster manifest, while the peer-authority manifest owns terminal inclusion/exclusion and the 100,000-row sentinel bound.
- `opportunity_runs`, `opportunity_run_inputs`, `opportunity_run_manifest_inputs`, `opportunity_run_jobs_v3`, `opportunity_job_payloads_v3`, `opportunity_job_results_v3`: durable run lineage, attempts, leases, immutable one-to-one job payloads/results and deterministic single-successor jobs from `job-graph-contract.md` and `runtime-transaction-contract.md`. A partial unique constraint permits at most one terminal success per `(run_purpose,trading_date,comparison_contract_key,evaluation_dataset_lock_hash)` for the two canonical daily evaluation purposes.
- `opportunity_rpc_audit_v3`: immutable non-secret function/disposition/subject/input-hash evidence written atomically by every successful or idempotent mutation RPC.
- `opportunity_source_document_outcomes`: one row per attempted connector/document/run with exactly one document outcome.
- `opportunity_source_connector_accounting`: one row per attempted connector/source-scan run owning eligible/deferred and all document/claim/mention totals validated by R1.
- `opportunity_source_claims`: one bounded claim-occurrence row per extracted claim with document `claim_ordinal`, outcome, canonical hash/prior-claim ref and opaque source ref; raw text is not copied.
- `opportunity_source_mentions`: one row per claim/symbol token with exactly one mention outcome, link confidence and reason.
- `opportunity_candidate_snapshots`: one immutable run/symbol row containing direct/comparison state, evidence refs, shallow features, formal status, both action branches and valuation distribution.
- `opportunity_market_context_snapshots`: one immutable enrich-run row with composite/regime and exact per-input evidence.
- `opportunity_sector_cycle_snapshots`: one immutable enrich-run/canonical-sector row with three scores, matched rule and exact input evidence.
- logical manifest kind `sector_scoring_reference` in the generic manifest tables: immutable point-in-time sector adjusted-return/breadth/financial aggregate evidence used only by scoring and cycle context; there is no dedicated physical sector manifest table.
- logical manifest kind `sector_benchmark` in the generic manifest tables: immutable equal-weight constituent/price/corporate-action evidence for sector-relative outcome evaluation; there is no dedicated physical sector benchmark table.
- `opportunity_score_snapshots`: exactly one immutable run/symbol/horizon row containing factor values, contributions, availability, score and confidence.
- `opportunity_outcomes`: one immutable score-snapshot/horizon-maturity label with entry/outcome source dates and return/MFE/MAE fields.
- `opportunity_link_audit_samples` / `opportunity_link_audit_labels`: hash-bound deterministic sample strata plus blinded reviewer/adjudicator labels required by the evaluation contract. The read RPC takes an explicit requested role and returns exactly one of eight closed dispositions over every valid label state; a dual-role principal never selects a branch implicitly.
- `valuation_verifications_v3`: immutable reviewer/input-hash decision, official/public evidence refs, rationale and expiry used only by `valuation-contract.md`.
- `opportunity_public_projections_v3` / `opportunity_detail_projections_v3`: exact canonical-byte available payload and same-run detail payload generated before finalization.
- `opportunity_assistive_artifact_registrations_v3`: the sole additive V3 registry for artifact hash/kind, license evidence, training cutoff, exact evaluation manifest, comparison baseline and out-of-sample metrics. Its `comparisonBaselineKey` is exactly the evaluation manifest header and consuming run `comparisonContractKey`, never the dataset-lock or legacy-lock hash. It is signed human authority, cutoff-selected deterministically and remains display-only with `influence=none`; no undocumented legacy model table is assumed.

`opportunity_runs.upstream_run_id` binds `enrich_rank` to exactly one successful `source_scan`; label/evaluation many-to-many lineage uses additive `opportunity_run_inputs(run_id,input_run_id,input_role)`. Foreign keys bind all child rows to their owning run. Actor principal UUIDs remain non-FK immutable audit values, but every caller-bound write is transactionally authorized by the app-immutable role-binding relation. Exact stored/RPC types are fixed by `postgres-type-contract.md`; normalized unique keys and append-only storage are fixed by `storage-schema-contract.md`; mutable authority supersession is fixed by `authority-supersession-contract.md`. Claim hash remains indexed but not unique, and duplicate occurrences retain their own terminal rows and point to the canonical prior claim.

The exact orchestration `begin/claim/heartbeat/stage/complete/fail/reap/seal/finalize` signatures are normative in `runtime-transaction-contract.md`; exact job creation, canonical payload/output envelopes and the private successor helpers are normative in `job-graph-contract.md`; the closed ingestion/human-authority RPC signatures and actor roles are normative in `auth-principal-contract.md`; ownership/FKs/grants are normative in `storage-schema-contract.md`. `READ COMMITTED` correctness, advisory/row locks, owner-token leases, crash recovery, five-attempt limit and atomic terminal validation apply unchanged. Begin binds upstream inputs and creates the first header job/payload atomically. Every predecessor success creates its sole deterministic successor plus payload in that same transaction; a finalizer is itself a leased job. Successful-state readers join only `opportunity_runs.status='success'`; staged job rows cannot become a public success through partial completion.

Pipeline control uses only the six exact begin/status/cron routes, request grammars, canonical responses, precedence and call/write states in `control-plane-contract.md`; no query is ignored. `POST /api/internal/opportunity-worker-v3` has the exact auth/body/status/error and per-payload ordered database-call contract in `job-graph-contract.md`; it claims and drains at most one already-created durable job per request, returns no owner token/payload and never owns an entire run. The exhaustive eleven human-authority paths require both `requireInternalAuth()` and the independently signed principal/role under `auth-principal-contract.md`; the shared bearer cannot impersonate a reviewer or act alone. Run purpose and cron cutoff are server-owned, connector/provider lists and all versions are selected from server allowlists, and V3 has no synchronous or zero-durability dry-run path. Test/backtest purposes still use the same durable protocol and remain non-public unless explicitly eligible under `shadow-evaluation-contract.md`.

Lineage selection is server-owned and exact.

Before enrichment/ranking work or final logical-key seal, durable preparing jobs freeze immutable canonical input manifests through `manifest-storage-contract.md`. `runtime-transaction-contract.md` makes database begin the sole derivation authority for the ordered mode inputs, `comparisonContractKey` and `preparationKey`, rejects a future cutoff, and atomically seals the complete manifest tuple into the final logical idempotency key. Neither HTTP nor PostgREST supplies a key or input ID. For logical kind `source_dataset`, cutoff and static/point-in-time source, publisher, roster, alias and taxonomy dependencies are the exact header fields in that contract. Its `connector_roots` section carries each attempted connector's ordered `[sourceKey,registeredFamilyCount,eligibleCount,sourceEligibleManifestHash]`; its `selected_revision_rows` section carries the exact selected revision tuples from `source-adapter-contract.md`; its `connector_conservation` section carries exact registered-family/eligible/selected/deferred counts. The universal root is `sourceDatasetManifestHash`; no unbounded connector rows are embedded again. Every eligibility predicate includes database-generated `recordedAt <= sourceCutoff`. The selected immutable revision—not a legacy current row—owns the raw/canonical hashes; source scan recomputes canonical content and requires equality with `ingestionCanonicalContentHashV3`. A mismatch or non-complete acquisition is `parse_failure` and cannot be a verified publication. Derived runtime document/claim/evidence identities remain terminal child results, not idempotency inputs.

For logical kinds `market_reference` and `mover_price_reference`, the exact family/key enums, included/excluded/conservation tuples, sorting, bounds, Top-20 price selection and audit binding are solely those in `market-contract.md`; the universal roots are one `marketReferenceDatasetManifestHash` and the ordered one-through-five `moverPriceReferenceManifestHash` values. For `outcome_input`, `evaluation_input`, `link_audit_sample` and `link_audit_resolution`, the exact terminal identities, rows, exclusions, `252/0..120/0..20` rosters, conservation, sample-ID/hash and cutoff-visible resolution formulas are solely those in `shadow-evaluation-contract.md`. `manifest-storage-contract.md` supplies their closed headers/sections/pages/root. Any correction or allowlist/roster/alias/taxonomy/peer/financial/reference/provider/evaluation change yields a new applicable root. Preparing jobs freeze every applicable manifest before `seal_inputs`; after the final logical-key seal, no manifest is reconstructed from live rows.

Exact mode lineage is:

- `source_scan` derives the literal empty input-run array. Zero upstream runs is the only valid branch and never raises `missing_source_run`.
- `enrich_rank` requires the one successful `source_scan` whose `runPurpose` byte-equals the enrich purpose and whose normalized source cutoff, source allowlist hash, source-funnel/instrument-roster/entity-link/sector-taxonomy versions, `publisherVerificationPolicyHash`, publisher-verification allowlist hash, instrument-roster hash, alias manifest hash, taxonomy map/assignment hash and exact `source-dataset-v3.3` manifest also match. Equality uses stored input columns plus the complete manifest header/root, not a recomputed current policy. Runs of the other two valid source purposes are excluded before cardinality; they never cause `multiple_source_runs`. An old-policy same-purpose source success never matches; when old/new same-purpose successes coexist only the exact new-policy success matches. Zero same-purpose matches returns `missing_source_run`; two or more exact same-purpose matches return `multiple_source_runs`; one binds. Its public `runId` is the enrich run and `sourceRunId` exposes the bound source run.
- `label_outcomes` begin uses the exact two-stage indexed selector in `shadow-evaluation-contract.md`: the current-lock/two-purpose/252-session raw score scan has `LIMIT 30241`, then matured-unlabeled expansion has `LIMIT 20001`, both before durable bootstrap. Zero terminal identities is valid and produces an explicit empty outcome-input plan; 1..20,000 stores the complete ordered input-run/snapshot plan before `seal_inputs`; either raw identity 30,241 or terminal identity 20,001 returns `PT409/bound_violation` with zero write.
- `shadow_evaluate` begin binds the frozen legacy lock plus the canonical successful enrich/outcome daily inputs required by `shadow-evaluation-contract.md`; zero or not-yet-mature inputs produce a complete partial evaluation manifest with actual `backtestCount=0..119` and/or `liveCount=0..19`, null backtest metrics and a fail-closed shadow result. Duplicate canonical success for a required daily identity remains `data_integrity_failure`.

At `seal_inputs`, `logicalKey` is computed only from the exact `opportunity-logical-run-v3.0` preimage in `runtime-transaction-contract.md` v3.17. That sole authority fixes mode, server-owned purpose, normalized cutoff, ordered run inputs, comparison/static members, the purpose-owned nullable evaluation dataset lock, every complete manifest binding in deterministic graph order, its header-level calendar bindings and the nullable selected mover-audit ID. Begin computes comparison and preparation keys from the two earlier exact preimages in that same contract. The server recomputes all three from database-owned constants and stored immutable rows; request hashes, omitted members, alternate objects and convention-selected nulls are forbidden. A static contract member, including factor-correctness semantics, changes comparison/preparation/final identity, while a point-in-time manifest or calendar correction changes preparation only when lineage changes and always changes the later final identity without destroying prior comparability.

All V3 tables use `ENABLE ROW LEVEL SECURITY` plus `NO FORCE ROW LEVEL SECURITY`. The NOLOGIN/NOBYPASSRLS RPC owner owns every V3 table except the migration-owner role-binding relation; exactly one SELECT-only `USING (true)` policy admits that owner's binding lookup, and no other V3 policy exists. `service_role` must already have BYPASSRLS, receives only the closed SELECT/33-RPC catalog and no DML; `anon`/`authenticated` have no table privileges. The separate V3 server client fails closed without the service-role secret and never falls back to an anon key. Public reads use bounded server-side projections; completed authority, observation, manifest, run and result rows are database-enforced append-only.

## Public API Compatibility

Add to the existing radar payload:

```ts
type OpportunityEngineV3 = {
  contractVersion: 'source-led-opportunity-v3.6';
  availability: 'available';
  featureVersion: string;
  decisionVersion: string;
  mode: 'shadow';
  runId: string;
  sourceRunId: string;
  asOf: string;
  sourceFunnel: SourceFunnelSummaryV3;
  marketContext: MarketContextV3;
  rankedLanes: RankedLaneV3[];
  actionableNow: OpportunityCardV3[];
  waitingForTrigger: OpportunityCardV3[];
  valuationReview: OpportunityCardV3[];
  missedSourceAudit: MissedSourceAuditSummaryV3;
  engineHealth: OpportunityEngineHealthV3;
};
```

This excerpt is illustrative; `data-contract.md` is the exact serialized contract, including per-connector conservation fields and all array/string bounds.

The compact endpoint normalizes a server-owned `requestProjectionCutoff` C and selects the newest successful `enrich_rank` whose comparison contract key equals the deployed key, whose source cutoff is not after C and whose terminal success is visible at C. Historical state is reconstructed from database-owned `created_at`, write-once `sealed_at` and write-once `terminal_at`, plus append-only job-bound warning facts; the current mutable status/job rows are never historical authority. It resolves source accounting only through the selected run's `upstream_run_id` and returns the byte-for-byte pre-finalized stored projection, whose `asOf` is the run's immutable source cutoff; C is selection-only and never rewrites stored bytes. With no eligible success it applies the exact point-in-time cold-start/nonmatching/preparing/running/failed precedence in `data-contract.md` and generates `OpportunityEngineUnavailableV3` for C; it never invents an empty successful run or copies legacy arrays into V3. Every full V3 card links only to its same-run immutable route from `v3-detail-contract.md`; reading it cannot invoke a legacy lookup, refresh or write. Under this checkpoint V3 is shadow-only and legacy arrays remain unchanged under `legacy-compatibility-contract.md`.

## Scheduling and Failure Behavior

- Source scan runs after approved connector refresh.
- Enrich/rank is idempotent for the same complete logical key; durable execution, resource envelopes and interruption equivalence follow `runtime-transaction-contract.md`.
- Outcome labeling runs after official close data is available.
- An ordinary connector fetch/parse failure after a bounded eligible count is excluded before eligible-group counting. Caps are recomputed over remaining eligible groups; they are never relaxed. If remaining groups cannot fill a stage, the run reports `quota_underfill`. `eligible_volume_exceeded`, identity/roster manifest overflow and conservation/integrity failures are whole-run fatal and cannot publish degraded successful accounting.
- Missing market core data caps budget and marks degraded; it does not abort discovery.
- Database/preflight failure produces no partial successful run: run stays failed and score rows are ignored unless terminal status is `success`.

## Rollout

1. Characterization, legacy baseline population and RED fixtures.
2. Transactional additive schema, then application deployment in `SOURCE_LED_OPPORTUNITY_V3=disabled`; advance through `drain` to `shadow` only under `legacy-compatibility-contract.md` v3.2.
3. Build a reproducible point-in-time backtest over at least 120 qualifying dates and accumulate at least 20 live cohorts whose 20-session outcomes have matured.
4. Verification applies every conjunctive promotion rule in `shadow-evaluation-contract.md`; mere runtime duration cannot promote V3.
5. Replacing homepage order, applying production migration and enabling model influence each require separate checkpoints.

Rollback is never a down migration. Schedules/producers stop first, `drain` permits only existing-run status/worker plus the already granted reaper, `disabled` removes every V3 route/projection and application secret mapping, and committed additive objects remain immutable. A 30-minute drain deadline may leave nonterminal rows, but they remain non-public and are recovered through the same cataloged RPCs before any later shadow re-enable. The frozen legacy lock must pass before rollback completion; future authoritative promotion remains invalid until a later contract supplies its own inverse DAG.

## Hybrid product architecture amendment

The approved product entry point is a dedicated `/opportunity-v3` verified-change workspace. The existing source, authority, manifest and outcome boundaries remain intact. The deep-result and two bounded worker-read schemas advance additively: deep success carries the closed verified-evidence rows, projection read carries exact brief/prior-comparison tuples, and evaluation read carries database-computed three-strategy rows.

```text
immutable source/authority inputs
  -> bounded source-led runtime
  -> same-run compact/detail projections
  -> verifiedChangeBrief derivation
  -> /opportunity-v3 three-lane workspace
  -> bounded homepage shadow summary

official_only/source_led/hybrid
  -> identical point-in-time evaluation inputs
  -> non-authoritative product-value comparison

model_runner_v3
  -> independent verification status
  -> mandatory independent Code Gate input
  -> no domain influence
```

`hybrid-product-amendment.md` owns the root route, exact brief derivation/templates, lane precedence, strategy formulas and verification partition. The projection boundary validates those database-bound inputs, creates sizing-free cards/workspace/summary/detail bytes in one run, and rejects missing/duplicate prior lineage. UI components consume typed briefs and never infer lanes, rewrite raw enums, fetch legacy details or recover missing same-run data. Disabled/drain are zero-query 404; cold, calculating, failed, degraded, empty and available shadow states are explicit. The homepage is a secondary summary surface only.

## Product correctness and tracked-runtime architecture amendment

The V3.11 repair inserts a tracked producer and material-change boundary in front of
the approved source-led runtime:

```text
tracked reviewed producer + single scheduler
  -> ordered source cursor and layer-separated typed outcomes
  -> source signal independent of valuation readiness
  -> point-in-time financial bridge
  -> fundamental/technical typed decision
  -> immutable analysis revision
  -> compact precomputed radar projection
```

The amendment owns scope/authority. Exact behavior is divided among the six V3.11
contracts named in the normative map. Legacy request handlers consume only the compact
legacy-correctness projection during the disabled-V3 repair; they cannot invoke a
producer, provider, deep-research function or mutating endpoint.

Implementation order is fixed: tracked runtime and hash oracle; pure discovery,
valuation, technical and revision modules; producer DAG; compact projection adapter;
public integration; performance and accessibility. Every behavior is introduced by a
failing PCR acceptance owner before product code changes.

## V3.13 decision-integrity architecture amendment

The tracked producer remains the only mutation owner. Official financial, valuation,
price and corporate-action observations append at a later database-owned cutoff and
therefore cannot become visible inside the run that acquired them.

```text
official/authorized acquisition
  -> append-only fact, price, action and source revisions
  -> next-cutoff valuation + adjusted technical authority
  -> DecisionEnvelopeV313 (single action authority)
  -> immutable compact projection + evaluation heartbeat
  -> Landing and same-revision detail
```

Web, runtime doctor and internal health compile the same exchange-session freshness
policy. One or two missed scheduled runs expose last-good content as read-only and
disable buy-like compatibility actions; three misses return a typed degraded empty
projection. Neither path invokes production work from an HTTP request. Content hash
conflicts remain hard failures.

Official raw-price backfill is bounded to four incomplete deep symbols and seven
monthly windows. Corporate-action backfill is bounded to twenty missing exchange
sessions and three official feed classes. The exchange corporate-action endpoints are
compiled as official JSON because a valid no-event TWSE CSV response has no schema;
typed official no-data is accepted, while transport, HTML, status or schema failures
remain unavailable and cannot manufacture an empty authoritative snapshot.

Decision rendering is downstream-only. Legacy action fields are compatibility views
of the envelope, FULL payload leaves outrank LIGHT leaves, and UI links carry the
immutable `decisionRevisionId`. Source connectors conserve every configured identity
to a typed terminal outcome; metadata-only inputs do not cross the claim boundary.

## V3.14 actionability-recovery architecture amendment

V3.14 separates evidence visibility from action authority:

```text
checksum-valid stored projection
  -> ProjectionHealthV314
  -> live or last-good read-only research
  -> ResearchRankingEnvelopeV314 (ordering only)
  -> DecisionEnvelopeV314 (sole action authority)
  -> compact projection / same-revision detail
```

The Web never clears research merely because calendar authority is absent. A V3.12
adapter can expose only read-only evidence; V3.13 remains read-only compatible; a
fresh V3.14 producer and official authority plane are required for action enablement.
The producer repairs unchanged-candidate seed identity before persistence and emits
only allowlisted failure diagnostics. The release embeds one reviewed release identity
in Web, projection and runtime manifest rather than relying on a platform-provided Git
environment variable.
