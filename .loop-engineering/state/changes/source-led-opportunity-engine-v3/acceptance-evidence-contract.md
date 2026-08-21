# Acceptance Evidence Contract: source-led-opportunity-engine-v3

Version: `opportunity-acceptance-evidence-v3.13.0`

This contract is the single executable owner/classification and CI-result authority
for canonical acceptance inventory `1.46.0`. The five descriptive fields in
`acceptance-tests.json` remain the human-readable requirement oracle and serialize
`evidenceContractVersion`, expected counts and the same ordered `classificationRules`
below. The meta-test byte-compares that machine copy to this contract-derived object
and to the exhaustive owner tuples in the same JSON file.

## Closed 320-ID classification

Apply the first matching rule:

1. exact IDs `GOV-001|GOV-002|GOV-003|GOV-004|HYB-006|HYB-007` are
   `structural_meta`, track `product_runtime`;
2. prefixes `OUT-|EVAL-` plus exact `HYB-005` are `semantic_automated`, track
   `evaluation_governance`;
3. prefixes
   `ACT-|CMP-|CYC-|ENT-|FIN-|FNL-|MKT-|PEER-|SCR-|SRC-|VAL-` are
   `semantic_automated`, track `product_runtime`;
4. prefix `MR3-` is `semantic_suite_backed`, track `model_runner`;
5. prefixes `API-|AUTH-|CAL-|DI-|MIG-|MOD-|OPS-|PCR-|REC-|SEC-` and exact
   `HYB-001|HYB-002|HYB-003|HYB-004` are `semantic_suite_backed`, track
   `product_runtime`.

No fallback exists; any unmatched/overlapping ID fails registry construction. These
five rules byte-match the five serialized `classificationRules` entries in
`acceptance-tests.json`; no implicit rule split is allowed.

This must yield exactly:

```json
{"semantic_automated":143,"semantic_suite_backed":171,"structural_meta":6}
```

Verification partition remains exactly:

```json
{"evaluation_governance":20,"model_runner":28,"product_runtime":272}
```

Every canonical ID occurs once in both classifications; union is 320 and intersections
are empty. The meta-test computes these counts from actual inventory IDs rather than a
hard-coded pass result.

## Protected V3.13/V3.14 decision partitions

`DI-001..DI-011` are first-class canonical IDs in the protected `product_runtime`
partition. Each resolves through an ID-specific owner handle to one exact TAP name in
`v313-decision-integrity.test.mjs`; none is a supplement, optional diagnostic or
uncounted package-script side effect. Every owner executes once with zero skip/todo.
`REC-001..REC-012` use the same first-class rules and bind to exact TAP names in
`v314-actionability-recovery.test.mjs`.

## Executable owner and command

`acceptance-tests.json.ownerRows` is the mandatory exhaustive owner map. It contains
exactly 320 strict ASCII-ID-sorted tuples:

```text
[id,classification,track,ownerRef,mandatoryCommand]
```

The RFC 8785 bytes of that array have the digest serialized in
`acceptance-tests.json.ownerRowsSha256` and verified against the immutable inventory.
Every inventory ID occurs exactly once; classification/track must equal the five rules,
`ownerRef` is exactly `<tracked-source-path>#acceptance <ID>`. It is the stable,
ID-specific owner handle, not a substring probe. For every non-PCR suite-backed row,
the sole code-owned `suiteOwnerVariants` resolver maps that handle to one exact
`[tracked-source-path,exact TAP test name]` pair; it must map all and only the 140
non-PCR suite IDs, with no duplicate ID. PCR-001 through PCR-031 resolve directly to
their exact `acceptance <ID>` TAP tests in `product-correctness.test.mjs`. The resolved
named TAP test must execute exactly once, have zero skips/todos and pass except for the
explicit preimplementation RED baseline below. The executable registry must deep-equal
all 320 tuples, resolve every suite handle and reproduce the digest; implementation
cannot choose, alias or infer an owner.

The tuple families are:

