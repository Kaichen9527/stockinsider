---
name: project-storage-guard
description: 管理開發、建置與測試的磁碟及日誌容量；適用只盤點、清理本案、容量不足後續作、大型素材／模型與跨主機交接。Mac 容量不足依序處理本案可重建輸出、iCloud、已驗證外接碟、指定 Google Drive；有界盤點、驗證保存與釋放結果，保護原始素材、正式資料、候選版本和未推送成果。
---

# 專案容量護欄

Prevent new uncontrolled output before attempting cleanup. Preserve project-specific stop floors, evidence and recovery rules. A storage limit is not permission to delete unique files.

First distinguish policy update, read-only inventory, scoped cleanup, and capacity recovery during an already authorized task. A request to update prompts or this Skill does not perform cleanup or move data. An explicit cleanup request or existing compatible authorization covers routine, proven reconstructible project outputs without another generic approval round. Cleanup-only ends with a verified storage report; recovery resumes the original task only when it was requested and its budget now passes.

## Establish the next operation

1. Identify the actual project, host, resolved workspace, live writer, next command and existing storage rules. Do not scan the whole home directory or every project.
2. Measure actual free bytes on each volume the command will write. Estimate the next phase's new peak separately from the untouched reserve; require `free >= peak + reserve`. Keep GB and GiB explicit. Missing peak/reserve means UNKNOWN, not PASS.
3. On a capacity-constrained Mac, follow [ordered capacity recovery](references/mac-capacity-recovery.md): this project's own safely reconstructible output → suitable iCloud archive/offload → verified external disk → the designated Google Drive account. Stop escalation once the measured next-phase budget passes. Record why a stage is unavailable, unsuitable or insufficient and continue to the next; do not force a transfer merely to follow the list. Resolve private account and destination bindings outside portable/public kits.
4. Stop new heavy writes when a project stop floor or next-phase budget fails. Save a small source/state checkpoint and continue independently executable work; do not rebuild repeatedly to test whether capacity has improved.

Read [budgets and retention](references/budgets-and-retention.md) for operational limits and the deletion decision. Read [inventory boundaries](references/inventory.md) before an optional directory scan.

Preserve a previously selected capable VM/cloud runtime for portable work; this Mac recovery order is not a mandate to move cloud work back to a Mac. macOS/Xcode requires a capable Mac. A planned external disk is unverified until mount, UUID, filesystem and free space are checked; it does not expand a remote VM. Capacity recovery is complete only after measuring actual local free bytes and verifying preserved state, not after an upload or a proposed move.

## Store large assets durably

Read [cloud asset storage](references/cloud-assets.md) for Google Drive inputs, model weights, media outputs, GPU checkpoints and cross-host transfers. Keep code and compact manifests in the project repo; resolve actual private asset-folder bindings from the authorized Hub registry or private project configuration. Measure local/scratch/cloud budgets separately, fetch only the current batch, verify uploaded content before any permitted cleanup, and preserve unique originals. This policy does not install a sync daemon or prove account capacity.

## Use one implementation of execution controls

When `project-delivery-resume` is installed, discover its actual skill directory by frontmatter or use the repo's `.agents/skills/project-delivery-resume`. Read its `references/runner.md` and `references/external-disk.md`; reuse its `delivery_preflight.py`, `external_disk_preflight.py` and `bounded_run.py`. Do not copy or fork another runner into this skill. If unavailable, report that only policy is active; use the project's actual timeout/quota mechanism rather than claiming enforcement.

- On partial, sparse or cloud-backed recovery workspaces, use the delivery preflight's `--identity-only` if appropriate; dirty state stays UNKNOWN. Do not force full status, tree hashing, recursive `du`, fetch or cloud hydration just to fill a dashboard.
- Keep the same persistent attempt ledger and host heavy-job lock. Model/host/worktree changes do not reset failure counts. Cross-host execution also requires the real ownership handoff; a local file lock is not a distributed lease.
- The runner must own the command and its output paths. Do not imply it limits already-running IDE sessions, token usage, detached daemons, other volumes or unwatched outputs.

## Budget parallel work on the same host

Account for the sum of overlapping new peaks on each physical volume, plus its untouched reserve; do not let three IDEs independently spend the same free bytes. On a constrained host keep one heavy build/emulator/GPU job across all projects unless a measured aggregate budget permits more. Use the same actual host-wide resource key, not one key per IDE or project. The current coordination service's resource keys are host-scoped; cross-host Drive outputs, remote DBs and shared indexes need their own verified ownership or serialized writes.

Before creating another worktree, measure its expected checkout, dependency and build-output cost. Git worktrees share repository metadata but can still duplicate large outputs; do not copy a 70 GB tree to enable parallelism. Give each writer separate mutable output/temp paths. Share only immutable verified inputs; do not delete a shared cache while another process uses it. QA that builds is a writer to its output paths even if it does not edit source. When capacity blocks heavy work, preserve the limit and continue useful independent light tasks, then record the exact capacity stop condition.

## Preserve evidence without hoarding output

Use bounded logs, deduplicated failure fingerprints, selected screenshots and compact receipts. Keep source/candidate/dependency/environment identity, exact check, result, elapsed time, failure cause, required artifact hash/location and retention reason. Do not copy full stdout or chat transcripts into cards, handoff or GitHub.

Before any authorized cleanup, identify exact paths, live owner, rebuild recipe, unique evidence and verified recovery copy. Protect source/WIP, real databases, signing material, original media/research, current/rollback binaries and symbols, formal saves and unresolved failures. Never blanket-delete `.run`, `.git`, simulators, Docker, `.venv` or caches. Respect linked worktrees and shared Git metadata.

At quota pressure or a client handoff, checkpoint source and redacted summaries remotely, verify the remote SHA and artifact manifests, then stop/release the old writer. If saving fails, mark `checkpoint_pending` and preserve the unique workspace. Do not turn a cleanup report or local commit into a claim that the project is backed up.

## Report a short decision

Return: observed volume/free bytes before and after; next peak and reserve; top confirmed output categories or UNKNOWN; protected material; exact paths actually cleaned or copied; each fallback's result/skip reason; verified recovery location; the next permitted command/runtime; checkpoint status. A copy in progress, a same-volume move, a cloud placeholder or Trash contents are not proof of reclaimed bytes. Separate planned, measured and applied actions. Never report deleted bytes, installed quotas or moved data unless those actions actually happened.
