# Oct14 historical-cash successor: bounded contract proposal

Status: **PROPOSAL / implementation and native acceptance pending**. This is a read-only requirements/design review, not design approval, formal role execution, financial verification, publication approval, protected approval or deployment authority.

## Decision

Introduce one finite successor profile for 2409 and 2383, with versioned material/schema/mapping and separate v3 read/seal RPCs on the existing guarded endpoint. Preserve the old v2 request, mapping, revision bytes and replay verifier. Reuse the existing private revision table and shared accounting; do not introduce a publication service or generic plugin/profile registry.

Prefer reading the **entire pinned cash packet** together with the successor model and original manifest files. This requires an explicit narrow workload amendment: successor AUO has exactly **9 files**, EMC exactly **7**. Keep the legacy reader contract at 8 maximum. Do not implement this until that amendment and the new typed observation workload receive independent design review. No other byte, depth, time or durable quota increase is proposed.

The new path must carry cash operands through a newly prepared input, recomputation, paragraph/table references, author result and independent review into the existing publication path. Merely storing cash JSON or updating expected hashes is insufficient. Publication remains blocked until independently reviewed downstream integration and actual authority/rights gates succeed.

```text
fixed successor model + original relays + complete cash packet
  → closed profile projection → fixed scenario + historical-cash recomputation
  → new immutable input revision → new author/reviewer executions
  → existing publication transaction (all remaining gates still required)
```

## Exact scope and evidence

- Read-only checkout: `/tmp/stockinsider-discovery-snapshot-root-review-oct14`, HEAD `ae8bb71744587a57cf49fbd82809d391d9f64169`; initially clean.
- Research source: `15d4ef54ec3f0fc8ab0e5c71111ed2baf2843ccb`. Reviewed contract/runtime files listed below are byte-identical between that source and this evidence checkout.
- Read the first-publication spec, financial adapter slice/inventory, complete-input spec/schema freeze, actual reader/supplement, complete-input controller/static mapping/schemas/canonicalizer, business calculator/article validator, cash integration source, and relevant SQL/endpoint boundaries.
- Read, but did **not execute**, Root's probe `/tmp/stockinsider-formal-input-compatibility-oct14.mjs` and result `/tmp/stockinsider-formal-input-compatibility-evidence-oct14/adapter-compatibility.json` (executed by Root at `2026-10-14T04:02:53.269Z`). It records old exact artifacts passing `unsealed_calculation_only` with 2 synthetic preparation-RPC calls and successor same-path bytes rejecting `financial_file_invalid` with 1 call, for both companies. Its real adapter/file reader and synthetic external RPC are explicitly separate. This is correct old-profile fail-closed behavior, not an old-guard defect or a reversal of the earlier working-draft content review.
- This review ran only small read-only Node quantification/hash/schema-instantiation checks. No adapter/RPC rerun, PostgreSQL, build, HTTP, SSH, acquisition, model dispatch or publication operation was performed during this resumed design review. Earlier official-document automation is a separate completed activity, not design evidence.

## Measured bounds

Byte counts below are UTF-8 bytes. File totals use exact raw bytes. JSON sizes use compact `JSON.stringify`; tagged sizes use the existing `completeCanonical`. Size-only old material was reconstructed from every constant in each frozen schema, with `2026-10-14T04:20:00.000000Z` substituted for dynamic clocks and 64-character placeholders for dynamic hashes. The existing schema validator accepted those in-memory shapes. This did not create an admission or a successful adapter result.

| Quantity | 2409 AUO | 2383 EMC |
| --- | ---: | ---: |
| Old inventory files / bytes | 8 / 641,874 | 6 / 216,856 |
| Successor model bytes | 113,823 | 71,848 |
| Successor model + original relays, without reading packet | 8 / 666,907 | 6 / 234,102 |
| Recommended inventory, including 30,651-byte packet | **9 / 697,558** | **7 / 264,753** |
| Original selected reported / monthly / bridge | 60 / 3 / 1 | 29 / 3 / 1 |
| New cash source rows / numeric cells | 52 / 104 | 33 / 66 |
| Additional capital numeric inputs | 7 | 0 |
| Nested cash JSON, including source lines | 18,215 | 12,642 |
| Nested cash JSON, removing only `sourceLine` | 13,369 | 8,938 |
| Old reconstructed projection / material | 81,113 / 128,165 | 49,344 / 76,084 |
| Illustrative separate-cash projection / material | 97,321 / 147,300 | 59,495 / 87,922 |
| Illustrative tagged material | 184,686 | 108,588 |

