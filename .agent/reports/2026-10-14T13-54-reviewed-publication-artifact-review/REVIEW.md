# Independent ordinary artifact workflow review

**REQUEST_CHANGES — P0=0, P1=0, P2=2.** Unsigned model-agent code review of the two-file builder/workflow delta only. This is not a protected attestation, approval of dd's product source, or approval of my separate protocol/profile implementation.

Subject `df18448dfd26627cd26e0156db0a8ea66e2b886a`; base `5189547f76bf24c002b8e8b11669081ba67ad2c6`; tree `adefefe973d17c956c42c476c05f4fe271c99c81`; web tree `c516655efaac8260b1bcf5938f8f4d65ab61ad44`. The whole base diff contains exactly the new workflow and its handoff, with no product, SQL, authority, protected workflow, lock, or runtime changes. Workflow SHA256: `ee3d0a02d0d0a6964dd3652ba7bae4c701a4b96507b2d40497e8bb1ae0b36d0e`.

## R1 — P2: provision the first subject's pinned browser before its canonical suite

Location: `.github/workflows/reviewed-publication-tail-artifact.yml:37–48`, with the sole browser install at `:139–143`.

The first subject installs npm dependencies then immediately runs canonical product correctness. That suite actually invokes Playwright: `product-correctness.test.mjs:1765` runs the nine-case v3 browser command, and `v314-actionability-recovery.test.mjs:34–36` invokes the real Playwright CLI. Their config selects the default Playwright Chromium, not the host's arbitrary Chrome. Modern locked Playwright 1.58.2 has no browser-download npm install script. The workflow neither provisions nor restores that browser cache before this consumer. Its only install is later, after canonical success and the second checkout, so it cannot repair the first stage.

Concrete independent probe: with the installed locked Playwright package and a fresh empty browser-cache path, calling only its real executable resolver (no launch, network, or download) rejects `chromium_headless_shell-1208/.../chrome-headless-shell` with `Executable doesn't exist`. The exact workflow's install-before-consumer assertion is RED. This proves the clean-cache failure condition, not a claimed new hosted-run failure. An ambient matching cache could mask it; there is no such declared workflow prerequisite. The original ordinary workflow explicitly installs Chromium before its product-runtime suite.

Minimum correction: provision/verify the first checkout's locked browser and required libraries before canonical, using that subject's own CLI. Preserve the full suite and all browser assertions. The second subject still needs its own declared browser compatibility after checkout cleaning. Do not replace the browser, skip tests, or call a prior run this execution.

## R2 — P2: the canonical receipt parser trusts summary counts without counting results

Location: `.github/workflows/reviewed-publication-tail-artifact.yml:61–68` and emitted assertions at `:79–80`.

The parser validates one set of summary numbers and the 31 PCR labels, but never verifies the remaining 124 result records or unique result identifiers, and does not reject contradictory failing result records. Using the exact extracted parser, each of the following is accepted:

- Only 31 `ok` records, one per PCR, followed by `1..155` and the claimed 155-pass summary.
- 155 records with duplicate result identifier 31 and missing identifier 32.
- A `not ok 32` record alongside a summary claiming zero failures.
- Two `1..155` plans.

The sealed regression expecting rejection of the 31-record payload fails with `Missing expected exception`. These are small mocked log counterexamples, not actual canonical executions or a claim that Node's current normal reporter emitted corrupt output. The receipt's explicit claim to verify all 155 results is stronger than its implemented verification. The separate `pipefail` check remains valuable, but is not structural validation of the recorded TAP.

Minimum correction: validate the complete applicable TAP plan/result set, unique expected result numbering, result count, failing/skipped/todo records and summary consistency, retaining the exact ordered 31 distinct PCR names. Keep the original canonical command and 155/31 expectations. Include these malformed-stream negatives, without manufacturing a successful fresh suite receipt from them.

## Checks completed without product execution

