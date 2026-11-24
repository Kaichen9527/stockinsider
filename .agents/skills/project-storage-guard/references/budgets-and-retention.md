# Output budgets and retention

These are prospective starting limits only when the project has no stricter applicable policy. They do not authorize deletion of existing history or weaken release, data or financial gates.

| Item | Starting policy | Action at limit |
|---|---|---|
| stdout + stderr per command | 16 MiB | Stop the owned command, retain redacted cause and compact receipt |
| Newly owned debug artifact directory | 512 MiB | Stop; inspect exactly what grew before another run |
| Aggregate newly generated debug output per project | Warn at 5 GiB | Reconcile retention and next-phase peak; do not start unlimited new output |
| Successful debug bundles | Review after 7 days; aim for at most 3 useful successful bundles per check | Verify required originals/receipts first, then apply an already authorized retention policy |
| Unresolved failures | One useful bundle per distinct failure fingerprint, plus compact attempt ledger | Preserve unique evidence; do not keep equivalent full copies for every repeat |
| Native candidate / symbols / original media / research | Explicit per-artifact exception and retention owner | Protect current/rollback/formal assets; exceed a debug default only after a concrete budget decision |

Choose the command timeout and cumulative attempts from the task. Two same-cause failures ordinarily trigger triage; changing models, making a new conversation, renaming a card or moving machines does not erase previous attempts. A model escalation cannot fix full disk, missing SDK, provider auth or an unavailable emulator.

## Peak capacity

Compute each written volume separately: untouched reserve + dependency unpacking + temporary build peak + candidate export + new evidence. Avoid counting one allocation twice. A receipt must show the estimate basis. Internal `/tmp`, home caches, swap and simulator writes may remain internal even if the repo is external. Verify actual redirected paths. External free space does not satisfy the internal reserve.

Use the delivery skill's read-only external-disk helper for mount/UUID/path checks. Do not create a guessed `/Volumes/<name>` directory, silently fall back to internal storage, format disks or move live databases/worktrees. A small removable FAT32 card is not automatically an appropriate build filesystem. iCloud capacity does not add local free bytes; do not hydrate placeholder assets to perform a storage audit.

For Mac relief, apply [project cleanup → iCloud → external disk → designated Drive](mac-capacity-recovery.md). Evaluate suitability and actual budget at each stage, record a skip reason for unavailable/unsuitable options, and stop escalating once enough real space is recovered. Include upload/archive/readback staging in the peak; logical bytes removed, files moved into same-volume Trash, APFS clone sizes and advertised cloud storage do not prove physical space reclaimed.

## Retain compact evidence

Keep an ordinary-sized manifest with source/tree identity, command/check ID, fixture/dependency/environment fingerprint, result/exit code, timestamps, failure fingerprint, selected artifacts with bytes/hash/location, retention reason and verified remote readback. Avoid secrets, personal records, absolute home paths and credential-bearing command lines in shared receipts. Compute large-file hashes only when the file is resident and hashing fits the approved budget; otherwise state hash UNKNOWN.

Success videos default off. Retain selected screens or a bounded failure trace when useful. Deduplicate by candidate/check/failure identity; content hash equality alone does not authorize deleting a formal record. Reuse valid evidence for unchanged inputs and bounded compiler caches instead of repeatedly deleting and redownloading everything.

## Cleanup decision

1. Identify the exact candidate path and owner. If active, shared, unique, unknown or the only recovery copy, preserve it.
2. Verify that the path is stopped, superseded and either hash-backed by a tested recovery copy or deterministically rebuildable with available inputs. Preserve relevant failure receipts first.
3. Check applicable authorization: an explicit request to clean this project's capacity or an existing compatible retention policy permits routine scoped cleanup of proven reconstructible output; complete it without another generic approval round. A policy-update or inventory-only request does not authorize cleanup. Where an irreversible/unique-data action or unresolved consequential choice remains, first prepare the concrete paths/bytes/recovery evidence and ask only for that missing decision. Do not broaden scope to unrelated projects or infer cloud deletion, disk formatting or whole-Trash emptying.
4. Execute only scoped approved removal. Verify resulting free space and retained candidate/state; record what was actually removed. Do not keep copying 100 GB to another drive as the sole policy.

Large artifacts can use an approved object store or CI artifact facility with retention/expiry. Code, current decisions, attempt summaries and recovery manifests belong in GitHub. Preserve a separately verified original where required; GitHub cache/artifact storage is not unlimited archival.