| ID class | Owner | Mandatory command |
|---|---|---|
| product `semantic_automated` and six structural IDs | `scripts/opportunity-v3/acceptance-traceability.test.mjs` case-specific executor | `protected://stockinsider-v3-gate-root/execute-track --track product_runtime` |
| `OUT-*|EVAL-*|HYB-005` | same file, case-specific evaluation executor | `protected://stockinsider-v3-gate-root/execute-track --track evaluation_governance` |
| `API-*|MOD-*|HYB-001..004` | `web/src/lib/opportunity-v3/opportunity-v3.test.ts#acceptance <ID>` | exact full `test:source-led-opportunity-v3` value below |
| `AUTH-*|CAL-*|MIG-*|OPS-*|SEC-*` | `scripts/opportunity-v3/migration-contract.test.mjs#acceptance <ID>` | exact full migration-test value below |
| `MR3-*` | `scripts/model-runner-v3/model-runner-v3.test.js#acceptance <ID>` | exact full model-runner-test value below |
| `PCR-*` | `scripts/opportunity-v3/product-correctness.test.mjs#acceptance <ID>` | exact full product-correctness-test value below |
| V3.13 `DI-001..011` | `scripts/opportunity-v3/v313-decision-integrity.test.mjs#<exact TAP name>` | protected product-runtime track plus exact full product-correctness-test value below |
| V3.14 `REC-001..012` | `scripts/opportunity-v3/v314-actionability-recovery.test.mjs#<exact TAP name>` | protected product-runtime track plus exact full product-correctness-test value below |

For every ID, the resolved exact owner test name must execute exactly once and pass in
its tuple's command TAP output. Distinct IDs have distinct logical owner refs even
when they share an underlying semantic test. A source regex, arbitrary token assertion,
file-exists assertion, null executor, skipped/todo test or unexecuted named variant is
not semantic evidence.

`PCR-001` through `PCR-031` use one exact, test-owned fixture for each canonical
`[id,requirement,layer,setup,expected]` tuple. The immutable active
`pcr-implementation-boundaries-v3.json` binds each fixture to one implemented owned
operation, exact module/export, distinct caller boundary and state/effect. It does
not permit an unrelated symbol to stand in for the behavior. Test-only
`*-semantics` modules, marker imports, same-file token matches and caller-supplied
expected envelopes are prohibited.

The historical preimplementation baseline was intentionally RED with
`PCR_IMPLEMENTATION_PENDING`. Ordinary Code Gate execution now requires all 31 named
tests to execute the declared real caller/result boundaries and pass; a partial
vector, stub result or test-only adapter remains forbidden. Exact-commit closure also
requires the fulfillment record below.

The fulfillment record is a non-active RFC 8785 JSON file at the exact-review evidence
path `pcr-fulfillment-record-v1.json`. It has exactly:

```ts
type PcrFulfillmentRecordV1 = {
  schema: 'source-led-opportunity-pcr-fulfillment-record-v1';
  implementationCommitSha: string;
  implementationTreeSha: string;
  activeGraphSha256: string;
  reviewedRange: string;
  entries: PcrFulfillmentEntryV1[]; // exactly PCR-001…PCR-031, in order
  recordSha256: string;
};
type PcrFulfillmentEntryV1 = {
  id: string;
  fixtureSha256: string;
  owner: { path: string; export: string };
  caller: { path: string; function: string };
  resultDependency: {
    consumerPath: string;
    consumerFunction: string;
    kind: 'persisted_row'|'returned_value'|'serialized_response';
  };
  execution: {
    commandName: string;
    commandSha256: string;
    testName: string;
    stdoutSha256: string;
    exitCode: 0;
    passed: number; // positive
    failed: 0;
    skipped: 0;
    todo: 0;
  };
};
```

`recordSha256` hashes the same object without that member. Each entry's fixture/owner/
caller must deep-equal the immutable planned boundary at the reviewed active graph, the
owner and caller paths must differ, and its result dependency must be the declared
caller. The exact-review evidence tree is the only allowed writer location; Code Gate
must reject a missing, stale, unrelated, token-only, noncanonical or digest-mismatched
record before aggregate success.