The final illustration places cash operands/provenance in projection, replaces each raw source line with its SHA256, and puts the two 27-field cash result rows plus capital in calculation. It retains capital in projection as well for this conservative illustration. It is **not** the final proposed schema: typed locators, explicit statuses/period kinds, version/profile fields and final envelope are still to be frozen and measured. It therefore demonstrates headroom, not acceptance. The full tagged stored envelope, source manifest, internal request and prior preparation charges were not measured; no claim is made that every valid source selection fits the shared 524,288-byte quota. Oversize must reject atomically, never discard evidence.

The largest existing read file is AUO market JSON, 393,280 bytes; the successor models and packet remain below 524,288 bytes/file. Recommended aggregate totals remain below 1,048,576. The original PDFs are 1,578,813 / 1,113,066 bytes and are **not** members of these reader inventories. This review did not read or rehash them.

The 85 cash rows are the sum across two companies, not 85 rows per job. They contain **170 numeric cells**. The current adapter condition is `reportedFacts + monthlyFacts + 1 <= 64`, not merely reported+monthly. AUO already uses all 64. Even treating each two-period cash row as one observation would exceed both companies' legacy cap (116 and 66 including bridge). A nested object is not a legitimate way to evade that workload requirement.

### Alternatives and required amendments

1. **Recommended: full packet read.** Preserve the original promise that every listed manifest artifact is independently byte-checked. Add one closed profile's exact 9/7 inventory; legacy remains 8/6. The increase is one AUO descriptor (8→9), 30,651 additional bytes versus successor-model-only. Keep one reader owner, one shared deadline and one aggregate budget across all files. No second read invocation or fallback can evade the count.
2. **Alternative requiring a different design amendment:** read only 8/6 files and consume the full model-hash-bound nested cash operands. This can fit existing file counts, but the packet in the nested source manifest was not independently read. Require an explicit distinction between `verifiedReadInventory` and `attributedTransitiveManifest`, with `packetBytesRead:false`; never claim complete manifest byte verification. Keep every operand/locator/clock and bind the nested manifest, successor byte hash and canonical hash. This weakens the previous full-artifact-read assertion, so it is not a zero-change escape hatch. I do not recommend silently adopting it.
3. For either layout, explicitly amend successor observation work: retain the old <=64 selected income/monthly/bridge view, plus **exactly 52×2 or 33×2** closed cash cells and AUO's fixed capital tuple (7 numeric inputs plus required null/attribution fields). This is additional bounded financial work, not “still 64 observations.” No arbitrary extra metric/period/issuer/operand graph is allowed. Keep exactly 3×6 forecast quarters and exactly 2 historical cash periods; fixed arithmetic only.

Retain per-file 524,288, aggregate 1,048,576, projection 160,000, complete supplement/material 262,144, semantic depth 12, shared monotonic 10,000 ms, schemas <=524,288 each and <=1,048,576 together. Schema/compiler/bundle totals must be remeasured for the actual successor. The PG `jsonb::text` material/projection checks include different spacing from JS compact JSON; measure both, plus tagged accounting, in native acceptance. Do not infer PG fit from these compact counts.

## Integration findings

**F1 — Inventory alone cannot admit the successor.** `project()` also pins Oct8 `asOf`, the complete 7/5 source manifest, and old canonical scope. Successor models have Oct14 `asOf`, 8/6 source manifests including cash, and a nested canonical-bound manifest. Complete schemas pin original values, cutoff, model SHA and exact object keys; mapping pins inventory and `77b1cc06…` dependency closure. Each of these is a deliberate boundary needing a reviewed successor, not a replace-hash fix.

**F2 — One global mapping would break legacy replay.** `validateCompleteResponse()` checks even persisted rows against the currently imported `mapping.companies[symbol]`, current schema and one sourceClosureHash. SQL parent validation similarly resolves `research_complete_mapping_v2(symbol)` before lookup. Overwriting either mapping makes old sealed rows unavailable regardless of unchanged row bytes. Preserve an immutable legacy verifier branch, not only old artifacts on disk.

