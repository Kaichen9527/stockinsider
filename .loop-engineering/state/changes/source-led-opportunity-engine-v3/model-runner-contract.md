# macOS Model Runner Contract: source-led-opportunity-engine-v3

Version: `model-runner-v3.6`

Checkpoint: `model_runner_v3`

Status: architecture only; implementation remains locked until fresh Requirements and Architecture Gates pass

## 1. Authority, scope and security claim

This file is the sole active owner for new `model_runner_v3` operations. It does not reinterpret or mutate V1/V2 manifests, counters, findings, verdicts, artifacts, refs or state. `requirements.md`, `design.md`, `host-pin-compatibility-amendment.md`, `model-runner-host-pins-v3.json`, the canonical acceptance inventory and this contract are the complete implementation authority; Terra must stop on a missing decision rather than infer legacy behavior.

The runner is local Loop Engineering development tooling, not a Vercel/Supabase worker and not a stock-selection factor. A maker returns only a sealed text patch proposal. Trusted local runner code alone may validate and apply it in a token-owned clean worktree. Reviewer and verifier results are typed findings/evidence and never mutate Git. No runner result enters candidate discovery, scoring, valuation, rank, action, allocation, promotion or any Supabase write.

An offline domain artifact produced by separately approved tooling is only a candidate. It remains absent from the App until the signed `model_reviewer` registration owned by `auth-principal-contract.md` v3.8 validates its exact hash, license, training cutoff, evaluation manifest, comparison baseline and OOS metrics. After registration it remains display-only with `influence='none'`. This runner cannot perform or emulate that registration.

The hard isolation guarantee is limited to model-command descendants:

1. they cannot read user or repository resources outside the exact sanitized source view, exact prompt bytes, trusted `:minimal` runtime and private scratch;
2. they cannot write a target/primary/sibling worktree, Git common directory, source view, authoritative runner state/artifact, prompt input, secret path or other user resource;
3. they cannot open command network connections, including DNS, TCP, UDP, HTTP(S), loopback/private destinations or Unix sockets.

Trusted Codex API transport is outside the command-network claim. The prompt states that repository, patch and prompt-provided code/commands are untrusted data and must not be executed. Sandboxed read inspection with `rg`, `sed` or `cat` is allowed; approval or privilege escalation is forbidden. This checkpoint deliberately does **not** claim that all code execution is mechanically impossible. Codex and descendants may write only private scratch, which is non-authoritative and never becomes proposal input after sealing. No cgroup-grade CPU/RAM/PID limit or guarantee that every detached descendant is killed is claimed. Apple `container`, a VM or another high-assurance backend requires a separately approved checkpoint.

Trusted components are the macOS arm64 kernel/profile enforcement, the pinned executable identities below, runner code, canonical JSON, SHA-256, cryptographically random 256-bit ownership tokens, immutable Git objects at `inputHead`, same-volume exclusive create/rename/fsync, and the invoking repository owner. Repository bytes, model output/events/tool requests, user configuration, AGENTS/rules/hooks/MCP/plugins/apps/skills, ambient environment, path strings, scratch and surviving descendants are untrusted. A malicious kernel, SHA-256 collision, physical rollback, compromised pinned signing identity or hostile same-UID process that replaces trusted runner code is outside this checkpoint; none permits fallback.

Implementation keeps V1 modules/tests intact and adds independent V3 modules named exactly `canonicalJson`, `manifest`, `routing`, `seal`, `sourceView`, `codexAdapter`, `patchParser`, `trustedGit`, `transactionJournal`, `resourceJournal`, `artifacts` and `runner`. No V3 module imports a V1 mutable-state writer or aliases a V1/V2 namespace.

## 2. Exact manifest authority

The manifest is UTF-8 JSON, at most 1,048,576 bytes including its mandatory final LF. The pre-LF bytes must already equal RFC-8785 canonical JSON; duplicate keys, BOM, CR, non-finite/negative-zero number, non-NFC string, accessor/exotic value or trailing whitespace fails. `manifestSha256` is SHA-256 over the canonical bytes without the LF.

The top-level object has exactly these seven keys:

```text
protocol,checkpoint,changeId,base,inputHead,defaultStrategy,tasks
```

- `protocol` is `loop-model-manifest-v3.5`; `checkpoint` is `model_runner_v3`.
- `changeId` matches `[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?`.
- `base` and `inputHead` are lowercase 40-hex commit OIDs; `base` is an ancestor of `inputHead`; `inputHead` has no replace/graft/shallow ambiguity and all required blobs are local.
- `defaultStrategy` is `hybrid|sol-only|terra-only`.
- `tasks` has 1..128 entries in execution order. IDs are unique, and `sequence` is exactly the zero-based array ordinal.

Each task object has exactly:

```text
id,sequence,assurance,dependsOn,task,acceptanceCriteria,
allowedPaths,inspectionPaths,promptFiles,timeLimits
```

- `id` uses the `changeId` grammar; `assurance` is literal `critical` for this checkpoint.
- `dependsOn` is an ASCII-sorted unique array of 0..32 earlier task IDs.
- `task` is 1..32,768 UTF-8 bytes. `acceptanceCriteria` has 1..128 nonempty strings, each at most 4,096 bytes and at most 65,536 bytes combined.
- `allowedPaths` and `inspectionPaths` each contain 0..128 unique ASCII-byte-sorted selectors. The same selector cannot occur in both. `allowedPaths` is both maker patch authority and readable view authority; `inspectionPaths` is readable only.
- `promptFiles` contains 0..32 unique ASCII-byte-sorted canonical repository paths and is governed by section 7.
- `timeLimits` has exactly integer `makeSeconds`, `reviewSeconds`, `verifySeconds`, each 60..1,800. There is no default deadline.

A selector is either one exact repository path or a directory prefix followed by terminal `/**`; no other `*`, glob, brace, regex or negation is legal. Paths are NFC UTF-8 of 1..1,024 bytes, components are 1..255 bytes, and absolute paths, empty/`.`/`..` components, backslash, NUL/control bytes, leading/trailing slash and trailing space/dot components fail. Matching is byte-exact after NFC; case-fold/NFC collisions anywhere in one materialized view fail.

Unknown/missing members, duplicate selectors, a dependency cycle, a task with no readable path and no prompt file, or any task selecting a permanently forbidden class is `MANIFEST_INVALID`. Manifest validation never executes repository content.

## 3. CLI, operations, routing and waiver

The grammar is exactly:

```text
loop-model-runner validate --manifest <path>
loop-model-runner route --manifest <path> [--task <taskId>]
loop-model-runner run --manifest <path> --task <taskId> [--strategy hybrid|sol-only|terra-only] [--waiver <path>]
loop-model-runner review --manifest <path> --task <taskId> [--strategy hybrid|sol-only|terra-only] [--waiver <path>]
loop-model-runner verify --manifest <path> --task <taskId> [--strategy hybrid|sol-only|terra-only] [--waiver <path>]
loop-model-runner status --manifest <path> --task <taskId>
```

One flag consumes one following value. `--key=value`, duplicate/unknown flags, positional values, missing/empty values and command-inapplicable flags are usage failures. `run` maps only to protocol operation `make`; the other terminal operations are `review|verify`. `validate`, `route` and `status` spawn no model and no apply process. Every success writes exactly one canonical JSON object plus LF to stdout; diagnostics go to bounded redacted stderr. Their exact success objects are:

- validate: `protocol='loop-model-validate-v3.5',manifestSha256,changeId,inputHead,taskCount,valid=true`;
- route: `protocol='loop-model-route-v3.5',manifestSha256,strategy,routes`, where routes is manifest-task order (or the exact selected singleton) and each entry has exactly `taskId,assurance,make,review,verify`; each operation value is either `model,reasoningEffort,waiverRequired=false|true` or `blocked='ROUTING_BLOCKED'` according to the table below;
- terminal operation: `protocol='loop-model-operation-v3.5',manifestSha256,taskId,operation,round,status,exit,resultSha256,proposalCommit,resultRef`, where commit/ref are non-null only for a maker proposal and the remaining values equal the sealed result/journal;
- status: the object in section 4.

No success object contains a timestamp, prompt, path, model text or ambient field. A nonzero exit before a valid terminal result writes no stdout and exactly one redacted canonical diagnostic with exactly `protocol='loop-model-error-v3.5',exit,code,message` plus LF to stderr; valid exits 7/9/10 use the terminal operation object. The only legal diagnostic values are the rows below. `message` is the exact case-sensitive ASCII literal, never interpolates a path, cause, model text, token, identifier or primary failure, and has no prefix/suffix. RFC-8785 serialization determines member order and the single final LF is part of stderr but not the canonical-object hash.

| Exit | `code` | Exact `message` |
|---:|---|---|
| 2 | `USAGE` | `invalid command usage` |
| 3 | `MANIFEST_INVALID` | `manifest validation failed` |
| 4 | `GIT_STATE_INVALID` | `trusted Git state validation failed` |
| 5 | `ROUTING_BLOCKED` | `routing or host preflight blocked` |
| 6 | `MODEL_PROTOCOL_ERROR` | `model protocol validation failed` |
| 8 | `REVIEW_BLOCKED` | `task state or lock blocked` |
| 10 | `TASK_FAILED` | `task interrupted before terminal result` |
| 11 | `IO_ERROR` | `trusted runner I/O failed` |
| 12 | `INTERNAL_ERROR` | `trusted runner invariant failed` |

For example, every cleanup failure emits exactly `{"code":"IO_ERROR","exit":11,"message":"trusted runner I/O failed","protocol":"loop-model-error-v3.5"}\n` as UTF-8 stderr and empty stdout, regardless of its retained primary pair. Section 12 exclusively owns when that cleanup override applies and requires replay to reproduce those same bytes. No other diagnostic code/exit/message cross-product exists.

The effective strategy is the CLI value when present, otherwise `defaultStrategy`. Routing is closed:

| Operation | Strategy | Exact model | Reasoning | Waiver |
|---|---|---|---|---|
| `make` | `hybrid` or `terra-only` | `gpt-5.6-terra` | `high` | forbidden |
| `make` | `sol-only` | `gpt-5.6-sol` | `xhigh` | required |
| `review` or `verify` | `hybrid` or `sol-only` | `gpt-5.6-sol` | `xhigh` | forbidden |
| `review` or `verify` | `terra-only` | blocked | n/a | cannot override |

Luna and every other model/effort are unrepresentable; there is no automatic fallback. `route` reports the manifest-default row only. A waiver is accepted only with `run --strategy sol-only`. It is a UTF-8 canonical JSON plus LF file outside every repository, view, scratch and transport root; `lstat` must show one regular nonlinked file owned by the invoking UID with mode `0400|0600`. It has exactly `protocol='model-runner-waiver-v3.5'`, `checkpoint='model_runner_v3'`, `changeId`, `taskId`, `inputHead`, `strategy='sol-only'`, `approvedBy='repository-owner'`, `reason` of 1..1,024 bytes and whole-second UTC `expiresAt` greater than invocation time and no more than seven days later. Every identity must equal the manifest/task. The explicit user-owned file is the authority; repository/model bytes cannot create or select it.

## 4. State namespace, status and exits

V3 durable state lives only at the validated repository root path `.loop-engineering/runtime/model-runner-v3/<manifestSha256>/`. The implementation adds this exact namespace to `.gitignore`. It never opens a V1/V2 runtime path for write, and every V3 command verifies that the byte/hash snapshot of existing V1/V2 runner state, counters, findings, verdicts, artifacts and refs is unchanged before return.

For task key `taskKey=SHA256(UTF8(taskId))`, exact paths below the manifest root are:

```text
tasks/<taskKey>/lock
tasks/<taskKey>/operation/<operationKeySha256>.jsonl
tasks/<taskKey>/reservation/<operationKeySha256>/<resourceAttemptOrdinal>.json
tasks/<taskKey>/resource/<resourceAttemptKeySha256>.jsonl
tasks/<taskKey>/attempt/<resourceAttemptKeySha256>.json
tasks/<taskKey>/result/<operationKeySha256>.json
tasks/<taskKey>/status.json
```

Task state is exactly `pending|making|proposal_ready|reviewing|changes_required|review_passed|verifying|verification_failed|verified|failed|recovery_required`. `run` is allowed from `pending|changes_required|verification_failed|failed`; `review` only from `proposal_ready`; `verify` only from `review_passed`. At the durable `prepared` record, the selected operation's round is exactly its prior counter plus one and that counter increments once, including an attempt that later fails protocol or cleanup; the other two counters do not change. A pre-`prepared` resource attempt changes no operation counter. Section 12's durable reservation ordinal, not the operation round, makes repeated pre-`prepared` resource chains unique without deleting or rewriting a prior journal.

`status` is reconstructed from canonical reservations plus both hash-chain journal families, compares it to `status.json`, repairs only a missing/stale byte-identical derivable snapshot by atomic rename, and otherwise returns `recovery_required`. Its exact object is:

```text
protocol,manifestSha256,modelRunnerIdentitySha256,taskId,inputHead,state,makeRound,reviewRound,verifyRound,
proposalCommit,resultRef,lastOperation,lastExit,integrity
```

`protocol` is `loop-model-status-v3.5`; `modelRunnerIdentitySha256` is the exact section 5 digest; rounds are nonnegative integers; nullable OIDs are lowercase 40-hex; `resultRef` is the exact ref in section 12; `lastOperation` is null or `make|review|verify`; `lastExit` is null or one closed exit; `integrity` is `ok|recovery_required`. No timestamp or ambient field appears. The total transition oracle in section 12 exclusively determines these fields.

Closed exits and precedence are:

| Exit | Name | Exact causes |
|---:|---|---|
| 0 | `OK` | command-specific success, review/verify pass |
| 2 | `USAGE` | CLI grammar or inapplicable flag/waiver |
| 3 | `MANIFEST_INVALID` | manifest/task/path/prompt schema or hash/ancestry failure |
| 4 | `GIT_STATE_INVALID` | input object/common-dir/worktree/ref/scope mismatch before model |
| 5 | `ROUTING_BLOCKED` | route/waiver/host/binary/codesign/profile/preflight mismatch |
| 6 | `MODEL_PROTOCOL_ERROR` | spawn/JSONL/UTF-8/limit/timeout/nonzero/signal/request-result binding error |
| 7 | `CHANGES_REQUIRED` | one valid review verdict containing P0/P1 |
| 8 | `REVIEW_BLOCKED` | invalid task state, lock conflict or review/verify without required predecessor |
| 9 | `VERIFICATION_FAILED` | one valid verification-failed verdict |
| 10 | `TASK_FAILED` | valid terminal `task_failed` or interrupted pre-publication operation |
| 11 | `IO_ERROR` | atomic I/O, ownership cleanup or unambiguous resource recovery failure |
| 12 | `INTERNAL_ERROR` | runner invariant not covered above |