The historical Round 85 Requirements baseline used the fixture-bound
`preimplementation_pending/full_canonical_runtime_behavior_not_implemented`
disposition. That historical plan-ownership result is never semantic product evidence
and is not a valid current implementation state. Its executable bytes belong only to
the immutable historical Round 85 tree; the current traceability runner must not set a
preimplementation environment mode or accept a baseline marker. Current ordinary
execution runs every implemented owner/caller/result-dependency boundary, requires the
named test to pass with no skip/todo, and separately binds its exact-commit fulfillment
record. Thus historical RED evidence cannot satisfy the current Code Gate.

The ordinary product-correctness command dynamically
invokes every distinct named product behavior, and all 31 current named TAP tests must
pass through their real caller/result boundaries. Product implementation may replace
the executable test bytes with
the real case-specific behavior without changing the static fixture/boundary contract.
Consequently the structured Requirements baseline is executable but cannot be mistaken
for a Code Gate or Verification PASS.

The meta-test rejects:

- inventory version/count/Markdown parity mismatch;
- missing, extra or duplicate ID;
- classification count/partition mismatch;
- owner source/test-name absence;
- command/track mismatch;
- zero or nonzero unexpected TAP skips/todos;
- a suite summary whose named owner did not pass;
- active contract/amendment catalog/version/hash mismatch;
- task/status next-work contradiction.

The active artifact catalog is exactly the tracked bytes of
`active-artifact-catalog-v3.json` declared below. GOV-004 is valid only through the
protected reviewer-owned `stockinsider-v3-gate-root` described by
`external-gate-harness-contract.md`. That authority owns the first checkout/tree/clean
state/harness-result validation outside the PR. Candidate-side
`acceptance-gate-runner.mjs` and `acceptance-traceability.test.mjs` may recheck a closed
subject after the protected harness selects it, but are defense in depth only. Direct
execution or a `git show HEAD` pipeline is diagnostic feedback, not gate evidence.
Implementation-test code hashes are deliberately absent from the Requirements active
graph; static fixtures and planned PCR boundaries are the immutable requirement graph.

The active graph oracle validates the two canonical authority tags below, ASCII order,
duplicate and active-graph closure,

<!-- GOV-004-AUTHORITY {"catalogBytes":5659,"catalogSha256":"7aae892590bf4604ead4bea422294bba38435797be6d66f6ff50dec3200037e3","kind":"evidence-catalog-identity"} -->
<!-- GOV-004-AUTHORITY {"activeFiles":51,"kind":"evidence-file-owner-topology","owners":41} -->

then recomputes every `[path,blobOid,byteLength,sha256]` row and compares the result to
the frozen active-graph SHA embedded in the executable oracle. It independently perturbs
catalog bytes plus every member of every blob row (path, OID, byte length and SHA) and
requires each digest to differ. This includes `design.md` as the Architecture subject,
the taxonomy/host fixtures, both acceptance files and all four amendments; no prose glob
is a competing catalog. Mutating the design alone must change the active graph and
invalidate any older Architecture evidence.

The canonical authority-tag grammar is closed: each expected tag is extracted
exhaustively, must occur once only and must equal catalog authority. The oracle rejects
a missing, duplicate, non-canonical or conflicting tag and any untagged lexical variant
of catalog identity, graph topology or PCR ownership after normalizing case, field order
and harmless punctuation, including a bounded PCR owner-name/three-part-version pair in
either order. A literal `v` version is authority-like. A bare three-part version is
authority-like if and only if a direct closed declarator (`=`, `:`, `is` or `equals`)
joins it with the shortened or full PCR owner in either order, or its bounded pair
carries `authority`, `owner` or `version` context; non-authority date/activity prose
remains permitted.

## Code Gate commands

`product-runtime-code-gate` runs all of the following in a clean checkout of the exact
candidate commit and fails on the first nonzero/skip/todo/incomplete result:

1. product-track traceability command above, reconciling exactly 260 registered IDs;
2. `npm run test:source-led-opportunity-v3`;
3. `npm run test:source-led-opportunity-v3:product-correctness`;
4. `npm run test:source-led-opportunity-v3:migration`;
5. `npm run test:legacy-v1-v2-regression`;
6. `npm run typecheck:source-led-opportunity-v3`;
7. `npm run lint:source-led-opportunity-v3`;
8. `npm run build:source-led-opportunity-v3`;
9. `npm --prefix web run test:e2e:v3-correctness`, whose reviewed Playwright project
   contains keyboard, VoiceOver semantic-tree, 200% zoom, 320px, reduced-motion and
   light/dark cases with zero skip/todo;
10. `npm run test:source-led-opportunity-v3:performance`, the exact harness from
    `legacy-radar-correctness-contract.md`.

`acceptance-tests.json.scriptValueRows` is the exact strict ASCII-key-sorted
`[packageScriptKey,fullValue]` authority. Root package keys are literal; a Web key is
written `web:<web-package-script-key>` and resolves only against `web/package.json`.
Its 14-row RFC 8785 bytes and SHA-256 are frozen in the canonical inventory. It freezes
the root build/lint/typecheck/doctor, legacy regression, model runner,
ordinary/migration/product/performance tests, product/evaluation/model gates and the Web
Playwright value. The meta-test parses root and Web `package.json`, asserts the exact fourteen-key
set, deep-compares every value and requires every candidate-side command to expand through
this table. A missing key, extra gate alias, glob substitute or locally typed command
is not evidence. The protected harness validates the envelope and executes its own
registry-pinned command catalog; it does not trust an npm script as bootstrap authority.

`model-runner-code-gate` first validates a protected external `model_runner` attestation,
then runs the model track traceability reconciliation for exactly 28 IDs,
`npm run test:model-runner-v3`, then
`npm run v3:doctor -- --expect-mode disabled --require-host-pin
model-runner-host-pins-v3.10`; doctor must reproduce the fixture's exact
`codex-cli 0.148.0-alpha.21` bytes and report deployment mode disabled. It is a
required Code Gate input when a Code Gate is assembled; it is deliberately collected
on the pinned self-hosted runner rather than represented as a skipped pull-request
aggregate job.

Candidate-side model execution receives no host credential and conditionally registers
only the thirteen non-live tests, so its TAP has zero skipped/todo. A credentialed
protected-base oracle executes the remaining two live tests only after proving the
complete model-runner implementation/test/host-pin blob listing is byte-identical to
the exact subject. The 28 reported passes are parsed from the acceptance trace owner;
mandatory suite/oracle pass counts are checked independently and are not substituted for
or added to the registered acceptance partition.

`evaluation-governance` runs exactly the full
`verify:source-led-opportunity-v3:evaluation-governance` value frozen above: the
20-ID traceability command, the two named point-in-time product/evaluation tests, then
`evaluation-governance-gate.mjs --require-backtest-dates 120
--require-live-dates 20 --require-attempt-roster 252`. It
emits `blocked/non_fabricated_elapsed_cohorts_unavailable` when the immutable real
120-date/20-live-date cohorts are not yet available; it cannot synthesize or backfill
elapsed observations. That honest blocker is neutral for the Code Gate and blocking
for Promotion Gate.

The pull-request workflow has one diagnostic product/runtime check. It does not aggregate
an unscheduled self-hosted model runner, and records evaluation governance as non-blocking
diagnostic evidence because an honest cohort blocker is expected before Promotion. The
protected external harness creates the authoritative Code Gate aggregate only after
separately collected Requirements, Architecture, product/runtime, model-runner and
exact-review evidence all bind the same reviewed commit/tree; absence or a skipped model
input fails that aggregate.

## Reviewed graph and code identity

For a Git tree `T`, parse the exact tracked `active-artifact-catalog-v3.json` from
`T`. For each catalog `activeFiles` path, resolve the regular blob in `T` and create
one row `[path,gitBlobOid,byteLength,sha256]`, preserving the catalog's strict ASCII
path order. `sha256` hashes the exact blob bytes. The canonical active-graph preimage
is:

```text
["opportunity-active-graph-v1",catalogTrackedSha256,orderedBlobRows]
```

`activeGraphSha256` is lowercase SHA-256 of its RFC 8785 UTF-8 bytes. A missing,
non-blob, extra, reordered, hash/length/OID-mismatched catalog member fails. This
identity binds exact content, not only owner version labels.

Requirements and Architecture may review an earlier immutable tree because their
evidence must be written afterward and implementation later changes non-catalog
code. Their PASS is reusable for a subject commit only when:

1. the review's `reviewedTreeSha` resolves exactly and reproduces
   `reviewedActiveGraphSha256`;
2. `evidenceTreeSha` differs from `reviewedTreeSha` only at the ASCII-sorted
   `evidenceOnlyPaths`;
3. those paths are exactly the applicable
   `requirements-review-round-<N>.md|architecture-review-round-<N>.md` plus any
   actually changed subset of `status.json|tasks.md|gate-summary.md`;
4. no evidence-only path is in `activeFiles`;
5. the evidence file bytes/digest in `evidenceTreeSha` equal the bytes later carried
   by the subject commit; and
6. the subject commit's recomputed `activeGraphSha256` equals
   `reviewedActiveGraphSha256`.

No other cross-tree exception exists. Exact review binds code rather than only the
graph: `reviewedHeadOrTreeSha=commitSha`, `reviewedTreeSha=treeSha`, and
`reviewedRange` resolves to the exact reviewed parent/range. Its non-null
`evidenceCommitSha` is the sole direct child of `commitSha`; the evidence commit's
tree is `evidenceTreeSha` and differs by exactly
`exact-commit-review-final.md|runtime-review-attestation.json|pcr-fulfillment-record-v1.json`
under this change directory. The review carries the fulfillment path/digest and the
validator resolves the record from that evidence tree before accepting exact review. An
implementation, repair, generated file or fourth evidence path invalidates the
exception.
Every path named in this section serializes as its canonical repository-relative path
under `.loop-engineering/state/changes/source-led-opportunity-engine-v3/`; basenames
above are shorthand only.

## Canonical CI evidence

Each check writes canonical RFC 8785 `opportunity-gate-result-v1`:

```ts
type GateCommandResultV1 = {
  name:string;
  command:string;
  exitCode:number;
  passed:number;
  failed:number;
  skipped:0;
  todo:0;
  stdoutSha256:string;
  stderrSha256:string;
};
type GateReviewEvidenceV1 = {
  evidencePath:string;
  reviewedBaseSha:string;
  reviewedHeadOrTreeSha:string;
  reviewedTreeSha:string;
  reviewedRange:string;
  reviewedActiveGraphSha256:string;
  evidenceCommitSha:string;
  evidenceTreeSha:string;
  evidenceOnlyPaths:string[];
  verdict:'PASS';
  p0:0;
  p1:0;
  evidenceFileSha256:string;
  pcrFulfillmentPath:string|null;
  pcrFulfillmentSha256:string|null;
};
type GateAggregateInputV1 = {
  check:'requirements'|'architecture'|'product-runtime-code-gate'|
    'model-runner-code-gate'|'evaluation-governance'|'exact-review'|
    'code-gate-aggregate'|'shadow-activation-gate';
  evidenceSha256:string;
};
type GateResultV1 = {
  schema:'opportunity-gate-result-v1';
  check:'requirements'|'architecture'|'product-runtime-code-gate'|
    'model-runner-code-gate'|'evaluation-governance'|'exact-review'|
    'code-gate-aggregate'|'shadow-activation-gate'|
    'promotion-gate-aggregate';
  commitSha:string;
  treeSha:string;
  activeGraphSha256:string;
  status:'pass'|'fail'|'blocked';
  blockedReason:null|'non_fabricated_elapsed_cohorts_unavailable'|
    'production_authority_not_granted'|'shadow_activation_not_executed'|
    'external_harness_attestation_unavailable';
  acceptanceVersion:'1.46.0';
  partition:null|'product_runtime'|'model_runner'|'evaluation_governance';
  registeredCount:number;
  executedCount:number;
  scriptValueRowsSha256:string;
  commandCatalogSha256:string|null;
  cwdMode:'verified-subject-checkout-root'|null;
  commands:GateCommandResultV1[];
  review:GateReviewEvidenceV1|null;
  inputs:GateAggregateInputV1[];
  evidenceSha256:string;
  completedAt:string;
};
```

