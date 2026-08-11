# Requirements: source-led-opportunity-engine-v3

## Goal

Turn StockInsider into a source-led Taiwan-stock opportunity funnel that finds, validates and times stocks discussed by the user's approved sources without performing wasteful full-market deep research. It must clearly answer what changed, why a stock is being analyzed, whether it is suitable now or only after a trigger, and how reliable its valuation is.

## R1 — Approved Source Funnel

The primary candidate universe SHALL originate from current approved sources:

- Threads;
- 定錨 / InvestAnchors;
- 股市爆料同學會 / BullTalk;
- PTT Stock;
- approved Telegram and Instagram channels;
- approved podcasts and KOL audio/video;
- public broker/research documents;
- official MOPS, earnings-call and material-event feeds.

`TWStock` / `node-twstock`, TWSE, TPEx, TAIFEX and FinMind are market/fundamental corroboration providers, not independent discussion mentions.

Accounting has three levels:

- document: one connector row selected for parsing;
- claim: one extracted canonicalized factual/thesis statement before unique/duplicate classification;
- mention: one claim-to-symbol match; a claim may mention zero or many symbols.

For each connector, V3 considers only the deterministic selected immutable revision of each `revisionFamilyKey` produced before legacy truncation by the closed adapter registry in `source-adapter-contract.md` v3.3. Discovery `sourceIdentityId` is non-null. Revision input supplies only the authority UUID; the append RPC derives and the immediate composite FK enforces the revision's exact `(sourceIdentityAuthorityId,approvedSourceIdentityId,sourceKey)` triple. Before any cutoff, authority, publication, collection, lookback or eligibility filter, source scan enumerates the immutable `source_revision_family_registry_v3` in ASCII key order with literal `LIMIT 1,000,001`; a new-family append uses the same source-wide lock/bound. Each registered family then reads at most 64 revisions through `LIMIT 65`. A revision can enter family collapse only when its complete authority triple byte-matches one `effective_active` terminal membership row in the cutoff-frozen `sourceIdentityAllowlistManifestHash` from `source-matrix.md`, database-generated revision `recorded_at <= sourceCutoff`, `collected_at <= sourceCutoff`, `published_at` is null or `published_at <= sourceCutoff`, and `collected_at` falls inside the static source-funnel lookback. Authority-ID-only admission, null stream identity and independently supplied revision identity/key are forbidden. A correction, approval or backfill recorded later is unavailable to an earlier run even when it carries older business timestamps. Future-only and otherwise ineligible families remain part of the bounded registry enumeration but produce no selected revision. Post-collapse eligible families sort by selected `published_at DESC NULLS LAST`, then `collected_at DESC`, stable document ID ascending and revision ID ascending. The first 1,000 are `selected`; the remainder are `deferred_due_scan_cap` without parsing. Expiry is evaluated after selection using `published_at` when present, otherwise `collected_at`, so a recently collected repost of an old item can deterministically terminate as `expired_document`. The adapter registry has exactly eleven keys in V3.3 and a hard maximum of 20 in a later approved version; one connector has at most 1,000,000 registered families and 64,000,000 retained revisions. Family 1,000,001 or revision 65 fails the entire source run/append with `bound_violation` before connector accounting/candidates can become successful. It is not a degradable connector failure and no truncated success payload is published. Eligible metadata and parsing use the resumable page/job envelopes in `source-adapter-contract.md` and `runtime-transaction-contract.md`; batching cannot change order or results.

Every selected document SHALL end in exactly one document outcome: `duplicate_document`, `expired_document`, `parse_failure`, `processed_no_claim`, or `processed_with_claims`. Every extracted claim SHALL end in exactly one claim outcome: `unique_claim` or `duplicate_claim`. Every potential-stock mention SHALL end in exactly one mention outcome: `linked_new`, `linked_refresh`, `linked_duplicate_claim`, `ambiguous_symbol`, `rejected_low_confidence`, or `unsupported_instrument`, plus one reason code from `entity-link-contract.md`. Silent drops are forbidden. A processed document can contain zero or many claims, and a claim can contain zero or many symbol mentions; the three cardinalities are therefore reported separately rather than inferred from one another.

Per-connector conservation SHALL hold:

```text
eligible_documents = selected_documents + deferred_due_scan_cap
selected_documents = duplicate_document + expired_document + parse_failure
                   + processed_no_claim + processed_with_claims
extracted_claims = unique_claim + duplicate_claim
raw_mentions = linked_new + linked_refresh + linked_duplicate_claim
             + ambiguous_symbol + rejected_low_confidence + unsupported_instrument
```

The equations SHALL hold both per connector and for the run aggregate. A duplicate claim can still contain a symbol mention; that mention terminates as `linked_duplicate_claim` and refreshes reach only. Documents with no extracted claim terminate as `processed_no_claim`; unique non-stock claims are counted as `unique_claim` and legitimately contribute zero mentions. Exact document identity, canonical claim equivalence, potential-stock tokenization and reach identity are normative in `entity-link-contract.md`; V3 performs no semantic/paraphrase dedupe beyond that deterministic contract.

## R2 — Entity Linking and Provenance

- Explicit ticker plus stock context may link automatically.
- A company alias without ticker requires an unambiguous active-stock alias and contextual stock/industry evidence.
- Ambiguous four-digit numbers SHALL be rejected unless ticker/name context resolves them.
- Automatic links require confidence >= 0.85. Scores from 0.65 through 0.849 terminate as `ambiguous_symbol`; scores below 0.65 terminate as `rejected_low_confidence`. Both retain a typed review reason and do not create a candidate. Explicit valid ticker + stock context scores 1.00; exact unique active alias + stock context scores 0.90; name-only or fuzzy matches cannot exceed 0.84.
- Each candidate SHALL retain source key, canonical URL/document hash, published/collected timestamps, matched text reason, link confidence and independent-source identity.
- Reposts sharing the same canonical claim SHALL count once for evidence strength; `deduplicatedReach` counts distinct distribution identities defined in `entity-link-contract.md`.

