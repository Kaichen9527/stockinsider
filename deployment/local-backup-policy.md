# Local backup amendment — 2026-09-10

The user selected the local Mac instead of Backblaze B2. No B2 account, payment
or login is required for this delivery. This replaces the B2/14-daily/4-weekly
proposal with a provisional 25 GiB capacity budget and latest/previous copies.

The user clarified that `/backup` means the current StockInsider project root's
`backup/`, not the macOS filesystem root or the user's home directory. The confirmed
destination is `/Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider/backup`.
It exists with owner-only 0700 permissions and `/backup/` is ignored by Git.
Next.js output tracing also excludes the backup directory. The final Linux
deployment artifact must be inspected for backup files before deployment;
Git exclusion alone does not protect an independently built archive.
Never infer the production backup destination from a temporary PR worktree.
Do not modify macOS system protection. Desktop sync settings may affect this path;
encrypt sensitive exports before writing, even though the requested destination is local.

## Admission and safety

- A dedicated local directory must be user-owned, mode 0700, and excluded from Git tracking.
- `node scripts/local-backup-preflight.mjs ABSOLUTE_DIRECTORY INCOMING_BYTES TEMPORARY_BYTES`
  inventories existing files without exporting, deleting or changing permissions.
- All retained copies, the incoming copy and peak temporary allocation count toward
  the budget. Unknown byte estimates fail closed. Run preflight again under the
  eventual backup lock; it is not an atomic reservation or a successful backup.
- Stream encrypted consistent exports where possible. The recovery key is stored
  separately, not committed or bundled with its only encrypted copy.
- `local-backup-envelope.mjs` implements bounded AES-256-GCM streams, with a fresh
  random nonce and an authenticated manifest hash. `local-backup-artifact.mjs`
  writes only ciphertext with mode 0600, verifies the envelope before exclusive
  publication, and never overwrites an existing file. The caller must hold the
  backup lock and propagate exporter process failures, not only stdout completion.
  These primitives do not provision keys, run pg_dump, or prove a restore.
- Bind database snapshot, documents, hashes, migration and key versions in one
  manifest. A capacity PASS is not hash verification or a restore-test PASS.
- Publish a completed backup only after validation; retain the previous verified
  backup on export/transfer failure. No pruning is implemented by the preflight.
- Mac unavailable/asleep means backup overdue, not success. Alert on stale backup;
  a reliable 24-hour recovery-point target depends on the Mac being reachable.
- Do not retire Supabase until export completeness and a clean-environment restore
  are verified. The seven-day database rollback observation remains separate from
  the removed stock Shadow policy.

## Still required

Destination confirmation/creation and an empty-directory capacity preflight are
complete. TLS-verified read-only database access using the existing environment
password has succeeded; no password reset is needed. The read-only pg_dump
orchestrator and Keychain helper are implemented but have not completed a live
export. The local Keychain returned OSStatus -25293 during key provisioning;
this is not a database authentication error. Do not replace this with an
unencrypted export or put the recovery key alongside the backup.

Actual encrypted export, document inventory,
consistent snapshot transfer, independent recovery-key
storage, automated scheduling and a real restore rehearsal are not completed by
these preflight checks. Do not claim a backup exists from this document or its tests.

## Private local key alternative — 2026-09-10

After repeated Keychain failures, the user authorized continuing with a workable
direction. This backup run uses a separately generated random AES-256 key under
`/Users/kaerchen/Library/Application Support/StockInsider/backup-keys`, outside
Desktop, the repository, and the backup directory. FileVault was verified On.
The key directory is owner-only 0700; the key is an exclusive-created 0600 file.
Existing keys are never replaced, and symlink paths and malformed keys are rejected.
This protects the encrypted backup from accidental Desktop sync exposure; it does
not protect the key from a compromised logged-in user or replace independent
recovery-key escrow. Losing this Mac and key can make the backup unrecoverable.

`STOCKINSIDER_BACKUP_KEY_MODE=private-file` selects this explicit mode in the export
runner; the manifest records the changed key backend and incomplete escrow.
The archive verifier decrypts a previously authenticated file into `pg_restore
--file=/dev/null`. This validates decoding without executing SQL or writing a
plaintext archive. It is NOT a complete database restore rehearsal.

Current checks: 18 primitive/key tests passed. A real fixed-snapshot encrypted
export was started, but completion must be taken from the runtime manifest, not
this document. Supabase Storage inventory contains seven objects in one bucket;
their bytes require separate backup. No production migration or cutover occurred.
