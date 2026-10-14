# Independent R1/R2 workflow closure review

**APPROVE-scoped — P0=0, P1=0, P2=0.** The two findings from the original df18448d review are closed in this exact two-file builder delta. This is an unsigned model-agent code review, not a protected attestation, approval of the application/financial source, or review of my own protocol/profile code.

Subject: `e902021ee9df537d4a8da2a2eaff3921084d44d7`.
Tree: `f1d217954ef7c9d0f759d1649879d34646faa0d8`.
Web tree: `c516655efaac8260b1bcf5938f8f4d65ab61ad44`.
Approved base: `5189547f76bf24c002b8e8b11669081ba67ad2c6`.
Workflow SHA256: `5aee67472a1a7240a57e09aba0516364206f3b0971cb38e28515ac23f0d4f6fe`.

The complete base diff still contains only `.github/workflows/reviewed-publication-tail-artifact.yml` and `docs/operations/2026-10-14/reviewed-publication-artifact-handoff.md`. Relative to df18448d it is 39 insertions/3 deletions across these two files. I reread both full files and the original consumer/setup contracts. All 21 inherited files in the prior 23-source review manifest are byte-identical. No product/SQL/authority/protected/workflow-policy/lock changes were introduced.

## R1 closure — actual YAML order, not an `npx` string test

At workflow lines 56–62, the builder's own root/web locks are installed first, then `./node_modules/.bin/playwright install --with-deps chromium` runs with `working-directory: web`, before canonical at lines 63–70. `PLAYWRIGHT_BROWSERS_PATH: '0'` makes package-local storage explicit. After the second checkout cleans the first subject's worktree/dependencies, the exact dd locks are installed at lines 161–164, and the existing `cd web; npx playwright install --with-deps chromium` precedes that subject's browser consumer at lines 173–177. It does not rely on the first subject's deleted browser cache or select a different Chrome.

The new independent probe parses YAML and verifies these dependency/checkout/browser/consumer relationships. It accepts the correction and rejects the old df YAML. The prior reviewer regression that searched only the first `npx playwright install` string remains historical RED, but is not used to reject an equivalent project-local CLI command. Neither product code nor browser requirements were adjusted for that old test string.

## R2 closure — exact extracted parser

At lines 79–102, the new parser checks the bounded log, one TAP13 header, one 155 plan, 155 top-level result records, exact ordered identifiers 1 through155, no failing or bailout records, no SKIP/TODO result directives, one consistent set of summaries and the ordered31 unique PCR labels. It retains the original155/31 expectations and canonical command.

I executed the exact extracted parser with two valid mocked controls and19 negative streams. The four original counterexamples now reject: only31 records claiming155; duplicate identifier31/missing32; contradictory `not ok32`; duplicate plan. Additional rejection checks cover duplicate/missing header, SKIP/TODO/lowercase skip, bailout, wrong failure summary, wrong/duplicate PCR label, duplicate summary, missing/extra/reordered results, wrong plan, cancellation and leading-zero identifier. The exact old parser still accepts the four original counterexamples, preserving their original meaning rather than rewriting them as historical PASS.

I also generated a separate valid control using Node22.14's real TAP reporter with155 trivial synthetic tests and the expected31 synthetic label spellings. The new parser accepts that real reporter output. **Those are reporter-format fixtures, not application tests or actual PCR execution.** Root's retained old-dd TAP control was not independently rerun here; no fresh application canonical155/PCR31 result is claimed.

Actual independent probe totals:30 checks passed (including19 negative-rejection checks and four old-source misacceptance witnesses), plus one real-Node-reporter parser control passed. The synthetic reporter itself emitted155 passing no-op fixture tests; that count is deliberately separate and must not enter product acceptance totals.

## PostgreSQL prerequisite and unchanged boundaries

The added PG installation run body at lines41–55 is byte-for-byte equal, including final newline, to the approved main financial-installation workflow's existing PG17 setup. SHA256 of that decoded run body: `8ea1c4492350ba84e20e550d85319d681719b074c45aebac489af6cc807ad902`.

It retains official HTTPS PGDG endpoints and fingerprint `B97B0AFCAA1A47F044F244A07FCC7D46ACCC4CF8`, fixed `/usr/lib/postgresql/17/bin`, executable checks for pg_config/initdb/pg_ctl/psql, the PG17 version assertion, GITHUB_PATH export and OS-derived USER through GITHUB_ENV. It precedes dependency install and canonical. The original native consumer discovers `/usr/lib/postgresql/<version>/bin` and uses the supplied PATH; the v314 consumer still selects the same four original migration patterns. No test fixture or expected PostgreSQL result was altered. GITHUB_PATH/GITHUB_ENV persist across checkout; no production DB address/credential/connection is introduced. This is static dependency verification, not a local PG install, PG execution, effective hosted HBA proof or production installation.

All old steps except the canonical parser block compare structurally equal to df; action pins/permissions/events/concurrency also compare equal. The only added job environment entry is project-local Playwright storage. Original direct c2b→dd resolution, exact trees/clean source, separate builder-vs-dd receipts, original packaging/verification, credential-free production child, auth500/fixture404/static-member checks, timeout/confirmed shutdown, archive hashes and status-labeled partial artifacts remain unchanged. The previous real-Git resolver positive/negative evidence is reused by byte equality, not represented as newly executed here. The handoff now explicitly distinguishes isolated local PG fixture tests from production DB access.

The top introductory comment still abbreviates this as “No ... DB access”; the corrected substantive handoff and command graph make clear that this means no production DB access, not an absence of isolated test DBs. No new execution authority or deployment readiness is granted.

## Validation, original error and remaining limits

All13 extracted shell blocks passed `bash -n`; all3 exact inline Node modules passed Node22.14 `--check`. YAML parse and source/dependency/step equality checks passed. No npm ci, package installation, browser launch/download, HTTP, PG, build, app lint/typecheck, workflow run, artifact fetch, protected action or production access occurred.

The first review-harness extraction used a broad `builder-canonical.log` match and also hit the SHA256SUMS step, causing `IndexError` because that step has no NODE heredoc. This tooling RED is retained. I corrected only my extractor to require a heredoc, then sealed and ran the probes. The source workflow was never changed. No product failure was hidden or converted to PASS.

Admission and final samples remained above8GiB free; no active node/postgres/npm/next process was present in the final non-zombie process-name query. This review started no services, clusters or browsers and removed no cache/evidence. Resource sampling for syntax and VM probes used Python RUSAGE_CHILDREN; it is not a hosted build peak or continuous tree sampler.

**Pending:** actual hosted prerequisite installation; fresh canonical155/PCR31 on the event subject; dd browser/calculation/type/lint/build; packaging/member/archive verification; actual packaged HTTP/process/log cleanup and upload; all normal protected/formal release and production-capacity/transport decisions. This scoped code closure does not mark any of those complete. Original df REQUEST_CHANGES and0PASS2FAIL evidence remains at `93f6b60a5ad9d326d7ef9d67b6a673162a2a2fda`, receipt `c617e53a41db8ce50071588e7034e1d49505a04e70c3a38be636bd0e57e5cafe`.