## R3 — Bounded Candidate Funnel

Per opportunity run:

- scan at most the latest 1,000 eligible documents per connector inside its lookback;
- retain at most 60 linked source candidates;
- shallow-enrich at most 30 candidates with price, liquidity, technical, chip and latest-fundamental availability metadata;
- select at most 20 of those 30 for source-evidence loading, full fundamental/valuation research, three horizon scores and decisions;
- expose at most 12 `actionableNow` plus `waitingForTrigger` cards.

Community mentions expire after 72 hours, broker/news evidence after 7 days and official fundamental catalysts after 35 days unless refreshed.

Quota calculation is identical for connector and sector grouping:

```text
target_size = min(stage_limit, eligible_count)
group_cap_share = max(base_cap_share, 1 / distinct_eligible_groups)
group_cap_count = ceil(target_size * group_cap_share)
```

Connector `base_cap_share` is 0.40 for the 30-stock shallow pool; sector `base_cap_share` is 0.35 for the 20-stock deep pool. Selection walks deterministic rank order and admits an item only while its group remains below the derived hard cap. It repeats until no additional eligible item fits. It never relaxes a cap; underfill is allowed and reported with `quota_underfill`. This automatically permits 100% when only one eligible group exists and 50% when only two exist.

For connector quota, `eligible_count` and `distinct_eligible_groups` come from the retained top-60 active candidates and their single connector owner. For sector quota, they come from the successfully shallow-enriched pool and its single canonical sector (including `unknown`). Failed enrichment is ineligible for deep selection and records a typed failure before those sector counts.

A multi-source candidate belongs to exactly one connector quota group: the connector of its highest `claimConfidence`; ties use higher source prior, newer effective source timestamp, then ascending `sourceKey`. Its other sources remain evidence but consume no additional quota. Sector quota uses the single canonical assignment in `sector-taxonomy-contract.md`; missing/unmapped values belong to the literal `unknown` group and are never inferred from free-form `stocks.sector` text.

The 30-stock pre-research priority is `0.60 * sourcePriority + 0.20 * priceVolumeFactor + 0.10 * chipFactor + 0.10 * liquidityFactor`. Only the top 20 after sector quota receive deep research and V3 formal/action outputs. The remaining shallow candidates are `enriched_observation` and cannot receive an action.

Public stage counts distinguish planning, success, failure and deferral exactly as `data-contract.md`: active candidates split into shallow-planned/deferred-before-shallow; shallow-planned splits into succeeded/failed; shallow successes split into deep-planned/deferred-before-deep; deep-planned splits into succeeded/failed. A failed candidate never appears as a success or silently moves into a deferred bucket.

## R4 — Limited Peer Expansion

For each directly sourced candidate, the engine MAY add at most three same-industry or supply-chain peers for comparison, subject to a global maximum of 12 unique comparison peers per run. Same-industry authority is the cutoff-valid official canonical sector assignment. Supply-chain authority is an immutable directed `stock_peer_relationships_v3` row `(relationshipAuthorityId,supplierInstrumentAuthorityId,supplierStockId,customerInstrumentAuthorityId,customerStockId,"supply_chain",sourceTimestamp,approvedAt,validFrom,validTo,status,evidenceRef,reviewerPrincipalId,recordedAt)` written by the role-bound principal in `auth-principal-contract.md`; corrections append a new UUID row and never mutate authority history. The RPC copies each stock ID from its referenced immutable instrument authority and the table stores no symbol. The direction means supplier -> customer; for a candidate, an incoming supplier is `upstream` and an outgoing customer is `downstream`. Free-form profile/source text cannot create an edge.

Reviewer authority is additive `stock_peer_relationship_reviewers_v3(reviewerAuthorityId,reviewerPrincipalId,approvedAt,validFrom,validTo,status,approvingPrincipalId,recordedAt)`, written only by a signed `peer_reviewer_admin` principal; correction/revocation appends. Apply the reviewer stream `[reviewerPrincipalId]` algorithm in `authority-supersession-contract.md`. Each terminal row is `[reviewerAuthorityId,reviewerPrincipalId,approvedAt,validFrom,validToOrNull,status,approvingPrincipalId,recordedAt]` with manifest terminal code `effective_active|revoked_or_expired`, ordered reviewer principal ID, valid-from, approved-at, recorded-at, approving principal and authority UUID. Apply `LIMIT 1001` after stream collapse and before terminal filtering; row 1001 fails `identity_manifest_overflow`, while a latest differing tie fails `authority_revision_conflict`. Under `manifest-storage-contract.md`, `sourceCutoff,rowCount` are the `peer_reviewer_allowlist` header, row count includes every terminal selected stream and all rows enter `rows`; only `effective_active` is reviewer membership. `peerReviewerAllowlistManifestHash` freezes that result, so later recording/approval/expiry never rewrites an earlier peer manifest.

The point-in-time scan universe is one selected latest event per relationship stream `[supplierStockId,customerStockId,"supply_chain"]` under `authority-supersession-contract.md`. Apply `LIMIT 100001` to those streams before status/expiry filtering; row 100001 fails `identity_manifest_overflow`, and a differing latest tie fails `authority_revision_conflict`. Before classification, map `supplierStockId` and `customerStockId` independently to the exact `effective_active` row having that stock ID in the already complete `rosterManifestHash` named by the peer manifest header; its row symbol becomes `supplierSymbol` or `customerSymbol`. The roster manifest rather than live `stock_instruments_v3` or `stocks.symbol` is the sole mapping authority. Multiple matches for one stock ID fail `data_integrity_failure`; no match produces the corresponding endpoint-ineligible reason. Each selected stream receives one terminal classification. Eligibility requires, together: `sourceTimestamp <= approvedAt`; selected `status=active`; `validFrom <= sourceCutoff < validTo` (null valid-to is open); different supplier/customer stock IDs; both mappings present in the bound eligible roster; reviewer principal is `effective_active` in the frozen peer-reviewer manifest; and an at-cutoff verified official/public-research evidence record from `source-matrix.md`. Otherwise select the first exclusion reason in this closed order: `source_after_approval`, `inactive_status`, `not_yet_valid`, `expired`, `self_edge`, `ineligible_supplier`, `ineligible_customer`, `reviewer_not_allowed`, `unverified_evidence`.

