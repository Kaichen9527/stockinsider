# Concrete input material freeze — successor to approved ff677

This is a docs/static-schema slice. Root reported unsigned DESIGN PASS for
`ff677d303e0867a3127e4be383b972691e8cdc30`; its original PROPOSED text is retained
as history. The implementation dependency is now reviewed financial59 in final
integration `75d91024ce365606989bfe42b2d7e6227b65044d`, with maker combined VM
receipt1292cc66. None of this is protected, financial authenticity, role execution
or publication authority. SQL and endpoint changes have not been implemented.

## Concrete internal calculation shape

`financial-material-2409.schema.json` and `financial-material-2383.schema.json`
freeze the **entire nested** internal p_calculation shape, not a generic JSON
column. Every object has exact required keys and additionalProperties:false;
every array has an exact-length tuple of closed index schemas. The two fixed
inventories yield AUO60 reported facts +3 monthly facts +1 derived bridge, and
EMC29 reported facts +3 monthly facts +1 bridge. Each retains actual metric,
period/kind/unit/sign/status, JSON pointer/file hash, PDF location if available,
source clock and observation attribution. Three scenarios each have six ordered
quarters; full-year and next-four-unreported aggregates remain distinct. AUO
Other, Q1 allocation discrepancies and unavailable2025 recast remain present.

For this initial mapping, numeric source facts, assumed inputs, declared gaps
and deterministic numeric results are pinned constants derived from the actual
fixed relay/model outputs. They are **not DB-verified forecasts**. This deliberately
does not admit caller-authored forecast assumptions. Changed artifacts or a new
assumption set require a new reviewed mapping/version. Supported company IDs do
not permit another company's material. Hash/clock regexes are only syntactic;
all relational and recomputed/static bindings below are mandatory.

Each company schema was extracted from the reviewed implementation using a
synthetic in-memory preparation solely to observe shape. No source documents,
financial admission, lease or real role execution were fabricated in a DB for
this extraction. Actual compiled financial HTTP acceptance is separately in
the1292cc66 receipt. JSON schema files are static build-time integrity material:
no runtime caller path, arbitrary schema, import, eval or external $ref resolution.
Per schema<=524288bytes, both<=1048576bytes, fixed SHA/length at code freeze.

Internal p_calculation has exactly:

| Key | Required meaning |
| --- | --- |
| schemaVersion | research-complete-financial-material-v2 |
| symbol | exact2409 or2383 matching preparation |
| artifactReadKnownAt | local calculation completion, finite instant |
| sourceClosureHash | reviewed static dependency mapping, not execution proof |
| artifactInventoryHash | complete pinned company inventory, including model file |
| financialMaterial | exactly projection + calculation, closed schemas |

New material is extracted from the unchanged read-only supplement. Remove its
outer preparation IDs/status/hash/capability wrapper; parent bindings come from
the actual stored preparation. Remove projection.sourceManifestHash and
calculation.inputHash/resultHash/executionCodeHash from the **new copy only**.
Their historical JSON hashing is not relabeled as a v2 canonical digest. The
old supplement, old model, inputManifest and original immutable hashes remain
unchanged. Projection.originalModelCanonicalHash is retained as a pinned
historical assertion under `legacy_raw_result_json_v1`, not recomputed from
material that omits the full model bytes.

## Closed stored envelope and identities

DB constructs exactly the following envelope; HTTP cannot submit any part of it:
schemaVersion, assemblyStatus, evidenceStatus, producerAttribution,
preparation, researchIdentity, priority, originalJob, originalReservation,
sources, financial, hashes, clocks, gaps, capabilities.

- schemaVersion=research-article-input-v2; assemblyStatus=complete;
  evidenceStatus=incomplete; producerAttribution=internal_controller_asserted.
- preparation={id,inputHash}; values must equal original immutable receipt.
- researchIdentity={researchCompanyId,symbol,scope,snapshotHash,mappingDigest,stockId};
  scope=research_observed_v1. stockId is the original optional mapping or null;
  no stocks row is created, renamed, enriched or promoted.
- priority={runId,inputHash,discoveryCutoff}; exact DB-derived original fields.
- originalJob={jobId,attempt,owner,leaseExpiresAt} and
  originalReservation={reservationId,startedAt,leaseExpiresAt}; exact parent
  values, verified again against actual job/attempt/reservation after all locks.
- sources={sealId,manifest,coverage}; sealId is UUID or original null. Manifest
  is the exact original sealed array of {id,rowHash,root,publishedAt,observedAt,rights},
  maximum50. publishedAt is original instant/null; no synthetic date conversion.
  coverage is incomplete. Original empty selection remains empty with a gap.
- financial={artifactInventory,material}; inventory is the full fixed company
  {file,bytes,sha256} tuple,8 AUO or6 EMC, with model included. material is exactly
  p_calculation.financialMaterial. No sourceNumericLines, raw PDF, absolute local
  path, request executable, fact ID or trusted source UUID is minted.
- hashes={preparationInputHash,artifactInventoryHash,modelHistoricalCanonicalHash,
  sourceManifestHash,projectionHash,scenarioInputHash,resultHash,sourceClosureHash};
  all are SHA256. DB recomputes every new digest over included bytes; fixed
  model historical hash is compare-only against the reviewed static map.
  sourceManifestHash here hashes financial.material.projection.sourceManifest;
  sources.manifest keeps its separate existing PG source-seal row hash namespace.
- clocks={originalModelCutoff,originalPreparationAdmittedAt,artifactReadKnownAt,
  financialAdmittedAt,researchCutoff}. Last two equal the single actual DB clock
  sampled after final locked validation. Neither is a commit timestamp.
