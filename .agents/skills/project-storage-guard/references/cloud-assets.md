# Cloud asset storage

This reference defines workflow policy. It is not an account-verification, upload, migration, or adapter-installation receipt.

For Mac capacity recovery, first follow [the ordered route](mac-capacity-recovery.md): scoped project cleanup → iCloud → verified external disk → designated Google Drive. This document describes the Drive stage and explicitly requested asset storage; it does not skip the user's earlier choices or require unrelated iCloud/external transfers for an ordinary Drive asset task.

## Current policy and authorization

For this named project's asset task, inherit existing storage access and approved scope; complete authorized reversible preparation without another approval round, asking only for genuinely missing consent or an unresolved consequential decision.

Resolve the intended account and reported plan from the authorized private binding. A reported 5 TB plan is not measured free space. Treat plan capacity, actual free space, authenticated account identity, family sharing, and upload capability as separate observations; unmeasured values remain UNKNOWN. An account mismatch blocks upload to that destination; do not silently substitute another signed-in account.
Record the account's observed storage quota and the selected project folder when access is available. Do not scan the whole Drive or copy all projects to discover one task's assets.
Google One storage is shared with Gmail and Photos; 5 TB advertised capacity is not 5 TB free for this project. See [Google One storage](https://support.google.com/googleone/answer/9004014?hl=en).

## One canonical asset location per project

Keep one declared private asset root per project and reference it from that project's existing state authority. Reuse an existing verified root before creating a new one.
Separate original inputs, approved shared references, candidate outputs, and accepted versions by purpose. Use stable file IDs and content versions; folder names alone do not identify immutable content.
Keep source code, notebooks, small configuration, task decisions, and redacted asset manifests in the existing GitHub repository. Keep large binary assets in their declared asset store.
Keep reusable model weights in one verified shared-model catalog keyed by provider/model/revision/hash/license, with each project recording a pointer. Download only the selected model and batch inputs; avoid one full model copy per project or automatic whole-Drive synchronization. Shared immutable inputs can be read concurrently; give each run an isolated mutable output prefix and one integrator for its index.
Do not use a Drive-mounted or synchronized folder as an active Git worktree, shared Git database, build tree, dependency cache, live database, or concurrent output directory.
This separation is an engineering policy based on remote I/O, synchronization, and recovery requirements; Drive can store code files, but storage does not provide Git coordination.

For each required asset, record a compact manifest entry:

`project/task/revision; logical asset ID; Drive file ID; content SHA-256; byte size; media/type/version; source/license; producer run; candidate/accepted status; verification time`

Keep credentials out of manifests. Store private IDs and account-specific locations only in the appropriate private project configuration or manifest.
Reference the manifest from the existing memory/tracker; do not create a second task ledger or paste large output listings into the Hub.
Promotion to accepted requires the original project's acceptance evidence and integrator decision. An upload or Drive preview is not that evidence.

## Budget local, temporary, and cloud storage separately

Measure the actual volume for the source workspace, local download/cache, temporary execution scratch, and cloud destination independently.
Require `free bytes >= next operation's additional peak + untouched reserve` for every affected volume; preserve stricter existing project floors.
Include compressed and expanded inputs, required model files, working frames, intermediate renders, final outputs, and any simultaneous upload staging copy in the peak estimate.
Cloud headroom must cover pending uploads and retained versions. A large Drive allowance does not expand a Mac disk, Colab VM disk, RAM, or GPU VRAM.
Drive for desktop streaming still uses local cache; mirroring stores local copies. On macOS File Provider, the streaming cache location is controlled by macOS and cannot be moved to an external disk through Drive's cache setting. Do not enable whole-Drive mirroring, clear unsynced cache, or promise zero-local-space uploads. Account for the actual route's staging/cache and use a supported direct/resumable transfer when available. See [stream/mirror behavior](https://support.google.com/drive/answer/13401938?hl=en) and [macOS File Provider](https://support.google.com/drive/answer/16631477?hl=en).
Use the existing delivery runner and attempt ledger. Set finite input bytes, output bytes, log size, file count, elapsed time, and upload attempts; do not introduce a second runner.
If a required measurement is unavailable, state the specific unknown and advance independent authorized work instead of repeatedly rebuilding or downloading.

## Stage inputs and transfer bounded outputs

Fetch only the selected batch's inputs. For many small files, use bounded archives and unpack on the execution host; do not extract thousands of frames directly into mounted Drive.
Generate intermediates in owned local scratch. Upload useful candidates, essential recovery checkpoints, and compact manifests at meaningful batch boundaries.
Use resumable uploads for large files or interruption-prone connections when the available adapter supports them. Persist the file/session identity safely and inspect status before retrying an unknown-result upload.
Apply the existing finite retry policy with backoff for transient quota/network errors. Record a real correction before retrying a same-cause failure; no duplicate uploads to obtain a clean-looking run.
Drive's published general binary file limit is 5 TB, subject to available storage. Keep operational batches much smaller according to measured bandwidth, scratch, and the original work budget.
The official 750 GB/day upload/copy statement explicitly names Google Workspace users; do not declare it the verified allowance of a personal AI Pro account.
See [Drive file limits](https://support.google.com/drive/answer/37603?hl=en), [API limits](https://developers.google.com/workspace/drive/api/guides/limits), and [resumable uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads).

## Copy, verify, then record recovery

Copy into a new version or candidate destination; do not move or delete a unique original to create headroom.
Require completed upload status plus expected byte size and content-hash verification through the actual adapter or a bounded readback. If the adapter cannot establish content identity, keep verification pending.
Only after verification update the manifest and existing task state with the durable asset location. Preserve the prior recoverable version while the new candidate is unaccepted.
A notebook file, local commit, remote filename, or successful metadata query alone does not prove the binary/checkpoint contents were saved.
On failure, mark `checkpoint_pending`, preserve the unique source/workspace, record the exact missing artifact, and stop additional heavy output if its budget cannot be met.
Deleting verified disposable scratch still follows the existing storage-guard retention rules and authorization; upload success is not blanket deletion permission.
For a capacity task, additionally measure local free bytes after supported offload or approved duplicate cleanup. Removing a file from a synchronized Drive tree can delete its cloud counterpart; it is not a local-only eviction action. Do not change sharing or delete cloud content merely to recover Mac space.

## Privacy and portable project kits

Use the selected project's actual account/folder permissions. A workflow restricting itself to one directory is not proof that the underlying authorization is folder-scoped.
Colab `drive.mount()` can expose the account's Drive to notebook code and may require consent for a new runtime; inspect the actual notebook before using that access.
Keep raw OAuth tokens, upload-session URLs, signing material, production/user databases, private research, and unrelated project assets out of notebooks, logs, prompts, and public repositories.
Public kits retain generic storage rules and that project's public profile only. Redact private Drive IDs/URLs, account identity, personal quota receipts, private Hub/Site endpoints, and other projects' manifests.
See [Colab Drive I/O and authorization guidance](https://research.google.com/colaboratory/faq.html). Official limits were checked on 2026-11-22; recheck a relevant changed limit before setup.

## Future integration and truthful status

An authenticated Drive adapter, resumable uploader, quota observer, asset browser, or automatic retention service is future integration until installed and exercised on the actual host/account.
Prepare compatible configuration within existing authority; never claim a connector, daemon, scheduled sync, folder permission, or uploaded backup merely because this policy exists.
Report only the short result: measured quota/headroom; selected project asset root; verified/pending manifest; bytes actually transferred; unique material retained; next permitted action.