No second source-time collapse occurs after stream supersession: the one latest event is either selected or receives one of the nine exclusions above. Thus all at most 100,000 post-collapse streams conserve exactly as `scannedRowCount = selectedRowCount + sum(exclusionReasonCounts)`. Older immutable events remain table audit history but are not another manifest row and cannot revive after revocation.

All seven authority families first enumerate the immutable family registry through literal `LIMIT bound+1` before `recordedAt`, valid-time, approval/source time, status or expiry filtering, then inspect at most 64 events for each registered key through `LIMIT 65`, exactly as `authority-supersession-contract.md` v3.2 specifies. The family-wide registry lock prevents two concurrent new keys from crossing the bound. A registered future-only key may produce no terminal manifest row, but it still consumes the finite registry capacity and can never create an unbounded sparse prefix.

The selected tuple is `[relationshipAuthorityId,supplierInstrumentAuthorityId,supplierStockId,supplierSymbol,customerInstrumentAuthorityId,customerStockId,customerSymbol,"supply_chain",sourceTimestamp,approvedAt,validFrom,validToOrNull,"active",evidenceRef,reviewerPrincipalId,recordedAt]`, sorted supplier symbol, customer symbol, source timestamp descending, approved-at descending, recorded-at descending, evidence ref, authority UUID. The two symbols are exactly the bound roster-manifest mapping above; the authority IDs/stock IDs are the immutable stored values. The excluded tuple has the same fields, uses the mapped symbol or null when that endpoint is absent, and appends `exclusionReason`; it sorts exclusion-reason enum order then authority UUID. Every closed reason key is present in `exclusionReasonCounts`, including zero. Under `manifest-storage-contract.md`, the peer-authority dependencies/counts are the `peer_authority` header, and selected/excluded tuples are its `selected_rows`/`excluded_rows` sections. `peerAuthorityManifestHash` is the universal root hash and is frozen during preparation before the market/reference manifest and `seal_inputs`; the domain header/rows do not define a second monolithic hash.

If the same neighbor is both upstream and downstream, retain its upstream relation for ordering. Same-sector is an undirected derived relation and is used only when that neighbor has no chosen supply-chain relation to the candidate.

Expansion is deterministic. Traverse direct candidates by source priority descending, newest effective source timestamp descending, symbol ascending. For each, enumerate unseen/non-direct eligible peers with upstream supply-chain, downstream supply-chain, then same-sector relations; within a role sort relation source timestamp descending (same-sector uses the sector-assignment timestamp), 20-session average turnover descending, symbol ascending. Attach the first three for that direct candidate while the global first-twelve-unique cap has room; one peer attached earlier is not counted again. Truncation never depends on database row order. Comparison peers receive only price/liquidity/sector-relative enrichment, not deep valuation. Peer-expanded symbols SHALL be marked `comparison_only`; they cannot enter `actionableNow` or formal recommendation until they receive a direct approved-source event or independently verified company/fundamental catalyst.

## R5 — Full-Market Boundary

V3 SHALL NOT perform full-market per-stock deep analysis. Full-market data is allowed only for aggregate market/sector context, liquidity/relative percentile reference, the shallow hash-bound sector valuation reference manifest in `financial-data-contract.md`, and an after-close Top-20 mover audit. Full-roster observations are ingested beforehand into the append-only V3 observation plane in `storage-schema-contract.md`; a run never downloads or synchronously fetches a full-market provider dataset. Candidate filing/valuation input loading remains bounded to the deep 20.

Session identity, correction/cancellation/reactivation, TWSE/TPEx composition and completed-session adjacency are exclusively the point-in-time authority in `trading-calendar-contract.md` v3.4. A cron-visible row is resolved at its own returned 16:00 cutoff, cannot be returned before that instant, and begin atomically revalidates its hash at the identical cutoff before any durable write. Every session-bound price/market observation, mover/audit identity, factor/sector window, outcome and evaluation row binds the applicable authority ID or hash; weekday inference, price-presence inference, statement-time authority substituted for row-cutoff authority and a current calendar substituted for historical cutoff are forbidden.

After each official close, the mover audit starts from active TWSE/TPEx common stocks having cutoff-visible official raw closes, official session turnover >=NT$20 million and one selected complete owner-exchange corporate-action snapshot for every completed session needed by the adjustment window under `market-contract.md` v3.6. Each complete daily snapshot binds all three compiled official result feeds for ex-right/ex-dividend, capital-reduction resumption and par-value-change resumption; FinMind is raw-price fallback only and can never attest an action. Caller-adjusted values and per-stock caller `none` attestations are forbidden. The trusted runner derives each adjusted OHLC from the raw observation times the ordered product of official pre/post reference-price factors between the raw and anchor sessions. A stock absent from a valid complete daily snapshot alone yields factor one; absence from a partial, future, missing or conflicting snapshot yields no adjusted value. Every factor-one day and action row is bound in the native evidence tuple, and no rounding occurs before the final result. `oneSessionReturnPct = 100 * (adjustedClose_t / adjustedClose_previous - 1)`. It orders return descending, turnover descending, symbol ascending and selects the first `moverCount = min(20, eligibleUniverseCount)`; `eligibleUniverseCount` is internal evidence and is not the recall denominator. The fixed symbol array is unique and its length equals `moverCount`. The audit snapshot binds official session/close timestamps, raw-price source refs, all action snapshot IDs/dataset hashes/rows, corporate-action version and a window close exactly 72 hours later. Symbols SHALL remain `missed_source_audit` and invisible to actionable/formal pools. `laterMentioned` means a qualifying approved-source document in the exact bound upstream source run has both `published_at` and `collected_at` strictly after the audited close and at or before `min(sourceCutoff,auditWindowClosesAt)` and links the symbol. Before the window closes that cutoff's immutable audit snapshot is `pending` and recall is null; at/after the window close a later-cutoff immutable snapshot is `matured`, freezes `sourceCollectionCutoff=auditWindowClosesAt`, and recall is later-mentioned count divided by `moverCount` (null only when `moverCount` is zero). A pending row is never updated into matured; the deterministic price-root completion writer appends/reuses the exact snapshot for its cutoff. Mention maturity never filters or reorders a snapshot's fixed symbols. Price movement alone never promotes them.

