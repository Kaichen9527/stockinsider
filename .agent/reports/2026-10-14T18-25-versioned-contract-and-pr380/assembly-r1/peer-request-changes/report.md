# Publication26 release assembly / ordinary workflow independent delta review

Verdict: **REQUEST_CHANGES, scoped P0=0 / P1=0 / P2=1**. Unsigned model-agent review of Root's assembly, source index, handoff and new ordinary workflow. This is not an independent approval of the inherited tail engine/guard/SQL that this reviewer authored, not a full-range formal release attestation, and not production authorization.

Subject: `47fe9fe39600f2012940865be16743a441c18111`; tree `6b85ecd34578cb65c045280c66cc4e814c053933`. Base approved main `1f152fdf43add6bc7f97a00d7e36a7e8cfc105d4`. New review branch `codex/publication-tail-assembly-review-oct14`. Work window 2026-10-14T10:01:25Z–10:13:25Z. Candidate source was not changed.

## P2: workflow paths omit six actual transitive runtime dependencies

Location: `.github/workflows/research-publication-tail-quality.yml:4–13` (notably the sole scripts subtree at line6).

Both new native tests import `apply-reviewed-migrations.mjs` at their line3. That module lines18–20 requires `../runtime/codec`, `../runtime/credential-resolver` and `../runtime/reviewed-runtime-release`; the latter imports additional modules. An actual isolated Node22.14 import (no PG connection, no source mutation) recorded these six loaded files in `require.cache`:

- `scripts/runtime/auth-source-worker-installation.js`
- `scripts/runtime/codec.js`
- `scripts/runtime/credential-resolver.js`
- `scripts/runtime/reviewed-runtime-release.js`
- `scripts/runtime/runtime-health.js`
- `scripts/runtime/tracked-runtime-bundle.js`

All six are also retained exact dependencies in the historical native input manifests. None matches the new workflow's pull_request paths. Concrete changed-path counterexample: a PR changing only `scripts/runtime/codec.js` yields `actualWorkflowWouldSelect:false`, despite both native suites loading it. A dependency's import/export or initialization regression could therefore break these native suites without this new ordinary check running. Other product workflows may execute; that does not register the new tail native entries there.

Minimal suggested correction, for maker review: include `scripts/runtime/**` or the exact six paths in this ordinary workflow's paths. Preserve permissions, pins, timeout, commands and all assertions. No protected workflow or runtime alteration is needed. This reviewer did not apply the correction. This is a demonstrated selection gap, not a claim that current native execution fails.