**F3 — Existing article/calculator consumers cannot cite cash.** The scenario calculator has a closed input and no cash bridge. The article validator only indexes `/reportedFacts/*/value` and `/monthlyFacts/*/value`; its generic calculation walker infers selected units from field names and would not correctly index signed TWD-thousands cash, ratios or instant capital. Merely adding nested data produces storage, not a usable authored research input.

**F4 — Nested provenance is valuable but not runtime PDF proof.** This review recomputed both successor canonical hashes, confirmed top-level versus nested manifest equality, and compared all 52/33 nested source facts' values, labels, pages and source lines with the actual pinned packet. All matched. Those checks bind reviewed artifact content; they do not independently establish issuer publication time, server raw-PDF access, live rights or formal reviewer authority.

## Proposed finite contract

Names in this section are proposed, not installed API names or allocated identities.

### 1. Profile/version and immutable selection

- Preserve current HTTP version `2`, v2 request keys, material/envelope schema, SQL mapping and old hashes as the exact legacy branch. Do not insert a discriminator into historical request hashes or rewrite old records.
- Add HTTP `X-Research-Input-Version: 3` **only for the existing guarded seal/read actions**, with old request fields plus `financialProfile: 'oct14_historical_cash_v1'`. Company still comes from original preparation; the profile is a finite selector, never caller authority. Unknown/mixed profile/version/action, extra keys, client clocks/paths/material and unsupported company reject before reads/SQL. Preserve auth-first, 8,192-byte actual stream, strict UTF-8 and duplicate-key rejection.
- Use new `research-complete-financial-material-v3` and `research-article-input-v3` closed shapes; add `read_research_article_input_revision_v3` and `seal_research_article_input_revision_v3` with a fixed v3 mapping. Do not route v3 to v2 RPCs after stripping the profile or swapping expectations. Old RPCs must reject the new shape and new expectations.
- Prefer the same append-only `research_article_input_revisions_v2` table: its reviewed relational schema has one unique revision per preparation and no payload-schema-version CHECK. This avoids another quota pool, FK namespace or publication system. New RPCs must preserve all existing ownership/RLS/immutability restrictions and source→global-deep→parent lock order. A new preparation is required for the successor; a v3 request for a preparation with an existing v2 revision conflicts, not migrates it.
- Deliver SQL only as a separately reviewed additive migration with exact predecessor definition/owner/plan-hash preflight; do not edit historical migrations or overwrite a concurrently changed body. Reconcile against the eventual accepted publication predecessor before implementation. The absence of a table-level schema CHECK is not permission to bypass versioned RPC validation. No new service-role direct table grants or runtime role bootstrap.
- Use separate immutable server-owned profile roots or separately named pinned artifacts so old bytes remain available without overwriting an Oct8 resolved path. Root/path selection is server-only; all parent/leaf descriptor checks remain. The exact physical layout is to be frozen in implementation review. Retain original logical provenance paths separately if storage location changes.
- Package the old verifier/schema/mapping alongside the new ones. Old replay uses the old stored request and old supported mapping, returns original bytes/clocks, does not open current artifact files or recalculate. Current source/lease/lineage fences still apply; expiry, completion, withdrawal or explicit reviewed support removal still rejects usable replay. “Preserve replay” does not bypass these fences.
- Old sourceClosure `77b1cc06…` is historical execution-mapping identity, not the hash of a modified new build. Replaying an old row must not relabel it with the new verifier/build identity. If future new admissions under the old profile are retained, their exact legacy computation closure/artifacts also require preserved implementation support; otherwise return unavailable rather than asserting an old execution hash for changed code. New v3 closure includes its actual dependencies/schema/canonicalizer/cash core/article support and separate build provenance.

### 2. Identities and clocks

Keep distinct, explicitly named fields for: raw successor model SHA/length; successor canonical hash/asOf; originalModelCanonicalHash/originalModelAsOf; full sourceInputManifest hash; packet raw SHA/length; complete verified runtime inventory hash; projected input hash; scenario input hash; cash operand hash; scenario/cash result hashes; fixed execution dependency identity; final DB input hash. Hash encodings retain their existing namespaces. New hashes use the tagged canonical encoding; do not relabel the legacy model canonical hash as a tagged digest.

Validate top-level and nested manifests exactly, including order, cardinality, no duplicates, original 7/5 prefix and packet tail. The byte inventory includes the model itself; sourceInputManifest does not. These are different sets. Compare every actually read file to the fixed mapping. Derive and verify the original model canonical body in memory by removing the successor-only fields and restoring original `asOf`, in addition to validating full successor canonical/body identity; do not trust a copied original hash field by itself.