Primary-cause precedence is usage, manifest, Git, routing/preflight, state/lock, model protocol, valid terminal verdict, I/O, internal. It selects the would-have-been outcome before resource cleanup. Once section 12 has durably reserved a resource attempt, cleanup failure is one explicit finalization override: regardless of that primary outcome, final process exit is `IO_ERROR`/11, task state and integrity become `recovery_required`, `lastExit=11`, stdout is empty, stderr is the one canonical `IO_ERROR` diagnostic, and the operation/resource records retain the selected primary code/exit plus every hash-proven result/commit/ref. Replay returns that same exit/output/retention without a model retry. Cleanup success preserves the selected primary outcome. Host/Codex/profile preflight failure before reservation is exit 5, `status_unchanged`, zero task-model/apply spawn and no durable operation tuple. `validate|route|status` never create an operation tuple. A valid `changes_required` returns 7, valid `verification_failed` returns 9 and valid `task_failed` returns 10 only when cleanup succeeds.

## 5. Immutable host and executable oracle

The sole pin oracle is tracked `model-runner-host-pins-v3.json`. Its pre-LF bytes must be RFC-8785 canonical JSON of exactly 2,141 bytes with SHA-256 `d0f13d519035963fb8a1895f89fc0cf90104094eda460bc6bc9a02e031edc937`; its LF-terminated file is 2,142 bytes. It is part of the active normative graph. Implementation cannot learn expected values from the executable under test.

The fixture pins `darwin/arm64`, absolute Node `/usr/local/bin/node` at `v22.14.0`, `/usr/bin/git` at `git version 2.50.1 (Apple Git-155)`, and `/Applications/ChatGPT.app/Contents/Resources/codex` at `codex-cli 0.148.0-alpha.21`. It supplies exact lexical/real paths, decimal-string device/inode/size, uid/gid, octal type/mode and SHA-256 for each executable. Codex additionally binds the ChatGPT bundle stat, bundle/executable identifiers, both full CodeDirectory SHA-256 values, Team ID `2DC432GLL2`, exact designated requirements and notarized Developer ID assessment. This compatibility amendment changes no isolation claim, route, protocol, permission, journal, apply or production authority.

Preflight rejects a non-regular executable, symlink/realpath difference, fixture/stat/hash/version mismatch, group/world-writable executable, failed `codesign --verify --deep --strict`, failed `spctl`, ad-hoc/unpinned signature or any unlisted path. Every ancestor is `lstat`-walked without following links; system ancestors must be real directories and no ancestor may change between checks. The already-running Node process must have `process.execPath` and executable identity equal to the Node fixture. The user-owned `/usr/local/bin` and ChatGPT bundle ancestry is not treated as immutable against the invoking UID; same-UID replacement is outside the confidentiality threat and is caught whenever observable.

Immediately before each spawn, after `spawn` returns and after child completion, the runner repeats executable/bundle path, `fstat`/`lstat`, hash and codesign checks. Any observable replacement, symlink swap, update or mismatch invalidates the attempt and authorizes no result/ref. No alternate binary/version/profile is attempted. A host/binary update requires a new compatibility amendment and host fixture.

The separate runner static identity is the RFC-8785 canonical form of this exact 18-member ASCII-name-sorted array:

```json
[["approvalPolicy","never"],["codexVersion","0.148.0-alpha.21"],["contractVersion","model-runner-v3.6"],["gitVersion","2.50.1 (Apple Git-155)"],["hardIsolationClaims",["external_user_read","authoritative_write","command_network"]],["hostPinFixtureSha256","d0f13d519035963fb8a1895f89fc0cf90104094eda460bc6bc9a02e031edc937"],["hostPinVersion","model-runner-host-pins-v3.10"],["journalVersion","model-runner-journal-v3.5"],["manifestVersion","loop-model-manifest-v3.5"],["nodeVersion","v22.14.0"],["permissionProfileVersion","model-runner-permissions-v3.5"],["promptPolicyVersion","model-runner-prompt-v3.5"],["requestProtocol","loop-model-v3.5"],["resultProtocol","loop-model-result-v3.5"],["routingVersion","model-runner-routing-v3.5"],["sourceViewVersion","model-runner-source-view-v3.5"],["stateNamespace","model-runner-v3"],["trustedApplyVersion","model-runner-trusted-apply-v3.5"]]
```

It is exactly 884 UTF-8 bytes with SHA-256 `65efcede04775dfded4911538c98b919696e0fa7555c9857dd1eeb6bf0cb3627`. The exact field name `modelRunnerIdentitySha256` carries this digest in every request, status, resource reservation, operation-journal line, resource-journal line and attempt record. Operation and resource-attempt key preimages also include the digest. A missing, additional-position, malformed or different identity member is never inferred from `protocol`: trusted request construction fails `INTERNAL_ERROR`/12 before model spawn, while any durable record/status mismatch is an integrity failure that preserves bytes, sets `state=integrity=recovery_required,lastExit=11` and returns the exact canonical `IO_ERROR` diagnostic without model retry or replay. It remains separate from the opportunity runtime's 41-member tuple; acceptance and product-contract versions belong only to that domain tuple.

## 6. Trusted anchor, scratch, transport and cleanup

The trusted anchor is exactly `<repositoryRoot>/.loop-engineering/runtime/model-runner-v3`. The runner validates `repositoryRoot` against `inputHead`/Git common-dir identity, creates the anchor with exclusive components and requires every component from the anchor downward to be a real invoking-UID-owned directory of mode `0700` on one probed local device. Ancestors above the anchor need only satisfy the repository/real-directory/no-symlink checks; they are not incorrectly required to be mode `0700` or invoking-UID-owned.

For one reserved resource attempt the random token owns disjoint `<anchor>/resources/<resourceAttemptKeySha256>/<tokenDigest>/scratch`, `view`, `transport` and `apply` roots. Only `scratch` is granted to model commands. `HOME` and `TMPDIR` are subdirectories of scratch. The source view and prompt bytes are read-only; transport and apply roots remain root-denied.

The transport root contains only exact copied authentication material and `model-runner-v3.config.toml`. Trusted code records hashes, never contents. No token/auth/config byte may appear in scratch, request, stdout/stderr, audit, result or artifact. Codex-private scratch may contain caches/transient outputs but is never scanned for a patch, copied, prompted, added to Git or consulted after result sealing.

The runner starts Codex with only stdin/stdout/stderr pipes; every inherited ambient FD, including repository directory handles, files, sockets, listeners and deliberately non-CLOEXEC sentinels, is closed. The pinned Codex sandbox launcher must likewise close every non-stdio descriptor before each model-command exec, including auth/config/transport descriptors opened after Codex start. The no-model profile probe injects open file, directory, pipe, TCP and Unix-socket descriptors and requires the sandboxed child and setsid/double-fork descendants to enumerate no usable descriptor other than their stdio and ephemeral enumeration handle. Acceptance also exercises one real pinned Codex transport session and proves the command child cannot access an auth/config/transport sentinel by inherited FD. Failure is exit 5 before any task model, or exit 6 if observed during a task; neither result is trusted.

Cleanup uses parent directory descriptors, no-follow `lstat`, token digest and exact device/inode/type/mode. It removes only token-owned descendants. Unknown entries, links, devices, hard-link count, mount/device/token/inode mismatch or a live owner produces `IO_ERROR` and preserves the root; broad recursive deletion is forbidden. A detached descendant may delay cleanup but retains only scratch authority.

