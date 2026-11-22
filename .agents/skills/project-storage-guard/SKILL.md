---
name: project-storage-guard
description: 限制開發、建置與測試的磁碟及日誌增長；在本機、外接碟或 VM 容量不足、檢查 .run/log/cache、安排產出保存或跨主機交接時使用。先有界唯讀盤點與預算，保護原始素材、正式資料、候選版本及未推送成果，依現有授權處理可重建輸出。
---

# 專案容量護欄

Prevent new uncontrolled output before attempting cleanup. Preserve project-specific stop floors, evidence and recovery rules. A storage limit is not permission to delete unique files.

## Establish the next operation

1. Identify the actual project, host, resolved workspace, live writer, next command and existing storage rules. Do not scan the whole home directory or every project.
2. Measure actual free bytes on each volume the command will write. Estimate the next phase's new peak separately from the untouched reserve; require `free >= peak + reserve`. Keep GB and GiB explicit. Missing peak/reserve means UNKNOWN, not PASS.
3. Prefer capable cloud/isolated remote development for portable work when that is the user's preference. macOS/Xcode still requires a capable Mac; an external drive attached to a Mac does not expand a remote VM. A planned drive is unverified until mount, UUID, filesystem and workspace location are checked.
4. Stop new heavy writes when a project stop floor or next-phase budget fails. Save a small source/state checkpoint and continue independently executable work; do not rebuild repeatedly to test whether capacity has improved.

Read [budgets and retention](references/budgets-and-retention.md) for operational limits and the deletion decision. Read [inventory boundaries](references/inventory.md) before an optional directory scan.

## Use one implementation of execution controls

When `project-delivery-resume` is installed, discover its actual skill directory by frontmatter or use the repo's `.agents/skills/project-delivery-resume`. Read its `references/runner.md` and `references/external-disk.md`; reuse its `delivery_preflight.py`, `external_disk_preflight.py` and `bounded_run.py`. Do not copy or fork another runner into this skill. If unavailable, report that only policy is active; use the project's actual timeout/quota mechanism rather than claiming enforcement.

- On partial, sparse or cloud-backed recovery workspaces, use the delivery preflight's `--identity-only` if appropriate; dirty state stays UNKNOWN. Do not force full status, tree hashing, recursive `du`, fetch or cloud hydration just to fill a dashboard.
- Keep the same persistent attempt ledger and host heavy-job lock. Model/host/worktree changes do not reset failure counts. Cross-host execution also requires the real ownership handoff; a local file lock is not a distributed lease.
- The runner must own the command and its output paths. Do not imply it limits already-running IDE sessions, token usage, detached daemons, other volumes or unwatched outputs.

## Preserve evidence without hoarding output

Use bounded logs, deduplicated failure fingerprints, selected screenshots and compact receipts. Keep source/candidate/dependency/environment identity, exact check, result, elapsed time, failure cause, required artifact hash/location and retention reason. Do not copy full stdout or chat transcripts into cards, handoff or GitHub.

Before any authorized cleanup, identify exact paths, live owner, rebuild recipe, unique evidence and verified recovery copy. Protect source/WIP, real databases, signing material, original media/research, current/rollback binaries and symbols, formal saves and unresolved failures. Never blanket-delete `.run`, `.git`, simulators, Docker, `.venv` or caches. Respect linked worktrees and shared Git metadata.

At quota pressure or a client handoff, checkpoint source and redacted summaries remotely, verify the remote SHA and artifact manifests, then stop/release the old writer. If saving fails, mark `checkpoint_pending` and preserve the unique workspace. Do not turn a cleanup report or local commit into a claim that the project is backed up.

## Report a short decision

Return: observed volume/free bytes; next peak and reserve; top confirmed output categories or UNKNOWN; protected material; proposed exact recoverable paths; the next permitted command/runtime; checkpoint status. Separate planned, measured and applied actions. Never report deleted bytes, installed quotas or moved data unless those actions actually happened.