Preserve Oct8 AUO `10:20Z` / EMC `12:12Z` assumptions/model origin, original source observation and later relay extraction clocks, historical price session and publication precision. Successor cash extraction/model cutoff is `2026-10-14T02:34:47.456437+00:00`; this does not update income facts, market quotes, assumptions or their availability to Oct14. Require cash raw observation <= attributed extraction, extraction <= successor cutoff <= current artifact-read clock <= actual DB financial admission/new research cutoff. Include the separately attributed PDF rehash time without converting it into publication or DB admission. Reject future clocks, >6 fractional digits, inversion and date-to-midnight promotion.

New actual DB admission remains sampled under locks. New admission retains the original 120-second preparation freshness check; replay uses original clocks and gains no freshness. Old Oct8 preparations/receipts/manual drafts/reviews are never backfilled as this new execution.

### 3. Closed cash inputs and deterministic results

Project the selected company's entire 52/33 metric tuple from the packet, with exactly the two periods `2026-01-01/2026-06-30` and `2025-01-01/2025-06-30`, consolidated scope, signed TWD-thousands, reported-attributed status, actual file SHA/length, exact issuer JSON pointer/value index, PDF page/column, original source URL/raw SHA/length/clock, extraction clock and explicit relay/non-VM verification attribution. Every operand retains a model nested pointer and packet pointer so their equality can be checked. Do not export raw sourceLine; retain its digest and original locator in the byte-bound private artifact. Do not copy another issuer's cash or AUO capital into EMC material just because the shared packet contains both.

Keep exact keys/tuples, numeric constants/domains and `additionalProperties:false` at every level, not `Record<string, any>`. No private PDF/raw numeric line/absolute host path in author-facing material. Original capital evidence prose remains attributed context, not a new verified statement. Preserve absent share-register count as null.

Add a fixed pure historical-cash calculator, statically imported and bounded; no runtime import/execution of the report script. Recompute from selected operands, not stored `rows`: pretax+noncash+working capital→generated cash; interest/dividend/tax→CFO; owners+NCI→group profit; CFO/group **net** profit ratio; CFO+signed PPE and intangible acquisition cash; separately show lease principal/ROU cash, excluded disposal proceeds and already removed gains; net borrowing; operating+investing+financing+FX→cash change; opening+change→closing cash. Reconcile all applicable fixed component/subtotal rows, including EMC operating asset/liability change and adjustments totals; a matching aggregate must not hide a changed component.

Recompute AUO June30 capital/par→issued common shares and owners+NCI→group equity; owners equity/issued common shares is a historical issued-share metric, not October shares, basic/diluted weighted shares or current P/B. Zero treasury carrying amount does not establish zero treasury share count. EMC historicalCapital remains explicitly unavailable/null.

Keep the existing scenario core/3×6 outputs and actual-versus-assumed classifications intact. Cash results live in a separate typed result section, with named operand references and finite/zero-denominator handling, never as forward earnings/FCFE. The proxy is CFO plus signed PPE/intangible acquisitions: not IFRS FCF, FCFE, maintenance capex or forecast. No annualization, standalone Q2 inference or subtraction of rounded EPS. `forecastCash:null`, `noFutureCash:true`, `valuationApproved:false`, `technicalAdmission:false` are pinned. Preserve unavailable annual YTD bridge, normalized earnings, commercialization and future share-count gaps.

### 4. Consumers and authority

The new article validator must select a versioned input verifier and recompute both scenario and cash results. Add exact cash-fact and cash-derived pointer namespaces with explicit units, periodKind and reported/derived status; do not extend the generic numeric walker to index arbitrary metadata. Page numbers, source byte counts, provenance dates and hash digits are not financial facts. Ratios are dimensionless, cash is TWD-thousands, capital is instant, scenarios are TWD-million; table/summary values resolve to those exact typed nodes. Referencing cash operands as assumptions or model scenarios as reported facts rejects.

Require new article/validator and review-pack version bindings to `(profile, revisionId, inputHash, calculation hashes, source closure, article hash)`. Existing published/detail-v1 and v2 article behavior remains unchanged. Extend the existing publication input union only through an independently reviewed additive material-version arm; do not invent a v1 stage, second outbox or separate service. Storage acceptance alone must remain unusable by unmodified publication consumers. This downstream compatibility scope must be explicitly owned in a later change; it is not part of Cloud's currently owned SQL/native work in this review.

