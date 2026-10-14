# APPROVE-scoped — artifact reuse workflow delta

Unsigned model-agent code review, not a human signature, protected attestation, source qualification, installer/peer approval or deployment authorization. Reviewer did not implement these two candidate files. Review covers Root's artifact-workflow delta only; the native witness supplement is maker-derived and is **not independent native approval**.

Subject: `c68864cd4125b2dc5e9249312ef9188bfdedcb82`; tree `8ab201731bcf2a1a99e71393ac9a7e18d01ed36c`; predecessor `e902021ee9df537d4a8da2a2eaff3921084d44d7`. Full diff: two files, 141 insertions/45 deletions. Web tree remains `c516655efaac8260b1bcf5938f8f4d65ab61ad44`. Verdict: **P0=0, P1=0, P2=0 within this reviewed delta**.

Reviewed full workflow and handoff, exact extraction Python, unchanged canonical parser/PG setup/checkout/boot code and original resolver/verifier contracts. No product file was edited. No workflow, application test, PG, browser, HTTP, build, download or artifact reconstruction was run.

## Findings and reasoning

- Lines 11–13 grant only contents:read + actions:read. No inputs select source, run, artifact or executable. Explicit builtin token injection occurs only in the fixed API download step, lines 164–172. Checkout pins and persist-credentials:false remain; no protected/oracle/policy changes. The builtin token is not a production credential. Read permissions still apply to the job's trusted pinned actions as GitHub defines them; this is not a claim of process-level token isolation.
- First eight steps are unchanged from e902, including original PG17 fingerprint/PATH/OS USER, exact locks, own locked Chromium and the complete 155/31 canonical command/parser. Current-builder evidence stays outside workspace before second checkout. No upstream result is counted as current-builder execution.
- Second checkout still resolves actual DD/C2B Git objects, direct-child relationship, exact tree/web and clean source. Original resolver and verifier only need builtins/local code after dependencies are removed by checkout. The actual read-only resolver accepted DD/C2B and rejected using merged5189 or DD itself as the attestation child.
- Lines 187–211 bind fixed artifact/run/repository/head/success/expiry/size and whole ZIP SHA before ZIP parsing. Fixed numeric IDs and literal paths prevent caller input/shell injection. A deletion/expiry/change between metadata and download fails closed via download status or immutable byte digest; no fallback build. This is fixed known-artifact validation, not a general untrusted archive service.
- Lines 212–235 check the exact thirteen ZIP members, no duplicates/directories/encryption/special type, aggregate bound and all twelve original file hashes. Original upstream files remain in a separate directory. Tar/manifest/source binding hashes are fixed before tar parsing; original verifier SHA is also checked.
- Lines 249–265 reject traversal, non-rooted paths, duplicate names, backslashes, links/special files and privileged modes before extraction. Files are created exclusively; file modes are reapplied then verified against the original full manifest. The new private parent makes attacker preplacement outside this dedicated runner irrelevant to the advertised scope; concurrent same-user hostile runner mutation is not a claimed defense. Ordinary directory modes are not a manifest contract, while file modes are verified. Whole ZIP/tar pins prevent accepting an arbitrary replacement archive even where an isolated predicate permits a benign shape.
- Lines 280–281 invoke the original DD verifier over all extracted members. Fresh loopback boot retains minimal no-credential env, expected fail-closed missing-auth response, production fixture404, static bytes/hash and confirmed exit; only upstream identity fields were added. Success is not written before confirmed cleanup. A failed stage stops downstream steps, while always-upload retains diagnostics with actual job status. Failure may leave temporary extraction files until runner disposal; this is not represented as a successful release or a confirmed application process start.
- Lines 358–374 seal new receipts plus untouched upstream thirteen files without rebuilding/repacking. SHA256SUMS excludes only itself; nested original SHA256SUMS is retained and covered. Artifact names say verified-reuse and actual job status. No source-addressed evidence is rewritten.

## Executed evidence (lightweight only)

1. Exact metadata prefix and original ZIP/tar guard AST fragments: **36 checks PASS**, including a synthetic fixed-metadata control, wrong artifact/run/repository/head/status/digest/expiry/size, traversal/duplicate/link/device/FIFO/privileged-mode tar entries, and actual tiny ZIP controls/missing/unknown/traversal/duplicate/symlink entries. The fragment probes deliberately isolate predicates; they do **not** bypass pins to claim full extractor success or verify the real upstream archive.
2. Original read-only Git resolver: **3 checks PASS** on real repository objects (DD/C2B positive; merge-source and non-child negative). Exact DD verifier SHA matches `1e4bb10d2ee694eefd0493653a71d54b8d94deade74fa66a86b579b25ebe930b`.
3. Syntax: **10 bash -n, 3 Node22.14 --check, 1 Python compile** passed. YAML parsed and full diff whitespace check passed. Syntax counts are not product tests.
4. Static comparison verified unchanged first eight steps/action pins, exact two-file scope and unchanged main web tree.

Retained reviewer-harness RED: initial overly broad first-nine-step equality assertion incorrectly included the intentionally changed resolver receipt; corrected to the actual unchanged first eight steps, leaving the original failed probe recorded. Initial sandbox Git resolver returned attestation_commit_unavailable; separate read-only diagnosis proved `spawnSync /usr/bin/git EPERM`. Same genuine Git-object checks passed in the authorized native execution context. Neither error is a product finding, and neither original output was overwritten.

## Native witness supplement (separate maker scope)

`native-public-safe-witness.json` derives only whitelisted fields from existing local native outputs of exact7951: source hashes, stage/error labels, table counts/SHA, FD counters/order booleans, PID cleanup, charges and bytepending. No native was rerun. Original 93 raw / 5,805,306 bytes remain local-only at `/tmp/cross-wire-exec-o14`.

The two mixed-slot cases retain full nine-table before/after snapshots. The two first-seal/replay cases retain one post-seal audit and passed callback equality assertions, but **no separately serialized afterReplay/afterConflict snapshot**; those fields are null/pending. Successful max30 measurements do not retain nine-table before/after snapshots; likewise null/pending. The supplement does not fabricate these missing observations. Max30 final charges 462917/304278 remain below 524288; byte-bound rejection remains pending.

## Unverified boundaries

The actual fixed ZIP was not available in this VM's inspected locations and was not downloaded. Thus no independent full ZIP/tar extraction/verifier or new boot was performed here; Root's historical upstream results remain attributed to their original run. Current workflow hosted API authorization, fixed ZIP availability, current builder155/31, current full verifier/boot/upload and protected checks remain pending. No production readiness, capacity, fixed-peer transport, formal research execution, role assignment or publication approval is supplied by this scoped review.

Window: 2026-10-14 23:26:44–23:41:44 Asia/Taipei. Read-only/light processes only; no installed dependencies, cache deletion or owned services. All source edits remain exclusively Root's.
