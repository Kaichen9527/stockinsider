# T17 #402: owned key pipe source slice — INCOMPLETE

Reviewed source baseline: `9bca1e30b3f6d481c722fcc33f12f93cc286749e`,
especially `docs/operations/2026-11-08/vnext/LINUX-RESTORE-RELEASE.md` and
`deployment/staging/vnext/LINUX-RESTORE-CANDIDATE.md`. This independent staging
branch adds one Python/Linux FD primitive and tests. It does not modify product
source, the original protected branch/PR head, CI, native HOLD or any live gate.

## Current preflight and scope

The original short-lived read-only SSH identity expired at 2026-11-08T03:11:04Z.
At resume on 2026-11-14 it was already expired. No SSH, alternative private route,
renewal, key installation, ACL change or privilege escalation was attempted.
Current Contabo disk/memory/peak, production units, release, DB, writer and timers
are **NOT_OBSERVED**. No earlier capacity number is current admission evidence.
All three existing worktrees were clean and left intact; no WIP was discarded.

Git transport to the exact origin failed with proxy CONNECT 503, including one
normal approved outer-executor retry. Source was read through the connected
GitHub provider at the exact baseline. Reference files used for the 12 retained
candidate tests were fetched at that revision, with no execution of historical
restore source. The publish tree is an additive delta against that baseline,
not against the older local checkout. No clone/credential/network workaround.

Requested GPT-6.1 Sol High is not independently attested by the available runtime
status; no model-selection evidence or separate reviewer approval is claimed.

## Minimal source change

`deployment/staging/vnext/t17_keyfd/owned_pipe.py` exposes only an unintegrated
context manager. The caller transfers **exclusive ownership** of an anonymous
read pipe FD >2, with no competing readers, aliases or FD-number reuse. It checks
the Linux descriptor type/access/owner, sets noninherit/nonblocking flags, reads
via mutable `readv` storage, requires exactly 32 bytes **and EOF**, and enforces
a fixed one-second wait deadline. It closes the descriptor before yielding a
borrowed key view and clears its 33-byte storage on success/error/abort. Wrong
length, no EOF, regular file/write-end and read errors never reach a consumer.
StdIO and invalid selectors are never closed. No key path/backend/argv/env/CLI.

This establishes a tested OS-pipe lifecycle only. No application imports it;
it does not decrypt anything or grant restore execution. Descriptor aliases,
trusted key provenance/backend/independent escrow, process death, concurrent FD
reuse, consumer copies, swap/core dumps, consumer termination and OS host custody
are NOT solved here. The integration must own and serialize the FD; Python
buffer clearing is not a whole-process memory-erasure proof. Named pipes/files
are rejected rather than treated as secure key backends. No real key is used.

`executeLinuxStagingRestore` remains byte-for-byte unchanged and rejects all
calls. Caller booleans, test receipts, FDs and callback adapters cannot enable it.
All nine runtime requirements remain NOT_IMPLEMENTED in the live contract.
Do not promote the key-FD requirement to live-ready based on these unit tests.

## Real encrypted-backup minimum, outside Cloud only

1. The coordinator must recover the trusted original complete v2 backup set
   (database, storage and provider recovery), manifests/context/hash/source and
   independent key recovery from the existing approved custody process. Do not
   invent another backend, pass secrets in chat, or send any member/key to Cloud.
2. Transfer encrypted members only through the coordinator's separately approved
   local path into the dedicated Contabo staging source area. Keep a trusted
   manifest separate from untrusted caller JSON and verify all members. A hash
   supplied next to an untrusted file does not authenticate provenance.
3. Before ANY TOC/decompressor/plaintext/SQL consumer: independently enforce an
   immutable ciphertext snapshot/descriptor held across both authentication and
   replay. Read-only chmod, a regular FD, final stat or caller boolean is not
   sufficient against a writable alias/in-place mutation. This OS custody
   integration remains absent; the historical pathname-reopen runner is blocked.
4. The existing trusted key process must supply a dedicated 32-byte binary FD,
   close every writer alias, and establish independently reviewed lifecycle and
   error/abort cleanup. This new primitive is not authority to connect that
   backend or consume an actual recovery key.

## Remaining admission and smallest operator action

The coordinator can run the **existing local read-only preflight** under its
unchanged identity and return only sanitized capacity/service signatures; no
Cloud key renewal or admin shell is required by this source slice. No production
backup or key should be attached. Before any actual staging execution, the
coordinator must independently supply reviewed immutable custody/key integration
and a staging-only admission that cannot access production. These are blockers,
not an instruction to run the old restore script.

Under an exclusive reviewed host lock retained through shutdown, measure actual
mounts and all simultaneous phases: ciphertext plus custody copy, expanded
archive, restored DB, WAL, scratch, retained old/new releases, growth and memory.
Retain >=15GiB disk and >=1.5GiB available memory AFTER measured/credible peak
costs on every relevant filesystem. Never stop production to gain capacity.
No hypothetical arithmetic or stale fixture measurement authorizes admission.

Still required: trusted PG17 binaries/version/C/UTF8, new nonroot private cluster,
Unix socket/peer auth and host rejection, separate source/data/runtime and network
isolation, no inherited PG env/service hooks, exact reviewed TOC/bootstrap,
owner/ACL/RLS/relations/application/lineage checks, disarm restored writers before
app access, bounded cleanup and production service/DB/writer/timer continuity.
No real backup, PostgreSQL restore or production operation occurred in this task.

T18 `8cf11bed86cc091eec9686aa6fb2bc48af758bc5` separately records real packaged
Next 16.3.4 A/B/A and failure rollback with an isolated empty read-only REST
fixture, 310 GETs and daily radar 503. It is not restored production data or T17
acceptance; its continuity evidence is dated 2026-11-08, not a current preflight.

## Verification

`PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s scripts/tests -p test_t17_owned_key_pipe.py -v`
passes 10 tests with real synthetic anonymous pipes. The pinned original candidate
suite passes 12/12, retaining its closed live-facade and forged-authority checks.
The first reference-only run was 11/12: a historical source file needed by its
source-contract assertion was not fetched. Fetching that exact baseline file
resolved the missing input; no assertions/source contracts were weakened.

Full exact-baseline web build/types/lint and independent formal review are NOT_RUN:
Git transport did not provide a full checkout. No success from the older local
web tree is substituted. This checkpoint cannot satisfy the repository build gate,
T17/T18 acceptance, A1, VN01–VN20, real-source/two-session, CI or release gates.
No live readiness or review approval is emitted. See the sanitized JSON receipt.