Every successful available projection requires the mover snapshot for the greatest effective composite Taiwan trading session whose `auditedCloseAt <= run.sourceCutoff`; a conflicting calendar tie or duplicate differing snapshot is data-integrity failure. A missing required snapshot blocks terminal enrich success rather than selecting an older arbitrary audit. The selected snapshot's pending/matured fields are computed and frozen against that run's source cutoff; a later projection never mutates the earlier payload.

The audit's full-roster price eligibility is frozen as logical kind `mover_price_reference`, with one included/excluded terminal row per roster symbol, exact reason precedence/conservation and universal `moverPriceReferenceManifestHash` from `market-contract.md` and `manifest-storage-contract.md`. An enrich run builds exactly the available one through five most recent completed-session roots, newest first, so each session remains eligible to receive a later matured snapshot without an unbounded historical scan. Each root completion is the sole audit writer and atomically creates/reuses its deterministic header/symbol snapshot; ordinal zero binds the selected audit, and the final root alone creates the dependent market-reference header. The selected audit ID, source-dataset root and all ordered mover-price roots are sealed inputs. A live table query, candidate-only price sample or untyped `price_manifest_id` cannot authorize the mover list.

## R6 — Multi-Horizon Scoring

Every deep-research candidate SHALL be scored separately for:

- `momentum_5_20d`;
- `swing_20_60d`;
- `thesis_120_250d`.

Each score SHALL expose versioned factor contributions. A long-horizon fair value SHALL NOT be presented as a short-horizon price forecast or entry target.

All factors are numbers from 0 through 100 rounded half away from zero to two decimals. Point-in-time percentile inputs use the exact winsorized ranks in `scoring-contract.md` from the allowed market/sector reference dataset. Subfactor and aggregation formulas, freshness and missing behavior are normative in `scoring-contract.md`. Missing or stale factors score zero and reduce `availableWeight`; horizon score remains the weighted sum divided by 100, with no renormalization. `scoreConfidence = availableWeight / 100 * min(sourceConfidence, valuationConfidence)` for valuation-dependent decisions; event starters use `availableWeight / 100 * sourceConfidence` and do not claim valuation confidence.

Action horizon resolution is deterministic: `event_starter` can use only `momentum_5_20d`; other new-position decisions use the higher of `momentum_5_20d` and `swing_20_60d`, with a tie resolved to `swing_20_60d`. `thesis_120_250d` affects formal research status and existing-position context but cannot alone open a new position.

Initial weights:

| Factor | 5–20d | 20–60d | 120–250d |
|---|---:|---:|---:|
| Price/volume relative strength | 35 | 20 | 5 |
| Chip/institutional flow | 20 | 15 | 5 |
| Catalyst/source evidence | 15 | 15 | 15 |
| Market/sector context | 15 | 10 | 10 |
| Fundamental change | 10 | 25 | 35 |
| Valuation | 5 | 15 | 30 |

## R7 — Market and Sector Context

The market regime SHALL use actual TAIEX/OTC trend, breadth, institutional cash flow, aggregate margin/short data, derivatives risk and global reference signals. Market-session inputs are fresh through the next Taiwan trading session close; chip/flow and derivatives are fresh for two Taiwan trading sessions; global inputs are fresh for two relevant-market sessions. It requires fresh trend, breadth and at least one of flow/derivatives.

Group scores and deterministic regime thresholds are normative in `market-contract.md`. With sufficient core data, composite below 35 is `risk_off`, 35 through 64.999 is `selective`, and 65 or above is `risk_on`. Trend below 25 or breadth below 25 overrides the composite to `risk_off`. Missing core groups force `unknown`.

Regime gross-exposure caps are `risk_off` = 0% new exposure, `unknown` = 15%, `selective` = 35%, and `risk_on` = 60%.

Sector cycle SHALL be one of `early_recovery`, `expansion`, `late_expansion`, `contraction`, or `unknown`, with source timestamps and reasons. Market/sector context changes timing and risk budget only; it does not directly change intrinsic value.

## R8 — Valuation Calibration

- Current market PE SHALL NOT be reused as the default fair PE.
- Base margins SHALL NOT be forced upward to profile assumptions.
- A single broker target SHALL remain a comparison point, not a weighted Base target.
- Method selection SHALL use the closed `valuation-contract.md` v3.4 taxonomy:
  ordinary profitable companies use PE/EV-EBITDA, cyclical sectors use twelve-quarter
  normalized PE with EV/EBITDA cross-check, financials use residual-income/PB-ROE,
  construction may use sourced NAV, and loss-making companies cannot display positive
  PE but may use qualified EV/Sales/EV-EBITDA or complete normalized-cycle earnings.
- Output SHALL expose sourced Bear/Base/Bull (compatibility aliases p10/p50/p90), method,
  required cross-checks, scenario inputs/sensitivity, as-of date, confidence and
  outlier/review status.
- An unverified Base upside above 80%, scenario upside above 150%, or formula-versus-verified-broker-consensus p50 divergence above 35 percentage points SHALL hard-block buy-like actions pending review. Assistive-model divergence is display/shadow evidence only and cannot block or enable an action in V3. These thresholds trigger review; they do not cap legitimate values after verification.

## R9 — Research and Action Are Separate

R9 is normative for the V3 shadow/Promotion engine through V3.12. For the V3.13
disabled legacy-product projection and its Landing/detail consumers, the exhaustive
supersession table in the active V3.13 decision-integrity amendment replaces the
five-action, sizing, capacity and allocation clauses below. They cannot be used as a
second V3.13 decision path.