Input assembly and contract validation keep financialVerified, dispatchReady, modelDispatched, publishableResearch, researchQualified, historicalPITEligible, strategyApproved and entryEligible false. Working artifacts also remain published=false. Do not imply those flags become true merely through profile support. Any eventual research publication needs new real job/owner/attempt, authentic author and independent reviewer principal/assignment, pre-existing lawful reservations, live source/rights/withdrawal fences and atomic publication acceptance. Root's PDF checks and this chat are not those proofs.

Do not change the one-global-model limit, 30-minute nonrefundable role reservation, 120-minute/day total, 5 new jobs/week, 3 attempts, original deep-job deadline, handoff ordering or source seal. Preserve one shared count<=4 and tagged bytes<=524,288 across original preparations and all revision versions. New v3 insertion into the existing table is counted by existing old-prepare queries; test that fact, do not assume it. No new budget, retries, refunds or refreshed cutoff to make the successor fit.

## Acceptance required before claiming integration

All cases below are **unexecuted acceptance requirements**, not claimed PASS results.

1. Independent requirements/design review of exact 9/7 file and extra-observation amendments; freeze v3 inventory, schemas, selected metric tuples, formulas, source closure, JS/PG vectors and consumer bindings. Preserve the old RED and prior content-review scope.
2. Actual bounded reader accepts both exact successor inventories. Reject model/packet byte+1, wrong hash/length/company/unit/period/flags, unknown key/profile, omitted/extra/reordered/duplicate/cross-company manifest, top/nested divergence and unknown source path. Keep FIFO/device/symlink/parent/leaf replacement/short-read/cleanup ownership tests. Legacy 9-file call rejects; only the fixed successor mapping can read its approved ninth file.
3. New fixed cash core independently reproduces both 2-period bridges and AUO capital from original packet operands. Mutate each operand, subtotal, disposal/lease treatment, group-vs-owners denominator, sign, unit, instant/flow, Q2-vs-H1, basic/diluted shares and unknown/null flags: reject or explicit unavailable, never repaired silently. Preserve all scenario/EPS/anti-dilution regressions and validate article tables resolve the same recomputed result.
4. New-build regression: preexisting v2 revision/request/hash/clocks replays unchanged under the legacy supported mapping without filesystem calculation or extra charge. Repeated v3 replay returns its first bytes. Different profile or expectations on the same preparation conflicts; v3 material through v2 RPC rejects, including direct service-role calls. Wrong/mixed article version/profile/revision/calculation fails closed.
5. Real guarded HTTP plus native PostgREST/PG: auth-first, strict 8,192/+1, duplicate keys, malformed UTF-8, unknown header/profile, unsupported company; full schema/byte/canonical parity; 160,000 and 262,144 exact/+1 at JS and PG checks, depth12/+1, schema limits, and full request+payload tagged accounting. No fixture-generated identity presented as real authority.
6. Native shared quota/race tests: old prepare versus v3 seal at final count/byte; v2 versus v3 same-preparation conflict; exact replay at full quota; losing transaction leaves zero partial charge/row. New material cannot use an extra quota pool. Source-first/global-deep order, live owner/attempt/reservation, 120-second new admission, microsecond/deadline expiry and rights/head/invalidation races remain effective.
7. One 10,000-ms deadline covers both extra packet read and cash arithmetic, serialization, confirmed close, final admission and response validation. Stall each new stage and test late success, cleanup failure and uncertain commit. Recover unknown outcome only by exact read/replay, not new claim/admission or clock rewrite.
8. Article/readiness boundary: legal cash fact/derived references work; unsupported metadata and misclassified units/periods cannot be cited. Changed numeric/prose/citation/profile requires new review. A perfectly sealed cash package without live financial rights or real independent execution remains not dispatchable/publishable. Native publication integration must later test genuine role/fence/receipt lineage, non-effects on formal catalogs/strategy/paper, and separate rendered read-only output.

## Exact identities

