# Isolated authorization path / replay identity — SOURCE / OFFLINE ONLY

Source **b3a3486c923d48a185d76b87cd0d28e682da8234**, runtime web tree **6481851a5c279ead1590053282f778596e39ffd5**, continues protection checkpoint6428918f540d5d088814be324ab8578c0cb41e4e on the same development VM. Explicit GPT-6.1 Sol High authors and separate readonly engineering reviewer. Original PR384 subject/native HOLD/formal A1 and release gates remain unchanged.

**No host authorization file, account or SSH daemon was changed.** The coordinator's actual isolated SSH validation is separate. Public evidence here contains code versions, anonymous behavior and limits only; no staging address, key/fingerprint, authentication identity or private log is included.

## Failure reproduced and contract implemented

The old bootstrap used mkdir(mode0750) without an explicit directory chmod. A child process using umask0077 actually created the old private root and nested authorization directory as0700, even with the final file0640. A different nonroot child could not read it. This reproduces the permission mechanism without using a key, looking up an account, contacting a host or reading its private logs.

The new [path contract](../../../../deployment/staging/vnext/AUTHORIZED-KEY-PATH.md) describes an authorization directory outside the private staging tree, under a dedicated runtime path: root-owned directory0710, root-owned regular single-link file0640, same dedicated nonzero reader group. Directory traversal/read are distinct from write/list permission. The original restrict/forced-command options and canonical future UTC expiry≤1hour remain fixed. Server authentication/expiry/revocation/session behavior is not established by the formatter.

`authorized_key_path.py` implements only a bounded NONKEY fixture writer. It cannot accept caller key bytes or a host target. Host readiness/installer APIs stay disabled; caller metadata cannot enable them. Descriptor-relative nofollow opens, exact owner/group/mode/type, ACL checks, same-inode/name binding rechecks, bounded exact-size reads, single-link rules and nonblocking special-file rejection prevent accepted unsafe fixtures. New descriptors use fchown/fchmod independent of umask. Fsynced no-replace publication is followed by final metadata/content checks. Exact still-valid repetition is idempotent; drift, alternate bytes or expiry refuses without repair, overwrite or renewal. Rejected partial fixtures are not a host rollback/cleanup guarantee, and external privileged changes after return are outside this check.

`bootstrap.py` preserves the capacity dry-run arithmetic, gateway source bytes and CLI options. Its apply path now refuses immediately after argument parsing, before capacity/key/account processing; old account/password/private-root authorization mutations were removed. Isolated `python -I` help and early fixed refusal are actually tested. The intended absolute runtime authorization path is source intent, not a verified binding. A separately reviewed isolated-daemon integration/group/authentication policy is still required; restricted key options alone do not rule out alternate authentication paths. Production SSH configuration is neither read nor modified here.

## Actual kernel fixture evidence

The ordinary executor and its supported escalated probe were nonroot. The supported managed local Docker daemon supplied an official digest-pinned Python image for a same-VM offline fixture: networknone, readonly root/source, bounded temporary filesystem, limited memory/processes/CPU and only file-owner/credential-drop capabilities. There was no privileged or host-network container, host runtime/key/env mount, account creation or system service change. Only three explicit source files were mounted readonly; fixtures lived in the container's own temporary filesystem.

One execution passed **16 behavior cases**, including actual root-owned setup and child credential-drop checks:

- Old umask-induced traversal denial; new intended group can read but cannot open for write or create inside the directory, and another group cannot read.
- Exact repeat, changed modes/group/ownership, symlink/ancestor replacement, hardlinks, oversized/trailing-byte files and FIFO refusal.
- Expiry/options, blocked host/caller overrides, isolated CLI behavior and ancestor metadata changes without repair.

**Actual kernel access/default ACL injection is BLOCKED in this fixture runtime.** Both verified-kernel-ACL flags are false. Reject-on-unavailable inspection and reported-ACL rejection branches were tested separately; their success is not a passing real-kernel ACL injection test. This distinction is retained in the machine receipt. There were no skipped test cases, but unavailable capability remains a separate acceptance gap.

These are actual filesystem/DAC checks using invalid-for-SSH sentinels, not live SSH, daemon StrictModes, exclusive real group membership, actual server expiry, session revocation, host capacity or staging isolation acceptance. No real key was generated, processed or authenticated. Tests cleaned their own temporary files and requested automatic removal of their container; no historical data/cache pruning occurred.

## Optional scheduler replay identity contract

`schedule-replay-binding.ts` reuses the prior disabled official-calendar/fixed-slot planner and separates stable slot ID from material request identity. Material binds exact selected calendar revision, original source/event/publication facts and opaque original queue/admission/prepared/provider/ranking request hashes. Acquisition-only event availability is validated at cutoff but cannot create another material identity; original event/publication clocks are not discarded. Original stored request hashes are retained rather than reconstructed with fresh clocks. Admission identity and later prepared input stay distinct, including known retry lineage.

Same-slot changed material conflicts instead of starting another attempt. A completed fixture observation preserves original result cutoff/source/expiry and can report it expired without renewing it. Pending/uncertain/failed observations never authorize another POST or automatic retry. Current planner source/calendar/inventory refusals still take priority. Prior planner receipts cannot substitute for this separate identity domain; unresolved original retry references remain gaps.

This is a pure anonymous fixture contract, not an installed whole-entry DB receipt, FK, writer lease, budget ledger or runtime adapter. Every outcome keeps execution, charge, provider POST and whole-entry authority false; production boundary remains Disabled. Existing writer/queue/provider/ranking ledgers and formal rights/calendar/proof gates have not been replaced or called. Actual durable whole-entry replay before expensive IO remains unconnected/unverified.

## Verification, review and remaining gates

[Version-bound checks and sanitized behavior](ssh-path-replay-checks.json): **16 offline filesystem behavior cases PASS**, actual kernel ACL injection BLOCKED; **330 Node cases PASS /0fail /0skip**, types PASS, lint PASS (0errors/34existingwarnings), full ordinary build PASS; **14 existing actual local HTTP/SSR/Chromium regressions PASS** with synthetic readonly transport. They are not live SSH or scheduler acceptance. Eleven new replay cases overlap330; earlier10PASS preceded a known-retry refinement and remains historical.

Exact source and file hashes are bound separately for the container and ordinary VM checks. Independent engineering review closed ancestor metadata/ACL revalidation, exact-size reads, isolated Python import compatibility, canonical UTC option assertion and known-retry semantics. The reviewer performed readonly source/hash inspection, without tests, target-host operations or system changes. No approved guard/oracle was weakened. Heavy work was serial under original workspace/tmp floors and sampled RSS limits; the container also had explicit memory/process/tempfs limits. Samples are not instantaneous/cgroup peak guarantees.

Actual host path/daemon binding, exclusive group membership, other authentication paths, live login/expiry/revocation and kernel ACL injection remain unverified/blocked. Native PostgreSQL/HOLD, formal A1/protected exact review, real-source/current qualification/actual adjacent sessions, actual scheduler/staging/restore/rollback/CI and release gates remain. The coordinator's independent real SSH work is not relabelled as a result of this Cloud executor.

No Contabo/SSH/VPN, host authorization/identity/daemon, SQL/PG/native retry, timer/service, production writer, original PR-head, old VM/iCloud, merge or deployment action. The official fixture image download used the existing managed runtime/network policy; no network policy or daemon configuration was changed.0bytes reclaimed from historical data; verified archive location none.