`formalResearchStatus` and `actionDecision` SHALL be independent fields.

`formalResearchStatus` is one of:

- `not_evaluated`: not selected for deep research;
- `insufficient_evidence`: deep research lacks required independent evidence or data completeness;
- `valuation_review`: valuation is missing/outlier/stale;
- `formal_watch`: evidence and valuation are valid but thesis score/upside does not pass formal-candidate thresholds;
- `formal_candidate`: direct or official source event, at least one official/public-research claim plus one independent source class, thesis `availableWeight` (the canonical `dataCompletenessPct`) >=80%, source confidence >=0.60, normal valuation confidence >=0.60 and `thesis_120_250d` score >=60.

The new-position action is one of `avoid`, `valuation_review`, `wait_trigger`, `event_starter`, or `starter_now`. Existing-position action is independently one of `no_position`, `manual_review`, `hold`, `trim`, or `exit`. Exact hard blocks, formal-status precedence, action precedence, technical-extension/confirmation rules, trigger construction and sizing are normative in `decision-contract.md`.

- `starter_now`: score >= 70, confidence >= 0.65, normal valuation, positive risk budget and no hard block; requested size 5%, with a minimum executable size of 3%.
- `event_starter`: directly sourced and verified official/public-research catalyst
  candidate with normal valuation, momentum score >=70, event decision confidence
  >=0.60, typed technical buy eligibility and no hard block; requested size 3%, with a
  minimum executable size of 2%, explicitly non-formal.
- `wait_trigger`: score >= 60 and normal valuation reward/risk thresholds pass, but
  typed technical state requires reclaim, breakout or pullback; include only the
  deterministic trigger from `technical-decision-contract.md`. Missing/stale/outlier
  valuation is `valuation_review`, never a buy or fabricated technical wait.
- `avoid`: hard block or score below 60.
- The pure decision input includes current gross exposure, current stock exposure and current sector exposure. Public shadow allocation follows the non-personalized zero-start research basket in `portfolio-context-contract.md`; it never claims to know user holdings. Suggested new size is the minimum of requested action size, `10% - stockExposure`, `25% - sectorExposure`, and `regimeGrossCap - grossExposure`. A result below the action's minimum executable size returns `avoid` with `capacity_exhausted`; the engine never rounds exposure upward.
- Existing action: no holding -> `no_position`; breached stop/invalidation -> `exit`; valuation/data-integrity uncertainty -> `manual_review`; otherwise risk-off, price >= the `p90DecisionEligible` value defined in `valuation-contract.md`, or exposure above a cap -> `trim` to the applicable cap; else `hold`.

The engine SHALL never manufacture a buy to satisfy an action-distribution quota. A constructive fixture with a genuinely eligible candidate must, however, produce a bounded starter rather than a generic wait/no-buy.

## R10 — API and UI Contract

With deployment state `SOURCE_LED_OPPORTUNITY_V3=shadow`, `RadarDailyPayload` SHALL add an additive discriminated `opportunityEngineV3` object with exact serialized types in `data-contract.md`. A successful projection has `availability: available`, `contractVersion`, `featureVersion`, `decisionVersion` and `mode: shadow`; cold-start/no-matching-success has `availability: unavailable`, null run IDs and a typed failure reason rather than fabricated cards. In `disabled|drain` the V3 member is omitted before any V3 query. The separately approved V3.11 legacy-correctness projection and its additive fields are invariant to that V3 state and follow `legacy-radar-correctness-contract.md`; removing them reproduces the reviewed legacy v3.11 baseline. This checkpoint does not authorize `authoritative`; the closed deployment states, fail-closed routing and rollout/rollback DAG in `legacy-compatibility-contract.md` v3.2 are normative.

- `sourceFunnel` counts and typed rejection reasons;
- `marketContext` and completeness;
- `rankedLanes` by horizon;
- `actionableNow`, `waitingForTrigger`, `valuationReview`;
- `engineHealth`, version and shadow status.

`actionableNow` is sorted first and capped at 6. `waitingForTrigger` fills the remaining slots so their combined length is at most 12. `valuationReview` is separately capped at 8. Ranked horizon lanes are capped at 20 cards each and use compact card refs rather than duplicated full cards.

Each V3 card SHALL include source provenance, horizon, rank/score delta, factor breakdown, formal research status, research-only action decision, valuation distribution, sector cycle, `changedBecause` and an exact same-run `detailPath`. That path and its immutable bounded detail payload are normative in `v3-detail-contract.md`; a V3 page cannot call a legacy detail lookup, provider refresh or write and cannot silently fall back to another run. Legacy radar arrays remain unchanged in shadow. V3 cannot write or project into recommendation, strategy-action or alert state under this checkpoint.

The radar's server-owned `requestProjectionCutoff` is a selection boundary, not a license to reinterpret current mutable orchestration state as history. Run status at cutoff C is reconstructed only from database-owned immutable/write-once `createdAt`, `sealedAt` and `terminalAt`: a terminal state is visible only when `terminalAt <= C`; otherwise the attempt is historically `running` when `sealedAt <= C` and `preparing` when no seal was visible. Active/failed warning facts are append-only, job-bound and visible only when both the fact and its producing successful job terminalized at/before C. An available response is the exact stored run projection with `asOf = run.sourceCutoff`; C selects that run but never rewrites its bytes. Only an unavailable response is generated for C and carries `asOf = engineHealth.sourceCutoff = C`. Exact precedence, equality boundaries and serialization are normative in `data-contract.md`, `runtime-transaction-contract.md` and `storage-schema-contract.md`.

## R11 — Outcome and Model Boundary