## 7. Sanitized source view and prompt files

Every operation receives one new non-Git source view materialized only from tracked blobs at a proven `sourceCommit`. `viewPurpose` and `sourceCommit` are derived, never selected by the model or caller:

| Operation/start state | `viewPurpose` | Exact `sourceCommit` |
|---|---|---|
| make from `pending` with no retained proposal | `make_initial` | `inputHead` |
| make from `changes_required|verification_failed|failed` with a retained proposal | `make_repair` | the retained `proposalCommit` proven by its immutable result ref |
| make from `failed` with no retained proposal | `make_initial` | `inputHead` |
| review from `proposal_ready` | `review` | the retained `proposalCommit` |
| verify from `review_passed` | `verify` | the retained `proposalCommit` |

A retained proposal is usable only when trusted code proves the exact ref, maker result hash, single parent `inputHead`, deterministic actor/date/message and complete tree identity from sections 10 through 12. Otherwise the state is `recovery_required`; no view or model is started. Thus review and verify inspect proposed bytes, and a repair maker starts from the exact rejected/failed proposal tree. The repair patch applies to that `sourceCommit`; trusted Git still verifies the final result tree against `inputHead` and allows differences only under `allowedPaths`.

For `make_repair|review|verify`, trusted Git also derives `proposalDelta`, the UTF-8-path-byte-sorted canonical array of 1..4,096 entries comparing `inputHead` to `sourceCommit`. Each entry is exactly `[path,status,inputBlobOid,inputMode,inputSha256,proposalBlobOid,proposalMode,proposalSha256]`; status is `add|modify|delete`, the absent side has three nulls, and present modes are `100644|100755`. Rename/copy/mode-only/type changes are unrepresentable. `proposalDeltaSha256` hashes the RFC-8785 bytes. The request includes this metadata so deletions and the full changed-path set are visible while current proposal content is read from the view. `make_initial` has literal null delta/hash. A proposal with zero or more than 4,096 delta entries is invalid and cannot be reviewed, verified or repaired.

A blob is eligible only when its path matches `allowedPaths|inspectionPaths`, its Git mode is exactly `100644|100755`, and it is not permanently forbidden. Working-copy bytes, submodules, symlinks and Git alternates are never copied. Materialized directories are `0555`, files `0444`, executable bits are removed, and hard links/devices/sockets/FIFOs are absent.

The permanent-exclusion oracle is lexical and closed. Normalize the repository path to NFC, split on `/`, and for each component derive `fold` by replacing ASCII `A` through `Z` with lowercase while leaving all other code points byte-distinct. A path is permanently forbidden when any one rule below matches; rules apply at every depth and before selector matching or prompt reopening:

1. `fold` is exactly one of `.git,.agent,.agents,.codex,.mcp,.plugin,.plugins,.hook,.hooks,.skill,.skills,node_modules,.next,.turbo,.cache,coverage,dist,build,.vercel,secret,secrets,.secret,.secrets,credential,credentials,.credential,.credentials,cert,certs,certificate,certificates,key,keys,token,tokens`.
2. A basename `fold` matches exactly `^agents.*\.md$` or `^skill.*\.md$`.
3. A basename `fold` is `.env` or begins `.env.`.
4. A basename `fold` is exactly `.mcp.json|mcp.json|mcp.yaml|mcp.yml|plugin.json|plugins.json|codex.json|hooks.json|execpolicy.rules`, or ends exactly `.rules|.pem|.key|.p12|.pfx|.mobileprovision|.crt|.cer|.der|.jks|.keystore`.
5. Any component `fold` matches the anchored ASCII regex `^(?:.*[._-])?(?:agent|agents|codex|mcp|plugin|plugins|hook|hooks|skill|skills|rule|rules|config|configuration|secret|secrets|credential|credentials|token|tokens|api[-_]?key|private[-_]?key|certificate|certificates|cert|certs|keystore|shell[-_]?snapshot)(?:[._-].*)?$`.
6. The full folded path is `.loop-engineering/runtime` or begins `.loop-engineering/runtime/`.

There is no fixture-driven, MIME, content-sniffed or semantic secret classification. A socket, lock, device or other non-`100644|100755` Git entry is independently ineligible by type. These rules deliberately reject a normally readable source path whose lexical name collides with a control/secret class; neither selectors nor aliases override them.

In addition, `.loop-engineering/**` and `docs/engineering/LOOP_ENGINEERING.md` are excluded from the ordinary view. `promptFiles` are always read from exact `inputHead`, never from a proposal, and may reopen only this closed policy/contract set for the same `changeId`: `.loop-engineering/policy.yaml`, `docs/engineering/LOOP_ENGINEERING.md`, and within `.loop-engineering/state/changes/<changeId>/` exactly `requirements.md`, `design.md`, `hybrid-product-amendment.md`, `source-matrix.md`, `data-contract.md`, `tasks.md`, `acceptance-tests.json`, `acceptance-tests.md`, `sector-taxonomy-map-v3.json`, `model-runner-host-pins-v3.json` or a basename matching `[a-z0-9-]+-contract.md`. The permanent oracle is evaluated first, so a matching contract basename containing a forbidden token is still rejected. Review/gate/decision/status/baseline/evidence files are not prompt-authorized.

Each prompt file must be one tracked `100644` regular blob, valid NFC UTF-8, 1..1,048,576 bytes. Total prompt content is at most 4,194,304 bytes. Each bound entry is exactly `[path,blobOid,byteLength,sha256,content]` in manifest order. Missing/untracked, alias, duplicate, noncanonical, invalid UTF-8, changed blob or over-limit input is `MANIFEST_INVALID` before model spawn.

The view contains at most 100,000 files and 536,870,912 total blob bytes. Its identity is canonical JSON:

```text
["model-runner-source-view-v3.5",viewPurpose,inputHead,sourceCommit,proposalDeltaSha256,
 [[path,blobOid,gitMode,materializedMode,byteLength,sha256],...]]
```

Entries sort by UTF-8 path bytes; `gitMode` is original `100644|100755` and `materializedMode` is literal `0444`. The runner hashes the canonical bytes, binds `viewPurpose|sourceCommit|proposalDeltaSha256|sourceViewSha256` into the request/result/attempt/journals, walks without links and rechecks every file immediately before spawn and before accepting output. Codex cwd is the view; it is not Git. `--skip-git-repo-check` is mandatory, and launch from any user worktree, Git directory or their ancestor is forbidden.

## 8. Exact permission profile and Codex invocation

The generated config profile is named `model-runner-v3.config.toml`; its `default_permissions` selects the same named permission profile. Trusted substitution supplies only the validated view/scratch realpaths:

```toml
default_permissions = "model-runner-v3"

[permissions.model-runner-v3.filesystem]
":root" = "deny"
":minimal" = "read"
"<absolute-sanitized-view>" = "read"
"<absolute-private-scratch>" = "write"

[permissions.model-runner-v3.network]
enabled = false
```