`evidenceSha256` hashes the same object with that member omitted. A pass requires all
commands exit 0, failed/skipped/todo zero, and `registeredCount=executedCount` for its
partition. Requirements/Architecture/exact-review have non-null `review`, empty
`inputs`, and prove the applicable graph/code and evidence-only rules above,
including file bytes/digest, base/head/tree/range, evidence tree/commit/path set and
P0/P1. Requirements/Architecture set both fulfillment members to null. Exact review
sets both non-null and proves the closed 31-entry record above. Non-review leaves
`review=null`; it independently recomputes
`activeGraphSha256` from its subject tree. Non-aggregate leaves `inputs=[]`.

For `status='pass'`, the compatibility validator requires the exact gate policy rather
than merely equal nonzero counts: Requirements/Architecture/exact-review and aggregate
checks are `partition=null, registeredCount=0, executedCount=0, commands=[]`;
product/runtime is exactly `product_runtime,260,260` with sole command
`product-runtime-track` / `protected://stockinsider-v3-gate-root/execute-track --track product_runtime`;
model runner is exactly `model_runner,28,28` with `model-runner-track`; and evaluation
is exactly `evaluation_governance,20,20` with `evaluation-governance-track`. Each sole
track command reports exactly its track's passed count and zero failed/skipped/todo.
An arbitrary `protected-harness` label, `true` substitution, stale acceptance version,
one-of-28 model result or generic count equality is not compatible evidence.

The required protected check-run names are `requirements`, `architecture`,
`product-runtime-code-gate`, `model-runner-code-gate`, `exact-review` and
`code-gate-aggregate`. `code-gate-aggregate.inputs` are exactly, in this order, `requirements`,
`architecture`, `product-runtime-code-gate`, `model-runner-code-gate`,
`exact-review`; every digest resolves to a canonical evidence object with pass and the
same subject commit/tree/active-graph/script-row identities. Aggregate validation
recomputes every nested review binding, including evidence-only diffs and exact-review
range/child identity plus every PCR fulfillment fixture/owner/caller/execution; comparing
outer fields alone is invalid. Commands are empty.
`promotion-gate-aggregate.inputs` are exactly
`code-gate-aggregate,evaluation-governance` under the same rules. Any omitted,
additional, reordered, digest-mismatched or cross-tree input fails. The Code aggregate
does not consume
`evaluation-governance`, so honest blocked maturity cannot create an impossible PR
aggregate. `promotion-gate-aggregate` is not a required PR check and passes only when
the same Code Gate passes plus evaluation governance passes with real cohorts. A
blocked evaluation can never be serialized as pass or full product verification.

`shadow-activation-gate` is a separate operational gate and is never a required PR
Code check or a Promotion input. Its `inputs` contain exactly the passing
`code-gate-aggregate` digest for the same commit/tree/active graph.

Its command catalog is the RFC 8785 array of
`[name,argv,environmentPairs,cwdMode]`, where every string is used as literal UTF-8 bytes,
`argv` is passed directly without a shell, and environment pairs replace rather than
extend the ambient environment. `cwdMode` is always the literal
`verified-subject-checkout-root`. The exact 1,215-byte catalog is:

```json
[["shadow-migration-rehearsal",["/usr/local/bin/node","scripts/opportunity-v3/shadow-activation-gate.mjs","migration-rehearsal"],[["NODE_ENV","test"],["SOURCE_LED_OPPORTUNITY_V3","disabled"],["TZ","UTC"]],"verified-subject-checkout-root"],["shadow-runtime-installation-rehearsal",["/usr/local/bin/node","scripts/opportunity-v3/shadow-activation-gate.mjs","runtime-installation-rehearsal"],[["NODE_ENV","test"],["SOURCE_LED_OPPORTUNITY_V3","disabled"],["TZ","UTC"]],"verified-subject-checkout-root"],["shadow-runtime-doctor",["/usr/local/bin/node","scripts/opportunity-v3/shadow-activation-gate.mjs","runtime-doctor"],[["NODE_ENV","test"],["SOURCE_LED_OPPORTUNITY_V3","disabled"],["TZ","UTC"]],"verified-subject-checkout-root"],["shadow-disabled-web-smoke",["/usr/local/bin/node","scripts/opportunity-v3/shadow-activation-gate.mjs","disabled-web-smoke"],[["NODE_ENV","test"],["SOURCE_LED_OPPORTUNITY_V3","disabled"],["TZ","UTC"]],"verified-subject-checkout-root"],["shadow-rollback-lock-verification",["/usr/local/bin/node","scripts/opportunity-v3/shadow-activation-gate.mjs","rollback-lock-verification"],[["NODE_ENV","test"],["SOURCE_LED_OPPORTUNITY_V3","disabled"],["TZ","UTC"]],"verified-subject-checkout-root"]]
```

Its SHA-256 is
`9224cc76f0aada2a2c678d27f71ed92a93c5c2cc37a9b4b4a90a831afe40a5c4`.
Only `shadow-activation-gate` has that non-null `commandCatalogSha256`; every other
gate has null; only Shadow has `cwdMode='verified-subject-checkout-root'`, and every
other gate has null. Each `GateCommandResultV1.name` equals the tuple name and `command`
equals its argv joined by one U+0020; because every token is nonempty ASCII without
whitespace or shell metacharacters, this projection is injective. The first argv
member is the exact pinned Node path from `model-runner-host-pins-v3.json`; no PATH
lookup occurs.

Before any command, the gate creates or resolves one detached clean checkout of
`commitSha`, obtains its absolute lexical root without a caller-controlled path,
rejects every symlink in the root ancestry, and verifies `HEAD=commitSha`,
`HEAD^{tree}=treeSha`, an empty tracked/untracked porcelain status, and that the
relative script is a regular tracked blob whose mode/hash equal that exact subject
tree. It uses that same verified absolute root as the native process `cwd` for all
five direct argv spawns and rechecks HEAD/tree/status/script identity before every
spawn and after every child exit. Alternate cwd, a second checkout, path traversal,
symlink substitution, dirty bytes, an otherwise identical script outside the
checkout, or a root mutation is zero-execution gate failure. The absolute host path
is intentionally not portable evidence; the catalog binds its closed verification
mode, while the gate evidence binds the verified commit/tree and rechecked script
blob. Command results are
in tuple order, with no missing, additional or duplicate row. Ambient environment,
shell expansion, alternate Node, reordered environment, name/argv/env/cwd-mode
mutation or a digest mismatch fails before execution.

The five tuple operations mean, in order:

1. additive migration apply-twice and catalog rehearsal against the clean fixture;
2. tracked runtime installer first-activation and prior-release rollback rehearsal;
3. `runtime doctor` with disabled mode, exact producer/consumer compatibility and no
   scheduler mutation;
4. read-only disabled-Web smoke, including exact V3 disabled 404/zero-query;
5. rollback-lock and scheduler-catalog byte/hash verification.

Every command must exit zero with no skip/todo before status may be `pass`. The gate
also binds migration artifact SHA, installation/rollback-package SHA, disabled
deployment source SHA, doctor evidence SHA and smoke/rollback evidence SHAs through
the command stdout digests. Running those commands against fixtures does not grant
production authority. Before explicit production database/runtime/scheduler
authority it serializes `blocked/production_authority_not_granted`; when the
rehearsal evidence itself has not run it serializes
`blocked/shadow_activation_not_executed`. It never consumes, fabricates or substitutes
elapsed Promotion cohorts.