- Store immutable decision snapshots and label outcomes at 20/60/120/250 trading sessions using returns, sector-relative returns, maximum favorable excursion and maximum adverse excursion. Persistence uses the independent exact maturity enum `session_20|session_60|session_120|session_250`; it never overloads the three scoring-lane horizon values.
- News/sentiment, embeddings and time-series models are `assistive_only` challengers.
- A model cannot affect formal status, valuation or action until its artifact hash, license, training cutoff, out-of-sample metrics and comparison baseline are registered and a later checkpoint explicitly promotes it.
- Vercel runtime SHALL NOT download or train models.

Local Loop Engineering model execution is separately governed by `model-runner-contract.md` v3.6 and the immutable `model-runner-host-pins-v3.json` fixture. The exact canonical manifest, CLI-to-operation map, Sol/Terra routing, user-owned Sol-maker waiver, task state/status, exit precedence, request/result/JSONL schemas, journal states and deterministic commit/ref bytes are closed; V1/V2 history is always read-only. Every Codex command descendant receives only one bounded hash-bound non-Git sanitized view, exact prompt inputs, trusted minimal runtime and one private scratch root. Initial make views `inputHead`; review, verify and repair make view the exact proven proposal commit so no verdict or repair can rely on hashes alone. Permanently forbidden AGENTS/config/rules/hooks/MCP/plugin/skill/secret classes are decided by the closed lexical path oracle before selectors or prompt reopen and cannot re-enter through `promptFiles`. The macOS custom profile MUST deny other user/repository reads, every authoritative write and command network/Unix sockets; it also proves no usable file/socket/auth/config/transport descriptor reaches direct or detached model commands. No legacy `--sandbox`, user/project config or alternate binary/profile/model may override it. The prompt treats repository, patch and prompt code/commands as data and MUST NOT instruct their execution, but the checkpoint does not claim all code execution is impossible; scratch writes are allowed and non-authoritative. Only one bounded hash-bound terminal result can cross to trusted runner code; a maker patch is nonempty and has no no-op publication branch. Maker never writes Git; trusted apply alone may create the exact single-parent commit and immutable result ref. Before any resource record, an immutable contiguous reservation ordinal gives each pre-`prepared` resource attempt its own hash key while leaving the operation round/counter unchanged; cleanup-success retries use the next ordinal, and no journal is deleted or reused. The exact 884-byte runner identity digest is a mandatory `modelRunnerIdentitySha256` member in request, status, reservation, every operation/resource journal line and attempt metadata, and is included in both operation/resource-attempt key preimages; missing or different durable identity fails closed as unrepaired `recovery_required`. The dual journals have one write-ahead partial order and exhaustive phase/exit/state/counter/output/retention/retry oracle. Cleanup failure universally overrides its retained primary outcome with `IO_ERROR`/11, `recovery_required`, empty stdout and the one byte-exact redacted IO-error object plus final LF; cleanup success preserves the primary outcome. Every other nonterminal runner diagnostic is likewise selected from one closed code/exit/exact-message table, contains no variable cause/path/identifier data and is replayed byte-for-byte. The 2,137-byte canonical host fixture pins absolute Node/Git/Codex paths, stat/hash/version and Codex bundle/codesign identities. Host/profile preflight mismatch before resource reservation is exit 5, unchanged status, zero task-model/apply spawn and no durable operation tuple.

The Loop runner cannot register a domain artifact or write Supabase. Any separately produced offline artifact must still pass the signed `model_reviewer` registration below before display and remains `influence:'none'`. No runner output enters candidate, formal, valuation, score, rank, decision, allocation or promotion math.

Registration authority is the single additive `opportunity_assistive_artifact_registrations_v3` catalog in `storage-schema-contract.md`, written only by the signed `model_reviewer` RPC in `auth-principal-contract.md`. Every row binds artifact kind/hash/ref, allowlisted license plus evidence ref, training cutoff, complete 120-date evaluation-input manifest, comparison baseline and finite OOS Precision@20/NDCG@20/worst-decile MAE. Cutoff selection collapses exact duplicates, rejects conflicting ties/revocations/baseline mismatch, orders by evaluation completion descending then hash/UUID and exposes at most three. The public summary includes those registered fields and always `influence:'none'`; artifact selection/output has zero input to candidate, formal, valuation, score, rank, decision, allocation or promotion math in this checkpoint.

Metric formulas, relevance labels, cohorts, maturity gates and the fail-closed legacy baseline lock are normative in `shadow-evaluation-contract.md`; canonical sector-relative outcomes use `sector-benchmark-contract.md`. Homepage-order promotion requires at least 20 matured live 20-session cohorts plus a reproducible point-in-time backtest; 20 days of mere runtime is not sufficient.

## Safety and Operational Requirements

- Pipeline control accepts only the fixed non-human runner principal. Its POST begin, status and four GET cron routes, request/response bytes, authentication, precedence, database calls and durable effects are the closed six-route catalog in `control-plane-contract.md` v3.3; lexical cutoff validation is route-owned, while database begin alone derives comparison/preparation keys plus the mode-specific ordered input set and owns every upstream/bootstrap failure. Every failed begin leaves zero durable rows. Cron passes the view-selected hash as a server-owned begin assertion; no selector may be ignored and no additional control path or lineage read is implementation-selected. The eight raw source/instrument/sector/session/price/market/stock-flow/financial appends use only the exhaustive fixed-runner, one-call, no-nonce route catalog in `auth-principal-contract.md` v3.8. Every human-authority Supabase write belongs to the separate exhaustive eleven-route catalog and is dual controlled by the repository-governing `requireInternalAuth()` bearer guard plus the signed, replay-protected principal/role matrix; neither credential can act alone and a request-body actor cannot impersonate a reviewer.
- V3 uses the separate server-only service-role client tuple and offline validation in `auth-principal-contract.md`, never the legacy fallback client or an anon key. On every human-authority route it is acquired only after transport, both authentication controls and exact body validation but before nonce/RPC work. Offline tuple/constructor failure yields the exact `v3_service_role_unavailable/503` route-family body, zero database/network call and zero durable write. A remote `401|403` on a blinded combined RPC or the first non-blinded nonce RPC is one call/zero write; rejection on the second non-blinded append RPC is two calls retaining exactly the already committed nonce plus its successful nonce audit and zero authority/append-audit write. A runner-ingestion rejection is one call/zero write and never creates a nonce. Every branch uses its exact bounded route-family response.
- New tables use `ENABLE ROW LEVEL SECURITY` plus `NO FORCE ROW LEVEL SECURITY` and
  revoke all `anon`/`authenticated` privileges. Existing V3 exposes only read plus its
  closed non-overloaded 33-function `service_role` RPC set. The separate V3.11
  legacy-correctness migration has its own NOLOGIN/NOBYPASSRLS owner and exact
  ten-function producer-only catalog plus a separate durable paged-authority and
  per-revision-shard job/outcome plane; it does not alter
  or invoke the 33 V3 functions and has no public mutating route. `service_role`
  receives no direct DML. Exact additive
  DDL/constraints/indexes/FK targets/deletion actions/triggers/owners/policies/grants
  are normative in `storage-schema-contract.md` v3.25.