- gaps is a unique bounded tuple of {namespace,reason}; namespaces are source,
  financial,identity,execution. Maximum24. Required reasons include source
  coverage incomplete, financial_source_live_rights_unverified, no normalized
  verification, unavailable reported-YTD-plus-forecast bridge, capacity/yield/
  ASP/orders not_quantifiable and trusted role execution unavailable. No arbitrary
  caller string. Empty-source selection adds sources_not_selected.
- capabilities has exactly financialVerified,dispatchReady,modelDispatched,
  publishableResearch,researchQualified,strategyApproved,entryEligible,
  historicalPITEligible, all false. Successful private assembly does not endorse
  the source claims, forecast or trade.

UUID/hash/string formats follow the approved closed ingress. Owner uses the
existing safe owner domain, max160. URLs/rights come only from exact parent
manifest; no new URL grant. No string contains NUL or invalid Unicode scalars.
All numeric fields are finite and satisfy the fixed company tuple/domain;
unknown fields, wrong units/signs/periods or swapped locators reject.

## Canonical v2 bytes

`canonical-vectors.json` freezes15 target vectors and their UTF8 lengths/SHA256.
Actual JS/PG parity tests are still pending implementation; these are targets,
not claims that PG was run in this docs slice.

Use a typed, whitespace-free JSON node encoding:
null=["n"]; boolean=["b",value]; number=["d",plainDecimalString];
string=["s",value]; array=["a",orderedNodes];
object=["o",[[key,node],...]]. Object keys sort by UTF8 byte order, corresponding
to PG COLLATE C, rather than JS default UTF16 order. Strings retain Unicode
scalar sequences without NFC/NFKC normalization; composed/decomposed accents
remain different. JSON string escaping is standard, not a whitespace replace.
Finite numbers use the exact value of the shortest JS JSON.stringify transport
token: expand exponent, strip redundant fractional trailing zeros, normalize
negative zero to0. PG numeric reconstruction uses that exact decimal value.
Fixed numeric schema constants prevent a service-role higher-precision decimal
from masquerading as a different JS result. NaN/Infinity reject before encoding.
The U+E000/emoji ordering vector intentionally differs from UTF16 sorting.

All new request/material/row hashes use this explicitly versioned encoding.
Existing preparation/source-seal/model hashes retain their old encodings.
Depth<=12 applies to semantic JSON before tagging. p_calculation serialized JSON
<=262144UTF8bytes; projection<=160000; exact file and aggregate bounds from the
financial adapter remain524288/1048576bytes. No truncate-success. Final stored
payload canonical bytes plus canonical internal request bytes consume the same
original4/524288 cap with preparations, including permanently retained history.
Larger tagged representation is charged, not free metadata. Old preparation
charges retain their original values; both RPCs count the same union under the
same global lock. Exact replay is checked before new admission/counting.

## Dependency identity and clocks

`calculator-source-closure.json` recursively binds all14 local static runtime
imports/export-from modules from the reviewed supplement entry,139197bytes;
type-only imports excluded, external/builtin imports named separately. Seed
sourceClosureHash=`322174373cd069c30c5d5a4ef675fce63e7dacd189e872a011554e9a441a9a50`.
This is the **existing seed closure**, not the future complete-input implementation
closure. Add the actual new canonicalizer/validators/adapter and any runtime
imports at code freeze, plus package-lock/tool/build identity. It must then match
the exact reviewed SQL/server mapping. expectedCalculatorExecutionHash compares
that frozen mapping, never a caller-selected function or legacy toString hash.
Compiled build provenance is separate; neither hash proves a model or reviewer
ran. Original model wrapper transitive dependency remains bound by the actual
byte inventory; current recomputation uses the fixed shared pure calculator.

Local calculation.researchCutoff, projected.researchCutoff, observation.admittedAt
and fact.locallyReadAt are the one local read/calc clock, distinct from final
DB financialAdmittedAt/researchCutoff. Preserve original source availability
floors, EMC extraction later than raw PDF observation, actual publication
precision, AUO10:20UTC and EMC12:12UTC model cutoffs. New DB-facing clocks permit
at most6fractiondigits; reject higher precision instead of truncating ordering.
Source<=local artifactReadKnownAt<=final DB admission; preparation freshness120s
is checked only for a new admission after locks. Exact replay retains old clocks
and does not regain freshness or a new lease. Shared10000ms monotonic deadline
covers RPCs/read/compute/serialization/confirmed close/last admission/response.
Pending ownership recovery gate from reviewed59 is retained; abort is not kernel
IO cancellation, cleanup uncertainty cannot produce success or new file work.

## Ingress implementation decision requiring exact review

To preserve legacy/default body contracts while bounding new actions before
parsing, the new accepted v2 transport will require the explicit fixed header
`X-Research-Input-Version: 2` on the same guarded POST endpoint, Content-Type
application/json. Authentication precedes reading. That marked branch accepts
only sealResearchInput/readResearchInputRevision and uses actual bounded8192byte
stream + strict UTF8/duplicate-key parser. A marker with any other value/action
rejects before calculation/SQL. Unmarked legacy handlers keep their existing
contracts and cannot accept the new actions. This is a transport discriminator,
not identity, qualification or permission. No blanket legacy-ingress boundedness
is claimed. Body request keys remain exactly the ff677 list; marker is not part
of semantic request hashing. This narrow transport detail and concrete schemas
must be independently reviewed before endpoint/SQL implementation is frozen.

Remaining required acceptance: actual JS/PG vectors, all closed-shape tamper
cases, original freshness/rights/lease concurrency, old-prepare versus seal
shared cap race, read-first replay/restart and non-effects. No skipped or mock
acceptance will stand in for these. No v2 role/bundle/outbox/publication is complete.