| Artifact | SHA256 / canonical identity |
| --- | --- |
| AUO successor model raw, 113,823 bytes | `6426ba0caaac2a446593a632ebce50f93e7851f4fdb4025ff427c2f011961209` |
| AUO successor canonical | `cf7419b2204419dc1aca590bc355df36bb19600c5beaf2905c6819f5a040b57d` |
| AUO original canonical | `f70ec46f8a7c5dc417f0abd9dbf2668c7bf0bf452a2a1888908f66bafc88abcc` |
| EMC successor model raw, 71,848 bytes | `30028ccf9e48d7cda79f55a8b6ffd5141bad513e277894c8e360479e606b6786` |
| EMC successor canonical | `d10858110edee1dd2760791e00c8b0eea3dc4a80b6d643db70b62216541dc879` |
| EMC original canonical | `19ddd96b6e63809f1f554d37fb2753d4ea20967cd2bafb785ff403ffff17c9be` |
| Cash packet raw, 30,651 bytes | `b3cdd1b865ef31e7df7db715697e6137a0eb5112139d88e8af337ae3f15030a3` |
| Cash packet canonical constant in source | `4371e93dc0b5e5f504413545b299d16f526c52ee42f0bfc00c9965ab148b65e3` |
| Existing complete mapping sourceClosure | `77b1cc06b12d45063af75e976605fb9c4725da60f2c58bd39b28d54028590a41` |

Measured file SHA256 index; paths are relative to the exact checkout above. These files matched source15d4 bytes. Bundle was hashed, not printed as an enormous escaped source string; its constituent schemas/controller were inspected separately.

```text
ebdd79ccf1e9dd8e2edb95b3937f337b06ca15406a1eb811e53e9c3751d4f5e9  openspec/changes/research-first-publication-v2/spec.md
c5a7a3e53eee0f2c41223fef6ee76cd6364904431c05d5e586085887598eaf6c  openspec/changes/research-first-publication-v2/financial-adapter-slice.md
fc299201a7e49dee91416e3105bb3996a13514bc459476443967a7beeec5bd4d  openspec/changes/research-first-publication-v2/financial-adapter-files.json
e0e63848f3a544653e597204d9077a8034827b093eee60990b3f9146339c5e78  openspec/changes/research-complete-input-v2/spec.md
db6add136e9a7e4a23b3df794746e2e7b9d60a9240690739dfd302676e012f59  openspec/changes/research-complete-input-v2/schema-freeze.md
f21e111b4427105ad5220bab3f1a95e7bf5129189df6caefcef9c21ce5a5b9b5  web/src/lib/research-financial-inventory.ts
2f8d8150a3071109d3db2dee9c1df7dadcd97322357c21e8a45fd469df22372d  web/src/lib/research-financial-supplement.ts
298fd61c27900818bd31c63f1ca332722043caa37e7e4ba7cc3edf79ca5d2e49  web/src/lib/research-financial-file-reader.ts
787858e79cc6ed1e87011ca1f9ab6fc144ee8e6d18d9b3a9ff7d52cf72f5a95d  web/src/lib/research-complete-input.ts
ba44549b7efdc14a0c61523dadd950321fd7f85e72b30059415a555629baf704  web/src/lib/research-complete-mapping.json
a13719881d27ddd1295a0adf3a0e25affc4b3e6e77a5691ca82d2f46263b1df5  web/src/lib/research-complete-canonical.ts
ca5bc876d5820c3f910a4847c84f504a952896f7affe5d9e88a9f224df3b0d98  web/src/lib/research-complete-schema-bundles.ts
efedd65c7afcf9031cd34fe6a12d4f70c78dcc1d80cadbddfa87f11b23e57932  web/src/lib/research-complete-2409.schema.json
e0bc5f27a4263d151395fd2fa35a69e868b2d94836b7e26173be545300d6d043  web/src/lib/research-complete-2383.schema.json
e589fd67c08831d650b80cbd091113508c428d2b1a217be31150b682ce37b7cc  web/src/lib/research-business-article.ts
1e75d28e4817504e5511d2780af7dd7ccd91374530c288d31a33f34c15764dfb  web/src/lib/research-business-calculator.ts
0d380225957bce4498b052ec6f5a4458d62b5366f01a845ec6f99077772d49b8  docs/research/2026-10-08-auo-four-segment-model/recompute.mjs
```

No new inventory hash, code closure, schema hash, native receipt or approval is invented here. Their values exist only after a separately owned implementation and exact review. Final read-only check at `2026-10-14T04:18:20Z` still showed exact `ae8bb71744587a57cf49fbd82809d391d9f64169` and an empty `git status --porcelain`. This resumed design review's only persistent output is this report.