There is no workspace/tmp/home-wide/additional grant, domain/socket allowlist, legacy `sandbox_mode` or `sandbox_workspace_write`. Exact task argv contains no `--sandbox|-s`. `--profile model-runner-v3` loads the generated config profile and its `default_permissions`; user/project configuration cannot add a profile. Before task spawn, exact no-model probe argv uses pinned `codex sandbox --profile model-runner-v3 --permission-profile model-runner-v3 -C <view> -- <probe-argv>` and proves view/minimal reads, scratch writes, all external reads/writes/network/socket attempts and inherited-FD attempts. Loopback and a non-loopback RFC-1918 address each have a trusted listening positive control that must connect outside the sandbox before their denial can count; an unavailable or unreachable private address is an infrastructure failure, never a passing denial. Ordinary-child, shell-created process-group, detached setsid/session, fork, double-fork and delayed descendants are separate launch paths and each must emit its own denial result. `MR3-009` additionally completes one real pinned task-model attempt after that same probe; rerunning only the no-model probe cannot own the case. The real attempt executes in a bounded detached test worker and returns one canonical pass/fail result to its TAP parent; a model child, timeout or signal may fail the case but cannot terminate the protected gate runner or suppress its terminal TAP summary. Any warning, unsupported key, broader grant or indeterminate probe fails closed.

Task executable/argv is constructed without a shell. Global arguments precede `exec` and include exact routed model, `--profile model-runner-v3`, `--ask-for-approval never`, `--strict-config`, `project_doc_max_bytes=0`, `project_doc_fallback_filenames=[]`, `web_search=disabled`, `allow_login_shell=false`, zero MCP servers and repeated disables for `skill_search`, `plugins`, `apps`, `remote_plugin`, `hooks`, `multi_agent`, `browser_use`, `browser_use_external`, `browser_use_full_cdp_access`, `computer_use`, `shell_snapshot`, `skill_mcp_dependency_install`, `tool_suggest` and `enable_mcp_apps`. Exact `exec` arguments are `--ephemeral --ignore-user-config --ignore-rules --skip-git-repo-check --color never --json -`. Image/search/MCP/apply/browser/computer tools, `--output-schema`, `--output-last-message`, resume/fork/cloud/remote control and `codex apply` are forbidden.

The child environment is constructed from scratch: fixed `/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin` PATH, scratch `HOME|TMPDIR`, `LANG|LC_ALL=C.UTF-8`, pinned TLS trust paths and `CODEX_HOME=<transport>`. Git/proxy/dynamic-loader/shell-startup/tool credential and repository/user variables are absent. `shell=false`, login shell, PTY and output file are forbidden.

The prompt binds task, role, model/effort, request/view/prompt identities, `viewPurpose|sourceCommit`, acceptance criteria and result schema. It says code/commands are untrusted data and must not be executed, only sandboxed read inspection is authorized, and escalation is forbidden. Review/verify are explicitly instructed to assess the proposal tree visible at `sourceCommit`; a repair maker is instructed that its nonempty patch is relative to that proposal tree and that the final proposal remains a single-parent replacement over `inputHead`. AGENTS/config/rules/hooks/MCP/plugins/apps/skills are neither loaded nor included.

## 9. JSONL and bounded process protocol

Stdout is UTF-8 JSONL capped at 16,777,216 bytes, 1,048,576 bytes per line and 100,000 lines; stderr is diagnostic-only and capped at 8,388,608 bytes. The operation uses the exact manifest time limit and an idle-line deadline of 300 seconds, both measured by monotonic clock. Invalid UTF-8/NUL, over-limit, nonzero/signal, wall/idle timeout, pipe inconsistency or identity recheck failure rejects the attempt.

For pinned Codex 0.148.0-alpha.21 the only accepted outer event types are, in order: one `thread.started`; one `turn.started`; zero or more `item.started|item.updated|item.completed`; then exactly one `turn.completed`. `error` or `turn.failed` is a recognized terminal failure; any event after a terminal, duplicate start/terminal or unknown type fails. Exact outer shapes are: `thread.started` has only `type,thread_id` with a lowercase RFC-4122 UUID; `turn.started` has only `type`; each item event has only `type,item`; `turn.completed` has only `type,usage`; top-level `error` has only `type,message`; and `turn.failed` has only `type,error`, whose error has only `message`. `usage` has exactly `input_tokens,cached_input_tokens,cache_write_input_tokens,output_tokens,reasoning_output_tokens`, each a nonnegative safe integer.

One logical item ID is introduced once and its lifecycle uses the same ID in ordered `started`, zero-or-more `updated`, `completed` events; an implementation may omit start/update only when pinned Codex emits a completed-only item. Inner item shapes are exactly `id,type,text` for `reasoning|agent_message`, or `id,type,command,aggregated_output,exit_code,status` for `command_execution`; ID is 1..128 ASCII bytes, text/command/output are bounded UTF-8, exit code is null or a signed 32-bit integer, and status is `in_progress|completed|failed|declined`. `file_change|mcp_tool_call|web_search|collab_tool_call|todo_list|error` and every unknown inner type fail. Command items are diagnostic only and cannot supply result bytes.

Exactly one completed `agent_message` must have text that parses as the terminal result schema in section 10; it must be the final completed agent message before successful `turn.completed`. Other agent messages are bounded progress text and none may parse as a terminal result. Usage is non-authoritative. Unknown members within the exact shapes fail; event schemas are fixture-tested against the pinned binary.

On failure/deadline the runner sends `SIGTERM` to the process group, waits at most five seconds, sends `SIGKILL`, closes/drains pipes concurrently and never waits indefinitely for detached descendants. No progress, command output, stderr or scratch byte can become a proposal.

## 10. Sealed request and result schemas

Canonical JSON recursively ASCII-sorts object keys, preserves array order, rejects duplicate keys, non-finite/negative-zero numbers, invalid Unicode, accessors/exotic prototypes/cycles and emits UTF-8 without LF.

The request has exactly:

```text
protocol,runId,sessionId,operation,role,model,reasoningEffort,strategy,
changeId,taskId,checkpoint,manifestSha256,modelRunnerIdentitySha256,
base,inputHead,round,task,acceptanceCriteria,timeLimitSeconds,
promptFiles,sourceView,proposalDelta,reviewInput,verificationInput,priorFindingIds,
assurance,terraWaiver
```

`protocol` is `loop-model-v3.5`; `modelRunnerIdentitySha256` equals the exact section 5 digest; UUIDs are lowercase RFC-4122; operation/role is `make/maker|review/reviewer|verify/verifier`; model/effort/strategy follow section 3; hashes/OIDs and task fields equal the manifest; `round` is the derived positive operation round; assurance is `critical`. `sourceView` is exactly `viewPurpose,sourceCommit,proposalDeltaSha256,sourceViewSha256,entryCount,totalBytes` and equals the section 7 identity; `proposalDelta` is the exact section 7 array or null. For review, `reviewInput` is exactly `kind='proposal',proposalCommit,resultRef,makerResultSha256,sourceCommit,proposalDeltaSha256,sourceViewSha256`; for a maker following `changes_required` it is exactly `kind='repair',proposalCommit,resultRef,reviewResultSha256,status='changes_required',findings,sourceCommit,proposalDeltaSha256,sourceViewSha256` copied from the validated prior proposal/review; otherwise it is null. For verify, `verificationInput` is exactly `kind='review_pass',reviewResultSha256,proposalCommit,resultRef,sourceCommit,proposalDeltaSha256,sourceViewSha256`; for a maker following `verification_failed` it is exactly `kind='repair',proposalCommit,resultRef,verificationResultSha256,status='verification_failed',findings,evidence,sourceCommit,proposalDeltaSha256,sourceViewSha256`; otherwise it is null. Every non-null proposal/source identity equals the proven retained proposal and current view. `priorFindingIds` is the ASCII-sorted unique ID projection of non-null repair input, otherwise empty, and is at most 256. `terraWaiver` is null except Sol maker and then contains only its canonical SHA-256 and expiry, not raw bytes. Request/context live behind closure-private brands/WeakMaps; lookalikes or mutation fail.