Reproduction evidence: `dependency-trigger-probe.mjs`, `actually-loaded-runtime.json`, `dependency-trigger-counterexample.json`, `raw/import-load.*`. Parsed workflow uses PyYAML BaseLoader to preserve the YAML `on` key. Path matching for these simple positive literal/** patterns is unambiguous; no negation/re-inclusion rules are present.

## Assembly and dependency checks actually completed

- Full base→subject range is44 files. All41 indexed copies independently match their declared origin bytes, SHA256 and Git blob:39 from `0fe5d5a90ae95949eec1fb3dd9433359db466d88`, two from `7309fba04e0ae3bb7800bd2aad11e5992b91020d`.
- All26 SQL files also match BOTH `15d4ef54ec3f0fc8ab0e5c71111ed2baf2843ccb` and `2e078dfdd74272d3d50dffdd4cc6c14df3152c78`:52 exact comparisons. Ordered tail SHA remains `edc46d48235d1542426c2ba729e24265d1722d757070a8ed5f97061ec843798e`; descriptor file SHA `9410e8f3391c372439fc1f970214c69f1cfd9cb0a4cbebb324364bc493b349fe`. Pure tests verify the ordered calculation.
- All2146 tracked base files are unchanged. This proves original48/49/50 lists, installer/operator/peer/HBA/authority/pins/locks/financial and protected/oracle/trust files are unchanged, not merely a spot check. Web tree is unchanged `c516655efaac8260b1bcf5938f8f4d65ab61ad44`.
- Compared both historical native manifests:249 total entries,240 retained exact entries,121 unique retained paths. Nine absent entries represent five unique intentional omissions: three historical handoffs and two superseded baseline-capture/unguarded-native entries. No retained input differs. Details are in `historical-native-input-comparison.json`; do not describe249 as249 unique tests or240 as all manifest entries.
- Forty static relative JS imports in copied files resolve. Profile, inventory, baseline, fixed descriptor, captured schema/bootstrap and inherited financial inputs remain present and exact. The actual CommonJS transitive load probe additionally confirms the six runtime imports above.
- The only new Root-authored files are the workflow, source index and release handoff. Read all three and inspected copied runtime/native import/artifact boundaries. Exact-copy verification across the full44-file range is not a fresh independent semantic audit of all copied SQL/runtime bodies.

## Workflow properties checked

The checkout→setup-node→PGDG→npm-ci block is byte-identical to approved-base `financial-installation-quality.yml`. Checkout `11d5960a326750d5838078e36cf38b85af677262`, setup-node `49933ea5288caeca8642d1e84afbd3f7d6820020`, Node22.14.0, `persist-credentials:false`, `contents:read`, pull_request only, one ubuntu24.04 job,30-minute job limit. Official HTTPS PGDG key fingerprint is `B97B0AFCAA1A47F044F244A07FCC7D46ACCC4CF8`; install tests PG17 tools and version. No alternative mirror/TLS bypass or new third-party action.

Root/web npm ci retain `--ignore-scripts`. One job runs pure, entry-native, fragments-native sequentially with `--test-concurrency=1` and shell `set -euo pipefail`, preserving failure through tee. `$RUNNER_TEMP/publication-tail-quality` is created exclusively0700, and each native receives a distinct fresh absolute child path that its own exclusive mkdir creates. The native fixture keeps its Unix socket in a short `/tmp/si-tail-pg-*` path, not the long artifact path. No real service credentials or connection inputs are used by these tests.

Upload action `ea165f8d65b6e75b540449e92b4886f43607fa02` already exists in approved-base source-led external workflow. Upload is always(), fixed evidence subtree,14-day retention, no credential/workspace glob and no secret expressions. These are local synthetic fixture/catalog/facts/error outputs derived from committed schema-only bytes; password inspection records only `passwordSet` booleans. No production DB/cookies/tokens are introduced.0700 means local filesystem privacy; uploaded artifacts have normal GitHub repository/run visibility and are not claimed to be a separate confidential store. Existing raw provenance remains in historical evidence branches; this assembly does not import it wholesale.

PG install pins major17, while copied native tests require17.11 and fixed captured catalog; a future PGDG minor update may fail closed. That is not a present native PASS claim or permission to widen the expected profile. Ordinary GHA execution remains pending for this exact subject.

## Tests and attribution

Actual Node22.14 native-executor pure run: **17 PASS /0 FAIL /0 SKIP /0 TODO**. Both new native files parse with `node --check`; YAML parses and static workflow assertions pass. No PG/native/build was run in this task.

Two initial sandbox executions returned only two file-level passing subtests rather than named17 cases, including an explicit reporter run. Those raw outputs remain; they are not counted as17. The authorized executor run produced all17 named cases. Initial sandbox Git fetch failed to reach existing proxy; normal managed access subsequently fetched exact subject without changing proxy/CA/credentials. An initial guessed handoff filename read returned ENOENT; corrected using the actual diff path and retained in the review execution notes. No source or assertion changed to obtain any test result.

Historical entry24 and fragment54 are supported here only by exact retained-input equivalence; neither was newly run. Fragment14 independent effects /36 dependency-only refusals /66 ancillary source-proof statements are different coverage categories, not additive test counts. Original runtime independent review belongs to Root's separate review lineage. Old `c550...` build is not a build of current `c516...` web tree. No new build/type/lint result is claimed.

## Remaining gates and limits

Correct workflow path coverage and review that exact delta. Fresh ordinary GHA/native, full independent exact release review/attestation and protected checks remain separate; no approval refs created here. Formal peer/approved install profile, capacity, actual financial50/publication26 installation and genuine sources/preparation/author/reviewer/publisher roles remain unproven by this task. No production authority, model/publication execution, deployment or SQL changes occurred.

Capacity at admission: workspace8617070592bytes, tmp15443369984bytes; both exceed8GiB. The pre-existing node/postgres PIDs inspected were zombies, not active heavy jobs. No owned service was started. Only lightweight Node/hash/YAML work was run; RSS peak was not sampled, and no measured peak is claimed. Cloud runtime reported connected with network policy observation `unknown`; successful Git fetch establishes that operation only, not generalized network readiness. No environment configuration change or installation was needed.