- Long-running work uses the durable run/job protocol and per-request resource envelopes in `runtime-transaction-contract.md` v3.17. `job-graph-contract.md` v3.15 is the sole authority for deterministic job creation, one-revision parse sharding, immutable one-to-one payload/result rows, manifest cursors, exact staging bodies, token-bound database-computed connector/outcome/evaluation projections returned atomically by claim, every per-payload database-call ordinal, private successor helpers and worker HTTP responses. Begin creates the first job/payload atomically; every successful predecessor creates exactly one successor/payload in its terminal transaction; finalize is a leased job. One Vercel request cannot own an entire run, a worker cannot select/skip/create work, enumerate a read view or receive a full connector/benchmark population, and crash/retry cannot publish a partial success or orphan a successful predecessor.
- Production rollout and rollback SHALL follow `legacy-compatibility-contract.md` v3.2. V3 starts disabled, schema application is transactional and additive, shadow schedules enable last, rollback stops producers before bounded drain, keeps committed V3 objects/evidence, verifies the frozen legacy lock and re-enables in the exact fail-closed order. No down migration or request-selected deployment state is permitted.
- Every dataset/authority manifest uses the single kind/header/section/page/root/lifecycle authority in `manifest-storage-contract.md`; domain-named manifest hashes are its universal root hashes and cannot be reconstructed as monolithic arrays or stored in dedicated sector tables. Page descriptors are database-owned; append rechecks the exact bounded selector and greedy boundary, and page/root success plus successor creation is atomic.
- Only additive schema changes are allowed in V3; applying them requires a later migration checkpoint.
- Preserve existing formal-gate, source-health, revaluation and secrets protections.
- No edits to `.env*`, automatic deploy, merge, push or production write.

## Success Criteria

- Source activity is traceable from document to linked/rejected candidate with no silent loss.
- The candidate pool changes when fresh qualifying source evidence changes and can prove why it did not change otherwise.
- Market status cannot be affirmative on missing core inputs.
- Unsupported valuation outliers cannot produce buy-like actions.
- The dedicated `/opportunity-v3` workspace presents bounded source-provenanced verified changes; the homepage presents only its bounded action/score/sizing-free summary and link. This R12 criterion supersedes the earlier homepage-first action-panel milestone.

## R12 — Hybrid Product Milestone

`hybrid-product-amendment.md` is the active product-milestone owner. The complete V3 runtime remains in scope, but its first user-facing milestone SHALL be the dedicated `/opportunity-v3` verified-change workspace rather than a homepage-first action panel.

The workspace SHALL render the exact three lanes `new_verified_change`, `strengthened_thesis` and `contradiction_or_review`. Every visible item SHALL carry one bounded immutable same-run `verifiedChangeBrief`; it cannot query mutable legacy detail, call providers, reconstruct history or write data.

Public compact/detail payloads SHALL omit requested and suggested position percentages in this checkpoint. Typed internal allocation may remain for conservation and shadow evaluation, but it is not a user-facing instruction and cannot be serialized into the verified-change brief or workspace.

Shadow evaluation SHALL compare `official_only`, `source_led` and `hybrid` strategies over identical point-in-time inputs and outcome maturity. The comparison is non-authoritative and cannot change legacy recommendations, V3 formal status or action decisions.

The homepage may show only a bounded shadow summary plus a workspace link. Disabled and drain preserve byte/order-compatible legacy behavior by omitting V3 content before any V3 query. Production mutation, schedules, promotion and model influence remain separately gated.

## R13 — Product Correctness, Tracked Runtime and Material Analysis

The catalog-bound product-correctness amendment owns scope and authority. Its exact
behavior is closed by `runtime-installation-contract.md`, `discovery-correctness-contract.md`,
`technical-decision-contract.md`, `analysis-revision-contract.md`,
`legacy-radar-correctness-contract.md`, `acceptance-evidence-contract.md` and the
versioned financial/valuation/decision/data/storage/type owners named there.

The implementation SHALL:

- reject ignored or stale producer code as runtime authority;
- surface qualifying out-of-seed source signals before valuation;
- remove seed-derived EPS/target authority and fail closed on inconsistent valuation;
- use `reclaim_required` when a long candidate trades below former support;
- distinguish evaluation from material research change;
- serve radar from the dedicated, indexed, at-most-6,000-row precomputed projection
  relation without changing legacy `runtime_artifacts` retention;
- keep Code, Shadow Activation and Promotion gates separate; and
- preserve disabled V3 and every production-mutation boundary until separately
  authorized.

The tracked legacy-correctness producer SHALL obtain roster/source authority only
through the run-bound, read-only, ungranted scheduled-occurrence and paged-authority
helpers. Disabled V3 forbids every V3 route and write but does not force a second,
inconsistent instrument/source authority. PostgreSQL SHALL derive scheduled
occurrence, cutoff, trading date and session-authority hash from database time plus
the canonical config; callers cannot choose them. For a new attempt the single acquire
transaction SHALL order
`occurrence -> run -> authority pages/frozen revision rows -> compact root -> payload
-> input -> job`; any failure rolls back all new rows. Same-occurrence retries cannot
reread later authority.