The result object has exactly:

```text
protocol,operation,requestSha256,sourceViewSha256,status,
patch,findings,evidence,summary
```

`protocol` is `loop-model-result-v3.5`; hashes are lowercase 64-hex. Total canonical result is at most 8,388,608 bytes. `summary` is NFC UTF-8 at most 16,384 bytes. `patch` is null or 1..4,194,304 UTF-8 bytes. `findings` and `evidence` each contain at most 256 entries.

A finding has exact `id,severity,path,line,message`: ID `[A-Z0-9][A-Z0-9-]{0,63}`, severity `P0|P1|P2`, path null or one canonical repository path at most 1,024 bytes, line null or integer 1..2,147,483,647, and message 1..4,096 bytes. IDs are unique and sorted. Evidence has exact `kind,ref,status,exitCode,sha256,summary`: kind `command|artifact|probe`, ref 1..1,024 bytes, status `pass|fail|not_run`, exitCode null or -255..255, sha256 null or lowercase 64-hex, summary 1..4,096 bytes. Raw secret, prompt or unbounded command output is forbidden.

The valid operation/status matrix is exhaustive:

| Operation | Status | Patch | Findings | Evidence | Exit |
|---|---|---|---|---|---:|
| `make` | `proposal` | non-null and nonempty | empty | empty | 0 |
| `make|review|verify` | `task_failed` | null | empty | 0..256 | 10 |
| `review` | `pass` | null | only P2, possibly empty | 1..256 | 0 |
| `review` | `changes_required` | null | at least one P0/P1 | 1..256 | 7 |
| `verify` | `pass` | null | empty | 1..256, all pass | 0 |
| `verify` | `verification_failed` | null | at least one P0/P1/P2 | 1..256 with at least one fail/not_run | 9 |

Every other cross-product is a protocol error. In particular an empty maker patch is `MODEL_PROTOCOL_ERROR`; V3 has no no-op proposal, skipped apply, unchanged-tree commit or empty-result-ref branch. The runner verifies request/view hashes, copies canonical result and patch bytes into process memory, hashes them and creates a closure-private sealed value. It then atomically persists exactly the validated canonical result plus LF at the authoritative `result` path in section 4; maker patch bytes exist only inside that result. Model commands cannot read or write this path. The result file enables hash-proven restart/replay and is never an attempt audit, prompt or scratch input. Later scratch mutation is irrelevant.

## 11. Patch parser and trusted Git preparation

Maker patch is one nonempty UTF-8 Git text diff only with 1..4,096 distinct changed paths: ordinary add/modify/delete of regular files under `allowedPaths`, relative to the exact section 7 `sourceCommit`. Binary, symlink, submodule, rename/copy, mode-only, combined diff, absolute/dot-dot/backslash/control/case-colliding path, `.git`, secret, prompt-policy, runner runtime/artifact or excluded path fails. Headers/hunks and old/new paths are parsed independently; patch prose/commands are never executed. A syntactically empty diff, zero-hunk diff, a result tree equal to `sourceCommit`, or a final result tree equal to `inputHead` fails `MODEL_PROTOCOL_ERROR` before object/ref creation.

Trusted Git uses only pinned `/usr/bin/git`, explicit `--git-dir|--work-tree`, `--no-optional-locks`, no lazy fetch, empty environment/config, disabled hooks/filters/pagers/includes and no terminal prompt. It materializes a token-owned clean apply worktree from exact `sourceCommit`, rechecks common-dir/input/proposal objects, applies the nonempty sealed bytes via `git apply --index --whitespace=error` stdin, and verifies that the resulting tree differs from `sourceCommit`. It then diffs the complete result tree against `inputHead`, requires at least one difference and requires every difference to be an allowed ordinary regular-file add/modify/delete. No user worktree/index is read for content or mutated.

## 12. Deterministic commit, ref and journal recovery

The applied index tree is `resultTree`. The commit has exactly one parent `inputHead`; author and committer are `Loop Model Runner V3 <model-runner-v3@localhost>`; both dates are `@<inputHead committer Unix seconds> +0000`. The UTF-8 message including final LF is exactly:

```text
model-runner-v3: <changeId>/<taskId>/make/<round>

Manifest-SHA256: <manifestSha256>
Request-SHA256: <requestSha256>
Result-SHA256: <canonicalResultSha256>
Patch-SHA256: <patchSha256>
Source-View-SHA256: <sourceViewSha256>
Runner-Identity-SHA256: <modelRunnerIdentitySha256>
```

`git commit-tree resultTree -p inputHead` under those exact environment values produces `proposalCommit`. `taskKey=SHA256(UTF8(taskId))`; the sole result ref is `refs/model-runner-v3/results/<manifestSha256>/<taskKey>/make-<round>`. It is created by CAS against the all-zero OID and is never moved/deleted by V3. An existing equal ref is idempotent; a different value is integrity failure. Model, scratch, review and verify cannot write Git. Merge/rebase/cherry-pick/push/PR/deploy/publish/migration/stash/reset/clean/user-ref deletion are forbidden.

`operationKeySha256=SHA256(RFC8785(["model-runner-journal-v3.5",modelRunnerIdentitySha256,checkpoint,manifestSha256,taskId,operation,inputHead,round]))`. The task lock is exclusive and token-owned. Before any resource root or resource-journal record, trusted code derives the still-uncommitted `round=priorCounter+1`, the operation key and a durable resource reservation. It validates that the reservation directory contains only contiguous canonical decimal filenames `0.json` through `<n-1>.json` with no gap, alias, link or unknown member; every prior reservation and its resource journal must be hash-valid, carry the exact section 5 identity and be cleanup-terminal or be deterministically recovered before proceeding. `resourceAttemptOrdinal=n` is an integer from 0 through 9,007,199,254,740,991 and `resourceAttemptKeySha256=SHA256(RFC8785(["model-runner-resource-attempt-v3.5",modelRunnerIdentitySha256,operationKeySha256,resourceAttemptOrdinal]))`. Exhaustion, an exclusive-create collision under the held lock, a gap, corrupt reservation, missing/wrong identity or non-recoverable prior resource sets `state=integrity=recovery_required,lastExit=11`, preserves counters/proposal/lastOperation, creates no new reservation/model/apply process and returns empty stdout plus the exact section 3 `IO_ERROR` stderr; there is no wraparound, deletion or best-effort skip.

The reservation file is exclusively created, file-fsynced and parent-directory-fsynced before any resource creation. It is canonical JSON plus LF with exactly `protocol='model-runner-resource-reservation-v3.5',modelRunnerIdentitySha256,operationKeySha256,resourceAttemptOrdinal,resourceAttemptKeySha256,operation,round,startingState,tokenDigest,device,createdAt`; `modelRunnerIdentitySha256` is the exact section 5 digest, `createdAt` is whole-second UTC, `device` is the already-proven trusted-anchor device, the operation/round/state equal the invocation and the 64-hex token digest binds the already-generated random token. If creation fails with proof that no directory entry became durable, return `IO_ERROR`/11 with state/status byte-unchanged, no resource/journal and allow the same ordinal on explicit retry; any ambiguous or different durable entry uses the recovery-required outcome above. Reservation files and resource journals are never deleted or reused. A crash after reservation but before `allocated` is therefore recoverable without guessing: the exact token path is absent or is validated from the reservation, cleanup is journaled, the operation counter remains unchanged and a later invocation reserves ordinal `n+1` for the same operation key.