- Read both entire added files and the original resolver, packager, verifier, actual auth/fixture routes, browser configs/call sites, dependency scripts, locks and approved workflow pins. The source manifest records 23 files; all 21 inherited paths are byte-identical to dd.
- Both distinct execution subjects are explicitly named. Default checkout is checked against `GITHUB_SHA`; the second checkout retrieves c2b, verifies its sole parent dd, detaches dd, checks exact trees/clean source, and calls the unchanged resolver. Original resolver successfully resolved genuine Git objects to dd tree `6a9a08af70fb94b50ed2b5eee6aaf3686f648b99`. Real wrong-source/missing-attestation negatives rejected; injected repository extra-diff, invalid-tree and changed-review-byte negatives rejected. Overrides are explicitly mock negatives, not new real attestations.
- c2b is not relabeled as attesting merge5189 or the builder. dd and base5189 have the same tree, which does not make their commit attestations interchangeable.
- `contents: read`, no workflow inputs, no explicit secrets, no direct production-database/deploy command, credential persistence disabled, exact existing checkout/setup-node/upload action pins, one sequential job, 30-minute job timeout. The handoff distinguishes failure artifacts and ordinary job success from release/production readiness.
- By checkout's normal clean default, the second checkout removes ignored dependencies/builds from the workspace; setup-node's toolcache PATH and external RUNNER_TEMP receipts survive. This is a static contract assessment, not a local run of checkout or a hosted result.
- Lock hashes are recorded for the event subject; tracked diffs are rejected after tests and again before packaging. dd package/source/packager inputs use the same exact commit. npm postinstall authority sync is covered by subsequent tracked-diff rejection; no different authority sync is introduced.
- Original package shape matches `{manifest,manifestSha256}`; entrypoint and `app/.../.next/static/...` member selection align with the packager. Original verification checks full member set, sizes, modes, hashes and disallows symlinks/special files; packager rejects env/backup components. Tar wraps that external verified release directory; SHA256SUMS binds archive and listed receipts. Actual archive contents, startup-generated filesystem changes, hosted upload and downloadable bytes remain unexecuted.
- Packaged child uses production mode, loopback and a small explicit environment without auth/DB/provider values. Actual target auth returns the expected missing-config 500 before DB reads; the fixture rejects production. Static streaming hash/size checks use an AbortSignal covering fetch/body, and child failure/early exit is checked. Cleanup waits for process `close`, escalates TERM to KILL, and rejects unconfirmed shutdown. stdout/stderr pipe write failures are not silently caught as success. No actual server, HTTP request, signal or package was run here; no claim of hosted lifecycle success.
- All 11 extracted shell blocks pass `bash -n`; all three exact inline JS blocks pass Node 22.14 `--check`; YAML parsing and static permission/action/subject checks pass.
- Exact parser probe: one structurally valid mocked 155-record control accepted; four malformed streams unexpectedly accepted; four summary/PCR malformed controls rejected. Two review regression tests are intentionally RED (0 pass / 2 fail), preserving findings. No 155-case or 31-PCR execution occurred.

## Original errors and environment limitations

Initial `/usr/bin/time` was unavailable (exit127), so no test executed on that attempt. The first combined probe then encountered sandbox `spawnSync /usr/bin/git EPERM` at the resolver after producing parser/browser diagnostics; its exit1 is preserved. The Node test runner initially produced a sandbox file-level 0-pass/1-fail result, not semantic test counts. Authorized read-only subprocess execution outside that restriction then produced the real resolver results and the two semantic RED regressions. These are review-tool environment failures, not product findings or rewritten PASS results. Some exploratory searches used nonexistent guessed filenames; they were not taken as product evidence.

Resource admission stayed above 8GiB free on both mounts; measured child maximum RSS for syntax/combined probe was 74,692KiB using Python `resource.getrusage(RUSAGE_CHILDREN)`. This is not a claimed hosted build peak or continuous process-tree sampler. No owned service, cluster, browser, or server was started, and no caches/evidence were removed.

## Pending / scope boundary

Fresh hosted canonical155/PCR31, both browser installations/runs, calculations/type/lint/build, packaging/full verification/archive inspection, actual packaged-server/HTTP/log/cleanup proof and hosted upload remain pending. The canonical command transitively starts isolated PostgreSQL tests; the handoff’s broad “no database calls” wording must be read as no production database access, not a claim that the suite has no local database tests. Native database/tool availability on the hosted image was not exercised. No workflow dispatch, protected check, source edit, PR, review ref, attestation, deployment, source qualification, strategy approval or production readiness is implied. Root should fix the two workflow defects and obtain a new exact-source review before relying on a hosted artifact result.