Source-sync SHALL create deterministic one-revision mention shards followed by one
bounded conservation barrier; it SHALL NOT carry raw selected revisions or aggregate
all parse outcomes in the compact run root. A revision-shard claim is the only caller
of the token-bound raw-revision helper. Its fresh-token lease mutation, exact helper
read, one-row identity/algorithm/hash/size validation and claim return SHALL occur in
one transaction before commit. On any helper failure the staged attempt/lease SHALL
roll back, the unchanged-attempt unleased job and run SHALL terminalize
`data_integrity_failure`, and zero raw bytes SHALL return. The main worker SHALL
receive any bounded read unit atomically from its fresh-token claim RPC and SHALL
expose no owner-rights enumeration view.

Persisted commentary SHALL be the deterministic typed-claim renderer; model draft
bytes are non-authoritative and cannot enter revision/hash/projection. A first
runtime activation SHALL capture exact prior plists, enabled states and executable
identities and SHALL restore them from every interrupted/failing boundary even when
there is no prior tracked release. Shadow Activation SHALL have its own canonical
evidence boundary, remain outside required PR Code checks and Promotion inputs, and
remain blocked until separately authorized.

The canonical V3 acceptance inventory advances to `1.46.0` with the PCR, V3.13 decision-integrity and V3.14 actionability-recovery cases owned by
their active amendments. Requirements/Architecture evidence binds the exact active-graph blob
identity; exact review binds the final subject commit/code tree, so an older PASS
cannot be replayed. Existing 1.42.0 evidence remains historical and cannot satisfy
R13.

Requirements traceability is valid only through the protected reviewer-owned external
gate harness defined by the active acceptance-evidence contract. PCR fixtures bind to
immutable planned operation/caller/effect boundaries and remain explicit RED until their
complete canonical setup/expected behavior is executable there. A named wrapper,
case-ID dispatcher, fixture-derived response, vector-only stub or self-attesting process
cannot establish a Product or Code Gate PASS.

## R14 — Explainable factor correctness

The product SHALL expose a source-led stock-discovery explanation separately from
business quality, valuation and timing/risk. The four axes and their closed
availability/action boundaries are owned by
`factor-correctness-amendment.md` v3.11.6. They are explanatory fields, not a
replacement for the source funnel, valuation fail closure or technical safety gate.

Technical timing SHALL calculate BIAS from point-in-time adjusted closes and
MA20/60/120, expose the stock-specific historical percentile and bounded sector
reference where available, and fail closed when the adjustment/history/ATR authority
is incomplete. A deeply negative BIAS may not override `below_support`,
`reclaim_required` or `invalidated`, and it cannot generate a buy-like action before
reclaim/entry geometry is valid.

Valuation SHALL keep official daily exchange PE distinct from model-comparable PE,
preserve their facts, samples and as-of provenance, compare current multiple to the
stock's valid historical distribution and canonical-sector reference, and suppress PE
for non-positive EPS. Method-specific valuation selection, operating bridge and
`valuation_review` fail closure remain mandatory. Factor/prose changes must follow the
immutable material-revision contract; a re-check with no material input change must
not rewrite the analysis.

## R15 — V3.13 decision integrity and product truth

`source-led-opportunity-engine-v3.13-decision-integrity-amendment.md` is the sole
owner of the disabled-legacy-product repair for projection availability, official
valuation authority, one decision envelope, source-acquisition truth and the compact
Landing/detail information architecture. Earlier V3.11/V3.12 gate evidence remains
historical and cannot satisfy this amendment.

The implementation SHALL distinguish immutable content time from evaluation and
publication heartbeats, apply one exchange-calendar freshness policy in Web, doctor
and internal health, and degrade to last-good read-only or typed unavailable data
without crashing the public page. Checksum conflicts remain fail-closed.

Every buy-like recommendation SHALL derive from one `DecisionEnvelopeV313`. Formal
recommendations require method-appropriate official point-in-time facts, a complete
Bear/Base/Bull bridge and valid technical geometry. Conditional research may use only
complete official 252-session own-history authority plus at least eight same-session
sector peers. Missing data is `unavailable`, not `avoid`; no action quota may force a
recommendation.

Acquisition SHALL be official or explicitly authorized, terminally conserved and
separate from analysis. Metadata-only podcast/video rows cannot claim transcript
understanding. FULL detail is authoritative and LIGHT may fill only missing leaves.
Landing and detail SHALL bind the same immutable decision revision.

Fresh Requirements and a distinct evidence-carrying Architecture review SHALL bind a
new immutable V3.13 subject tree. The 297 predecessor cases and 11 executable V3.13
decision-integrity cases form one canonical 308-case protected inventory. Exact review and the authoritative Code Gate
must bind the final release-candidate range before any coordinated publication.

## R16 — V3.14 actionability recovery

`source-led-opportunity-engine-v3.14-actionability-recovery-amendment.md` supersedes
V3.13 only for projection visibility, research ranking, the public decision enum,
producer unchanged-disposition integrity and the coordinated production activation
described there. Research visibility is independent of action authority: calendar,
freshness or compatibility failure may disable actions but cannot erase a checksum-
valid last-good research projection. Research ranking never authorizes an action and
missing factors cannot be renormalized upward.

The sole V3.14 action envelope adds `wait_value` and `wait_market`, preserves strict
formal/conditional authority and requires affirmative evidence for `avoid`. The
official data plane, typed failure diagnostics, exact release identity, three-section
Landing and two-stage rollout are mandatory. Fresh Requirements, Architecture,
exact-commit review and authoritative Code/Shadow Activation gates must bind a new
immutable tree; V3.13 evidence is historical.

The canonical protected inventory advances to `1.46.0`: 320 unique IDs partitioned
as 272 product/runtime, 28 model-runner and 20 evaluation-governance cases. The
twelve `REC-*` owners are mandatory, non-skipped V3.14 product/runtime evidence.