Each operation journal line is canonical JSON plus LF with exact `protocol='model-runner-operation-journal-v3.5',modelRunnerIdentitySha256,operationKeySha256,sequence,state,at,priorRecordSha256,payload,failureCode,exit`; the identity is the exact section 5 digest, sequence starts zero, `at` is whole-second UTC, prior hash is null then SHA-256 of the prior canonical line without LF, and `failureCode|exit` are null except on terminal `failed`. Operation payloads are exact:

- `prepared`: `resourceAttemptKeySha256,resourceAttemptOrdinal,requestSha256,sourceViewSha256,sourceCommit,proposalDeltaSha256,profileSha256,startingState,priorProposalCommit,priorResultRef`;
- `model_started`: `runId,sessionId,pid,processGroupId`;
- `result_sealed`: `resultSha256,patchSha256`, where patch hash is null for review/verify;
- `apply_started`: `applyTokenDigest,sourceCommit`;
- `commit_created`: `proposalCommit,resultTree`;
- `ref_published`: `proposalCommit,resultRef`;
- `verdict_recorded`: `status,resultSha256,blockingFindingIds`;
- `evidence_recorded`: `status,resultSha256,failedEvidenceRefs`;
- `task_failure_recorded`: `status='task_failed',resultSha256`;
- `failure_pending`: `phase,primaryFailureCode,primaryExit,retainedResultSha256,proposalCommit,resultRef`;
- `completed`: `status,resultSha256,proposalCommit,resultRef`, with the current maker commit/ref non-null only for make;
- `failed`: `phase,primaryFailureCode,primaryExit,retainedResultSha256,proposalCommit,resultRef`, with terminal `failureCode` equal to the final exit-name literal and terminal nonzero `exit`.

`phase` is exactly `prepared|model|result|apply|commit|publish|verdict|evidence|cleanup|recovery`; `startingState` is one allowed stable state for the operation. A pre-semantic `failure_pending` has the selected non-null primary failure code/exit. A cleanup-failed operation always has non-null mutually consistent `primaryFailureCode|primaryExit`: the earlier failure pair after `failure_pending`, or the semantic would-have-been pair `OK/0|CHANGES_REQUIRED/7|VERIFICATION_FAILED/9|TASK_FAILED/10`. `proposalDeltaSha256` is null only for `make_initial` and otherwise lowercase 64-hex. Nullable retained identities have their prior schemas. Hashes/OIDs/UUIDs/IDs/refs have their prior schemas; PID/group are positive 32-bit integers; finding/evidence arrays are ASCII-sorted unique and bounded as in section 10. No unknown state or payload member is allowed.

Each resource-journal line is canonical JSON plus LF with exact `protocol='model-runner-resource-journal-v3.5',modelRunnerIdentitySha256,operationKeySha256,resourceAttemptKeySha256,resourceAttemptOrdinal,sequence,state,at,priorRecordSha256,payload,failureCode,exit`. The identity is the exact section 5 digest. Its exact forward chain is `allocated -> view_ready -> transport_ready -> scratch_ready -> child_started -> child_exited -> cleanup_started -> cleanup_complete`; a phase not reached is omitted and ordering never reverses. Before operation `prepared`, a known setup/interruption failure inserts exactly `preparation_failed` after the last reached setup phase and before `cleanup_started`; a reservation with no allocated resource may begin directly at `preparation_failed`. Only `cleanup_started` may instead append terminal `failed` with `failureCode='IO_ERROR',exit=11`. Payloads are exactly: allocated `tokenDigest,device`; view ready `viewPathSha256,device,inode,sourceViewSha256,sourceCommit,proposalDeltaSha256`; transport ready `transportPathSha256,profileSha256,authMaterialSha256`; scratch ready `scratchPathSha256,device,inode,mode`; preparation failed `primaryFailureCode,primaryExit`, limited to `TASK_FAILED/10|IO_ERROR/11|INTERNAL_ERROR/12`; child started `pid,processGroupId`; child exited `exitCode,signal`; cleanup started `tokenDigest`; cleanup complete `removed=true`, meaning the reservation-proven path is absent even when allocation was never reached; failed `phase='cleanup',primaryFailureCode,primaryExit`, where the pair is the `preparation_failed` pair, the operation `failure_pending` pair, or the semantic would-have-been pair. No unknown member is legal. The cleanup-terminal attempt metadata is keyed by `resourceAttemptKeySha256` and has exactly `protocol='model-runner-attempt-v3.5',modelRunnerIdentitySha256,operationKeySha256,resourceAttemptKeySha256,resourceAttemptOrdinal,operation,round,model,modelVersion,requestSha256,sourceViewSha256,profileSha256,resultSha256,startedAt,endedAt,elapsedMilliseconds,processClassification,primaryFailureCode,primaryExit,finalExit`; its identity is the exact section 5 digest, model/version and each phase-owned digest are null exactly when that phase was not reached, time values are whole-second UTC, elapsed is a nonnegative safe integer, process classification is `not_started|spawn_failed|exited|signaled|timed_out`, and primary/final exits follow this section. It never contains raw prompt/source/result/scratch bytes.

Ignoring interleaved resource records, the only success chains are: maker proposal `prepared -> model_started -> result_sealed -> apply_started -> commit_created -> ref_published -> completed`; review verdict `prepared -> model_started -> result_sealed -> verdict_recorded -> completed`; verification verdict `prepared -> model_started -> result_sealed -> evidence_recorded -> completed`; and valid task failure for any operation `prepared -> model_started -> result_sealed -> task_failure_recorded -> completed`. A pre-semantic failure replaces the remaining success suffix with exactly `failure_pending -> failed`; cleanup failure after `failure_pending|ref_published|verdict_recorded|evidence_recorded|task_failure_recorded` makes the sole operation terminal `failed(failureCode='IO_ERROR',exit=11)` with the preserved primary pair. `model_started` may be omitted only for a spawn failure after `prepared`; no other state can skip, repeat, reorder or branch.

### Legal cross-journal partial order

The following edges are mandatory in addition to each journal's own sequence:

1. The reservation file precedes every resource record/root. Resource `allocated -> view_ready -> transport_ready -> scratch_ready` then precedes operation `prepared`, whose payload binds that exact resource attempt key and ordinal. A reservation/resource chain with no `prepared` owns no task round or operation tuple. A live owner keeps the stable status byte-unchanged and makes another mutating command return exit 8; after owner death, recovery writes `preparation_failed(TASK_FAILED/10)` when absent, cleans only the reservation-proven token resource and terminalizes that resource journal. Cleanup success leaves the complete task status byte-unchanged and permits the same operation/round to reserve the next ordinal; cleanup failure selects the section 4 override.
2. Resource `child_started` is fsynced before operation `model_started`. When a child was started, resource `child_exited` is fsynced before operation `result_sealed|failure_pending`; a spawn failure before `child_started` may proceed directly to `failure_pending(phase='model')`.
3. The authoritative result temporary file is exclusively created, file-fsynced, renamed to the exact result path and parent-directory-fsynced before `result_sealed` is appended and journal-fsynced. A result file without that record is an untrusted orphan: recovery validates only its owned regular-file path, unlinks it without parsing or replaying it, fsyncs the parent, records `failure_pending(phase='result',primaryFailureCode='TASK_FAILED',primaryExit=10,retained*=null)` and never respawns the model.
4. For a maker proposal, `result_sealed -> apply_started -> commit_created -> ref_published`; for a review verdict, `result_sealed -> verdict_recorded`; for a verification verdict, `result_sealed -> evidence_recorded`; for any valid `task_failed`, `result_sealed -> task_failure_recorded`. The last state in each branch is its semantic terminal and freezes the retained result/proposal identities.
5. A detected post-`prepared` pre-semantic failure is first write-ahead recorded as `failure_pending` with the primary failure and any already sealed result. A detected pre-`prepared` failure is instead write-ahead recorded as resource `preparation_failed` and cannot create an operation journal. After a semantic terminal, `failure_pending` or `preparation_failed`, resource `cleanup_started -> cleanup_complete|failed` occurs. An existing operation's `completed|failed` is always last and may be appended only after that resource terminal.
6. Cleanup success appends operation `completed` for a semantic terminal or operation `failed` with the preserved primary failure for `failure_pending`; after `preparation_failed` it appends no operation record and returns the primary exit while leaving task status byte-unchanged. Cleanup failure appends resource `failed`, then operation `failed` when an operation journal exists, with final `failureCode='IO_ERROR',exit=11`; without `prepared` it creates no operation journal. In both cases the failed resource record and any operation record preserve the selected primary pair and every proven result/commit/ref, while status becomes `recovery_required`, `lastExit=11` and replay returns the same canonical I/O error without model retry.

No operation `completed` can precede cleanup, no operation journal can be terminal while its bound resource journal is live, and no resource terminal can coexist with a nonterminal operation after recovery has run. A pre-`prepared` resource terminal is legal only with its immutable reservation and no operation journal. A hash/edge violation is `recovery_required`, not a convention chosen by implementation.

### Total task-state, output and retry oracle

At `prepared`, `lastOperation` becomes the current operation, `lastExit=null`, `integrity='ok'`, the selected counter increments once, and state becomes `making|reviewing|verifying`. The table below is exhaustive; “starting” means the exact stable state recorded in `prepared`.

| Durable outcome after cleanup | Task state | Retained result/proposal | `lastExit` | Process output | Later explicit retry |
|---|---|---|---:|---|---|
| make `proposal`, ref published | `proposal_ready` | new result + commit + ref | 0 | one terminal-operation object on stdout; empty stderr | review or a later repair make after a verdict |
| review `pass` | `review_passed` | existing proposal + review result | 0 | terminal object stdout | verify |
| review `changes_required` | `changes_required` | existing proposal + review result | 7 | terminal object stdout | make repair from that proposal |
| verify `pass` | `verified` | existing proposal + verification result | 0 | terminal object stdout | none |
| verify `verification_failed` | `verification_failed` | existing proposal + verification result | 9 | terminal object stdout | make repair from that proposal |
| valid `task_failed` from any operation | `failed` | existing proposal remains only if one preceded the operation; current failure result retained | 10 | terminal object stdout | make; its source is the retained proposal when present, otherwise `inputHead` |
| pre-semantic model/protocol/interruption failure, cleanup succeeds | exact starting state | prior proposal only; a sealed invalid/current result is not authoritative | 6 for protocol, 10 for interruption | no stdout; exact section 3 row on stderr | same operation when its starting state permits it; new incremented round/key |
| patch-parse/apply/result-tree rejection attributable to model bytes, cleanup succeeds | exact starting state | prior proposal only | 6 | no stdout; exact section 3 row on stderr | same permitted operation with a new round/key |
| pre-`prepared` setup/interruption failure, cleanup succeeds | exact stable state byte-unchanged | prior proposal only | prior `lastExit` byte-unchanged | no stdout; exact section 3 row for primary exit 10/11/12 | same operation and round with next resource-attempt ordinal |
| pre-`prepared` cleanup failure | `recovery_required` with counter/lastOperation/proposal unchanged | prior proposal plus failed resource reservation | 11 | empty stdout; exact section 3 `IO_ERROR` bytes on stderr | no operation retry; replay/status exposes the same failure |
| cleanup failure after any primary or semantic outcome | `recovery_required` | every hash-proven result/commit/ref plus selected primary pair retained | 11 | empty stdout; exact section 3 `IO_ERROR` bytes on stderr | no model/operation retry; replay returns the same bytes and exit 11 |
| post-`prepared` I/O/internal ambiguity or journal-edge violation | `recovery_required` | every hash-proven result/commit/ref is retained; none is invented | 11 for I/O, 12 for internal | no stdout; exact section 3 row on stderr | no model/operation retry; `status` may perform only deterministic recovery |
| operation currently between `prepared` and terminal and owner is live | `making|reviewing|verifying` | prior proven proposal only | null | status object only | blocked with exit 8 |

Pre-reservation exits 2 through 5 or 8 leave state, counters, proposal/ref, `lastOperation` and `lastExit` unchanged, create no reservation/journal and emit only their exact section 3 stderr row. After reservation but before `prepared`, only the closed `TASK_FAILED|IO_ERROR|INTERNAL_ERROR` preparation outcomes above are legal. Cleanup success consumes the resource attempt but leaves task status byte-unchanged; cleanup failure suppresses any would-have-been terminal stdout and applies the universal exit-11 override. Counter values are never rolled back. `integrity` is `recovery_required` exactly when state is so named, otherwise `ok`.

Publication and every reservation/journal/result/snapshot write use exclusive create, file fsync, same-directory rename when replacement is authorized, and directory fsync. Recovery never re-spawns a model. Before consuming any status/reservation/journal/attempt record or deriving/replaying either key, it validates the exact `modelRunnerIdentitySha256` member against section 5; a missing/different member or a key that does not reproduce from it takes the identity integrity outcome in section 5 and is never rewritten or bridged across versions. Before `prepared`, recovery uses only the reservation-bound pre-`prepared` oracle above. From `prepared` until `result_sealed`, it follows the orphan rule above, terminates the owner process group when possible, cleans proven resources and produces the deterministic interrupted operation row. At/after `result_sealed`, it requires exact durable result/request/view/sourceCommit/resource-attempt/runner-identity binding and resumes only trusted verdict recording or patch parse/apply. At/after `commit_created`, it proves exact tree/parent/ident/message; at/after `ref_published`, it proves the immutable ref. It then completes cleanup and the one legal operation terminal. Missing/different bytes, an unknown entry, a conflicting object/ref or an unprovable owner remains `recovery_required`/exit 11 and is preserved for human resolution. Replaying a completed identical operation key returns the exact retained result/status/ref without changing counters; a cleanup-failed key returns its exact exit-11 record and exact section 3 stderr bytes; a primary-failed operation key returns its exact failure and a later permitted invocation uses the next round. A cleanup-successful pre-`prepared` attempt instead permits the same operation key with the next reservation ordinal. No automatic model retry occurs.

## 13. Gate, implementation and verification boundary

Sol owns requirements/architecture, critical contracts, diff review and verification. Terra may implement one task only after fresh Architecture PASS and explicit handoff. Luna is ineligible for runner, contract, critical, integration, review and verification. This amendment authorizes no runner/App code, migration, scheduler, merge, push, PR, deployment, homepage promotion or model influence.

Implementation verification must retain all V1/V2 regressions, register every canonical V3 case one-to-one, and run real pinned macOS probes for non-Git view, permanent exclusion/prompt binding, profile precedence, external/sibling/secret read denial, authoritative-write denial, network/Unix sockets, allowed scratch, setsid/double-fork inheritance, post-transport FD closure, host fixture/codesign/version/replacement mismatch, JSONL/result limits, patch/commit/ref/journal interruption and V1/V2 nonmutation. It must also run `git diff --check`, unit tests, lint and production build. No test may be skipped or todo.
